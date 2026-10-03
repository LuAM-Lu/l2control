-- B6-6 · Anular en cocina, con papel e inventario (M-18, F6-14). Al anular platos ya enviados sale un papel
-- «ANULAR» en la impresora de comandas: un trabajo de impresión más, que nombra su pedido como la comanda.
-- La existencia no cambia de forma: lo no preparado vuelve con una DEVOLUCION y lo preparado sale con una
-- SALIDA por MERMA, que ya existen (B9-2, B9-4).
BEGIN;

ALTER TABLE print_job DROP CONSTRAINT print_job_datos;
ALTER TABLE print_job ADD CONSTRAINT print_job_datos CHECK (
  kind IN ('RECIBO', 'CORTE', 'COMANDA', 'ANULACION', 'PRUEBA')
  AND status IN ('PENDIENTE', 'ENVIADO', 'CONFIRMADO', 'FALLIDO', 'DESCARTADO')
  AND attempts >= 0
  AND length(btrim(title)) BETWEEN 1 AND 80 AND length(btrim(created_by_name)) >= 2
  AND octet_length(payload) BETWEEN 4 AND 65536
  AND (kind <> 'RECIBO' OR sale_id IS NOT NULL)
  AND (kind <> 'CORTE' OR cut_id IS NOT NULL)
  AND ((status = 'ENVIADO') = (sent_at IS NOT NULL))
  AND ((status IN ('CONFIRMADO', 'FALLIDO', 'DESCARTADO')) = (finished_at IS NOT NULL))
  AND ((status = 'DESCARTADO') = (discarded_by_name IS NOT NULL))
  AND (discarded_by IS NULL OR status = 'DESCARTADO')
  AND (discarded_by_name IS NULL OR length(btrim(discarded_by_name)) >= 2));

-- La comanda y el papel de anulación nombran su pedido; lo demás, no. NOT VALID por la misma razón que en
-- 20261023000000_pedidos: las comandas de antes de B6-2 en bases de desarrollo.
ALTER TABLE print_job DROP CONSTRAINT print_job_comanda_con_pedido;
ALTER TABLE print_job ADD CONSTRAINT print_job_comanda_con_pedido
  CHECK ((kind IN ('COMANDA', 'ANULACION')) = (order_id IS NOT NULL)) NOT VALID;

COMMIT;
