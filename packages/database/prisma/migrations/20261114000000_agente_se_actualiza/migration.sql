-- T-8c (M-25, ADR-028 punto 5): el agente de impresión se actualiza solo. Solo expande (ADR-028): la versión anterior
-- ignora las columnas nuevas.
--
-- El agente dice su versión al conectarse; administración puede pedir «Actualizar ahora»; y cada cambio de versión
-- deja su resultado (se cambió, la huella no era la publicada, no arrancó y volvió la anterior…) para el panel.

-- AlterTable
ALTER TABLE "print_agent" ADD COLUMN     "agent_version" TEXT,
ADD COLUMN     "update_at" TIMESTAMPTZ(3),
ADD COLUMN     "update_detail" TEXT,
ADD COLUMN     "update_requested_at" TIMESTAMPTZ(3),
ADD COLUMN     "update_result" TEXT,
ADD COLUMN     "update_version" TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (T-8c).
-- ═══════════════════════════════════════════════════════════════════════════

-- Lo que el agente dice de sí mismo se guarda acotado: no es un texto libre.
ALTER TABLE print_agent ADD CONSTRAINT print_agent_version CHECK (agent_version IS NULL OR agent_version ~ '^[0-9A-Za-z._-]{1,20}$');

-- El resultado de un cambio va con su versión y su hora, o no va.
ALTER TABLE print_agent ADD CONSTRAINT print_agent_actualizacion CHECK (
  (update_result IS NULL AND update_version IS NULL AND update_at IS NULL AND update_detail IS NULL)
  OR (update_result IN ('ACTUALIZADO', 'HUELLA_EQUIVOCADA', 'NO_ARRANCA', 'NO_ARRANCO', 'ERROR')
      AND update_version ~ '^[0-9A-Za-z._-]{1,20}$' AND update_at IS NOT NULL
      AND (update_detail IS NULL OR length(update_detail) <= 200))
);
