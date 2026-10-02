-- B6-2 · Los pedidos del mesero y su comanda impresa (ADR-022, F6-06, F6-09). Una tabla nueva (el pedido,
-- solo-agregar) y el pedido de cada comanda en la cola de impresión. No rellena datos: ninguna comanda se
-- encoló antes de este paso. Va entera en una transacción (§5).
BEGIN;

-- AlterTable
ALTER TABLE "print_job" ADD COLUMN     "order_id" UUID;

-- CreateTable
CREATE TABLE "kitchen_order" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "table_id" TEXT NOT NULL,
    "table_label" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "kitchen_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_order_tenant_id_branch_id_created_at_idx" ON "kitchen_order"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "kitchen_order_tenant_id_account_id_idx" ON "kitchen_order"("tenant_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_order_tenant_id_id_key" ON "kitchen_order"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_order_tenant_id_branch_id_number_key" ON "kitchen_order"("tenant_id", "branch_id", "number");

-- CreateIndex
CREATE INDEX "print_job_tenant_id_order_id_idx" ON "print_job"("tenant_id", "order_id");

-- AddForeignKey
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "kitchen_order"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "kitchen_order" ADD CONSTRAINT "kitchen_order_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "kitchen_order" ADD CONSTRAINT "kitchen_order_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El pedido ────────────────────────────────────────────────────────────────
ALTER TABLE kitchen_order ADD CONSTRAINT kitchen_order_datos CHECK (
  number > 0
  AND length(btrim(table_id)) BETWEEN 1 AND 64
  AND length(btrim(table_label)) BETWEEN 1 AND 20
  AND length(btrim(created_by_name)) >= 2
  -- Un pedido sin platos no se envía (el contrato valida cada línea).
  AND jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 40);

SELECT l2_aislar_por_tenant('kitchen_order');
SELECT l2_solo_agregar('kitchen_order');

-- ── La comanda lleva su pedido ───────────────────────────────────────────────
-- Una comanda imprime un pedido, y solo una comanda lo nombra. NOT VALID: rige para todo lo que se
-- escribe desde ahora; las comandas de prueba de antes de B6-2 (solo en bases de desarrollo) no tienen.
ALTER TABLE print_job ADD CONSTRAINT print_job_comanda_con_pedido
  CHECK ((kind = 'COMANDA') = (order_id IS NOT NULL)) NOT VALID;

-- El pedido de un trabajo tampoco cambia.
CREATE OR REPLACE FUNCTION l2_trabajo_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.printer_id, NEW.kind, NEW.title, NEW.copy, NEW.sale_id, NEW.cut_id,
         NEW.order_id, NEW.content, NEW.payload, NEW.created_at, NEW.created_by, NEW.created_by_name, NEW.device_id)
        IS DISTINCT FROM
        (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.printer_id, OLD.kind, OLD.title, OLD.copy, OLD.sale_id, OLD.cut_id,
         OLD.order_id, OLD.content, OLD.payload, OLD.created_at, OLD.created_by, OLD.created_by_name, OLD.device_id)
     OR NOT ((OLD.status, NEW.status) IN (
       ('PENDIENTE', 'ENVIADO'), ('ENVIADO', 'CONFIRMADO'), ('ENVIADO', 'PENDIENTE'), ('ENVIADO', 'FALLIDO'), ('FALLIDO', 'PENDIENTE'),
       ('FALLIDO', 'DESCARTADO'), ('PENDIENTE', 'DESCARTADO'))) THEN
    RAISE EXCEPTION 'print_job: % no está permitido (de % a %)', TG_OP, OLD.status, COALESCE(NEW.status, '-')
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

-- ── La versión de la cuenta que deja un pedido ──────────────────────────────
ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO'));

COMMIT;
