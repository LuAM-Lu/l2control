-- B3-5: el disparador de `20261008000000_cortes` leía NEW.count_id también en shift_count, que no
-- tiene esa columna, y PL/pgSQL lo rechaza aunque la condición anterior sea falsa. Se separa por
-- tabla. Una migración aplicada no se edita: se corrige con otra.
CREATE OR REPLACE FUNCTION l2_turno_sin_sellar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t cash_shift%ROWTYPE;
  del_arqueo uuid;
BEGIN
  SELECT * INTO t FROM cash_shift WHERE tenant_id = NEW.tenant_id AND id = NEW.shift_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF t.status = 'CERRADO_Z' THEN
    RAISE EXCEPTION '%: el turno % ya tiene corte Z y nada lo toca (F4-06)', TG_TABLE_NAME, NEW.shift_id
      USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'shift_cut' THEN
    -- El arqueo de un Z es de su turno. `to_jsonb` lee la columna sin nombrarla en shift_count.
    SELECT c.shift_id INTO del_arqueo FROM shift_count c
     WHERE c.tenant_id = NEW.tenant_id AND c.id = (to_jsonb(NEW) ->> 'count_id')::uuid;
    IF FOUND AND del_arqueo <> NEW.shift_id THEN
      RAISE EXCEPTION 'shift_cut: el arqueo es de otro turno' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
