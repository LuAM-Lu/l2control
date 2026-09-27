
-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "operation_key" UUID NOT NULL,
    "line" SMALLINT NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "igtf_minor" BIGINT NOT NULL,
    "rate_id" UUID,
    "rate_value" TEXT,
    "reverses_id" UUID,
    "reason" TEXT,
    "reason_detail" TEXT,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,
    "recorded_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_tenant_id_document_id_idx" ON "payment"("tenant_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenant_id_id_key" ON "payment"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenant_id_operation_key_line_key" ON "payment"("tenant_id", "operation_key", "line");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_rate_id_fkey" FOREIGN KEY ("tenant_id", "rate_id") REFERENCES "exchange_rate"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_reverses_id_fkey" FOREIGN KEY ("tenant_id", "reverses_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_recorded_by_fkey" FOREIGN KEY ("tenant_id", "recorded_by") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_authorized_by_fkey" FOREIGN KEY ("tenant_id", "authorized_by") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "device"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B2-3, §5.5, F3-09, F3-10): el libro de pagos, de solo-agregar.
-- Cuidado con los nulos: un CHECK desconocido pasa. Cada condición sobre una columna que admite
-- nulos dice explícitamente qué pasa con el nulo.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE payment ADD CONSTRAINT payment_kind CHECK (kind IN ('COBRO', 'VUELTO', 'PROPINA', 'RESIDUO'));
ALTER TABLE payment ADD CONSTRAINT payment_method CHECK (
  method IN ('EFECTIVO_USD', 'EFECTIVO_VES', 'PAGO_MOVIL', 'PDV_DEBITO', 'PDV_CREDITO', 'USDT', 'ZELLE'));
-- La moneda es del medio: un Zelle en bolívares no existe.
ALTER TABLE payment ADD CONSTRAINT payment_currency CHECK (currency = CASE method
  WHEN 'EFECTIVO_USD' THEN 'USD' WHEN 'ZELLE' THEN 'USD' WHEN 'USDT' THEN 'USDT' ELSE 'VES' END);
ALTER TABLE payment ADD CONSTRAINT payment_line CHECK (line >= 0 AND line < 20);

-- Un original es positivo y sin motivo; una reversión, negativa y con motivo de la lista (DEC-24).
ALTER TABLE payment ADD CONSTRAINT payment_signo CHECK (
  (reverses_id IS NULL AND amount_minor > 0 AND igtf_minor >= 0 AND reason IS NULL AND reason_detail IS NULL)
  OR (reverses_id IS NOT NULL AND amount_minor < 0 AND igtf_minor <= 0 AND reason IS NOT NULL
      AND reason IN ('ERROR_EN_COBRO', 'CLIENTE_DESISTIO', 'NO_ENTREGADO', 'OTRO')));
-- «Otro» exige explicarlo.
ALTER TABLE payment ADD CONSTRAINT payment_otro_explicado CHECK (
  reason IS DISTINCT FROM 'OTRO' OR length(btrim(COALESCE(reason_detail, ''))) >= 3);
-- El IGTF grava el cobro, no el vuelto, la propina ni el residuo.
ALTER TABLE payment ADD CONSTRAINT payment_igtf_solo_en_cobro CHECK (kind = 'COBRO' OR igtf_minor = 0);
-- El vuelto es efectivo que sale de la gaveta (§5.6).
ALTER TABLE payment ADD CONSTRAINT payment_vuelto_en_efectivo CHECK (
  kind <> 'VUELTO' OR method IN ('EFECTIVO_USD', 'EFECTIVO_VES'));

-- ADR-005: los bolívares llevan su tasa congelada, con su valor copiado; lo demás, ninguna.
ALTER TABLE payment ADD CONSTRAINT payment_tasa CHECK (
  (rate_id IS NULL) = (rate_value IS NULL) AND (currency = 'VES') = (rate_id IS NOT NULL));
ALTER TABLE payment ADD CONSTRAINT payment_rate_value CHECK (
  rate_value IS NULL OR (rate_value ~ '^[0-9]+(\.[0-9]+)?$' AND rate_value ~ '[1-9]' AND length(rate_value) <= 24));

ALTER TABLE payment ADD CONSTRAINT payment_recorded_by_name CHECK (length(btrim(recorded_by_name)) >= 2);
ALTER TABLE payment ADD CONSTRAINT payment_authorized CHECK ((authorized_by IS NULL) = (authorized_by_name IS NULL));

-- F3-10: un asiento se revierte una sola vez.
CREATE UNIQUE INDEX payment_una_reversion ON payment (tenant_id, reverses_id) WHERE reverses_id IS NOT NULL;

-- F3-10: una reversión es el original con el signo contrario, en el mismo documento, con el mismo
-- medio y la misma tasa congelada; y una reversión no se revierte. Lo impone la base aunque el
-- código se equivoque.
CREATE FUNCTION l2_reversion_coherente() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o payment%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM payment WHERE tenant_id = NEW.tenant_id AND id = NEW.reverses_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF o.reverses_id IS NOT NULL
     OR o.document_id <> NEW.document_id OR o.branch_id <> NEW.branch_id
     OR o.kind <> NEW.kind OR o.method <> NEW.method OR o.currency <> NEW.currency
     OR NEW.amount_minor <> -o.amount_minor OR NEW.igtf_minor <> -o.igtf_minor
     OR o.rate_id IS DISTINCT FROM NEW.rate_id OR o.rate_value IS DISTINCT FROM NEW.rate_value THEN
    RAISE EXCEPTION 'payment %: una reversión es el asiento original con el signo contrario', NEW.reverses_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_reversion_coherente BEFORE INSERT ON payment
  FOR EACH ROW EXECUTE FUNCTION l2_reversion_coherente();

SELECT l2_aislar_por_tenant('payment');
-- I-09: un asiento no se edita ni se borra.
SELECT l2_solo_agregar('payment');
