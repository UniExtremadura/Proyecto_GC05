import { randomUUID } from 'node:crypto';
import { SolicitudError } from '../services/solicitudes.js';

export function createSolicitudRepository(pool) {
  return {

    // SCRUM-131 / US-019: consultar únicamente las solicitudes propias.
    async listOwn(userId) {
      if (!pool) {
        throw new SolicitudError(503, 'La consulta de solicitudes no está disponible.');
      }

      const { rows } = await pool.query(
        `SELECT s.id,
                s.hallazgo_id AS "hallazgoId",
                s.estado,
                CASE WHEN s.estado = 'Rechazada'
                  THEN s.motivo_rechazo ELSE NULL
                END AS "motivoRechazo",
                CASE WHEN s.estado = 'Validada'
                  THEN s.instrucciones_recogida ELSE NULL
                END AS "instruccionesRecogida",
                to_json(s.created_at) #>> '{}' AS "creadaEn",

                h.descripcion AS "hallazgoDescripcion",
                to_char(h.fecha_hallazgo, 'YYYY-MM-DD') AS "fechaHallazgo",
                f.nombre AS facultad,
                c.nombre AS categoria
           FROM solicitudes_recuperacion s
           JOIN hallazgos h ON h.id = s.hallazgo_id
           JOIN facultades f ON f.id = h.facultad_id
           JOIN categorias c ON c.id = h.categoria_id
          WHERE s.solicitante_id = $1
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 200`,
        [userId],
      );

      return rows;
    },

    // SCRUM-131 / US-019: detalle de una solicitud propia.
    async getOwn(userId, solicitudId) {
      if (!pool) {
        throw new SolicitudError(503, 'La consulta de solicitudes no está disponible.');
      }

      const { rows } = await pool.query(
        `SELECT s.id,
                s.hallazgo_id AS "hallazgoId",
                s.justificacion,
                s.estado,
                CASE WHEN s.estado = 'Rechazada'
                  THEN s.motivo_rechazo ELSE NULL
                END AS "motivoRechazo",
                CASE WHEN s.estado = 'Validada'
                  THEN s.instrucciones_recogida ELSE NULL
                END AS "instruccionesRecogida",
                to_json(s.created_at) #>> '{}' AS "creadaEn",
               h.descripcion AS "hallazgoDescripcion",
                to_char(h.fecha_hallazgo, 'YYYY-MM-DD') AS "fechaHallazgo",
                f.nombre AS facultad,
                c.nombre AS categoria
           FROM solicitudes_recuperacion s
           JOIN hallazgos h ON h.id = s.hallazgo_id
           JOIN facultades f ON f.id = h.facultad_id
           JOIN categorias c ON c.id = h.categoria_id
          WHERE s.id = $1
            AND s.solicitante_id = $2`,
        [solicitudId, userId],
      );

      return rows[0] ?? null;
    },
    async create(userId, hallazgoId, justificacion) {
      if (!pool) throw new SolicitudError(503, 'La creación de solicitudes no está disponible.');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [user] } = await client.query(
          'SELECT rol FROM usuarios WHERE id = $1 AND activo FOR SHARE', [userId],
        );
        if (!user) throw new SolicitudError(401, 'Debes iniciar sesión.');
        if (user.rol !== 'USUARIO') throw new SolicitudError(403, 'Tu cuenta no puede crear solicitudes.');

        // Mantiene el hallazgo activo hasta terminar la creación, incluso si se intenta retirar a la vez.
        const { rows: [hallazgo] } = await client.query(
          'SELECT estado FROM hallazgos WHERE id = $1 FOR SHARE', [hallazgoId],
        );
        if (!hallazgo) throw new SolicitudError(404, 'Hallazgo no encontrado.');
        if (hallazgo.estado !== 'Activo') throw new SolicitudError(409, 'El hallazgo ya no está activo.');

        const { rows: [solicitud] } = await client.query(
          `INSERT INTO solicitudes_recuperacion (id, solicitante_id, hallazgo_id, justificacion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (solicitante_id, hallazgo_id) WHERE estado = 'Pendiente' DO NOTHING
           RETURNING id, estado, created_at AS "creadaEn"`,
          [randomUUID(), userId, hallazgoId, justificacion],
        );
        if (!solicitud) throw new SolicitudError(409, 'Ya tienes una solicitud pendiente para este hallazgo.');

        await client.query('COMMIT');
        return solicitud;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
