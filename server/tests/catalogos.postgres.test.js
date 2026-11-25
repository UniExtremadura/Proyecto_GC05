import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

import { createCatalogoRepository } from '../src/repositories/catalogos.js';

test('SCRUM-134: creación y consulta real de catálogos en PostgreSQL', async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Configura TEST_DATABASE_URL.');
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);

  const schema = `catalogos_test_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });

  let pool;

  try {
    // Esquema temporal: no utilizar las tablas de desarrollo.
    await admin.query(`CREATE SCHEMA "${schema}"`);

    pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });

    for (const filename of [
      '001-usuarios.sql',
      '007-hallazgos.sql',
      '009-avisos.sql',
    ]) {
      const sql = await readFile(
        new URL(`../db/migrations/${filename}`, import.meta.url),
        'utf8',
      );

      await pool.query(sql);
    }

    const repository = createCatalogoRepository(pool);

    const facultad = await repository.create(
      'facultades',
      'Facultad de prueba',
    );

    const categoria = await repository.create(
      'categorias',
      'Categoría de prueba',
    );

    const centro = await repository.createCentro(
      'Centro de prueba',
      facultad.id,
    );

    assert.equal(facultad.nombre, 'Facultad de prueba');
    assert.equal(categoria.nombre, 'Categoría de prueba');
    assert.equal(centro.facultadId, facultad.id);

    const catalogos = await repository.list();

    assert.ok(catalogos.facultades.some(f => f.id === facultad.id));
    assert.ok(catalogos.categorias.some(c => c.id === categoria.id));
    assert.ok(catalogos.centros.some(c => c.id === centro.id));
    // Edición real: conservar los identificadores y las relaciones.
    const facultadEditada = await repository.update(
      'facultades',
      facultad.id,
      'Facultad actualizada',
    );

    assert.equal(facultadEditada.id, facultad.id);
    assert.equal(facultadEditada.nombre, 'Facultad actualizada');

    const centroEditado = await repository.updateCentro(
      centro.id,
      'Centro actualizado',
      facultad.id,
    );

    assert.equal(centroEditado.id, centro.id);
    assert.equal(centroEditado.nombre, 'Centro actualizado');
    assert.equal(centroEditado.facultadId, facultad.id);

    // Desactivación lógica: el registro permanece en PostgreSQL.
    const categoriaInactiva = await repository.setActivo(
      'categorias',
      categoria.id,
      false,
    );

    assert.equal(categoriaInactiva.activo, false);

    const centroInactivo = await repository.setActivo(
      'centros',
      centro.id,
      false,
    );

    assert.equal(centroInactivo.activo, false);

    // Reactivación de ambos elementos.
    assert.equal(
      (await repository.setActivo('categorias', categoria.id, true)).activo,
      true,
    );

    assert.equal(
      (await repository.setActivo('centros', centro.id, true)).activo,
      true,
    );

    // Confirmar que los registros siguen existiendo.
    const catalogosFinales = await repository.list();

    assert.ok(catalogosFinales.facultades.some(f => f.id === facultad.id));
    assert.ok(catalogosFinales.categorias.some(c => c.id === categoria.id));
    assert.ok(catalogosFinales.centros.some(c => c.id === centro.id));
    // PostgreSQL debe impedir duplicar nombres de facultades.
    await assert.rejects(
      repository.create('facultades', 'Facultad actualizada'),
      error =>
        error.code === '23505' &&
        error.constraint === 'facultades_nombre_key',
    );

    // PostgreSQL debe impedir duplicar nombres de categorías.
    await assert.rejects(
      repository.create('categorias', 'Categoría de prueba'),
      error =>
        error.code === '23505' &&
        error.constraint === 'categorias_nombre_key',
    );

    // No se permiten dos centros con el mismo nombre
    // dentro de una misma facultad.
    await assert.rejects(
      repository.createCentro('Centro actualizado', facultad.id),
      error =>
        error.code === '23505' &&
        error.constraint === 'centros_facultad_nombre_key',
    );
    // Una facultad con conserjes asignados no puede desactivarse.
    const conserjeId = randomUUID();

    await pool.query(
      `INSERT INTO usuarios (id, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)`,
      [conserjeId, 'conserje-catalogos@example.com', 'hash-de-prueba', 'CONSERJE'],
    );

    await pool.query(
      `INSERT INTO asignaciones_conserje (usuario_id, facultad_id)
       VALUES ($1, $2)`,
      [conserjeId, facultad.id],
    );

    await assert.rejects(
      repository.setFacultadActiva(facultad.id, false),
      error => error.code === 'FACULTAD_CON_CONSERJES',
    );

    // Confirmar que la facultad continúa activa.
    const { rows: facultadesProtegidas } = await pool.query(
      'SELECT activo FROM facultades WHERE id = $1',
      [facultad.id],
    );

    assert.equal(facultadesProtegidas[0].activo, true);

    // Eliminar la asignación para comprobar que ahora sí se puede desactivar.
    await pool.query(
      'DELETE FROM asignaciones_conserje WHERE usuario_id = $1',
      [conserjeId],
    );

    const facultadInactiva = await repository.setFacultadActiva(
      facultad.id,
      false,
    );

    assert.equal(facultadInactiva.activo, false);

    // Comprobar también la reactivación.
    const facultadReactivada = await repository.setFacultadActiva(
      facultad.id,
      true,
    );

    assert.equal(facultadReactivada.activo, true);
  } finally {
    if (pool) {
      await pool.end();
    }

    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});