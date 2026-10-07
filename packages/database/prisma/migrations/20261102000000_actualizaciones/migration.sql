-- T-8b · Actualizaciones desde el panel (ADR-028, M-25).
-- Solo EXPANDE (ADR-028): dos tablas nuevas; la versión anterior sigue funcionando con esta base.
--   system_release  las versiones publicadas que el actualizador del servidor vio, con sus imágenes listas
--   system_update   las actualizaciones pedidas (administración, o sola en staging) y cómo terminaron
-- La web pide (una fila PEDIDA); el actualizador del VPS la pone cuando toca y escribe el resultado.
BEGIN;

-- CreateTable
CREATE TABLE "system_release" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_update" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "from_version" TEXT,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" UUID,
    "requested_by_name" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "detail" TEXT,
    "cancelled_by_name" TEXT,

    CONSTRAINT "system_update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_release_tenant_id_version_key" ON "system_release"("tenant_id", "version");

-- CreateIndex
CREATE INDEX "system_update_tenant_id_requested_at_idx" ON "system_update"("tenant_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_update_tenant_id_id_key" ON "system_update"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "system_release" ADD CONSTRAINT "system_release_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "system_update" ADD CONSTRAINT "system_update_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- Una versión es X.Y.Z, sin la «v».
ALTER TABLE system_release ADD CONSTRAINT system_release_version CHECK (version ~ '^[0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6}$');
ALTER TABLE system_update ADD CONSTRAINT system_update_version CHECK (version ~ '^[0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6}$');

ALTER TABLE system_update ADD CONSTRAINT system_update_modo CHECK (mode IN ('AHORA', 'AL_CIERRE', 'AUTOMATICA'));
ALTER TABLE system_update ADD CONSTRAINT system_update_estado CHECK (state IN ('PEDIDA', 'EN_CURSO', 'HECHA', 'VUELTA_ATRAS', 'FALLIDA', 'CANCELADA'));
-- La pide una persona, salvo la automática de staging.
ALTER TABLE system_update ADD CONSTRAINT system_update_quien CHECK (
  (mode = 'AUTOMATICA') = (requested_by_name IS NULL)
  AND (requested_by_name IS NULL OR length(btrim(requested_by_name)) >= 2));
-- Terminada tiene su hora; pedida o en curso, no. Cancelada consta quién.
ALTER TABLE system_update ADD CONSTRAINT system_update_fin CHECK (
  (state IN ('PEDIDA', 'EN_CURSO')) = (finished_at IS NULL)
  AND (state = 'CANCELADA') = (cancelled_by_name IS NOT NULL)
  AND (state <> 'EN_CURSO' OR started_at IS NOT NULL));
-- Una a la vez: la pedida o en curso.
CREATE UNIQUE INDEX system_update_activa ON system_update (tenant_id) WHERE state IN ('PEDIDA', 'EN_CURSO');

SELECT l2_aislar_por_tenant('system_release');
SELECT l2_aislar_por_tenant('system_update');

COMMIT;
