import { useEffect, useState } from 'react';
import { closeAviso, getAvisosParaCerrar } from './api/avisos.js';

function NoticeDetails({ aviso, onClosed }) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (saving || !motivo.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await closeAviso(aviso.id, motivo.trim());
      onClosed(result.aviso);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="card">
      <summary>{aviso.descripcion} · {aviso.estado}</summary>
      <p>Fecha de pérdida: {aviso.fechaPerdida}</p>
      {aviso.estado === 'Activo' && (
        <form onSubmit={submit}>
          <label htmlFor={`motivo-${aviso.id}`}>Motivo del cierre</label>
          <textarea
            id={`motivo-${aviso.id}`}
            required
            maxLength={500}
            value={motivo}
            onChange={event => setMotivo(event.target.value)}
          />
          <button type="submit" disabled={saving || !motivo.trim()}>Cerrar aviso</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      {aviso.cerradoEn && (
        <p>Cerrado el {new Date(aviso.cerradoEn).toLocaleString('es-ES')}. Motivo: {aviso.motivoCierre}</p>
      )}
    </details>
  );
}

export function CloseNoticesPage() {
  const [avisos, setAvisos] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await getAvisosParaCerrar();
        if (active) setAvisos(result.avisos);
      } catch (err) {
        if (active) setError(err.message);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function onClosed(updated) {
    setAvisos(current => current.map(aviso => aviso.id === updated.id ? { ...aviso, ...updated } : aviso));
    setMessage('Aviso cerrado correctamente.');
  }

  return (
    <main className="home">
      <header className="home-header">
        <a href="#app">Volver a portada</a>
        <a href="#feed-avisos">Consultar el feed</a>
      </header>
      <h1>Cerrar mis avisos</h1>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {!avisos && !error && <p role="status">Cargando avisos...</p>}
      {avisos?.length === 0 && <p>Todavía no has publicado avisos.</p>}
      {avisos?.map(aviso => <NoticeDetails key={aviso.id} aviso={aviso} onClosed={onClosed} />)}
    </main>
  );
}
