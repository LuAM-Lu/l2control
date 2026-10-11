-- B5-6 (M-38, W-1): la impresora de respaldo y el estado de cada impresora. Solo expande (ADR-028): la versión anterior
-- no lee las columnas nuevas (un respaldo le parece una impresora sin áreas, que no recibe trabajos) y lo que crea nace
-- sin respaldo, sin estado y por su camino de siempre. Entre BEGIN y COMMIT: Prisma no la envuelve (MAESTRO §5).

BEGIN;

-- AlterTable
ALTER TABLE "print_job" ADD COLUMN     "via_backup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "printer" ADD COLUMN     "backup_of" UUID,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "status_at" TIMESTAMPTZ(3),
ADD COLUMN     "status_detail" TEXT;

-- CreateIndex
CREATE INDEX "printer_tenant_id_branch_id_backup_of_idx" ON "printer"("tenant_id", "branch_id", "backup_of");

-- AddForeignKey
ALTER TABLE "printer" ADD CONSTRAINT "printer_tenant_id_branch_id_backup_of_fkey" FOREIGN KEY ("tenant_id", "branch_id", "backup_of") REFERENCES "printer"("tenant_id", "branch_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B5-6).
-- ═══════════════════════════════════════════════════════════════════════════

-- Un respaldo no es de sí mismo y no tiene áreas propias: lo que imprime es lo de su principal.
ALTER TABLE printer ADD CONSTRAINT printer_respaldo CHECK (
  backup_of IS NULL OR (backup_of <> id AND NOT for_receipts AND NOT for_orders AND NOT for_bar_orders));

-- Un respaldo por principal, mientras no se retire.
CREATE UNIQUE INDEX printer_un_respaldo ON printer (tenant_id, backup_of) WHERE backup_of IS NOT NULL AND retired_at IS NULL;

-- Lo que dijo su agente: uno de los cuatro estados, con su hora, o nada todavía.
ALTER TABLE printer ADD CONSTRAINT printer_estado CHECK (
  (status IS NULL) = (status_at IS NULL)
  AND (status IS NULL OR status IN ('LISTA', 'POCO_PAPEL', 'SIN_PAPEL', 'NO_RESPONDE'))
  AND (status_detail IS NULL OR length(status_detail) <= 200));

-- Una impresora imprime al menos un área, salvo el respaldo, que imprime las de su principal.
ALTER TABLE printer DROP CONSTRAINT printer_datos;
ALTER TABLE printer ADD CONSTRAINT printer_datos CHECK (
  width IN (58, 80) AND (for_receipts OR for_orders OR for_bar_orders OR backup_of IS NOT NULL)
  AND length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(created_by_name)) >= 2
  AND code_page IN ('PC850', 'PC858', 'WPC1252', 'PC437')
  AND (
    (connection = 'RED' AND agent_id IS NULL AND windows_name IS NULL AND port BETWEEN 1 AND 65535
      -- Solo IP privadas: una impresora con IP pública está expuesta a internet (ADR-015).
      AND ip ~ '^(10\.([0-9]{1,3}\.){2}[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})$')
    OR (connection = 'USB' AND agent_id IS NOT NULL AND length(btrim(windows_name)) BETWEEN 1 AND 120 AND ip = '' AND port = 0)
  ));

COMMIT;
