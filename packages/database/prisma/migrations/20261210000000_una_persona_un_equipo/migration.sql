-- B1-7 · Una persona, un equipo (M-39, X-7). Solo EXPANDE (ADR-028): un motivo más para cerrar una sesión, que la versión
-- anterior no escribe.
--   · staff_session.closed_reason admite OTRO_EQUIPO: la persona entró con su PIN en otro equipo y aquí se cerró (salvo
--     administración y la cuenta de soporte, que no tienen límite).
BEGIN;

ALTER TABLE staff_session DROP CONSTRAINT staff_session_closed_reason;
ALTER TABLE staff_session ADD CONSTRAINT staff_session_closed_reason CHECK (
  (closed_at IS NULL AND closed_reason IS NULL)
  OR (closed_at IS NOT NULL AND closed_reason IN
      ('SALIDA', 'INACTIVIDAD', 'DISPOSITIVO_REVOCADO', 'BAJA', 'CORTE_Z', 'OTRA_SESION', 'OTRO_EQUIPO')));

COMMIT;
