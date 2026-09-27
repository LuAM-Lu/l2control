-- CreateTable
CREATE TABLE "tax_rate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tax" TEXT NOT NULL,
    "code" TEXT,
    "basis_points" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_by" UUID,
    "scheduled_by_name" TEXT NOT NULL,

    CONSTRAINT "tax_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_rate_tenant_id_tax_effective_from_idx" ON "tax_rate"("tenant_id", "tax", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rate_tenant_id_id_key" ON "tax_rate"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "tax_rate" ADD CONSTRAINT "tax_rate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B2-2, F3-06): alícuotas con vigencia, de solo-agregar.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE tax_rate ADD CONSTRAINT tax_rate_tax CHECK (tax IN ('IVA', 'IGTF'));
-- El IVA lleva su trato; el IGTF grava el medio de pago y no tiene. Lo exento no se guarda: es
-- cero por definición, y una fila «EXENTA al 8 %» acabaría cobrándose.
ALTER TABLE tax_rate ADD CONSTRAINT tax_rate_code CHECK (
  (tax = 'IVA' AND code IN ('GENERAL', 'REDUCIDA')) OR (tax = 'IGTF' AND code IS NULL));
-- Puntos básicos entre 0 y el 100 %; un IGTF del 100 % no tendría pago que se cubra a sí mismo.
ALTER TABLE tax_rate ADD CONSTRAINT tax_rate_basis_points CHECK (
  basis_points >= 0 AND basis_points <= 10000 AND (tax <> 'IGTF' OR basis_points < 10000));
-- F3-06: cambiar una alícuota no altera lo ya calculado. Nada empieza antes de programarse.
ALTER TABLE tax_rate ADD CONSTRAINT tax_rate_no_hacia_atras CHECK (effective_from >= scheduled_at);
ALTER TABLE tax_rate ADD CONSTRAINT tax_rate_scheduled_by_name CHECK (length(btrim(scheduled_by_name)) >= 2);
-- Dos programaciones del mismo impuesto en el mismo instante no se ordenan: la segunda se rechaza.
CREATE UNIQUE INDEX tax_rate_una_por_instante ON tax_rate (tenant_id, tax, COALESCE(code, ''), scheduled_at);

SELECT l2_aislar_por_tenant('tax_rate');
-- Regla 5: lo programado no se edita ni se borra. Para corregir una alícuota futura se programa
-- otra para el mismo día; manda la última.
SELECT l2_solo_agregar('tax_rate');
