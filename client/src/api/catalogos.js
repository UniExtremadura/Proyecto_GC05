/** SCRUM-132: contrato real de la API de Ángel (SCRUM-134).
 * La cookie de sesión identifica al administrador. No enviar rol ni credenciales.
 * Las mutaciones no se reintentan automáticamente: un fallo de red no prueba que no se guardaran.
 */
export class CatalogoApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const messages = {
  400: 'Revisa los datos introducidos.',
  401: 'Tu sesión ha caducado. Inicia sesión de nuevo.',
  403: 'No tienes permisos para gestionar los catálogos.',
  404: 'El elemento ya no está disponible. Actualiza el listado.',
  413: 'Los datos enviados son demasiado grandes.',
  415: 'No se han podido enviar los datos en el formato esperado.',
  429: 'Demasiados intentos. Inténtalo más tarde.',
  503: 'La gestión de catálogos no está disponible en este momento.',
};

async function request(path = '', method = 'GET', body) {
  let response;
  try {
    response = await fetch(`/api/admin/catalogos${path}`, {
      method, credentials: 'same-origin',
      ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new CatalogoApiError(0, 'No se pudo confirmar la operación. Comprueba la conexión y actualiza el listado antes de volver a intentarlo.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // 400/409 son errores de negocio controlados de SCRUM-134: mostrar sus campos como texto.
    const business = response.status === 400 || response.status === 409;
    throw new CatalogoApiError(response.status,
      (business && typeof data?.message === 'string' ? data.message : messages[response.status]) || 'No se ha podido completar la operación.',
      business && data?.errors && typeof data.errors === 'object' ? data.errors : {});
  }
  if (!data || typeof data !== 'object') throw new CatalogoApiError(response.status, 'La respuesta del servidor no es válida.');
  return data;
}

export const getCatalogos = () => request();
// tipo: facultades | centros | categorias. Centros necesitan nombre y facultadId.
export const createCatalogo = (tipo, datos) => request(`/${tipo}`, 'POST', datos);
export const updateCatalogo = (tipo, id, datos) => request(`/${tipo}/${encodeURIComponent(id)}`, 'PUT', datos);
export const setCatalogoActivo = (tipo, id, activo) => request(`/${tipo}/${encodeURIComponent(id)}/estado`, 'PATCH', { activo });
