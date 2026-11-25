import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import { hashPassword } from '../src/security/passwords.js';
import { createApp } from '../src/app.js';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const FACULTAD_ID = '22222222-2222-4222-8222-222222222222';

let passwordHash;

beforeAll(async () => {
  passwordHash = await hashPassword('Prueba1234');
});

async function fixture({ rol = 'ADMINISTRADOR', login = true } = {}) {
  const user = {
    id: USER_ID,
    email: 'admin@example.com',
    password_hash: passwordHash,
    rol,
    activo: true,
  };

  const storage = {
    list: vi.fn(async () => ({
      facultades: [
        { id: FACULTAD_ID, nombre: 'Facultad A', activo: true },
      ],
      centros: [],
      categorias: [],
    })),
    create: vi.fn(),
    createCentro: vi.fn(),
    update: vi.fn(),
    updateCentro: vi.fn(),
    setActivo: vi.fn(),
    setFacultadActiva: vi.fn(),
  };

  const app = createApp({
    users: {
      findByEmail: async () => user,
      findById: async () => user,
    },
    catalogoStorage: storage,
    sessionMiddleware: session({
      secret: 'secreto-ficticio-catalogos-largo-mas-de-32',
      resave: false,
      saveUninitialized: false,
    }),
  });

  const agent = request.agent(app);

  if (login) {
    const response = await agent
      .post('/api/auth/login')
      .send({
        email: user.email,
        password: 'Prueba1234',
      });

    expect(response.status).toBe(200);
  }

  return { agent, storage };
}

describe('SCRUM-134 / US-023: permisos de la API administrativa', () => {
  it('permite a un administrador consultar los catálogos', async () => {
    const { agent, storage } = await fixture();

    const response = await agent.get('/api/admin/catalogos');

    expect(response.status).toBe(200);
    expect(response.body.facultades).toHaveLength(1);
    expect(storage.list).toHaveBeenCalledOnce();
  });

  it.each(['USUARIO', 'CONSERJE'])(
    'impide consultar los catálogos administrativos al rol %s',
    async rol => {
      const { agent, storage } = await fixture({ rol });

      const response = await agent.get('/api/admin/catalogos');

      expect(response.status).toBe(403);
      expect(storage.list).not.toHaveBeenCalled();
    },
  );

  it('rechaza el acceso sin iniciar sesión', async () => {
    const { agent, storage } = await fixture({ login: false });

    const response = await agent.get('/api/admin/catalogos');

    expect(response.status).toBe(401);
    expect(storage.list).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: creación mediante API', () => {
  it('permite al administrador crear una facultad', async () => {
    const { agent, storage } = await fixture();

    storage.create.mockResolvedValue({
      id: FACULTAD_ID,
      nombre: 'Nueva facultad',
      activo: true,
    });

    const response = await agent
      .post('/api/admin/catalogos/facultades')
      .set('Origin', 'http://localhost:5173')
      .send({ nombre: '  Nueva facultad  ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: FACULTAD_ID,
      nombre: 'Nueva facultad',
      activo: true,
    });
    expect(storage.create).toHaveBeenCalledWith(
      'facultades',
      'Nueva facultad',
    );
  });

  it.each(['USUARIO', 'CONSERJE'])(
    'impide crear facultades al rol %s',
    async rol => {
      const { agent, storage } = await fixture({ rol });

      const response = await agent
        .post('/api/admin/catalogos/facultades')
        .set('Origin', 'http://localhost:5173')
        .send({ nombre: 'Nueva facultad' });

      expect(response.status).toBe(403);
      expect(storage.create).not.toHaveBeenCalled();
    },
  );

  it('rechaza una facultad con nombre vacío', async () => {
    const { agent, storage } = await fixture();

    const response = await agent
      .post('/api/admin/catalogos/facultades')
      .set('Origin', 'http://localhost:5173')
      .send({ nombre: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toHaveProperty('nombre');
    expect(storage.create).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: edición mediante API', () => {
  it('permite al administrador editar una facultad', async () => {
    const { agent, storage } = await fixture();

    storage.update.mockResolvedValue({
      id: FACULTAD_ID,
      nombre: 'Facultad actualizada',
      activo: true,
    });

    const response = await agent
      .put(`/api/admin/catalogos/facultades/${FACULTAD_ID}`)
      .set('Origin', 'http://localhost:5173')
      .send({ nombre: '  Facultad actualizada  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: FACULTAD_ID,
      nombre: 'Facultad actualizada',
      activo: true,
    });
    expect(storage.update).toHaveBeenCalledWith(
      'facultades',
      FACULTAD_ID,
      'Facultad actualizada',
    );
  });

  it.each(['USUARIO', 'CONSERJE'])(
    'impide editar facultades al rol %s',
    async rol => {
      const { agent, storage } = await fixture({ rol });

      const response = await agent
        .put(`/api/admin/catalogos/facultades/${FACULTAD_ID}`)
        .set('Origin', 'http://localhost:5173')
        .send({ nombre: 'Facultad actualizada' });

      expect(response.status).toBe(403);
      expect(storage.update).not.toHaveBeenCalled();
    },
  );

  it('rechaza un nombre vacío al editar', async () => {
    const { agent, storage } = await fixture();

    const response = await agent
      .put(`/api/admin/catalogos/facultades/${FACULTAD_ID}`)
      .set('Origin', 'http://localhost:5173')
      .send({ nombre: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toHaveProperty('nombre');
    expect(storage.update).not.toHaveBeenCalled();
  });
});
describe('SCRUM-134 / US-023: cambio de estado mediante API', () => {
  it('permite al administrador desactivar una categoría', async () => {
    const { agent, storage } = await fixture();

    storage.setActivo.mockResolvedValue({
      id: FACULTAD_ID,
      nombre: 'Documentos',
      activo: false,
    });

    const response = await agent
      .patch(`/api/admin/catalogos/categorias/${FACULTAD_ID}/estado`)
      .set('Origin', 'http://localhost:5173')
      .send({ activo: false });

    expect(response.status).toBe(200);
    expect(response.body.activo).toBe(false);
    expect(storage.setActivo).toHaveBeenCalledWith(
      'categorias',
      FACULTAD_ID,
      false,
    );
  });

  it('permite al administrador reactivar una facultad', async () => {
    const { agent, storage } = await fixture();

    storage.setFacultadActiva.mockResolvedValue({
      id: FACULTAD_ID,
      nombre: 'Facultad A',
      activo: true,
    });

    const response = await agent
      .patch(`/api/admin/catalogos/facultades/${FACULTAD_ID}/estado`)
      .set('Origin', 'http://localhost:5173')
      .send({ activo: true });

    expect(response.status).toBe(200);
    expect(response.body.activo).toBe(true);
    expect(storage.setFacultadActiva).toHaveBeenCalledWith(
      FACULTAD_ID,
      true,
    );
  });

  it.each(['USUARIO', 'CONSERJE'])(
    'impide cambiar estados al rol %s',
    async rol => {
      const { agent, storage } = await fixture({ rol });

      const response = await agent
        .patch(`/api/admin/catalogos/categorias/${FACULTAD_ID}/estado`)
        .set('Origin', 'http://localhost:5173')
        .send({ activo: false });

      expect(response.status).toBe(403);
      expect(storage.setActivo).not.toHaveBeenCalled();
    },
  );

  it('rechaza estados que no sean booleanos', async () => {
    const { agent, storage } = await fixture();

    const response = await agent
      .patch(`/api/admin/catalogos/categorias/${FACULTAD_ID}/estado`)
      .set('Origin', 'http://localhost:5173')
      .send({ activo: 'false' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toHaveProperty('activo');
    expect(storage.setActivo).not.toHaveBeenCalled();
  });

  it('impide desactivar facultades con conserjes asignados', async () => {
    const { agent, storage } = await fixture();

    const error = Object.assign(new Error('Conserjes asignados'), {
      code: 'FACULTAD_CON_CONSERJES',
    });

    storage.setFacultadActiva.mockRejectedValue(error);

    const response = await agent
      .patch(`/api/admin/catalogos/facultades/${FACULTAD_ID}/estado`)
      .set('Origin', 'http://localhost:5173')
      .send({ activo: false });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'No se puede desactivar una facultad con conserjes asignados.',
    );
  });
});