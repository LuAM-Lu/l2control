-- B6-3 · Vincular pulseras a una mesa y anular un pedido en producción (F6-05, F6-14). Ninguna tabla
-- nueva: las dos entran como una versión más de la cuenta (solo-agregar, §5), así que solo hace falta
-- que el cause de la versión las reconozca.
BEGIN;

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO'));

COMMIT;
