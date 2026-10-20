-- T-25 · Clientes (M-40). Solo EXPANDE (ADR-028): la versión anterior no lee nada de esto y sigue funcionando.
--   · kid.retired_at, retired_by_name   un niño se retira de su familia (un error, o ya no viene): sus estancias lo
--                                       siguen nombrando; deja de salir para elegirlo en la entrada.
--   · guardian_merge                    la misma persona quedó dos veces en el directorio: la que se va pasa a la que
--                                       queda (sus niños, su historia), de solo agregar, una vez.
BEGIN;

ALTER TABLE "kid" ADD COLUMN "retired_at" TIMESTAMPTZ(3);
ALTER TABLE "kid" ADD COLUMN "retired_by_name" TEXT;

CREATE TABLE "guardian_merge" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "absorbed_id" UUID NOT NULL,
    "into_id" UUID NOT NULL,
    "merged_at" TIMESTAMPTZ(3) NOT NULL,
    "merged_by" UUID,
    "merged_by_name" TEXT NOT NULL,

    CONSTRAINT "guardian_merge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardian_merge_tenant_id_id_key" ON "guardian_merge"("tenant_id", "id");
CREATE UNIQUE INDEX "guardian_merge_tenant_id_absorbed_id_key" ON "guardian_merge"("tenant_id", "absorbed_id");
CREATE INDEX "guardian_merge_tenant_id_into_id_idx" ON "guardian_merge"("tenant_id", "into_id");

ALTER TABLE "guardian_merge" ADD CONSTRAINT "guardian_merge_tenant_id_absorbed_id_fkey"
  FOREIGN KEY ("tenant_id", "absorbed_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "guardian_merge" ADD CONSTRAINT "guardian_merge_tenant_id_into_id_fkey"
  FOREIGN KEY ("tenant_id", "into_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE kid ADD CONSTRAINT kid_retiro CHECK (
  (retired_at IS NULL) = (retired_by_name IS NULL)
  AND (retired_by_name IS NULL OR length(btrim(retired_by_name)) >= 2)
);
ALTER TABLE guardian_merge ADD CONSTRAINT guardian_merge_datos CHECK (
  absorbed_id <> into_id
  AND length(btrim(merged_by_name)) >= 2
);

SELECT l2_aislar_por_tenant('guardian_merge');
SELECT l2_solo_agregar('guardian_merge');

-- Un niño no cambia de familia (20261009010000_parque_disparador)... salvo que la suya se juntó con otra (T-25): pasa a la
-- que queda, y solo a esa.
CREATE OR REPLACE FUNCTION l2_nino_de_su_familia_siempre() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.guardian_id <> OLD.guardian_id AND NOT EXISTS (
    SELECT 1 FROM guardian_merge m
    WHERE m.tenant_id = OLD.tenant_id AND m.absorbed_id = OLD.guardian_id AND m.into_id = NEW.guardian_id
  ) THEN
    RAISE EXCEPTION 'kid %: un niño no cambia de familia', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
