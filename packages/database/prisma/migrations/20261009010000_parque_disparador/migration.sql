-- Corrige el disparador del directorio (20261009000000_parque): PL/pgSQL no deja leer
-- NEW.guardian_id en la tabla guardian, que no lo tiene, aunque la condición no llegue a usarlo.
-- Cada tabla tiene ahora su función.
CREATE OR REPLACE FUNCTION l2_directorio_se_corrige() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla % no admite DELETE: el directorio se corrige, no se borra (regla 5).', TG_TABLE_NAME
      USING ERRCODE = 'L2001';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION '%: solo se corrigen los datos, no quién es', TG_TABLE_NAME
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION l2_nino_de_su_familia_siempre() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.guardian_id <> OLD.guardian_id THEN
    RAISE EXCEPTION 'kid %: un niño no cambia de familia', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kid_no_cambia_de_familia BEFORE UPDATE ON kid
  FOR EACH ROW EXECUTE FUNCTION l2_nino_de_su_familia_siempre();
