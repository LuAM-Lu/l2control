
-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "shift_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "cash_shift" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "point_label" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by" UUID NOT NULL,
    "opened_by_name" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by" UUID,
    "closed_by_name" TEXT,

    CONSTRAINT "cash_shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shift_float" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "cash_shift_float_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_shift_tenant_id_branch_id_business_date_idx" ON "cash_shift"("tenant_id", "branch_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_shift_tenant_id_id_key" ON "cash_shift"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_shift_float_tenant_id_shift_id_currency_key" ON "cash_shift_float"("tenant_id", "shift_id", "currency");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_shift_id_fkey" FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shift" ADD CONSTRAINT "cash_shift_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shift" ADD CONSTRAINT "cash_shift_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "device"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shift" ADD CONSTRAINT "cash_shift_tenant_id_opened_by_fkey" FOREIGN KEY ("tenant_id", "opened_by") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shift" ADD CONSTRAINT "cash_shift_tenant_id_closed_by_fkey" FOREIGN KEY ("tenant_id", "closed_by") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shift_float" ADD CONSTRAINT "cash_shift_float_tenant_id_shift_id_fkey" FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-1, F4-01, I-06, I-14, ADR-009): el turno de caja.
-- El libro estaba vacío en toda base (B2-3 no tiene pantalla): por eso shift_id entra NOT NULL.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE cash_shift ADD CONSTRAINT cash_shift_status CHECK (status IN ('ABIERTO', 'EN_CIERRE', 'CERRADO_Z'));
-- Un turno con corte Z dice quién lo cerró y cuándo; uno sin corte, no lo dice. Todo en booleanos
-- que nunca son nulos: un CHECK desconocido pasa.
ALTER TABLE cash_shift ADD CONSTRAINT cash_shift_cierre CHECK (
  (status = 'CERRADO_Z') = (closed_at IS NOT NULL)
  AND (closed_at IS NULL) = (closed_by IS NULL)
  AND (closed_by IS NULL) = (closed_by_name IS NULL));
ALTER TABLE cash_shift ADD CONSTRAINT cash_shift_cierre_despues CHECK (closed_at IS NULL OR closed_at >= opened_at);
ALTER TABLE cash_shift ADD CONSTRAINT cash_shift_nombres CHECK (
  length(btrim(opened_by_name)) >= 2 AND length(btrim(point_label)) >= 2
  AND (closed_by_name IS NULL OR length(btrim(closed_by_name)) >= 2));

-- I-06: un equipo, un turno sin corte Z. Con dos, el mismo dinero se contaría en dos arqueos.
CREATE UNIQUE INDEX cash_shift_uno_por_equipo ON cash_shift (tenant_id, device_id) WHERE status <> 'CERRADO_Z';

-- Un turno no se borra y solo avanza: ABIERTO → EN_CIERRE → CERRADO_Z (F4-06: no se reabre). Lo
-- que declaró al abrir no cambia, y el cierre, una vez firmado, tampoco.
CREATE FUNCTION l2_turno_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  orden CONSTANT text[] := ARRAY['ABIERTO', 'EN_CIERRE', 'CERRADO_Z'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla cash_shift solo admite filas nuevas: DELETE no está permitido (regla 5).'
      USING ERRCODE = 'L2001';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.device_id, NEW.point_label, NEW.business_date,
      NEW.opened_at, NEW.opened_by, NEW.opened_by_name)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.device_id, OLD.point_label, OLD.business_date,
      OLD.opened_at, OLD.opened_by, OLD.opened_by_name)
     OR array_position(orden, NEW.status) < array_position(orden, OLD.status)
     OR (OLD.closed_at IS NOT NULL AND (NEW.closed_at, NEW.closed_by, NEW.closed_by_name)
                                       IS DISTINCT FROM (OLD.closed_at, OLD.closed_by, OLD.closed_by_name)) THEN
    RAISE EXCEPTION 'cash_shift %: un turno solo avanza hacia el corte Z y no reescribe su apertura ni su cierre', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cash_shift_solo_avanza BEFORE UPDATE OR DELETE ON cash_shift
  FOR EACH ROW EXECUTE FUNCTION l2_turno_solo_avanza();

ALTER TABLE cash_shift_float ADD CONSTRAINT cash_shift_float_currency CHECK (currency IN ('USD', 'VES'));
ALTER TABLE cash_shift_float ADD CONSTRAINT cash_shift_float_amount CHECK (amount_minor >= 0);

-- I-14: no se cobra en un turno cerrado, ni en el de otra sucursal.
CREATE FUNCTION l2_pago_en_turno_abierto() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t cash_shift%ROWTYPE;
BEGIN
  SELECT * INTO t FROM cash_shift WHERE tenant_id = NEW.tenant_id AND id = NEW.shift_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF t.status = 'CERRADO_Z' OR t.branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION 'payment: el turno % no admite dinero (cerrado con corte Z o de otra sucursal)', NEW.shift_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_en_turno_abierto BEFORE INSERT ON payment
  FOR EACH ROW EXECUTE FUNCTION l2_pago_en_turno_abierto();

SELECT l2_aislar_por_tenant('cash_shift');
SELECT l2_aislar_por_tenant('cash_shift_float');
SELECT l2_solo_agregar('cash_shift_float');
