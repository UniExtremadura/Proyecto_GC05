
-- SCRUM-131 / US-019: información de las decisiones de recuperación.
-- Las columnas son opcionales porque una solicitud Pendiente
-- todavía no tiene una decisión.

ALTER TABLE solicitudes_recuperacion
    ADD COLUMN IF NOT EXISTS motivo_rechazo VARCHAR(2000);

ALTER TABLE solicitudes_recuperacion
    ADD COLUMN IF NOT EXISTS instrucciones_recogida VARCHAR(2000);
