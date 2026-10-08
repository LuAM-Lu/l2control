-- B3-11 · Deudas de clientes: quien se va sin pagar (M-33).
-- Solo EXPANDE (ADR-028): tres tablas nuevas que la versión anterior no lee. La cuenta de quien se fue pasa a
-- INCOBRABLE, un estado que ya existe: así sale de la cola y del cierre y libera la mesa también para una versión
-- anterior. Lo que queda por cobrarle vive aquí.
--   customer_debt             la deuda: el cliente (nombre, cédula y teléfono como se dieron), el monto en dólares,
--                             quién lo sentó, quién la marcó y quién lo autorizó. Una por cuenta.
--   customer_debt_collection  la cuenta del mostrador con que se cobra cuando vuelve (puede haber más de una si una se
--                             descartó); al cobrarla entera, la deuda queda cobrada.
--   customer_debt_outcome     cómo terminó: COBRADA (con la cuenta del cobro) o PERDIDA (con su motivo). Una por deuda.
BEGIN;

CREATE TABLE "customer_debt" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "guardian_id" UUID,
    "full_name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "document_key" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_key" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "seated_by" UUID,
    "seated_by_name" TEXT NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL,
    "marked_by" UUID,
    "marked_by_name" TEXT NOT NULL,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,
    "detail" TEXT,
    "operation_key" UUID NOT NULL,
    "device_id" UUID,

    CONSTRAINT "customer_debt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_debt_tenant_id_id_key" ON "customer_debt"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_debt_tenant_id_account_id_key" ON "customer_debt"("tenant_id", "account_id");
CREATE UNIQUE INDEX "customer_debt_tenant_id_operation_key_key" ON "customer_debt"("tenant_id", "operation_key");
CREATE INDEX "customer_debt_tenant_id_branch_id_marked_at_idx" ON "customer_debt"("tenant_id", "branch_id", "marked_at");
CREATE INDEX "customer_debt_tenant_id_document_key_idx" ON "customer_debt"("tenant_id", "document_key");
CREATE INDEX "customer_debt_tenant_id_phone_key_idx" ON "customer_debt"("tenant_id", "phone_key");

ALTER TABLE "customer_debt" ADD CONSTRAINT "customer_debt_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "customer_debt" ADD CONSTRAINT "customer_debt_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "customer_debt" ADD CONSTRAINT "customer_debt_tenant_id_guardian_id_fkey"
  FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "customer_debt_collection" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "customer_debt_collection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_debt_collection_tenant_id_id_key" ON "customer_debt_collection"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_debt_collection_tenant_id_account_id_key" ON "customer_debt_collection"("tenant_id", "account_id");
CREATE INDEX "customer_debt_collection_tenant_id_debt_id_idx" ON "customer_debt_collection"("tenant_id", "debt_id");

ALTER TABLE "customer_debt_collection" ADD CONSTRAINT "customer_debt_collection_tenant_id_debt_id_fkey"
  FOREIGN KEY ("tenant_id", "debt_id") REFERENCES "customer_debt"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "customer_debt_collection" ADD CONSTRAINT "customer_debt_collection_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "customer_debt_outcome" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "by_user" UUID,
    "by_name" TEXT NOT NULL,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,
    "reason" TEXT,
    "account_id" UUID,
    "operation_key" UUID NOT NULL,

    CONSTRAINT "customer_debt_outcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_debt_outcome_tenant_id_id_key" ON "customer_debt_outcome"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_debt_outcome_tenant_id_debt_id_key" ON "customer_debt_outcome"("tenant_id", "debt_id");
CREATE UNIQUE INDEX "customer_debt_outcome_tenant_id_operation_key_key" ON "customer_debt_outcome"("tenant_id", "operation_key");

ALTER TABLE "customer_debt_outcome" ADD CONSTRAINT "customer_debt_outcome_tenant_id_debt_id_fkey"
  FOREIGN KEY ("tenant_id", "debt_id") REFERENCES "customer_debt"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "customer_debt_outcome" ADD CONSTRAINT "customer_debt_outcome_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE customer_debt ADD CONSTRAINT customer_debt_datos CHECK (
  amount_minor > 0
  AND currency = 'USD'
  AND char_length(full_name) BETWEEN 2 AND 80
  AND document_key ~ '^[VEJPG][0-9]{5,10}$'
  AND phone_key ~ '^0[0-9]{10}$'
  AND char_length(seated_by_name) BETWEEN 1 AND 120
  AND char_length(marked_by_name) BETWEEN 1 AND 120
  AND (detail IS NULL OR char_length(detail) <= 200)
  AND (authorized_by IS NULL) = (authorized_by_name IS NULL)
);
ALTER TABLE customer_debt_collection ADD CONSTRAINT customer_debt_collection_datos CHECK (char_length(created_by_name) BETWEEN 1 AND 120);
ALTER TABLE customer_debt_outcome ADD CONSTRAINT customer_debt_outcome_datos CHECK (
  kind IN ('COBRADA', 'PERDIDA')
  AND (kind = 'COBRADA') = (account_id IS NOT NULL)
  AND (kind <> 'PERDIDA' OR (reason IS NOT NULL AND char_length(reason) BETWEEN 3 AND 280))
  AND char_length(by_name) BETWEEN 1 AND 120
  AND (authorized_by IS NULL) = (authorized_by_name IS NULL)
);

SELECT l2_aislar_por_tenant('customer_debt');
SELECT l2_solo_agregar('customer_debt');
SELECT l2_aislar_por_tenant('customer_debt_collection');
SELECT l2_solo_agregar('customer_debt_collection');
SELECT l2_aislar_por_tenant('customer_debt_outcome');
SELECT l2_solo_agregar('customer_debt_outcome');

COMMIT;
