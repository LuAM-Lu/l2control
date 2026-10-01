-- B3-6 · Descuentos configurables (V-9, D-DESC). Tablas nuevas y una causa más en las versiones de la
-- cuenta: no rellena datos. Va entera en una transacción (Prisma no la envuelve, §5).
BEGIN;

-- CreateTable
CREATE TABLE "discount_rule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value_kind" TEXT NOT NULL,
    "basis_points" INTEGER,
    "amount_minor" BIGINT,
    "currency" TEXT,
    "scope_kind" TEXT NOT NULL,
    "categories" TEXT[],
    "method_code" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by" UUID,
    "retired_by_name" TEXT,

    CONSTRAINT "discount_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_vip" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "discount_rule_id" UUID,
    "marked_at" TIMESTAMPTZ(3) NOT NULL,
    "marked_by" UUID,
    "marked_by_name" TEXT NOT NULL,

    CONSTRAINT "guardian_vip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discount_rule_tenant_id_kind_idx" ON "discount_rule"("tenant_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "discount_rule_tenant_id_id_key" ON "discount_rule"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "guardian_vip_tenant_id_guardian_id_marked_at_idx" ON "guardian_vip"("tenant_id", "guardian_id", "marked_at");

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_tenant_id_method_code_fkey" FOREIGN KEY ("tenant_id", "method_code") REFERENCES "payment_method"("tenant_id", "code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "guardian_vip" ADD CONSTRAINT "guardian_vip_tenant_id_guardian_id_fkey" FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "guardian_vip" ADD CONSTRAINT "guardian_vip_tenant_id_discount_rule_id_fkey" FOREIGN KEY ("tenant_id", "discount_rule_id") REFERENCES "discount_rule"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-6, V-9, D-DESC): las reglas de descuento se retiran pero no se borran ni se
-- reescriben; marcar a una familia VIP es de solo-agregar; y poner o quitar un descuento es una
-- versión más de la cuenta, con la clave de su operación.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La regla ─────────────────────────────────────────────────────────────────
-- Las columnas con IN no admiten nulos: un IN sobre un nulo dejaría pasarlo (§5).
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_kind CHECK (kind IN ('MEDIO', 'VIP', 'MANUAL'));
-- Un porcentaje en puntos básicos (de 0,01 % a 100 %) o un monto en dólares mayor que cero; nunca los dos.
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_valor CHECK (
  (value_kind = 'PORCENTAJE' AND basis_points IS NOT NULL AND basis_points BETWEEN 1 AND 10000
     AND amount_minor IS NULL AND currency IS NULL)
  OR (value_kind = 'MONTO' AND amount_minor IS NOT NULL AND amount_minor BETWEEN 1 AND 1000000
     AND currency IS NOT NULL AND currency = 'USD' AND basis_points IS NULL));
-- Las categorías, solo en el alcance por categorías (y nunca nula: cardinality(NULL) colaría).
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_alcance CHECK (
  categories IS NOT NULL AND (
    (scope_kind IN ('CUENTA', 'PARQUE', 'RESTAURANTE') AND cardinality(categories) = 0)
    OR (scope_kind = 'CATEGORIAS' AND cardinality(categories) BETWEEN 1 AND 20)));
-- Solo el descuento por medio de pago dice su medio (la FK compuesta comprueba que exista en el local).
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_medio CHECK ((kind = 'MEDIO') = (method_code IS NOT NULL));
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_vigencia CHECK (valid_to IS NULL OR valid_to >= valid_from);
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_nombres CHECK (
  length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(created_by_name)) >= 2
  AND (retired_by_name IS NULL OR length(btrim(retired_by_name)) >= 2));
-- Retirada dice quién y cuándo, o nada.
ALTER TABLE discount_rule ADD CONSTRAINT discount_rule_retiro CHECK (
  (retired_at IS NULL) = (retired_by_name IS NULL) AND (retired_by IS NULL OR retired_at IS NOT NULL));

-- No se borra ni se reescribe (un cobro dice con cuál se descontó): solo se retira, una vez.
CREATE FUNCTION l2_descuento_solo_se_retira() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.retired_at IS NOT NULL
     OR (NEW.id, NEW.tenant_id, NEW.name, NEW.kind, NEW.value_kind, NEW.basis_points, NEW.amount_minor, NEW.currency,
         NEW.scope_kind, NEW.categories, NEW.method_code, NEW.valid_from, NEW.valid_to, NEW.created_at, NEW.created_by, NEW.created_by_name)
        IS DISTINCT FROM
        (OLD.id, OLD.tenant_id, OLD.name, OLD.kind, OLD.value_kind, OLD.basis_points, OLD.amount_minor, OLD.currency,
         OLD.scope_kind, OLD.categories, OLD.method_code, OLD.valid_from, OLD.valid_to, OLD.created_at, OLD.created_by, OLD.created_by_name) THEN
    RAISE EXCEPTION 'La tabla discount_rule solo admite filas nuevas y retirar una vez: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER discount_rule_solo_se_retira BEFORE UPDATE OR DELETE ON discount_rule
  FOR EACH ROW EXECUTE FUNCTION l2_descuento_solo_se_retira();
CREATE TRIGGER discount_rule_no_se_vacia BEFORE TRUNCATE ON discount_rule
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();

SELECT l2_aislar_por_tenant('discount_rule');

-- ── La marca VIP de una familia ──────────────────────────────────────────────
ALTER TABLE guardian_vip ADD CONSTRAINT guardian_vip_marked_by_name CHECK (length(btrim(marked_by_name)) >= 2);

-- Solo una regla VIP marca a una familia, y no una retirada.
CREATE FUNCTION l2_vip_con_regla_vip() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r discount_rule%ROWTYPE;
BEGIN
  IF NEW.discount_rule_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM discount_rule WHERE tenant_id = NEW.tenant_id AND id = NEW.discount_rule_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF r.kind <> 'VIP' OR r.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'guardian_vip: la regla % no es un descuento VIP vigente', NEW.discount_rule_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guardian_vip_con_regla_vip BEFORE INSERT ON guardian_vip
  FOR EACH ROW EXECUTE FUNCTION l2_vip_con_regla_vip();

SELECT l2_aislar_por_tenant('guardian_vip');
SELECT l2_solo_agregar('guardian_vip');

-- ── Poner o quitar un descuento: una versión más de la cuenta, con su clave ──
ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO'));

COMMIT;
