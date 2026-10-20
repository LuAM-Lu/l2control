-- B6-22 · Sentar «Más seguro» o «Más rápido» (M-40). Solo EXPANDE (ADR-028): el cliente de una cuenta y el de una deuda
-- pueden quedar sin cédula (sentado «Más rápido»: la cédula llega antes del segundo pedido o del cobro; si se va antes,
-- la deuda queda con su nombre) y sin teléfono («Solo si queda una deuda»). La versión anterior sigue escribiendo los
-- tres datos; lo que esta escribe sin ellos solo existe si administración elige «Más rápido» o «Solo si queda una deuda».
--   · account_customer  document, document_key, phone y phone_key admiten NULL: el dato y su llave van juntos.
--   · customer_debt     lo mismo.
BEGIN;

ALTER TABLE "account_customer" ALTER COLUMN "document" DROP NOT NULL,
  ALTER COLUMN "document_key" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "phone_key" DROP NOT NULL;

ALTER TABLE "customer_debt" ALTER COLUMN "document" DROP NOT NULL,
  ALTER COLUMN "document_key" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "phone_key" DROP NOT NULL;

-- Escrito a mano: las llaves, con su formato cuando están, y el dato con su llave.
ALTER TABLE account_customer DROP CONSTRAINT account_customer_datos;
ALTER TABLE account_customer ADD CONSTRAINT account_customer_datos CHECK (
  char_length(full_name) BETWEEN 2 AND 80
  AND (document IS NULL) = (document_key IS NULL)
  AND (document_key IS NULL OR document_key ~ '^[VEJPG][0-9]{5,10}$')
  AND (phone IS NULL) = (phone_key IS NULL)
  AND (phone_key IS NULL OR phone_key ~ '^0[0-9]{10}$')
  AND char_length(set_by_name) BETWEEN 1 AND 120
);

ALTER TABLE customer_debt DROP CONSTRAINT customer_debt_datos;
ALTER TABLE customer_debt ADD CONSTRAINT customer_debt_datos CHECK (
  amount_minor > 0
  AND currency = 'USD'
  AND char_length(full_name) BETWEEN 2 AND 80
  AND (document IS NULL) = (document_key IS NULL)
  AND (document_key IS NULL OR document_key ~ '^[VEJPG][0-9]{5,10}$')
  AND (phone IS NULL) = (phone_key IS NULL)
  AND (phone_key IS NULL OR phone_key ~ '^0[0-9]{10}$')
  AND char_length(seated_by_name) BETWEEN 1 AND 120
  AND char_length(marked_by_name) BETWEEN 1 AND 120
  AND (detail IS NULL OR char_length(detail) <= 200)
  AND (authorized_by IS NULL) = (authorized_by_name IS NULL)
);

COMMIT;
