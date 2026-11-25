import { useEffect, useRef, useState } from 'react';
import { LostNoticeFields, toAvisoPayload, validateAviso, withFacultad } from './LostNoticeFields.jsx';

/** Pasa los datos de un aviso guardado al formulario: lo que viene vacío o null se muestra en blanco. */
function fromAviso(aviso) {
  const text = value => value ?? '';
  return {
    categoriaId: text(aviso.categoriaId),
    facultadId: text(aviso.facultadId),
    centroId: text(aviso.centroId),
    descripcion: text(aviso.descripcion),
    fechaPerdida: text(aviso.fechaPerdida).slice(0, 10),
    rasgosPrivados: text(aviso.rasgosPrivados),
    contactoEmail: text(aviso.contactoEmail),
    contactoTelefono: text(aviso.contactoTelefono),
  };
}

const sameData = (a, b) => JSON.stringify(toAvisoPayload(a)) === JSON.stringify(toAvisoPayload(b));

/**
 * SCRUM-60 / US-016 · Formulario para editar un aviso propio.
 * Muestra los datos ya guardados (aviso), los valida y entrega los cambios a onSubmit.
 * La carga del aviso y el guardado se conectan a la API de edición (SCRUM-122) cuando esté.
 */
export function EditLostNoticeForm({ aviso, options, onSubmit }) {
  const [saved, setSaved] = useState(() => fromAviso(aviso));
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ text: '', ok: false, login: false });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const feedback = useRef(null);

  useEffect(() => {
    if (message.text) feedback.current?.focus();
  }, [message]);

  const change = field => event => setForm(current => ({ ...current, [field]: event.target.value }));

  function changeFacultad(event) {
    const facultadId = event.target.value;
    setForm(current => withFacultad(current, facultadId, options.centros));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setErrors({});
    setMessage({ text: '', ok: false, login: false });

    // US-016-AC-03: se valida antes de guardar.
    const validationErrors = validateAviso(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      setMessage({ text: 'Revisa los datos introducidos.', ok: false, login: false });
      return;
    }
    if (sameData(form, saved)) {
      setMessage({ text: 'No has cambiado nada del aviso.', ok: false, login: false });
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      const data = await onSubmit(toAvisoPayload(form));
      setSaved(form);
      setMessage({ text: data?.message || 'Aviso actualizado correctamente.', ok: true, login: false });
    } catch (error) {
      setErrors(error.errors || {});
      setMessage({ text: error.message, ok: false, login: error.status === 401 });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <>
    <form onSubmit={submit} aria-busy={saving} noValidate>
      <LostNoticeFields form={form} errors={errors} options={options} disabled={saving}
        onChange={change} onFacultadChange={changeFacultad} />

      <div className="actions">
        <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </form>
    <p ref={feedback} role="status" aria-live="polite" tabIndex="-1" className={message.ok ? 'success' : 'error'}>
      {message.text}{message.login && <> <a href="#inicio-sesion">Iniciar sesión</a></>}
    </p>
  </>;
}
