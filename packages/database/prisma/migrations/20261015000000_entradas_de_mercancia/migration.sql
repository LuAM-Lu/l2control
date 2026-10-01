-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN     "entry_id" UUID,
ADD COLUMN     "pack_size" INTEGER,
ADD COLUMN     "packs" INTEGER,
ADD COLUMN     "value_minor" BIGINT NOT NULL DEFAULT 0;
-- Los movimientos de antes (ventas y devoluciones de B9-2) no tenían costo: valen cero. Desde aquí
-- cada movimiento dice el suyo.
ALTER TABLE "stock_movement" ALTER COLUMN "value_minor" DROP DEFAULT;

-- CreateTable
CREATE TABLE "stock_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "supplier" TEXT,
    "invoice" TEXT,
    "operation_key" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "stock_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_entry_tenant_id_branch_id_received_at_idx" ON "stock_entry"("tenant_id", "branch_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_entry_tenant_id_id_key" ON "stock_entry"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_entry_tenant_id_operation_key_key" ON "stock_entry"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_tenant_id_entry_id_product_id_key" ON "stock_movement"("tenant_id", "entry_id", "product_id");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_entry_id_fkey" FOREIGN KEY ("tenant_id", "entry_id") REFERENCES "stock_entry"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "stock_entry" ADD CONSTRAINT "stock_entry_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B9-3, F8-06): la entrada de mercancía y el costo promedio ponderado. El valor del
-- inventario es la suma de `value_minor`; el costo promedio, valor entre unidades.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La entrada ───────────────────────────────────────────────────────────────
ALTER TABLE stock_entry ADD CONSTRAINT stock_entry_kind CHECK (kind IN ('COMPRA', 'REPOSICION'));
ALTER TABLE stock_entry ADD CONSTRAINT stock_entry_supplier CHECK (supplier IS NULL OR length(btrim(supplier)) BETWEEN 2 AND 80);
ALTER TABLE stock_entry ADD CONSTRAINT stock_entry_invoice CHECK (invoice IS NULL OR length(btrim(invoice)) BETWEEN 1 AND 40);
ALTER TABLE stock_entry ADD CONSTRAINT stock_entry_created_by_name CHECK (length(btrim(created_by_name)) >= 2);
SELECT l2_aislar_por_tenant('stock_entry');
SELECT l2_solo_agregar('stock_entry');

-- ── El movimiento, con su valor ──────────────────────────────────────────────
-- Cada tipo con lo suyo: la venta y la devolución citan su cuenta; la entrada, su entrada y cómo se
-- compró (tantos bultos de tantas unidades: comprar por caja y vender por unidad cuadra).
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_tipo;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_tipo CHECK (
  (kind = 'VENTA' AND quantity < 0 AND value_minor <= 0
     AND account_id IS NOT NULL AND account_version IS NOT NULL
     AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL)
  OR (kind = 'DEVOLUCION' AND quantity > 0 AND value_minor >= 0
     AND account_id IS NOT NULL AND account_version IS NOT NULL
     AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL)
  OR (kind = 'ENTRADA' AND quantity > 0 AND value_minor >= 0
     AND account_id IS NULL AND account_version IS NULL
     AND entry_id IS NOT NULL AND packs IS NOT NULL AND pack_size IS NOT NULL
     AND packs BETWEEN 1 AND 10000 AND pack_size BETWEEN 1 AND 1000 AND quantity = packs * pack_size)
);
-- Lo que cuesta una entrada tiene tope: hasta $ 100.000,00 por línea (por encima, se tecleó en bolívares).
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_valor CHECK (abs(value_minor) <= 10000000);
