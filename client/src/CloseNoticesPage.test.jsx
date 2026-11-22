// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { CloseNoticesPage } from './CloseNoticesPage.jsx';
import { closeAviso, getAvisosParaCerrar } from './api/avisos.js';

vi.mock('./api/avisos.js', () => ({
  closeAviso: vi.fn(),
  getAvisosParaCerrar: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  getAvisosParaCerrar.mockResolvedValue({ avisos: [
    { id: '1', descripcion: 'Mochila', estado: 'Activo', fechaPerdida: '2026-11-12' },
  ] });
});

it('cierra un aviso desde su detalle, muestra el historial y retira el botón', async () => {
  const user = userEvent.setup();
  closeAviso.mockResolvedValue({ aviso: {
    id: '1', estado: 'Cerrado', cerradoEn: '2026-11-21T10:00:00Z', motivoCierre: 'Objeto recuperado',
  } });
  render(<CloseNoticesPage />);
  await user.click(await screen.findByText('Mochila · Activo'));
  const button = screen.getByRole('button', { name: 'Cerrar aviso' });
  expect(button.disabled).toBe(true);
  await user.type(screen.getByLabelText('Motivo del cierre'), 'Objeto recuperado');
  await user.click(button);
  expect(closeAviso).toHaveBeenCalledWith('1', 'Objeto recuperado');
  expect(await screen.findByText('Mochila · Cerrado')).toBeTruthy();
  expect(screen.getByText(/Motivo: Objeto recuperado/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cerrar aviso' })).toBeNull();
});

it('conserva el motivo y muestra el error si el servidor rechaza el cierre', async () => {
  const user = userEvent.setup();
  closeAviso.mockRejectedValue(new Error('El aviso ya está cerrado.'));
  render(<CloseNoticesPage />);
  await user.click(await screen.findByText('Mochila · Activo'));
  const motivo = screen.getByLabelText('Motivo del cierre');
  await user.type(motivo, 'Búsqueda cancelada');
  await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
  expect((await screen.findByRole('alert')).textContent).toBe('El aviso ya está cerrado.');
  expect(motivo.value).toBe('Búsqueda cancelada');
});
