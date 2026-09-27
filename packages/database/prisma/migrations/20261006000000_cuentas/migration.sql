-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "opened_by" UUID,
    "opened_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "cause" TEXT NOT NULL,
    "operation_key" UUID,
    "saved_at" TIMESTAMPTZ(3) NOT NULL,
    "saved_by" UUID,
    "saved_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "account_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_tenant_id_id_key" ON "account"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "account_tenant_id_branch_id_order_number_key" ON "account"("tenant_id", "branch_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "account_version_tenant_id_id_key" ON "account_version"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "account_version_tenant_id_account_id_version_key" ON "account_version"("tenant_id", "account_id", "version");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "account_version" ADD CONSTRAINT "account_version_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-3, DEC-21, F4-03): las cuentas salen del navegador. La cuenta y sus versiones
-- son de solo-agregar; el libro de pagos cita la cuenta que cobra.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La cuenta ────────────────────────────────────────────────────────────────
-- Las columnas no admiten nulos: el IN no tiene nulo que colar.
ALTER TABLE account ADD CONSTRAINT account_kind CHECK (kind IN ('FAMILIA', 'MESA', 'MOSTRADOR'));
ALTER TABLE account ADD CONSTRAINT account_order_number CHECK (order_number > 0);
ALTER TABLE account ADD CONSTRAINT account_opened_by_name CHECK (length(btrim(opened_by_name)) >= 2);

SELECT l2_aislar_por_tenant('account');
SELECT l2_solo_agregar('account');

-- ── Sus versiones ────────────────────────────────────────────────────────────
ALTER TABLE account_version ADD CONSTRAINT account_version_version CHECK (version > 0);
ALTER TABLE account_version ADD CONSTRAINT account_version_status CHECK (status IN ('ABIERTA', 'POR_COBRAR', 'COBRADA'));
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (cause IN ('GUARDAR', 'COBRO', 'ANULACION'));
-- Un cobro o una anulación dicen con qué operación del libro van; un «guardar», con ninguna.
ALTER TABLE account_version ADD CONSTRAINT account_version_operacion CHECK (
  (cause = 'GUARDAR' AND operation_key IS NULL) OR (cause <> 'GUARDAR' AND operation_key IS NOT NULL));
-- El estado de la columna es el de la cuenta guardada, y la cuenta es la de su fila: la cola se lee
-- de la columna y no puede decir otra cosa que el JSON.
ALTER TABLE account_version ADD CONSTRAINT account_version_contenido CHECK (
  jsonb_typeof(content) = 'object' AND content->>'status' = status AND content->>'id' = account_id::text);
ALTER TABLE account_version ADD CONSTRAINT account_version_saved_by_name CHECK (length(btrim(saved_by_name)) >= 2);
-- Una operación del libro cambia la cuenta una vez: un reintento no la marca pagada dos veces.
CREATE UNIQUE INDEX account_version_una_por_operacion ON account_version (tenant_id, operation_key) WHERE operation_key IS NOT NULL;

SELECT l2_aislar_por_tenant('account_version');
SELECT l2_solo_agregar('account_version');
