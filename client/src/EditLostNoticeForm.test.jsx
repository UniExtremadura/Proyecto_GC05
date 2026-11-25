// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { EditLostNoticeForm } from './EditLostNoticeForm.jsx';

// SCRUM-60 / US-016. Solo datos ficticios.
afterEach(cleanup);

const CATEGORIA = '11111111-1111-4111-8111-111111111111';
const OTRA_CATEGORIA = '66666666-6666-4666-8666-666666666666';
const FACULTAD = '22222222-2222-4222-8222-222222222222';
const OTRA_FACULTAD = '33333333-3333-4333-8333-333333333333';
const CENTRO = '44444444-4444-4444-8444-444444444444';
const OTRO_CENTRO = '55555555-5555-4555-8555-555555555555';
const OPTIONS = {
  categorias: [{ id: CATEGORIA, nombre: 'Mochilas y bolsos' }, { id: OTRA_CATEGORIA, nombre: 'Llaves' }],
  facultades: [{ id: FACULTAD, nombre: 'Facultad Ficticia' }, { id: OTRA_FACULTAD, nombre: 'Otra Facultad Ficticia' }],
  centros: [
    { id: CENTRO, nombre: 'Biblioteca Ficticia', facultadId: FACULTAD },
    { id: OTRO_CENTRO, nombre: 'Aulario Ficticio', facultadId: OTRA_FACULTAD },
  ],
};
const AVISO = {
  id: '77777777-7777-4777-8777-777777777777',
  categoriaId: CATEGORIA, facultadId: FACULTAD, centroId: CENTRO,
  descripcion: 'Mochila azul ficticia', fechaPerdida: '2026-01-15',
  rasgosPrivados: null, contactoEmail: 'contacto@example.com', contactoTelefono: null,
  estado: 'Activo',
};
const DATOS_GUARDADOS = {
  categoriaId: CATEGORIA, facultadId: FACULTAD, centroId: CENTRO, descripcion: 'Mochila azul ficticia',
  fechaPerdida: '2026-01-15', rasgosPrivados: null, contactoEmail: 'contacto@example.com', contactoTelefono: null,
};

function setup(onSubmit = vi.fn().mockResolvedValue({ message: 'Aviso actualizado correctamente.' }), aviso = AVISO) {
  const user = userEvent.setup();
  render(<EditLostNoticeForm aviso={aviso} options={OPTIONS} onSubmit={onSubmit} />);
  return { user, onSubmit };
}

const save = user => user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

it('precarga los datos del aviso y deja en blanco los opcionales que no tenía', () => {
  setup();
  expect(screen.getByLabelText('Categoría')).toHaveValue(CATEGORIA);
  expect(screen.getByLabelText('Descripción pública')).toHaveValue('Mochila azul ficticia');
  expect(screen.getByLabelText('Fecha aproximada de la pérdida')).toHaveValue('2026-01-15');
  expect(screen.getByLabelText('Facultad donde lo perdiste')).toHaveValue(FACULTAD);
  expect(screen.getByLabelText('Centro (opcional)')).toHaveValue(CENTRO);
  expect(screen.getByLabelText('Rasgos identificativos privados (opcional)')).toHaveValue('');
  expect(screen.getByLabelText('Correo de contacto')).toHaveValue('contacto@example.com');
  expect(screen.getByLabelText('Teléfono de contacto')).toHaveValue('');
});

it('AC-02: guarda los campos cambiados junto al resto de datos del aviso', async () => {
  const { user, onSubmit } = setup();
  await user.selectOptions(screen.getByLabelText('Categoría'), OTRA_CATEGORIA);
  await user.clear(screen.getByLabelText('Descripción pública'));
  await user.type(screen.getByLabelText('Descripción pública'), '  Mochila azul con parches  ');
  await user.type(screen.getByLabelText('Teléfono de contacto'), '600000000');
  await save(user);

  expect(await screen.findByText('Aviso actualizado correctamente.')).toBeInTheDocument();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith({
    ...DATOS_GUARDADOS, categoriaId: OTRA_CATEGORIA, descripcion: 'Mochila azul con parches', contactoTelefono: '600000000',
  });
  expect(screen.getByLabelText('Descripción pública')).toHaveValue('  Mochila azul con parches  ');
});

it('AC-04: nunca envía el autor, el estado ni el id del aviso', async () => {
  const { user, onSubmit } = setup();
  await user.type(screen.getByLabelText('Rasgos identificativos privados (opcional)'), 'Llavero ficticio');
  await save(user);
  await screen.findByText('Aviso actualizado correctamente.');
  const [enviado] = onSubmit.mock.calls[0];
  expect(enviado).not.toHaveProperty('autorId');
  expect(enviado).not.toHaveProperty('estado');
  expect(enviado).not.toHaveProperty('id');
});

it('permite borrar un dato opcional y lo envía como null', async () => {
  const { user, onSubmit } = setup();
  await user.clear(screen.getByLabelText('Correo de contacto'));
  await save(user);
  await screen.findByText('Aviso actualizado correctamente.');
  expect(onSubmit).toHaveBeenCalledWith({ ...DATOS_GUARDADOS, contactoEmail: null });
});

it('si no se ha cambiado nada, avisa y no guarda', async () => {
  const { user, onSubmit } = setup();
  await save(user);
  expect(screen.getByText('No has cambiado nada del aviso.')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('al cambiar de facultad quita el centro que ya no le corresponde', async () => {
  const { user } = setup();
  await user.selectOptions(screen.getByLabelText('Facultad donde lo perdiste'), OTRA_FACULTAD);
  expect(screen.getByLabelText('Centro (opcional)')).toHaveValue('');
  expect(screen.queryByRole('option', { name: 'Biblioteca Ficticia' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Aulario Ficticio' })).toBeInTheDocument();
});

it('AC-03: valida los datos antes de guardar y no envía un aviso incompleto', async () => {
  const { user, onSubmit } = setup();
  await user.clear(screen.getByLabelText('Descripción pública'));
  await user.selectOptions(screen.getByLabelText('Categoría'), '');
  await save(user);
  expect(screen.getByText('Revisa los datos introducidos.')).toBeInTheDocument();
  expect(screen.getByText('Selecciona una categoría.')).toBeInTheDocument();
  expect(screen.getByText('Describe el objeto que has perdido.')).toBeInTheDocument();
  expect(screen.getByLabelText('Descripción pública')).toHaveAttribute('aria-invalid', 'true');
  expect(onSubmit).not.toHaveBeenCalled();
});

it.each([
  ['fecha futura', 'Fecha aproximada de la pérdida', '2999-01-01', 'La fecha no puede ser futura.'],
  ['correo no válido', 'Correo de contacto', 'correo-no-valido', 'El formato del correo de contacto no es válido.'],
  ['teléfono no válido', 'Teléfono de contacto', '12345', 'Introduce 9 cifras, con el prefijo +34 opcional.'],
])('AC-03: rechaza %s sin guardar', async (_, label, value, expected) => {
  const { user, onSubmit } = setup();
  await user.clear(screen.getByLabelText(label));
  await user.type(screen.getByLabelText(label), value);
  await save(user);
  expect(screen.getByText(expected)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('muestra los errores que devuelve el servidor y conserva lo escrito', async () => {
  const error = Object.assign(new Error('Revisa los datos del aviso.'), { status: 400, errors: { facultadId: 'La facultad no existe o está inactiva.' } });
  const { user } = setup(vi.fn().mockRejectedValue(error));
  await user.type(screen.getByLabelText('Descripción pública'), ' grande');
  await save(user);
  expect(await screen.findByText('La facultad no existe o está inactiva.')).toBeInTheDocument();
  expect(screen.getByText('Revisa los datos del aviso.')).toBeInTheDocument();
  expect(screen.getByLabelText('Descripción pública')).toHaveValue('Mochila azul ficticia grande');
});

it('si la sesión caduca al guardar, ofrece volver a iniciar sesión', async () => {
  const error = Object.assign(new Error('Debes iniciar sesión.'), { status: 401 });
  const { user } = setup(vi.fn().mockRejectedValue(error));
  await user.type(screen.getByLabelText('Descripción pública'), ' grande');
  await save(user);
  expect(await screen.findByText(/Debes iniciar sesión/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '#inicio-sesion');
});

it('evita guardar dos veces mientras se está guardando', async () => {
  let resolve;
  const onSubmit = vi.fn(() => new Promise(done => { resolve = done; }));
  const { user } = setup(onSubmit);
  await user.type(screen.getByLabelText('Descripción pública'), ' grande');
  await save(user);
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Guardando…' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  resolve({ message: 'Aviso actualizado correctamente.' });
  expect(await screen.findByText('Aviso actualizado correctamente.')).toBeInTheDocument();
});

it('acepta la fecha con hora que pueda devolver el servidor', () => {
  setup(undefined, { ...AVISO, fechaPerdida: '2026-01-15T00:00:00.000Z' });
  expect(screen.getByLabelText('Fecha aproximada de la pérdida')).toHaveValue('2026-01-15');
});
