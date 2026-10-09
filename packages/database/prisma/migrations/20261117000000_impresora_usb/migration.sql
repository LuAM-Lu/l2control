-- B5-4 (M-34): la impresora por red o por USB, con su página de códigos y la impresión oscura. Solo expande (ADR-028):
-- las columnas nuevas tienen el valor de antes de fábrica (red, página 850, sin oscura) y la versión anterior las
-- ignora. Por USB, la IP queda vacía y el puerto en 0: la versión anterior la lee sin romperse, aunque no la sabría
-- imprimir (el agente de antes nunca recibe un trabajo por USB: no contó sus impresoras de Windows).

-- AlterTable
ALTER TABLE "print_agent" ADD COLUMN     "windows_printers" JSONB,
ADD COLUMN     "windows_printers_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "printer" ADD COLUMN     "agent_id" UUID,
ADD COLUMN     "code_page" TEXT NOT NULL DEFAULT 'PC850',
ADD COLUMN     "connection" TEXT NOT NULL DEFAULT 'RED',
ADD COLUMN     "dark" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "windows_name" TEXT;

-- CreateIndex
CREATE INDEX "printer_tenant_id_agent_id_idx" ON "printer"("tenant_id", "agent_id");

-- AddForeignKey
ALTER TABLE "printer" ADD CONSTRAINT "printer_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "print_agent"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B5-4).
-- ═══════════════════════════════════════════════════════════════════════════

-- Lo de la red (IP privada y puerto) vale para las de red; una por USB lleva su agente y su nombre en Windows.
ALTER TABLE printer DROP CONSTRAINT printer_datos;
ALTER TABLE printer ADD CONSTRAINT printer_datos CHECK (
  width IN (58, 80) AND (for_receipts OR for_orders)
  AND length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(created_by_name)) >= 2
  AND code_page IN ('PC850', 'PC858', 'WPC1252', 'PC437')
  AND (
    (connection = 'RED' AND agent_id IS NULL AND windows_name IS NULL AND port BETWEEN 1 AND 65535
      -- Solo IP privadas: una impresora con IP pública está expuesta a internet (ADR-015).
      AND ip ~ '^(10\.([0-9]{1,3}\.){2}[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})$')
    OR (connection = 'USB' AND agent_id IS NOT NULL AND length(btrim(windows_name)) BETWEEN 1 AND 120 AND ip = '' AND port = 0)
  ));

-- La VLAN de hardware y la IP fija son garantías de la red; una por USB solo la alcanza su equipo.
ALTER TABLE printer DROP CONSTRAINT printer_garantias;
ALTER TABLE printer ADD CONSTRAINT printer_garantias CHECK (NOT active OR connection = 'USB' OR (in_hardware_lan AND fixed_ip));

-- Dos nombres para el mismo aparato: por red, la misma dirección; por USB, el mismo equipo y nombre en Windows.
DROP INDEX printer_una_por_direccion;
CREATE UNIQUE INDEX printer_una_por_direccion ON printer (tenant_id, branch_id, ip, port) WHERE retired_at IS NULL AND connection = 'RED';
CREATE UNIQUE INDEX printer_una_por_nombre_en_windows ON printer (tenant_id, agent_id, windows_name) WHERE retired_at IS NULL AND connection = 'USB';

-- Lo que el agente cuenta de sus impresoras: una lista corta, con su hora.
ALTER TABLE print_agent ADD CONSTRAINT print_agent_impresoras CHECK (
  windows_printers IS NULL
  OR (jsonb_typeof(windows_printers) = 'array' AND jsonb_array_length(windows_printers) <= 50 AND windows_printers_at IS NOT NULL)
);
