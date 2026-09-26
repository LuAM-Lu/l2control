-- El rechazo de solo-agregar usaba el SQLSTATE 23001 (restrict_violation), y Prisma lo
-- presenta como «Foreign key constraint violated»: un mensaje falso para quien lo lea. Se
-- cambia por un código propio, L2001, que no choca con ninguno de PostgreSQL y que
-- `errorDeBase()` traduce a SOLO_AGREGAR.
CREATE OR REPLACE FUNCTION l2_rechazar_cambios() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % solo admite filas nuevas: % no está permitido (regla 5).', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'L2001';
END
$$;
