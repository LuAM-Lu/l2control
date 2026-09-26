-- DropForeignKey
ALTER TABLE "branch" DROP CONSTRAINT "branch_tenant_id_fkey";

-- CreateTable
CREATE TABLE "park_tariff_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,

    CONSTRAINT "park_tariff_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "park_tariff_version_tenant_id_branch_id_version_key" ON "park_tariff_version"("tenant_id", "branch_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "branch_tenant_id_id_key" ON "branch"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "park_tariff_version" ADD CONSTRAINT "park_tariff_version_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano: lo que Prisma no expresa.
-- ═══════════════════════════════════════════════════════════════════════════

-- Solo se añade (regla 5). Un disparador rechaza UPDATE y DELETE para TODOS, dueño
-- incluido: un error se corrige publicando otra versión, no reescribiendo esta. Se
-- reutiliza en toda tabla append-only (pagos, auditoría, movimientos de stock):
--   SELECT l2_solo_agregar('mi_tabla');
CREATE FUNCTION l2_rechazar_cambios() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % solo admite filas nuevas: % no está permitido (regla 5).', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE FUNCTION l2_solo_agregar(tabla regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER solo_agregar BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION l2_rechazar_cambios()',
    tabla);
  -- TRUNCATE no dispara triggers de fila: se le niega aparte.
  EXECUTE format(
    'CREATE TRIGGER solo_agregar_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios()',
    tabla);
END
$$;
REVOKE EXECUTE ON FUNCTION l2_solo_agregar(regclass) FROM PUBLIC;

ALTER TABLE park_tariff_version ADD CONSTRAINT park_tariff_version_version_positiva CHECK (version > 0);

SELECT l2_aislar_por_tenant('park_tariff_version');
SELECT l2_solo_agregar('park_tariff_version');
