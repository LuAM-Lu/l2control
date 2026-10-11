-- B3-21 · Mover efectivo (M-38, W-8). Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee, una
-- columna nueva en print_job y un tipo de trabajo más (el comprobante), que solo crea la versión nueva.
--   · cash_movement  el efectivo que entra o sale de la gaveta sin ser venta: la entrada (sencillo para la caja), la
--                    salida (compras para el local, pago a proveedor, adelanto al personal) y el retiro a resguardo,
--                    en dólares o en bolívares, con su nota. Del turno: suma o resta en la gaveta y va en el corte
--                    aparte de las ventas. Nada se corrige ni se borra.
--   · print_job      el comprobante de cada uno (tipo MOVIMIENTO), con su movimiento.
BEGIN;

CREATE TABLE "cash_movement" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "usd_minor" BIGINT NOT NULL,
    "rate_id" UUID,
    "rate_value" TEXT,
    "note" TEXT NOT NULL,
    "staff_user_id" UUID,
    "staff_name" TEXT,
    "received_by_name" TEXT,
    "operation_key" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by" UUID,
    "recorded_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,

    CONSTRAINT "cash_movement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_movement_tenant_id_id_key" ON "cash_movement"("tenant_id", "id");
CREATE UNIQUE INDEX "cash_movement_tenant_id_operation_key_key" ON "cash_movement"("tenant_id", "operation_key");
CREATE UNIQUE INDEX "cash_movement_tenant_id_branch_id_number_key" ON "cash_movement"("tenant_id", "branch_id", "number");
CREATE INDEX "cash_movement_tenant_id_shift_id_idx" ON "cash_movement"("tenant_id", "shift_id");
CREATE INDEX "cash_movement_tenant_id_staff_user_id_business_date_idx" ON "cash_movement"("tenant_id", "staff_user_id", "business_date");

ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_tenant_id_shift_id_fkey"
  FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_tenant_id_staff_user_id_fkey"
  FOREIGN KEY ("tenant_id", "staff_user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano: cada tipo con sus motivos; el adelanto, a nombre de una persona; el retiro, con quién lo recibe.
ALTER TABLE cash_movement ADD CONSTRAINT cash_movement_datos CHECK (
  ((kind = 'ENTRADA' AND reason = 'SENCILLO')
    OR (kind = 'SALIDA' AND reason IN ('COMPRAS', 'PROVEEDOR', 'ADELANTO'))
    OR (kind = 'RETIRO' AND reason = 'RESGUARDO'))
  AND currency IN ('USD', 'VES')
  AND amount_minor > 0 AND usd_minor > 0
  AND (currency = 'USD') = (rate_id IS NULL)
  AND (rate_id IS NULL) = (rate_value IS NULL)
  AND number > 0
  AND char_length(btrim(note)) BETWEEN 2 AND 160
  AND (reason = 'ADELANTO') = (staff_user_id IS NOT NULL)
  AND (staff_user_id IS NULL) = (staff_name IS NULL)
  AND (kind = 'RETIRO') = (received_by_name IS NOT NULL)
  AND (received_by_name IS NULL OR char_length(btrim(received_by_name)) BETWEEN 2 AND 120)
  AND char_length(btrim(recorded_by_name)) BETWEEN 2 AND 120
  AND (authorized_by IS NULL OR authorized_by_name IS NOT NULL));

SELECT l2_aislar_por_tenant('cash_movement');
SELECT l2_solo_agregar('cash_movement');

-- ── El comprobante: un trabajo de impresión de tipo MOVIMIENTO, con su movimiento ─────────────────────────────────
ALTER TABLE "print_job" ADD COLUMN "cash_movement_id" UUID;
CREATE INDEX "print_job_tenant_id_cash_movement_id_idx" ON "print_job"("tenant_id", "cash_movement_id");
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_cash_movement_id_fkey"
  FOREIGN KEY ("tenant_id", "cash_movement_id") REFERENCES "cash_movement"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE print_job DROP CONSTRAINT print_job_datos;
ALTER TABLE print_job ADD CONSTRAINT print_job_datos CHECK (
  kind IN ('RECIBO', 'CORTE', 'COMANDA', 'ANULACION', 'PRUEBA', 'MOVIMIENTO')
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

-- Lo que nombra el trabajo no cambia después de crearlo: el movimiento, tampoco.
CREATE OR REPLACE FUNCTION l2_trabajo_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.printer_id, NEW.kind, NEW.title, NEW.copy, NEW.sale_id, NEW.cut_id,
         NEW.order_id, NEW.cash_movement_id, NEW.content, NEW.payload, NEW.created_at, NEW.created_by, NEW.created_by_name, NEW.device_id)
        IS DISTINCT FROM
        (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.printer_id, OLD.kind, OLD.title, OLD.copy, OLD.sale_id, OLD.cut_id,
         OLD.order_id, OLD.cash_movement_id, OLD.content, OLD.payload, OLD.created_at, OLD.created_by, OLD.created_by_name, OLD.device_id)
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
