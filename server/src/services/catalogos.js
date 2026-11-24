import {
  validateNombreCatalogo,
  validateFacultadId,
} from '../validation/catalogos.js';
// SCRUM-134 / US-023: reglas de negocio de los catálogos administrativos.

export class CatalogoError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.name = 'CatalogoError';
    this.status = status;
    this.errors = errors;
  }
}

export function createCatalogoService(storage) {
  return {
    async list() {
      if (!storage || typeof storage.list !== 'function') {
        throw new CatalogoError(
          503,
          'La gestión de catálogos no está disponible.',
        );
      }

      const { facultades, centros, categorias } = await storage.list();

      return {
        facultades: facultades.map(({ id, nombre, activo }) => ({
          id, nombre, activo,
        })),
        centros: centros.map(({ id, nombre, facultadId, activo }) => ({
          id, nombre, facultadId, activo,
        })),
        categorias: categorias.map(({ id, nombre, activo }) => ({
          id, nombre, activo,
        })),
      };
    },
    async create(tipo, body) {
      if (!['facultades', 'categorias'].includes(tipo)) {
        throw new CatalogoError(404, 'El catálogo solicitado no existe.');
      }

      const { errors, value } = validateNombreCatalogo(tipo, body?.nombre);

      if (Object.keys(errors).length) {
        throw new CatalogoError(400, 'Revisa los datos del catálogo.', errors);
      }

      if (typeof storage?.create !== 'function') {
        throw new CatalogoError(503, 'La gestión de catálogos no está disponible.');
      }

      try {
        const { id, nombre, activo } = await storage.create(tipo, value.nombre);
        return { id, nombre, activo };
      } catch (error) {
        const constraints = {
          facultades: 'facultades_nombre_key',
          categorias: 'categorias_nombre_key',
        };

        if (error.code === '23505' && error.constraint === constraints[tipo]) {
          throw new CatalogoError(409, 'Ya existe un elemento con ese nombre.', {
            nombre: 'El nombre ya está registrado.',
          });
        }

        throw error;
      }
    },
    async createCentro(body) {
      const nombre = validateNombreCatalogo('centros', body?.nombre);
      const facultad = validateFacultadId(body?.facultadId);

      const errors = {
        ...nombre.errors,
        ...facultad.errors,
      };

      if (Object.keys(errors).length) {
        throw new CatalogoError(
          400,
          'Revisa los datos del centro.',
          errors,
        );
      }

      if (typeof storage?.createCentro !== 'function') {
        throw new CatalogoError(
          503,
          'La gestión de catálogos no está disponible.',
        );
      }

      try {
        const { id, nombre: nombreCentro, facultadId, activo } =
          await storage.createCentro(
            nombre.value.nombre,
            facultad.value.facultadId,
          );

        return {
          id,
          nombre: nombreCentro,
          facultadId,
          activo,
        };
      } catch (error) {
        if (error.code === 'FACULTAD_INVALIDA') {
          throw new CatalogoError(
            400,
            'Revisa los datos del centro.',
            { facultadId: 'La facultad no existe o está inactiva.' },
          );
        }

        if (
          error.code === '23505' &&
          error.constraint === 'centros_facultad_nombre_key'
        ) {
          throw new CatalogoError(
            409,
            'Ya existe un centro con ese nombre en la facultad.',
            { nombre: 'El nombre ya está registrado en esta facultad.' },
          );
        }

        throw error;
      }
    },
    async update(tipo, id, body) {
      if (!['facultades', 'categorias'].includes(tipo)) {
        throw new CatalogoError(404, 'El catálogo solicitado no existe.');
      }

      const identificador = validateFacultadId(id);
      const nombre = validateNombreCatalogo(tipo, body?.nombre);

      const errors = {
        ...(Object.keys(identificador.errors).length
          ? { id: 'El identificador no es válido.' }
          : {}),
        ...nombre.errors,
      };

      if (Object.keys(errors).length) {
        throw new CatalogoError(
          400,
          'Revisa los datos del catálogo.',
          errors,
        );
      }

      if (typeof storage?.update !== 'function') {
        throw new CatalogoError(
          503,
          'La gestión de catálogos no está disponible.',
        );
      }

      try {
        const result = await storage.update(
          tipo,
          identificador.value.facultadId,
          nombre.value.nombre,
        );

        if (!result) {
          throw new CatalogoError(404, 'El elemento no existe.');
        }

        const { id: resultId, nombre: resultNombre, activo } = result;
        return { id: resultId, nombre: resultNombre, activo };
      } catch (error) {
        const constraints = {
          facultades: 'facultades_nombre_key',
          categorias: 'categorias_nombre_key',
        };

        if (
          error.code === '23505' &&
          error.constraint === constraints[tipo]
        ) {
          throw new CatalogoError(
            409,
            'Ya existe un elemento con ese nombre.',
            { nombre: 'El nombre ya está registrado.' },
          );
        }

        throw error;
      }
    },
    async updateCentro(id, body) {
      const identificador = validateFacultadId(id);
      const nombre = validateNombreCatalogo('centros', body?.nombre);
      const facultad = validateFacultadId(body?.facultadId);

      const errors = {
        ...(Object.keys(identificador.errors).length
          ? { id: 'El identificador no es válido.' }
          : {}),
        ...nombre.errors,
        ...facultad.errors,
      };

      if (Object.keys(errors).length) {
        throw new CatalogoError(
          400,
          'Revisa los datos del centro.',
          errors,
        );
      }

      if (typeof storage?.updateCentro !== 'function') {
        throw new CatalogoError(
          503,
          'La gestión de catálogos no está disponible.',
        );
      }

      try {
        const result = await storage.updateCentro(
          identificador.value.facultadId,
          nombre.value.nombre,
          facultad.value.facultadId,
        );

        if (!result) {
          throw new CatalogoError(404, 'El centro no existe.');
        }

        const { id: centroId, nombre: nombreCentro, facultadId, activo } = result;

        return {
          id: centroId,
          nombre: nombreCentro,
          facultadId,
          activo,
        };
      } catch (error) {
        if (error.code === 'FACULTAD_INVALIDA') {
          throw new CatalogoError(
            400,
            'Revisa los datos del centro.',
            { facultadId: 'La facultad no existe o está inactiva.' },
          );
        }

        if (
          error.code === '23505' &&
          error.constraint === 'centros_facultad_nombre_key'
        ) {
          throw new CatalogoError(
            409,
            'Ya existe un centro con ese nombre en la facultad.',
            { nombre: 'El nombre ya está registrado en esta facultad.' },
          );
        }

        throw error;
      }
    },
    async setActivo(tipo, id, body) {
      if (!['facultades', 'centros', 'categorias'].includes(tipo)) {
        throw new CatalogoError(404, 'El catálogo solicitado no existe.');
      }

      const identificador = validateFacultadId(id);
      const errors = {};

      if (Object.keys(identificador.errors).length) {
        errors.id = 'El identificador no es válido.';
      }

      if (typeof body?.activo !== 'boolean') {
        errors.activo = 'El estado debe ser verdadero o falso.';
      }

      if (Object.keys(errors).length) {
        throw new CatalogoError(
          400,
          'Revisa los datos del catálogo.',
          errors,
        );
      }

      const metodo = tipo === 'facultades'
        ? storage?.setFacultadActiva
        : storage?.setActivo;

      if (typeof metodo !== 'function') {
        throw new CatalogoError(
          503,
          'La gestión de catálogos no está disponible.',
        );
      }

      try {
        const result = tipo === 'facultades'
          ? await storage.setFacultadActiva(
              identificador.value.facultadId,
              body.activo,
            )
          : await storage.setActivo(
              tipo,
              identificador.value.facultadId,
              body.activo,
            );

        if (!result) {
          throw new CatalogoError(404, 'El elemento no existe.');
        }

        const { id: resultId, nombre, activo } = result;

        return tipo === 'centros'
          ? { id: resultId, nombre, facultadId: result.facultadId, activo }
          : { id: resultId, nombre, activo };
      } catch (error) {
        if (error.code === 'FACULTAD_CON_CONSERJES') {
          throw new CatalogoError(
            409,
            'No se puede desactivar una facultad con conserjes asignados.',
          );
        }

        throw error;
      }
    },
  };
}