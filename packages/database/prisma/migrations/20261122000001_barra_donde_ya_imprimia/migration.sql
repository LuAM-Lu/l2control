-- B6-10: la impresora que ya imprimía las comandas imprime también las de barra hasta que se repartan. El relleno de la
-- migración anterior no tocaba ninguna fila: `printer` tiene la RLS forzada. Aquí, como en `punto_de_cobro`, el dueño la
-- suspende solo mientras rellena, dentro de esta misma transacción. Solo expande (ADR-028).
BEGIN;

ALTER TABLE printer NO FORCE ROW LEVEL SECURITY;
-- Una retirada no se toca (su disparador lo impide) ni vuelve a imprimir.
UPDATE printer SET for_bar_orders = true WHERE for_orders AND NOT for_bar_orders AND retired_at IS NULL;
ALTER TABLE printer FORCE ROW LEVEL SECURITY;

COMMIT;
