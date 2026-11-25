import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import { hashPassword } from '../src/security/passwords.js';
import { createApp } from '../src/app.js';
import { validateAviso } from '../src/validation/avisos.js';

const USER = '33333333-3333-4333-8333-333333333333';
const CATEGORY = '11111111-1111-4111-8111-111111111111';
const FACULTY = '22222222-2222-4222-8222-222222222222';
const ID = '44444444-4444-4444-8444-444444444444';
const CENTRO = '55555555-5555-4555-8555-555555555555';
const SIN_FILTROS = { terminos: [], categoriaId: null, facultadId: null, centroId: null };
const valid = () => ({ categoriaId: CATEGORY, facultadId: FACULTY,
  descripcion: '  Mochila ficticia perdida  ', fechaPerdida: '2026-01-15' });
let passwordHash;
beforeAll(async () => { passwordHash = await hashPassword('Prueba1234'); });

async function fixture({ login = true, unavailable = false } = {}) {
  const user = { id: USER, email: 'persona@example.com', password_hash: passwordHash, rol: 'USUARIO', activo: true };
  const storage = {
    options: vi.fn(async () => ({
      categorias: [{ id: CATEGORY, nombre: 'Mochilas', privado: 'secreto' }],
      facultades: [{ id: FACULTY, nombre: 'Facultad ficticia' }],
      centros: [{ id: CENTRO, nombre: 'Centro ficticio', facultadId: FACULTY, otro: 'secreto' }],
    })),
    close: vi.fn(async (userId, id, motivo) => ({ id, estado: 'Cerrado', motivoCierre: motivo })),
    publish: vi.fn(async () => ({ id: ID, rasgos: 'secreto', email: user.email })),
    listActive: vi.fn(async () => ({
      avisos: [
        {
          id: ID,
          categoria: { id: CATEGORY, nombre: 'Mochilas' },
          facultad: { id: FACULTY, nombre: 'Facultad ficticia' },
          centro: { id: CENTRO, nombre: 'Centro ficticio' },
          descripcion: 'Mochila perdida',
          fechaPerdida: '2026-01-15',
          estado: 'Activo',
          autorId: USER,
          rasgosPrivados: 'Detalle secreto',
          contactoEmail: 'privado@example.com',
          contactoTelefono: '600000000',
        },
      ],
      total: 1,
    })),
    listOwn: vi.fn(async () => [{
      id: ID, descripcion: 'Mochila perdida', fechaPerdida: '2026-01-15', estado: 'Activo',
      categoria: 'Mochilas', facultad: 'Facultad ficticia', centro: null,
      publicadoEn: '2026-01-16T10:00:00.000Z', actualizadoEn: '2026-01-16T10:00:00.000Z',
      autorId: USER, rasgos: 'secreto',
    }]),
    getOwn: vi.fn(async () => ({
      id: ID, categoriaId: CATEGORY, facultadId: FACULTY, centroId: CENTRO,
      descripcion: 'Mochila perdida', fechaPerdida: '2026-01-15', estado: 'Activo',
      rasgosPrivados: 'Llavero rojo', contactoEmail: 'contacto@example.com', contactoTelefono: null,
      publicadoEn: '2026-01-16T10:00:00.000Z', actualizadoEn: '2026-01-16T10:00:00.000Z',
      autorId: USER, password_hash: 'secreto',
    })),
    update: vi.fn(async (_userId, id) => ({ id })),
  };
  const app = createApp({ users: { findByEmail: async () => user, findById: async () => user },
    ...(unavailable ? {} : { avisoStorage: storage }), avisoLimit: 2,
    sessionMiddleware: session({ secret: 'secreto-ficticio-avisos-largo-mas-de-32', resave: false, saveUninitialized: false }) });
  const agent = request.agent(app);
  if (login) expect((await agent.post('/api/auth/login').send({ email: user.email, password: 'Prueba1234' })).status).toBe(200);
  const publish = body => agent.post('/api/avisos').set('Origin', 'http://localhost:5173').send(body);
  return { agent, storage, user, publish };
}

describe('SCRUM-109: validación del aviso', () => {
  it('normaliza textos y permite no aportar contacto ni rasgos privados', () => {
    expect(validateAviso(valid())).toEqual({ errors: {}, value: {
      categoriaId: CATEGORY, facultadId: FACULTY, centroId: null, descripcion: 'Mochila ficticia perdida',
      fechaPerdida: '2026-01-15', rasgosPrivados: null, contactoEmail: null, contactoTelefono: null,
    } });
  });
  it('permite seleccionar solo un centro, sin inventar una facultad en el cliente', () => {
    expect(validateAviso({ ...valid(), facultadId: '', centroId: CENTRO }).errors).toEqual({});
  });
  it('acepta textos de 2000 caracteres y contacto voluntario válido', () => {
    expect(validateAviso({ ...valid(), descripcion: 'a'.repeat(2000), rasgosPrivados: 'a'.repeat(2000),
      contactoEmail: ' contacto@example.com ', contactoTelefono: ' +34600000000 ' }).errors).toEqual({});
  });
  it.each([
    [{ categoriaId: '' }, 'categoriaId'], [{ categoriaId: 'x' }, 'categoriaId'],
    [{ categoriaId: {} }, 'categoriaId'], [{ facultadId: '' }, 'facultadId'],
    [{ facultadId: 'x' }, 'facultadId'], [{ centroId: 'x' }, 'centroId'],
    [{ descripcion: '  ' }, 'descripcion'], [{ descripcion: 123 }, 'descripcion'],
    [{ descripcion: 'a'.repeat(2001) }, 'descripcion'], [{ rasgosPrivados: [] }, 'rasgosPrivados'],
    [{ rasgosPrivados: 'a'.repeat(2001) }, 'rasgosPrivados'],
    [{ fechaPerdida: '2026-02-30' }, 'fechaPerdida'], [{ fechaPerdida: '2026-13-01' }, 'fechaPerdida'],
    [{ fechaPerdida: '0000-01-01' }, 'fechaPerdida'], [{ fechaPerdida: '2999-01-01' }, 'fechaPerdida'],
    [{ fechaPerdida: '' }, 'fechaPerdida'], [{ fechaPerdida: {} }, 'fechaPerdida'],
    [{ contactoEmail: 'x' }, 'contactoEmail'], [{ contactoEmail: {} }, 'contactoEmail'],
    [{ contactoTelefono: '123' }, 'contactoTelefono'], [{ contactoTelefono: 600000000 }, 'contactoTelefono'],
    [{ autorId: USER }, 'aviso'], [{ estado: 'Cerrado' }, 'aviso'], [{ foto: 'x' }, 'aviso'],
  ])('rechaza %o sin aceptar identidad/estado del cliente', (changes, field) => {
    expect(validateAviso({ ...valid(), ...changes }).errors).toHaveProperty(field);
  });
  it.each([null, [], 'texto', 12])('rechaza cuerpos distintos de un objeto: %s', body => {
    expect(validateAviso(body).errors).toHaveProperty('aviso');
  });
});

describe('SCRUM-109: contrato HTTP', () => {
  it('sin sesión no permite publicar ni consultar opciones', async () => {
    const { agent, publish, storage } = await fixture({ login: false });
    expect((await publish(valid())).status).toBe(401);
    expect((await agent.get('/api/avisos/opciones')).status).toBe(401);
    expect(storage.publish).not.toHaveBeenCalled();
  });
  it('publica con autor de sesión y responde solo id y estado', async () => {
    const { publish, storage } = await fixture();
    const result = await publish({ ...valid(), rasgosPrivados: 'Llave oculta', contactoEmail: 'contacto@example.com' });
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ message: 'Aviso de pérdida publicado correctamente.', aviso: { id: ID, estado: 'Activo' } });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(storage.publish).toHaveBeenCalledWith(USER, expect.objectContaining({ descripcion: 'Mochila ficticia perdida',
      rasgosPrivados: 'Llave oculta', contactoEmail: 'contacto@example.com' }));
    expect(JSON.stringify(result.body)).not.toContain('secreto');
  });
  it('facilita categorías, facultades y centros sin campos internos', async () => {
    const { agent } = await fixture();
    expect((await agent.get('/api/avisos/opciones')).body).toEqual({
      categorias: [{ id: CATEGORY, nombre: 'Mochilas' }], facultades: [{ id: FACULTY, nombre: 'Facultad ficticia' }],
      centros: [{ id: CENTRO, nombre: 'Centro ficticio', facultadId: FACULTY }],
    });
  });
  it('400 incluye los errores para los controles del formulario y no guarda nada', async () => {
    const { publish, storage } = await fixture();
    expect((await publish({ ...valid(), descripcion: '' })).body.errors).toHaveProperty('descripcion');
    expect(storage.publish).not.toHaveBeenCalled();
  });
  it('una cuenta desactivada pierde acceso con su sesión existente', async () => {
    const { publish, user, storage } = await fixture();
    user.activo = false;
    expect((await publish(valid())).status).toBe(401);
    expect(storage.publish).not.toHaveBeenCalled();
  });
  it.each([
    { Origin: 'https://ajeno.example' }, { 'Sec-Fetch-Site': 'cross-site' }, {},
  ])('rechaza peticiones sin origen autorizado: %o', async headers => {
    const { agent, storage } = await fixture();
    expect((await agent.post('/api/avisos').set(headers).send(valid())).status).toBe(403);
    expect(storage.publish).not.toHaveBeenCalled();
  });
  it('rechaza formatos no JSON, JSON mal formado y cuerpos excesivos', async () => {
    const { agent } = await fixture();
    const post = () => agent.post('/api/avisos').set('Origin', 'http://localhost:5173');
    expect((await post().type('form').send({ descripcion: 'x' })).status).toBe(415);
    expect((await post().type('json').send('{mal')).status).toBe(400);
    // Otra sesión/app evita que el rate limit esconda la comprobación de tamaño.
    const other = await fixture();
    expect((await other.publish({ ...valid(), descripcion: 'a'.repeat(33000) })).status).toBe(413);
  });
  it('limita publicaciones repetidas', async () => {
    const { publish } = await fixture();
    expect((await publish(valid())).status).toBe(201);
    expect((await publish(valid())).status).toBe(201);
    expect((await publish(valid())).status).toBe(429);
  });
  it('sin almacenamiento real responde 503, sin simular éxito', async () => {
    const { publish } = await fixture({ unavailable: true });
    expect((await publish(valid())).status).toBe(503);
  });
  it('un error interno no expone SQL, contactos ni credenciales', async () => {
    const { publish, storage } = await fixture();
    storage.publish.mockRejectedValueOnce(new Error('SQL secreto contacto@example.com'));
    const result = await publish(valid());
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ message: 'No se ha podido completar la operación.' });
  });
});

describe('SCRUM-57 / US-014: feed de avisos', () => {
  it('rechaza la consulta sin sesión', async () => {
    const { agent, storage } = await fixture({ login: false });

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(401);
    expect(storage.listActive).not.toHaveBeenCalled();
  });

  it('devuelve los avisos activos con paginación por defecto', async () => {
    const { agent, storage } = await fixture();

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(200);
    expect(storage.listActive).toHaveBeenCalledWith(1, 12, SIN_FILTROS);
    expect(result.body.avisos).toHaveLength(1);

    expect(result.body.paginacion).toEqual({
      pagina: 1,
      tamano: 12,
      total: 1,
      totalPaginas: 1,
      anterior: false,
      siguiente: false,
    });
  });

  it('devuelve únicamente los campos públicos del aviso', async () => {
    const { agent } = await fixture();

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(200);

    expect(result.body.avisos[0]).toEqual({
      id: ID,
      categoria: { id: CATEGORY, nombre: 'Mochilas' },
      facultad: { id: FACULTY, nombre: 'Facultad ficticia' },
      centro: { id: CENTRO, nombre: 'Centro ficticio' },
      descripcion: 'Mochila perdida',
      fechaPerdida: '2026-01-15',
      estado: 'Activo',
    });

    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('permite consultar distintas páginas de resultados', async () => {
    const { agent, storage } = await fixture();

    const data = await storage.listActive();

    storage.listActive.mockResolvedValue({
      avisos: data.avisos,
      total: 30,
    });

    const result = await agent.get(
      '/api/avisos?pagina=2&tamano=12'
    );

    expect(result.status).toBe(200);
    expect(storage.listActive).toHaveBeenLastCalledWith(2, 12, SIN_FILTROS);

    expect(result.body.paginacion).toEqual({
      pagina: 2,
      tamano: 12,
      total: 30,
      totalPaginas: 3,
      anterior: true,
      siguiente: true,
    });
  });

  it('informa cuando no existen avisos activos', async () => {
    const { agent, storage } = await fixture();

    storage.listActive.mockResolvedValueOnce({
      avisos: [],
      total: 0,
    });

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(200);
    expect(result.body.avisos).toEqual([]);
    expect(result.body.message).toBe(
      'Todavía no hay avisos de pérdida activos.'
    );
  });

  it('devuelve 404 si la página solicitada no existe', async () => {
    const { agent } = await fixture();

    const result = await agent.get('/api/avisos?pagina=2');

    expect(result.status).toBe(404);
    expect(result.body.message).toBe(
      'La página solicitada no existe.'
    );
    expect(result.body.errors).toHaveProperty('pagina');
  });

  it.each([
    ['pagina=0', 'pagina'],
    ['pagina=-1', 'pagina'],
    ['pagina=abc', 'pagina'],
    ['pagina=1.5', 'pagina'],
    ['tamano=0', 'tamano'],
    ['tamano=51', 'tamano'],
    ['tamano=abc', 'tamano'],
    ['tamano=2.5', 'tamano'],
    ['pagina=1e2', 'pagina'],
    ['pagina=0x10', 'pagina'],
    ['pagina=', 'pagina'],
    ['pagina=1&pagina=2', 'pagina'],
    ['tamano=1e1', 'tamano'],
    ['tamano=', 'tamano'],
    ['tamano=12&tamano=20', 'tamano'],
  ])('rechaza paginación incorrecta: %s', async (query, field) => {
    const { agent, storage } = await fixture();

    const result = await agent.get(`/api/avisos?${query}`);

    expect(result.status).toBe(400);
    expect(result.body.errors).toHaveProperty(field);
    expect(storage.listActive).not.toHaveBeenCalled();
  });

  it('impide el acceso a usuarios desactivados', async () => {
    const { agent, user, storage } = await fixture();

    user.activo = false;

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(401);
    expect(storage.listActive).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando no hay almacenamiento disponible', async () => {
    const { agent } = await fixture({ unavailable: true });

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(503);
  });

  it('no expone información privada ante errores internos', async () => {
    const { agent, storage } = await fixture();

    storage.listActive.mockRejectedValueOnce(
      new Error('SQL secreto privado@example.com')
    );

    const result = await agent.get('/api/avisos');

    expect(result.status).toBe(500);
    expect(result.body.message).toBe(
      'No se ha podido completar la operación.'
    );
    expect(JSON.stringify(result.body)).not.toContain('secreto');
  });
});

describe('SCRUM-119 / US-015: búsqueda y filtros de avisos', () => {
  it('AC-01/AC-02/AC-04: combina texto, categoría, facultad y centro en una sola consulta', async () => {
    const { agent, storage } = await fixture();
    const query = new URLSearchParams({
      q: '  mochila   AZUL ', categoriaId: CATEGORY, facultadId: FACULTY, centroId: CENTRO, pagina: '1', tamano: '5',
    });

    const result = await agent.get(`/api/avisos?${query}`);

    expect(result.status).toBe(200);
    expect(storage.listActive).toHaveBeenCalledWith(1, 5, {
      terminos: ['mochila', 'AZUL'], categoriaId: CATEGORY, facultadId: FACULTY, centroId: CENTRO,
    });
    expect(result.body.avisos[0]).not.toHaveProperty('rasgosPrivados');
  });

  it('un texto vacío o solo con espacios equivale a no filtrar', async () => {
    const { agent, storage } = await fixture();

    const result = await agent.get('/api/avisos?q=%20%20&categoriaId=');

    expect(result.status).toBe(200);
    expect(storage.listActive).toHaveBeenCalledWith(1, 12, SIN_FILTROS);
  });

  it('usa como mucho 10 palabras del texto', async () => {
    const { agent, storage } = await fixture();
    const palabras = Array.from({ length: 12 }, (_, i) => `p${i}`);

    await agent.get(`/api/avisos?q=${palabras.join('+')}`);

    expect(storage.listActive.mock.calls[0][2].terminos).toEqual(palabras.slice(0, 10));
  });

  it('AC-05: informa de forma comprensible cuando no hay coincidencias', async () => {
    const { agent, storage } = await fixture();
    storage.listActive.mockResolvedValueOnce({ avisos: [], total: 0 });

    const result = await agent.get('/api/avisos?q=paraguas');

    expect(result.status).toBe(200);
    expect(result.body.avisos).toEqual([]);
    expect(result.body.message).toBe('No hay avisos activos que coincidan con la búsqueda.');
  });

  it('una página fuera de rango con filtros sigue respondiendo 404', async () => {
    const { agent } = await fixture();

    const result = await agent.get(`/api/avisos?categoriaId=${CATEGORY}&pagina=3`);

    expect(result.status).toBe(404);
    expect(result.body.errors).toHaveProperty('pagina');
  });

  it.each([
    ['categoriaId=no-es-un-uuid', 'categoriaId'],
    ['facultadId=123', 'facultadId'],
    ['centroId=abc', 'centroId'],
    [`q=${'a'.repeat(101)}`, 'q'],
    ['q=uno&q=dos', 'q'],
    [`categoriaId=${CATEGORY}&categoriaId=${CATEGORY}`, 'categoriaId'],
    ['autorId=33333333-3333-4333-8333-333333333333', 'parametros'],
    ['rasgos=llave', 'parametros'],
  ])('rechaza filtros incorrectos sin consultar: %s', async (query, field) => {
    const { agent, storage } = await fixture();

    const result = await agent.get(`/api/avisos?${query}`);

    expect(result.status).toBe(400);
    expect(result.body.message).toBe('Revisa los filtros de búsqueda.');
    expect(result.body.errors).toHaveProperty(field);
    expect(storage.listActive).not.toHaveBeenCalled();
  });

  it('acepta un texto de 100 caracteres', async () => {
    const { agent, storage } = await fixture();

    const result = await agent.get(`/api/avisos?q=${'a'.repeat(100)}`);

    expect(result.status).toBe(200);
    expect(storage.listActive).toHaveBeenCalledTimes(1);
  });

  it('los errores solo de paginación mantienen su mensaje', async () => {
    const { agent } = await fixture();

    const result = await agent.get('/api/avisos?pagina=0');

    expect(result.status).toBe(400);
    expect(result.body.message).toBe('Revisa los parámetros de paginación.');
  });
});
describe('SCRUM-62: API de cierre', () => {
  const close = (agent, body, id = ID) => agent.post(`/api/avisos/${id}/cierre`)
    .set('Origin', 'http://localhost:5173').send(body);

  it('obtiene el autor de la sesión y normaliza el motivo', async () => {
    const { agent, storage } = await fixture();
    const result = await close(agent, { motivo: ' Objeto recuperado ', autorId: CATEGORY });
    expect(result.status).toBe(200);
    expect(result.body.aviso.estado).toBe('Cerrado');
    expect(storage.close).toHaveBeenCalledWith(USER, ID, 'Objeto recuperado');
  });

  it('rechaza motivos vacíos, inválidos o demasiado largos y avisos con ID inválido', async () => {
    const { agent, storage } = await fixture();
    for (const motivo of [' ', 123, 'a'.repeat(501)]) {
      expect((await close(agent, { motivo })).status).toBe(400);
    }
    expect((await close(agent, { motivo: 'Recuperado' }, 'invalido')).status).toBe(404);
    expect(storage.close).not.toHaveBeenCalled();
  });

  it('exige sesión y origen permitido', async () => {
    const anonymous = await fixture({ login: false });
    expect((await close(anonymous.agent, { motivo: 'Recuperado' })).status).toBe(401);
    const { agent, storage } = await fixture();
    const result = await agent.post(`/api/avisos/${ID}/cierre`)
      .set('Origin', 'https://example.org').send({ motivo: 'Recuperado' });
    expect(result.status).toBe(403);
    expect(storage.close).not.toHaveBeenCalled();
  });
});

describe('SCRUM-122 / US-016: consulta y edición de avisos propios', () => {
  const editar = (agent, body, id = ID) =>
    agent.put(`/api/avisos/${id}`).set('Origin', 'http://localhost:5173').send(body);

  it('sin sesión no permite listar, consultar ni editar', async () => {
    const { agent, storage } = await fixture({ login: false });

    expect((await agent.get('/api/avisos/mios')).status).toBe(401);
    expect((await agent.get(`/api/avisos/${ID}`)).status).toBe(401);
    expect((await editar(agent, valid())).status).toBe(401);
    expect(storage.listOwn).not.toHaveBeenCalled();
    expect(storage.getOwn).not.toHaveBeenCalled();
    expect(storage.update).not.toHaveBeenCalled();
  });

  it('lista los avisos del usuario de la sesión sin campos internos', async () => {
    const { agent, storage } = await fixture();

    const result = await agent.get('/api/avisos/mios');

    expect(result.status).toBe(200);
    expect(storage.listOwn).toHaveBeenCalledWith(USER);
    expect(result.body.avisos).toEqual([{
      id: ID, descripcion: 'Mochila perdida', fechaPerdida: '2026-01-15', estado: 'Activo',
      categoria: 'Mochilas', facultad: 'Facultad ficticia', centro: null,
      publicadoEn: '2026-01-16T10:00:00.000Z', actualizadoEn: '2026-01-16T10:00:00.000Z',
    }]);
  });

  it('devuelve al autor su aviso con los datos privados, listo para el formulario', async () => {
    const { agent, storage } = await fixture();

    const result = await agent.get(`/api/avisos/${ID}`);

    expect(result.status).toBe(200);
    expect(storage.getOwn).toHaveBeenCalledWith(USER, ID);
    expect(result.body.aviso).toEqual({
      id: ID, categoriaId: CATEGORY, facultadId: FACULTY, centroId: CENTRO,
      descripcion: 'Mochila perdida', fechaPerdida: '2026-01-15', estado: 'Activo',
      rasgosPrivados: 'Llavero rojo', contactoEmail: 'contacto@example.com', contactoTelefono: null,
      publicadoEn: '2026-01-16T10:00:00.000Z', actualizadoEn: '2026-01-16T10:00:00.000Z', editable: true,
    });
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('AC-05: un aviso ajeno o inexistente responde 404 sin datos', async () => {
    const { agent, storage } = await fixture();
    storage.getOwn.mockResolvedValueOnce(null);

    const result = await agent.get(`/api/avisos/${ID}`);

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ message: 'Aviso no encontrado.' });
  });

  it('un id que no es UUID responde 404 sin consultar ni guardar', async () => {
    const { agent, storage } = await fixture();

    expect((await agent.get('/api/avisos/no-es-un-id')).status).toBe(404);
    expect((await editar(agent, valid(), 'no-es-un-id')).status).toBe(404);
    expect(storage.getOwn).not.toHaveBeenCalled();
    expect(storage.update).not.toHaveBeenCalled();
  });

  it('AC-01/AC-02: guarda los cambios del autor con los datos normalizados', async () => {
    const { agent, storage } = await fixture();
    const body = { ...valid(), centroId: CENTRO, descripcion: '  Mochila azul  ', rasgosPrivados: 'Llavero',
      contactoEmail: 'contacto@example.com', contactoTelefono: '' };

    const result = await editar(agent, body);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ message: 'Aviso actualizado correctamente.', aviso: { id: ID, estado: 'Activo' } });
    expect(storage.update).toHaveBeenCalledWith(USER, ID, {
      categoriaId: CATEGORY, facultadId: FACULTY, centroId: CENTRO, descripcion: 'Mochila azul',
      fechaPerdida: '2026-01-15', rasgosPrivados: 'Llavero', contactoEmail: 'contacto@example.com', contactoTelefono: null,
    });
  });

  it.each([
    ['descripción vacía', { descripcion: '' }, 'descripcion'],
    ['fecha futura', { fechaPerdida: '2999-01-01' }, 'fechaPerdida'],
    ['sin facultad ni centro', { facultadId: null }, 'facultadId'],
    ['correo no válido', { contactoEmail: 'no-es-correo' }, 'contactoEmail'],
    ['estado enviado por el cliente', { estado: 'Cerrado' }, 'aviso'],
    ['autor enviado por el cliente', { autorId: USER }, 'aviso'],
  ])('AC-03/AC-04: rechaza %s sin guardar nada', async (_, changes, field) => {
    const { agent, storage } = await fixture();

    const result = await editar(agent, { ...valid(), ...changes });

    expect(result.status).toBe(400);
    expect(result.body.errors).toHaveProperty(field);
    expect(storage.update).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'Aviso no encontrado.'],
    [409, 'Solo se pueden editar avisos activos.'],
  ])('transmite el %i del almacenamiento (ajeno o no Activo)', async (status, message) => {
    const { agent, storage } = await fixture();
    const { AvisoError } = await import('../src/services/avisos.js');
    storage.update.mockRejectedValueOnce(new AvisoError(status, message));

    const result = await editar(agent, valid());

    expect(result.status).toBe(status);
    expect(result.body.message).toBe(message);
  });

  it('exige origen permitido y JSON', async () => {
    const { agent, storage } = await fixture();

    expect((await agent.put(`/api/avisos/${ID}`).send(valid())).status).toBe(403);
    expect((await agent.put(`/api/avisos/${ID}`).set('Origin', 'https://otro.example')
      .send(valid())).status).toBe(403);
    expect((await agent.put(`/api/avisos/${ID}`).set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'text/plain').send('x')).status).toBe(415);
    expect(storage.update).not.toHaveBeenCalled();
  });

  it('sin almacenamiento real responde 503', async () => {
    const { agent } = await fixture({ unavailable: true });

    expect((await agent.get('/api/avisos/mios')).status).toBe(503);
    expect((await editar(agent, valid())).status).toBe(503);
  });
});
