// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MyLostNoticesPage } from './MyLostNoticesPage.jsx';

// SCRUM-60 / US-016. Solo datos ficticios.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ID = '77777777-7777-4777-8777-777777777777';
const ID_CERRADO = '88888888-8888-4888-8888-888888888888';
const CATEGORIA = '11111111-1111-4111-8111-111111111111';
const FACULTAD = '22222222-2222-4222-8222-222222222222';
const OPTIONS = {
  categorias: [{ id: CATEGORIA, nombre: 'Mochilas y bolsos' }],
  facultades: [{ id: FACULTAD, nombre: 'Facultad Ficticia' }],
  centros: [],
};
const LISTA = {
  avisos: [
    { id: ID, descripcion: 'Mochila azul ficticia', fechaPerdida: '2026-01-15', estado: 'Activo', categoria: 'Mochilas y bolsos', facultad: 'Facultad Ficticia', centro: null },
    { id: ID_CERRADO, descripcion: 'Paraguas ficticio', fechaPerdida: '2026-01-10', estado: 'Cerrado', categoria: 'Mochilas y bolsos', facultad: 'Facultad Ficticia', centro: null },
  ],
};
const AVISO = {
  id: ID, categoriaId: CATEGORIA, facultadId: FACULTAD, centroId: null, descripcion: 'Mochila azul ficticia',
  fechaPerdida: '2026-01-15', estado: 'Activo', rasgosPrivados: 'Llavero ficticio', contactoEmail: null, contactoTelefono: null,
  editable: true,
};
const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });
const fail = (status, data = {}) => ({ ok: false, status, json: async () => data });

function stubFetch({ aviso = AVISO, update = ok({ message: 'Aviso actualizado correctamente.', aviso: { id: ID, estado: 'Activo' } }) } = {}) {
  const fetch = vi.fn(async (url, options = {}) => {
    if (url === '/api/avisos/mios') return ok(LISTA);
    if (url === '/api/avisos/opciones') return ok(OPTIONS);
    if (url === `/api/avisos/${ID}` && options.method === 'PUT') return update;
    if (url === `/api/avisos/${ID}`) return ok({ aviso });
    return fail(404);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function openEdit() {
  const user = userEvent.setup();
  render(<MyLostNoticesPage />);
  await user.click(await screen.findByRole('button', { name: 'Editar: Mochila azul ficticia' }));
  await screen.findByRole('button', { name: 'Guardar cambios' });
  return user;
}

it('muestra los avisos propios y solo deja editar los que siguen activos', async () => {
  stubFetch();
  render(<MyLostNoticesPage />);
  expect(await screen.findByText('Mochila azul ficticia')).toBeInTheDocument();
  expect(screen.getByText('Paraguas ficticio')).toBeInTheDocument();
  expect(screen.getByText('Mochilas y bolsos · Facultad Ficticia · 15/01/2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar: Mochila azul ficticia' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar: Paraguas ficticio' })).not.toBeInTheDocument();
  expect(screen.getByText('Ya no se puede editar.')).toBeInTheDocument();
});

it('al editar carga los datos guardados del aviso, también los privados', async () => {
  stubFetch();
  await openEdit();
  expect(screen.getByLabelText('Descripción pública')).toHaveValue('Mochila azul ficticia');
  expect(screen.getByLabelText('Categoría')).toHaveValue(CATEGORIA);
  expect(screen.getByLabelText('Rasgos identificativos privados (opcional)')).toHaveValue('Llavero ficticio');
});

it('AC-02: guarda los cambios con PUT y el aviso completo', async () => {
  const fetch = stubFetch();
  const user = await openEdit();
  await user.type(screen.getByLabelText('Descripción pública'), ' con parches');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('Aviso actualizado correctamente.')).toBeInTheDocument();
  const [url, options] = fetch.mock.calls.find(([, opts]) => opts?.method === 'PUT');
  expect(url).toBe(`/api/avisos/${ID}`);
  expect(JSON.parse(options.body)).toEqual({
    categoriaId: CATEGORIA, facultadId: FACULTAD, centroId: null, descripcion: 'Mochila azul ficticia con parches',
    fechaPerdida: '2026-01-15', rasgosPrivados: 'Llavero ficticio', contactoEmail: null, contactoTelefono: null,
  });
});

it('AC-01: si el aviso ya no es editable no muestra el formulario', async () => {
  stubFetch({ aviso: { ...AVISO, estado: 'Cerrado', editable: false } });
  const user = userEvent.setup();
  render(<MyLostNoticesPage />);
  await user.click(await screen.findByRole('button', { name: 'Editar: Mochila azul ficticia' }));
  expect(await screen.findByText('Este aviso está cerrado y ya no se puede editar.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
});

it('AC-01: si al guardar el aviso ya no está activo, lo indica y quita el formulario', async () => {
  stubFetch({ update: fail(409, { message: 'Solo se pueden editar avisos activos.' }) });
  const user = await openEdit();
  await user.type(screen.getByLabelText('Descripción pública'), ' con parches');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('Solo se pueden editar avisos activos.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
});

it('AC-05: un aviso de otra persona se trata como no encontrado', async () => {
  const fetch = vi.fn(async (url) => {
    if (url === '/api/avisos/mios') return ok(LISTA);
    if (url === '/api/avisos/opciones') return ok(OPTIONS);
    return fail(404);
  });
  vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup();
  render(<MyLostNoticesPage />);
  await user.click(await screen.findByRole('button', { name: 'Editar: Mochila azul ficticia' }));
  expect(await screen.findByText('No se ha encontrado el aviso.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
});

it('permite volver al listado', async () => {
  stubFetch();
  const user = await openEdit();
  await user.click(screen.getByRole('button', { name: '← Volver a mis avisos' }));
  expect(await screen.findByRole('button', { name: 'Editar: Mochila azul ficticia' })).toBeInTheDocument();
});

it('sin avisos propios ofrece publicar uno', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ avisos: [] })));
  render(<MyLostNoticesPage />);
  expect(await screen.findByText(/Todavía no has publicado ningún aviso de pérdida/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Publicar un aviso' })).toHaveAttribute('href', '#publicar-aviso');
});

it('sin sesión enlaza al inicio de sesión', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(401)));
  render(<MyLostNoticesPage />);
  expect(await screen.findByText(/Debes iniciar sesión para ver tus avisos/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '#inicio-sesion');
});
