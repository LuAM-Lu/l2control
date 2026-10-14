-- B6-21 · Cambiar de mesa (M-39, X-16). Solo EXPANDE (ADR-028): la versión anterior no escribe esta causa ni este papel,
-- y todo lo que escribía sigue valiendo.
--   · account_version.cause admite CAMBIAR_MESA (la cuenta entera pasa a otra mesa: un mando propio, no un «guardar»).
--   · print_job.kind admite CAMBIO_MESA: el papel «CAMBIO DE MESA · 3 → 7» que sale en la cocina y en la barra con lo que
--     falta servir. Lleva su área, como la comanda y el papel «ANULAR», y no nombra un pedido (junta lo de varios).
BEGIN;

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA', 'EMPEZAR_EVENTO', 'ANULAR_ENTRADA', 'DESVINCULAR', 'JUNTAR', 'DIVIDIR', 'UNIR', 'CAMBIAR_MESA'));

ALTER TABLE print_job DROP CONSTRAINT print_job_datos;
ALTER TABLE print_job ADD CONSTRAINT print_job_datos CHECK (
  kind IN ('RECIBO', 'CORTE', 'COMANDA', 'ANULACION', 'PRUEBA', 'MOVIMIENTO', 'CAMBIO_MESA')
  AND status IN ('PENDIENTE', 'ENVIADO', 'CONFIRMADO', 'FALLIDO', 'DESCARTADO')
  AND attempts >= 0
  AND length(btrim(title)) BETWEEN 1 AND 80 AND length(btrim(created_by_name)) >= 2
  AND octet_length(payload) BETWEEN 4 AND 65536
  AND (kind <> 'RECIBO' OR sale_id IS NOT NULL)
  AND (kind <> 'CORTE' OR cut_id IS NOT NULL)
  AND ((kind = 'MOVIMIENTO') = (cash_movement_id IS NOT NULL))
  AND ((status = 'ENVIADO') = (sent_at IS NOT NULL))
  AND ((status IN ('CONFIRMADO', 'FALLIDO', 'DESCARTADO')) = (finished_at IS NOT NULL))
  AND ((status = 'DESCARTADO') = (discarded_by_name IS NOT NULL))
  AND (discarded_by IS NULL OR status = 'DESCARTADO')
  AND (discarded_by_name IS NULL OR length(btrim(discarded_by_name)) >= 2));

ALTER TABLE print_job DROP CONSTRAINT print_job_area;
ALTER TABLE print_job ADD CONSTRAINT print_job_area CHECK (area IS NULL OR (area IN ('COCINA', 'BARRA') AND kind IN ('COMANDA', 'ANULACION', 'CAMBIO_MESA')));

COMMIT;
