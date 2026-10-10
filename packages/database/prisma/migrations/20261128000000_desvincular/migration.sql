-- B6-15 (M-37): desvincular una pulsera de una mesa. Expandir (ADR-028): la versión anterior no escribe esta causa, y
-- todo lo que escribía sigue valiendo.
--   · account_version.cause admite DESVINCULAR: la mesa de la que sale el niño y la cuenta que lo recibe guardan su
--     versión con esa causa.

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA', 'EMPEZAR_EVENTO', 'ANULAR_ENTRADA', 'DESVINCULAR'));
