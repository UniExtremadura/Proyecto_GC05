import { useEffect, useRef, useState } from 'react';
import { createSolicitud, JUSTIFICACION_MAX } from './api/solicitudes.js';

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

const length = text => [...text].length;

/**
 * SCRUM-127 / US-018 · Formulario para solicitar la recuperación de un hallazgo Activo.
 * Identifica el hallazgo elegido en la búsqueda (AC-02) y pide la justificación de propiedad,
 * que es privada (AC-03). El servidor fija el solicitante y el estado Pendiente (AC-05).
 */
export function RecoveryRequestForm({ hallazgo, onClose }) {
  const [justificacion, setJustificacion] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [login, setLogin] = useState(false);
  const [sending, setSending] = useState(false);
  const [solicitud, setSolicitud] = useState(null);
  const busy = useRef(false);
  const title = useRef(null);
  const feedback = useRef(null);

  // Al abrir el formulario, el foco pasa a su título para lectores de pantalla y teclado.
  useEffect(() => { title.current?.focus(); }, [hallazgo.id]);
  useEffect(() => { if (error || solicitud) feedback.current?.focus(); }, [error, solicitud]);

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setError('');
    setFieldError('');
    setLogin(false);

    // US-018-AC-04: no se envía sin justificación ni por encima del límite.
    const text = justificacion.trim();
    if (!text) {
      setFieldError('Explica por qué el objeto es tuyo.');
      setError('Revisa los datos de la solicitud.');
      return;
    }
    if (length(text) > JUSTIFICACION_MAX) {
      setFieldError(`No puede superar los ${JUSTIFICACION_MAX} caracteres.`);
      setError('Revisa los datos de la solicitud.');
      return;
    }

    busy.current = true;
    setSending(true);
    try {
      const data = await createSolicitud(hallazgo.id, text);
      setSolicitud(data.solicitud);
    } catch (err) {
      setFieldError(err.errors?.justificacion || '');
      setError(err.message || 'No se ha podido enviar la solicitud.');
      setLogin(err.status === 401);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  const describedBy = ['solicitud-justificacion-help', 'solicitud-justificacion-count',
    fieldError && 'solicitud-justificacion-error'].filter(Boolean).join(' ');

  return (
    <section className="card" aria-labelledby="solicitud-title">
      <h2 id="solicitud-title" ref={title} tabIndex="-1">Solicitar la recuperación</h2>

      <dl className="finding-data" aria-label="Hallazgo seleccionado">
        <dt>Hallazgo</dt><dd>{hallazgo.descripcion}</dd>
        <dt>Categoría</dt><dd>{hallazgo.categoria?.nombre}</dd>
        <dt>Facultad</dt><dd>{hallazgo.facultad?.nombre}</dd>
        <dt>Fecha</dt><dd>{formatDate(hallazgo.fechaHallazgo)}</dd>
      </dl>

      {solicitud ? (
        <div ref={feedback} tabIndex="-1" role="status">
          <p className="success">
            Solicitud enviada. Estado: <strong>{solicitud.estado}</strong>.
          </p>
          <p>
            El Conserje de la facultad del hallazgo revisará tu justificación. El hallazgo sigue
            publicado mientras tanto.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={onClose}>Volver a los resultados</button>
            {/* SCRUM-130 / US-019: seguimiento de la solicitud. */}
            <a href="#mis-solicitudes">Ver mis solicitudes</a>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={sending} noValidate>
          <label htmlFor="solicitud-justificacion">Justificación de propiedad</label>
          <textarea
            id="solicitud-justificacion"
            rows={6}
            value={justificacion}
            onChange={event => setJustificacion(event.target.value)}
            disabled={sending}
            aria-required="true"
            aria-invalid={fieldError ? 'true' : undefined}
            aria-describedby={describedBy}
          />
          <p id="solicitud-justificacion-help" className="help">
            Describe detalles que solo conocería quien lo perdió: marcas, contenido, dónde y cuándo lo perdiste.
            Solo la verás tú y el Conserje de la facultad del hallazgo; no se publica.
          </p>
          <p id="solicitud-justificacion-count" className="help">
            {length(justificacion)} / {JUSTIFICACION_MAX} caracteres
          </p>
          {fieldError && (
            <p id="solicitud-justificacion-error" className="error">{fieldError}</p>
          )}

          <p className="help">
            Enviar la solicitud no reserva el objeto ni lo retira del listado: queda pendiente de revisión.
          </p>

          <div className="hero-actions">
            <button type="submit" disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <button type="button" onClick={onClose} disabled={sending}>Cancelar</button>
          </div>

          {error && (
            <p ref={feedback} tabIndex="-1" className="error" role="alert">
              {error}{login && <> <a href="#inicio-sesion">Iniciar sesión</a></>}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
