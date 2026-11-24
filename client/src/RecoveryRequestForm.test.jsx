// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RecoveryRequestForm } from './RecoveryRequestForm.jsx';
import * as api from './api/solicitudes.js';

vi.mock('./api/solicitudes.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createSolicitud: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// SCRUM-127 / US-018: formulario de solicitud de recuperación. Datos ficticios (R-03).
const hallazgo = {
  id: 'hall-1',
  categoria: { id: 'cat-1', nombre: 'Electrónica' },
  facultad: { id: 'fac-1', nombre: 'Facultad Ficticia A' },
  descripcion: 'Mochila azul ficticia',
  fechaHallazgo: '2026-01-15',
  estado: 'Activo',
};

function setup() {
  const onClose = vi.fn();
  render(<RecoveryRequestForm hallazgo={hallazgo} onClose={onClose} />);
  return { onClose };
}

const escribir = text => fireEvent.change(screen.getByLabelText('Justificación de propiedad'), { target: { value: text } });
const enviar = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

it('AC-02: identifica el hallazgo seleccionado', () => {
  setup();

  const datos = screen.getByLabelText('Hallazgo seleccionado');
  expect(datos).toHaveTextContent('Mochila azul ficticia');
  expect(datos).toHaveTextContent('Electrónica');
  expect(datos).toHaveTextContent('Facultad Ficticia A');
  expect(datos).toHaveTextContent('15/01/2026');
  expect(screen.getByRole('heading', { name: 'Solicitar la recuperación' })).toHaveFocus();
});

it('AC-03: explica que la justificación es privada', () => {
  setup();

  expect(screen.getByLabelText('Justificación de propiedad')).toHaveAccessibleDescription(
    /Solo la verás tú y el Conserje de la facultad del hallazgo; no se publica\./,
  );
});

it('AC-05: envía la justificación y muestra la solicitud Pendiente', async () => {
  api.createSolicitud.mockResolvedValue({
    solicitud: { id: 's-1', hallazgoId: 'hall-1', estado: 'Pendiente', creadaEn: '2026-11-22T10:00:00.000Z' },
  });
  const { onClose } = setup();

  escribir('  Lleva un llavero con mis iniciales  ');
  enviar();

  expect(await screen.findByText(/Solicitud enviada/)).toHaveTextContent('Solicitud enviada. Estado: Pendiente.');
  expect(api.createSolicitud).toHaveBeenCalledWith('hall-1', 'Lleva un llavero con mis iniciales');
  expect(screen.queryByLabelText('Justificación de propiedad')).toBeNull();
  expect(screen.getByText(/El hallazgo sigue publicado/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Volver a los resultados' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([
  ['vacía', '   ', 'Explica por qué el objeto es tuyo.'],
  ['demasiado larga', 'a'.repeat(2001), 'No puede superar los 2000 caracteres.'],
])('AC-04: no envía una justificación %s', async (_, text, expected) => {
  setup();

  escribir(text);
  enviar();

  expect(await screen.findByText(expected)).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Revisa los datos de la solicitud.');
  expect(screen.getByLabelText('Justificación de propiedad')).toHaveAttribute('aria-invalid', 'true');
  expect(api.createSolicitud).not.toHaveBeenCalled();
});

it('acepta exactamente 2000 caracteres y muestra el contador', async () => {
  api.createSolicitud.mockResolvedValue({ solicitud: { id: 's-1', estado: 'Pendiente' } });
  setup();

  escribir('a'.repeat(2000));
  expect(screen.getByText('2000 / 2000 caracteres')).toBeInTheDocument();
  enviar();

  await waitFor(() => expect(api.createSolicitud).toHaveBeenCalledTimes(1));
});

it('AC-06/AC-08: muestra el motivo del rechazo y permite corregir', async () => {
  api.createSolicitud.mockRejectedValue(Object.assign(new Error('Ya tienes una solicitud pendiente para este hallazgo.'), { status: 409, errors: {} }));
  setup();

  escribir('Es mía');
  enviar();

  expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes una solicitud pendiente para este hallazgo.');
  expect(screen.getByLabelText('Justificación de propiedad')).toHaveValue('Es mía');
  expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeEnabled();
});

it('muestra el error del servidor junto al campo', async () => {
  api.createSolicitud.mockRejectedValue(Object.assign(new Error('Revisa los datos de la solicitud.'), {
    status: 400, errors: { justificacion: 'Introduce un texto válido de entre 1 y 2000 caracteres.' },
  }));
  setup();

  escribir('x');
  enviar();

  expect(await screen.findByText('Introduce un texto válido de entre 1 y 2000 caracteres.')).toBeInTheDocument();
});

it('con la sesión caducada ofrece volver a iniciar sesión', async () => {
  api.createSolicitud.mockRejectedValue(Object.assign(new Error('Tu sesión ha caducado. Inicia sesión de nuevo.'), { status: 401, errors: {} }));
  setup();

  escribir('Es mía');
  enviar();

  expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '#inicio-sesion');
});

it('no envía dos veces mientras espera la respuesta', async () => {
  let resolve;
  api.createSolicitud.mockImplementation(() => new Promise(done => { resolve = done; }));
  setup();

  escribir('Es mía');
  // Dos envíos seguidos del formulario (doble clic o Intro repetido) solo crean una petición.
  const form = screen.getByLabelText('Justificación de propiedad').closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(api.createSolicitud).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
  resolve({ solicitud: { id: 's-1', estado: 'Pendiente' } });
  expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument();
});

it('cancelar cierra el formulario sin enviar nada', () => {
  const { onClose } = setup();

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(api.createSolicitud).not.toHaveBeenCalled();
});
