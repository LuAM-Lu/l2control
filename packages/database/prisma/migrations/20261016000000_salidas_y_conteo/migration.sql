-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN     "adjustment_id" UUID;

-- CreateTable
CREATE TABLE "stock_adjustment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "content" JSONB NOT NULL,
    "operation_key" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "authorized_by" UUID NOT NULL,
    "authorized_by_name" TEXT NOT NULL,

    CONSTRAINT "stock_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_adjustment_tenant_id_branch_id_at_idx" ON "stock_adjustment"("tenant_id", "branch_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_tenant_id_id_key" ON "stock_adjustment"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_tenant_id_operation_key_key" ON "stock_adjustment"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_tenant_id_adjustment_id_product_id_key" ON "stock_movement"("tenant_id", "adjustment_id", "product_id");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_adjustment_id_fkey" FOREIGN KEY ("tenant_id", "adjustment_id") REFERENCES "stock_adjustment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B9-4, F8-07): salidas con motivo de lista cerrada y conteo físico, los dos con la
-- 🔐 de quien autoriza. Ningún ajuste sin motivo ni asiento.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La salida o el conteo ────────────────────────────────────────────────────
ALTER TABLE stock_adjustment ADD CONSTRAINT stock_adjustment_tipo CHECK (
  (kind = 'SALIDA' AND reason IS NOT NULL AND reason IN ('MERMA', 'CONSUMO_INTERNO', 'REGALO', 'DEVOLUCION_PROVEEDOR'))
  OR (kind = 'CONTEO' AND reason IS NULL)
);
ALTER TABLE stock_adjustment ADD CONSTRAINT stock_adjustment_note CHECK (note IS NULL OR length(btrim(note)) BETWEEN 3 AND 280);
ALTER TABLE stock_adjustment ADD CONSTRAINT stock_adjustment_content CHECK (jsonb_typeof(content) = 'array' AND jsonb_array_length(content) >= 1);
ALTER TABLE stock_adjustment ADD CONSTRAINT stock_adjustment_created_by_name CHECK (length(btrim(created_by_name)) >= 2);
ALTER TABLE stock_adjustment ADD CONSTRAINT stock_adjustment_authorized_by_name CHECK (length(btrim(authorized_by_name)) >= 2);
SELECT l2_aislar_por_tenant('stock_adjustment');
SELECT l2_solo_agregar('stock_adjustment');

-- ── El movimiento: cada tipo cita lo suyo ────────────────────────────────────
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_tipo;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_tipo CHECK (
  (kind = 'VENTA' AND quantity < 0 AND value_minor <= 0
     AND account_id IS NOT NULL AND account_version IS NOT NULL
     AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL AND adjustment_id IS NULL)
  OR (kind = 'DEVOLUCION' AND quantity > 0 AND value_minor >= 0
     AND account_id IS NOT NULL AND account_version IS NOT NULL
     AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL AND adjustment_id IS NULL)
  OR (kind = 'ENTRADA' AND quantity > 0 AND value_minor >= 0
     AND account_id IS NULL AND account_version IS NULL AND adjustment_id IS NULL
     AND entry_id IS NOT NULL AND packs IS NOT NULL AND pack_size IS NOT NULL
     AND packs BETWEEN 1 AND 10000 AND pack_size BETWEEN 1 AND 1000 AND quantity = packs * pack_size)
  -- La salida solo saca; el ajuste de un conteo saca o mete, y su valor va con su signo.
  OR (kind = 'SALIDA' AND quantity < 0 AND value_minor <= 0
     AND adjustment_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL)
  OR (kind = 'AJUSTE' AND ((quantity > 0 AND value_minor >= 0) OR (quantity < 0 AND value_minor <= 0))
     AND adjustment_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL)
);
