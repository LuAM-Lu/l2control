-- B7-6 · Respaldos con carpeta, fijados e integridad a la vista (M-29).
-- Solo EXPANDE (ADR-028): dos tablas nuevas y tres columnas que admiten nulo, que la versión anterior no lee.
--   backup_pin        un respaldo fijado con su nombre («antes de producción»): ni la retención del servidor ni la
--                     escalera de la PC del local lo borran. Se suelta una vez; no se borra ni se reescribe.
--   backup_rehearsal  el ensayo de restauración del volcado de una noche en una base de usar y tirar (lo hace
--                     respaldar.sh una vez por semana): íntegro, o qué falló. Solo se agrega.
--   backup_receiver   la carpeta donde guarda la PC, de qué tipo es (en esa PC, un disco externo o una carpeta en la
--                     nube) y la versión de su programa, como los dice la propia PC al conectarse.
BEGIN;

CREATE TABLE "backup_pin" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pinned_at" TIMESTAMPTZ(3) NOT NULL,
    "pinned_by" UUID,
    "pinned_by_name" TEXT NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "released_by_name" TEXT,

    CONSTRAINT "backup_pin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backup_rehearsal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "intact" BOOLEAN NOT NULL,
    "seconds" INTEGER,
    "detail" TEXT,

    CONSTRAINT "backup_rehearsal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "backup_receiver" ADD COLUMN "folder" TEXT;
ALTER TABLE "backup_receiver" ADD COLUMN "folder_kind" TEXT;
ALTER TABLE "backup_receiver" ADD COLUMN "program_version" INTEGER;

CREATE UNIQUE INDEX "backup_pin_tenant_id_id_key" ON "backup_pin"("tenant_id", "id");
CREATE UNIQUE INDEX "backup_rehearsal_tenant_id_id_key" ON "backup_rehearsal"("tenant_id", "id");
CREATE INDEX "backup_rehearsal_tenant_id_at_idx" ON "backup_rehearsal"("tenant_id", "at");

ALTER TABLE "backup_pin" ADD CONSTRAINT "backup_pin_tenant_id_copy_id_fkey"
  FOREIGN KEY ("tenant_id", "copy_id") REFERENCES "backup_copy"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "backup_rehearsal" ADD CONSTRAINT "backup_rehearsal_tenant_id_copy_id_fkey"
  FOREIGN KEY ("tenant_id", "copy_id") REFERENCES "backup_copy"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
-- Un respaldo tiene a lo sumo un fijado vigente.
CREATE UNIQUE INDEX backup_pin_vigente ON backup_pin (tenant_id, copy_id) WHERE released_at IS NULL;
ALTER TABLE backup_pin ADD CONSTRAINT backup_pin_datos CHECK (
  length(btrim(name)) BETWEEN 2 AND 40
  AND length(btrim(pinned_by_name)) >= 2
  AND (released_at IS NULL) = (released_by_name IS NULL)
  AND (released_at IS NULL OR released_at >= pinned_at)
);
ALTER TABLE backup_rehearsal ADD CONSTRAINT backup_rehearsal_datos CHECK (
  (seconds IS NULL OR seconds >= 0)
  -- Lo que falló dice por qué.
  AND (intact OR length(btrim(coalesce(detail, ''))) > 0)
);
ALTER TABLE backup_receiver ADD CONSTRAINT backup_receiver_carpeta CHECK (
  (folder IS NULL OR length(folder) BETWEEN 1 AND 260)
  AND (folder_kind IS NULL OR folder_kind IN ('EN_LA_PC', 'EXTERNO', 'NUBE'))
  AND (program_version IS NULL OR program_version > 0)
);

-- Un fijado no se borra ni se reescribe: solo se suelta, una vez (como un descuento se retira).
CREATE FUNCTION l2_fijado_solo_se_suelta() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.released_at IS NOT NULL
     OR (NEW.id, NEW.tenant_id, NEW.copy_id, NEW.name, NEW.pinned_at, NEW.pinned_by, NEW.pinned_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.copy_id, OLD.name, OLD.pinned_at, OLD.pinned_by, OLD.pinned_by_name) THEN
    RAISE EXCEPTION 'La tabla backup_pin solo admite fijar y soltar una vez: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER backup_pin_solo_se_suelta BEFORE UPDATE OR DELETE ON backup_pin
  FOR EACH ROW EXECUTE FUNCTION l2_fijado_solo_se_suelta();
CREATE TRIGGER backup_pin_no_se_vacia BEFORE TRUNCATE ON backup_pin
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();

SELECT l2_aislar_por_tenant('backup_pin');
SELECT l2_aislar_por_tenant('backup_rehearsal');
SELECT l2_solo_agregar('backup_rehearsal');

-- De la PC, la aplicación anota además lo que la PC dice de sí misma (como cuándo se conectó). Del fijado, solo
-- soltarlo. El ensayo lo escribe el servidor (respaldar.sh), como el respaldo; nadie lo cambia (solo-agregar).
GRANT UPDATE (folder, folder_kind, program_version) ON backup_receiver TO l2_app;
REVOKE UPDATE, DELETE ON backup_pin FROM l2_app;
GRANT UPDATE (released_at, released_by_name) ON backup_pin TO l2_app;

COMMIT;
