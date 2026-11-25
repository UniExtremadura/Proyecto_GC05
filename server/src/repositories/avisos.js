import { randomUUID } from 'node:crypto';
import { AvisoError } from '../services/avisos.js';

/**
 * Comprueba dentro de la transacción que categoría, facultad y centro existen y están activos.
 * Con solo un centro, la facultad sale de él. Lo usan publicar (SCRUM-109) y editar (SCRUM-122).
 */
async function checkCatalogs(client, data) {
  let facultadId = data.facultadId;
  const errors = {};
  if (data.centroId) {
    const { rows } = await client.query(
      `SELECT c.facultad_id FROM centros c JOIN facultades f ON f.id = c.facultad_id
       WHERE c.id = $1 AND c.activo AND f.activo FOR SHARE OF c, f`, [data.centroId]);
    if (!rows.length || (facultadId && facultadId !== rows[0].facultad_id)) {
      errors.centroId = 'El centro no existe, está inactivo o no pertenece a la facultad seleccionada.';
    } else facultadId = rows[0].facultad_id;
  }
  if (facultadId) {
    const faculty = await client.query('SELECT id FROM facultades WHERE id = $1 AND activo FOR SHARE', [facultadId]);
    if (!faculty.rowCount) errors.facultadId = 'La facultad no existe o está inactiva.';
  }
  const category = await client.query('SELECT id FROM categorias WHERE id = $1 AND activo FOR SHARE', [data.categoriaId]);
  if (!category.rowCount) errors.categoriaId = 'La categoría no existe o está inactiva.';
  if (Object.keys(errors).length) throw new AvisoError(400, 'Revisa los datos del aviso.', errors);
  return facultadId;
}

/** Revalida la cuenta dentro de la transacción, incluso si la desactivan tras requireAuth. */
async function checkActiveUser(client, userId) {
  const user = await client.query('SELECT id FROM usuarios WHERE id = $1 AND activo FOR SHARE', [userId]);
  if (!user.rowCount) throw new AvisoError(401, 'Debes iniciar sesión.');
}

/** SCRUM-109. SQL parametrizado, catálogos activos y guardado atómico. */
export function createAvisoRepository(pool) {
  if (!pool) {
    const unavailable = async () => { throw new AvisoError(503, 'La publicación de avisos no está disponible en este momento.'); };
    const unmanaged = async () => { throw new AvisoError(503, 'La gestión de avisos no está disponible en este momento.'); };
    return {
      options: unavailable,
      listForClosure: unavailable,
      close: unavailable,
      publish: unavailable,
      listActive: async () => {
        throw new AvisoError(503, 'La consulta de avisos no está disponible en este momento.');
      },
      listOwn: unmanaged,
      getOwn: unmanaged,
      update: unmanaged,
    };
  }
  return {
    async options() {
      const { rows: categorias } = await pool.query('SELECT id, nombre FROM categorias WHERE activo ORDER BY nombre, id');
      const { rows: facultades } = await pool.query('SELECT id, nombre FROM facultades WHERE activo ORDER BY nombre, id');
      const { rows: centros } = await pool.query(
        `SELECT c.id, c.nombre, c.facultad_id AS "facultadId" FROM centros c
         JOIN facultades f ON f.id = c.facultad_id WHERE c.activo AND f.activo ORDER BY c.nombre, c.id`);
      return { categorias, facultades, centros };
    },

    // SCRUM-57 / US-014: consulta paginada de avisos activos.
    // SCRUM-119 / US-015: el texto se busca solo en campos públicos (descripción, categoría,
    // facultad y centro), sin distinguir mayúsculas; nunca en aviso_datos_privados.
    async listActive(pagina = 1, tamano = 12, filtros = {}) {
      const { terminos = [], categoriaId = null, facultadId = null, centroId = null } = filtros;
      const offset = (pagina - 1) * tamano;
      const params = ['Activo'];
      const where = ['a.estado = $1'];
      const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
      // Cada palabra debe aparecer en algún campo público; %, _ y \ se buscan como texto literal.
      for (const termino of terminos) {
        add(`concat_ws(' ', a.descripcion, cat.nombre, f.nombre, c.nombre) ILIKE ?`,
          `%${termino.replace(/[\\%_]/g, '\\$&')}%`);
      }
      if (categoriaId) add('a.categoria_id = ?::uuid', categoriaId);
      if (facultadId) add('a.facultad_id = ?::uuid', facultadId);
      if (centroId) add('a.centro_id = ?::uuid', centroId);
      const from = `FROM avisos a
        JOIN categorias cat ON cat.id = a.categoria_id
        JOIN facultades f ON f.id = a.facultad_id
        LEFT JOIN centros c ON c.id = a.centro_id
        WHERE ${where.join(' AND ')}`;

      const { rows } = await pool.query(`SELECT COUNT(*)::int AS total ${from}`, params);

      const total = rows[0].total;

      const { rows: avisos } = await pool.query(
        `SELECT
          a.id,
          a.descripcion,
          a.fecha_perdida::text AS "fechaPerdida",
          a.estado,
          json_build_object(
            'id', cat.id,
            'nombre', cat.nombre
          ) AS categoria,
          json_build_object(
            'id', f.id,
            'nombre', f.nombre
          ) AS facultad,
          CASE
            WHEN c.id IS NULL THEN NULL
            ELSE json_build_object(
              'id', c.id,
              'nombre', c.nombre
            )
          END AS centro
        ${from}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, tamano, offset]
      );

      return { avisos, total };
    },

    async listForClosure(userId) {
      const { rows } = await pool.query(
        `SELECT id, descripcion, fecha_perdida::text AS "fechaPerdida", estado,
                cerrado_en AS "cerradoEn", motivo_cierre AS "motivoCierre"
         FROM avisos WHERE autor_id = $1 ORDER BY created_at DESC, id DESC`,
        [userId]
      );
      return rows;
    },

    async close(userId, id, motivo) {
      const { rows: [aviso] } = await pool.query(
        `UPDATE avisos
         SET estado = 'Cerrado', cerrado_en = CURRENT_TIMESTAMP,
             cerrado_por = $1, motivo_cierre = $3
         WHERE id = $2 AND autor_id = $1 AND estado = 'Activo'
         RETURNING id, estado, cerrado_en AS "cerradoEn", motivo_cierre AS "motivoCierre"`,
        [userId, id, motivo]
      );
      if (aviso) return aviso;

      const { rowCount } = await pool.query(
        'SELECT id FROM avisos WHERE id = $2 AND autor_id = $1', [userId, id]
      );
      if (!rowCount) throw new AvisoError(404, 'El aviso no existe.');
      throw new AvisoError(409, 'El aviso ya está cerrado.');
    },

    async publish(userId, data) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await checkActiveUser(client, userId);
        const facultadId = await checkCatalogs(client, data);
        const id = randomUUID();
        await client.query(
          `INSERT INTO avisos (id, autor_id, categoria_id, facultad_id, centro_id, descripcion, fecha_perdida, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Activo')`,
          [id, userId, data.categoriaId, facultadId, data.centroId, data.descripcion, data.fechaPerdida]);
        if (data.rasgosPrivados || data.contactoEmail || data.contactoTelefono) {
          await client.query(
            `INSERT INTO aviso_datos_privados (aviso_id, rasgos, contacto_email, contacto_telefono) VALUES ($1, $2, $3, $4)`,
            [id, data.rasgosPrivados, data.contactoEmail, data.contactoTelefono]);
        }
        await client.query('COMMIT');
        return { id };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    // SCRUM-122 / US-016: avisos del autor en cualquier estado, para elegir cuál gestionar.
    async listOwn(userId) {
      const { rows } = await pool.query(
        `SELECT a.id, a.descripcion, to_char(a.fecha_perdida, 'YYYY-MM-DD') AS "fechaPerdida", a.estado,
                cat.nombre AS categoria, f.nombre AS facultad, c.nombre AS centro,
                to_json(a.created_at) #>> '{}' AS "publicadoEn", to_json(a.updated_at) #>> '{}' AS "actualizadoEn"
           FROM avisos a
           JOIN categorias cat ON cat.id = a.categoria_id
           JOIN facultades f ON f.id = a.facultad_id
           LEFT JOIN centros c ON c.id = a.centro_id
          WHERE a.autor_id = $1
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 200`, [userId]);
      return rows;
    },

    // SCRUM-122 / US-016: detalle de un aviso propio con sus datos privados (solo para el autor).
    async getOwn(userId, avisoId) {
      const { rows } = await pool.query(
        `SELECT a.id, a.categoria_id AS "categoriaId", a.facultad_id AS "facultadId", a.centro_id AS "centroId",
                a.descripcion, to_char(a.fecha_perdida, 'YYYY-MM-DD') AS "fechaPerdida", a.estado,
                p.rasgos AS "rasgosPrivados", p.contacto_email AS "contactoEmail", p.contacto_telefono AS "contactoTelefono",
                to_json(a.created_at) #>> '{}' AS "publicadoEn", to_json(a.updated_at) #>> '{}' AS "actualizadoEn"
           FROM avisos a
           LEFT JOIN aviso_datos_privados p ON p.aviso_id = a.id
          WHERE a.id = $1 AND a.autor_id = $2`, [avisoId, userId]);
      return rows[0] ?? null;
    },

    // SCRUM-122 / US-016: edita un aviso propio y Activo. Conserva autor, estado y fecha de publicación.
    async update(userId, avisoId, data) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await checkActiveUser(client, userId);
        // Bloquea el aviso para que no lo cierren o editen a la vez (US-017).
        const { rows } = await client.query('SELECT autor_id, estado FROM avisos WHERE id = $1 FOR UPDATE', [avisoId]);
        // Un aviso ajeno responde igual que uno inexistente: no se revela que existe (US-016-AC-05).
        if (!rows.length || rows[0].autor_id !== userId) throw new AvisoError(404, 'Aviso no encontrado.');
        if (rows[0].estado !== 'Activo') throw new AvisoError(409, 'Solo se pueden editar avisos activos.');
        const facultadId = await checkCatalogs(client, data);
        await client.query(
          `UPDATE avisos SET categoria_id = $2, facultad_id = $3, centro_id = $4, descripcion = $5,
                  fecha_perdida = $6, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [avisoId, data.categoriaId, facultadId, data.centroId, data.descripcion, data.fechaPerdida]);
        if (data.rasgosPrivados || data.contactoEmail || data.contactoTelefono) {
          await client.query(
            `INSERT INTO aviso_datos_privados (aviso_id, rasgos, contacto_email, contacto_telefono) VALUES ($1, $2, $3, $4)
             ON CONFLICT (aviso_id) DO UPDATE
               SET rasgos = EXCLUDED.rasgos, contacto_email = EXCLUDED.contacto_email, contacto_telefono = EXCLUDED.contacto_telefono`,
            [avisoId, data.rasgosPrivados, data.contactoEmail, data.contactoTelefono]);
        } else {
          // Si el autor borra todos los datos privados, no se conserva una fila vacía.
          await client.query('DELETE FROM aviso_datos_privados WHERE aviso_id = $1', [avisoId]);
        }
        await client.query('COMMIT');
        return { id: avisoId };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
