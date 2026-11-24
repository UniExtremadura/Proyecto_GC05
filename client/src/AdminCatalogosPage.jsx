import { useEffect, useRef, useState } from 'react';
import { createCatalogo, getCatalogos, setCatalogoActivo, updateCatalogo } from './api/catalogos.js';

const TYPES = {
  facultades: { title: 'Facultades', singular: 'facultad', max: 150 },
  centros: { title: 'Centros', singular: 'centro', max: 150 },
  categorias: { title: 'Categorías', singular: 'categoría', max: 100 },
};
const EMPTY = { facultades: [], centros: [], categorias: [] };

/** SCRUM-132 / US-023. El GET administrativo valida la sesión incluso al abrir la URL directamente.
 * La API de SCRUM-134 decide permisos, duplicados y dependencias; esta pantalla no los simula.
 */
export function AdminCatalogosPage() {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState('loading');
  const [tipo, setTipo] = useState('facultades');
  const [filter, setFilter] = useState('todos');
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const alive = useRef(false);
  const editorHeading = useRef(null);
  const confirmHeading = useRef(null);
  const feedbackElement = useRef(null);
  const tabButtons = useRef({});
  const config = TYPES[tipo];

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { if (editor) editorHeading.current?.focus(); }, [editor?.id, editor?.tipo]);
  useEffect(() => { if (confirmation) confirmHeading.current?.focus(); }, [confirmation]);
  useEffect(() => { if (feedback) feedbackElement.current?.focus(); }, [feedback]);

  function deny(error) {
    if (error.status !== 401 && error.status !== 403) return false;
    setStatus(error.status === 401 ? 'unauthenticated' : 'forbidden');
    setData(EMPTY);
    setEditor(null);
    setConfirmation(null);
    setFeedback(null);
    return true;
  }

  async function load() {
    if (locked.current) return;
    locked.current = true;
    setStatus('loading');
    setFeedback(null);
    setEditor(null);
    setConfirmation(null);
    try {
      const result = await getCatalogos();
      if (!Object.keys(EMPTY).every(key => Array.isArray(result[key]))) throw new Error('La respuesta del servidor no es válida.');
      if (alive.current) { setData(result); setStatus('ready'); }
    } catch (error) {
      if (alive.current && !deny(error)) {
        setStatus('error');
        setFeedback({ ok: false, text: error.message });
      }
    } finally { locked.current = false; }
  }

  function changeType(next) {
    if (busy) return;
    setTipo(next);
    setFilter('todos');
    setEditor(null);
    setConfirmation(null);
    setErrors({});
    setFeedback(null);
  }

  function openEditor(item = null) {
    setConfirmation(null);
    setFeedback(null);
    setErrors({});
    setEditor({ tipo, id: item?.id ?? '', nombre: item?.nombre ?? '', facultadId: item?.facultadId ?? '' });
  }

  function cancel() {
    setEditor(null);
    setConfirmation(null);
    setErrors({});
    tabButtons.current[tipo]?.focus();
  }

  async function mutate(action, message) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setErrors({});
    setFeedback(null);
    try {
      const saved = await action();
      if (!alive.current) return;
      // Actualizar con la respuesta real, sin marcar éxito antes de que la API lo confirme.
      setData(current => ({ ...current, [tipo]: [...current[tipo].filter(item => item.id !== saved.id), saved]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }));
      setEditor(null);
      setConfirmation(null);
      setFilter('todos');
      setFeedback({ ok: true, text: message });
    } catch (error) {
      if (alive.current && !deny(error)) {
        setErrors(error.errors ?? {});
        setFeedback({ ok: false, text: error.message });
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const validation = {};
    const nombre = editor.nombre.trim();
    if (!nombre || nombre.length > config.max) validation.nombre = `Introduce un nombre de entre 1 y ${config.max} caracteres.`;
    if (tipo === 'centros' && !data.facultades.some(item => item.id === editor.facultadId && item.activo)) {
      validation.facultadId = 'Selecciona una facultad activa.';
    }
    if (Object.keys(validation).length) {
      setErrors(validation);
      setFeedback({ ok: false, text: 'Revisa los campos del formulario.' });
      return;
    }
    const body = { nombre, ...(tipo === 'centros' && { facultadId: editor.facultadId }) };
    mutate(() => editor.id ? updateCatalogo(tipo, editor.id, body) : createCatalogo(tipo, body),
      editor.id ? 'Cambios guardados correctamente.' : 'Elemento creado correctamente.');
  }

  const facultyName = id => data.facultades.find(item => item.id === id)?.nombre ?? 'Facultad no disponible';
  const items = data[tipo].filter(item => filter === 'todos' || item.activo === (filter === 'activos'));
  const blocked = status === 'unauthenticated' || status === 'forbidden';

  return (
    <main className="admin-catalogos">
      <header className="home-header">
        <a className="brand" href="#app">Lost&Found UEx</a>
        <a href="#app">Volver al inicio</a>
      </header>
      <section className="card" aria-labelledby="catalogos-title">
        <span className="eyebrow">ADMINISTRACIÓN</span>
        <h1 id="catalogos-title">Facultades, centros y categorías</h1>
        <p className="help">Gestiona las opciones disponibles al publicar. Los elementos inactivos conservan sus datos históricos.</p>

        {status === 'loading' && <p role="status">Cargando catálogos…</p>}
        {blocked && <div role="alert" className="error">
          <p>{status === 'unauthenticated' ? 'Tu sesión ha caducado. Inicia sesión de nuevo.' : 'Solo los administradores pueden gestionar los catálogos.'}</p>
          {status === 'unauthenticated' && <a href="#inicio-sesion">Iniciar sesión</a>}
        </div>}
        {feedback && <p ref={feedbackElement} tabIndex={-1} role={feedback.ok ? 'status' : 'alert'}
          className={feedback.ok ? 'success catalogo-feedback' : 'error catalogo-feedback'}>{feedback.text}</p>}
        {status === 'error' && <button type="button" onClick={load}>Reintentar carga</button>}

        {status === 'ready' && <>
          <nav className="catalogo-sections" aria-label="Tipos de catálogo">
            {Object.entries(TYPES).map(([key, value]) => <button key={key} type="button" aria-pressed={tipo === key}
              ref={element => { tabButtons.current[key] = element; }} disabled={busy}
              className={tipo === key ? '' : 'secondary'} onClick={() => changeType(key)}>
              {value.title} <span className="catalogo-count">{data[key].length}</span>
            </button>)}
          </nav>
          <div className="catalogo-layout" aria-busy={busy}>
            <section aria-labelledby="catalogo-list-title">
              <div className="catalogo-toolbar">
                <h2 id="catalogo-list-title">{config.title}</h2>
                <div className="actions">
                  <button type="button" disabled={busy} onClick={() => openEditor()}>Crear {config.singular}</button>
                  <button type="button" className="secondary" disabled={busy || !!editor || !!confirmation} onClick={load}>Actualizar listado</button>
                </div>
              </div>
              <label htmlFor="catalogo-filter">Mostrar por estado</label>
              <select id="catalogo-filter" value={filter} disabled={busy} onChange={event => setFilter(event.target.value)}>
                <option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option>
              </select>
              {!items.length && <p className="catalogo-empty">{data[tipo].length ? 'No hay elementos con este estado.' : `Todavía no hay ${config.title.toLowerCase()}. Crea el primer elemento para empezar.`}</p>}
              <ul className="catalogo-list" aria-label={`Listado de ${config.title.toLowerCase()}`}>
                {items.map(item => <li key={item.id}>
                  <div className="catalogo-item-info"><h3>{item.nombre}</h3>
                    {tipo === 'centros' && <p className="help">{facultyName(item.facultadId)}</p>}
                    <span className={`estado ${item.activo ? 'estado-activo' : 'catalogo-inactivo'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div className="catalogo-item-actions">
                    <button type="button" className="secondary" disabled={busy} aria-label={`Editar ${item.nombre}`} onClick={() => openEditor(item)}>Editar</button>
                    <button type="button" className="secondary" disabled={busy} aria-label={`${item.activo ? 'Desactivar' : 'Reactivar'} ${item.nombre}`}
                      onClick={() => { setEditor(null); setErrors({}); setFeedback(null); setConfirmation(item); }}>
                      {item.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </div>
                </li>)}
              </ul>
            </section>

            <aside className="catalogo-editor" aria-label="Edición del catálogo">
              {editor ? <>
                <h2 ref={editorHeading} tabIndex={-1}>{editor.id ? 'Editar' : 'Crear'} {config.singular}</h2>
                <form noValidate onSubmit={save}>
                  <fieldset disabled={busy}>
                    <label htmlFor="catalogo-nombre">Nombre</label>
                    <input id="catalogo-nombre" value={editor.nombre} required maxLength={config.max}
                      aria-invalid={!!errors.nombre} aria-describedby={`catalogo-nombre-help${errors.nombre ? ' catalogo-nombre-error' : ''}`}
                      onChange={event => setEditor(current => ({ ...current, nombre: event.target.value }))} />
                    <p id="catalogo-nombre-help" className="help">Hasta {config.max} caracteres.</p>
                    {errors.nombre && <p id="catalogo-nombre-error" className="error">{errors.nombre}</p>}
                    {tipo === 'centros' && <>
                      <label htmlFor="catalogo-facultad">Facultad del centro</label>
                      <select id="catalogo-facultad" value={editor.facultadId} required aria-invalid={!!errors.facultadId}
                        aria-describedby={errors.facultadId ? 'catalogo-facultad-error' : undefined}
                        onChange={event => setEditor(current => ({ ...current, facultadId: event.target.value }))}>
                        <option value="">Selecciona una facultad activa</option>
                        {data.facultades.filter(item => item.activo || item.id === editor.facultadId).map(item =>
                          <option key={item.id} value={item.id} disabled={!item.activo}>{item.nombre}{!item.activo ? ' (inactiva)' : ''}</option>)}
                      </select>
                      {!data.facultades.some(item => item.activo) && <p className="help">Crea o reactiva una facultad antes de guardar un centro.</p>}
                      {errors.facultadId && <p id="catalogo-facultad-error" className="error">{errors.facultadId}</p>}
                    </>}
                    <div className="actions"><button type="submit">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
                      <button type="button" className="secondary" onClick={cancel}>Cancelar</button></div>
                  </fieldset>
                </form>
              </> : confirmation ? <>
                <h2 ref={confirmHeading} tabIndex={-1}>{confirmation.activo ? 'Desactivar' : 'Reactivar'} {config.singular}</h2>
                <p>¿Quieres {confirmation.activo ? 'desactivar' : 'reactivar'} <strong>{confirmation.nombre}</strong>?</p>
                <p className="help">{confirmation.activo
                  ? 'Dejará de ofrecerse en los formularios de publicación. Sus referencias históricas se conservarán.'
                  : 'Volverá a estar disponible cuando también esté activa su facultad, si corresponde.'}</p>
                {tipo === 'facultades' && confirmation.activo && <p className="help">Una facultad con conserjes asignados no puede desactivarse hasta resolver sus asignaciones.</p>}
                <div className="actions"><button type="button" disabled={busy} onClick={() => mutate(
                  () => setCatalogoActivo(tipo, confirmation.id, !confirmation.activo),
                  confirmation.activo ? 'Elemento desactivado. Se conservan los datos históricos.' : 'Elemento reactivado correctamente.')}
                >{busy ? 'Guardando…' : confirmation.activo ? 'Confirmar desactivación' : 'Confirmar reactivación'}</button>
                  <button type="button" className="secondary" disabled={busy} onClick={cancel}>Cancelar</button></div>
              </> : <>
                <h2>Gestiona tus catálogos</h2>
                <p className="help">Selecciona «Crear {config.singular}» o edita un elemento del listado.</p>
                <p className="help">La desactivación es reversible. No elimina publicaciones ni sus referencias.</p>
              </>}
            </aside>
          </div>
        </>}
      </section>
    </main>
  );
}
