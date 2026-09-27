-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pair" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_by" UUID,
    "captured_by_name" TEXT NOT NULL,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_confirmation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rate_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by" UUID,
    "confirmed_by_name" TEXT NOT NULL,
    "double_checked" BOOLEAN NOT NULL,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,

    CONSTRAINT "exchange_rate_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rate_tenant_id_pair_effective_date_idx" ON "exchange_rate"("tenant_id", "pair", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_tenant_id_id_key" ON "exchange_rate"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_tenant_id_pair_captured_at_key" ON "exchange_rate"("tenant_id", "pair", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_confirmation_tenant_id_rate_id_key" ON "exchange_rate_confirmation"("tenant_id", "rate_id");

-- AddForeignKey
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "exchange_rate_confirmation" ADD CONSTRAINT "exchange_rate_confirmation_tenant_id_rate_id_fkey" FOREIGN KEY ("tenant_id", "rate_id") REFERENCES "exchange_rate"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano: catálogos, forma del valor, aislamiento y solo-agregar.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE exchange_rate ADD CONSTRAINT exchange_rate_pair CHECK (pair IN ('USD/VES', 'USDT/VES'));
ALTER TABLE exchange_rate ADD CONSTRAINT exchange_rate_source CHECK (source IN ('BCV', 'MANUAL', 'COMERCIAL'));
-- §5.2 e I-03: CHECK value > 0. El valor es texto decimal exacto (dígitos y un punto) y al menos
-- un dígito distinto de cero: una tasa cero convierte cualquier cobro en cero.
ALTER TABLE exchange_rate ADD CONSTRAINT exchange_rate_value CHECK (
  value ~ '^[0-9]+(\.[0-9]+)?$' AND value ~ '[1-9]' AND length(value) <= 24);
ALTER TABLE exchange_rate ADD CONSTRAINT exchange_rate_captured_by_name
  CHECK (length(btrim(captured_by_name)) >= 2);

ALTER TABLE exchange_rate_confirmation ADD CONSTRAINT exchange_rate_confirmation_confirmed_by_name
  CHECK (length(btrim(confirmed_by_name)) >= 2);
-- Quien autorizó y su nombre van juntos o no van.
ALTER TABLE exchange_rate_confirmation ADD CONSTRAINT exchange_rate_confirmation_authorized
  CHECK ((authorized_by IS NULL) = (authorized_by_name IS NULL));

SELECT l2_aislar_por_tenant('exchange_rate');
SELECT l2_aislar_por_tenant('exchange_rate_confirmation');

-- Regla 5: ni la tasa ni su confirmación se reescriben. Cada pago citará la tasa con la que se
-- cobró (ADR-005), y el arqueo de ayer tiene que seguir cuadrando.
SELECT l2_solo_agregar('exchange_rate');
SELECT l2_solo_agregar('exchange_rate_confirmation');
