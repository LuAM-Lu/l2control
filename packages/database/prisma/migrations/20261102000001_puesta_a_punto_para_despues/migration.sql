-- T-8b · La Puesta a punto con «para después» (pedido del usuario, 2026-10-07).
-- Solo EXPANDE (ADR-028): una tabla nueva; la versión anterior no la lee.
--   setup_postponement  un punto recomendable que administración dejó para después en su local
BEGIN;

-- CreateTable
CREATE TABLE "setup_postponement" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "item" TEXT NOT NULL,
    "postponed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postponed_by_name" TEXT NOT NULL,
    "resumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "setup_postponement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setup_postponement_tenant_id_id_key" ON "setup_postponement"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "setup_postponement" ADD CONSTRAINT "setup_postponement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE setup_postponement ADD CONSTRAINT setup_postponement_branch_fkey
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Los nombres de los puntos son los de la Puesta a punto (`PuntoDePuestaAPuntoSchema`): minúsculas y «_».
ALTER TABLE setup_postponement ADD CONSTRAINT setup_postponement_item CHECK (item ~ '^[a-z_]{2,40}$');
ALTER TABLE setup_postponement ADD CONSTRAINT setup_postponement_quien CHECK (length(btrim(postponed_by_name)) >= 2);
ALTER TABLE setup_postponement ADD CONSTRAINT setup_postponement_fechas CHECK (resumed_at IS NULL OR resumed_at >= postponed_at);
-- Un punto está pospuesto una vez a la vez en cada local.
CREATE UNIQUE INDEX setup_postponement_vigente ON setup_postponement (tenant_id, branch_id, item) WHERE resumed_at IS NULL;

SELECT l2_aislar_por_tenant('setup_postponement');

COMMIT;
