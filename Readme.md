# Lost&Found UEx

Monolito JavaScript: backend Express, frontend React y PostgreSQL. Implementación actual: registro local US-001 (SCRUM-83), según el diseño SCRUM-85.

La [guía del registro](docs/development/US-001-registro.md) explica instalación, configuración, estructura, contrato API y pruebas para SCRUM-84. Inicio de sesión: [US-002](docs/development/US-002-inicio-sesion.md). Perfil: [US-005](docs/development/US-005-perfil.md).

Inicio rápido con Node.js 22.12+ y Docker Desktop activo:

```powershell
npm.cmd ci
Copy-Item .env.example .env
docker compose up -d --wait db
npm.cmd run db:migrate
npm.cmd run dev
```

Si `.env` ya existe, conservarlo y revisar sus valores. Usar únicamente datos ficticios. Para ejecutar el monolito compilado: `npm.cmd run build` y `npm.cmd start`.

Pruebas: `npm.cmd test` (API y React), `npm.cmd run test:db` (PostgreSQL real independiente), `npm.cmd run test:monolith` (arranque compilado, archivos React y registro HTTP).

Publicar hallazgos (US-008: SCRUM-49, API; SCRUM-105, almacenamiento; SCRUM-103, formulario):

- Tras actualizar, ejecutar `npm.cmd run db:migrate` (migración `007-hallazgos.sql`) y, solo en desarrollo, `npm.cmd run db:seed-dev`, que carga unas facultades y categorías iniciales hasta que US-023 permita administrarlas. Es idempotente.
- Pantalla: con sesión iniciada, «Publicar un hallazgo» en la portada (`#publicar-hallazgo`).
- Cualquier cuenta autenticada y activa puede publicar y elige la facultad donde se entregará el objeto. La tabla `asignaciones_conserje` queda preparada para cuando la publicación se reserve a Conserjería (US-025).
- Hallazgo, rasgos privados y fotos se guardan en una única transacción de PostgreSQL: si algo falla, no queda nada guardado. El servidor vuelve a comprobar cuenta, facultad y categoría dentro de la transacción. Las fotos se guardan en la base de datos (BYTEA) ya verificadas y sin metadatos; nunca se usa el nombre del archivo del cliente.
- Los rasgos privados van en su propia tabla y no se devuelven en ninguna respuesta pública.
- `GET /api/hallazgos/opciones`: con sesión; devuelve `{ facultades: [{ id, nombre }], categorias: [{ id, nombre }] }` activas.
- `POST /api/hallazgos`: con sesión y origen permitido; multipart con un campo `datos` (JSON) y entre 1 y 5 archivos `imagenes`, JPG/PNG de hasta 5 MiB cada uno. JSON: `{ "facultadId": "UUID-de-facultad", "categoriaId": "UUID-de-categoria", "descripcion": "Objeto ficticio", "fechaHallazgo": "2026-01-01", "latitud": 0, "longitud": 0, "puntoEntrega": "Conserjería ficticia", "rasgosPrivados": "No publicar" }`. Los dos últimos textos son opcionales. Autor y estado los fija el servidor.
- Límites técnicos del contrato: textos de hasta 2000 caracteres, fecha existente no futura (UTC), coordenadas numéricas y hasta 16 megapíxeles por foto.
- Respuesta 201: `{ message: "Hallazgo publicado correctamente.", hallazgo: { id, estado: "Activo" } }`. Errores 400 de campos incluyen `errors`; también puede responder 401, 403, 413, 415, 429 y 500.
- Pruebas: `server/tests/hallazgos.test.js` (API), `client/src/PublishFindingPage.test.jsx` (formulario), `server/tests/hallazgos.postgres.test.js` (sesiones reales) y `server/tests/hallazgos-storage.postgres.test.js` (guardado atómico, rasgos separados y fotos sin metadatos).

Buscar hallazgos (US-009: SCRUM-107, API; SCRUM-51, pantalla):

- `GET /api/hallazgos`: con sesión. Solo hallazgos `Activo`, del más reciente al más antiguo. Parámetros opcionales: `q` (palabras de la descripción pública, hasta 100 caracteres; deben aparecer todas, sin distinguir mayúsculas), `categoriaId`, `facultadId`, `fechaDesde` y `fechaHasta` (`AAAA-MM-DD`, fecha del hallazgo, ambas incluidas), `pagina` (desde 1), `tamano` (1–50, por defecto 12) y `corte`. Un parámetro desconocido o repetido responde 400.
- Respuesta 200: `{ hallazgos: [{ id, categoria: { id, nombre }, facultad: { id, nombre }, descripcion, fechaHallazgo, ubicacion: { latitud, longitud, puntoEntrega }, estado, publicadoEn, imagenes: ["/api/hallazgos/{id}/imagenes/1"] }], paginacion: { pagina, tamano, total, totalPaginas, anterior, siguiente, corte } }`. `anterior` y `siguiente` son números de página o `null`.
- Paginación: enviar en las páginas siguientes el mismo `corte` que devolvió la primera. Así los hallazgos publicados mientras tanto no desplazan resultados (sin duplicados ni huecos). Una búsqueda nueva o un cambio de filtros se hace sin `corte`.
- Sin resultados: 200 con `hallazgos: []` y `message` («Todavía no hay hallazgos activos.» o «No hay hallazgos activos que coincidan con la búsqueda.»). Página inexistente: 404 «La página solicitada no existe.» con `errors.pagina`. Filtros no válidos: 400 con `errors` por campo. También 401, 429 y 503.
- Privacidad: nunca se devuelven rasgos privados, autor ni correo, y los rasgos no son buscables. Las coordenadas se redondean a 3 decimales (unos 100 m).
- `GET /api/hallazgos/{id}/imagenes/{1-5}`: con sesión; devuelve la foto (JPG/PNG) si el hallazgo sigue Activo, si no 404. Las URL de `imagenes` sirven directamente para `<img src>`.
- Pruebas: `server/tests/hallazgos-busqueda.test.js` (API y validación) y `server/tests/hallazgos-busqueda.postgres.test.js` (paginación con cero, uno y varios bloques, corte, filtros y estados en PostgreSQL real).

Gestionar hallazgos propios (US-010: SCRUM-114, API; SCRUM-113, pantalla):

- Tras actualizar, ejecutar `npm.cmd run db:migrate` (migración `008-historial-hallazgos.sql`).
- Pantalla: con sesión iniciada, «Mis hallazgos» en la portada (`#mis-hallazgos`). Lista los hallazgos propios en cualquier estado. El detalle muestra fotos, rasgos privados e historial. Mientras el hallazgo está Activo se puede editar, marcar como devuelto o retirar, con motivo opcional y confirmación. Un hallazgo Devuelto o Retirado no se puede volver a activar.
- `GET /api/hallazgos/mios`: con sesión; `{ hallazgos: [{ id, descripcion, fechaHallazgo, estado, categoria, facultad, publicadoEn, imagen }] }`, del más reciente al más antiguo. `imagen` es la URL de la primera foto o `null`.
- Solo para el autor (un hallazgo ajeno responde 404):
  - `GET /api/hallazgos/{id}`: detalle con rasgos privados e `imagenes: [{ id, posicion, mime }]`.
  - `GET /api/hallazgos/{id}/imagenes/{imagenId}`: foto por su UUID, en cualquier estado.
  - `GET /api/hallazgos/{id}/historial`: cambios de estado con fecha, usuario y motivo.
  - `PATCH /api/hallazgos/{id}`: JSON solo con los campos modificados. Responde 409 si el hallazgo ya no está Activo.
  - `PATCH /api/hallazgos/{id}/estado`: `{ "estado": "Devuelto" | "Retirado", "motivo": "opcional" }`.
- Las fotos públicas de la búsqueda usan la misma forma de URL con una posición del 1 al 5 (`/imagenes/1`). Con un UUID se sirve la foto privada del autor.
- Pruebas: `server/tests/gestion-hallazgos.test.js` y `server/tests/mis-hallazgos.test.js` (API), `client/src/MyFindingsPage.test.jsx` (pantalla), `server/tests/hallazgos-storage.postgres.test.js` y `server/tests/mis-hallazgos.postgres.test.js` (PostgreSQL real).

Publicar avisos de pérdida (US-013: SCRUM-109, API; SCRUM-52, formulario de Luis):

- Ejecutar `npm.cmd run db:migrate` después de actualizar: `009-avisos.sql` crea `centros`, `avisos` y `aviso_datos_privados`, sin borrar datos ni añadir ejemplos. Categorías y facultades reutilizan los catálogos de hallazgos. Si están vacíos en desarrollo, el comando existente `npm.cmd run db:seed-dev` carga datos ficticios; no se requiere un centro para publicar.
- `GET /api/avisos/opciones`, con sesión: `{ categorias: [{ id, nombre }], facultades: [{ id, nombre }], centros: [{ id, nombre, facultadId }] }`. Solo opciones activas. Para un centro se exige que su facultad también esté activa.
- `POST /api/avisos`, con sesión, origen permitido y `Content-Type: application/json`. Obligatorios: `categoriaId`, `descripcion`, `fechaPerdida` y **una facultad o un centro** (`facultadId` o `centroId`). Si se envían ambos, deben corresponderse. Al seleccionar solo un centro, el servidor obtiene su facultad. Opcionales: `centroId`, `rasgosPrivados`, `contactoEmail` y `contactoTelefono`; pueden omitirse, ser `null` o textos vacíos. Nunca enviar `autorId` ni `estado`: los fija el servidor.

```json
{
  "categoriaId": "UUID-del-catalogo",
  "facultadId": "UUID-del-catalogo",
  "descripcion": "He perdido una mochila ficticia",
  "fechaPerdida": "2026-01-15",
  "rasgosPrivados": "Detalle que no debe salir en el feed",
  "contactoEmail": "contacto@example.com",
  "contactoTelefono": "600000000"
}
```

- Límites técnicos de implementación (no horas ni requisitos nuevos del profesor): descripción y rasgos de hasta 2000 caracteres; fecha aproximada `AAAA-MM-DD`, existente y no futura según UTC; correo opcional válido de hasta 254 caracteres y teléfono opcional de 9 cifras con `+34` opcional, como el perfil. Sin fotos: esta historia publica avisos, no hallazgos.
- Respuesta 201: `{ message: "Aviso de pérdida publicado correctamente.", aviso: { id, estado: "Activo" } }`. Guarda el autor de la sesión y todo el aviso en una transacción; no crea hallazgos ni solicitudes. Los rasgos y los contactos voluntarios quedan en `aviso_datos_privados`, separados de `avisos`, y no se devuelven en esta respuesta ni se copian desde el perfil.
- Errores: 400 `{ message, errors: { nombreCampo: "Explicación" } }`, incluidos catálogos inexistentes/inactivos o centro de otra facultad; 401 sin sesión/cuenta desactivada; 403 origen no autorizado; 413 más de 32 KiB; 415 sin JSON; 429 más de 30 publicaciones por IP en 15 minutos; 503 sin almacenamiento configurado; 500 error interno sin detalles privados. No se guardan filas ante errores de validación o un fallo de la transacción.
- **Conexión para Luis**: importar `getAvisoOptions` y `publishAviso` de `client/src/api/avisos.js`. Cargar catálogos al abrir el formulario, enviar sus UUID y mostrar `error.errors[campo]` como texto. Usan la cookie de sesión existente; no se añade JWT ni almacenamiento de credenciales. Tras 201 mostrar confirmación; ante un fallo de red no repetir automáticamente el POST porque podría haberse guardado. Deshabilitar el botón mientras se envía.
- El formulario debe mostrar el aviso de US-013-AC-07: «Este aviso no inicia una solicitud de recuperación ni implica que el objeto esté bajo custodia de la Universidad». El campo de contacto es voluntario: no rellenarlo con el correo de la cuenta sin decisión del usuario.
- Pantalla (SCRUM-52): con sesión iniciada, «Publicar un aviso de pérdida» en la portada (`#publicar-aviso`). Pide categoría, descripción pública, fecha aproximada y facultad o centro (solo se ofrecen los centros de la facultad elegida); rasgos privados, correo y teléfono de contacto son opcionales y empiezan vacíos. Valida en el navegador lo mismo que el servidor, muestra los errores por campo, desactiva el botón mientras envía y muestra el aviso de US-013-AC-07.
- El feed pertenece a US-014. Al conectarlo, consultar solo los campos públicos de `avisos` y no incluir `aviso_datos_privados` ni el correo del autor.
- Pruebas: `server/tests/avisos.test.js` (API, validación y permisos), `client/src/api/avisos.test.jsx` (contrato del módulo para React), `server/tests/avisos.postgres.test.js` (persistencia real, opciones activas, selección de centro, privacidad y rollback) y `client/src/PublishLostNoticePage.test.jsx` (formulario). La de PostgreSQL ya está incluida en `npm.cmd run test:db`.

### Consultar el feed de avisos de pérdida (US-014: SCRUM-57)

- `GET /api/avisos`: consulta paginada de avisos de pérdida activos. Requiere una sesión válida.
- Parámetros opcionales:
  - `pagina`: entero positivo, por defecto 1.
  - `tamano`: entero entre 1 y 50, por defecto 12.
- Los avisos se ordenan del más reciente al más antiguo.
- La respuesta incluye `avisos` y `paginacion`.
- Cada aviso contiene id, categoría, facultad, centro (si existe), descripción pública, fecha aproximada de pérdida y estado.
- La paginación incluye `pagina`, `tamano`, `total`, `totalPaginas`, `anterior` y `siguiente`.
- No se devuelven rasgos privados, datos del autor, correo electrónico ni teléfono de contacto.
- El feed de avisos es independiente del listado de hallazgos.
- Si no existen avisos activos, responde 200 con un listado vacío y un mensaje informativo.
- Si los parámetros de paginación son incorrectos, responde 400.
- Si la página solicitada no existe, responde 404.
- Sin sesión válida, responde 401.
- Sin almacenamiento disponible, responde 503.
- Pantalla accesible desde la portada mediante «Consultar avisos de pérdida» (`#feed-avisos`).
- Pruebas:
  - `server/tests/avisos.test.js`
  - `server/tests/avisos.postgres.test.js`
  - `client/src/api/avisos.test.jsx`
  - `client/src/FeedAvisosPage.test.jsx`

### Buscar y filtrar avisos de pérdida (US-015: SCRUM-119)

- Amplía `GET /api/avisos` (US-014) con filtros opcionales, combinables entre sí y con la paginación:
  - `q`: texto de hasta 100 caracteres. Se separa en palabras (como mucho 10) y cada una debe aparecer en algún campo público del aviso: descripción, categoría, facultad o centro. No distingue mayúsculas; `%`, `_` y `\` se buscan como texto literal.
  - `categoriaId`, `facultadId` y `centroId`: UUID. Filtrar por facultad incluye los avisos de sus centros.
  - Un parámetro vacío equivale a no filtrar.
- Siempre devuelve solo avisos `Activos`. Nunca busca ni ordena por datos privados (`aviso_datos_privados`: rasgos y contacto) ni por el autor.
- Sin coincidencias: 200 con `avisos: []` y el mensaje «No hay avisos activos que coincidan con la búsqueda.». Sin filtros, se mantiene el mensaje de US-014.
- 400 con `errors[campo]` si un filtro no es un UUID, el texto supera 100 caracteres, un parámetro se repite o se envía uno desconocido. El mensaje es «Revisa los filtros de búsqueda.»; si solo falla la paginación, sigue siendo «Revisa los parámetros de paginación.».
- Cliente: `getAvisos(pagina, tamano, { q, categoriaId, facultadId, centroId })` en `client/src/api/avisos.js`; los filtros vacíos no se envían.
- Pantalla `#feed-avisos`: formulario «Buscar avisos» con texto, categoría, facultad y centro (solo los de la facultad elegida). Al buscar vuelve a la primera página; «Limpiar filtros» recupera el feed completo. Si no cargan los catálogos, se puede seguir buscando por texto. Los resultados no ofrecen ninguna acción de recuperación (US-015-AC-06).
- Pruebas: las mismas cuatro de US-014, con los casos de búsqueda marcados como SCRUM-119 / US-015.

### Editar un aviso propio (US-016: SCRUM-122, API; SCRUM-60, pantalla de Luis)

Todas las rutas exigen sesión y solo actúan sobre los avisos del usuario de la sesión. Un aviso de otra persona responde igual que uno inexistente (404), sin revelar que existe.

- `GET /api/avisos/mios`: avisos propios en cualquier estado, del más reciente al más antiguo (hasta 200). Cada uno: `{ id, descripcion, fechaPerdida, estado, categoria, facultad, centro, publicadoEn, actualizadoEn }`, con los nombres de los catálogos.
- `GET /api/avisos/:id`: `{ aviso: { id, categoriaId, facultadId, centroId, descripcion, fechaPerdida, estado, rasgosPrivados, contactoEmail, contactoTelefono, publicadoEn, actualizadoEn, editable } }`. Incluye los datos privados porque solo lo ve su autor. `editable` es `true` mientras el aviso esté `Activo`.
- `PUT /api/avisos/:id`, con origen permitido y `Content-Type: application/json`: recibe el aviso completo, con los mismos 8 campos y las mismas reglas que `POST /api/avisos`. Nunca se aceptan `id`, `autorId` ni `estado`.
  - 200: `{ message: "Aviso actualizado correctamente.", aviso: { id, estado: "Activo" } }`.
  - 400 con `errors[campo]` si algún dato no es válido o un catálogo no existe o está inactivo; 404 si no existe o es ajeno; 409 «Solo se pueden editar avisos activos.» si ya no está `Activo`.
  - Se guarda en una transacción que bloquea el aviso. Conserva el autor, el estado y la fecha de publicación, y actualiza `updated_at`. Si se vacían todos los datos privados, se borra su fila en `aviso_datos_privados`. No toca hallazgos ni solicitudes.
- **Conexión para Luis:** en `client/src/api/avisos.js`, `getMyAvisos()`, `getMyAviso(id)` y `updateAviso(id, datos)`. El `aviso` de `getMyAviso` se puede pasar tal cual a `<EditLostNoticeForm aviso={...} />`, y su `onSubmit` puede ser `datos => updateAviso(id, datos)`. Si `editable` es `false`, no mostrar el formulario.
- Sin migraciones nuevas.
- Pruebas: `server/tests/avisos.test.js`, `server/tests/avisos.postgres.test.js` y `client/src/api/avisos.test.jsx`, en los bloques SCRUM-122 / US-016.

Recuperación de contraseña (SCRUM-43, API; SCRUM-94, pantallas React):

- Arrancar el buzón local con `docker compose up -d mail` y abrir `http://localhost:8025`. Solo captura correos de pruebas; no los entrega por Internet.
- Conservar el `.env` existente y añadir `SMTP_TEST_PORT=1025` y `RECOVERY_APP_ORIGIN=http://localhost:5173` (usar `http://localhost:3000` para el monolito compilado). Ejecutar `npm.cmd run db:migrate` para preparar las tablas sin borrar los datos.
- `POST /api/auth/forgot-password`, JSON `{ "email": "persona@example.com" }`: devuelve la misma confirmación para cuentas elegibles, inexistentes, inactivas y solicitudes limitadas por correo. El enlace aparece solo en el buzón de pruebas. Si SMTP falla se registra un error genérico y se conserva la misma confirmación; no se garantiza la entrega.
- `POST /api/auth/reset-password`, JSON `{ "token": "token-del-correo", "password": "Nueva1234", "confirmPassword": "Nueva1234" }`: cambia la contraseña, consume el enlace y elimina las sesiones de la cuenta en una sola transacción. No inicia sesión automáticamente.
- Desde el inicio de sesión, pulsar «He olvidado mi contraseña», solicitar el enlace y abrirlo en Mailpit. El enlace `/#restablecer-contrasena?token=...` abre el formulario de nueva contraseña. Tras completar el cambio se elimina el token de la URL y se vuelve al inicio de sesión, sin autenticar automáticamente.
- Al abrirlo se comprueba su vigencia con `POST /api/auth/validate-reset-token`, JSON `{ "token": "token-del-correo" }`. Si ha caducado, se ha sustituido o se ha usado, se muestra «Enlace expirado o no válido» sin mostrar el formulario. Esta consulta no consume el enlace; al guardar la contraseña se vuelve a validar dentro de la transacción.
- La prueba `server/tests/recovery.postgres.test.js` verifica el servidor con PostgreSQL y un buzón SMTP efímero, sin necesitar Docker ni enviar mensajes reales. Las pruebas de `client/src/RecoveryForms.test.jsx` verifican las pantallas y el contrato HTTP.

### Crear solicitudes de recuperación (US-018 / SCRUM-64)

Aplica la migración `011-solicitudes-recuperacion.sql` con `npm.cmd run db:migrate`.
El formulario de SCRUM-127 puede enviar `POST /api/hallazgos/:id/solicitudes` con
la cookie de sesión y un JSON `{ "justificacion": "..." }`. Se requiere una
cuenta de Usuario y una justificación de entre 1 y 2000 caracteres. La API
responde con `201` y `{ solicitud: { id, hallazgoId, estado, creadaEn } }`.
El estado inicial es `Pendiente`. Un hallazgo inexistente devuelve `404`.
Un hallazgo inactivo o una solicitud pendiente duplicada devuelve `409`.
La justificación queda almacenada de forma privada y no se incluye en la
respuesta ni en el listado público de hallazgos.

Formulario de solicitud (US-018 / SCRUM-127):

- En `#buscar-hallazgos`, cada resultado `Activo` tiene el botón «Solicitar recuperación». Abre el formulario encima de los resultados, que siguen visibles.
- El formulario identifica el hallazgo (descripción, categoría, facultad y fecha) y pide la «Justificación de propiedad»: obligatoria, de hasta 2000 caracteres, con contador. Explica que solo la verán el usuario y el Conserje de la facultad del hallazgo, y que enviar la solicitud no reserva el objeto ni lo retira del listado.
- Valida antes de enviar y no envía dos veces. Con 201 muestra «Solicitud enviada. Estado: Pendiente.»; con 400 muestra el error junto al campo; con 409 muestra el motivo que da el servidor (hallazgo ya no activo o solicitud pendiente duplicada); con 401 ofrece iniciar sesión.
- Módulo HTTP: `createSolicitud(hallazgoId, justificacion)` en `client/src/api/solicitudes.js`. Solo envía la justificación; nunca el solicitante ni el estado.
- Pruebas: `client/src/api/solicitudes.test.jsx`, `client/src/RecoveryRequestForm.test.jsx` y los casos SCRUM-127 de `client/src/SearchFindingsPage.test.jsx`.

### Consultar el estado de mis solicitudes (US-019 / SCRUM-130)

Requiere la migración `012-decisiones-solicitudes.sql` de SCRUM-131 (`npm.cmd run db:migrate`).

- Pantalla `#mis-solicitudes`, enlazada desde el inicio («Mis solicitudes de recuperación») y desde la confirmación del formulario de US-018 («Ver mis solicitudes»).
- Lista las solicitudes propias (`GET /api/solicitudes/mias`) con el hallazgo, su categoría, facultad y fecha, la fecha de envío y el estado (Pendiente, Validada o Rechazada).
- «Ver detalle» carga `GET /api/solicitudes/:id` y muestra también la justificación propia. Si está Validada muestra las instrucciones de recogida; si está Rechazada, el motivo del rechazo. Una solicitud Pendiente no muestra ninguna decisión.
- Es de solo lectura: no hay controles para cambiar el estado ni la decisión. Sin solicitudes enlaza a la búsqueda de hallazgos; con 404 indica que la solicitud no existe o no es propia; con 401 ofrece iniciar sesión.
- Módulo HTTP: `getMisSolicitudes()` y `getMiSolicitud(id)` en `client/src/api/solicitudes.js`.
- Pruebas: `client/src/MyRequestsPage.test.jsx` y los casos SCRUM-130 de `client/src/api/solicitudes.test.jsx`.
