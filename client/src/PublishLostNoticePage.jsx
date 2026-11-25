import { useEffect, useRef, useState } from 'react';
import { getAvisoOptions, publishAviso } from './api/avisos.js';
import { LostNoticeFields, today, toAvisoPayload, validateAviso, withFacultad } from './LostNoticeFields.jsx';

export { AVISO_LEGAL } from './LostNoticeFields.jsx';

const empty = () => ({
  categoriaId: '', facultadId: '', centroId: '', descripcion: '', fechaPerdida: today(),
  rasgosPrivados: '', contactoEmail: '', contactoTelefono: '',
});

/** SCRUM-52 / US-013 · Publicar un aviso de pérdida. */
export function PublishLostNoticePage() {
  const [options, setOptions] = useState(null);
  const [status, setStatus] = useState('loading');
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ text: '', ok: false, login: false });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const feedback = useRef(null);

  useEffect(() => {
    getAvisoOptions()
      .then(data => {
        setOptions({ categorias: data?.categorias ?? [], facultades: data?.facultades ?? [], centros: data?.centros ?? [] });
        setStatus('ready');
      })
      .catch(error => { setStatus(error.status === 401 ? 'unauthenticated' : 'error'); setMessage({ text: error.message, ok: false, login: false }); });
  }, []);

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

    const validationErrors = validateAviso(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      setMessage({ text: 'Revisa los datos introducidos.', ok: false, login: false });
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      // Un solo intento: si falla la red no se repite, porque el aviso podría haberse guardado.
      const data = await publishAviso(toAvisoPayload(form));
      setForm(empty());
      setMessage({ text: data?.message || 'Aviso de pérdida publicado correctamente.', ok: true, login: false });
    } catch (error) {
      setErrors(error.errors || {});
      setMessage({ text: error.message, ok: false, login: error.status === 401 });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const feedbackLine = <p ref={feedback} role="status" aria-live="polite" tabIndex="-1" className={message.ok ? 'success' : 'error'}>
    {message.text}{message.login && <> <a href="#inicio-sesion">Iniciar sesión</a></>}
  </p>;

  let content;
  if (status === 'loading') content = <p role="status">Cargando el formulario…</p>;
  else if (status === 'unauthenticated') content = <p className="error">Debes iniciar sesión para publicar un aviso. <a href="#inicio-sesion">Iniciar sesión</a></p>;
  else if (status === 'error') content = feedbackLine;
  else if (!options.categorias.length || (!options.facultades.length && !options.centros.length)) {
    content = <p className="error">Todavía no hay categorías o facultades disponibles, así que no se puede publicar. Avisa a la administración.</p>;
  } else {
    content = <form onSubmit={submit} aria-busy={saving} noValidate>
      <LostNoticeFields form={form} errors={errors} options={options} disabled={saving}
        onChange={change} onFacultadChange={changeFacultad} />

      <div className="actions">
        <button type="submit" disabled={saving}>{saving ? 'Publicando…' : 'Publicar aviso'}</button>
      </div>
    </form>;
  }

  return <main className="publish-finding">
    <header>
      <a className="brand" href="#app">Lost&Found UEx</a>
      <p><a href="#app">Volver al inicio</a></p>
    </header>
    <section className="card" aria-labelledby="aviso-title">
      <h1 id="aviso-title">Publicar un aviso de pérdida</h1>
      <p className="help">Los campos sin «opcional» son obligatorios.</p>
      {content}
      {status === 'ready' && feedbackLine}
    </section>
  </main>;
}
