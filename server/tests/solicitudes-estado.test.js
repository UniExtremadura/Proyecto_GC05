
import { describe, expect, it, vi } from 'vitest';
import {
  createSolicitudService,
  SolicitudError,
} from '../src/services/solicitudes.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const SOLICITUD_ID = '22222222-2222-4222-8222-222222222222';

const usuario = { id: USUARIO_ID, rol: 'USUARIO' };

function crearServicio(storage = {}) {
  return createSolicitudService({
    listOwn: vi.fn().mockResolvedValue([]),
    getOwn: vi.fn().mockResolvedValue(null),
    ...storage,
  });
}

describe('SCRUM-131: listado de solicitudes propias', () => {
  it('devuelve las solicitudes del usuario autenticado', async () => {
    const solicitudes = [
      { id: SOLICITUD_ID, estado: 'Pendiente' },
    ];
    const listOwn = vi.fn().mockResolvedValue(solicitudes);
    const service = crearServicio({ listOwn });

    await expect(service.listOwn(usuario)).resolves.toEqual({
      solicitudes,
    });

    expect(listOwn).toHaveBeenCalledExactlyOnceWith(USUARIO_ID);
  });

  it('devuelve una lista vacía si no existen solicitudes', async () => {
    const service = crearServicio();

    await expect(service.listOwn(usuario)).resolves.toEqual({
      solicitudes: [],
    });
  });

  it.each(['ADMINISTRADOR', 'CONSERJE'])(
    'rechaza el acceso del rol %s',
    async rol => {
      const listOwn = vi.fn();
      const service = crearServicio({ listOwn });

      await expect(service.listOwn({ id: USUARIO_ID, rol }))
        .rejects.toMatchObject({
          status: 403,
        });

      expect(listOwn).not.toHaveBeenCalled();
    },
  );
});

describe('SCRUM-131: detalle de solicitud propia', () => {
  it('devuelve una solicitud del usuario autenticado', async () => {
    const solicitud = {
      id: SOLICITUD_ID,
      estado: 'Validada',
      hallazgoId: '33333333-3333-4333-8333-333333333333',
    };

    const getOwn = vi.fn().mockResolvedValue(solicitud);
    const service = crearServicio({ getOwn });

    await expect(service.getOwn(usuario, SOLICITUD_ID))
      .resolves.toEqual({ solicitud });

    expect(getOwn).toHaveBeenCalledExactlyOnceWith(
      USUARIO_ID,
      SOLICITUD_ID,
    );
  });

  it('devuelve 404 si la solicitud no existe o es ajena', async () => {
    const service = crearServicio();

    await expect(service.getOwn(usuario, SOLICITUD_ID))
      .rejects.toMatchObject({
        status: 404,
        message: 'Solicitud no encontrada.',
      });
  });

  it('devuelve 404 ante identificadores inválidos', async () => {
    const getOwn = vi.fn();
    const service = crearServicio({ getOwn });

    await expect(service.getOwn(usuario, 'identificador-invalido'))
      .rejects.toMatchObject({
        status: 404,
      });

    expect(getOwn).not.toHaveBeenCalled();
  });

  it.each(['ADMINISTRADOR', 'CONSERJE'])(
    'rechaza el detalle para el rol %s',
    async rol => {
      const getOwn = vi.fn();
      const service = crearServicio({ getOwn });

      await expect(service.getOwn(
        { id: USUARIO_ID, rol },
        SOLICITUD_ID,
      )).rejects.toMatchObject({
        status: 403,
      });

      expect(getOwn).not.toHaveBeenCalled();
    },
  );
});