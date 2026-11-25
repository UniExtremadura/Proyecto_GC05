// SCRUM-134 / US-023: validación de facultades, centros y categorías.
const MAX_LENGTH = {
  facultades: 150,
  centros: 150,
  categorias: 100,
};

export function validateNombreCatalogo(tipo, nombre) {
  if (!Object.hasOwn(MAX_LENGTH, tipo)) {
    return {
      errors: { tipo: 'El tipo de catálogo no es válido.' },
      value: null,
    };
  }

  if (typeof nombre !== 'string') {
    return {
      errors: { nombre: 'Introduce un nombre válido.' },
      value: null,
    };
  }

  const normalizado = nombre.trim();

  if (!normalizado) {
    return {
      errors: { nombre: 'El nombre no puede estar vacío.' },
      value: null,
    };
  }

  if (normalizado.length > MAX_LENGTH[tipo]) {
    return {
      errors: {
        nombre: `El nombre no puede superar los ${MAX_LENGTH[tipo]} caracteres.`,
      },
      value: null,
    };
  }

  return {
    errors: {},
    value: { nombre: normalizado },
  };
}
export function validateFacultadId(facultadId) {
  if (
    typeof facultadId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facultadId)
  ) {
    return {
      errors: { facultadId: 'Selecciona una facultad válida.' },
      value: null,
    };
  }

  return {
    errors: {},
    value: { facultadId: facultadId.toLowerCase() },
  };
}