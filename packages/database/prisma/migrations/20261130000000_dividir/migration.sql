-- B3-20 (M-37): dividir por ítems. Expandir (ADR-028): la versión anterior no escribe estas causas, y todo lo que
-- escribía sigue valiendo.
--   · account_version.cause admite DIVIDIR (partir un ítem y pasar lo de cada persona a su cuenta) y UNIR (lo que no
--     se cobró vuelve a la cuenta).

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA', 'EMPEZAR_EVENTO', 'ANULAR_ENTRADA', 'DESVINCULAR', 'JUNTAR', 'DIVIDIR', 'UNIR'));
