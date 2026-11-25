// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedAvisosPage } from './FeedAvisosPage.jsx';
import * as api from './api/avisos.js';

vi.mock('./api/avisos.js', () => ({
  getAvisos: vi.fn(),
  getAvisoOptions: vi.fn(),
}));

const SIN_FILTROS = { q: '', categoriaId: '', facultadId: '', centroId: '' };

beforeEach(() => {
  api.getAvisoOptions.mockResolvedValue({ categorias: [], facultades: [], centros: [] });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const aviso = {
  id: 'aviso-1',
  categoria: {
    id: 'cat-1',
    nombre: 'Electrónica',
  },
  facultad: {
    id: 'fac-1',
    nombre: 'Facultad ficticia',
  },
  centro: {
    id: 'centro-1',
    nombre: 'Centro ficticio',
  },
  descripcion: 'Mochila azul perdida',
  fechaPerdida: '2026-01-15',
  estado: 'Activo',
};

function pageResult(overrides = {}) {
  return {
    avisos: [aviso],
    paginacion: {
      pagina: 1,
      tamano: 12,
      total: 1,
      totalPaginas: 1,
      anterior: false,
      siguiente: false,
    },
    ...overrides,
  };
}

// SCRUM-57 / US-014: pruebas de la pantalla del feed.

it('consulta y muestra los avisos activos al abrir el feed', async () => {
  api.getAvisos.mockResolvedValue(pageResult());

  render(<FeedAvisosPage />);

  expect(
    await screen.findByRole('heading', {
      name: 'Mochila azul perdida',
    }),
  ).toBeTruthy();

  expect(api.getAvisos).toHaveBeenCalledWith(1, 12, SIN_FILTROS);

  expect(screen.getByText('Electrónica')).toBeTruthy();
  expect(screen.getByText('Facultad ficticia')).toBeTruthy();
  expect(screen.getByText('Centro ficticio')).toBeTruthy();
  expect(screen.getByText('15/01/2026')).toBeTruthy();
  expect(screen.getByText('Activo')).toBeTruthy();
});

it('muestra correctamente los avisos que no tienen centro', async () => {
  api.getAvisos.mockResolvedValue(pageResult({
    avisos: [{ ...aviso, centro: null }],
  }));

  render(<FeedAvisosPage />);

  await screen.findByRole('heading', {
    name: 'Mochila azul perdida',
  });

  expect(screen.getByText('Facultad ficticia')).toBeTruthy();
  expect(screen.queryByText('Centro:')).toBeNull();
});

it('muestra el indicador de carga mientras consulta la API', () => {
  api.getAvisos.mockImplementation(
    () => new Promise(() => {}),
  );

  render(<FeedAvisosPage />);

  expect(screen.getByRole('status').textContent).toContain(
    'Cargando avisos...',
  );
});

it('permite avanzar y retroceder entre páginas', async () => {
  const firstPage = pageResult({
    paginacion: {
      pagina: 1,
      tamano: 12,
      total: 13,
      totalPaginas: 2,
      anterior: false,
      siguiente: true,
    },
  });

  const secondPage = pageResult({
    avisos: [{
      ...aviso,
      id: 'aviso-2',
      descripcion: 'Cartera negra perdida',
    }],
    paginacion: {
      pagina: 2,
      tamano: 12,
      total: 13,
      totalPaginas: 2,
      anterior: true,
      siguiente: false,
    },
  });

  api.getAvisos
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce(secondPage)
    .mockResolvedValueOnce(firstPage);

  render(<FeedAvisosPage />);

  await screen.findByText('Página 1 de 2');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Página siguiente',
    }),
  );

  await screen.findByText('Página 2 de 2');

  expect(api.getAvisos).toHaveBeenLastCalledWith(2, 12, SIN_FILTROS);
  expect(screen.getByText('Cartera negra perdida')).toBeTruthy();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Página anterior',
    }),
  );

  await screen.findByText('Página 1 de 2');

  expect(api.getAvisos).toHaveBeenLastCalledWith(1, 12, SIN_FILTROS);
  expect(screen.getByText('Mochila azul perdida')).toBeTruthy();
});

it('desactiva los botones cuando no hay más páginas', async () => {
  api.getAvisos.mockResolvedValue(pageResult());

  render(<FeedAvisosPage />);

  await screen.findByText('Página 1 de 1');

  expect(
    screen.getByRole('button', {
      name: 'Página anterior',
    }).disabled,
  ).toBe(true);

  expect(
    screen.getByRole('button', {
      name: 'Página siguiente',
    }).disabled,
  ).toBe(true);
});

it('informa cuando no existen avisos activos', async () => {
  api.getAvisos.mockResolvedValue({
    avisos: [],
    message: 'Todavía no hay avisos de pérdida activos.',
    paginacion: {
      pagina: 1,
      tamano: 12,
      total: 0,
      totalPaginas: 0,
      anterior: false,
      siguiente: false,
    },
  });

  render(<FeedAvisosPage />);

  expect(
    await screen.findByText(
      'Todavía no hay avisos de pérdida activos.',
    ),
  ).toBeTruthy();
});

it('informa cuando la página solicitada no existe', async () => {
  api.getAvisos.mockRejectedValue({
    status: 404,
  });

  render(<FeedAvisosPage />);

  const alert = await screen.findByRole('alert');

  expect(alert.textContent).toContain(
    'La página solicitada no existe.',
  );
});

it('permite volver a la primera página tras un error de paginación', async () => {
  const firstPage = pageResult({
    paginacion: {
      pagina: 1,
      tamano: 12,
      total: 13,
      totalPaginas: 2,
      anterior: false,
      siguiente: true,
    },
  });

  api.getAvisos
    .mockResolvedValueOnce(firstPage)
    .mockRejectedValueOnce({ status: 404 })
    .mockResolvedValueOnce(pageResult());

  render(<FeedAvisosPage />);

  await screen.findByText('Página 1 de 2');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Página siguiente',
    }),
  );

  await screen.findByRole('alert');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Volver a la primera página',
    }),
  );

  await screen.findByText('Página 1 de 1');

  expect(api.getAvisos).toHaveBeenLastCalledWith(1, 12, SIN_FILTROS);
});

it('informa cuando la sesión ha caducado', async () => {
  api.getAvisos.mockRejectedValue({
    status: 401,
  });

  render(<FeedAvisosPage />);

  const alert = await screen.findByRole('alert');

  expect(alert.textContent).toContain(
    'Tu sesión ha caducado. Inicia sesión de nuevo.',
  );
});

it('no muestra los datos privados ni la información del autor', async () => {
  api.getAvisos.mockResolvedValue(pageResult({
    avisos: [{
      ...aviso,
      autorId: 'autor-secreto',
      autor: {
        email: 'autor@example.com',
      },
      rasgosPrivados: 'Rasgo privado secreto',
      contactoEmail: 'privado@example.com',
      contactoTelefono: '600000000',
    }],
  }));

  const { container } = render(<FeedAvisosPage />);

  await screen.findByRole('heading', {
    name: 'Mochila azul perdida',
  });

  expect(container.textContent).not.toContain('autor-secreto');
  expect(container.textContent).not.toContain('autor@example.com');
  expect(container.textContent).not.toContain('Rasgo privado secreto');
  expect(container.textContent).not.toContain('privado@example.com');
  expect(container.textContent).not.toContain('600000000');
});

// SCRUM-119 / US-015: búsqueda y filtros del feed.

const opciones = {
  categorias: [{ id: 'cat-1', nombre: 'Electrónica' }, { id: 'cat-2', nombre: 'Llaves' }],
  facultades: [{ id: 'fac-1', nombre: 'Facultad ficticia' }, { id: 'fac-2', nombre: 'Otra facultad' }],
  centros: [
    { id: 'centro-1', nombre: 'Centro ficticio', facultadId: 'fac-1' },
    { id: 'centro-2', nombre: 'Centro de otra facultad', facultadId: 'fac-2' },
  ],
};

async function renderConFiltros() {
  api.getAvisoOptions.mockResolvedValue(opciones);
  api.getAvisos.mockResolvedValue(pageResult());
  render(<FeedAvisosPage />);
  await screen.findByRole('heading', { name: 'Mochila azul perdida' });
  await screen.findByRole('option', { name: 'Llaves' });
}

const select = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it('AC-01/AC-02/AC-04: busca combinando texto, categoría, facultad y centro desde la primera página', async () => {
  await renderConFiltros();

  fireEvent.change(screen.getByLabelText('Texto'), { target: { value: '  mochila   azul ' } });
  select('Categoría', 'cat-1');
  select('Facultad', 'fac-1');
  select('Centro', 'centro-1');
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  await waitFor(() => expect(api.getAvisos).toHaveBeenLastCalledWith(1, 12, {
    q: 'mochila azul', categoriaId: 'cat-1', facultadId: 'fac-1', centroId: 'centro-1',
  }));
});

it('solo ofrece los centros de la facultad elegida y descarta un centro que ya no corresponde', async () => {
  await renderConFiltros();

  select('Centro', 'centro-2');
  select('Facultad', 'fac-1');

  const centro = screen.getByLabelText('Centro');
  expect(centro.value).toBe('');
  expect([...centro.options].map(option => option.textContent)).toEqual(['Todos los centros', 'Centro ficticio']);
});

it('AC-05: informa cuando la búsqueda no tiene coincidencias', async () => {
  await renderConFiltros();
  api.getAvisos.mockResolvedValueOnce({
    avisos: [],
    message: 'No hay avisos activos que coincidan con la búsqueda.',
    paginacion: { pagina: 1, tamano: 12, total: 0, totalPaginas: 0, anterior: false, siguiente: false },
  });

  fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'paraguas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  expect(await screen.findByRole('heading', { name: 'Sin coincidencias' })).toBeTruthy();
  expect(screen.getByText('No hay avisos activos que coincidan con la búsqueda.')).toBeTruthy();
});

it('limpiar los filtros vuelve al feed completo', async () => {
  await renderConFiltros();
  const limpiar = screen.getByRole('button', { name: 'Limpiar filtros' });
  expect(limpiar.disabled).toBe(true);

  select('Categoría', 'cat-2');
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  await waitFor(() => expect(api.getAvisos).toHaveBeenLastCalledWith(1, 12, { ...SIN_FILTROS, categoriaId: 'cat-2' }));

  fireEvent.click(limpiar);

  await waitFor(() => expect(api.getAvisos).toHaveBeenLastCalledWith(1, 12, SIN_FILTROS));
  expect(screen.getByLabelText('Categoría').value).toBe('');
});

it('si no cargan las opciones, avisa y permite buscar por texto', async () => {
  api.getAvisoOptions.mockRejectedValue({ status: 503 });
  api.getAvisos.mockResolvedValue(pageResult());
  render(<FeedAvisosPage />);

  expect(await screen.findByText(/Puedes buscar por texto/)).toBeTruthy();
  expect(screen.queryByLabelText('Centro')).toBeNull();

  fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'cartera' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  await waitFor(() => expect(api.getAvisos).toHaveBeenLastCalledWith(1, 12, { ...SIN_FILTROS, q: 'cartera' }));
});

it('muestra el mensaje del servidor si un filtro no es válido', async () => {
  await renderConFiltros();
  api.getAvisos.mockRejectedValueOnce({ status: 400, message: 'Revisa los filtros de búsqueda.' });

  fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Revisa los filtros de búsqueda.');
});

it('AC-06: los resultados no ofrecen iniciar una solicitud de recuperación ni cambiar hallazgos', async () => {
  await renderConFiltros();

  const resultados = screen.getByRole('region', { name: 'Avisos de pérdida' });
  expect(resultados.querySelectorAll('button, a')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: /recuperaci|solicit|hallazgo/i })).toBeNull();
  expect(screen.queryByRole('link', { name: /recuperaci|solicit|hallazgo/i })).toBeNull();
});