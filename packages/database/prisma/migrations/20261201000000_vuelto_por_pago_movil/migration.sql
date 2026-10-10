-- B3-19 (M-37, U-12): el vuelto, por partes. Expandir (ADR-028): una regla se afloja; la versión anterior sigue
-- escribiendo lo que escribía.
--   · Un VUELTO sale de un medio que da vuelto (el efectivo) o, ahora, por Pago Móvil desde la cuenta del local: así se
--     da en Venezuela cuando no hay billetes. Por punto, Zelle o USDT, no. Su referencia va cifrada en la venta: el
--     asiento solo lleva la del cobro (payment_referencia).

CREATE OR REPLACE FUNCTION l2_asiento_del_medio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  m payment_method%ROWTYPE;
  t pos_terminal%ROWTYPE;
BEGIN
  SELECT * INTO m FROM payment_method WHERE tenant_id = NEW.tenant_id AND code = NEW.method;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF NEW.kind = 'VUELTO' AND NOT m.gives_change AND m.data_kind IS DISTINCT FROM 'PAGO_MOVIL' THEN
    RAISE EXCEPTION 'payment: el vuelto sale de la gaveta o por Pago Móvil, y % no da vuelto', NEW.method USING ERRCODE = '23514';
  END IF;
  IF NEW.kind <> 'COBRO' OR NEW.reverses_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT m.active THEN
    RAISE EXCEPTION 'payment: el medio % está apagado', NEW.method USING ERRCODE = '23514';
  END IF;
  IF (m.data_kind IS NOT NULL) <> (NEW.reference_cipher IS NOT NULL) THEN
    RAISE EXCEPTION 'payment: un cobro con % lleva los datos que su medio pide, y solo esos', NEW.method USING ERRCODE = '23514';
  END IF;
  IF (m.data_kind IS NOT DISTINCT FROM 'PUNTO') <> (NEW.terminal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'payment: un cobro con punto de venta dice su terminal, y ningún otro lo dice' USING ERRCODE = '23514';
  END IF;
  IF NEW.terminal_id IS NOT NULL THEN
    SELECT * INTO t FROM pos_terminal WHERE tenant_id = NEW.tenant_id AND id = NEW.terminal_id;
    IF FOUND AND t.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'payment: el terminal % está retirado', NEW.terminal_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
