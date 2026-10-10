-- B3-17 · El consumo del personal (M-37). Solo EXPANDE (ADR-028): un medio de pago más en cada local y una tabla nueva
-- que la versión anterior no lee.
--   · El medio «Consumo del personal» (CONSUMO_PERSONAL): en dólares, sin vuelto, sin IGTF y sin datos que conciliar.
--     No es dinero: no vive en la gaveta, y el arqueo no lo cuenta. El cobro con él lo firma con su PIN la persona del
--     equipo que consumió, y es el único pago de ese cobro.
--   · staff_consumption  el vale: de quién es la venta que se cobró así. Lo consumido y el total salen de la venta; una
--                        anulación o una devolución viven en ella. Nada se corrige ni se borra.
BEGIN;

-- El medio, en cada local que ya exista (los nuevos nacen con él: `DEFAULT_LEDGER_METHODS`). `tenant` tiene la RLS
-- forzada, y payment_method también: el dueño la suspende solo mientras escribe, como en 20261004000000_medios_de_pago.
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_method NO FORCE ROW LEVEL SECURITY;
INSERT INTO payment_method (id, tenant_id, code, label, currency, gives_change, triggers_igtf, data_kind, active, position, created_by_name)
SELECT gen_random_uuid(), t.id, 'CONSUMO_PERSONAL', 'Consumo del personal', 'USD', false, false, NULL, true,
       COALESCE((SELECT max(position) + 1 FROM payment_method p WHERE p.tenant_id = t.id), 0), 'Migración B3-17'
  FROM tenant t
 WHERE NOT EXISTS (SELECT 1 FROM payment_method p WHERE p.tenant_id = t.id AND p.code = 'CONSUMO_PERSONAL');
ALTER TABLE payment_method FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

CREATE TABLE "staff_consumption" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "staff_name" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "staff_consumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_consumption_tenant_id_id_key" ON "staff_consumption"("tenant_id", "id");
CREATE UNIQUE INDEX "staff_consumption_tenant_id_sale_id_key" ON "staff_consumption"("tenant_id", "sale_id");
CREATE INDEX "staff_consumption_tenant_id_branch_id_business_date_idx" ON "staff_consumption"("tenant_id", "branch_id", "business_date");
CREATE INDEX "staff_consumption_tenant_id_staff_user_id_business_date_idx" ON "staff_consumption"("tenant_id", "staff_user_id", "business_date");

ALTER TABLE "staff_consumption" ADD CONSTRAINT "staff_consumption_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_consumption" ADD CONSTRAINT "staff_consumption_tenant_id_sale_id_fkey"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sale"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_consumption" ADD CONSTRAINT "staff_consumption_tenant_id_staff_user_id_fkey"
  FOREIGN KEY ("tenant_id", "staff_user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE staff_consumption ADD CONSTRAINT staff_consumption_datos CHECK (
  total_minor > 0 AND currency = 'USD'
  AND char_length(btrim(staff_name)) BETWEEN 2 AND 120 AND char_length(btrim(created_by_name)) BETWEEN 2 AND 120);

SELECT l2_aislar_por_tenant('staff_consumption');
SELECT l2_solo_agregar('staff_consumption');

COMMIT;
