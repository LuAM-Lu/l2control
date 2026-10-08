-- B6-9 · El cliente de la cuenta: nombre, cédula y teléfono (M-33).
-- Solo EXPANDE (ADR-028): dos columnas nulas y una tabla nueva que la versión anterior no lee.
--   guardian.document      el directorio de representantes pasa a ser el de clientes y gana la cédula (o el RIF), tal
--                          como se escribe («V-12345678»); `document_key` es la llave sin separadores («V12345678»),
--                          única por local. Nulas: los representantes que ya existen no la tienen, y la entrada al
--                          parque sigue sin pedirla (DEC-9).
--   account_customer       a quién es una cuenta del salón o del mostrador: nombre, cédula y teléfono, y el cliente del
--                          directorio si se reconoció. Solo agregar: cambiarlo añade una fila y la vigente es la última,
--                          fuera del contenido de la cuenta para que una versión anterior no la pierda al guardarla.
BEGIN;

ALTER TABLE "guardian" ADD COLUMN "document" TEXT, ADD COLUMN "document_key" TEXT;
CREATE UNIQUE INDEX "guardian_tenant_id_document_key_key" ON "guardian"("tenant_id", "document_key");

CREATE TABLE "account_customer" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "guardian_id" UUID,
    "full_name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "document_key" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_key" TEXT NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL,
    "set_by" UUID,
    "set_by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "account_customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_customer_tenant_id_id_key" ON "account_customer"("tenant_id", "id");
CREATE INDEX "account_customer_tenant_id_account_id_set_at_idx" ON "account_customer"("tenant_id", "account_id", "set_at");
CREATE INDEX "account_customer_tenant_id_document_key_idx" ON "account_customer"("tenant_id", "document_key");
CREATE INDEX "account_customer_tenant_id_phone_key_idx" ON "account_customer"("tenant_id", "phone_key");

ALTER TABLE "account_customer" ADD CONSTRAINT "account_customer_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "account_customer" ADD CONSTRAINT "account_customer_tenant_id_guardian_id_fkey"
  FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE guardian ADD CONSTRAINT guardian_documento CHECK (
  (document IS NULL) = (document_key IS NULL)
  AND (document_key IS NULL OR document_key ~ '^[VEJPG][0-9]{5,10}$')
);
ALTER TABLE account_customer ADD CONSTRAINT account_customer_datos CHECK (
  char_length(full_name) BETWEEN 2 AND 80
  AND document_key ~ '^[VEJPG][0-9]{5,10}$'
  AND phone_key ~ '^0[0-9]{10}$'
  AND char_length(set_by_name) BETWEEN 1 AND 120
);

SELECT l2_aislar_por_tenant('account_customer');
SELECT l2_solo_agregar('account_customer');

COMMIT;
