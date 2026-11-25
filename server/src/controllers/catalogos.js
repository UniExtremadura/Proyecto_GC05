// SCRUM-134 / US-023: controlador de catálogos administrativos.
import { createCatalogoService } from '../services/catalogos.js';

export function requireAdministrador(req, res, next) {
  if (req.user?.rol !== 'ADMINISTRADOR') {
    return res.status(403).json({
      message: 'No tienes permisos para gestionar los catálogos.',
    });
  }

  next();
}

export function catalogoController(storage) {
  const service = createCatalogoService(storage);

  return {
    async list(_req, res, next) {
      try {
        res.json(await service.list());
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        const tipo = req.params.tipo;
        const result = tipo === 'centros'
          ? await service.createCentro(req.body)
          : await service.create(tipo, req.body);

        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },

    async update(req, res, next) {
      try {
        const { tipo, id } = req.params;
        const result = tipo === 'centros'
          ? await service.updateCentro(id, req.body)
          : await service.update(tipo, id, req.body);

        res.json(result);
      } catch (error) {
        next(error);
      }
    },

    async setActivo(req, res, next) {
      try {
        const { tipo, id } = req.params;
        res.json(await service.setActivo(tipo, id, req.body));
      } catch (error) {
        next(error);
      }
    },
  };
}