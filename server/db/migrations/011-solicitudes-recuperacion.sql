CREATE TABLE IF NOT EXISTS solicitudes_recuperacion (
    id UUID PRIMARY KEY,
    hallazgo_id UUID NOT NULL REFERENCES hallazgos (id),
    solicitante_id UUID NOT NULL REFERENCES usuarios (id),
    justificacion VARCHAR(2000) NOT NULL CHECK (btrim(justificacion) <> ''),
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
      CHECK (estado IN ('Pendiente', 'Validada', 'Rechazada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_recuperacion_pendiente_idx
    ON solicitudes_recuperacion (solicitante_id, hallazgo_id)
    WHERE estado = 'Pendiente';
