import { randomUUID } from 'node:crypto';

// SCRUM-134 / US-023: acceso a los catálogos administrativos.
export function createCatalogoRepository(pool) {
  if (!pool) {
    return {
      list: async () => {
        throw new Error('La gestión de catálogos no está disponible.');
      },
    };
  }

  return {
    async list() {
      const { rows: facultades } = await pool.query(
        'SELECT id, nombre, activo FROM facultades ORDER BY nombre, id',
      );

      const { rows: categorias } = await pool.query(
        'SELECT id, nombre, activo FROM categorias ORDER BY nombre, id',
      );

      const { rows: centros } = await pool.query(
        `SELECT id, nombre, facultad_id AS "facultadId", activo
         FROM centros ORDER BY nombre, id`,
      );

      return { facultades, centros, categorias };
    },
    async create(tipo, nombre) {
      const tablas = {
        facultades: 'facultades',
        categorias: 'categorias',
      };

      if (!Object.hasOwn(tablas, tipo)) {
        throw new TypeError('Tipo de catálogo no válido.');
      }

      const id = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO ${tablas[tipo]} (id, nombre)
         VALUES ($1, $2)
         RETURNING id, nombre, activo`,
        [id, nombre],
      );
      return rows[0];
    },
    async createCentro(nombre, facultadId) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const facultad = await client.query(
          'SELECT id FROM facultades WHERE id = $1 AND activo FOR SHARE',
          [facultadId],
        );

        if (!facultad.rowCount) {
          const error = new Error('La facultad no existe o está inactiva.');
          error.code = 'FACULTAD_INVALIDA';
          throw error;
        }

        const id = randomUUID();

        const { rows } = await client.query(
          `INSERT INTO centros (id, nombre, facultad_id)
           VALUES ($1, $2, $3)
           RETURNING id, nombre, facultad_id AS "facultadId", activo`,
          [id, nombre, facultadId],
        );

        await client.query('COMMIT');
        return rows[0];
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async update(tipo, id, nombre) {
      const tablas = {
        facultades: 'facultades',
        categorias: 'categorias',
      };

      if (!Object.hasOwn(tablas, tipo)) {
        throw new TypeError('Tipo de catálogo no válido.');
      }

      const { rows } = await pool.query(
        `UPDATE ${tablas[tipo]}
         SET nombre = $2
         WHERE id = $1
         RETURNING id, nombre, activo`,
        [id, nombre],
      );

      return rows[0] ?? null;
    },
    async updateCentro(id, nombre, facultadId) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const facultad = await client.query(
          'SELECT id FROM facultades WHERE id = $1 AND activo FOR SHARE',
          [facultadId],
        );

        if (!facultad.rowCount) {
          const error = new Error('La facultad no existe o está inactiva.');
          error.code = 'FACULTAD_INVALIDA';
          throw error;
        }

        const { rows } = await client.query(
          `UPDATE centros
           SET nombre = $2, facultad_id = $3
           WHERE id = $1
           RETURNING id, nombre, facultad_id AS "facultadId", activo`,
          [id, nombre, facultadId],
        );

        await client.query('COMMIT');
        return rows[0] ?? null;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async setActivo(tipo, id, activo) {
      const tablas = {
        centros: 'centros',
        categorias: 'categorias',
      };

      if (!Object.hasOwn(tablas, tipo)) {
        throw new TypeError('Tipo de catálogo no válido.');
      }

      if (typeof activo !== 'boolean') {
        throw new TypeError('El estado activo debe ser un booleano.');
      }

      const campos = tipo === 'centros'
        ? 'id, nombre, facultad_id AS "facultadId", activo'
        : 'id, nombre, activo';

      const { rows } = await pool.query(
        `UPDATE ${tablas[tipo]}
         SET activo = $2
         WHERE id = $1
         RETURNING ${campos}`,
        [id, activo],
      );

      return rows[0] ?? null;
    },
    async setFacultadActiva(id, activo) {
      if (typeof activo !== 'boolean') {
        throw new TypeError('El estado activo debe ser un booleano.');
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Bloqueamos la facultad para proteger la comprobación
        // frente a asignaciones concurrentes de conserjes.
        const facultad = await client.query(
          'SELECT id FROM facultades WHERE id = $1 FOR UPDATE',
          [id],
        );

        if (!facultad.rowCount) {
          await client.query('COMMIT');
          return null;
        }

        if (!activo) {
          const asignaciones = await client.query(
            'SELECT 1 FROM asignaciones_conserje WHERE facultad_id = $1 LIMIT 1',
            [id],
          );

          if (asignaciones.rowCount > 0) {
            const error = new Error(
              'No se puede desactivar una facultad con conserjes asignados.',
            );
            error.code = 'FACULTAD_CON_CONSERJES';
            throw error;
          }
        }

        const { rows } = await client.query(
          `UPDATE facultades
           SET activo = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING id, nombre, activo`,
          [id, activo],
        );

        await client.query('COMMIT');
        return rows[0];
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}