import { describe, expect, it, vi } from 'vitest';
import { validateNombreCatalogo, validateFacultadId } from '../src/validation/catalogos.js';
import { createCatalogoRepository } from '../src/repositories/catalogos.js';
import { createCatalogoService, CatalogoError } from '../src/services/catalogos.js';

describe('SCRUM-134 / US-023: validación de catálogos', () => {
  it.each(['facultades', 'centros', 'categorias'])(
    'acepta y normaliza nombres de %s',
    tipo => {
      expect(validateNombreCatalogo(tipo, '  Biblioteca Central  ')).toEqual({
        errors: {},
        value: { nombre: 'Biblioteca Central' },
      });
    },
  );

  it.each(['facultades', 'centros', 'categorias'])(
    'rechaza nombres vacíos en %s',
    tipo => {
      const result = validateNombreCatalogo(tipo, '   ');

      expect(result.value).toBeNull();
      expect(result.errors).toHaveProperty('nombre');
    },
  );

  it.each([null, undefined, 123, {}, []])(
    'rechaza nombres que no son texto: %s',
    nombre => {
      const result = validateNombreCatalogo('facultades', nombre);

      expect(result.value).toBeNull();
      expect(result.errors).toHaveProperty('nombre');
    },
  );

  it.each([
    ['facultades', 150],
    ['centros', 150],
    ['categorias', 100],
  ])('acepta el límite de longitud de %s', (tipo, limite) => {
    const nombre = 'A'.repeat(limite);

    expect(validateNombreCatalogo(tipo, nombre)).toEqual({
      errors: {},
      value: { nombre },
    });
  });

  it.each([
    ['facultades', 151],
    ['centros', 151],
    ['categorias', 101],
  ])('rechaza nombres demasiado largos en %s', (tipo, longitud) => {
    const result = validateNombreCatalogo(tipo, 'A'.repeat(longitud));

    expect(result.value).toBeNull();
    expect(result.errors).toHaveProperty('nombre');
  });

  it('rechaza tipos de catálogo desconocidos', () => {
    const result = validateNombreCatalogo('desconocido', 'Nombre válido');

    expect(result.value).toBeNull();
    expect(result.errors).toHaveProperty('tipo');
  });
});
describe('SCRUM-134 / US-023: validación de facultad del centro', () => {
  it('acepta un UUID válido', () => {
    const id = '22222222-2222-4222-8222-222222222222';

    expect(validateFacultadId(id)).toEqual({
      errors: {},
      value: { facultadId: id },
    });
  });

  it('normaliza las letras del UUID a minúsculas', () => {
    const id = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';

    expect(validateFacultadId(id)).toEqual({
      errors: {},
      value: { facultadId: id.toLowerCase() },
    });
  });

  it.each([null, undefined, '', '123', 'no-es-un-uuid', 123, {}, []])(
    'rechaza identificadores inválidos: %s',
    facultadId => {
      const result = validateFacultadId(facultadId);

      expect(result.value).toBeNull();
      expect(result.errors).toHaveProperty('facultadId');
    },
  );
});
describe('SCRUM-134 / US-023: repositorio de catálogos', () => {
  it('consulta facultades, centros y categorías, incluidos los inactivos', async () => {
    const facultades = [
      { id: 'fac-1', nombre: 'Facultad A', activo: true },
      { id: 'fac-2', nombre: 'Facultad B', activo: false },
    ];

    const categorias = [
      { id: 'cat-1', nombre: 'Documentos', activo: true },
    ];

    const centros = [
      {
        id: 'cen-1',
        nombre: 'Centro A',
        facultadId: 'fac-1',
        activo: false,
      },
    ];

    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: facultades })
        .mockResolvedValueOnce({ rows: categorias })
        .mockResolvedValueOnce({ rows: centros }),
    };

    const repository = createCatalogoRepository(pool);
    const result = await repository.list();

    expect(result).toEqual({ facultades, centros, categorias });
    expect(pool.query).toHaveBeenCalledTimes(3);

    for (const [sql] of pool.query.mock.calls) {
      expect(sql.toUpperCase()).not.toContain('WHERE ACTIVO');
    }
  });

  it('rechaza la consulta cuando no hay conexión a la base de datos', async () => {
    const repository = createCatalogoRepository();

    await expect(repository.list()).rejects.toThrow(
      'La gestión de catálogos no está disponible.',
    );
  });
});
describe('SCRUM-134 / US-023: servicio de catálogos', () => {
  it('devuelve los catálogos con su estado sin exponer campos adicionales', async () => {
    const storage = {
      list: vi.fn(async () => ({
        facultades: [
          { id: 'fac-1', nombre: 'Facultad A', activo: true, secreto: 'interno' },
          { id: 'fac-2', nombre: 'Facultad B', activo: false },
        ],
        centros: [
          {
            id: 'cen-1',
            nombre: 'Centro A',
            facultadId: 'fac-1',
            activo: false,
            secreto: 'interno',
          },
        ],
        categorias: [
          { id: 'cat-1', nombre: 'Documentos', activo: true },
        ],
      })),
    };

    const service = createCatalogoService(storage);
    const result = await service.list();

    expect(result).toEqual({
      facultades: [
        { id: 'fac-1', nombre: 'Facultad A', activo: true },
        { id: 'fac-2', nombre: 'Facultad B', activo: false },
      ],
      centros: [
        {
          id: 'cen-1',
          nombre: 'Centro A',
          facultadId: 'fac-1',
          activo: false,
        },
      ],
      categorias: [
        { id: 'cat-1', nombre: 'Documentos', activo: true },
      ],
    });

    expect(storage.list).toHaveBeenCalledOnce();
  });

  it('devuelve un error 503 si el repositorio no está disponible', async () => {
    const service = createCatalogoService();

    await expect(service.list()).rejects.toMatchObject({
      status: 503,
      message: 'La gestión de catálogos no está disponible.',
    });
  });

  it('utiliza la clase de error del proyecto', () => {
    const error = new CatalogoError(409, 'Nombre duplicado.', {
      nombre: 'Ya existe.',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CatalogoError');
    expect(error.status).toBe(409);
    expect(error.errors).toEqual({ nombre: 'Ya existe.' });
  });
});
describe('SCRUM-134 / US-023: creación en el repositorio', () => {
  it.each(['facultades', 'categorias'])(
    'crea un elemento en %s utilizando SQL parametrizado',
    async tipo => {
      const pool = {
        query: vi.fn(async () => ({
          rows: [{ id: 'nuevo-id', nombre: 'Nuevo elemento', activo: true }],
        })),
      };

      const repository = createCatalogoRepository(pool);
      const result = await repository.create(tipo, 'Nuevo elemento');

      expect(result).toEqual({
        id: 'nuevo-id',
        nombre: 'Nuevo elemento',
        activo: true,
      });

      expect(pool.query).toHaveBeenCalledOnce();

      const [sql, params] = pool.query.mock.calls[0];

      expect(sql).toContain(`INSERT INTO ${tipo}`);
      expect(sql).toContain('VALUES ($1, $2)');
      expect(params[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(params[1]).toBe('Nuevo elemento');
    },
  );

  it('rechaza tipos de catálogo no permitidos', async () => {
    const pool = { query: vi.fn() };
    const repository = createCatalogoRepository(pool);

    await expect(
      repository.create('usuarios', 'Elemento'),
    ).rejects.toThrow('Tipo de catálogo no válido.');

    expect(pool.query).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: creación de centros', () => {
  const FACULTAD_ID = '22222222-2222-4222-8222-222222222222';

  it('crea un centro asociado a una facultad activa', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: FACULTAD_ID }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'nuevo-centro',
            nombre: 'Centro A',
            facultadId: FACULTAD_ID,
            activo: true,
          }],
        })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const pool = { connect: vi.fn(async () => client) };
    const repository = createCatalogoRepository(pool);

    const result = await repository.createCentro('Centro A', FACULTAD_ID);

    expect(result).toEqual({
      id: 'nuevo-centro',
      nombre: 'Centro A',
      facultadId: FACULTAD_ID,
      activo: true,
    });

    expect(client.query.mock.calls.map(([sql]) => sql.trim())).toEqual([
      'BEGIN',
      'SELECT id FROM facultades WHERE id = $1 AND activo FOR SHARE',
      expect.stringContaining('INSERT INTO centros'),
      'COMMIT',
    ]);

    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rechaza una facultad inexistente o inactiva', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.createCentro('Centro A', FACULTAD_ID),
    ).rejects.toMatchObject({
      code: 'FACULTAD_INVALIDA',
    });

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT id FROM facultades WHERE id = $1 AND activo FOR SHARE',
      'ROLLBACK',
    ]);

    expect(client.release).toHaveBeenCalledOnce();
  });

  it('hace rollback y libera la conexión si falla la inserción', async () => {
    const duplicate = Object.assign(new Error('Duplicado'), {
      code: '23505',
      constraint: 'centros_facultad_nombre_key',
    });

    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockRejectedValueOnce(duplicate)
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.createCentro('Centro A', FACULTAD_ID),
    ).rejects.toBe(duplicate);

    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
describe('SCRUM-134 / US-023: creación desde el servicio', () => {
  it('crea una facultad con el nombre normalizado', async () => {
    const storage = {
      create: vi.fn(async () => ({
        id: 'fac-1',
        nombre: 'Facultad A',
        activo: true,
      })),
    };

    const service = createCatalogoService(storage);
    const result = await service.create('facultades', {
      nombre: '  Facultad A  ',
    });

    expect(storage.create).toHaveBeenCalledWith(
      'facultades',
      'Facultad A',
    );

    expect(result).toEqual({
      id: 'fac-1',
      nombre: 'Facultad A',
      activo: true,
    });
  });

  it('rechaza nombres vacíos antes de acceder al repositorio', async () => {
    const storage = { create: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.create('categorias', { nombre: '   ' }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        nombre: 'El nombre no puede estar vacío.',
      },
    });

    expect(storage.create).not.toHaveBeenCalled();
  });

  it('transforma un nombre duplicado en un error HTTP 409', async () => {
    const duplicate = Object.assign(new Error('Duplicado'), {
      code: '23505',
      constraint: 'facultades_nombre_key',
    });

    const storage = {
      create: vi.fn().mockRejectedValue(duplicate),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.create('facultades', { nombre: 'Facultad A' }),
    ).rejects.toMatchObject({
      status: 409,
      errors: {
        nombre: 'El nombre ya está registrado.',
      },
    });
  });

  it('rechaza tipos de catálogo no permitidos', async () => {
    const storage = { create: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.create('usuarios', { nombre: 'Prueba' }),
    ).rejects.toMatchObject({
      status: 404,
    });

    expect(storage.create).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: creación de centros desde el servicio', () => {
  const FACULTAD_ID = '22222222-2222-4222-8222-222222222222';

  it('crea un centro con los datos validados y normalizados', async () => {
    const storage = {
      createCentro: vi.fn(async (nombre, facultadId) => ({
        id: 'centro-1',
        nombre,
        facultadId,
        activo: true,
      })),
    };

    const service = createCatalogoService(storage);

    const result = await service.createCentro({
      nombre: '  Centro A  ',
      facultadId: FACULTAD_ID,
    });

    expect(storage.createCentro).toHaveBeenCalledWith(
      'Centro A',
      FACULTAD_ID,
    );

    expect(result).toEqual({
      id: 'centro-1',
      nombre: 'Centro A',
      facultadId: FACULTAD_ID,
      activo: true,
    });
  });

  it('rechaza los datos inválidos antes de consultar el repositorio', async () => {
    const storage = { createCentro: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.createCentro({
        nombre: '   ',
        facultadId: 'identificador-invalido',
      }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        nombre: 'El nombre no puede estar vacío.',
        facultadId: 'Selecciona una facultad válida.',
      },
    });

    expect(storage.createCentro).not.toHaveBeenCalled();
  });

  it('rechaza una facultad inexistente o inactiva', async () => {
    const error = Object.assign(new Error('Facultad inválida'), {
      code: 'FACULTAD_INVALIDA',
    });

    const storage = {
      createCentro: vi.fn().mockRejectedValue(error),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.createCentro({
        nombre: 'Centro A',
        facultadId: FACULTAD_ID,
      }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        facultadId: 'La facultad no existe o está inactiva.',
      },
    });
  });

  it('transforma un centro duplicado en un error HTTP 409', async () => {
    const duplicate = Object.assign(new Error('Duplicado'), {
      code: '23505',
      constraint: 'centros_facultad_nombre_key',
    });

    const storage = {
      createCentro: vi.fn().mockRejectedValue(duplicate),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.createCentro({
        nombre: 'Centro A',
        facultadId: FACULTAD_ID,
      }),
    ).rejects.toMatchObject({
      status: 409,
      errors: {
        nombre: 'El nombre ya está registrado en esta facultad.',
      },
    });
  });
});
describe('SCRUM-134 / US-023: edición en el repositorio', () => {
  const ID = '22222222-2222-4222-8222-222222222222';

  it.each(['facultades', 'categorias'])(
    'actualiza el nombre en %s conservando el identificador',
    async tipo => {
      const pool = {
        query: vi.fn(async () => ({
          rows: [{
            id: ID,
            nombre: 'Nombre actualizado',
            activo: false,
          }],
        })),
      };

      const repository = createCatalogoRepository(pool);
      const result = await repository.update(tipo, ID, 'Nombre actualizado');

      expect(result).toEqual({
        id: ID,
        nombre: 'Nombre actualizado',
        activo: false,
      });

      expect(pool.query).toHaveBeenCalledOnce();

      const [sql, params] = pool.query.mock.calls[0];

      expect(sql).toContain(`UPDATE ${tipo}`);
      expect(sql).toContain('SET nombre = $2');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual([ID, 'Nombre actualizado']);

      // La edición no debe modificar el ID ni el estado activo.
      expect(sql).not.toContain('SET id =');
      expect(sql).not.toContain('SET activo =');
    },
  );

  it('devuelve null si el elemento no existe', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
    };

    const repository = createCatalogoRepository(pool);

    await expect(
      repository.update('facultades', ID, 'Nuevo nombre'),
    ).resolves.toBeNull();
  });

  it('rechaza tipos de catálogo no permitidos', async () => {
    const pool = { query: vi.fn() };
    const repository = createCatalogoRepository(pool);

    await expect(
      repository.update('usuarios', ID, 'Nuevo nombre'),
    ).rejects.toThrow('Tipo de catálogo no válido.');

    expect(pool.query).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: edición de centros', () => {
  const CENTRO_ID = '11111111-1111-4111-8111-111111111111';
  const FACULTAD_ID = '22222222-2222-4222-8222-222222222222';

  it('edita un centro conservando su ID y su estado', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // Facultad activa
        .mockResolvedValueOnce({
          rows: [{
            id: CENTRO_ID,
            nombre: 'Centro actualizado',
            facultadId: FACULTAD_ID,
            activo: false,
          }],
        })
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };

    const pool = { connect: vi.fn(async () => client) };
    const repository = createCatalogoRepository(pool);

    const result = await repository.updateCentro(
      CENTRO_ID,
      'Centro actualizado',
      FACULTAD_ID,
    );

    expect(result).toEqual({
      id: CENTRO_ID,
      nombre: 'Centro actualizado',
      facultadId: FACULTAD_ID,
      activo: false,
    });

    const [sql, params] = client.query.mock.calls[2];

    expect(sql).toContain('UPDATE centros');
    expect(sql).toContain('SET nombre = $2, facultad_id = $3');
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual([
      CENTRO_ID,
      'Centro actualizado',
      FACULTAD_ID,
    ]);

    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rechaza una facultad inexistente o inactiva', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.updateCentro(CENTRO_ID, 'Centro A', FACULTAD_ID),
    ).rejects.toMatchObject({
      code: 'FACULTAD_INVALIDA',
    });

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT id FROM facultades WHERE id = $1 AND activo FOR SHARE',
      'ROLLBACK',
    ]);

    expect(client.release).toHaveBeenCalledOnce();
  });

  it('devuelve null si el centro no existe', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.updateCentro(CENTRO_ID, 'Centro A', FACULTAD_ID),
    ).resolves.toBeNull();

    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('hace rollback si falla la actualización', async () => {
    const duplicate = Object.assign(new Error('Duplicado'), {
      code: '23505',
      constraint: 'centros_facultad_nombre_key',
    });

    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockRejectedValueOnce(duplicate)
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.updateCentro(CENTRO_ID, 'Centro A', FACULTAD_ID),
    ).rejects.toBe(duplicate);

    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
describe('SCRUM-134 / US-023: edición desde el servicio', () => {
  const ID = '22222222-2222-4222-8222-222222222222';

  it.each(['facultades', 'categorias'])(
    'edita %s manteniendo el ID y el estado',
    async tipo => {
      const storage = {
        update: vi.fn(async (catalogo, id, nombre) => ({
          id,
          nombre,
          activo: false,
        })),
      };

      const service = createCatalogoService(storage);
      const result = await service.update(tipo, ID, {
        nombre: '  Nombre actualizado  ',
      });

      expect(storage.update).toHaveBeenCalledWith(
        tipo,
        ID,
        'Nombre actualizado',
      );

      expect(result).toEqual({
        id: ID,
        nombre: 'Nombre actualizado',
        activo: false,
      });
    },
  );

  it('rechaza un identificador inválido', async () => {
    const storage = { update: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.update('facultades', 'id-invalido', {
        nombre: 'Facultad A',
      }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        id: 'El identificador no es válido.',
      },
    });

    expect(storage.update).not.toHaveBeenCalled();
  });

  it('rechaza un nombre vacío', async () => {
    const storage = { update: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.update('categorias', ID, { nombre: '   ' }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        nombre: 'El nombre no puede estar vacío.',
      },
    });

    expect(storage.update).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el elemento no existe', async () => {
    const storage = {
      update: vi.fn().mockResolvedValue(null),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.update('facultades', ID, {
        nombre: 'Facultad A',
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'El elemento no existe.',
    });
  });

  it('devuelve 409 si el nuevo nombre ya existe', async () => {
    const duplicate = Object.assign(new Error('Duplicado'), {
      code: '23505',
      constraint: 'categorias_nombre_key',
    });

    const storage = {
      update: vi.fn().mockRejectedValue(duplicate),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.update('categorias', ID, {
        nombre: 'Documentos',
      }),
    ).rejects.toMatchObject({
      status: 409,
      errors: {
        nombre: 'El nombre ya está registrado.',
      },
    });
  });
});
describe('SCRUM-134 / US-023: edición de centros desde el servicio', () => {
  const CENTRO_ID = '11111111-1111-4111-8111-111111111111';
  const FACULTAD_ID = '22222222-2222-4222-8222-222222222222';

  it('edita un centro con datos normalizados, conservando ID y estado', async () => {
    const storage = {
      updateCentro: vi.fn(async (id, nombre, facultadId) => ({
        id,
        nombre,
        facultadId,
        activo: false,
      })),
    };

    const service = createCatalogoService(storage);

    const result = await service.updateCentro(CENTRO_ID, {
      nombre: '  Centro actualizado  ',
      facultadId: FACULTAD_ID,
    });

    expect(storage.updateCentro).toHaveBeenCalledWith(
      CENTRO_ID,
      'Centro actualizado',
      FACULTAD_ID,
    );

    expect(result).toEqual({
      id: CENTRO_ID,
      nombre: 'Centro actualizado',
      facultadId: FACULTAD_ID,
      activo: false,
    });
  });

  it('rechaza un identificador de centro inválido', async () => {
    const storage = { updateCentro: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.updateCentro('id-invalido', {
        nombre: 'Centro A',
        facultadId: FACULTAD_ID,
      }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        id: 'El identificador no es válido.',
      },
    });

    expect(storage.updateCentro).not.toHaveBeenCalled();
  });

  it('rechaza una facultad de destino inactiva o inexistente', async () => {
    const error = Object.assign(new Error('Facultad inválida'), {
      code: 'FACULTAD_INVALIDA',
    });

    const storage = {
      updateCentro: vi.fn().mockRejectedValue(error),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.updateCentro(CENTRO_ID, {
        nombre: 'Centro A',
        facultadId: FACULTAD_ID,
      }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        facultadId: 'La facultad no existe o está inactiva.',
      },
    });
  });

  it('devuelve 404 si el centro no existe', async () => {
    const storage = {
      updateCentro: vi.fn().mockResolvedValue(null),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.updateCentro(CENTRO_ID, {
        nombre: 'Centro A',
        facultadId: FACULTAD_ID,
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'El centro no existe.',
    });
  });

  it('devuelve 409 si el nombre ya existe en esa facultad', async () => {
    const duplicate = Object.assign(new Error('Duplicado'), {
      code: '23505',
      constraint: 'centros_facultad_nombre_key',
    });

    const storage = {
      updateCentro: vi.fn().mockRejectedValue(duplicate),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.updateCentro(CENTRO_ID, {
        nombre: 'Centro A',
        facultadId: FACULTAD_ID,
      }),
    ).rejects.toMatchObject({
      status: 409,
      errors: {
        nombre: 'El nombre ya está registrado en esta facultad.',
      },
    });
  });
});
describe('SCRUM-134 / US-023: activación y desactivación', () => {
  const ID = '22222222-2222-4222-8222-222222222222';

  it.each(['centros', 'categorias'])(
    'desactiva un elemento de %s sin eliminarlo',
    async tipo => {
      const registro = {
        id: ID,
        nombre: 'Elemento de prueba',
        activo: false,
      };

      if (tipo === 'centros') {
        registro.facultadId = ID;
      }

      const pool = {
        query: vi.fn(async () => ({ rows: [registro] })),
      };

      const repository = createCatalogoRepository(pool);
      const result = await repository.setActivo(tipo, ID, false);

      expect(result).toEqual(registro);

      const [sql, params] = pool.query.mock.calls[0];

      expect(sql).toContain(`UPDATE ${tipo}`);
      expect(sql).toContain('SET activo = $2');
      expect(sql).toContain('WHERE id = $1');
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(params).toEqual([ID, false]);
    },
  );

  it.each(['centros', 'categorias'])(
    'reactiva un elemento de %s',
    async tipo => {
      const pool = {
        query: vi.fn(async () => ({
          rows: [{ id: ID, nombre: 'Elemento', activo: true }],
        })),
      };

      const repository = createCatalogoRepository(pool);
      const result = await repository.setActivo(tipo, ID, true);

      expect(result.activo).toBe(true);
      expect(pool.query.mock.calls[0][1]).toEqual([ID, true]);
    },
  );

  it('devuelve null si el elemento no existe', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
    };

    const repository = createCatalogoRepository(pool);

    await expect(
      repository.setActivo('centros', ID, false),
    ).resolves.toBeNull();
  });

  it('rechaza un estado que no sea booleano', async () => {
    const pool = { query: vi.fn() };
    const repository = createCatalogoRepository(pool);

    await expect(
      repository.setActivo('centros', ID, 'false'),
    ).rejects.toThrow('El estado activo debe ser un booleano.');

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rechaza tipos de catálogo no permitidos', async () => {
    const pool = { query: vi.fn() };
    const repository = createCatalogoRepository(pool);

    await expect(
      repository.setActivo('usuarios', ID, false),
    ).rejects.toThrow('Tipo de catálogo no válido.');

    expect(pool.query).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: estado de facultades', () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  it('desactiva una facultad sin conserjes asignados', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // Bloqueo de facultad
        .mockResolvedValueOnce({ rowCount: 0 }) // Sin conserjes
        .mockResolvedValueOnce({
          rows: [{ id: ID, nombre: 'Facultad A', activo: false }],
        })
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    const result = await repository.setFacultadActiva(ID, false);

    expect(result.activo).toBe(false);

    expect(client.query.mock.calls.map(([sql]) => sql.trim())).toEqual([
      'BEGIN',
      'SELECT id FROM facultades WHERE id = $1 FOR UPDATE',
      'SELECT 1 FROM asignaciones_conserje WHERE facultad_id = $1 LIMIT 1',
      expect.stringContaining('UPDATE facultades'),
      'COMMIT',
    ]);

    expect(client.query.mock.calls[3][1]).toEqual([ID, false]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('impide desactivar una facultad con conserjes asignados', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({}), // ROLLBACK
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.setFacultadActiva(ID, false),
    ).rejects.toMatchObject({
      code: 'FACULTAD_CON_CONSERJES',
    });

    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('UPDATE facultades')),
    ).toBe(false);

    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('reactiva una facultad sin comprobar asignaciones', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: ID, nombre: 'Facultad A', activo: true }],
        })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    const result = await repository.setFacultadActiva(ID, true);

    expect(result.activo).toBe(true);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('devuelve null si la facultad no existe', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };

    const repository = createCatalogoRepository({
      connect: vi.fn(async () => client),
    });

    await expect(
      repository.setFacultadActiva(ID, false),
    ).resolves.toBeNull();

    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rechaza estados que no sean booleanos', async () => {
    const pool = { connect: vi.fn() };
    const repository = createCatalogoRepository(pool);

    await expect(
      repository.setFacultadActiva(ID, 'false'),
    ).rejects.toThrow('El estado activo debe ser un booleano.');

    expect(pool.connect).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: cambio de estado desde el servicio', () => {
  const ID = '22222222-2222-4222-8222-222222222222';

  it.each(['centros', 'categorias'])(
    'desactiva un elemento de %s',
    async tipo => {
      const storage = {
        setActivo: vi.fn(async (catalogo, id, activo) => ({
          id,
          nombre: 'Elemento de prueba',
          ...(tipo === 'centros' ? { facultadId: ID } : {}),
          activo,
        })),
      };

      const service = createCatalogoService(storage);
      const result = await service.setActivo(tipo, ID, { activo: false });

      expect(storage.setActivo).toHaveBeenCalledWith(tipo, ID, false);
      expect(result.activo).toBe(false);
    },
  );

  it('reactiva una facultad', async () => {
    const storage = {
      setFacultadActiva: vi.fn(async (id, activo) => ({
        id,
        nombre: 'Facultad A',
        activo,
      })),
    };

    const service = createCatalogoService(storage);
    const result = await service.setActivo('facultades', ID, { activo: true });

    expect(storage.setFacultadActiva).toHaveBeenCalledWith(ID, true);
    expect(result).toEqual({
      id: ID,
      nombre: 'Facultad A',
      activo: true,
    });
  });

  it('rechaza estados que no sean booleanos', async () => {
    const storage = { setActivo: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.setActivo('centros', ID, { activo: 'false' }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        activo: 'El estado debe ser verdadero o falso.',
      },
    });

    expect(storage.setActivo).not.toHaveBeenCalled();
  });

  it('rechaza identificadores inválidos', async () => {
    const storage = { setActivo: vi.fn() };
    const service = createCatalogoService(storage);

    await expect(
      service.setActivo('categorias', 'id-invalido', { activo: false }),
    ).rejects.toMatchObject({
      status: 400,
      errors: {
        id: 'El identificador no es válido.',
      },
    });

    expect(storage.setActivo).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el elemento no existe', async () => {
    const storage = { setActivo: vi.fn().mockResolvedValue(null) };
    const service = createCatalogoService(storage);

    await expect(
      service.setActivo('centros', ID, { activo: false }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'El elemento no existe.',
    });
  });

  it('impide desactivar facultades con conserjes asignados', async () => {
    const error = Object.assign(new Error('Conserjes asignados'), {
      code: 'FACULTAD_CON_CONSERJES',
    });

    const storage = {
      setFacultadActiva: vi.fn().mockRejectedValue(error),
    };

    const service = createCatalogoService(storage);

    await expect(
      service.setActivo('facultades', ID, { activo: false }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'No se puede desactivar una facultad con conserjes asignados.',
    });
  });
});