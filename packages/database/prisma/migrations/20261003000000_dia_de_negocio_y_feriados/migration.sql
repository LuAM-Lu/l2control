
-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "business_date" DATE NOT NULL;

-- CreateTable
CREATE TABLE "bank_holiday" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by" UUID,
    "retired_by_name" TEXT,

    CONSTRAINT "bank_holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_holiday_tenant_id_day_idx" ON "bank_holiday"("tenant_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "bank_holiday_tenant_id_id_key" ON "bank_holiday"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payment_tenant_id_business_date_idx" ON "payment"("tenant_id", "business_date");

-- AddForeignKey
ALTER TABLE "bank_holiday" ADD CONSTRAINT "bank_holiday_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B2-4, F3-11, ADR-009, D-FER).
-- El libro estaba vacío en toda base (la caja cobra contra él desde B3-3): business_date entra
-- NOT NULL.
-- ═══════════════════════════════════════════════════════════════════════════

-- I-13: el día de negocio de un asiento es el de su turno, no el de su hora. Se sustituye la
-- función del disparador de B3-1 para comprobarlo también.
CREATE OR REPLACE FUNCTION l2_pago_en_turno_abierto() RETURNS trigger
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
  IF NEW.business_date <> t.business_date THEN
    RAISE EXCEPTION 'payment: el día de negocio % no es el de su turno (%)', NEW.business_date, t.business_date
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Un feriado es un día entre semana (sábado y domingo ya no son hábiles) con su nombre.
ALTER TABLE bank_holiday ADD CONSTRAINT bank_holiday_entre_semana CHECK (EXTRACT(ISODOW FROM day) < 6);
ALTER TABLE bank_holiday ADD CONSTRAINT bank_holiday_nombres CHECK (
  length(btrim(name)) >= 3 AND length(btrim(created_by_name)) >= 2
  AND (retired_by_name IS NULL OR length(btrim(retired_by_name)) >= 2));
-- Retirado dice quién y cuándo, o nada.
ALTER TABLE bank_holiday ADD CONSTRAINT bank_holiday_retiro CHECK (
  (retired_at IS NULL) = (retired_by_name IS NULL) AND (retired_by IS NULL OR retired_at IS NOT NULL));
-- Un día, un feriado vigente.
CREATE UNIQUE INDEX bank_holiday_uno_por_dia ON bank_holiday (tenant_id, day) WHERE retired_at IS NULL;

-- No se borra ni se reescribe: solo se retira, una vez (decide qué tasa cubre qué día, y eso se audita).
CREATE FUNCTION l2_feriado_solo_se_retira() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.retired_at IS NOT NULL
     OR (NEW.id, NEW.tenant_id, NEW.day, NEW.name, NEW.created_at, NEW.created_by, NEW.created_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.day, OLD.name, OLD.created_at, OLD.created_by, OLD.created_by_name) THEN
    RAISE EXCEPTION 'La tabla bank_holiday solo admite filas nuevas y retirar una vez: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bank_holiday_solo_se_retira BEFORE UPDATE OR DELETE ON bank_holiday
  FOR EACH ROW EXECUTE FUNCTION l2_feriado_solo_se_retira();

SELECT l2_aislar_por_tenant('bank_holiday');
