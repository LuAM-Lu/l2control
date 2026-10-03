-- B6-5 · Mesa sin consumo (M-18): una mesa que no tiene nada que cobrar se libera y su cuenta se cierra
-- «sin consumo». Ninguna tabla nueva: es una versión más de la cuenta (solo-agregar, §5) con su estado y
-- su causa propios.
BEGIN;

ALTER TABLE account_version DROP CONSTRAINT account_version_status;
ALTER TABLE account_version ADD CONSTRAINT account_version_status CHECK (
  status IN ('ABIERTA', 'POR_COBRAR', 'COBRADA', 'INCOBRABLE', 'SIN_CONSUMO'));

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR'));

COMMIT;
