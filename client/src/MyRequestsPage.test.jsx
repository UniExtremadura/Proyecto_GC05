// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MyRequestsPage } from './MyRequestsPage.jsx';
import * as api from './api/solicitudes.js';

vi.mock('./api/solicitudes.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getMisSolicitudes: vi.fn(),
  getMiSolicitud: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// SCRUM-130 / US-019: pantalla de mis solicitudes. Datos ficticios (R-03).
const base = {
  hallazgoId: 'hall-1',
  creadaEn: '2026-11-22T10:00:00.000Z',
  fechaHallazgo: '2026-01-15',
  facultad: 'Facultad Ficticia A',
  categoria: 'Electrónica',
  motivoRechazo: null,
  instruccionesRecogida: null,
};
const PENDIENTE = { ...base, id: 's-1', estado: 'Pendiente', hallazgoDescripcion: 'Mochila azul ficticia' };
const VALIDADA = { ...base, id: 's-2', estado: 'Validada', hallazgoDescripcion: 'Paraguas ficticio', instruccionesRecogida: 'Pasa por conserjería de 9:00 a 14:00 con tu TUI.' };
const RECHAZADA = { ...base, id: 's-3', estado: 'Rechazada', hallazgoDescripcion: 'Llaves ficticias', motivoRechazo: 'La descripción no coincide con el objeto.' };

const verDetalle = descripcion => fireEvent.click(screen.getByRole('button', { name: `Ver la solicitud de: ${descripcion}` }));

it('AC-01: lista las solicitudes con el hallazgo, la fecha de envío y el estado', async () => {
  api.getMisSolicitudes.mockResolvedValue({ solicitudes: [PENDIENTE, VALIDADA, RECHAZADA] });
  render(<MyRequestsPage />);

  const lista = await screen.findByRole('list', { name: 'Tus solicitudes de recuperación' });
  const items = within(lista).getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent('Mochila azul ficticia');
  expect(items[0]).toHaveTextContent('Electrónica · Facultad Ficticia A · 15/01/2026');
  expect(items[0]).toHaveTextContent(/Enviada el \d{2}\/\d{2}\/\d{2,4}/);
  expect(within(items[0]).getByText('Pendiente')).toHaveClass('estado-pendiente');
  expect(within(items[1]).getByText('Validada')).toHaveClass('estado-validada');
  expect(within(items[2]).getByText('Rechazada')).toHaveClass('estado-rechazada');
});

it('AC-04: una solicitud Pendiente no muestra ninguna decisión', async () => {
  api.getMisSolicitudes.mockResolvedValue({ solicitudes: [PENDIENTE] });
  api.getMiSolicitud.mockResolvedValue({ solicitud: { ...PENDIENTE, justificacion: 'Tiene mis iniciales' } });
  render(<MyRequestsPage />);

  await screen.findByText('Mochila azul ficticia');
  verDetalle('Mochila azul ficticia');

  const titulo = await screen.findByRole('heading', { name: 'Mochila azul ficticia' });
  await waitFor(() => expect(titulo).toHaveFocus());
  expect(api.getMiSolicitud).toHaveBeenCalledWith('s-1');
  expect(screen.getByLabelText('Datos de la solicitud')).toHaveTextContent('Tiene mis iniciales');
  expect(screen.getByText(/todavía no ha revisado tu solicitud/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Motivo del rechazo' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Instrucciones de recogida' })).toBeNull();
});

it.each([
  [VALIDADA, 'Instrucciones de recogida', 'Pasa por conserjería de 9:00 a 14:00 con tu TUI.'],
  [RECHAZADA, 'Motivo del rechazo', 'La descripción no coincide con el objeto.'],
])('AC-02: muestra la decisión registrada ($estado)', async (solicitud, titulo, texto) => {
  api.getMisSolicitudes.mockResolvedValue({ solicitudes: [solicitud] });
  api.getMiSolicitud.mockResolvedValue({ solicitud: { ...solicitud, justificacion: 'Es mío' } });
  render(<MyRequestsPage />);

  await screen.findByText(solicitud.hallazgoDescripcion);
  verDetalle(solicitud.hallazgoDescripcion);

  expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
  expect(screen.getByText(texto)).toBeInTheDocument();
});

it('AC-06: la consulta es de solo lectura', async () => {
  api.getMisSolicitudes.mockResolvedValue({ solicitudes: [RECHAZADA] });
  api.getMiSolicitud.mockResolvedValue({ solicitud: { ...RECHAZADA, justificacion: 'Es mío' } });
  render(<MyRequestsPage />);

  await screen.findByText(RECHAZADA.hallazgoDescripcion);
  verDetalle(RECHAZADA.hallazgoDescripcion);
  await screen.findByRole('heading', { name: 'Motivo del rechazo' });

  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['← Volver a mis solicitudes']);

  fireEvent.click(screen.getByRole('button', { name: '← Volver a mis solicitudes' }));
  expect(screen.getByRole('list', { name: 'Tus solicitudes de recuperación' })).toBeInTheDocument();
});

it('AC-05: avisa cuando no hay solicitudes', async () => {
  api.getMisSolicitudes.mockResolvedValue({ solicitudes: [] });
  render(<MyRequestsPage />);

  expect(await screen.findByText(/Todavía no has enviado ninguna solicitud/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Buscar hallazgos' })).toHaveAttribute('href', '#buscar-hallazgos');
});

it('AC-03/AC-05: avisa cuando la solicitud no existe o no es propia', async () => {
  api.getMisSolicitudes.mockResolvedValue({ solicitudes: [PENDIENTE] });
  api.getMiSolicitud.mockRejectedValue(Object.assign(new Error('La solicitud no existe o no es tuya.'), { status: 404 }));
  render(<MyRequestsPage />);

  await screen.findByText(PENDIENTE.hallazgoDescripcion);
  verDetalle(PENDIENTE.hallazgoDescripcion);

  expect(await screen.findByRole('alert')).toHaveTextContent('La solicitud no existe o no es tuya.');
});

it('con la sesión caducada ofrece volver a iniciar sesión', async () => {
  api.getMisSolicitudes.mockRejectedValue(Object.assign(new Error('Tu sesión ha caducado. Inicia sesión de nuevo.'), { status: 401 }));
  render(<MyRequestsPage />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión ha caducado.');
  expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '#inicio-sesion');
});
