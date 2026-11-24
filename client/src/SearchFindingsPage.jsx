import { useEffect, useState } from 'react';
import { getHallazgoOptions, searchHallazgos } from './api/hallazgos.js';
import { RecoveryRequestForm } from './RecoveryRequestForm.jsx';

const EMPTY_FILTERS = {
  q: '',
  categoriaId: '',
  facultadId: '',
  fechaDesde: '',
  fechaHasta: '',
};

function formatDate(value) {
  if (!value) return '';

  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function getErrorMessage(error) {
  if (error?.status === 401) {
    return 'Tu sesión ha caducado. Inicia sesión de nuevo.';
  }

  if (error?.status === 404) {
    return 'La página solicitada no existe.';
  }

  if (error?.status === 429) {
    return 'Demasiadas búsquedas. Inténtalo más tarde.';
  }

  if (error?.status === 503) {
    return 'La búsqueda de hallazgos no está disponible en este momento.';
  }

  if (error?.errors && typeof error.errors === 'object') {
    const firstError = Object.values(error.errors)[0];

    if (typeof firstError === 'string') {
      return firstError;
    }
  }

  return error?.message || 'No se ha podido realizar la búsqueda.';
}

export function SearchFindingsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // SCRUM-127 / US-018: hallazgo del que se está pidiendo la recuperación.
  const [solicitando, setSolicitando] = useState(null);

  const [options, setOptions] = useState({
    facultades: [],
    categorias: [],
  });

  const [results, setResults] = useState({
    hallazgos: [],
    paginacion: null,
    message: '',
  });

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [corte, setCorte] = useState(null);

  // Cargar facultades y categorías.
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        setLoadingOptions(true);

        const data = await getHallazgoOptions();

        if (!cancelled) {
          setOptions({
            facultades: data?.facultades ?? [],
            categorias: data?.categorias ?? [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    }

    loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  // Realizar una búsqueda.
  async function loadResults(currentFilters, page, currentCorte = null) {
    setLoading(true);
    setError('');

    try {
      const data = await searchHallazgos({
        ...currentFilters,
        pagina: page,
        tamano: 12,
        ...(currentCorte ? { corte: currentCorte } : {}),
      });

      setResults({
        hallazgos: data?.hallazgos ?? [],
        paginacion: data?.paginacion ?? null,
        message: data?.message ?? '',
      });

      if (data?.paginacion?.corte) {
        setCorte(data.paginacion.corte);
      }
    } catch (err) {
      setResults({
        hallazgos: [],
        paginacion: null,
        message: '',
      });

      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Primera búsqueda al entrar en la pantalla.
  useEffect(() => {
    loadResults(EMPTY_FILTERS, 1);
  }, []);

  function handleFilterChange(event) {
    const { name, value } = event.target;

    setFilters(current => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSearch(event) {
    event.preventDefault();

    // Una búsqueda nueva empieza sin corte.
    setCorte(null);

    loadResults(filters, 1);
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS);
    setCorte(null);

    loadResults(EMPTY_FILTERS, 1);
  }

  function handlePageChange(page) {
    // Al cambiar de página mantenemos el mismo corte.
    loadResults(filters, page, corte);
  }

  return (
    <main className="home">
      <header className="home-header">
        <a className="brand" href="#app">
          Lost&Found UEx
        </a>

        <nav aria-label="Navegación">
          <a href="#app">
            Volver a portada
          </a>
        </nav>
      </header>

      <section className="hero" aria-labelledby="search-title">
        <span className="eyebrow">
          OBJETOS ENCONTRADOS · CAMPUS UEx
        </span>

        <h1 id="search-title">
          Buscar objetos encontrados
        </h1>

        <p>
          Consulta los objetos encontrados y utiliza los filtros
          para localizar el que buscas.
        </p>
      </section>

      <section className="card" aria-labelledby="filters-title">
        <h2 id="filters-title">
          Filtros de búsqueda
        </h2>

        <form onSubmit={handleSearch}>
          <label htmlFor="search-q">
            Descripción
          </label>

          <input
            id="search-q"
            name="q"
            type="search"
            value={filters.q}
            onChange={handleFilterChange}
            maxLength={100}
            placeholder="Ej.: mochila azul"
          />

          <label htmlFor="search-facultad">
            Facultad
          </label>

          <select
            id="search-facultad"
            name="facultadId"
            value={filters.facultadId}
            onChange={handleFilterChange}
            disabled={loadingOptions}
          >
            <option value="">
              Todas las facultades
            </option>

            {options.facultades.map(facultad => (
              <option
                key={facultad.id}
                value={facultad.id}
              >
                {facultad.nombre}
              </option>
            ))}
          </select>

          <label htmlFor="search-categoria">
            Categoría
          </label>

          <select
            id="search-categoria"
            name="categoriaId"
            value={filters.categoriaId}
            onChange={handleFilterChange}
            disabled={loadingOptions}
          >
            <option value="">
              Todas las categorías
            </option>

            {options.categorias.map(categoria => (
              <option
                key={categoria.id}
                value={categoria.id}
              >
                {categoria.nombre}
              </option>
            ))}
          </select>

          <label htmlFor="search-fecha-desde">
            Desde
          </label>

          <input
            id="search-fecha-desde"
            name="fechaDesde"
            type="date"
            value={filters.fechaDesde}
            onChange={handleFilterChange}
          />

          <label htmlFor="search-fecha-hasta">
            Hasta
          </label>

          <input
            id="search-fecha-hasta"
            name="fechaHasta"
            type="date"
            value={filters.fechaHasta}
            onChange={handleFilterChange}
          />

          <div className="hero-actions">
            <button type="submit">
              Buscar
            </button>

            <button
              type="button"
              onClick={handleClear}
            >
              Limpiar filtros
            </button>
          </div>
        </form>
      </section>

      {solicitando && (
        <RecoveryRequestForm
          key={solicitando.id}
          hallazgo={solicitando}
          onClose={() => setSolicitando(null)}
        />
      )}

      <section
        className="home-grid"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading && (
          <p role="status">
            Buscando hallazgos...
          </p>
        )}

        {!loading && error && (
          <p
            className="error"
            role="alert"
          >
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          results.hallazgos.length === 0 && (
            <article className="card">
              <h2>
                No hay resultados
              </h2>

              <p>
                {results.message ||
                  'No hay hallazgos activos que coincidan con la búsqueda.'}
              </p>
            </article>
          )}

        {!loading &&
          !error &&
          results.hallazgos.map(hallazgo => (
            <article
              className="card"
              key={hallazgo.id}
            >
              {hallazgo.imagenes?.length > 0 && (
                <div>
                  {hallazgo.imagenes.map((imagen, index) => (
                    <img
                      key={imagen}
                      src={imagen}
                      alt={`Imagen del hallazgo ${index + 1}`}
                      loading="lazy"
                    />
                  ))}
                </div>
              )}

              <p>
                <strong>
                  Categoría:
                </strong>{' '}
                {hallazgo.categoria?.nombre}
              </p>

              <p>
                <strong>
                  Facultad:
                </strong>{' '}
                {hallazgo.facultad?.nombre}
              </p>

              <h2>
                {hallazgo.descripcion}
              </h2>

              <p>
                <strong>
                  Fecha:
                </strong>{' '}
                {formatDate(hallazgo.fechaHallazgo)}
              </p>

              <p>
                <strong>
                  Estado:
                </strong>{' '}
                {hallazgo.estado}
              </p>

              {hallazgo.ubicacion && (
                <div>
                  <p>
                    <strong>
                      Ubicación:
                    </strong>
                  </p>

                  {hallazgo.ubicacion.puntoEntrega && (
                    <p>
                      Punto de entrega:{' '}
                      {hallazgo.ubicacion.puntoEntrega}
                    </p>
                  )}

                  <p>
                    Coordenadas aproximadas:{' '}
                    {hallazgo.ubicacion.latitud},{' '}
                    {hallazgo.ubicacion.longitud}
                  </p>
                </div>
              )}

              {/* SCRUM-127 / US-018-AC-01: solo se ofrece para hallazgos Activos. */}
              {hallazgo.estado === 'Activo' && (
                <button
                  type="button"
                  onClick={() => setSolicitando(hallazgo)}
                  aria-label={`Solicitar la recuperación de: ${hallazgo.descripcion}`}
                >
                  Solicitar recuperación
                </button>
              )}
            </article>
          ))}
      </section>

      {!loading &&
        !error &&
        results.paginacion &&
        results.paginacion.totalPaginas > 1 && (
          <nav
            aria-label="Paginación de hallazgos"
            className="hero-actions"
          >
            <button
              type="button"
              disabled={results.paginacion.anterior === null}
              onClick={() =>
                handlePageChange(
                  results.paginacion.anterior,
                )
              }
            >
              Página anterior
            </button>

            <span>
              Página {results.paginacion.pagina} de{' '}
              {results.paginacion.totalPaginas}
            </span>

            <button
              type="button"
              disabled={results.paginacion.siguiente === null}
              onClick={() =>
                handlePageChange(
                  results.paginacion.siguiente,
                )
              }
            >
              Página siguiente
            </button>
          </nav>
        )}
    </main>
  );
}