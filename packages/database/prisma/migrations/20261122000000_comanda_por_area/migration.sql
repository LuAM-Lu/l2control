-- B6-10 (M-34): la comanda de cocina y la de barra. Solo expande (ADR-028): la versión anterior sigue funcionando con
-- esta base (no lee las columnas nuevas; lo que crea nace con el área por defecto de su tipo y sus comandas, sin área).

-- El área de cada producto: dónde se prepara y en qué papel sale. Nula = la de su tipo (lo preparado, cocina; lo de
-- nevera, barra; un servicio, sin papel).
ALTER TABLE product ADD COLUMN prep_area TEXT;
ALTER TABLE product ADD CONSTRAINT product_area CHECK (prep_area IS NULL OR prep_area IN ('COCINA', 'BARRA', 'SIN_PAPEL'));

-- Las impresoras por área: «comandas» (for_orders) es la de cocina; la de barra, aparte. La marca de comandas de hoy
-- vale para las dos áreas.
ALTER TABLE printer ADD COLUMN for_bar_orders BOOLEAN NOT NULL DEFAULT false;
-- El relleno va en la siguiente migración (aquí la RLS forzada no dejaba ver ninguna fila).
ALTER TABLE printer DROP CONSTRAINT printer_datos;
ALTER TABLE printer ADD CONSTRAINT printer_datos CHECK (
  width IN (58, 80) AND (for_receipts OR for_orders OR for_bar_orders)
  AND length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(created_by_name)) >= 2
  AND code_page IN ('PC850', 'PC858', 'WPC1252', 'PC437')
  AND (
    (connection = 'RED' AND agent_id IS NULL AND windows_name IS NULL AND port BETWEEN 1 AND 65535
      -- Solo IP privadas: una impresora con IP pública está expuesta a internet (ADR-015).
      AND ip ~ '^(10\.([0-9]{1,3}\.){2}[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})$')
    OR (connection = 'USB' AND agent_id IS NOT NULL AND length(btrim(windows_name)) BETWEEN 1 AND 120 AND ip = '' AND port = 0)
  ));
-- Una sola encendida por tipo, como las otras dos.
CREATE UNIQUE INDEX printer_una_de_barra ON printer (tenant_id, branch_id) WHERE active AND for_bar_orders;

-- Cada trabajo de comanda (y su papel «ANULAR») dice su área. Nula en los de antes: una sola comanda con todo.
ALTER TABLE print_job ADD COLUMN area TEXT;
ALTER TABLE print_job ADD CONSTRAINT print_job_area CHECK (area IS NULL OR (area IN ('COCINA', 'BARRA') AND kind IN ('COMANDA', 'ANULACION')));
