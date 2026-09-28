-- CreateTable
CREATE TABLE "sale" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "operation_key" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL,
    "cashier_id" UUID,
    "cashier_name" TEXT NOT NULL,
    "device_id" UUID,
    "order_number" INTEGER NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_print" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "printed_at" TIMESTAMPTZ(3) NOT NULL,
    "printed_by" UUID,
    "printed_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "copy" BOOLEAN NOT NULL,

    CONSTRAINT "sale_print_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_void" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "operation_key" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3) NOT NULL,
    "requested_by" UUID,
    "requested_by_name" TEXT NOT NULL,
    "authorized_by" UUID NOT NULL,
    "authorized_by_name" TEXT NOT NULL,
    "authorized_by_role" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "refunds" JSONB NOT NULL,

    CONSTRAINT "sale_void_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_tenant_id_shift_id_closed_at_idx" ON "sale"("tenant_id", "shift_id", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_tenant_id_id_key" ON "sale"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_tenant_id_operation_key_key" ON "sale"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "sale_print_tenant_id_sale_id_printed_at_idx" ON "sale_print"("tenant_id", "sale_id", "printed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_print_tenant_id_id_key" ON "sale_print"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_void_tenant_id_id_key" ON "sale_void"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_void_tenant_id_sale_id_key" ON "sale_void"("tenant_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_void_tenant_id_operation_key_key" ON "sale_void"("tenant_id", "operation_key");

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_tenant_id_shift_id_fkey" FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_print" ADD CONSTRAINT "sale_print_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sale"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sale_void" ADD CONSTRAINT "sale_void_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sale"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-4, C12, DEC-24): la venta de cada cobro, sus impresiones y su anulación, de
-- solo-agregar. Y la cortesía pasa a ser un cambio propio de la cuenta, con su autorización.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La venta ─────────────────────────────────────────────────────────────────
-- Las columnas no admiten nulos donde hay IN: el IN no tiene nulo que colar.
ALTER TABLE sale ADD CONSTRAINT sale_currency CHECK (currency = 'USD');
ALTER TABLE sale ADD CONSTRAINT sale_total CHECK (total_minor >= 0);
ALTER TABLE sale ADD CONSTRAINT sale_order_number CHECK (order_number > 0);
ALTER TABLE sale ADD CONSTRAINT sale_cashier_name CHECK (length(btrim(cashier_name)) >= 2);
-- El contenido es la venta de su fila: su cuenta y su clave, y un total que no dice otra cosa.
ALTER TABLE sale ADD CONSTRAINT sale_contenido CHECK (
  jsonb_typeof(content) = 'object'
  AND content->>'accountId' = account_id::text
  AND content->>'cobroKey' = operation_key::text
  AND content #>> '{total,minor}' = total_minor::text);

SELECT l2_aislar_por_tenant('sale');
SELECT l2_solo_agregar('sale');

-- Una venta entra en un turno abierto de su sucursal (I-14), como el dinero que la paga.
CREATE FUNCTION l2_venta_en_turno_abierto() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t cash_shift%ROWTYPE;
BEGIN
  SELECT * INTO t FROM cash_shift WHERE tenant_id = NEW.tenant_id AND id = NEW.shift_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF t.status = 'CERRADO_Z' OR t.branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION 'sale: el turno % no admite ventas (cerrado con corte Z o de otra sucursal)', NEW.shift_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_en_turno_abierto BEFORE INSERT ON sale
  FOR EACH ROW EXECUTE FUNCTION l2_venta_en_turno_abierto();

-- ── Sus impresiones ──────────────────────────────────────────────────────────
ALTER TABLE sale_print ADD CONSTRAINT sale_print_printed_by_name CHECK (length(btrim(printed_by_name)) >= 2);

SELECT l2_aislar_por_tenant('sale_print');
SELECT l2_solo_agregar('sale_print');

-- ── Su anulación ─────────────────────────────────────────────────────────────
ALTER TABLE sale_void ADD CONSTRAINT sale_void_reason CHECK (reason IN ('ERROR_EN_COBRO', 'CLIENTE_DESISTIO', 'NO_ENTREGADO', 'OTRO'));
ALTER TABLE sale_void ADD CONSTRAINT sale_void_role CHECK (authorized_by_role IN ('ADMIN', 'SUPERVISOR'));
ALTER TABLE sale_void ADD CONSTRAINT sale_void_otro CHECK (reason <> 'OTRO' OR length(btrim(coalesce(note, ''))) >= 3);
ALTER TABLE sale_void ADD CONSTRAINT sale_void_nombres CHECK (
  length(btrim(requested_by_name)) >= 2 AND length(btrim(authorized_by_name)) >= 2);
-- §7.6: la referencia de una devolución solo se guarda cifrada (`referenceCipher`), nunca en claro.
ALTER TABLE sale_void ADD CONSTRAINT sale_void_refunds CHECK (
  jsonb_typeof(refunds) = 'array' AND NOT jsonb_path_exists(refunds, '$[*].reference'));

SELECT l2_aislar_por_tenant('sale_void');
SELECT l2_solo_agregar('sale_void');

-- ── La cortesía, un cambio propio de la cuenta ───────────────────────────────
-- Como el cobro y la anulación, lleva la clave de su operación: un reintento no la aplica dos veces.
ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA'));
