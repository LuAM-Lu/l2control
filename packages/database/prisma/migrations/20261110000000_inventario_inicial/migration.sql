-- B9-7 · Catálogo sin existencias y su conteo inicial (M-28).
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   stock_start  el arranque de la existencia de un producto en una sucursal: su inventario inicial, su primera
--                entrada o su primer conteo, con lo que se contó (también cero) y cuándo. Uno por producto y
--                sucursal; nada se corrige ni se borra. Un producto que se cuenta, sin esta fila y sin ningún
--                movimiento, está «Sin inventario inicial» y no se vende (ADR-023).
BEGIN;

CREATE TABLE "stock_start" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "entry_id" UUID,
    "adjustment_id" UUID,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "stock_start_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_start_tenant_id_id_key" ON "stock_start"("tenant_id", "id");
CREATE UNIQUE INDEX "stock_start_tenant_id_branch_id_product_id_key" ON "stock_start"("tenant_id", "branch_id", "product_id");

ALTER TABLE "stock_start" ADD CONSTRAINT "stock_start_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "stock_start" ADD CONSTRAINT "stock_start_tenant_id_product_id_fkey"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "product"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "stock_start" ADD CONSTRAINT "stock_start_tenant_id_entry_id_fkey"
  FOREIGN KEY ("tenant_id", "entry_id") REFERENCES "stock_entry"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "stock_start" ADD CONSTRAINT "stock_start_tenant_id_adjustment_id_fkey"
  FOREIGN KEY ("tenant_id", "adjustment_id") REFERENCES "stock_adjustment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE stock_start ADD CONSTRAINT stock_start_datos CHECK (
  quantity BETWEEN 0 AND 10000000
  -- Lo arranca una entrada o un conteo, nunca los dos ni ninguno.
  AND (entry_id IS NULL) <> (adjustment_id IS NULL)
  AND char_length(created_by_name) BETWEEN 1 AND 120
);

SELECT l2_aislar_por_tenant('stock_start');
SELECT l2_solo_agregar('stock_start');

COMMIT;
