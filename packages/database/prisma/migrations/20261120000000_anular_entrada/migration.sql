-- B9-12 · Corregir una entrada mal cargada: anularla con su asiento de reverso (M-34, S-4).
-- Solo EXPANDE (ADR-028): la versión anterior sigue funcionando con esta base.
--   stock_entry_void   la anulación de una entrada (compra, reposición o inventario inicial), con su motivo, quién y
--                      quién autorizó. Solo agregar; una por entrada.
--   stock_movement     una columna nueva (`entry_void_id`) y un tipo nuevo, ANULACION: cada línea de la entrada sale a su
--                      costo de esa entrada. La existencia y el costo promedio son la suma de los movimientos: se
--                      recalculan solos. La versión anterior suma ANULACION como cualquier otro movimiento.
--   stock_start        deja de ser uno por producto (un inventario inicial anulado se vuelve a contar): el arranque que
--                      cuenta es el de una entrada no anulada. La versión anterior mira si ya hay arranque antes de
--                      escribir uno, así que no duplica.
BEGIN;

CREATE TABLE "stock_entry_void" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,

    CONSTRAINT "stock_entry_void_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_entry_void_tenant_id_id_key" ON "stock_entry_void"("tenant_id", "id");
CREATE UNIQUE INDEX "stock_entry_void_tenant_id_entry_id_key" ON "stock_entry_void"("tenant_id", "entry_id");
CREATE INDEX "stock_entry_void_tenant_id_branch_id_at_idx" ON "stock_entry_void"("tenant_id", "branch_id", "at");

ALTER TABLE "stock_entry_void" ADD CONSTRAINT "stock_entry_void_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "stock_entry_void" ADD CONSTRAINT "stock_entry_void_tenant_id_entry_id_fkey"
  FOREIGN KEY ("tenant_id", "entry_id") REFERENCES "stock_entry"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE stock_entry_void ADD CONSTRAINT stock_entry_void_datos CHECK (
  char_length(btrim(reason)) BETWEEN 3 AND 200 AND char_length(btrim(created_by_name)) >= 2
);

SELECT l2_aislar_por_tenant('stock_entry_void');
SELECT l2_solo_agregar('stock_entry_void');

-- El reverso de cada línea: sale lo que entró, a su costo de esa entrada.
ALTER TABLE "stock_movement" ADD COLUMN "entry_void_id" UUID;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_entry_void_id_fkey"
  FOREIGN KEY ("tenant_id", "entry_void_id") REFERENCES "stock_entry_void"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "stock_movement_tenant_id_entry_void_id_product_id_key" ON "stock_movement"("tenant_id", "entry_void_id", "product_id");

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
  -- B9-12: la anulación de una entrada saca lo que entró, a su costo.
  OR (kind = 'ANULACION' AND quantity < 0 AND value_minor <= 0
     AND entry_void_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL
     AND adjustment_id IS NULL)
);

-- Un producto puede volver a arrancar si su inventario inicial se anuló.
DROP INDEX "stock_start_tenant_id_branch_id_product_id_key";
CREATE INDEX "stock_start_tenant_id_branch_id_product_id_idx" ON "stock_start"("tenant_id", "branch_id", "product_id");

COMMIT;
