-- B7-8 · Respaldar ahora (M-35, R-4).
-- Solo EXPANDE (ADR-028): una tabla nueva; la versión anterior sigue funcionando con esta base.
--   backup_request  los respaldos pedidos desde el panel y cómo terminaron
-- La web pide (una fila PEDIDO, de administración con la identidad confirmada); el actualizador del VPS, que corre
-- cada minuto, la toma, hace el respaldo con respaldar.sh y escribe el resultado con el respaldo que salió.
BEGIN;

-- CreateTable
CREATE TABLE "backup_request" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" UUID,
    "requested_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "copy_id" UUID,
    "detail" TEXT,

    CONSTRAINT "backup_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_request_tenant_id_requested_at_idx" ON "backup_request"("tenant_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "backup_request_tenant_id_id_key" ON "backup_request"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "backup_request" ADD CONSTRAINT "backup_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "backup_request" ADD CONSTRAINT "backup_request_tenant_id_copy_id_fkey" FOREIGN KEY ("tenant_id", "copy_id") REFERENCES "backup_copy"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE backup_request ADD CONSTRAINT backup_request_estado CHECK (state IN ('PEDIDO', 'EN_CURSO', 'HECHO', 'FALLIDO'));
ALTER TABLE backup_request ADD CONSTRAINT backup_request_quien CHECK (length(btrim(requested_by_name)) >= 2);
-- Terminado tiene su hora; pedido o en curso, no. En curso, desde cuándo. Hecho, con su respaldo; fallido, con su motivo.
ALTER TABLE backup_request ADD CONSTRAINT backup_request_fin CHECK (
  (state IN ('PEDIDO', 'EN_CURSO')) = (finished_at IS NULL)
  AND (state = 'PEDIDO' OR started_at IS NOT NULL)
  AND (state <> 'HECHO' OR copy_id IS NOT NULL)
  AND (state <> 'FALLIDO' OR length(btrim(detail)) > 0));
-- Uno a la vez: el pedido o en curso.
CREATE UNIQUE INDEX backup_request_activo ON backup_request (tenant_id) WHERE state IN ('PEDIDO', 'EN_CURSO');

SELECT l2_aislar_por_tenant('backup_request');

-- La web solo pide: el resultado lo escribe el servidor (como superusuario, desde el actualizador).
REVOKE UPDATE, DELETE ON backup_request FROM l2_app;

COMMIT;
