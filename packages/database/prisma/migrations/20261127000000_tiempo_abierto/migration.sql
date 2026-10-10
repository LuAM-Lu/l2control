-- B4-17 · Una regla de precio para el parque (M-37).
-- Solo EXPANDE (ADR-028): dos reglas se aflojan; la versión anterior sigue funcionando con esta base.
--   · El tiempo abierto entra sin precio (se cobra al salir, con la tarifa): la estancia con el paquete «tiempo-abierto»,
--     sin límite, puede tener precio 0.
--   · Subir de paquete paga la diferencia, que puede ser 0 si el paquete mayor no cuesta más de lo ya contratado.
BEGIN;

ALTER TABLE park_session DROP CONSTRAINT park_session_precio;
ALTER TABLE park_session ADD CONSTRAINT park_session_precio CHECK (
  currency = 'USD' AND (
    (event_reservation_id IS NULL AND price_minor > 0) OR
    (event_reservation_id IS NULL AND package_id = 'tiempo-abierto' AND duration_minutes IS NULL AND price_minor = 0) OR
    (event_reservation_id IS NOT NULL AND price_minor = 0)
  ));

ALTER TABLE park_session_extension DROP CONSTRAINT park_session_extension_precio;
ALTER TABLE park_session_extension ADD CONSTRAINT park_session_extension_precio CHECK (currency = 'USD' AND price_minor >= 0);

COMMIT;
