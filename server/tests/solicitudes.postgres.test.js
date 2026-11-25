import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUserRepository } from '../src/repositories/users.js';
import { createSolicitudRepository } from '../src/repositories/solicitudes.js';
import { createSessionMiddleware } from '../src/security/sessions.js';
import { hashPassword } from '../src/security/passwords.js';

test('SCRUM-64: creación de solicitudes en PostgreSQL', async t => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'Configura TEST_DATABASE_URL independiente.');
  assert.notEqual(url, process.env.DATABASE_URL);
  const schema = `solicitudes_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const name of ['001-usuarios.sql', '002-sesiones.sql', '003-perfil.sql',
      '007-hallazgos.sql', '011-solicitudes-recuperacion.sql', '011-solicitudes-recuperacion.sql']) {
      await pool.query(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const [userId, otherId, custodianId, faculty, category, finding, retired] =
      Array.from({ length: 7 }, () => randomUUID());
    const password = await hashPassword('Prueba1234');
    for (const [id, name, role] of [[userId, 'persona', 'USUARIO'],
      [otherId, 'segunda', 'USUARIO'], [custodianId, 'conserje', 'CONSERJE']]) {
      await pool.query(
        'INSERT INTO usuarios (id, email, password_hash, nombre, apellidos, rol) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, `${name}@example.com`, password, name, 'Prueba', role],
      );
    }
    await pool.query('INSERT INTO facultades (id, nombre) VALUES ($1, $2)', [faculty, 'Facultad']);
    await pool.query('INSERT INTO categorias (id, nombre) VALUES ($1, $2)', [category, 'Categoría']);
    await pool.query(
      `INSERT INTO hallazgos (id, autor_id, facultad_id, categoria_id, descripcion, fecha_hallazgo, latitud, longitud, estado)
       VALUES ($1, $3, $4, $5, 'Mochila encontrada', CURRENT_DATE, 0, 0, 'Activo'),
              ($2, $3, $4, $5, 'Aviso retirado', CURRENT_DATE, 0, 0, 'Retirado')`,
      [finding, retired, custodianId, faculty, category],
    );
    const app = createApp({
      users: createUserRepository(pool),
      solicitudStorage: createSolicitudRepository(pool),
      sessionMiddleware: createSessionMiddleware(pool, 'secreto-ficticio-solicitudes-mas-de-32'),
    });
    async function login(name) {
      const agent = request.agent(app);
      const result = await agent.post('/api/auth/login')
        .send({ email: `${name}@example.com`, password: 'Prueba1234' });
      assert.equal(result.status, 200);
      return agent;
    }
    const user = await login('persona');
    const other = await login('segunda');
    const custodian = await login('conserje');
    const endpoint = id => `/api/hallazgos/${id}/solicitudes`;
    const submit = (agent, id, body, origin = 'http://localhost:5173') =>
      agent.post(endpoint(id)).set('Origin', origin).send(body);
    const valid = { justificacion: ' Tiene una marca azul bajo el asa. ' };

    await t.test('rechaza peticiones no autorizadas o inválidas sin guardar filas', async () => {
      assert.equal((await submit(request(app), finding, valid)).status, 401);
      assert.equal((await submit(custodian, finding, valid)).status, 403);
      assert.equal((await submit(user, finding, valid, 'https://example.org')).status, 403);
      for (const body of [{}, { justificacion: ' ' }, { justificacion: 'a'.repeat(2001) },
        { ...valid, estado: 'Validada' }, { ...valid, solicitanteId: otherId }]) {
        assert.equal((await submit(user, finding, body)).status, 400);
      }
      assert.equal((await submit(user, 'no-es-un-uuid', valid)).status, 404);
      assert.equal((await submit(user, randomUUID(), valid)).status, 404);
      assert.equal((await submit(user, retired, valid)).status, 409);
      assert.equal((await pool.query('SELECT id FROM solicitudes_recuperacion')).rowCount, 0);
    });

    await t.test('acepta solo una petición pendiente concurrente y conserva el hallazgo activo', async () => {
      const results = await Promise.all([submit(user, finding, valid), submit(user, finding, valid)]);
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      const { solicitud } = results.find(result => result.status === 201).body;
      assert.deepEqual(Object.keys(solicitud).sort(), ['creadaEn', 'estado', 'hallazgoId', 'id']);
      assert.equal(solicitud.estado, 'Pendiente');
      assert.equal(solicitud.hallazgoId, finding);
      const { rows } = await pool.query('SELECT * FROM solicitudes_recuperacion');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, solicitud.id);
      assert.equal(rows[0].solicitante_id, userId);
      assert.equal(rows[0].justificacion, valid.justificacion.trim());
      const result = await pool.query('SELECT estado FROM hallazgos WHERE id = $1', [finding]);
      assert.equal(result.rows[0].estado, 'Activo');
      assert.equal((await other.get(endpoint(finding))).status, 404);
    });

    await t.test('otro usuario puede solicitar el mismo hallazgo y se permite repetir tras el rechazo', async () => {
      assert.equal((await submit(other, finding, valid)).status, 201);
      await pool.query("UPDATE solicitudes_recuperacion SET estado = 'Rechazada' WHERE solicitante_id = $1", [userId]);
      assert.equal((await submit(user, finding, valid)).status, 201);
      assert.equal((await pool.query('SELECT id FROM solicitudes_recuperacion')).rowCount, 3);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
