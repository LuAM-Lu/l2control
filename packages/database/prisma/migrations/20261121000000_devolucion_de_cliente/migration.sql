-- B3-14 · Un cliente devuelve parte de lo que compró (M-34, S-4).
-- Solo EXPANDE (ADR-028): tablas y columnas nuevas, y los CHECK ampliados. La versión anterior no escribe nada de esto.
--   sale_return      la devolución: qué líneas de la venta, a dónde va cada una (estante o merma), lo que vuelve con su
--                    descuento, IVA e IGTF, el motivo, quién y quién autorizó. Solo agregar.
--   payment          un asiento nuevo, DEVOLUCION: parte de un cobro que vuelve por su mismo medio, negativo, citando el
--                    cobro original (`refunds_id`). La base impone que sea del mismo documento, medio, moneda y tasa, y
--                    que entre todas no pase de lo que entró. Un cobro con devoluciones ya no se revierte entero.
--   stock_movement   un movimiento nuevo, RETORNO: lo que vuelve al estante, al costo con que salió.
BEGIN;

-- ── La devolución ─────────────────────────────────────────────────────────────
CREATE TABLE "sale_return" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "operation_key" UUID NOT NULL,
    "returned_at" TIMESTAMPTZ(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotal_minor" BIGINT NOT NULL,
    "discount_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL,
    "igtf_minor" BIGINT NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "refunds" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID,
    "requested_by_name" TEXT NOT NULL,
    "authorized_by" UUID,
    "authorized_by_name" TEXT,
    "device_id" UUID,

    CONSTRAINT "sale_return_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_return_tenant_id_id_key" ON "sale_return"("tenant_id", "id");
CREATE UNIQUE INDEX "sale_return_tenant_id_operation_key_key" ON "sale_return"("tenant_id", "operation_key");
CREATE INDEX "sale_return_tenant_id_sale_id_idx" ON "sale_return"("tenant_id", "sale_id");
CREATE INDEX "sale_return_tenant_id_shift_id_returned_at_idx" ON "sale_return"("tenant_id", "shift_id", "returned_at");
ALTER TABLE "sale_return" ADD CONSTRAINT "sale_return_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sale_return" ADD CONSTRAINT "sale_return_tenant_id_sale_id_fkey"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sale"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sale_return" ADD CONSTRAINT "sale_return_tenant_id_shift_id_fkey"
  FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE sale_return ADD CONSTRAINT sale_return_datos CHECK (
  jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) >= 1
  AND jsonb_typeof(refunds) = 'array'
  AND subtotal_minor >= 0 AND discount_minor >= 0 AND tax_minor >= 0 AND igtf_minor >= 0 AND total_minor >= 0
  AND char_length(btrim(reason)) BETWEEN 3 AND 200
  AND char_length(btrim(requested_by_name)) >= 2
  AND (authorized_by IS NULL) = (authorized_by_name IS NULL)
);
SELECT l2_aislar_por_tenant('sale_return');
SELECT l2_solo_agregar('sale_return');

-- ── El libro: el asiento DEVOLUCION ──────────────────────────────────────────
ALTER TABLE "payment" ADD COLUMN "refunds_id" UUID;
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_refunds_id_fkey"
  FOREIGN KEY ("tenant_id", "refunds_id") REFERENCES "payment"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "payment_tenant_id_refunds_id_idx" ON "payment"("tenant_id", "refunds_id");

ALTER TABLE payment DROP CONSTRAINT payment_kind;
ALTER TABLE payment ADD CONSTRAINT payment_kind CHECK (kind IN ('COBRO', 'VUELTO', 'PROPINA', 'RESIDUO', 'DEVOLUCION'));
ALTER TABLE payment DROP CONSTRAINT payment_signo;
ALTER TABLE payment ADD CONSTRAINT payment_signo CHECK (
  (kind <> 'DEVOLUCION' AND refunds_id IS NULL AND reverses_id IS NULL AND amount_minor > 0 AND igtf_minor >= 0
      AND reason IS NULL AND reason_detail IS NULL)
  OR (kind <> 'DEVOLUCION' AND refunds_id IS NULL AND reverses_id IS NOT NULL AND amount_minor < 0 AND igtf_minor <= 0
      AND reason IS NOT NULL AND reason IN ('ERROR_EN_COBRO', 'CLIENTE_DESISTIO', 'NO_ENTREGADO', 'OTRO'))
  -- B3-14: parte de un cobro que vuelve; negativa, con su motivo escrito.
  OR (kind = 'DEVOLUCION' AND refunds_id IS NOT NULL AND reverses_id IS NULL AND amount_minor < 0 AND igtf_minor <= 0
      AND reason = 'DEVOLUCION' AND length(btrim(COALESCE(reason_detail, ''))) >= 3)
);

-- La devolución es del cobro original: mismo documento, sucursal, medio, moneda y tasa; entre todas, no más de lo que
-- entró; y de un cobro revertido, ninguna. Lo impone la base aunque el código se equivoque.
CREATE FUNCTION l2_devolucion_coherente() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o payment%ROWTYPE;
  devuelto bigint;
BEGIN
  IF NEW.kind <> 'DEVOLUCION' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM payment WHERE tenant_id = NEW.tenant_id AND id = NEW.refunds_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF o.kind <> 'COBRO' OR o.reverses_id IS NOT NULL
     OR o.document_id <> NEW.document_id OR o.branch_id <> NEW.branch_id
     OR o.method <> NEW.method OR o.currency <> NEW.currency
     OR o.rate_id IS DISTINCT FROM NEW.rate_id OR o.rate_value IS DISTINCT FROM NEW.rate_value THEN
    RAISE EXCEPTION 'payment %: una devolución es parte del cobro original, por su mismo medio', NEW.refunds_id
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM payment WHERE tenant_id = NEW.tenant_id AND reverses_id = o.id) THEN
    RAISE EXCEPTION 'payment %: ese cobro ya se revirtió', o.id USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM(-amount_minor), 0) INTO devuelto FROM payment
    WHERE tenant_id = NEW.tenant_id AND refunds_id = o.id AND kind = 'DEVOLUCION';
  IF devuelto + (-NEW.amount_minor) > o.amount_minor THEN
    RAISE EXCEPTION 'payment %: no se devuelve más de lo que entró', o.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_devolucion_coherente BEFORE INSERT ON payment
  FOR EACH ROW EXECUTE FUNCTION l2_devolucion_coherente();

-- Un cobro con devoluciones ya no se revierte entero (devolvería dos veces lo mismo).
CREATE FUNCTION l2_reversion_sin_devoluciones() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reverses_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM payment WHERE tenant_id = NEW.tenant_id AND refunds_id = NEW.reverses_id) THEN
    RAISE EXCEPTION 'payment %: ese cobro tiene devoluciones y no se revierte entero', NEW.reverses_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_reversion_sin_devoluciones BEFORE INSERT ON payment
  FOR EACH ROW EXECUTE FUNCTION l2_reversion_sin_devoluciones();

-- ── El inventario: lo que vuelve al estante ──────────────────────────────────
ALTER TABLE "stock_movement" ADD COLUMN "sale_return_id" UUID;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_sale_return_id_fkey"
  FOREIGN KEY ("tenant_id", "sale_return_id") REFERENCES "sale_return"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "stock_movement_tenant_id_sale_return_id_product_id_key" ON "stock_movement"("tenant_id", "sale_return_id", "product_id");

ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_tipo;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_tipo CHECK (
  (kind = 'VENTA' AND quantity < 0 AND value_minor <= 0
     AND account_id IS NOT NULL AND account_version IS NOT NULL
     AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL AND adjustment_id IS NULL)
  OR (kind = 'DEVOLUCION' AND quantity > 0 AND value_minor >= 0
     AND account_id IS NOT NULL AND account_version IS NOT NULL
     AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL AND adjustment_id IS NULL)
  OR (kind = 'ENTRADA' AND quantity > 0 AND value_minor >= 0
     AND account_id IS NULL AND account_version IS NULL AND adjustment_id IS NULL
     AND entry_id IS NOT NULL AND packs IS NOT NULL AND pack_size IS NOT NULL
     AND packs BETWEEN 1 AND 10000 AND pack_size BETWEEN 1 AND 1000 AND quantity = packs * pack_size)
  -- La salida solo saca; el ajuste de un conteo saca o mete, y su valor va con su signo.
  OR (kind = 'SALIDA' AND quantity < 0 AND value_minor <= 0
     AND adjustment_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL)
  OR (kind = 'AJUSTE' AND ((quantity > 0 AND value_minor >= 0) OR (quantity < 0 AND value_minor <= 0))
     AND adjustment_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL)
  -- B9-12: la anulación de una entrada saca lo que entró, a su costo.
  OR (kind = 'ANULACION' AND quantity < 0 AND value_minor <= 0
     AND entry_void_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL
     AND adjustment_id IS NULL)
  -- B3-14: lo que un cliente devuelve y vuelve al estante, al costo con que salió.
  OR (kind = 'RETORNO' AND quantity > 0 AND value_minor >= 0
     AND sale_return_id IS NOT NULL
     AND account_id IS NULL AND account_version IS NULL AND entry_id IS NULL AND packs IS NULL AND pack_size IS NULL
     AND adjustment_id IS NULL AND entry_void_id IS NULL)
);

COMMIT;
