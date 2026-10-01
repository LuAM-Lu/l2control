-- Ajustes → Impresoras · Descartar lo que ya no importa (ADR-015). Lo que falló o espera se puede
-- descartar: no se imprime, deja de avisar y no se borra; queda quién lo descartó. No rellena datos.
BEGIN;

ALTER TABLE "print_job" ADD COLUMN "discarded_by" UUID, ADD COLUMN "discarded_by_name" TEXT;

ALTER TABLE print_job DROP CONSTRAINT print_job_datos;
ALTER TABLE print_job ADD CONSTRAINT print_job_datos CHECK (
  kind IN ('RECIBO', 'CORTE', 'COMANDA', 'PRUEBA')
  AND status IN ('PENDIENTE', 'ENVIADO', 'CONFIRMADO', 'FALLIDO', 'DESCARTADO')
  AND attempts >= 0
  AND length(btrim(title)) BETWEEN 1 AND 80 AND length(btrim(created_by_name)) >= 2
  AND octet_length(payload) BETWEEN 4 AND 65536
  AND (kind <> 'RECIBO' OR sale_id IS NOT NULL)
  AND (kind <> 'CORTE' OR cut_id IS NOT NULL)
  AND ((status = 'ENVIADO') = (sent_at IS NOT NULL))
  AND ((status IN ('CONFIRMADO', 'FALLIDO', 'DESCARTADO')) = (finished_at IS NOT NULL))
  -- Quién descartó va solo en lo descartado, y siempre.
  AND ((status = 'DESCARTADO') = (discarded_by_name IS NOT NULL))
  AND (discarded_by IS NULL OR status = 'DESCARTADO')
  AND (discarded_by_name IS NULL OR length(btrim(discarded_by_name)) >= 2));

-- Lo descartado es final: de ahí no sale (no está en ninguna transición de origen).
CREATE OR REPLACE FUNCTION l2_trabajo_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.printer_id, NEW.kind, NEW.title, NEW.copy, NEW.sale_id, NEW.cut_id,
         NEW.content, NEW.payload, NEW.created_at, NEW.created_by, NEW.created_by_name, NEW.device_id)
        IS DISTINCT FROM
        (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.printer_id, OLD.kind, OLD.title, OLD.copy, OLD.sale_id, OLD.cut_id,
         OLD.content, OLD.payload, OLD.created_at, OLD.created_by, OLD.created_by_name, OLD.device_id)
     OR NOT ((OLD.status, NEW.status) IN (
       ('PENDIENTE', 'ENVIADO'), ('ENVIADO', 'CONFIRMADO'), ('ENVIADO', 'PENDIENTE'), ('ENVIADO', 'FALLIDO'), ('FALLIDO', 'PENDIENTE'),
       ('FALLIDO', 'DESCARTADO'), ('PENDIENTE', 'DESCARTADO'))) THEN
    RAISE EXCEPTION 'print_job: % no está permitido (de % a %)', TG_OP, OLD.status, COALESCE(NEW.status, '-')
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
