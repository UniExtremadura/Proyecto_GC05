/** SCRUM-127 / US-018 · Cliente de la API de solicitudes de recuperación (SCRUM-64, Samuel).
 * await createSolicitud(hallazgoId, justificacion) -> { solicitud: { id, hallazgoId, estado: 'Pendiente', creadaEn } }
 * Solo se envía la justificación; el solicitante sale de la sesión (cookie HttpOnly) y el estado lo fija el servidor.
 * Errores: 400 con errors.justificacion; 401 sin sesión; 403 si la cuenta no es de Usuario;
 * 404 si el hallazgo no existe; 409 si ya no está Activo o ya hay una solicitud Pendiente propia.
 */
export const JUSTIFICACION_MAX = 2000;

export class SolicitudApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const messages = {
  400: 'Revisa los datos de la solicitud.',
  401: 'Tu sesión ha caducado. Inicia sesión de nuevo.',
  403: 'Tu cuenta no puede solicitar la recuperación de hallazgos.',
  404: 'El hallazgo ya no existe.',
  409: 'No se puede crear la solicitud para este hallazgo.',
  413: 'La justificación es demasiado larga.',
  415: 'Envía la solicitud en formato JSON.',
  503: 'Las solicitudes de recuperación no están disponibles en este momento.',
};

export async function createSolicitud(hallazgoId, justificacion) {
  let response;
  try {
    response = await fetch(`/api/hallazgos/${encodeURIComponent(hallazgoId)}/solicitudes`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ justificacion }),
    });
  } catch {
    // No se reintenta automáticamente: la solicitud podría haberse guardado.
    throw new SolicitudApiError(0, 'No se pudo conectar con el servidor. Comprueba la conexión.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // El 409 distingue «ya no está activo» de «ya tienes una solicitud pendiente»: se usa el texto del servidor.
    const serverMessage = response.status === 409 && typeof data?.message === 'string' ? data.message : '';
    const errors = response.status === 400 && data?.errors && typeof data.errors === 'object' ? data.errors : {};
    throw new SolicitudApiError(
      response.status,
      serverMessage || messages[response.status] || 'No se ha podido enviar la solicitud.',
      errors,
    );
  }
  if (!data?.solicitud) throw new SolicitudApiError(response.status, 'La respuesta del servidor no es válida.');
  return data;
}
