-- B6-11 · Servido por plato (M-34, S-9; cambia en parte ADR-030).
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee. Al servirse el último plato se escribe además
-- `kitchen_order_served`, así la anterior sigue viendo el pedido servido.
--   kitchen_order_line_served  cada marca de un plato del pedido (su posición en `kitchen_order.items`): SERVIDO o, en el
--                              momento, DESHECHO. Lo que vale es la última de cada plato; nada se corrige ni se borra.
BEGIN;

CREATE TABLE "kitchen_order_line_served" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_index" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "by" UUID,
    "by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "kitchen_order_line_served_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kitchen_order_line_served_tenant_id_id_key" ON "kitchen_order_line_served"("tenant_id", "id");
CREATE INDEX "kitchen_order_line_served_tenant_id_order_id_idx" ON "kitchen_order_line_served"("tenant_id", "order_id");

ALTER TABLE "kitchen_order_line_served" ADD CONSTRAINT "kitchen_order_line_served_tenant_id_order_id_fkey"
  FOREIGN KEY ("tenant_id", "order_id") REFERENCES "kitchen_order"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE kitchen_order_line_served ADD CONSTRAINT kitchen_order_line_served_datos CHECK (
  line_index BETWEEN 0 AND 39 AND kind IN ('SERVIDO', 'DESHECHO') AND char_length(by_name) BETWEEN 1 AND 120);

SELECT l2_aislar_por_tenant('kitchen_order_line_served');
SELECT l2_solo_agregar('kitchen_order_line_served');

COMMIT;
