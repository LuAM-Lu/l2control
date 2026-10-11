-- B3-22 · El fondo fijo, opcional (M-38, W-9). Solo EXPANDE (ADR-028): dos columnas nuevas en device y una tabla nueva
-- que la versión anterior no lee.
--   · device               el fondo fijo de una caja (un punto de cobro), en dólares y en bolívares; NULL, apagado (de
--                          fábrica). Encendido, el cierre propone dejarlo y retirar el resto, y la apertura se cuenta
--                          por billete contra lo que quedó.
--   · shift_opening_count  ese conteo de la apertura: los billetes, lo contado, lo que quedó en el último cierre de esa
--                          caja y la diferencia, a nombre de quien abre. Nada se corrige ni se borra.
BEGIN;

ALTER TABLE "device" ADD COLUMN "fixed_float_usd_minor" BIGINT;
ALTER TABLE "device" ADD COLUMN "fixed_float_ves_minor" BIGINT;

-- Escrito a mano: las dos monedas a la vez (encendido) o ninguna (apagado), sin negativos.
ALTER TABLE device ADD CONSTRAINT device_fondo_fijo CHECK (
  (fixed_float_usd_minor IS NULL) = (fixed_float_ves_minor IS NULL)
  AND (fixed_float_usd_minor IS NULL OR (fixed_float_usd_minor >= 0 AND fixed_float_ves_minor >= 0)));

CREATE TABLE "shift_opening_count" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "counts" JSONB NOT NULL,
    "counted" JSONB NOT NULL,
    "left_in_drawer" JSONB NOT NULL,
    "differences" JSONB NOT NULL,
    "matches" BOOLEAN NOT NULL,
    "counted_at" TIMESTAMPTZ(3) NOT NULL,
    "counted_by" UUID,
    "counted_by_name" TEXT NOT NULL,

    CONSTRAINT "shift_opening_count_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_opening_count_tenant_id_id_key" ON "shift_opening_count"("tenant_id", "id");
CREATE UNIQUE INDEX "shift_opening_count_tenant_id_shift_id_key" ON "shift_opening_count"("tenant_id", "shift_id");

ALTER TABLE "shift_opening_count" ADD CONSTRAINT "shift_opening_count_tenant_id_shift_id_fkey"
  FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE shift_opening_count ADD CONSTRAINT shift_opening_count_datos CHECK (
  jsonb_typeof(counts) = 'array' AND jsonb_typeof(counted) = 'array'
  AND jsonb_typeof(left_in_drawer) = 'array' AND jsonb_typeof(differences) = 'array'
  AND char_length(btrim(counted_by_name)) BETWEEN 2 AND 120);

SELECT l2_aislar_por_tenant('shift_opening_count');
SELECT l2_solo_agregar('shift_opening_count');

COMMIT;
