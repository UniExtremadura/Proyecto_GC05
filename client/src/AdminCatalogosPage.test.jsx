// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { AdminCatalogosPage } from './AdminCatalogosPage.jsx';
import { HomePage } from './HomePage.jsx';
import { App } from './App.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.location.hash = ''; });
const F = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const K = '44444444-4444-4444-8444-444444444444';
const sample = () => ({
  facultades: [{ id: F, nombre: 'Facultad ficticia', activo: true }, { id: F2, nombre: 'Facultad histórica', activo: false }],
  centros: [{ id: C, nombre: 'Centro ficticio', facultadId: F, activo: true }],
  categorias: [{ id: K, nombre: 'Llaves ficticias', activo: true }],
});
const ok = data => ({ ok: true, status: 200, json: async () => data });
const fail = (status, data = {}) => ({ ok: false, status, json: async () => data });

function stub({ initial = sample(), mutation, getError } = {}) {
  let data = structuredClone(initial);
  let counter = 0;
  const fetch = vi.fn(async (url, options = {}) => {
    if (options.method === 'GET') return getError ?? ok(structuredClone(data));
    if (mutation) return mutation(url, options);
    const [, tipo, id] = url.match(/\/catalogos\/([^/]+)(?:\/([^/]+))?/) ?? [];
    const body = JSON.parse(options.body);
    const saved = options.method === 'POST'
      ? { id: `nuevo-${++counter}`, ...body, activo: true }
      : { ...data[tipo].find(item => item.id === id), ...body };
    data = { ...data, [tipo]: [...data[tipo].filter(item => item.id !== saved.id), saved] };
    return ok(saved);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
async function open(options) {
  const fetch = stub(options);
  const user = userEvent.setup();
  render(<AdminCatalogosPage />);
  await screen.findByRole('button', { name: 'Crear facultad' });
  return { fetch, user };
}
const mutations = fetch => fetch.mock.calls.filter(([, options]) => options.method !== 'GET');

it('carga los tres catálogos, distingue activos e inactivos y permite filtrar', async () => {
  const { user } = await open();
  expect(screen.getByText('Facultad ficticia')).toBeInTheDocument();
  expect(screen.getByText('Facultad histórica')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Mostrar por estado'), 'inactivos');
  expect(screen.queryByText('Facultad ficticia')).not.toBeInTheDocument();
  expect(screen.getByText('Facultad histórica')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Centros/ }));
  expect(screen.getByText('Centro ficticio')).toBeInTheDocument();
  expect(screen.getByText('Facultad ficticia')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Categorías/ }));
  expect(screen.getByText('Llaves ficticias')).toBeInTheDocument();
});

it.each([
  ['facultades', 'Crear facultad', null], ['centros', 'Crear centro', /^Centros/], ['categorias', 'Crear categoría', /^Categorías/],
])('crea un elemento de %s conectado al POST real', async (tipo, button, section) => {
  const { fetch, user } = await open();
  if (section) await user.click(screen.getByRole('button', { name: section }));
  await user.click(screen.getByRole('button', { name: button }));
  await user.type(screen.getByLabelText('Nombre'), '  Nuevo elemento  ');
  if (tipo === 'centros') await user.selectOptions(screen.getByLabelText('Facultad del centro'), F);
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('Elemento creado correctamente.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nuevo elemento', level: 3 })).toBeInTheDocument();
  const [url, options] = mutations(fetch)[0];
  expect(url).toBe(`/api/admin/catalogos/${tipo}`);
  expect(JSON.parse(options.body)).toEqual({ nombre: 'Nuevo elemento', ...(tipo === 'centros' && { facultadId: F }) });
});

it.each([
  ['facultades', 'Facultad ficticia', F, null], ['centros', 'Centro ficticio', C, /^Centros/], ['categorias', 'Llaves ficticias', K, /^Categorías/],
])('edita %s conservando el identificador y precargando los datos', async (tipo, name, id, section) => {
  const { user, fetch } = await open();
  if (section) await user.click(screen.getByRole('button', { name: section }));
  await user.click(screen.getByRole('button', { name: `Editar ${name}` }));
  expect(screen.getByLabelText('Nombre')).toHaveValue(name);
  if (tipo === 'centros') expect(screen.getByLabelText('Facultad del centro')).toHaveValue(F);
  await user.clear(screen.getByLabelText('Nombre'));
  await user.type(screen.getByLabelText('Nombre'), 'Nombre corregido');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('Cambios guardados correctamente.')).toBeInTheDocument();
  expect(mutations(fetch)[0]).toEqual([`/api/admin/catalogos/${tipo}/${id}`, expect.objectContaining({ method: 'PUT' })]);
});

it('no envía nombres vacíos y enfoca un resumen accesible del error', async () => {
  const { user, fetch } = await open();
  await user.click(screen.getByRole('button', { name: 'Crear facultad' }));
  await user.type(screen.getByLabelText('Nombre'), '   ');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(mutations(fetch)).toHaveLength(0);
  expect(screen.getByLabelText('Nombre')).toHaveAttribute('maxlength', '150');
  await user.click(screen.getByRole('button', { name: /^Categorías/ }));
  await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
  expect(screen.getByLabelText('Nombre')).toHaveAttribute('maxlength', '100');
});

it('un centro necesita facultad activa y no ofrece facultades inactivas para crearlo', async () => {
  const { user, fetch } = await open();
  await user.click(screen.getByRole('button', { name: /^Centros/ }));
  await user.click(screen.getByRole('button', { name: 'Crear centro' }));
  expect(screen.queryByRole('option', { name: 'Facultad histórica' })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Nombre'), 'Centro nuevo');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(screen.getByText('Selecciona una facultad activa.')).toBeInTheDocument();
  expect(mutations(fetch)).toHaveLength(0);
});

it('explica cómo crear un centro si todavía no hay facultades activas', async () => {
  const { user } = await open({ initial: { facultades: [], centros: [], categorias: [] } });
  expect(screen.getByText(/Todavía no hay facultades/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Centros/ }));
  await user.click(screen.getByRole('button', { name: 'Crear centro' }));
  expect(screen.getByText('Crea o reactiva una facultad antes de guardar un centro.')).toBeInTheDocument();
});

it('confirma antes de desactivar y después permite reactivar el mismo elemento', async () => {
  const { user, fetch } = await open();
  await user.click(screen.getByRole('button', { name: 'Desactivar Facultad ficticia' }));
  expect(mutations(fetch)).toHaveLength(0);
  expect(screen.getByText(/Una facultad con conserjes asignados/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));
  expect(await screen.findByText('Elemento desactivado. Se conservan los datos históricos.')).toBeInTheDocument();
  expect(mutations(fetch)[0][1]).toMatchObject({ method: 'PATCH', body: '{"activo":false}' });
  await user.click(screen.getByRole('button', { name: 'Reactivar Facultad ficticia' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar reactivación' }));
  expect(await screen.findByText('Elemento reactivado correctamente.')).toBeInTheDocument();
  expect(mutations(fetch)[1][1].body).toBe('{"activo":true}');
});

it('cancelar una desactivación no envía peticiones ni modifica datos', async () => {
  const { user, fetch } = await open();
  await user.click(screen.getByRole('button', { name: 'Desactivar Facultad ficticia' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(mutations(fetch)).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Desactivar Facultad ficticia' })).toBeInTheDocument();
});

it('presenta el bloqueo de conserjes del servidor sin marcar la facultad como inactiva', async () => {
  const { user } = await open({ mutation: async () => fail(409, { message: 'No se puede desactivar una facultad con conserjes asignados.' }) });
  await user.click(screen.getByRole('button', { name: 'Desactivar Facultad ficticia' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se puede desactivar una facultad con conserjes asignados.');
  expect(screen.getByRole('button', { name: 'Desactivar Facultad ficticia' })).toBeInTheDocument();
});

it.each([400, 409])('muestra errores %s por campo y conserva los datos escritos', async status => {
  const { user } = await open({ mutation: async () => fail(status, { message: 'Revisa el nombre.', errors: { nombre: 'El nombre ya está registrado.' } }) });
  await user.click(screen.getByRole('button', { name: 'Crear facultad' }));
  await user.type(screen.getByLabelText('Nombre'), 'Nombre repetido');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('El nombre ya está registrado.')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre')).toHaveValue('Nombre repetido');
});

it.each([401, 403])('al abrir sin autorización (%s) no ofrece controles de administración', async status => {
  stub({ getError: fail(status) });
  render(<AdminCatalogosPage />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Crear facultad' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Iniciar sesión' }) !== null).toBe(status === 401);
});

it('si caduca la sesión al guardar, retira la información y los controles', async () => {
  const { user } = await open({ mutation: async () => fail(401) });
  await user.click(screen.getByRole('button', { name: 'Crear facultad' }));
  await user.type(screen.getByLabelText('Nombre'), 'Otra');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(screen.queryByText('Facultad ficticia')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
});

it('permite reintentar un fallo inicial de carga', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok(sample()));
  vi.stubGlobal('fetch', fetch);
  render(<AdminCatalogosPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Reintentar carga' }));
  expect(await screen.findByRole('button', { name: 'Crear facultad' })).toBeInTheDocument();
});

it('bloquea dobles envíos y cambios de sección mientras guarda', async () => {
  let resolve;
  const { user, fetch } = await open({ mutation: () => new Promise(done => { resolve = done; }) });
  await user.click(screen.getByRole('button', { name: 'Crear facultad' }));
  await user.type(screen.getByLabelText('Nombre'), 'Nueva');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^Centros/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Guardando…' }));
  expect(mutations(fetch)).toHaveLength(1);
  await act(async () => resolve(ok({ id: 'nuevo', nombre: 'Nueva', activo: true })));
  expect(await screen.findByText('Elemento creado correctamente.')).toBeInTheDocument();
});

it('los nombres guardados se representan como texto, sin interpretar HTML', async () => {
  const data = sample();
  data.facultades[0].nombre = '<img src=x onerror=alert(1)>';
  await open({ initial: data });
  expect(screen.getByRole('heading', { name: '<img src=x onerror=alert(1)>', level: 3 })).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it.each(['USUARIO', 'CONSERJE', undefined, 'ADMINISTRADOR'])('solo el administrador ve el acceso en la portada: %s', rol => {
  render(<HomePage user={rol ? { email: 'ficticio@example.com', rol } : null} />);
  expect(screen.queryByRole('link', { name: 'Gestionar catálogos' }) !== null).toBe(rol === 'ADMINISTRADOR');
});

it('la URL directa usa la API protegida aunque App no tenga usuario en memoria', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.location.hash = '#administrar-catalogos';
  const fetch = stub({ getError: fail(403) });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Solo los administradores');
  expect(fetch).toHaveBeenCalledWith('/api/admin/catalogos', { method: 'GET', credentials: 'same-origin' });
});
