import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUserRepository } from '../src/repositories/users.js';
import { createAvisoRepository } from '../src/repositories/avisos.js';
import { createSessionMiddleware } from '../src/security/sessions.js';
import { hashPassword } from '../src/security/passwords.js';

test('SCRUM-109: publicación real de avisos, privacidad y transacciones PostgreSQL', async (t) => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Configura TEST_DATABASE_URL independiente.');
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const schema = `avisos_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  try {
    for (const name of ['001-usuarios.sql', '002-sesiones.sql', '003-perfil.sql', '007-hallazgos.sql', '009-avisos.sql', '009-avisos.sql', '010-cierre-avisos.sql']) {
      await pool.query(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const [userId, faculty, otherFaculty, category, centre, inactiveCategory, inactiveCentre] = Array.from({ length: 7 }, () => randomUUID());
    const password = await hashPassword('Prueba1234');
    await pool.query('INSERT INTO usuarios (id, email, password_hash, nombre, apellidos) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'persona@example.com', password, 'Persona', 'Ficticia']);
    await pool.query('INSERT INTO facultades (id, nombre) VALUES ($1, $2), ($3, $4)',
      [faculty, 'Facultad ficticia', otherFaculty, 'Otra facultad ficticia']);
    await pool.query('INSERT INTO categorias (id, nombre, activo) VALUES ($1, $2, TRUE), ($3, $4, FALSE)',
      [category, 'Categoría ficticia', inactiveCategory, 'Categoría inactiva']);
    await pool.query('INSERT INTO centros (id, facultad_id, nombre, activo) VALUES ($1, $2, $3, TRUE), ($4, $2, $5, FALSE)',
      [centre, faculty, 'Centro ficticio', inactiveCentre, 'Centro inactivo']);
    const storage = createAvisoRepository(pool);
    const app = createApp({ users: createUserRepository(pool), avisoStorage: storage, avisoLimit: 100,
      sessionMiddleware: createSessionMiddleware(pool, 'secreto-ficticio-avisos-postgres-mas-de-32') });
    const agent = request.agent(app);
    assert.equal((await agent.post('/api/auth/login').send({ email: 'persona@example.com', password: 'Prueba1234' })).status, 200);
    const valid = () => ({ categoriaId: category, facultadId: faculty,
      descripcion: 'Mochila ficticia perdida', fechaPerdida: '2026-01-15' });
    const publish = body => agent.post('/api/avisos').set('Origin', 'http://localhost:5173').send(body);
    const count = async table => Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

    await t.test('cierre propio atómico, historial y retirada del feed', async () => {
      const created = await publish({ ...valid(), descripcion: 'Aviso para cerrar' });
      const { id } = created.body.aviso;
      const otherId = randomUUID();
      await pool.query(
        'INSERT INTO usuarios (id, email, password_hash, nombre, apellidos) VALUES ($1, $2, $3, $4, $5)',
        [otherId, 'otra-persona@example.com', password, 'Otra', 'Persona']
      );
      const other = request.agent(app);
      assert.equal((await other.post('/api/auth/login')
        .send({ email: 'otra-persona@example.com', password: 'Prueba1234' })).status, 200);
      const close = (actor, motivo) => actor.post(`/api/avisos/${id}/cierre`)
        .set('Origin', 'http://localhost:5173').send({ motivo });

      const feed = () => agent.get('/api/avisos');
      assert.ok((await feed()).body.avisos.some(aviso => aviso.id === id));
      assert.equal((await close(other, 'Ajeno')).status, 404);
      assert.deepEqual((await other.get('/api/avisos/gestion-cierre')).body.avisos, []);
      const attempts = await Promise.all([
        close(agent, 'Objeto recuperado'),
        close(agent, 'Búsqueda cancelada'),
      ]);
      assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
      const closed = attempts.find(result => result.status === 200).body.aviso;
      assert.equal(closed.estado, 'Cerrado');
      assert.ok(closed.cerradoEn);
      assert.ok(!((await feed()).body.avisos.some(aviso => aviso.id === id)));
      const history = (await agent.get('/api/avisos/gestion-cierre')).body.avisos.find(aviso => aviso.id === id);
      assert.equal(history.motivoCierre, closed.motivoCierre);
      assert.equal(history.cerradoEn, closed.cerradoEn);
      const { rows } = await pool.query('SELECT cerrado_por FROM avisos WHERE id = $1', [id]);
      assert.equal(rows[0].cerrado_por, userId);
      assert.equal(await count('hallazgos'), 0);
      await pool.query('DELETE FROM avisos WHERE id = $1', [id]);
    });

    await t.test('opciones reales: solo catálogos activos y centros de facultades activas', async () => {
      const result = await agent.get('/api/avisos/opciones');
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.categorias, [{ id: category, nombre: 'Categoría ficticia' }]);
      assert.deepEqual(result.body.centros, [{ id: centre, nombre: 'Centro ficticio', facultadId: faculty }]);
    });
    await t.test('guarda autor de sesión, fecha sin desplazamiento y estado Activo sin crear un hallazgo', async () => {
      const result = await publish(valid());
      assert.equal(result.status, 201);
      const { rows } = await pool.query(`SELECT autor_id, estado, centro_id, to_char(fecha_perdida, 'YYYY-MM-DD') AS fecha
        FROM avisos WHERE id = $1`, [result.body.aviso.id]);
      assert.deepEqual(rows[0], { autor_id: userId, estado: 'Activo', centro_id: null, fecha: '2026-01-15' });
      assert.equal(await count('hallazgos'), 0);
      assert.equal(await count('aviso_datos_privados'), 0);
    });
    await t.test('rasgos y contacto opcional se guardan aparte y no aparecen en la respuesta', async () => {
      const result = await publish({ ...valid(), rasgosPrivados: 'Llave privada', contactoEmail: 'contacto@example.com', contactoTelefono: '+34600000000' });
      assert.equal(result.status, 201);
      const { rows } = await pool.query('SELECT rasgos, contacto_email, contacto_telefono FROM aviso_datos_privados WHERE aviso_id = $1', [result.body.aviso.id]);
      assert.deepEqual(rows[0], { rasgos: 'Llave privada', contacto_email: 'contacto@example.com', contacto_telefono: '+34600000000' });
      assert.deepEqual(Object.keys(result.body.aviso).sort(), ['estado', 'id']);
      const publicColumns = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'avisos'`, [schema])).rows.map(row => row.column_name);
      for (const field of ['rasgos', 'contacto_email', 'contacto_telefono']) assert.equal(publicColumns.includes(field), false);
    });
    await t.test('seleccionar solo un centro resuelve su facultad en el servidor', async () => {
      const result = await publish({ ...valid(), facultadId: null, centroId: centre });
      assert.equal(result.status, 201);
      const { rows } = await pool.query('SELECT facultad_id, centro_id FROM avisos WHERE id = $1', [result.body.aviso.id]);
      assert.deepEqual(rows[0], { facultad_id: faculty, centro_id: centre });
    });
    for (const [label, changes, field] of [
      ['categoría inexistente', { categoriaId: randomUUID() }, 'categoriaId'],
      ['categoría inactiva', { categoriaId: inactiveCategory }, 'categoriaId'],
      ['facultad inexistente', { facultadId: randomUUID() }, 'facultadId'],
      ['centro inexistente', { centroId: randomUUID() }, 'centroId'],
      ['centro inactivo', { centroId: inactiveCentre }, 'centroId'],
      ['centro de otra facultad', { facultadId: otherFaculty, centroId: centre }, 'centroId'],
      ['campos vacíos', { descripcion: '' }, 'descripcion'],
      ['texto demasiado largo', { descripcion: 'a'.repeat(2001) }, 'descripcion'],
    ]) {
      await t.test(`${label}: 400 sin filas incompletas`, async () => {
        const before = await count('avisos');
        const result = await publish({ ...valid(), ...changes });
        assert.equal(result.status, 400);
        assert.ok(result.body.errors[field]);
        assert.equal(await count('avisos'), before);
      });
    }
    await t.test('facultad desactivada después de abrir el formulario: rechazo al enviar', async () => {
      await pool.query('UPDATE facultades SET activo = FALSE WHERE id = $1', [faculty]);
      assert.equal((await publish(valid())).status, 400);
      assert.equal((await agent.get('/api/avisos/opciones')).body.centros.length, 0);
      await pool.query('UPDATE facultades SET activo = TRUE WHERE id = $1', [faculty]);
    });
    await t.test('una cadena SQL en la descripción se guarda como texto, sin ejecutar instrucciones', async () => {
      const descripcion = "Mochila'); DROP TABLE avisos; --";
      const result = await publish({ ...valid(), descripcion });
      assert.equal(result.status, 201);
      assert.equal((await pool.query('SELECT descripcion FROM avisos WHERE id = $1', [result.body.aviso.id])).rows[0].descripcion, descripcion);
    });
    await t.test('si falla el guardado privado, se revierte también el aviso público', async () => {
      await pool.query(`CREATE FUNCTION rechazar_privados_test() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'fallo interno ficticio'; END $$;
        CREATE TRIGGER fallo_privado_test BEFORE INSERT ON aviso_datos_privados FOR EACH ROW EXECUTE FUNCTION rechazar_privados_test()`);
      const before = await count('avisos');
      const result = await publish({ ...valid(), rasgosPrivados: 'Provocar rollback' });
      assert.equal(result.status, 500);
      assert.equal(await count('avisos'), before);
      assert.equal(JSON.stringify(result.body).includes('fallo interno'), false);
      await pool.query('DROP TRIGGER fallo_privado_test ON aviso_datos_privados; DROP FUNCTION rechazar_privados_test()');
    });

        // SCRUM-57 / US-014: pruebas del feed con PostgreSQL real.

    await t.test('el feed devuelve únicamente avisos activos', async () => {
      const result = await publish({
        ...valid(),
        descripcion: 'Aviso cerrado de prueba',
      });

      assert.equal(result.status, 201);

      const closedId = result.body.aviso.id;

      await pool.query(
        'UPDATE avisos SET estado = $1 WHERE id = $2',
        ['Cerrado', closedId]
      );

      const feed = await agent.get('/api/avisos');

      assert.equal(feed.status, 200);
      assert.ok(feed.body.avisos.length > 0);
      assert.ok(feed.body.avisos.every(aviso => aviso.estado === 'Activo'));
      assert.ok(feed.body.avisos.every(aviso => aviso.id !== closedId));
    });

    await t.test('el feed solo devuelve información pública', async () => {
      const result = await publish({
        ...valid(),
        centroId: centre,
        descripcion: 'Mochila del feed',
        rasgosPrivados: 'Rasgo privado del feed',
        contactoEmail: 'privado@example.com',
        contactoTelefono: '+34600000000',
      });

      assert.equal(result.status, 201);

      const feed = await agent.get('/api/avisos');

      assert.equal(feed.status, 200);

      const aviso = feed.body.avisos.find(
        item => item.id === result.body.aviso.id
      );

      assert.deepEqual(aviso, {
        id: result.body.aviso.id,
        categoria: {
          id: category,
          nombre: 'Categoría ficticia',
        },
        facultad: {
          id: faculty,
          nombre: 'Facultad ficticia',
        },
        centro: {
          id: centre,
          nombre: 'Centro ficticio',
        },
        descripcion: 'Mochila del feed',
        fechaPerdida: '2026-01-15',
        estado: 'Activo',
      });

      const response = JSON.stringify(feed.body);

      assert.equal(response.includes('Rasgo privado del feed'), false);
      assert.equal(response.includes('privado@example.com'), false);
      assert.equal(response.includes('persona@example.com'), false);
      assert.equal(response.includes('+34600000000'), false);
      assert.equal(response.includes(userId), false);
    });

    await t.test('pagina los avisos sin repetir resultados', async () => {
      const first = await agent.get('/api/avisos?pagina=1&tamano=2');
      const second = await agent.get('/api/avisos?pagina=2&tamano=2');

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);

      assert.equal(first.body.avisos.length, 2);
      assert.equal(second.body.avisos.length, 2);

      assert.equal(first.body.paginacion.anterior, false);
      assert.equal(first.body.paginacion.siguiente, true);
      assert.equal(second.body.paginacion.anterior, true);

      const firstIds = first.body.avisos.map(aviso => aviso.id);
      const secondIds = second.body.avisos.map(aviso => aviso.id);

      assert.ok(secondIds.every(id => !firstIds.includes(id)));
    });

    await t.test('devuelve un error cuando la página no existe', async () => {
      const result = await agent.get('/api/avisos?pagina=999');

      assert.equal(result.status, 404);
      assert.equal(result.body.message, 'La página solicitada no existe.');
    });

    await t.test('el feed de avisos es independiente de los hallazgos', async () => {
      const result = await agent.get('/api/avisos');

      assert.equal(result.status, 200);
      assert.ok(result.body.avisos.length > 0);
      assert.equal(await count('hallazgos'), 0);
      assert.equal(Object.hasOwn(result.body, 'hallazgos'), false);
    });

    // SCRUM-119 / US-015: búsqueda y filtros con PostgreSQL real.
    const otherCategory = randomUUID();
    await pool.query('INSERT INTO categorias (id, nombre) VALUES ($1, $2)', [otherCategory, 'Paraguas y llaves']);
    const paraguas = (await publish({ ...valid(), categoriaId: otherCategory, facultadId: otherFaculty,
      descripcion: 'Paraguas ROJO con mango de madera', rasgosPrivados: 'Brújula grabada en el mango' })).body.aviso.id;
    const literal = (await publish({ ...valid(), descripcion: 'Etiqueta con el texto 100%_seguro' })).body.aviso.id;
    const cerrado = (await publish({ ...valid(), categoriaId: otherCategory, facultadId: otherFaculty,
      descripcion: 'Paraguas rojo ya devuelto' })).body.aviso.id;
    await pool.query('UPDATE avisos SET estado = $1 WHERE id = $2', ['Cerrado', cerrado]);
    const search = async (params) => {
      const result = await agent.get(`/api/avisos?${new URLSearchParams({ tamano: '50', ...params })}`);
      assert.equal(result.status, 200);
      return result.body;
    };
    const ids = body => body.avisos.map(aviso => aviso.id);

    await t.test('US-015-AC-01/AC-03: busca palabras sin distinguir mayúsculas y solo en avisos activos', async () => {
      const body = await search({ q: 'paraguas rojo' });
      assert.deepEqual(ids(body), [paraguas]);
      assert.equal(ids(await search({ q: 'PARAGUAS' })).includes(cerrado), false);
    });

    await t.test('US-015-AC-01: busca también en los nombres públicos de categoría, facultad y centro', async () => {
      assert.deepEqual(ids(await search({ q: 'llaves' })), [paraguas]);
      assert.ok(ids(await search({ q: 'otra facultad' })).includes(paraguas));
      const conCentro = await search({ q: 'centro ficticio' });
      assert.ok(conCentro.avisos.length > 0);
      assert.ok(conCentro.avisos.every(aviso => aviso.centro?.id === centre));
    });

    await t.test('US-015-AC-03: no busca en los rasgos privados ni en el contacto', async () => {
      for (const q of ['brújula', 'privado@example.com', 'Rasgo privado del feed']) {
        const body = await search({ q });
        assert.deepEqual(body.avisos, []);
        assert.equal(body.message, 'No hay avisos activos que coincidan con la búsqueda.');
      }
    });

    await t.test('%, _ y \\ se buscan como texto literal', async () => {
      assert.deepEqual(ids(await search({ q: '100%_seguro' })), [literal]);
      assert.deepEqual(ids(await search({ q: '%' })), [literal]);
      assert.deepEqual(ids(await search({ q: '\\' })), []);
    });

    await t.test('US-015-AC-02/AC-04: los filtros se combinan entre sí y con el texto', async () => {
      assert.deepEqual(ids(await search({ categoriaId: otherCategory })), [paraguas]);
      assert.deepEqual(ids(await search({ categoriaId: otherCategory, facultadId: otherFaculty, q: 'madera' })), [paraguas]);
      assert.deepEqual(ids(await search({ categoriaId: otherCategory, facultadId: faculty })), []);
      const porCentro = await search({ centroId: centre });
      assert.ok(porCentro.avisos.length > 0);
      assert.ok(porCentro.avisos.every(aviso => aviso.centro?.id === centre && aviso.estado === 'Activo'));
      const porFacultad = await search({ facultadId: faculty });
      assert.ok(porFacultad.avisos.every(aviso => aviso.facultad.id === faculty));
      assert.equal(porFacultad.paginacion.total, porFacultad.avisos.length);
    });

    await t.test('una cadena SQL en el texto se trata como texto', async () => {
      const body = await search({ q: "'; DROP TABLE avisos; --" });
      assert.deepEqual(body.avisos, []);
      assert.ok(await count('avisos') > 0);
    });

    // SCRUM-122 / US-016: edición real de avisos propios.
    const otherUser = randomUUID();
    await pool.query('INSERT INTO usuarios (id, email, password_hash, nombre, apellidos) VALUES ($1, $2, $3, $4, $5)',
      [otherUser, 'otra@example.com', password, 'Otra', 'Persona']);
    const otherAgent = request.agent(app);
    assert.equal((await otherAgent.post('/api/auth/login').send({ email: 'otra@example.com', password: 'Prueba1234' })).status, 200);
    const editar = (who, id, body) => who.put(`/api/avisos/${id}`).set('Origin', 'http://localhost:5173').send(body);
    const fila = async id => (await pool.query(
      `SELECT a.autor_id, a.estado, a.categoria_id, a.facultad_id, a.centro_id, a.descripcion,
              to_char(a.fecha_perdida, 'YYYY-MM-DD') AS fecha, a.created_at, a.updated_at,
              p.rasgos, p.contacto_email, p.contacto_telefono
         FROM avisos a LEFT JOIN aviso_datos_privados p ON p.aviso_id = a.id WHERE a.id = $1`, [id])).rows[0];
    const propio = (await publish({ ...valid(), descripcion: 'Cartera para editar', rasgosPrivados: 'Foto dentro' })).body.aviso.id;

    await t.test('US-016: el autor ve su aviso con los datos privados para editarlo', async () => {
      const result = await agent.get(`/api/avisos/${propio}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.aviso.descripcion, 'Cartera para editar');
      assert.equal(result.body.aviso.rasgosPrivados, 'Foto dentro');
      assert.equal(result.body.aviso.fechaPerdida, '2026-01-15');
      assert.equal(result.body.aviso.editable, true);
      assert.ok((await agent.get('/api/avisos/mios')).body.avisos.some(aviso => aviso.id === propio));
    });

    await t.test('US-016-AC-01/AC-02/AC-04: edita los campos y conserva autor, estado y fecha de publicación', async () => {
      const before = await fila(propio);
      const hallazgos = await count('hallazgos');
      const result = await editar(agent, propio, { ...valid(), categoriaId: otherCategory, facultadId: null, centroId: centre,
        descripcion: 'Cartera marrón editada', fechaPerdida: '2026-01-10', rasgosPrivados: 'Foto y carné',
        contactoEmail: 'nuevo@example.com', contactoTelefono: '600111222' });
      assert.equal(result.status, 200);
      const after = await fila(propio);
      assert.deepEqual(
        { categoria: after.categoria_id, facultad: after.facultad_id, centro: after.centro_id, descripcion: after.descripcion,
          fecha: after.fecha, rasgos: after.rasgos, email: after.contacto_email, telefono: after.contacto_telefono },
        { categoria: otherCategory, facultad: faculty, centro: centre, descripcion: 'Cartera marrón editada',
          fecha: '2026-01-10', rasgos: 'Foto y carné', email: 'nuevo@example.com', telefono: '600111222' });
      assert.equal(after.autor_id, userId);
      assert.equal(after.estado, 'Activo');
      assert.deepEqual(after.created_at, before.created_at);
      assert.ok(after.updated_at >= before.updated_at);
      assert.equal(await count('hallazgos'), hallazgos); // US-016-AC-06
    });

    await t.test('borrar todos los datos privados elimina su fila, sin dejarla vacía', async () => {
      const result = await editar(agent, propio, { ...valid(), descripcion: 'Cartera sin datos privados',
        rasgosPrivados: '', contactoEmail: null, contactoTelefono: '' });
      assert.equal(result.status, 200);
      const { rowCount } = await pool.query('SELECT 1 FROM aviso_datos_privados WHERE aviso_id = $1', [propio]);
      assert.equal(rowCount, 0);
    });

    await t.test('US-016-AC-05: otra persona no puede ver ni editar el aviso', async () => {
      const before = await fila(propio);
      assert.equal((await otherAgent.get(`/api/avisos/${propio}`)).status, 404);
      const result = await editar(otherAgent, propio, { ...valid(), descripcion: 'Intento ajeno' });
      assert.equal(result.status, 404);
      assert.deepEqual(await fila(propio), before);
      assert.equal((await otherAgent.get('/api/avisos/mios')).body.avisos.some(aviso => aviso.id === propio), false);
    });

    await t.test('US-016-AC-03: datos o catálogos no válidos no cambian nada', async () => {
      const before = await fila(propio);
      assert.equal((await editar(agent, propio, { ...valid(), categoriaId: inactiveCategory })).status, 400);
      assert.equal((await editar(agent, propio, { ...valid(), facultadId: otherFaculty, centroId: centre })).status, 400);
      assert.equal((await editar(agent, propio, { ...valid(), descripcion: '' })).status, 400);
      assert.deepEqual(await fila(propio), before);
    });

    await t.test('US-016-AC-01: un aviso cerrado no se puede editar, pero su autor lo sigue viendo', async () => {
      await pool.query('UPDATE avisos SET estado = $1 WHERE id = $2', ['Cerrado', propio]);
      const before = await fila(propio);
      const result = await editar(agent, propio, { ...valid(), descripcion: 'Editar cerrado' });
      assert.equal(result.status, 409);
      assert.deepEqual(await fila(propio), before);
      const detalle = await agent.get(`/api/avisos/${propio}`);
      assert.equal(detalle.status, 200);
      assert.equal(detalle.body.aviso.editable, false);
    });

    await t.test('informa cuando no quedan avisos activos', async () => {
      await pool.query(
        'UPDATE avisos SET estado = $1',
        ['Cerrado']
      );

      const result = await agent.get('/api/avisos');

      assert.equal(result.status, 200);
      assert.deepEqual(result.body.avisos, []);
      assert.equal(result.body.paginacion.total, 0);
      assert.equal(
        result.body.message,
        'Todavía no hay avisos de pérdida activos.'
      );
    });

    await t.test('el repositorio revalida la cuenta desactivada dentro de la transacción', async () => {
      await pool.query('UPDATE usuarios SET activo = FALSE WHERE id = $1', [userId]);
      const before = await count('avisos');
      await assert.rejects(storage.publish(userId, valid()), error => error.status === 401);
      assert.equal(await count('avisos'), before);
      assert.equal((await publish(valid())).status, 401);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
