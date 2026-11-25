import validator from 'validator';
import { validateAviso, validateBusquedaAvisos } from '../validation/avisos.js';

export class AvisoError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function createAvisoService(storage) {
  return {
    async options() {
      const { categorias, facultades, centros } = await storage.options();
      const option = ({ id, nombre }) => ({ id, nombre });
      return {
        categorias: categorias.map(option), facultades: facultades.map(option),
        centros: centros.map(({ id, nombre, facultadId }) => ({ id, nombre, facultadId })),
      };
    },

    // SCRUM-57 / US-014: servicio de consulta del feed de avisos.
    // SCRUM-119 / US-015: búsqueda por texto y filtros por categoría, facultad y centro.
    async listActive(query = {}) {
      const { errors, soloPaginacion, value } = validateBusquedaAvisos(query);

      if (Object.keys(errors).length) {
        throw new AvisoError(400,
          soloPaginacion ? 'Revisa los parámetros de paginación.' : 'Revisa los filtros de búsqueda.', errors);
      }

      const { pagina, tamano, filtros } = value;
      const conFiltros = filtros.terminos.length > 0 ||
        Boolean(filtros.categoriaId || filtros.facultadId || filtros.centroId);
      const { avisos, total } = await storage.listActive(pagina, tamano, filtros);
      const totalPaginas = Math.ceil(total / tamano);

      if (pagina > Math.max(1, totalPaginas)) {
        throw new AvisoError(404, 'La página solicitada no existe.', {
          pagina: 'Selecciona una página válida.',
        });
      }

      return {
        avisos: avisos.map(aviso => ({
          id: aviso.id,
          categoria: {
            id: aviso.categoria.id,
            nombre: aviso.categoria.nombre,
          },
          facultad: {
            id: aviso.facultad.id,
            nombre: aviso.facultad.nombre,
          },
          centro: aviso.centro ? {
            id: aviso.centro.id,
            nombre: aviso.centro.nombre,
          } : null,
          descripcion: aviso.descripcion,
          fechaPerdida: aviso.fechaPerdida,
          estado: aviso.estado,
        })),
        paginacion: {
          pagina,
          tamano,
          total,
          totalPaginas,
          anterior: pagina > 1,
          siguiente: pagina < totalPaginas,
        },
        ...(total === 0 && {
          message: conFiltros
            ? 'No hay avisos activos que coincidan con la búsqueda.'
            : 'Todavía no hay avisos de pérdida activos.',
        }),
      };
    },

    async listForClosure(userId) {
      return { avisos: await storage.listForClosure(userId) };
    },

    async close(userId, id, body) {
      if (!validator.isUUID(id)) throw new AvisoError(404, 'El aviso no existe.');

      const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
      if (!motivo || motivo.length > 500) {
        throw new AvisoError(400, 'Indica un motivo de cierre de entre 1 y 500 caracteres.');
      }

      return { aviso: await storage.close(userId, id, motivo) };
    },

    // SCRUM-122 / US-016: listado de los avisos propios, en cualquier estado.
    async listOwn(userId) {
      const avisos = await storage.listOwn(userId);
      return {
        avisos: avisos.map(aviso => ({
          id: aviso.id,
          descripcion: aviso.descripcion,
          fechaPerdida: aviso.fechaPerdida,
          estado: aviso.estado,
          categoria: aviso.categoria,
          facultad: aviso.facultad,
          centro: aviso.centro ?? null,
          publicadoEn: aviso.publicadoEn,
          actualizadoEn: aviso.actualizadoEn,
        })),
      };
    },

    // SCRUM-122 / US-016: datos de un aviso propio para el formulario de edición, incluidos los privados.
    async getOwn(userId, avisoId) {
      if (!validator.isUUID(String(avisoId ?? ''))) throw new AvisoError(404, 'Aviso no encontrado.');
      const aviso = await storage.getOwn(userId, avisoId);
      if (!aviso) throw new AvisoError(404, 'Aviso no encontrado.');
      return {
        aviso: {
          id: aviso.id,
          categoriaId: aviso.categoriaId,
          facultadId: aviso.facultadId,
          centroId: aviso.centroId ?? null,
          descripcion: aviso.descripcion,
          fechaPerdida: aviso.fechaPerdida,
          estado: aviso.estado,
          rasgosPrivados: aviso.rasgosPrivados ?? null,
          contactoEmail: aviso.contactoEmail ?? null,
          contactoTelefono: aviso.contactoTelefono ?? null,
          publicadoEn: aviso.publicadoEn,
          actualizadoEn: aviso.actualizadoEn,
          editable: aviso.estado === 'Activo',
        },
      };
    },

    // SCRUM-122 / US-016: sustituye los datos editables de un aviso propio y Activo.
    // Mismas reglas que al publicar; autor, estado e id nunca se aceptan del cliente (US-016-AC-04).
    async update(userId, avisoId, body) {
      if (!validator.isUUID(String(avisoId ?? ''))) throw new AvisoError(404, 'Aviso no encontrado.');
      const { errors, value } = validateAviso(body);
      if (Object.keys(errors).length) throw new AvisoError(400, 'Revisa los datos del aviso.', errors);
      await storage.update(userId, avisoId, value);
      return { message: 'Aviso actualizado correctamente.', aviso: { id: avisoId, estado: 'Activo' } };
    },

    async publish(userId, body) {
      const { errors, value } = validateAviso(body);
      if (Object.keys(errors).length) throw new AvisoError(400, 'Revisa los datos del aviso.', errors);
      const saved = await storage.publish(userId, value);
      // Lista explícita: ni correo, ni rasgos, ni datos del autor salen en la respuesta.
      return { message: 'Aviso de pérdida publicado correctamente.', aviso: { id: saved.id, estado: 'Activo' } };
    },
  };
}
