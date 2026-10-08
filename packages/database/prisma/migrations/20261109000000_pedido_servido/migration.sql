-- B6-8 · Tiempo de atención en el salón (M-27, P-19, D-SERV).
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   kitchen_order_served  el mesero marcó el pedido servido en la mesa: ahí termina su espera. Uno por pedido; nada
--                         se corrige ni se borra.
BEGIN;

CREATE TABLE "kitchen_order_served" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "served_at" TIMESTAMPTZ(3) NOT NULL,
    "served_by" UUID,
    "served_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "kitchen_order_served_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kitchen_order_served_tenant_id_id_key" ON "kitchen_order_served"("tenant_id", "id");
CREATE UNIQUE INDEX "kitchen_order_served_tenant_id_order_id_key" ON "kitchen_order_served"("tenant_id", "order_id");

ALTER TABLE "kitchen_order_served" ADD CONSTRAINT "kitchen_order_served_tenant_id_order_id_fkey"
  FOREIGN KEY ("tenant_id", "order_id") REFERENCES "kitchen_order"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE kitchen_order_served ADD CONSTRAINT kitchen_order_served_datos CHECK (char_length(served_name) BETWEEN 1 AND 120);

SELECT l2_aislar_por_tenant('kitchen_order_served');
SELECT l2_solo_agregar('kitchen_order_served');

COMMIT;
