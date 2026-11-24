import { randomUUID } from 'node:crypto';
import { SolicitudError } from '../services/solicitudes.js';

export function createSolicitudRepository(pool) {
  return {
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
