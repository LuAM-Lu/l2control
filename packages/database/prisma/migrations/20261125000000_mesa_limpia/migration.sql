-- B6-14 · Por limpiar en la base (M-35, R-8). Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   dining_table_cleaned  cuándo y quién dejó limpia una mesa. «Por limpiar» no se guarda: se calcula (la mesa sin
--                         cuentas abiertas cuya última cuenta de hoy se cerró después de su última limpieza). Antes
--                         viajaba por el canal en vivo y se perdía si el servidor se reiniciaba. Nada se corrige ni se borra.
BEGIN;

CREATE TABLE "dining_table_cleaned" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" TEXT NOT NULL,
    "cleaned_at" TIMESTAMPTZ(3) NOT NULL,
    "by" UUID,
    "by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "dining_table_cleaned_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dining_table_cleaned_tenant_id_id_key" ON "dining_table_cleaned"("tenant_id", "id");
CREATE INDEX "dining_table_cleaned_tenant_id_branch_id_table_id_cleaned_at_idx" ON "dining_table_cleaned"("tenant_id", "branch_id", "table_id", "cleaned_at");

ALTER TABLE "dining_table_cleaned" ADD CONSTRAINT "dining_table_cleaned_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE dining_table_cleaned ADD CONSTRAINT dining_table_cleaned_datos CHECK (
  char_length(table_id) BETWEEN 1 AND 64 AND char_length(by_name) BETWEEN 1 AND 120);

SELECT l2_aislar_por_tenant('dining_table_cleaned');
SELECT l2_solo_agregar('dining_table_cleaned');

COMMIT;
