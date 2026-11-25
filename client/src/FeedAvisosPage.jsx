import { useEffect, useState } from 'react';
import { getAvisoOptions, getAvisos } from './api/avisos.js';

// SCRUM-119 / US-015: filtros vacíos = feed completo de avisos activos.
const SIN_FILTROS = { q: '', categoriaId: '', facultadId: '', centroId: '' };
const TEXTO_MAX = 100;

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

  if (error?.status === 503) {
    return 'La consulta de avisos no está disponible en este momento.';
  }

  if (error?.status === 400) {
    return error.message || 'Revisa los filtros de búsqueda.';
  }

  return error?.message || 'No se han podido consultar los avisos.';
}

// SCRUM-57 / US-014: pantalla del feed de avisos de pérdida.
export function FeedAvisosPage() {
  const [pagina, setPagina] = useState(1);
  // SCRUM-119: `form` es lo que se escribe; `filtros`, lo que se ha buscado.
  const [form, setForm] = useState(SIN_FILTROS);
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [options, setOptions] = useState({ categorias: [], facultades: [], centros: [] });
  const [optionsError, setOptionsError] = useState('');

  const [results, setResults] = useState({
    avisos: [],
    paginacion: null,
    message: '',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadAvisos() {
      setLoading(true);
      setError('');

      try {
        const data = await getAvisos(pagina, 12, filtros);

        if (!cancelled) {
          setResults({
            avisos: data?.avisos ?? [],
            paginacion: data?.paginacion ?? null,
            message: data?.message ?? '',
          });
        }
      } catch (err) {
        if (!cancelled) {
          setResults({
            avisos: [],
            paginacion: null,
            message: '',
          });

          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // loadAvisos captura sus propios errores; la promesa se ignora a propósito.
    void loadAvisos();

    return () => {
      cancelled = true;
    };
  }, [pagina, filtros]);

  // SCRUM-119: catálogos para los filtros. Si fallan, se puede seguir buscando por texto.
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const data = await getAvisoOptions();
        if (!cancelled) {
          setOptions({
            categorias: data?.categorias ?? [],
            facultades: data?.facultades ?? [],
            centros: data?.centros ?? [],
          });
        }
      } catch {
        if (!cancelled) {
          setOptionsError('No se han podido cargar las categorías, facultades y centros. Puedes buscar por texto.');
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const hayFiltros = Object.values(filtros).some(Boolean);
  const hayBorrador = Object.values(form).some(value => value.trim() !== '');
  const centros = form.facultadId
    ? options.centros.filter(centro => centro.facultadId === form.facultadId)
    : options.centros;

  function change(field) {
    return event => {
      const { value } = event.target;
      setForm(current => {
        if (field !== 'facultadId') return { ...current, [field]: value };
        // Si cambia la facultad, el centro elegido tiene que seguir siendo de esa facultad.
        const centro = options.centros.find(item => item.id === current.centroId);
        const keepCentro = centro && (!value || centro.facultadId === value);
        return { ...current, facultadId: value, centroId: keepCentro ? current.centroId : '' };
      });
    };
  }

  function search(event) {
    event.preventDefault();
    setFiltros({ ...form, q: form.q.trim().replace(/\s+/g, ' ') });
    setPagina(1);
  }

  function clear() {
    setForm(SIN_FILTROS);
    setFiltros(SIN_FILTROS);
    setPagina(1);
  }

  return (
    <main className="home">
      <header className="home-header">
        <a className="brand" href="#app">
          Lost&Found UEx
        </a>

        <nav aria-label="Navegación">
          <a href="#app">Volver a portada</a>
        </nav>
      </header>

      <section className="hero" aria-labelledby="feed-title">
        <span className="eyebrow">
          AVISOS DE PÉRDIDA · CAMPUS UEx
        </span>

        <h1 id="feed-title">Feed de avisos de pérdida</h1>

        <p>
          Consulta los avisos de pérdida activos publicados
          por otros usuarios de la comunidad universitaria.
        </p>
      </section>

      <section className="card" aria-labelledby="feed-filters-title">
        <h2 id="feed-filters-title">Buscar avisos</h2>

        <form role="search" aria-labelledby="feed-filters-title" onSubmit={search}>
          <label htmlFor="feed-q">Texto</label>
          <input
            id="feed-q"
            type="search"
            maxLength={TEXTO_MAX}
            value={form.q}
            onChange={change('q')}
            aria-describedby="feed-q-help"
          />
          <p id="feed-q-help" className="help">
            Busca en la descripción, la categoría, la facultad y el centro. No distingue mayúsculas.
          </p>

          <label htmlFor="feed-categoria">Categoría</label>
          <select id="feed-categoria" value={form.categoriaId} onChange={change('categoriaId')}>
            <option value="">Todas las categorías</option>
            {options.categorias.map(item => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>

          <label htmlFor="feed-facultad">Facultad</label>
          <select id="feed-facultad" value={form.facultadId} onChange={change('facultadId')}>
            <option value="">Todas las facultades</option>
            {options.facultades.map(item => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>

          {options.centros.length > 0 && (
            <>
              <label htmlFor="feed-centro">Centro</label>
              <select id="feed-centro" value={form.centroId} onChange={change('centroId')}>
                <option value="">Todos los centros</option>
                {centros.map(item => (
                  <option key={item.id} value={item.id}>{item.nombre}</option>
                ))}
              </select>
            </>
          )}

          {optionsError && <p className="help">{optionsError}</p>}

          <div className="hero-actions">
            <button type="submit">Buscar</button>
            <button type="button" onClick={clear} disabled={!hayFiltros && !hayBorrador}>
              Limpiar filtros
            </button>
          </div>
        </form>
      </section>

      <section
        className="home-grid"
        aria-label="Avisos de pérdida"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading && (
          <p role="status">Cargando avisos...</p>
        )}

        {!loading && error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && results.avisos.length === 0 && (
          <article className="card">
            <h2>{hayFiltros ? 'Sin coincidencias' : 'No hay avisos'}</h2>

            <p>
              {results.message ||
                (hayFiltros
                  ? 'No hay avisos activos que coincidan con la búsqueda.'
                  : 'Todavía no hay avisos de pérdida activos.')}
            </p>
          </article>
        )}

        {!loading && !error && results.avisos.map(aviso => (
          <article className="card" key={aviso.id}>
            <h2>{aviso.descripcion}</h2>

            <p>
              <strong>Categoría:</strong>{' '}
              {aviso.categoria?.nombre}
            </p>

            <p>
              <strong>Facultad:</strong>{' '}
              {aviso.facultad?.nombre}
            </p>

            {aviso.centro && (
              <p>
                <strong>Centro:</strong>{' '}
                {aviso.centro.nombre}
              </p>
            )}

            <p>
              <strong>Fecha aproximada:</strong>{' '}
              {formatDate(aviso.fechaPerdida)}
            </p>

            <p>
              <strong>Estado:</strong>{' '}
              {aviso.estado}
            </p>
          </article>
        ))}
      </section>

      {!loading && error && pagina > 1 && (
        <div className="hero-actions">
          <button type="button" onClick={() => setPagina(1)}>
            Volver a la primera página
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        results.paginacion &&
        results.paginacion.totalPaginas > 0 && (
          <nav
            className="hero-actions"
            aria-label="Paginación de avisos"
          >
            <button
              type="button"
              disabled={!results.paginacion.anterior}
              onClick={() => setPagina(current => current - 1)}
            >
              Página anterior
            </button>

            <span>
              Página {results.paginacion.pagina} de{' '}
              {results.paginacion.totalPaginas}
            </span>

            <button
              type="button"
              disabled={!results.paginacion.siguiente}
              onClick={() => setPagina(current => current + 1)}
            >
              Página siguiente
            </button>
          </nav>
        )}
    </main>
  );
}