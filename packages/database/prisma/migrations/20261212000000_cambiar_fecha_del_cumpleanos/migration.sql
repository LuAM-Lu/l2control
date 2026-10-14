-- B10-3 · El calendario y cambiar de fecha (M-39, X-11). Solo EXPANDE (ADR-028): una tabla nueva y una reserva que ahora
-- puede cambiar su día y su hora (y nada más), siempre con su cambio anotado. La versión anterior no lee la tabla nueva ni
-- cambia una reserva.
--   · event_reschedule   cada cambio de fecha de un cumpleaños: de cuándo a cuándo, el motivo, quién y cuándo. Nada se
--                        corrige ni se borra: es la historia de la reserva.
--   · event_reservation  su día y su horario cambian solo con un cambio de fecha anotado en la misma transacción; el resto
--                        (la familia, el paquete, los invitados, el anticipo) sigue sin cambiar, y nada se borra.
BEGIN;

CREATE TABLE "event_reschedule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "from_start" INTEGER NOT NULL,
    "from_end" INTEGER NOT NULL,
    "to_date" DATE NOT NULL,
    "to_start" INTEGER NOT NULL,
    "to_end" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "by" UUID,
    "by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "event_reschedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_reschedule_tenant_id_id_key" ON "event_reschedule"("tenant_id", "id");
CREATE UNIQUE INDEX "event_reschedule_tenant_id_operation_key_key" ON "event_reschedule"("tenant_id", "operation_key");
CREATE INDEX "event_reschedule_reserva_idx" ON "event_reschedule"("tenant_id", "reservation_id", "at");

ALTER TABLE "event_reschedule" ADD CONSTRAINT "event_reschedule_tenant_id_reservation_id_fkey"
  FOREIGN KEY ("tenant_id", "reservation_id") REFERENCES "event_reservation"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano: dos horarios en orden, un motivo que diga algo y quién lo cambió.
ALTER TABLE event_reschedule ADD CONSTRAINT event_reschedule_datos CHECK (
  from_start < from_end AND to_start < to_end
  AND from_start >= 0 AND to_start >= 0 AND from_end <= 1440 AND to_end <= 1440
  AND length(btrim(reason)) BETWEEN 3 AND 200 AND length(btrim(by_name)) >= 2);

SELECT l2_aislar_por_tenant('event_reschedule');
SELECT l2_solo_agregar('event_reschedule');

-- La reserva: de solo agregar, salvo su día y su horario, que cambian con su cambio de fecha anotado.
DROP TRIGGER solo_agregar ON event_reservation;
CREATE FUNCTION l2_reserva_solo_cambia_de_fecha() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.account_id, NEW.guardian_id, NEW.guests, NEW.honoree, NEW.honoree_age,
         NEW.package, NEW.catalog_version, NEW.deposit_bps, NEW.deposit_minor, NEW.balance_minor, NEW.currency,
         NEW.created_at, NEW.created_by, NEW.created_by_name, NEW.device_id, NEW.operation_key)
        IS DISTINCT FROM
        (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.account_id, OLD.guardian_id, OLD.guests, OLD.honoree, OLD.honoree_age,
         OLD.package, OLD.catalog_version, OLD.deposit_bps, OLD.deposit_minor, OLD.balance_minor, OLD.currency,
         OLD.created_at, OLD.created_by, OLD.created_by_name, OLD.device_id, OLD.operation_key) THEN
    RAISE EXCEPTION 'event_reservation: solo cambia su día y su horario' USING ERRCODE = 'L2001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM event_reschedule r
    WHERE r.tenant_id = NEW.tenant_id AND r.reservation_id = NEW.id
      AND r.from_date = OLD.event_date AND r.from_start = OLD.starts_minute AND r.from_end = OLD.ends_minute
      AND r.to_date = NEW.event_date AND r.to_start = NEW.starts_minute AND r.to_end = NEW.ends_minute) THEN
    RAISE EXCEPTION 'event_reservation: un cambio de fecha va con su motivo anotado' USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER solo_cambia_de_fecha BEFORE UPDATE OR DELETE ON event_reservation
  FOR EACH ROW EXECUTE FUNCTION l2_reserva_solo_cambia_de_fecha();

COMMIT;
