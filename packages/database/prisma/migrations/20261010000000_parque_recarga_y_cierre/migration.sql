-- AlterTable
ALTER TABLE "park_session" ADD COLUMN     "closure_kind" TEXT,
ADD COLUMN     "closure_reason" TEXT,
ADD COLUMN     "picked_up_by_guardian" BOOLEAN,
ADD COLUMN     "picked_up_by_name" TEXT;

-- CreateTable
CREATE TABLE "park_session_extension" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "package_id" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "park_session_extension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "park_session_extension_tenant_id_session_id_idx" ON "park_session_extension"("tenant_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "park_session_extension_tenant_id_id_key" ON "park_session_extension"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "park_session_extension_tenant_id_operation_key_key" ON "park_session_extension"("tenant_id", "operation_key");

-- AddForeignKey
ALTER TABLE "park_session_extension" ADD CONSTRAINT "park_session_extension_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "park_session"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B4-3, F5-11, F5-13, H-19, D9): la recarga de tiempo, a quién se entrega el niño
-- y el cierre administrativo de una estancia huérfana.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La recarga: un tramo más, que no se borra ni se reescribe ──────────────────
ALTER TABLE park_session_extension ADD CONSTRAINT park_session_extension_minutos CHECK (minutes > 0);
ALTER TABLE park_session_extension ADD CONSTRAINT park_session_extension_precio CHECK (currency = 'USD' AND price_minor > 0);
ALTER TABLE park_session_extension ADD CONSTRAINT park_session_extension_nombres CHECK (
  length(btrim(package_name)) >= 1 AND length(btrim(created_by_name)) >= 2);

-- Solo se recarga una estancia activa de tiempo fijo: el tiempo abierto no tiene minutos que sumar.
CREATE FUNCTION l2_recarga_de_estancia_activa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s park_session%ROWTYPE;
BEGIN
  SELECT * INTO s FROM park_session WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF s.status <> 'ACTIVA' OR s.duration_minutes IS NULL THEN
    RAISE EXCEPTION 'park_session_extension: la estancia % no admite recarga (cerrada o de tiempo abierto)', NEW.session_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER park_session_extension_de_activa BEFORE INSERT ON park_session_extension
  FOR EACH ROW EXECUTE FUNCTION l2_recarga_de_estancia_activa();

SELECT l2_aislar_por_tenant('park_session_extension');
SELECT l2_solo_agregar('park_session_extension');

-- ── Cómo se cerró una estancia y a quién se entregó ─────────────────────────────
-- Las cerradas antes de este paso salieron por la salida: se dice, sin inventar quién las recogió.
-- `park_session` tiene la RLS forzada: el dueño la suspende solo mientras rellena, dentro de esta
-- misma transacción (como la siembra de medios de B3-2).
ALTER TABLE park_session NO FORCE ROW LEVEL SECURITY;
UPDATE park_session SET closure_kind = 'SALIDA' WHERE status = 'CERRADA';
ALTER TABLE park_session FORCE ROW LEVEL SECURITY;

ALTER TABLE park_session ADD CONSTRAINT park_session_tipo_de_cierre CHECK (
  (status = 'CERRADA') = (closure_kind IS NOT NULL)
  AND (closure_kind IS NULL OR closure_kind IN ('SALIDA', 'ADMINISTRATIVA')));
-- Un cierre administrativo dice por qué, y no dice quién recogió al niño: nadie lo vio salir.
ALTER TABLE park_session ADD CONSTRAINT park_session_cierre_administrativo CHECK (
  (closure_kind = 'ADMINISTRATIVA') = (closure_reason IS NOT NULL)
  AND (closure_reason IS NULL OR length(btrim(closure_reason)) BETWEEN 5 AND 200)
  AND (closure_kind IS DISTINCT FROM 'ADMINISTRATIVA' OR picked_up_by_guardian IS NULL));
-- D9: si no lo recogió su representante, se dice quién; si lo recogió él, no hay otro nombre.
ALTER TABLE park_session ADD CONSTRAINT park_session_recogida CHECK (
  (picked_up_by_guardian IS NULL OR status = 'CERRADA')
  AND (picked_up_by_guardian IS DISTINCT FROM false OR length(btrim(coalesce(picked_up_by_name, ''))) BETWEEN 2 AND 80)
  AND (picked_up_by_guardian IS DISTINCT FROM true OR picked_up_by_name IS NULL)
  AND (picked_up_by_guardian IS NOT NULL OR picked_up_by_name IS NULL));

-- La estancia sigue avanzando solo hacia su cierre, y el cierre (también cómo y a quién) no cambia.
CREATE OR REPLACE FUNCTION l2_estancia_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla park_session solo admite filas nuevas: DELETE no está permitido (regla 5).'
      USING ERRCODE = 'L2001';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.account_id, NEW.guardian_id, NEW.wristband_code,
      NEW.package_id, NEW.package_name, NEW.mode, NEW.duration_minutes, NEW.price_minor, NEW.currency,
      NEW.terms, NEW.tariff_version, NEW.started_at, NEW.opened_by, NEW.opened_by_name, NEW.device_id,
      NEW.check_in_key)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.account_id, OLD.guardian_id, OLD.wristband_code,
      OLD.package_id, OLD.package_name, OLD.mode, OLD.duration_minutes, OLD.price_minor, OLD.currency,
      OLD.terms, OLD.tariff_version, OLD.started_at, OLD.opened_by, OLD.opened_by_name, OLD.device_id,
      OLD.check_in_key)
     OR (OLD.kid_id IS NOT NULL AND NEW.kid_id IS DISTINCT FROM OLD.kid_id)
     OR (OLD.status = 'CERRADA' AND (NEW.status, NEW.ended_at, NEW.closed_by, NEW.closed_by_name, NEW.check_out_key,
                                     NEW.closure_kind, NEW.closure_reason, NEW.picked_up_by_guardian, NEW.picked_up_by_name)
                                     IS DISTINCT FROM (OLD.status, OLD.ended_at, OLD.closed_by, OLD.closed_by_name, OLD.check_out_key,
                                     OLD.closure_kind, OLD.closure_reason, OLD.picked_up_by_guardian, OLD.picked_up_by_name)) THEN
    RAISE EXCEPTION 'park_session %: una estancia solo se nombra y se cierra; lo contratado y el cierre no se reescriben', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

-- ── La cuenta: la recarga y el cierre administrativo la cambian con su operación ──
ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO'));
