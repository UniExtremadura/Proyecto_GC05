// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SearchFindingsPage } from './SearchFindingsPage.jsx';
import * as api from './api/hallazgos.js';
import * as solicitudesApi from './api/solicitudes.js';

vi.mock('./api/hallazgos.js', () => ({
  getHallazgoOptions: vi.fn(),
  searchHallazgos: vi.fn(),
}));

vi.mock('./api/solicitudes.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createSolicitud: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const options = {
  facultades: [
    {
      id: 'fac-1',
      nombre: 'Facultad Ficticia A',
    },
    {
      id: 'fac-2',
      nombre: 'Facultad Ficticia B',
    },
  ],
  categorias: [
    {
      id: 'cat-1',
      nombre: 'Electrónica',
    },
    {
      id: 'cat-2',
      nombre: 'Ropa',
    },
  ],
};

const hallazgo = {
  id: 'hall-1',
  categoria: {
    id: 'cat-1',
    nombre: 'Electrónica',
  },
  facultad: {
    id: 'fac-1',
    nombre: 'Facultad Ficticia A',
  },
  descripcion: 'Mochila azul ficticia',
  fechaHallazgo: '2026-01-15',
  ubicacion: {
    latitud: 39.479,
    longitud: -6.342,
    puntoEntrega: 'Conserjería ficticia',
  },
  estado: 'Activo',
  publicadoEn: '2026-01-15T10:00:00.000Z',
  imagenes: [
    '/api/hallazgos/hall-1/imagenes/1',
  ],
};

function pageResult(overrides = {}) {
  return {
    hallazgos: [hallazgo],
    paginacion: {
      pagina: 1,
      tamano: 12,
      total: 1,
      totalPaginas: 1,
      anterior: null,
      siguiente: null,
      corte: '2026-01-15T10:00:00.000Z',
    },
    ...overrides,
  };
}

function renderPage() {
  api.getHallazgoOptions.mockResolvedValue(options);
  api.searchHallazgos.mockResolvedValue(pageResult());

  render(<SearchFindingsPage />);
}

it('carga las opciones y muestra los hallazgos', async () => {
  renderPage();

  expect(
    await screen.findByRole('heading', {
      name: 'Mochila azul ficticia',
    }),
  ).toBeTruthy();

  expect(api.getHallazgoOptions).toHaveBeenCalledTimes(1);

  expect(api.searchHallazgos).toHaveBeenCalledWith({
    q: '',
    categoriaId: '',
    facultadId: '',
    fechaDesde: '',
    fechaHasta: '',
    pagina: 1,
    tamano: 12,
  });

  expect(
    screen.getByText('Categoría:').parentElement.textContent,
  ).toContain('Electrónica');

  expect(
    screen.getByText('Facultad:').parentElement.textContent,
  ).toContain('Facultad Ficticia A');

  expect(
    screen.getByText('Activo'),
  ).toBeTruthy();

  expect(
    screen.getByText('15/01/2026'),
  ).toBeTruthy();
});

it('muestra las facultades y categorías recibidas de la API', async () => {
  renderPage();

  await screen.findByRole('heading', {
    name: 'Mochila azul ficticia',
  });

  expect(
    screen.getByRole('option', {
      name: 'Facultad Ficticia A',
    }),
  ).toBeTruthy();

  expect(
    screen.getByRole('option', {
      name: 'Facultad Ficticia B',
    }),
  ).toBeTruthy();

  expect(
    screen.getByRole('option', {
      name: 'Electrónica',
    }),
  ).toBeTruthy();

  expect(
    screen.getByRole('option', {
      name: 'Ropa',
    }),
  ).toBeTruthy();
});

it('envía los filtros seleccionados al buscar', async () => {
  renderPage();

  await screen.findByRole('heading', {
    name: 'Mochila azul ficticia',
  });

  fireEvent.change(
    screen.getByLabelText('Descripción'),
    {
      target: {
        value: 'mochila azul',
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Facultad'),
    {
      target: {
        value: 'fac-1',
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Categoría'),
    {
      target: {
        value: 'cat-1',
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Desde'),
    {
      target: {
        value: '2026-01-01',
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText('Hasta'),
    {
      target: {
        value: '2026-01-31',
      },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Buscar',
    }),
  );

  await waitFor(() => {
    expect(api.searchHallazgos).toHaveBeenLastCalledWith({
      q: 'mochila azul',
      categoriaId: 'cat-1',
      facultadId: 'fac-1',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31',
      pagina: 1,
      tamano: 12,
    });
  });
});

it('una nueva búsqueda comienza sin corte', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);

  api.searchHallazgos
    .mockResolvedValueOnce(
      pageResult({
        paginacion: {
          pagina: 1,
          tamano: 12,
          total: 25,
          totalPaginas: 3,
          anterior: null,
          siguiente: 2,
          corte: 'corte-fijo',
        },
      }),
    )
    .mockResolvedValueOnce(
      pageResult(),
    );

  render(<SearchFindingsPage />);

  await screen.findByRole('heading', {
    name: 'Mochila azul ficticia',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Buscar',
    }),
  );

  await waitFor(() => {
    expect(api.searchHallazgos).toHaveBeenLastCalledWith({
      q: '',
      categoriaId: '',
      facultadId: '',
      fechaDesde: '',
      fechaHasta: '',
      pagina: 1,
      tamano: 12,
    });
  });
});

it('mantiene el corte al cambiar de página', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);

  api.searchHallazgos
    .mockResolvedValueOnce(
      pageResult({
        paginacion: {
          pagina: 1,
          tamano: 12,
          total: 25,
          totalPaginas: 3,
          anterior: null,
          siguiente: 2,
          corte: 'corte-fijo',
        },
      }),
    )
    .mockResolvedValueOnce(
      pageResult({
        paginacion: {
          pagina: 2,
          tamano: 12,
          total: 25,
          totalPaginas: 3,
          anterior: 1,
          siguiente: 3,
          corte: 'corte-fijo',
        },
      }),
    );

  render(<SearchFindingsPage />);

  await screen.findByRole('heading', {
    name: 'Mochila azul ficticia',
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Página siguiente',
    }),
  );

  await waitFor(() => {
    expect(api.searchHallazgos).toHaveBeenLastCalledWith({
      q: '',
      categoriaId: '',
      facultadId: '',
      fechaDesde: '',
      fechaHasta: '',
      pagina: 2,
      tamano: 12,
      corte: 'corte-fijo',
    });
  });
});

it('desactiva la página anterior cuando estamos en la primera página', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);

  api.searchHallazgos.mockResolvedValue(
    pageResult({
      paginacion: {
        pagina: 1,
        tamano: 12,
        total: 25,
        totalPaginas: 3,
        anterior: null,
        siguiente: 2,
        corte: 'corte-fijo',
      },
    }),
  );

  render(<SearchFindingsPage />);

  await screen.findByRole('heading', {
    name: 'Mochila azul ficticia',
  });

  expect(
    screen.getByRole('button', {
      name: 'Página anterior',
    }).disabled,
  ).toBe(true);

  expect(
    screen.getByRole('button', {
      name: 'Página siguiente',
    }).disabled,
  ).toBe(false);
});

it('muestra el mensaje cuando no existen resultados', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);

  api.searchHallazgos.mockResolvedValue({
    hallazgos: [],
    message:
      'No hay hallazgos activos que coincidan con la búsqueda.',
    paginacion: {
      pagina: 1,
      tamano: 12,
      total: 0,
      totalPaginas: 0,
      anterior: null,
      siguiente: null,
      corte: null,
    },
  });

  render(<SearchFindingsPage />);

  expect(
    await screen.findByText(
      'No hay hallazgos activos que coincidan con la búsqueda.',
    ),
  ).toBeTruthy();
});

it('muestra el error cuando la página solicitada no existe', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);

  api.searchHallazgos.mockRejectedValue({
    status: 404,
    message: 'La página solicitada no existe.',
  });

  render(<SearchFindingsPage />);

  const alert = await screen.findByRole('alert');

  expect(alert.textContent).toContain(
    'La página solicitada no existe.',
  );
});

it('no muestra información privada del autor ni los rasgos privados', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);

  api.searchHallazgos.mockResolvedValue({
    ...pageResult(),
    hallazgos: [
      {
        ...hallazgo,
        autor: {
          id: 'autor-secreto',
          email: 'persona@example.com',
        },
        rasgosPrivados: 'Rasgo privado secreto',
      },
    ],
  });

  render(<SearchFindingsPage />);

  await screen.findByRole('heading', {
    name: 'Mochila azul ficticia',
  });

  expect(
    screen.queryByText('persona@example.com'),
  ).toBeNull();

  expect(
    screen.queryByText('Rasgo privado secreto'),
  ).toBeNull();
});

// SCRUM-127 / US-018: iniciar la solicitud de recuperación desde los resultados.

it('AC-01: abre el formulario de solicitud del hallazgo elegido y lo cierra al cancelar', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', {
    name: 'Solicitar la recuperación de: Mochila azul ficticia',
  }));

  const formulario = screen.getByRole('region', { name: 'Solicitar la recuperación' });
  expect(formulario.textContent).toContain('Mochila azul ficticia');
  expect(screen.getByLabelText('Justificación de propiedad')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

  expect(screen.queryByRole('region', { name: 'Solicitar la recuperación' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Mochila azul ficticia' })).toBeTruthy();
});

it('AC-01: no ofrece la solicitud si el hallazgo no está Activo', async () => {
  api.getHallazgoOptions.mockResolvedValue(options);
  api.searchHallazgos.mockResolvedValue(pageResult({
    hallazgos: [{ ...hallazgo, estado: 'Devuelto' }],
  }));

  render(<SearchFindingsPage />);

  await screen.findByRole('heading', { name: 'Mochila azul ficticia' });
  expect(screen.queryByRole('button', { name: /Solicitar la recuperación/ })).toBeNull();
});

it('AC-07: tras enviar la solicitud, el hallazgo sigue en los resultados', async () => {
  solicitudesApi.createSolicitud.mockResolvedValue({
    solicitud: { id: 's-1', hallazgoId: 'hall-1', estado: 'Pendiente', creadaEn: '2026-11-22T10:00:00.000Z' },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('button', {
    name: 'Solicitar la recuperación de: Mochila azul ficticia',
  }));
  fireEvent.change(screen.getByLabelText('Justificación de propiedad'), { target: { value: 'Es mía' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

  expect(await screen.findByText(/Solicitud enviada/)).toBeTruthy();
  expect(solicitudesApi.createSolicitud).toHaveBeenCalledWith('hall-1', 'Es mía');
  expect(screen.getByRole('heading', { name: 'Mochila azul ficticia' })).toBeTruthy();
  expect(api.searchHallazgos).toHaveBeenCalledTimes(1);
});