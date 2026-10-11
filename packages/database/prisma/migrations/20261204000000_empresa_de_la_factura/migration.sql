-- T-23 (M-38, W-12): la factura recuerda el RIF y la dirección fiscal de una empresa. Solo expande (ADR-028): una tabla
-- nueva que la versión anterior no lee. Solo empresas (RIF J- o G-): una cédula es de una persona y su ficha está en el
-- directorio. Solo agregar: lo último que se usó con un RIF es lo que se propone la vez siguiente.

BEGIN;

CREATE TABLE "invoice_company" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_key" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscal_address" TEXT,
    "set_at" TIMESTAMPTZ(3) NOT NULL,
    "set_by" UUID,
    "set_by_name" TEXT NOT NULL,

    CONSTRAINT "invoice_company_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_company_tenant_id_id_key" ON "invoice_company"("tenant_id", "id");
CREATE INDEX "invoice_company_tenant_id_document_key_set_at_idx" ON "invoice_company"("tenant_id", "document_key", "set_at");

ALTER TABLE invoice_company ADD CONSTRAINT invoice_company_datos CHECK (
  document_key ~ '^[JG][0-9]{8,9}$'
  AND char_length(btrim(name)) BETWEEN 2 AND 120
  AND (fiscal_address IS NULL OR char_length(fiscal_address) <= 200)
  AND char_length(btrim(set_by_name)) >= 2);

SELECT l2_aislar_por_tenant('invoice_company');
SELECT l2_solo_agregar('invoice_company');

COMMIT;
