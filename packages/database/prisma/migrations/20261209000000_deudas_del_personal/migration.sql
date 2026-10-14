-- B3-26 · Deudas: clientes y personal en una pestaña (M-39, X-6). Solo EXPANDE (ADR-028): dos tablas nuevas que la versión
-- anterior no lee.
--   · staff_payroll_deduction  «Descontado en la quincena»: el personal paga fuera del sistema, en su quincena; la
--                              administración lo marca por persona y periodo, con lo consumido y lo adelantado de ese
--                              momento. No toca la gaveta. Nada se corrige ni se borra.
--   · staff_consumption_void   un vale anulado (de cualquier día: no movió dinero), con lo que volvió al estante o salió
--                              como merma y quién lo autorizó. Uno por vale.
BEGIN;

CREATE TABLE "staff_payroll_deduction" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "staff_name" TEXT NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "consumed_minor" BIGINT NOT NULL,
    "advanced_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL,
    "marked_by" UUID,
    "marked_by_name" TEXT NOT NULL,
    "authorized_by" UUID NOT NULL,

    CONSTRAINT "staff_payroll_deduction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_payroll_deduction_tenant_id_id_key" ON "staff_payroll_deduction"("tenant_id", "id");
CREATE UNIQUE INDEX "staff_payroll_deduction_tenant_id_operation_key_key" ON "staff_payroll_deduction"("tenant_id", "operation_key");
-- Una persona puede tener más de una marca en su quincena (lo registrado después de la primera): el servidor las hace
-- de una en una por persona.
CREATE INDEX "staff_payroll_deduction_persona_idx"
  ON "staff_payroll_deduction"("tenant_id", "branch_id", "staff_user_id", "period_from");

ALTER TABLE "staff_payroll_deduction" ADD CONSTRAINT "staff_payroll_deduction_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_payroll_deduction" ADD CONSTRAINT "staff_payroll_deduction_tenant_id_staff_user_id_fkey"
  FOREIGN KEY ("tenant_id", "staff_user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano: un periodo en orden, montos en dólares sin negativos y quién lo marcó.
ALTER TABLE staff_payroll_deduction ADD CONSTRAINT staff_payroll_deduction_datos CHECK (
  period_from <= period_to AND consumed_minor >= 0 AND advanced_minor >= 0 AND currency = 'USD'
  AND length(btrim(staff_name)) >= 2 AND length(btrim(marked_by_name)) >= 2);

SELECT l2_aislar_por_tenant('staff_payroll_deduction');
SELECT l2_solo_agregar('staff_payroll_deduction');

CREATE TABLE "staff_consumption_void" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "consumption_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "note" TEXT,
    "operation_key" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3) NOT NULL,
    "voided_by" UUID,
    "voided_by_name" TEXT NOT NULL,
    "authorized_by" UUID NOT NULL,

    CONSTRAINT "staff_consumption_void_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_consumption_void_tenant_id_id_key" ON "staff_consumption_void"("tenant_id", "id");
CREATE UNIQUE INDEX "staff_consumption_void_tenant_id_consumption_id_key" ON "staff_consumption_void"("tenant_id", "consumption_id");
CREATE UNIQUE INDEX "staff_consumption_void_tenant_id_operation_key_key" ON "staff_consumption_void"("tenant_id", "operation_key");

ALTER TABLE "staff_consumption_void" ADD CONSTRAINT "staff_consumption_void_tenant_id_consumption_id_fkey"
  FOREIGN KEY ("tenant_id", "consumption_id") REFERENCES "staff_consumption"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE staff_consumption_void ADD CONSTRAINT staff_consumption_void_datos CHECK (
  jsonb_typeof(content) = 'array' AND length(btrim(voided_by_name)) >= 2 AND (note IS NULL OR length(note) <= 120));

SELECT l2_aislar_por_tenant('staff_consumption_void');
SELECT l2_solo_agregar('staff_consumption_void');

COMMIT;
