// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createCatalogo, getCatalogos, setCatalogoActivo, updateCatalogo } from './catalogos.js';

afterEach(() => vi.unstubAllGlobals());
const ok = data => ({ ok: true, status: 200, json: async () => data });

it('consulta el contrato de SCRUM-134 con la cookie de sesión', async () => {
  const data = { facultades: [], centros: [], categorias: [] };
  const fetch = vi.fn().mockResolvedValue(ok(data));
  vi.stubGlobal('fetch', fetch);
  expect(await getCatalogos()).toEqual(data);
  expect(fetch).toHaveBeenCalledWith('/api/admin/catalogos', { method: 'GET', credentials: 'same-origin' });
});
it.each(['facultades', 'centros', 'categorias'])('crea %s sin agregar rol ni estado al cuerpo', async tipo => {
  const fetch = vi.fn().mockResolvedValue(ok({ id: 'nuevo', activo: true }));
  vi.stubGlobal('fetch', fetch);
  const body = { nombre: 'Ejemplo', ...(tipo === 'centros' && { facultadId: 'facultad' }) };
  await createCatalogo(tipo, body);
  expect(fetch).toHaveBeenCalledWith(`/api/admin/catalogos/${tipo}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
});
it('edita con PUT conservando la ruta del identificador', async () => {
  const fetch = vi.fn().mockResolvedValue(ok({ id: 'id' }));
  vi.stubGlobal('fetch', fetch);
  await updateCatalogo('centros', 'id', { nombre: 'Centro', facultadId: 'facultad' });
  expect(fetch).toHaveBeenCalledWith('/api/admin/catalogos/centros/id', expect.objectContaining({ method: 'PUT', body: '{"nombre":"Centro","facultadId":"facultad"}' }));
});
it.each([false, true])('cambia el estado con booleano %s mediante PATCH', async activo => {
  const fetch = vi.fn().mockResolvedValue(ok({ id: 'id', activo }));
  vi.stubGlobal('fetch', fetch);
  await setCatalogoActivo('facultades', 'id', activo);
  expect(fetch).toHaveBeenCalledWith('/api/admin/catalogos/facultades/id/estado', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ activo }) }));
});
it.each([400, 409])('conserva los errores de negocio %s para el formulario', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ message: 'Nombre duplicado', errors: { nombre: 'Ya existe' } }) }));
  await expect(createCatalogo('categorias', { nombre: 'Ejemplo' })).rejects.toMatchObject({ status, message: 'Nombre duplicado', errors: { nombre: 'Ya existe' } });
});
it.each([401, 403, 404, 413, 415, 429, 500, 503])('no expone detalles internos con HTTP %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ message: 'SQL secreto', errors: { privado: 'interno' } }) }));
  await expect(getCatalogos()).rejects.toMatchObject({ status, errors: {} });
  await expect(getCatalogos()).rejects.not.toThrow('SQL secreto');
});
it('un fallo de red no repite una creación ni anuncia éxito', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('red'));
  vi.stubGlobal('fetch', fetch);
  await expect(createCatalogo('categorias', { nombre: 'Ejemplo' })).rejects.toMatchObject({ status: 0 });
  expect(fetch).toHaveBeenCalledOnce();
});
it('detecta respuestas no JSON', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error(); } }));
  await expect(getCatalogos()).rejects.toThrow('La respuesta del servidor no es válida.');
});
