// Campos, validación y datos de un aviso de pérdida.
// Los usan la pantalla de publicar (SCRUM-52 / US-013) y la de editar (SCRUM-60 / US-016).

// Mismos límites que el servidor (SCRUM-109).
export const TEXT_MAX = 2000;
const EMAIL_MAX = 254;
const TELEFONO_PATTERN = /^(?:\+34)?[0-9]{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AVISO_LEGAL = 'Este aviso no inicia una solicitud de recuperación ni implica que el objeto esté bajo custodia de la Universidad.';

export function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const length = (text) => [...text].length;

/** Valida antes de enviar (US-013-AC-05 y US-016-AC-03); el servidor vuelve a validarlo todo. */
export function validateAviso(form) {
  const errors = {};
  if (!form.categoriaId) errors.categoriaId = 'Selecciona una categoría.';
  if (!form.facultadId && !form.centroId) errors.facultadId = 'Selecciona la facultad o el centro donde lo perdiste.';
  if (!form.descripcion.trim()) errors.descripcion = 'Describe el objeto que has perdido.';
  else if (length(form.descripcion.trim()) > TEXT_MAX) errors.descripcion = `No puede superar los ${TEXT_MAX} caracteres.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fechaPerdida)) errors.fechaPerdida = 'Indica la fecha aproximada en la que lo perdiste.';
  else if (form.fechaPerdida > today()) errors.fechaPerdida = 'La fecha no puede ser futura.';
  if (length(form.rasgosPrivados.trim()) > TEXT_MAX) errors.rasgosPrivados = `No puede superar los ${TEXT_MAX} caracteres.`;
  const email = form.contactoEmail.trim();
  if (email && (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email))) errors.contactoEmail = 'El formato del correo de contacto no es válido.';
  const telefono = form.contactoTelefono.trim();
  if (telefono && !TELEFONO_PATTERN.test(telefono)) errors.contactoTelefono = 'Introduce 9 cifras, con el prefijo +34 opcional.';
  return errors;
}

/** Los campos opcionales vacíos se envían como null, como permite la API. */
export function toAvisoPayload(form) {
  const optional = text => text.trim() || null;
  return {
    categoriaId: form.categoriaId,
    facultadId: form.facultadId || null,
    centroId: form.centroId || null,
    descripcion: form.descripcion.trim(),
    fechaPerdida: form.fechaPerdida,
    rasgosPrivados: optional(form.rasgosPrivados),
    contactoEmail: optional(form.contactoEmail),
    contactoTelefono: optional(form.contactoTelefono),
  };
}

/** Si se cambia la facultad, el centro elegido tiene que seguir siendo de esa facultad. */
export function withFacultad(form, facultadId, centros) {
  const centro = centros.find(item => item.id === form.centroId);
  const keepCentro = centro && (!facultadId || centro.facultadId === facultadId);
  return { ...form, facultadId, centroId: keepCentro ? form.centroId : '' };
}

/** Campos del formulario de un aviso: categoría, descripción, fecha, lugar, rasgos y contacto. */
export function LostNoticeFields({ form, errors, options, disabled, onChange, onFacultadChange }) {
  const describedBy = (name, help) => [help && `aviso-${name}-help`, errors[name] && `aviso-${name}-error`].filter(Boolean).join(' ') || undefined;
  const fieldError = name => errors[name] && <p id={`aviso-${name}-error`} className="error">{errors[name]}</p>;
  const common = name => ({
    id: `aviso-${name}`, name, value: form[name], onChange: onChange(name), disabled,
    'aria-invalid': Boolean(errors[name]),
  });
  const centros = form.facultadId ? options.centros.filter(item => item.facultadId === form.facultadId) : options.centros;

  return <>
    <label htmlFor="aviso-categoriaId">Categoría</label>
    <select {...common('categoriaId')} aria-describedby={describedBy('categoriaId')}>
      <option value="">Selecciona una categoría</option>
      {options.categorias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
    </select>
    {fieldError('categoriaId')}

    <label htmlFor="aviso-descripcion">Descripción pública</label>
    <textarea {...common('descripcion')} rows={4} maxLength={TEXT_MAX} aria-describedby={describedBy('descripcion', true)} />
    <p id="aviso-descripcion-help" className="help">Visible para todos. No incluyas datos que solo conozcas tú.</p>
    {fieldError('descripcion')}

    <label htmlFor="aviso-fechaPerdida">Fecha aproximada de la pérdida</label>
    <input {...common('fechaPerdida')} type="date" max={today()} aria-describedby={describedBy('fechaPerdida')} />
    {fieldError('fechaPerdida')}

    <label htmlFor="aviso-facultadId">Facultad donde lo perdiste</label>
    <select {...common('facultadId')} onChange={onFacultadChange} aria-describedby={describedBy('facultadId', true)}>
      <option value="">Selecciona una facultad</option>
      {options.facultades.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
    </select>
    <p id="aviso-facultadId-help" className="help">Indica la facultad, el centro o ambos.</p>
    {fieldError('facultadId')}

    {options.centros.length > 0 && <>
      <label htmlFor="aviso-centroId">Centro (opcional)</label>
      <select {...common('centroId')} aria-describedby={describedBy('centroId')}>
        <option value="">Sin centro concreto</option>
        {centros.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
      </select>
      {fieldError('centroId')}
    </>}

    <label htmlFor="aviso-rasgosPrivados">Rasgos identificativos privados (opcional)</label>
    <textarea {...common('rasgosPrivados')} rows={3} maxLength={TEXT_MAX} aria-describedby={describedBy('rasgosPrivados', true)} />
    <p id="aviso-rasgosPrivados-help" className="help">No se mostrarán en el listado público de avisos.</p>
    {fieldError('rasgosPrivados')}

    <fieldset className="contact-fields" aria-describedby="aviso-contacto-help">
      <legend>Contacto adicional (opcional)</legend>
      <p id="aviso-contacto-help" className="help">Solo si quieres dejar otra forma de contactarte. No se rellena con el correo de tu cuenta.</p>
      <label htmlFor="aviso-contactoEmail">Correo de contacto</label>
      <input {...common('contactoEmail')} type="email" maxLength={EMAIL_MAX} autoComplete="off" aria-describedby={describedBy('contactoEmail')} />
      {fieldError('contactoEmail')}
      <label htmlFor="aviso-contactoTelefono">Teléfono de contacto</label>
      <input {...common('contactoTelefono')} type="tel" autoComplete="off" aria-describedby={describedBy('contactoTelefono')} />
      {fieldError('contactoTelefono')}
    </fieldset>

    <p className="aviso-legal" role="note">{AVISO_LEGAL}</p>
  </>;
}
