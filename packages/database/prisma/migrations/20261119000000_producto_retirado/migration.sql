-- B9-11 · Retirar un producto del catálogo, y devolverlo (M-34, S-2).
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee. Al retirar, el producto queda además apartado
-- (`product.active = false`): una versión anterior lo ve fuera de la venta, que es lo que tiene que ver.
--   product_retirement  cada retiro y cada vuelta al catálogo, con su motivo, quién y quién autorizó. Solo agregar: el
--                       estado de un producto es su última fila. Si al retirarlo tenía existencia, la salida que la sacó
--                       (`adjustment_id`) queda citada.
BEGIN;

CREATE TABLE "product_retirement" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustment_id" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,

    CONSTRAINT "product_retirement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_retirement_tenant_id_product_id_at_idx" ON "product_retirement"("tenant_id", "product_id", "at");

ALTER TABLE "product_retirement" ADD CONSTRAINT "product_retirement_tenant_id_product_id_fkey"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "product"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE product_retirement ADD CONSTRAINT product_retirement_datos CHECK (
  kind IN ('RETIRO', 'VUELTA')
  AND char_length(btrim(reason)) BETWEEN 3 AND 200
  AND char_length(btrim(created_by_name)) >= 2
  AND (adjustment_id IS NULL OR kind = 'RETIRO')
);

SELECT l2_aislar_por_tenant('product_retirement');
SELECT l2_solo_agregar('product_retirement');

COMMIT;
