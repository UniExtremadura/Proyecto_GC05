import { useCallback, useEffect, useState } from 'react';
import { getAvisoOptions, getMyAviso, getMyAvisos, updateAviso } from './api/avisos.js';
import { EditLostNoticeForm } from './EditLostNoticeForm.jsx';

/** 2026-01-15 → 15/01/2026 sin pasar por Date, para no desplazar el día por la zona horaria. */
const formatDate = (value) => {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : day;
};

/** SCRUM-60 / US-016 · Mis avisos de pérdida: listado propio y edición de los que siguen activos. */
export function MyLostNoticesPage() {
  const [list, setList] = useState({ status: 'loading', items: [] });
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState({ status: 'idle' });

  const loadList = useCallback(() => getMyAvisos()
    .then(data => setList({ status: 'ready', items: data?.avisos ?? [] }))
    .catch(error => setList({ status: error.status === 401 ? 'unauthenticated' : 'error', items: [], error: error.message })), []);

  useEffect(() => { loadList(); }, [loadList]);

  async function open(item) {
    setSelected(item);
    setEdit({ status: 'loading' });
    try {
      // Datos actuales del aviso (incluidos los privados, que solo ve su autor) y catálogos activos.
      const [data, options] = await Promise.all([getMyAviso(item.id), getAvisoOptions()]);
      setEdit({
        status: 'ready',
        aviso: data.aviso,
        options: { categorias: options?.categorias ?? [], facultades: options?.facultades ?? [], centros: options?.centros ?? [] },
      });
    } catch (error) {
      setEdit({ status: 'error', error: error.message, login: error.status === 401 });
    }
  }

  function back() {
    setSelected(null);
    setEdit({ status: 'idle' });
    loadList();
  }

  async function save(datos) {
    try {
      return await updateAviso(selected.id, datos);
    } catch (error) {
      // US-016-AC-01: si mientras tanto el aviso dejó de estar activo, no se deja seguir editando.
      if (error.status === 409 || error.status === 404) setEdit({ status: 'error', error: error.message });
      throw error;
    }
  }

  function renderList() {
    if (list.status === 'loading') return <p role="status">Cargando tus avisos…</p>;
    if (list.status === 'unauthenticated') return <p className="error">Debes iniciar sesión para ver tus avisos. <a href="#inicio-sesion">Iniciar sesión</a></p>;
    if (list.status === 'error') return <p className="error" role="alert">{list.error}</p>;
    if (!list.items.length) return <p>Todavía no has publicado ningún aviso de pérdida. <a href="#publicar-aviso">Publicar un aviso</a></p>;
    return <ul className="my-findings" aria-label="Tus avisos de pérdida">
      {list.items.map(item => <li key={item.id} className="my-finding my-notice">
        <div>
          <p className="my-finding-title"><strong>{item.descripcion}</strong></p>
          <p className="help">{[item.categoria, item.centro || item.facultad, formatDate(item.fechaPerdida)].filter(Boolean).join(' · ')}</p>
          <p><span className={`estado estado-${item.estado.toLowerCase()}`}>{item.estado}</span></p>
        </div>
        {item.estado === 'Activo'
          ? <button type="button" className="secondary" onClick={() => open(item)} aria-label={`Editar: ${item.descripcion}`}>Editar</button>
          : <p className="help">Ya no se puede editar.</p>}
      </li>)}
    </ul>;
  }

  function renderEdit() {
    if (edit.status === 'loading') return <p role="status">Cargando el aviso…</p>;
    if (edit.status === 'error') {
      return <p className="error" role="alert">{edit.error}{edit.login && <> <a href="#inicio-sesion">Iniciar sesión</a></>}</p>;
    }
    if (!edit.aviso.editable) return <p className="help">Este aviso está {edit.aviso.estado.toLowerCase()} y ya no se puede editar.</p>;
    return <>
      <h2>Editar aviso</h2>
      <p className="help">Los campos sin «opcional» son obligatorios. El estado y la fecha de publicación no cambian.</p>
      <EditLostNoticeForm aviso={edit.aviso} options={edit.options} onSubmit={save} />
    </>;
  }

  return <main className="my-findings-page">
    <header>
      <a className="brand" href="#app">Lost&Found UEx</a>
      <p><a href="#app">Volver al inicio</a></p>
    </header>
    <section className="card" aria-labelledby="my-notices-title">
      <h1 id="my-notices-title">Mis avisos de pérdida</h1>
      {selected
        ? <>
          <p><button type="button" className="secondary" onClick={back}>← Volver a mis avisos</button></p>
          {renderEdit()}
        </>
        : renderList()}
    </section>
  </main>;
}
