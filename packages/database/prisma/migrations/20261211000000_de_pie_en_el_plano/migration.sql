-- B6-19 · De pie en el plano (M-39, X-10). Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   · standing_account_position  dónde está en el plano del mesero el icono de una cuenta de pie, y si está fijo (con su
--                                candado). Moverlo no cambia la cuenta: no le sube la versión ni choca con la caja. Vale
--                                la última fila de cada cuenta; nada se corrige ni se borra.
BEGIN;

CREATE TABLE "standing_account_position" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "by" UUID,
    "by_name" TEXT NOT NULL,
    "device_id" UUID,

    CONSTRAINT "standing_account_position_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "standing_account_position_tenant_id_id_key" ON "standing_account_position"("tenant_id", "id");
CREATE INDEX "standing_account_position_cuenta_idx" ON "standing_account_position"("tenant_id", "branch_id", "account_id", "at");

ALTER TABLE "standing_account_position" ADD CONSTRAINT "standing_account_position_tenant_id_account_id_fkey"
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano: dentro de un plano (en cm) y con quién lo movió.
ALTER TABLE standing_account_position ADD CONSTRAINT standing_account_position_datos CHECK (
  x BETWEEN 0 AND 100000 AND y BETWEEN 0 AND 100000 AND length(btrim(by_name)) >= 2);

SELECT l2_aislar_por_tenant('standing_account_position');
SELECT l2_solo_agregar('standing_account_position');

COMMIT;
