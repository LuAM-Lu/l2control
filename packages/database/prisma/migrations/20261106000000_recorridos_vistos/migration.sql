-- T-12 · Ayuda dentro de la app y recorridos guiados (M-27, P-4).
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   user_tour_seen  qué recorrido guiado vio cada persona (y en qué versión del recorrido): el de una pantalla
--                   se enseña solo la primera vez que esa persona la abre. Es de la persona, no del equipo,
--                   porque los equipos del local son compartidos. Nada se borra; volver a verlo no añade otra fila.
BEGIN;

CREATE TABLE "user_tour_seen" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tour" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "seen_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_tour_seen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_tour_seen_tenant_id_id_key" ON "user_tour_seen"("tenant_id", "id");
CREATE UNIQUE INDEX "user_tour_seen_tenant_id_user_id_tour_version_key" ON "user_tour_seen"("tenant_id", "user_id", "tour", "version");

ALTER TABLE "user_tour_seen" ADD CONSTRAINT "user_tour_seen_tenant_id_user_id_fkey"
  FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano.
ALTER TABLE user_tour_seen ADD CONSTRAINT user_tour_seen_datos CHECK (
  tour ~ '^[a-z][a-z0-9-]{1,39}$' AND version BETWEEN 1 AND 999);

SELECT l2_aislar_por_tenant('user_tour_seen');
SELECT l2_solo_agregar('user_tour_seen');

COMMIT;
