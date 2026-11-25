// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { getAvisoOptions, publishAviso, getAvisos, getMyAvisos, getMyAviso, updateAviso } from './avisos.js';

afterEach(() => vi.unstubAllGlobals());
it('Luis puede consultar los catálogos con la sesión existente', async () => {
  const data = { categorias: [], facultades: [], centros: [] };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
  vi.stubGlobal('fetch', fetch);
  expect(await getAvisoOptions()).toEqual(data);
  expect(fetch).toHaveBeenCalledWith('/api/avisos/opciones', { credentials: 'same-origin' });
});
it('publica el JSON del formulario con su cookie, sin cambiar los campos', async () => {
  const datos = { categoriaId: 'id', descripcion: 'Objeto ficticio', fechaPerdida: '2026-01-01' };
  const saved = { aviso: { id: 'nuevo', estado: 'Activo' } };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => saved });
  vi.stubGlobal('fetch', fetch);
  expect(await publishAviso(datos)).toEqual(saved);
  expect(fetch).toHaveBeenCalledWith('/api/avisos', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
});
it('entrega los errores de validación para mostrarlos junto a cada campo', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400,
    json: async () => ({ errors: { descripcion: 'Obligatoria' } }) }));
  await expect(publishAviso({})).rejects.toMatchObject({ status: 400, errors: { descripcion: 'Obligatoria' } });
});
it.each([401, 403, 413, 415, 429, 500, 503])('controla HTTP %s sin mostrar errores internos', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status,
    json: async () => ({ message: 'SQL secreto', errors: { privado: 'secreto' } }) }));
  await expect(publishAviso({})).rejects.toMatchObject({ status, errors: {} });
  await expect(publishAviso({})).rejects.not.toThrow('SQL secreto');
});
it('un fallo de red no repite un POST automáticamente', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('sin red'));
  vi.stubGlobal('fetch', fetch);
  await expect(publishAviso({})).rejects.toMatchObject({ status: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('detecta respuestas que no son JSON', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error(); } }));
  await expect(getAvisoOptions()).rejects.toThrow('La respuesta del servidor no es válida.');
});

// SCRUM-57 / US-014: API del feed de avisos.

it('consulta el feed con la paginación por defecto y la sesión existente', async () => {
  const data = {
    avisos: [],
    paginacion: { pagina: 1, tamano: 12, total: 0 },
  };

  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });

  vi.stubGlobal('fetch', fetch);

  expect(await getAvisos()).toEqual(data);

  expect(fetch).toHaveBeenCalledWith(
    '/api/avisos?pagina=1&tamano=12',
    { credentials: 'same-origin' }
  );
});

it('envía correctamente los parámetros de paginación', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ avisos: [] }),
  });

  vi.stubGlobal('fetch', fetch);

  await getAvisos(2, 5);

  expect(fetch).toHaveBeenCalledWith(
    '/api/avisos?pagina=2&tamano=5',
    { credentials: 'same-origin' }
  );
});

// SCRUM-122 / US-016: avisos propios y edición.
const ID = '44444444-4444-4444-8444-444444444444';

it('SCRUM-122: consulta los avisos propios y el detalle de uno', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ avisos: [] }) });
  vi.stubGlobal('fetch', fetch);

  await getMyAvisos();
  await getMyAviso(ID);

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/avisos/mios', { credentials: 'same-origin' });
  expect(fetch).toHaveBeenNthCalledWith(2, `/api/avisos/${ID}`, { credentials: 'same-origin' });
});

it('SCRUM-122: guarda el aviso completo con PUT y JSON', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: 'Aviso actualizado correctamente.', aviso: { id: ID, estado: 'Activo' } }),
  });
  vi.stubGlobal('fetch', fetch);
  const datos = { categoriaId: 'cat', facultadId: 'fac', centroId: null, descripcion: 'Mochila',
    fechaPerdida: '2026-01-15', rasgosPrivados: null, contactoEmail: null, contactoTelefono: null };

  const result = await updateAviso(ID, datos);

  expect(result.message).toBe('Aviso actualizado correctamente.');
  expect(fetch).toHaveBeenCalledWith(`/api/avisos/${ID}`, {
    credentials: 'same-origin', method: 'PUT',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
  });
});

it.each([
  [400, 'Revisa los datos del aviso.', { descripcion: 'Introduce una descripción.' }],
  [404, 'No se ha encontrado el aviso.', {}],
  [409, 'Solo se pueden editar avisos activos.', {}],
  [401, 'Debes iniciar sesión para gestionar tus avisos.', {}],
])('SCRUM-122: al editar, un %i da un mensaje comprensible', async (status, message, errors) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false, status, json: async () => ({ message: 'interno', errors: { descripcion: 'Introduce una descripción.' } }),
  }));

  await expect(updateAviso(ID, {})).rejects.toMatchObject({ status, message, errors });
});

it('SCRUM-122: las opciones del formulario conservan sus mensajes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));

  await expect(getAvisoOptions()).rejects.toMatchObject({
    status: 503, message: 'La publicación de avisos no está disponible en este momento.',
  });
});

it('SCRUM-119: añade los filtros con contenido y omite los vacíos', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ avisos: [] }),
  });

  vi.stubGlobal('fetch', fetch);

  await getAvisos(1, 12, { q: ' mochila azul ', categoriaId: 'cat-1', facultadId: '', centroId: undefined });

  expect(fetch).toHaveBeenCalledWith(
    '/api/avisos?pagina=1&tamano=12&q=mochila+azul&categoriaId=cat-1',
    { credentials: 'same-origin' }
  );
});

it('SCRUM-119: con un 400 del feed usa el mensaje del servidor', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({
      message: 'Revisa los filtros de búsqueda.',
      errors: { categoriaId: 'Selecciona una categoría válida.' },
    }),
  }));

  await expect(getAvisos(1, 12, { categoriaId: 'x' })).rejects.toMatchObject({
    status: 400,
    message: 'Revisa los filtros de búsqueda.',
    errors: { categoriaId: 'Selecciona una categoría válida.' },
  });
});

it('informa cuando la página solicitada no existe', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({
      message: 'La página solicitada no existe.',
    }),
  }));

  await expect(getAvisos(999)).rejects.toMatchObject({
    status: 404,
    message: 'La página solicitada no existe.',
  });
});

it('informa cuando la sesión no es válida', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({}),
  }));

  await expect(getAvisos()).rejects.toMatchObject({
    status: 401,
    message: 'Debes iniciar sesión para consultar los avisos.',
  });
});

it('no expone errores internos al consultar el feed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({
      message: 'SQL secreto',
      errors: { privado: 'secreto' },
    }),
  }));

  await expect(getAvisos()).rejects.toMatchObject({
    status: 500,
    message: 'No se ha podido completar la operación.',
    errors: {},
  });
});

it('controla los fallos de red al consultar avisos', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
    new Error('sin red')
  ));

  await expect(getAvisos()).rejects.toMatchObject({
    status: 0,
  });
});