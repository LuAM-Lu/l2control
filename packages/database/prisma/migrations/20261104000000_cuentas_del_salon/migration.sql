-- B6-7 · Varias cuentas en una mesa y cuentas de pie (M-27, P-2 y P-3).
-- Solo EXPANDE (ADR-028): la versión anterior sigue funcionando con la base nueva.
--   · Una mesa admite varias cuentas abiertas: eso lo decide la aplicación (I-05 vivía allí, con el candado
--     de las mesas), no hay restricción de la base que relajar. Lo que cambia en la cuenta va en su JSON
--     (`comensales`, `dePie`), que la versión anterior ignora.
--   · Un pedido de una cuenta de pie no tiene mesa: `kitchen_order.table_id` admite nulo, y el pedido guarda
--     el nombre de su cuenta (`account_label`) para la comanda cuando la cuenta tiene uno propio.
BEGIN;

ALTER TABLE kitchen_order ALTER COLUMN table_id DROP NOT NULL;
ALTER TABLE kitchen_order ADD COLUMN account_label TEXT;

-- La comprobación se reescribe para decir lo que admite: sin mesa (de pie), o una mesa con su id. Un
-- CHECK sobre una columna que admite nulos deja pasar el nulo en silencio (MAESTRO §5): aquí se dice a
-- propósito. Sin mesa, el pedido tiene que decir de quién es.
ALTER TABLE kitchen_order DROP CONSTRAINT kitchen_order_datos;
ALTER TABLE kitchen_order ADD CONSTRAINT kitchen_order_datos CHECK (
  number > 0
  AND (table_id IS NULL OR length(btrim(table_id)) BETWEEN 1 AND 64)
  AND length(btrim(table_label)) BETWEEN 1 AND 20
  AND (account_label IS NULL OR length(btrim(account_label)) BETWEEN 2 AND 40)
  AND (table_id IS NOT NULL OR account_label IS NOT NULL)
  AND length(btrim(created_by_name)) >= 2
  AND jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 40);

COMMIT;
