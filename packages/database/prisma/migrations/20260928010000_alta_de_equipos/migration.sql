-- AlterTable
ALTER TABLE "device" ADD COLUMN     "approval_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approval_last_failure_at" TIMESTAMPTZ(3),
ADD COLUMN     "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (M-7: alta de equipos con buenas prácticas).
-- ═══════════════════════════════════════════════════════════════════════════
-- Los equipos que ya existían pidieron su registro cuando se registraron.
UPDATE device SET requested_at = registered_at;

ALTER TABLE device ADD CONSTRAINT device_approval_failures CHECK (approval_failures >= 0);

-- Una solicitud caducada se renueva desde el propio equipo: queda en su historia.
ALTER TABLE device_change DROP CONSTRAINT device_change_kind;
ALTER TABLE device_change ADD CONSTRAINT device_change_kind
  CHECK (kind IN ('ALTA', 'RENOVADO', 'APROBADO', 'REVOCADO', 'RENOMBRADO'));
