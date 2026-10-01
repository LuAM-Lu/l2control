-- B6-1 · El plano del local y la carta del restaurante en el servidor (F6-01 a F6-03).
-- Una tabla nueva (versiones del plano, solo-agregar) y la marca «en la carta» del producto, que se
-- rellena: todo lo que había sale en la carta salvo los servicios. Va entera en una transacción, con
-- la RLS de `product` suspendida solo mientras rellena (§5).
BEGIN;

-- CreateTable
CREATE TABLE "floor_plan_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,
    "published_by_name" TEXT,

    CONSTRAINT "floor_plan_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "floor_plan_version_tenant_id_branch_id_version_key" ON "floor_plan_version"("tenant_id", "branch_id", "version");

-- AddForeignKey
ALTER TABLE "floor_plan_version" ADD CONSTRAINT "floor_plan_version_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN "on_menu" BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE floor_plan_version ADD CONSTRAINT floor_plan_version_version_positiva CHECK (version > 0);
-- El contenido es un objeto con sus mesas (el contrato lo valida entero al escribir y al leer).
ALTER TABLE floor_plan_version ADD CONSTRAINT floor_plan_version_contenido
  CHECK (jsonb_typeof(content) = 'object' AND jsonb_typeof(content->'tables') = 'array');
-- Un plano lo publica una persona, con su nombre.
ALTER TABLE floor_plan_version ADD CONSTRAINT floor_plan_version_autor
  CHECK (published_by IS NOT NULL AND length(btrim(published_by_name)) >= 2);

SELECT l2_aislar_por_tenant('floor_plan_version');
SELECT l2_solo_agregar('floor_plan_version');

-- Los servicios (alquiler, paquetes) no se ofrecen en las mesas; lo demás, sí.
ALTER TABLE product NO FORCE ROW LEVEL SECURITY;
UPDATE product SET on_menu = (kind <> 'SERVICIO');
ALTER TABLE product FORCE ROW LEVEL SECURITY;

COMMIT;
