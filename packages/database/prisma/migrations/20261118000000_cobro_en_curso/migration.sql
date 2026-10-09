-- B3-13 · El cobro en curso no se pierde (M-34, S-6).
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   charge_draft  lo que la caja lleva escrito de un cobro y todavía no cobró (los pagos con sus datos, la tasa
--                 congelada, el vuelto, «Factura a» y el recibo), cifrado como los datos de los pagos (B3-2). No es
--                 un pago ni un asiento: se reescribe mientras se teclea, con su versión para que dos cajas no se
--                 pisen, y se borra al cobrar. Uno por cuenta.
BEGIN;

CREATE TABLE "charge_draft" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content_cipher" TEXT NOT NULL,
    "updated_by" UUID,
    "updated_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charge_draft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "charge_draft_tenant_id_account_id_key" ON "charge_draft"("tenant_id", "account_id");
CREATE INDEX "charge_draft_tenant_id_branch_id_idx" ON "charge_draft"("tenant_id", "branch_id");

ALTER TABLE "charge_draft" ADD CONSTRAINT "charge_draft_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "charge_draft" ADD CONSTRAINT "charge_draft_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Lo que se guarda va cifrado y con quién lo escribió; la versión crece desde 1.
ALTER TABLE charge_draft ADD CONSTRAINT charge_draft_datos CHECK (
  version >= 1 AND char_length(content_cipher) BETWEEN 1 AND 20000 AND char_length(updated_by_name) BETWEEN 1 AND 120
);

-- Mutable a propósito (se reescribe y se borra), pero cada local solo ve los suyos.
SELECT l2_aislar_por_tenant('charge_draft');

COMMIT;
