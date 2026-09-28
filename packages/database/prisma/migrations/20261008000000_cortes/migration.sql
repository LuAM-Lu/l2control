-- CreateTable
CREATE TABLE "shift_count" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "counted_at" TIMESTAMPTZ(3) NOT NULL,
    "counted_by" UUID,
    "counted_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "counts" JSONB NOT NULL,
    "counted" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "differences" JSONB NOT NULL,
    "difference_usd_minor" BIGINT,
    "rate_id" UUID,
    "rate_value" TEXT,
    "signer" TEXT NOT NULL,

    CONSTRAINT "shift_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_cut" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "made_at" TIMESTAMPTZ(3) NOT NULL,
    "made_by" UUID,
    "made_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "content" JSONB NOT NULL,
    "count_id" UUID,
    "closing" TEXT,
    "signer" TEXT,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,
    "justification" TEXT,
    "operation_key" UUID,

    CONSTRAINT "shift_cut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_count_tenant_id_shift_id_counted_at_idx" ON "shift_count"("tenant_id", "shift_id", "counted_at");

-- CreateIndex
CREATE UNIQUE INDEX "shift_count_tenant_id_id_key" ON "shift_count"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "shift_cut_tenant_id_shift_id_made_at_idx" ON "shift_cut"("tenant_id", "shift_id", "made_at");

-- CreateIndex
CREATE UNIQUE INDEX "shift_cut_tenant_id_id_key" ON "shift_cut"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "shift_count" ADD CONSTRAINT "shift_count_tenant_id_shift_id_fkey" FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shift_cut" ADD CONSTRAINT "shift_cut_tenant_id_shift_id_fkey" FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shift_cut" ADD CONSTRAINT "shift_cut_tenant_id_count_id_fkey" FOREIGN KEY ("tenant_id", "count_id") REFERENCES "shift_count"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-5, F4-05 a F4-08, D-JOR): el arqueo y los cortes del turno, de solo-agregar.
-- Después del corte Z nada toca el turno; y una cuenta puede quedar incobrable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El conteo de la gaveta ───────────────────────────────────────────────────
ALTER TABLE shift_count ADD CONSTRAINT shift_count_signer CHECK (signer IN ('CAJERA', 'SUPERVISION'));
ALTER TABLE shift_count ADD CONSTRAINT shift_count_nombre CHECK (length(btrim(counted_by_name)) >= 2);
ALTER TABLE shift_count ADD CONSTRAINT shift_count_json CHECK (
  jsonb_typeof(counts) = 'array' AND jsonb_typeof(counted) = 'array'
  AND jsonb_typeof(expected) = 'array' AND jsonb_typeof(differences) = 'array');
-- La tasa con que se midió va con su valor, o no va.
ALTER TABLE shift_count ADD CONSTRAINT shift_count_tasa CHECK ((rate_id IS NULL) = (rate_value IS NULL));
-- Sin diferencia medible (sin tasa del turno), firma supervisión: nadie lo decide por su cuenta.
ALTER TABLE shift_count ADD CONSTRAINT shift_count_sin_medida CHECK (difference_usd_minor IS NOT NULL OR signer = 'SUPERVISION');
ALTER TABLE shift_count ADD CONSTRAINT shift_count_diferencia CHECK (difference_usd_minor IS NULL OR difference_usd_minor >= 0);

SELECT l2_aislar_por_tenant('shift_count');
SELECT l2_solo_agregar('shift_count');

-- ── Los cortes X y Z ─────────────────────────────────────────────────────────
-- Con IN y columnas que admiten nulo, cada IN va con su IS NOT NULL: un nulo no pasa por un IN.
ALTER TABLE shift_cut ADD CONSTRAINT shift_cut_kind CHECK (kind IN ('X', 'Z'));
ALTER TABLE shift_cut ADD CONSTRAINT shift_cut_forma CHECK (
  (kind = 'X' AND count_id IS NULL AND closing IS NULL AND signer IS NULL AND operation_key IS NULL
     AND authorized_by IS NULL AND authorized_by_name IS NULL AND justification IS NULL)
  OR
  (kind = 'Z' AND count_id IS NOT NULL AND operation_key IS NOT NULL
     AND closing IS NOT NULL AND closing IN ('RELEVO', 'JORNADA')
     AND signer IS NOT NULL AND signer IN ('CAJERA', 'SUPERVISION')));
-- Por encima del umbral firma supervisión, con nombre y una justificación de verdad (F4-07).
ALTER TABLE shift_cut ADD CONSTRAINT shift_cut_supervision CHECK (
  signer IS DISTINCT FROM 'SUPERVISION'
  OR (authorized_by IS NOT NULL AND authorized_by_name IS NOT NULL AND length(btrim(coalesce(justification, ''))) >= 5));
ALTER TABLE shift_cut ADD CONSTRAINT shift_cut_nombre CHECK (length(btrim(made_by_name)) >= 2);
ALTER TABLE shift_cut ADD CONSTRAINT shift_cut_contenido CHECK (jsonb_typeof(content) = 'object');
-- Un Z por turno (F4-06), y una operación de cierre una vez.
CREATE UNIQUE INDEX shift_cut_un_z ON shift_cut (tenant_id, shift_id) WHERE kind = 'Z';
CREATE UNIQUE INDEX shift_cut_una_operacion ON shift_cut (tenant_id, operation_key) WHERE operation_key IS NOT NULL;

SELECT l2_aislar_por_tenant('shift_cut');
SELECT l2_solo_agregar('shift_cut');

-- Nada se cuenta ni se corta en un turno ya sellado (F4-06); y el arqueo de un Z es de su turno.
CREATE FUNCTION l2_turno_sin_sellar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t cash_shift%ROWTYPE;
  c shift_count%ROWTYPE;
BEGIN
  SELECT * INTO t FROM cash_shift WHERE tenant_id = NEW.tenant_id AND id = NEW.shift_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF t.status = 'CERRADO_Z' THEN
    RAISE EXCEPTION '%: el turno % ya tiene corte Z y nada lo toca (F4-06)', TG_TABLE_NAME, NEW.shift_id
      USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'shift_cut' AND NEW.count_id IS NOT NULL THEN
    SELECT * INTO c FROM shift_count WHERE tenant_id = NEW.tenant_id AND id = NEW.count_id;
    IF FOUND AND c.shift_id <> NEW.shift_id THEN
      RAISE EXCEPTION 'shift_cut: el arqueo % es de otro turno', NEW.count_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_count_sin_sellar BEFORE INSERT ON shift_count FOR EACH ROW EXECUTE FUNCTION l2_turno_sin_sellar();
CREATE TRIGGER shift_cut_sin_sellar BEFORE INSERT ON shift_cut FOR EACH ROW EXECUTE FUNCTION l2_turno_sin_sellar();

-- DEC-24: tras el corte Z, un cobro no se anula (con factura fiscal sería una nota de crédito, F3).
CREATE FUNCTION l2_anular_antes_del_z() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  estado text;
BEGIN
  SELECT t.status INTO estado FROM sale s JOIN cash_shift t ON t.tenant_id = s.tenant_id AND t.id = s.shift_id
   WHERE s.tenant_id = NEW.tenant_id AND s.id = NEW.sale_id;
  IF estado = 'CERRADO_Z' THEN
    RAISE EXCEPTION 'sale_void: la venta % es de un turno con corte Z: no se anula', NEW.sale_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_void_antes_del_z BEFORE INSERT ON sale_void FOR EACH ROW EXECUTE FUNCTION l2_anular_antes_del_z();

-- ── La cuenta incobrable (D-JOR) ─────────────────────────────────────────────
ALTER TABLE account_version DROP CONSTRAINT account_version_status;
ALTER TABLE account_version ADD CONSTRAINT account_version_status CHECK (status IN ('ABIERTA', 'POR_COBRAR', 'COBRADA', 'INCOBRABLE'));
ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE'));
