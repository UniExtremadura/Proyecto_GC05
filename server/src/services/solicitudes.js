import validator from 'validator';

export class SolicitudError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function createSolicitudService(storage) {
  return {
    // SCRUM-131 / US-019: listado de solicitudes propias.
    async listOwn(user) {
      if (user.rol !== 'USUARIO') {
        throw new SolicitudError(
          403,
          'Solo los usuarios pueden consultar sus solicitudes de recuperación.',
        );
      }

      const solicitudes = await storage.listOwn(user.id);
      return { solicitudes };
    },

    // SCRUM-131 / US-019: detalle de una solicitud propia.
    async getOwn(user, solicitudId) {
      if (user.rol !== 'USUARIO') {
        throw new SolicitudError(
          403,
          'Solo los usuarios pueden consultar sus solicitudes de recuperación.',
        );
      }

      if (!validator.isUUID(solicitudId)) {
        throw new SolicitudError(404, 'Solicitud no encontrada.');
      }

      const solicitud = await storage.getOwn(user.id, solicitudId);

      if (!solicitud) {
        throw new SolicitudError(404, 'Solicitud no encontrada.');
      }

      return { solicitud };
    },
    async create(user, hallazgoId, body) {
      if (user.rol !== 'USUARIO') {
        throw new SolicitudError(403, 'Solo los usuarios pueden solicitar la recuperación de un hallazgo.');
      }
      if (!validator.isUUID(hallazgoId)) throw new SolicitudError(404, 'Hallazgo no encontrado.');

      const justificacion = typeof body?.justificacion === 'string' ? body.justificacion.trim() : '';
      if (!justificacion || [...justificacion].length > 2000 || justificacion.includes('\0')) {
        throw new SolicitudError(400, 'Revisa los datos de la solicitud.', {
          justificacion: 'Introduce un texto válido de entre 1 y 2000 caracteres.',
        });
      }
      if (Object.keys(body).some(key => key !== 'justificacion')) {
        throw new SolicitudError(400, 'Solo se admite la justificación de la solicitud.');
      }

      const { id, estado, creadaEn } = await storage.create(user.id, hallazgoId, justificacion);
      return { solicitud: { id, hallazgoId, estado, creadaEn } };
    },
  };
}
