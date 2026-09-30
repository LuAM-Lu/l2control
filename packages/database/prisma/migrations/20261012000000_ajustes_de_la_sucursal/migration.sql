-- ═══════════════════════════════════════════════════════════════════════════
-- Ajustes de la sucursal (B4-4, F5-08b): formato de hora, zona horaria, horario, residuo, umbral
-- del arqueo, horas de una huérfana y servicio, hasta ahora en el código o en el navegador.
--
-- Publicar añade una versión, como el tarifario; la vigente es la más alta. No se rellena nada:
-- sin versión, el servidor usa los valores de fábrica (los que el código usaba), y el RIF, la
-- dirección y el horario quedan sin declarar hasta que el cliente los dé (F0-04).
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "branch_settings_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,
    "published_by_name" TEXT,

    CONSTRAINT "branch_settings_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_settings_version_tenant_id_branch_id_version_key" ON "branch_settings_version"("tenant_id", "branch_id", "version");

-- AddForeignKey
ALTER TABLE "branch_settings_version" ADD CONSTRAINT "branch_settings_version_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE branch_settings_version ADD CONSTRAINT branch_settings_version_version_positiva CHECK (version > 0);
-- El contenido es un objeto (el contrato lo valida entero al escribir y al leer).
ALTER TABLE branch_settings_version ADD CONSTRAINT branch_settings_version_contenido_objeto CHECK (jsonb_typeof(content) = 'object');
-- Quién publicó: o las dos cosas o ninguna (una operación del sistema no tiene persona).
ALTER TABLE branch_settings_version ADD CONSTRAINT branch_settings_version_autor_completo
  CHECK ((published_by IS NULL) = (published_by_name IS NULL));

SELECT l2_aislar_por_tenant('branch_settings_version');
SELECT l2_solo_agregar('branch_settings_version');
