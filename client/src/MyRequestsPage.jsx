import { useEffect, useRef, useState } from 'react';
import { getMiSolicitud, getMisSolicitudes } from './api/solicitudes.js';

/** 2026-01-15 → 15/01/2026 sin pasar por Date, para no desplazar el día por la zona horaria. */
const formatDate = (value) => {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : day;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
};

const hallazgoResumen = item => [item.categoria, item.facultad, formatDate(item.fechaHallazgo)].filter(Boolean).join(' · ');

/** US-019-AC-02 y AC-04: la decisión solo se muestra cuando existe. */
function Decision({ solicitud }) {
  if (solicitud.estado === 'Validada') {
    return <>
      <h3>Instrucciones de recogida</h3>
      <p>{solicitud.instruccionesRecogida || 'El Conserje ha validado la solicitud, pero todavía no ha registrado las instrucciones de recogida.'}</p>
    </>;
  }
  if (solicitud.estado === 'Rechazada') {
    return <>
      <h3>Motivo del rechazo</h3>
      <p>{solicitud.motivoRechazo || 'El Conserje no ha registrado el motivo del rechazo.'}</p>
    </>;
  }
  return <p className="help">El Conserje todavía no ha revisado tu solicitud. Cuando decida, verás aquí el resultado.</p>;
}

const LoginLink = ({ error }) => error.status === 401 && <> <a href="#inicio-sesion">Iniciar sesión</a></>;

/** SCRUM-130 / US-019 · Mis solicitudes de recuperación: listado propio y detalle de solo lectura. */
export function MyRequestsPage() {
  const [list, setList] = useState({ status: 'loading', items: [] });
  const [detail, setDetail] = useState(null);
  const heading = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getMisSolicitudes()
      .then(data => !cancelled && setList({ status: 'ready', items: data.solicitudes }))
      .catch(error => !cancelled && setList({ status: 'error', items: [], error }));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (detail?.status === 'ready') heading.current?.focus();
  }, [detail?.status]);

  async function open(item) {
    setDetail({ status: 'loading', item });
    try {
      const { solicitud } = await getMiSolicitud(item.id);
      setDetail({ status: 'ready', solicitud });
    } catch (error) {
      setDetail({ status: 'error', item, error });
    }
  }

  function renderList() {
    if (list.status === 'loading') return <p role="status">Cargando tus solicitudes…</p>;
    if (list.status === 'error') return <p className="error" role="alert">{list.error.message}<LoginLink error={list.error} /></p>;
    if (!list.items.length) {
      return <p>Todavía no has enviado ninguna solicitud de recuperación. <a href="#buscar-hallazgos">Buscar hallazgos</a></p>;
    }
    return <ul className="my-findings" aria-label="Tus solicitudes de recuperación">
      {list.items.map(item => <li key={item.id} className="my-finding my-notice">
        <div>
          <p className="my-finding-title"><strong>{item.hallazgoDescripcion}</strong></p>
          <p className="help">{hallazgoResumen(item)}</p>
          <p className="help">Enviada el {formatDateTime(item.creadaEn)}</p>
          <p><span className={`estado estado-${item.estado.toLowerCase()}`}>{item.estado}</span></p>
        </div>
        <button type="button" className="secondary" onClick={() => open(item)} aria-label={`Ver la solicitud de: ${item.hallazgoDescripcion}`}>
          Ver detalle
        </button>
      </li>)}
    </ul>;
  }

  function renderDetail() {
    if (detail.status === 'loading') return <p role="status">Cargando la solicitud…</p>;
    if (detail.status === 'error') return <p className="error" role="alert">{detail.error.message}<LoginLink error={detail.error} /></p>;
    const { solicitud } = detail;
    return <>
      <h2 ref={heading} tabIndex={-1}>{solicitud.hallazgoDescripcion}</h2>
      <dl className="finding-data" aria-label="Datos de la solicitud">
        <dt>Estado</dt>
        <dd><span className={`estado estado-${solicitud.estado.toLowerCase()}`}>{solicitud.estado}</span></dd>
        <dt>Enviada</dt><dd>{formatDateTime(solicitud.creadaEn)}</dd>
        <dt>Categoría</dt><dd>{solicitud.categoria}</dd>
        <dt>Facultad</dt><dd>{solicitud.facultad}</dd>
        <dt>Fecha del hallazgo</dt><dd>{formatDate(solicitud.fechaHallazgo)}</dd>
        <dt>Tu justificación</dt><dd>{solicitud.justificacion}</dd>
      </dl>
      <Decision solicitud={solicitud} />
    </>;
  }

  return <main className="my-findings-page">
    <header>
      <a className="brand" href="#app">Lost&Found UEx</a>
      <p><a href="#app">Volver al inicio</a></p>
    </header>
    <section className="card" aria-labelledby="my-requests-title">
      <h1 id="my-requests-title">Mis solicitudes de recuperación</h1>
      {detail
        ? <>
          <p><button type="button" className="secondary" onClick={() => setDetail(null)}>← Volver a mis solicitudes</button></p>
          {renderDetail()}
        </>
        : renderList()}
    </section>
  </main>;
}
