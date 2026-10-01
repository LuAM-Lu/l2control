-- CreateTable
CREATE TABLE "stock_movement" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "account_id" UUID,
    "account_version" INTEGER,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movement_tenant_id_branch_id_product_id_idx" ON "stock_movement"("tenant_id", "branch_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_tenant_id_id_key" ON "stock_movement"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_tenant_id_account_id_account_version_product_key" ON "stock_movement"("tenant_id", "account_id", "account_version", "product_id");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "product"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_account_id_account_version_fkey" FOREIGN KEY ("tenant_id", "account_id", "account_version") REFERENCES "account_version"("tenant_id", "account_id", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B9-2, F8-05, I-10, ADR-023): la existencia es la suma de los movimientos, y un
-- movimiento no se edita ni se borra. Sin existencia no se vende: la aplicación lo comprueba con un
-- candado por producto, y esto es la última línea.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_cantidad CHECK (quantity <> 0);
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_created_by_name CHECK (length(btrim(created_by_name)) >= 2);
-- La venta sale y la devolución entra, y las dos dicen qué versión de qué cuenta las causó. B9-3 y
-- B9-4 cambian esta restricción por la suya cuando añadan entradas y ajustes.
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_tipo CHECK (
  (kind = 'VENTA' AND quantity < 0 AND account_id IS NOT NULL AND account_version IS NOT NULL)
  OR (kind = 'DEVOLUCION' AND quantity > 0 AND account_id IS NOT NULL AND account_version IS NOT NULL)
);

-- Nunca por debajo de cero: lo que no hay no se vende (ADR-023 §3). La aplicación toma antes el
-- candado del producto, así que dos ventas a la vez no llegan aquí con la misma última unidad.
CREATE FUNCTION l2_existencia_no_negativa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  hay bigint;
BEGIN
  IF NEW.quantity < 0 THEN
    SELECT COALESCE(SUM(quantity), 0) INTO hay
      FROM stock_movement
     WHERE tenant_id = NEW.tenant_id AND branch_id = NEW.branch_id AND product_id = NEW.product_id;
    IF hay + NEW.quantity < 0 THEN
      RAISE EXCEPTION 'Sin existencia: el producto % quedaría en % (ADR-023).', NEW.product_id, hay + NEW.quantity
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movement_no_negativa BEFORE INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION l2_existencia_no_negativa();

SELECT l2_aislar_por_tenant('stock_movement');
-- I-10: un movimiento es inmutable. Un error se corrige con otro movimiento.
SELECT l2_solo_agregar('stock_movement');
