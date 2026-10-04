-- B10-2 · Los invitados de un cumpleaños. Su estancia nombra la reserva del evento y es la única que va a precio
-- cero: la paga el paquete del evento. Cualquier otra estancia sigue costando más que cero (B4-2).
BEGIN;

-- AlterTable
ALTER TABLE "park_session" ADD COLUMN "event_reservation_id" UUID;

-- AddForeignKey
ALTER TABLE "park_session" ADD CONSTRAINT "park_session_tenant_id_event_reservation_id_fkey" FOREIGN KEY ("tenant_id", "event_reservation_id") REFERENCES "event_reservation"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX park_session_por_evento ON park_session (tenant_id, event_reservation_id) WHERE event_reservation_id IS NOT NULL;

ALTER TABLE park_session DROP CONSTRAINT park_session_precio;
ALTER TABLE park_session ADD CONSTRAINT park_session_precio CHECK (
  currency = 'USD' AND (
    (event_reservation_id IS NULL AND price_minor > 0) OR
    (event_reservation_id IS NOT NULL AND price_minor = 0)
  ));

COMMIT;
