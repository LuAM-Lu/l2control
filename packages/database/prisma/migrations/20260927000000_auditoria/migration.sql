-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "business_date" DATE,
    "actor_id" UUID,
    "device_id" UUID,
    "ip" INET,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "authorized_by" UUID,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_occurred_at_idx" ON "audit_log"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_type_entity_id_idx" ON "audit_log"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_actor_id_occurred_at_idx" ON "audit_log"("tenant_id", "actor_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE audit_log ADD CONSTRAINT audit_log_outcome CHECK (outcome IN ('HECHO', 'NEGADO'));
-- La acción tiene forma de catálogo (`dominio.verbo`), no texto libre: un asiento no se
-- puede usar para colar un mensaje.
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_forma CHECK (action ~ '^[a-z_]+\.[a-z_]+$');

SELECT l2_aislar_por_tenant('audit_log');
SELECT l2_solo_agregar('audit_log');
