-- B3-30 · «Pedir anulación» (M-40). Solo EXPANDE (ADR-028): dos tablas nuevas, de solo agregar. La versión anterior no
-- las lee ni las escribe; anula como siempre, con el PIN de administración en la caja.
--   · annulment_request          la caja pide anular un cobro (su venta), con su motivo y lo que se hará con la cuenta
--                                (cobrarla de nuevo o anular la venta entera, y lo que tiene inventario).
--   · annulment_request_outcome  la respuesta de administración, una por pedido: APROBADA (con su PIN) o RECHAZADA (con
--                                su motivo). Aprobada, la caja hace la anulación sin PIN; hecha, la venta tiene su
--                                `sale_void`. La Z no se hace con un pedido sin resolver.
BEGIN;

CREATE TABLE "annulment_request" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "cobro_key" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "path" TEXT NOT NULL,
    "stock" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "requested_by" UUID,
    "requested_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "annulment_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "annulment_request_outcome" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "by_user" UUID,
    "by_name" TEXT NOT NULL,
    "reason" TEXT,
    "operation_key" UUID NOT NULL,

    CONSTRAINT "annulment_request_outcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "annulment_request_tenant_id_id_key" ON "annulment_request"("tenant_id", "id");
CREATE UNIQUE INDEX "annulment_request_tenant_id_operation_key_key" ON "annulment_request"("tenant_id", "operation_key");
CREATE INDEX "annulment_request_tenant_id_sale_id_idx" ON "annulment_request"("tenant_id", "sale_id");
CREATE INDEX "annulment_request_tenant_id_branch_id_requested_at_idx" ON "annulment_request"("tenant_id", "branch_id", "requested_at");
CREATE UNIQUE INDEX "annulment_request_outcome_tenant_id_id_key" ON "annulment_request_outcome"("tenant_id", "id");
CREATE UNIQUE INDEX "annulment_request_outcome_tenant_id_request_id_key" ON "annulment_request_outcome"("tenant_id", "request_id");
CREATE UNIQUE INDEX "annulment_request_outcome_tenant_id_operation_key_key" ON "annulment_request_outcome"("tenant_id", "operation_key");

ALTER TABLE "annulment_request" ADD CONSTRAINT "annulment_request_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "annulment_request" ADD CONSTRAINT "annulment_request_tenant_id_sale_id_fkey"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sale"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "annulment_request" ADD CONSTRAINT "annulment_request_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "annulment_request_outcome" ADD CONSTRAINT "annulment_request_outcome_tenant_id_request_id_fkey"
  FOREIGN KEY ("tenant_id", "request_id") REFERENCES "annulment_request"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE annulment_request ADD CONSTRAINT annulment_request_datos CHECK (
  reason IN ('ERROR_EN_COBRO', 'CLIENTE_DESISTIO', 'NO_ENTREGADO', 'OTRO')
  AND (reason <> 'OTRO' OR length(btrim(coalesce(note, ''))) >= 3)
  AND (note IS NULL OR char_length(note) <= 280)
  AND path IN ('COBRAR_DE_NUEVO', 'ANULAR_VENTA')
  AND stock IN ('ESTANTE', 'MERMA')
  AND length(btrim(requested_by_name)) >= 2
);
ALTER TABLE annulment_request_outcome ADD CONSTRAINT annulment_request_outcome_datos CHECK (
  kind IN ('APROBADA', 'RECHAZADA')
  AND (kind <> 'RECHAZADA' OR length(btrim(coalesce(reason, ''))) >= 3)
  AND (reason IS NULL OR char_length(reason) <= 280)
  AND length(btrim(by_name)) >= 2
);

SELECT l2_aislar_por_tenant('annulment_request');
SELECT l2_solo_agregar('annulment_request');
SELECT l2_aislar_por_tenant('annulment_request_outcome');
SELECT l2_solo_agregar('annulment_request_outcome');

COMMIT;
