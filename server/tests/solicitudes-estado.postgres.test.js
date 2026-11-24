
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

test('SCRUM-131: consultar solicitudes propias con PostgreSQL real', async t => {
  const url = process.env.TEST_DATABASE_URL;

  assert.ok(url, 'Configura TEST_DATABASE_URL.');
  assert.notEqual(url, process.env.DATABASE_URL);

  // Esquema independiente para no modificar datos reales.
  const schema = `solicitudes_estado_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
  });

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);

    // Aplicar únicamente las migraciones necesarias.
    for (const name of [
      '001-usuarios.sql',
      '002-sesiones.sql',
      '003-perfil.sql',
      '007-hallazgos.sql',
      '011-solicitudes-recuperacion.sql',
      '012-decisiones-solicitudes.sql',
    ]) {
      const sql = await readFile(
        new URL(`../db/migrations/${name}`, import.meta.url),
        'utf8',
      );
      await pool.query(sql);
    }

    const [
      userId,
      otherId,
      custodianId,
      facultyId,
      categoryId,
      findingId,
      pendingId,
      validatedId,
      rejectedId,
      otherRequestId,
    ] = Array.from({ length: 10 }, () => randomUUID());

    const password = await hashPassword('Prueba1234');

    // Dos usuarios distintos y un conserje.
    for (const [id, name, role] of [
      [userId, 'persona', 'USUARIO'],
      [otherId, 'segunda', 'USUARIO'],
      [custodianId, 'conserje', 'CONSERJE'],
    ]) {
      await pool.query(
        `INSERT INTO usuarios
           (id, email, password_hash, nombre, apellidos, rol)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          `${name}@example.com`,
          password,
          name,
          'Prueba',
          role,
        ],
      );
    }

    await pool.query(
      'INSERT INTO facultades (id, nombre) VALUES ($1, $2)',
      [facultyId, 'Facultad de prueba'],
    );

    await pool.query(
      'INSERT INTO categorias (id, nombre) VALUES ($1, $2)',
      [categoryId, 'Categoría de prueba'],
    );

    await pool.query(
      `INSERT INTO hallazgos
         (id, autor_id, facultad_id, categoria_id,
          descripcion, fecha_hallazgo, latitud, longitud)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 0, 0)`,
      [
        findingId,
        custodianId,
        facultyId,
        categoryId,
        'Mochila de prueba',
      ],
    );

    // Tres estados para el primer usuario y una solicitud ajena.
    for (const [id, ownerId, status] of [
      [pendingId, userId, 'Pendiente'],
      [validatedId, userId, 'Validada'],
      [rejectedId, userId, 'Rechazada'],
      [otherRequestId, otherId, 'Pendiente'],
    ]) {
      await pool.query(
        `INSERT INTO solicitudes_recuperacion
           (id, hallazgo_id, solicitante_id, justificacion, estado,
            motivo_rechazo, instrucciones_recogida)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          findingId,
          ownerId,
          'Justificación privada de prueba',
          status,
          status === 'Rechazada' ? 'Los datos aportados no coinciden.' : null,
          status === 'Validada' ? 'Recoger en conserjería con identificación.' : null,
        ],
      );
    }

    const app = createApp({
      users: createUserRepository(pool),
      solicitudStorage: createSolicitudRepository(pool),
      sessionMiddleware: createSessionMiddleware(
        pool,
        'secreto-ficticio-solicitudes-mas-de-32',
      ),
    });

    async function login(name) {
      const agent = request.agent(app);
      const response = await agent.post('/api/auth/login').send({
        email: `${name}@example.com`,
        password: 'Prueba1234',
      });
      assert.equal(response.status, 200);
      return agent;
    }

    const user = await login('persona');
    const other = await login('segunda');
    const custodian = await login('conserje');

    await t.test('sin sesión devuelve 401', async () => {
      const list = await request(app).get('/api/solicitudes/mias');
      const detail = await request(app).get(
        `/api/solicitudes/${pendingId}`,
      );

      assert.equal(list.status, 401);
      assert.equal(detail.status, 401);
    });

    await t.test('el listado solo muestra solicitudes propias', async () => {
      const response = await user.get('/api/solicitudes/mias');

      assert.equal(response.status, 200);
      assert.equal(response.body.solicitudes.length, 3);

      const ids = response.body.solicitudes.map(s => s.id);

      assert.ok(ids.includes(pendingId));
      assert.ok(ids.includes(validatedId));
      assert.ok(ids.includes(rejectedId));
      assert.ok(!ids.includes(otherRequestId));

      for (const solicitud of response.body.solicitudes) {
        assert.equal(solicitud.hallazgoId, findingId);
        assert.equal(solicitud.hallazgoDescripcion, 'Mochila de prueba');
        assert.ok(solicitud.creadaEn);
        assert.equal(solicitud.justificacion, undefined);
        assert.equal(solicitud.solicitanteId, undefined);
      }
    });

    await t.test('otro usuario solo ve sus solicitudes', async () => {
      const response = await other.get('/api/solicitudes/mias');

      assert.equal(response.status, 200);
      assert.deepEqual(
        response.body.solicitudes.map(s => s.id),
        [otherRequestId],
      );
    });

    await t.test('el detalle muestra una solicitud propia', async () => {
      const response = await user.get(
        `/api/solicitudes/${validatedId}`,
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.solicitud.id, validatedId);
      assert.equal(response.body.solicitud.estado, 'Validada');
      assert.equal(
        response.body.solicitud.justificacion,
        'Justificación privada de prueba',
      );
      assert.equal(
        response.body.solicitud.hallazgoDescripcion,
        'Mochila de prueba',
      );
    });

    await t.test('Pendiente no muestra una decisión inexistente', async () => {
      const response = await user.get(`/api/solicitudes/${pendingId}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.solicitud.estado, 'Pendiente');
      assert.equal(response.body.solicitud.motivoRechazo, null);
      assert.equal(response.body.solicitud.instruccionesRecogida, null);
    });

    await t.test('Validada muestra las instrucciones de recogida', async () => {
      const response = await user.get(`/api/solicitudes/${validatedId}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.solicitud.estado, 'Validada');
      assert.equal(
        response.body.solicitud.instruccionesRecogida,
        'Recoger en conserjería con identificación.',
      );
      assert.equal(response.body.solicitud.motivoRechazo, null);
    });

    await t.test('Rechazada muestra el motivo de rechazo', async () => {
      const response = await user.get(`/api/solicitudes/${rejectedId}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.solicitud.estado, 'Rechazada');
      assert.equal(
        response.body.solicitud.motivoRechazo,
        'Los datos aportados no coinciden.',
      );
      assert.equal(response.body.solicitud.instruccionesRecogida, null);
    });

    await t.test('una solicitud ajena devuelve 404', async () => {
      const response = await user.get(
        `/api/solicitudes/${otherRequestId}`,
      );

      assert.equal(response.status, 404);
      assert.equal(response.body.solicitud, undefined);
    });

    await t.test('identificadores inválidos o inexistentes devuelven 404', async () => {
      for (const id of ['invalido', randomUUID()]) {
        const response = await user.get(`/api/solicitudes/${id}`);

        assert.equal(response.status, 404);
      }
    });

    await t.test('un conserje no puede consultar solicitudes propias', async () => {
      const list = await custodian.get('/api/solicitudes/mias');
      const detail = await custodian.get(
        `/api/solicitudes/${pendingId}`,
      );

      assert.equal(list.status, 403);
      assert.equal(detail.status, 403);
    });

    await t.test('una cuenta sin solicitudes obtiene lista vacía', async () => {
      await pool.query(
        'DELETE FROM solicitudes_recuperacion WHERE solicitante_id = $1',
        [otherId],
      );

      const response = await other.get('/api/solicitudes/mias');

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { solicitudes: [] });
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
