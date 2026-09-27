-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "reference_cipher" TEXT,
ADD COLUMN     "reference_digest" TEXT,
ADD COLUMN     "terminal_id" UUID;

-- CreateTable
CREATE TABLE "payment_method" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "gives_change" BOOLEAN NOT NULL,
    "triggers_igtf" BOOLEAN NOT NULL,
    "data_kind" TEXT,
    "active" BOOLEAN NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_terminal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by" UUID,
    "retired_by_name" TEXT,

    CONSTRAINT "pos_terminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_details" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data_cipher" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,
    "recorded_by_name" TEXT NOT NULL,

    CONSTRAINT "collection_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_tenant_id_id_key" ON "payment_method"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_tenant_id_code_key" ON "payment_method"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_tenant_id_code_currency_key" ON "payment_method"("tenant_id", "code", "currency");

-- CreateIndex
CREATE INDEX "pos_terminal_tenant_id_branch_id_idx" ON "pos_terminal"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_terminal_tenant_id_id_key" ON "pos_terminal"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_terminal_tenant_id_branch_id_id_key" ON "pos_terminal"("tenant_id", "branch_id", "id");

-- CreateIndex
CREATE INDEX "collection_details_tenant_id_kind_recorded_at_idx" ON "collection_details"("tenant_id", "kind", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "collection_details_tenant_id_id_key" ON "collection_details"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payment_tenant_id_reference_digest_idx" ON "payment"("tenant_id", "reference_digest");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_branch_id_terminal_id_fkey" FOREIGN KEY ("tenant_id", "branch_id", "terminal_id") REFERENCES "pos_terminal"("tenant_id", "branch_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pos_terminal" ADD CONSTRAINT "pos_terminal_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collection_details" ADD CONSTRAINT "collection_details_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-2, F4-02, F4-04, §9.9, §7.6): los medios de pago son datos del local, el
-- libro cita el medio con su moneda, y los datos de cada pago se guardan cifrados.
-- Cuidado con los nulos: un CHECK desconocido pasa. Cada condición sobre una columna que admite
-- nulos dice explícitamente qué pasa con el nulo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El catálogo ──────────────────────────────────────────────────────────────
ALTER TABLE payment_method ADD CONSTRAINT payment_method_code CHECK (code ~ '^[A-Z][A-Z0-9_]{2,31}$');
ALTER TABLE payment_method ADD CONSTRAINT payment_method_label CHECK (length(btrim(label)) BETWEEN 2 AND 24);
ALTER TABLE payment_method ADD CONSTRAINT payment_method_currency CHECK (currency IN ('USD', 'VES', 'USDT'));
ALTER TABLE payment_method ADD CONSTRAINT payment_method_data_kind CHECK (
  data_kind IS NULL OR data_kind IN ('PAGO_MOVIL', 'ZELLE', 'USDT', 'PUNTO'));
-- Da vuelto solo el efectivo de la gaveta (dólares y bolívares), y el efectivo no pide referencia.
ALTER TABLE payment_method ADD CONSTRAINT payment_method_efectivo CHECK (
  NOT gives_change OR (currency IN ('USD', 'VES') AND data_kind IS NULL));
ALTER TABLE payment_method ADD CONSTRAINT payment_method_position CHECK (position >= 0);
ALTER TABLE payment_method ADD CONSTRAINT payment_method_created_by_name CHECK (length(btrim(created_by_name)) >= 2);

-- El libro ya citaba los siete medios de §5.5: cada local que exista nace con ellos, antes de que
-- la FK los exija. Es el mismo catálogo que `DEFAULT_LEDGER_METHODS` de @l2/domain-cash; los que
-- piden datos del local, apagados hasta que los tenga. `tenant` tiene la RLS forzada: el dueño
-- la suspende solo mientras lee, dentro de esta misma transacción.
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
INSERT INTO payment_method (id, tenant_id, code, label, currency, gives_change, triggers_igtf, data_kind, active, position, created_by_name)
SELECT gen_random_uuid(), t.id, m.code, m.label, m.currency, m.gives_change, m.triggers_igtf, m.data_kind, m.active, m.position, 'Migración B3-2'
  FROM tenant t
 CROSS JOIN (VALUES
   ('EFECTIVO_USD', 'Efectivo $',    'USD',  true,  true,  NULL,         true,  0),
   ('EFECTIVO_VES', 'Efectivo Bs',   'VES',  true,  false, NULL,         true,  1),
   ('PAGO_MOVIL',   'Pago Móvil',    'VES',  false, false, 'PAGO_MOVIL', false, 2),
   ('PDV_DEBITO',   'Punto débito',  'VES',  false, false, 'PUNTO',      false, 3),
   ('PDV_CREDITO',  'Punto crédito', 'VES',  false, false, 'PUNTO',      false, 4),
   ('ZELLE',        'Zelle',         'USD',  false, true,  'ZELLE',      false, 5),
   ('USDT',         'USDT',          'USDT', false, true,  'USDT',       true,  6)
 ) AS m(code, label, currency, gives_change, triggers_igtf, data_kind, active, position);
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

-- Lo que define un medio no cambia (los asientos lo citan con ese sentido); tampoco se borra. Se
-- renombra, se enciende, se apaga, se reordena y su trato del IGTF sigue a la norma.
CREATE FUNCTION l2_medio_no_se_redefine() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.code, NEW.currency, NEW.gives_change, NEW.data_kind, NEW.created_at, NEW.created_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.code, OLD.currency, OLD.gives_change, OLD.data_kind, OLD.created_at, OLD.created_by_name) THEN
    RAISE EXCEPTION 'La tabla payment_method solo admite encender, apagar, renombrar y reordenar: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_method_no_se_redefine BEFORE UPDATE OR DELETE ON payment_method
  FOR EACH ROW EXECUTE FUNCTION l2_medio_no_se_redefine();
CREATE TRIGGER payment_method_no_se_vacia BEFORE TRUNCATE ON payment_method
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();

SELECT l2_aislar_por_tenant('payment_method');

-- ── El libro cita el catálogo ────────────────────────────────────────────────
-- La lista cerrada de medios, su moneda y el vuelto en efectivo pasan a ser del catálogo: la FK
-- lleva la moneda (un Zelle en bolívares no existe porque el Zelle del local es en dólares) y el
-- disparador de abajo, el vuelto y los datos.
ALTER TABLE payment DROP CONSTRAINT payment_method;
ALTER TABLE payment DROP CONSTRAINT payment_currency;
ALTER TABLE payment DROP CONSTRAINT payment_vuelto_en_efectivo;
ALTER TABLE payment ADD CONSTRAINT "payment_tenant_id_method_currency_fkey" FOREIGN KEY ("tenant_id", "method", "currency")
  REFERENCES "payment_method"("tenant_id", "code", "currency") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Los datos del pago van solo en un cobro original, y cifrados: un texto que no tiene la forma
-- del cifrado (`v1.<iv>.<etiqueta>.<datos>`) es un dato en claro y no entra. El terminal y la
-- huella, solo con los datos.
ALTER TABLE payment ADD CONSTRAINT payment_referencia CHECK (
  (reference_cipher IS NULL AND reference_digest IS NULL AND terminal_id IS NULL)
  OR (kind = 'COBRO' AND reverses_id IS NULL AND reference_cipher IS NOT NULL));
ALTER TABLE payment ADD CONSTRAINT payment_referencia_cifrada CHECK (
  reference_cipher IS NULL OR reference_cipher ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$');
ALTER TABLE payment ADD CONSTRAINT payment_referencia_huella CHECK (
  reference_digest IS NULL OR reference_digest ~ '^[0-9a-f]{64}$');

-- Lo que el catálogo dice de un asiento, comprobado por la base aunque el código se equivoque:
-- el vuelto sale de un medio que da vuelto (§5.6); un cobro, de un medio encendido y con los
-- datos que ese medio pide (F4-04); el punto de venta dice por qué terminal vigente pasó.
CREATE FUNCTION l2_asiento_del_medio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  m payment_method%ROWTYPE;
  t pos_terminal%ROWTYPE;
BEGIN
  SELECT * INTO m FROM payment_method WHERE tenant_id = NEW.tenant_id AND code = NEW.method;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF NEW.kind = 'VUELTO' AND NOT m.gives_change THEN
    RAISE EXCEPTION 'payment: el vuelto sale de la gaveta, y % no da vuelto', NEW.method USING ERRCODE = '23514';
  END IF;
  IF NEW.kind <> 'COBRO' OR NEW.reverses_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT m.active THEN
    RAISE EXCEPTION 'payment: el medio % está apagado', NEW.method USING ERRCODE = '23514';
  END IF;
  IF (m.data_kind IS NOT NULL) <> (NEW.reference_cipher IS NOT NULL) THEN
    RAISE EXCEPTION 'payment: un cobro con % lleva los datos que su medio pide, y solo esos', NEW.method USING ERRCODE = '23514';
  END IF;
  IF (m.data_kind IS NOT DISTINCT FROM 'PUNTO') <> (NEW.terminal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'payment: un cobro con punto de venta dice su terminal, y ningún otro lo dice' USING ERRCODE = '23514';
  END IF;
  IF NEW.terminal_id IS NOT NULL THEN
    SELECT * INTO t FROM pos_terminal WHERE tenant_id = NEW.tenant_id AND id = NEW.terminal_id;
    IF FOUND AND t.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'payment: el terminal % está retirado', NEW.terminal_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_asiento_del_medio BEFORE INSERT ON payment
  FOR EACH ROW EXECUTE FUNCTION l2_asiento_del_medio();

-- ── Los terminales de punto de venta ────────────────────────────────────────
ALTER TABLE pos_terminal ADD CONSTRAINT pos_terminal_nombres CHECK (
  length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(bank)) BETWEEN 2 AND 40
  AND length(btrim(created_by_name)) >= 2
  AND (retired_by_name IS NULL OR length(btrim(retired_by_name)) >= 2));
-- Retirado dice quién y cuándo, o nada.
ALTER TABLE pos_terminal ADD CONSTRAINT pos_terminal_retiro CHECK (
  (retired_at IS NULL) = (retired_by_name IS NULL) AND (retired_by IS NULL OR retired_at IS NOT NULL));
-- Dos terminales vigentes con el mismo nombre en una sucursal confunden a quien cobra.
CREATE UNIQUE INDEX pos_terminal_nombre_vigente ON pos_terminal (tenant_id, branch_id, lower(btrim(name))) WHERE retired_at IS NULL;

-- No se borra ni se reescribe (un pago dice por cuál pasó la tarjeta): solo se retira, una vez.
CREATE FUNCTION l2_terminal_solo_se_retira() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.retired_at IS NOT NULL
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.name, NEW.bank, NEW.created_at, NEW.created_by, NEW.created_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.name, OLD.bank, OLD.created_at, OLD.created_by, OLD.created_by_name) THEN
    RAISE EXCEPTION 'La tabla pos_terminal solo admite filas nuevas y retirar una vez: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pos_terminal_solo_se_retira BEFORE UPDATE OR DELETE ON pos_terminal
  FOR EACH ROW EXECUTE FUNCTION l2_terminal_solo_se_retira();
CREATE TRIGGER pos_terminal_no_se_vacia BEFORE TRUNCATE ON pos_terminal
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();

SELECT l2_aislar_por_tenant('pos_terminal');

-- ── Los datos del local para que el cliente pague ───────────────────────────
ALTER TABLE collection_details ADD CONSTRAINT collection_details_kind CHECK (kind IN ('PAGO_MOVIL', 'ZELLE'));
ALTER TABLE collection_details ADD CONSTRAINT collection_details_cifrado CHECK (
  data_cipher ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$');
ALTER TABLE collection_details ADD CONSTRAINT collection_details_recorded_by_name CHECK (length(btrim(recorded_by_name)) >= 2);

SELECT l2_aislar_por_tenant('collection_details');
-- Cambiar los datos añade una fila; rige la última (regla 5).
SELECT l2_solo_agregar('collection_details');
