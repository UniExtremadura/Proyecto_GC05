import { afterEach, expect, it, vi } from 'vitest';
import { createSolicitud } from './solicitudes.js';

// SCRUM-127 / US-018: contrato del módulo HTTP con la API de SCRUM-64.
const HALLAZGO = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  vi.unstubAllGlobals();
});

const respond = (status, body) => vi.fn().mockResolvedValue({
  ok: status >= 200 && status < 300, status, json: async () => body,
});

it('envía solo la justificación, con la sesión y en JSON', async () => {
  const solicitud = { id: 's-1', hallazgoId: HALLAZGO, estado: 'Pendiente', creadaEn: '2026-11-22T10:00:00.000Z' };
  const fetch = respond(201, { solicitud });
  vi.stubGlobal('fetch', fetch);

  expect(await createSolicitud(HALLAZGO, 'Tiene mis iniciales')).toEqual({ solicitud });
  expect(fetch).toHaveBeenCalledWith(`/api/hallazgos/${HALLAZGO}/solicitudes`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ justificacion: 'Tiene mis iniciales' }),
  });
});

it('codifica el identificador en la URL', async () => {
  const fetch = respond(201, { solicitud: { id: 's-1' } });
  vi.stubGlobal('fetch', fetch);

  await createSolicitud('a/b?c', 'x');

  expect(fetch.mock.calls[0][0]).toBe('/api/hallazgos/a%2Fb%3Fc/solicitudes');
});

it('400: devuelve el error del campo justificación', async () => {
  vi.stubGlobal('fetch', respond(400, {
    message: 'Revisa los datos de la solicitud.',
    errors: { justificacion: 'Introduce un texto válido de entre 1 y 2000 caracteres.' },
  }));

  await expect(createSolicitud(HALLAZGO, '')).rejects.toMatchObject({
    status: 400,
    message: 'Revisa los datos de la solicitud.',
    errors: { justificacion: 'Introduce un texto válido de entre 1 y 2000 caracteres.' },
  });
});

it.each([
  ['Ya tienes una solicitud pendiente para este hallazgo.'],
  ['El hallazgo ya no está activo.'],
])('409: muestra el motivo que da el servidor (%s)', async (message) => {
  vi.stubGlobal('fetch', respond(409, { message }));

  await expect(createSolicitud(HALLAZGO, 'x')).rejects.toMatchObject({ status: 409, message });
});

it.each([
  [401, 'Tu sesión ha caducado. Inicia sesión de nuevo.'],
  [403, 'Tu cuenta no puede solicitar la recuperación de hallazgos.'],
  [404, 'El hallazgo ya no existe.'],
  [503, 'Las solicitudes de recuperación no están disponibles en este momento.'],
  [500, 'No se ha podido enviar la solicitud.'],
])('%i: mensaje comprensible sin detalles internos', async (status, message) => {
  vi.stubGlobal('fetch', respond(status, { message: 'SQL interno', errors: { privado: 'secreto' } }));

  await expect(createSolicitud(HALLAZGO, 'x')).rejects.toMatchObject({ status, message, errors: {} });
});

it('sin conexión no reintenta y lo explica', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetch);

  await expect(createSolicitud(HALLAZGO, 'x')).rejects.toMatchObject({
    status: 0, message: 'No se pudo conectar con el servidor. Comprueba la conexión.',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
