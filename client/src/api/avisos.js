/** Luis / SCRUM-52: módulo HTTP listo para importar desde el formulario React.
 * await getAvisoOptions() -> { categorias, facultades, centros }.
 * await publishAviso({ categoriaId, facultadId, centroId, descripcion, fechaPerdida,
 *   rasgosPrivados, contactoEmail, contactoTelefono }).
 * Se exige facultadId o centroId; si se envían ambos, el centro debe ser de esa facultad.
 * Los cuatro campos opcionales pueden omitirse o enviarse vacíos/null.
 * La sesión ya existente viaja por cookie: no enviar autorId, estado ni tokens.
 * Con 201 mostrar confirmación. No reenviar automáticamente un POST que falle por red.
 * Con 400 mostrar error.errors[campo] como texto junto a cada control; con 401 volver al login.
 * Mostrar en el formulario: «Este aviso no inicia una solicitud de recuperación ni
 * implica que el objeto esté bajo custodia de la Universidad» (US-013-AC-07).
 * No incluir correo de la cuenta por defecto ni publicar los rasgos/contactos en el feed.
 */
export class AvisoApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
const messages = {
  400: 'Revisa los datos del aviso.', 401: 'Debes iniciar sesión para publicar un aviso.',
  403: 'Origen de la petición no permitido.', 413: 'El aviso es demasiado grande.',
  415: 'Envía el aviso en formato JSON.', 429: 'Demasiadas publicaciones. Inténtalo más tarde.',
  503: 'La publicación de avisos no está disponible en este momento.',
};
// SCRUM-122: mensajes de la consulta y edición de avisos propios.
const ownMessages = {
  401: 'Debes iniciar sesión para gestionar tus avisos.',
  404: 'No se ha encontrado el aviso.',
  409: 'Solo se pueden editar avisos activos.',
  503: 'La gestión de avisos no está disponible en este momento.',
};
async function request(path, body, method = 'POST') {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...(body !== undefined && { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new AvisoApiError(0, 'No se pudo conectar con el servidor. Comprueba la conexión.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const isFeed = path.startsWith('/api/avisos?');
    const isClosure = path.endsWith('/cierre') || path.endsWith('/gestion-cierre');

    const feedMessages = {
      // SCRUM-119: el servidor distingue paginación y filtros; se usa su mensaje si lo hay.
      400: (typeof data?.message === 'string' && data.message) || 'Revisa los parámetros de la búsqueda.',
      401: 'Debes iniciar sesión para consultar los avisos.',
      404: 'La página solicitada no existe.',
      503: 'La consulta de avisos no está disponible en este momento.',
    };

    const isOwn = method === 'PUT' || /^\/api\/avisos\/(?!opciones$)[^/?]+$/.test(path);

    throw new AvisoApiError(
      response.status,
      (isClosure && typeof data?.message === 'string' ? data.message : null) ||
        (isFeed ? feedMessages[response.status] : null) ||
        (isOwn ? ownMessages[response.status] : null) ||
        messages[response.status] ||
        'No se ha podido completar la operación.',
      response.status === 400 ? data?.errors ?? {} : {}
    );
  }
  if (!data) throw new AvisoApiError(response.status, 'La respuesta del servidor no es válida.');
  return data;
}
export const getAvisosParaCerrar = () => request('/api/avisos/gestion-cierre');
export const closeAviso = (id, motivo) => request(`/api/avisos/${encodeURIComponent(id)}/cierre`, { motivo });

export const getAvisoOptions = () => request('/api/avisos/opciones');
export const publishAviso = datos => request('/api/avisos', datos);

/** SCRUM-122 / US-016: módulo HTTP para la pantalla de Luis (SCRUM-60).
 * await getMyAvisos() -> { avisos: [{ id, descripcion, fechaPerdida, estado, categoria, facultad, centro, publicadoEn, actualizadoEn }] }
 * await getMyAviso(id) -> { aviso: { id, categoriaId, facultadId, centroId, descripcion, fechaPerdida, estado,
 *   rasgosPrivados, contactoEmail, contactoTelefono, publicadoEn, actualizadoEn, editable } }
 *   `aviso` se puede pasar tal cual a <EditLostNoticeForm aviso={...} />.
 * await updateAviso(id, toAvisoPayload(form)) -> { message, aviso: { id, estado } }. Se envía el aviso completo.
 * Errores: 400 con errors[campo]; 404 si no existe o es de otra persona; 409 si ya no está Activo.
 */
export const getMyAvisos = () => request('/api/avisos/mios');
export const getMyAviso = id => request(`/api/avisos/${encodeURIComponent(id)}`);
export const updateAviso = (id, datos) => request(`/api/avisos/${encodeURIComponent(id)}`, datos, 'PUT');

// SCRUM-57 / US-014: consulta paginada del feed de avisos.
// SCRUM-119 / US-015: filtros opcionales { q, categoriaId, facultadId, centroId }; los vacíos no se envían.
export function getAvisos(pagina = 1, tamano = 12, filtros = {}) {
  const params = new URLSearchParams({
    pagina: String(pagina),
    tamano: String(tamano),
  });

  for (const key of ['q', 'categoriaId', 'facultadId', 'centroId']) {
    const value = typeof filtros[key] === 'string' ? filtros[key].trim() : '';
    if (value) params.set(key, value);
  }

  return request(`/api/avisos?${params.toString()}`);
}