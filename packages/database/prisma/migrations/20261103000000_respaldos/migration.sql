-- B7-4 · Respaldos fuera del VPS (M-26, PLAN §10.4).
-- Solo EXPANDE (ADR-028): dos tablas nuevas; la versión anterior no las lee.
--   backup_receiver  la PC del local que baja los respaldos: su nombre y la huella de su credencial
--   backup_copy      cada respaldo de la noche (o el intento que falló) y cuándo lo bajó esa PC
-- Los respaldos los escribe el guion del servidor (respaldar.sh, como superusuario); la web prepara la PC
-- desde el panel y anota la bajada que la PC confirma con la huella del archivo.
BEGIN;

-- CreateTable
CREATE TABLE "backup_receiver" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "secret_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_name" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_name" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "last_seen_from" TEXT,

    CONSTRAINT "backup_receiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_copy" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "made_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL,
    "file" TEXT,
    "bytes" BIGINT,
    "sha256" TEXT,
    "version" TEXT,
    "detail" TEXT,
    "downloaded_at" TIMESTAMPTZ(3),
    "downloaded_from" TEXT,
    "downloaded_by" UUID,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "backup_copy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "backup_receiver_tenant_id_id_key" ON "backup_receiver"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "backup_receiver_tenant_id_secret_sha256_key" ON "backup_receiver"("tenant_id", "secret_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "backup_copy_tenant_id_id_key" ON "backup_copy"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "backup_copy_tenant_id_file_key" ON "backup_copy"("tenant_id", "file");

-- CreateIndex
CREATE INDEX "backup_copy_tenant_id_made_at_idx" ON "backup_copy"("tenant_id", "made_at");

-- AddForeignKey
ALTER TABLE "backup_receiver" ADD CONSTRAINT "backup_receiver_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "backup_copy" ADD CONSTRAINT "backup_copy_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "backup_copy" ADD CONSTRAINT "backup_copy_tenant_id_downloaded_by_fkey" FOREIGN KEY ("tenant_id", "downloaded_by") REFERENCES "backup_receiver"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- La PC: un nombre que se reconoce, la huella de su credencial (la credencial no se guarda) y, retirada,
-- quién la retiró. Una sola en uso a la vez: preparar otra retira la anterior.
ALTER TABLE backup_receiver ADD CONSTRAINT backup_receiver_nombre CHECK (length(btrim(name)) BETWEEN 2 AND 60);
ALTER TABLE backup_receiver ADD CONSTRAINT backup_receiver_huella CHECK (secret_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE backup_receiver ADD CONSTRAINT backup_receiver_quien CHECK (length(btrim(created_by_name)) >= 2);
ALTER TABLE backup_receiver ADD CONSTRAINT backup_receiver_retirada CHECK (
  (revoked_at IS NULL) = (revoked_by_name IS NULL) AND (revoked_at IS NULL OR revoked_at >= created_at));
ALTER TABLE backup_receiver ADD CONSTRAINT backup_receiver_visto CHECK (
  (last_seen_from IS NULL OR last_seen_at IS NOT NULL) AND (last_seen_at IS NULL OR last_seen_at >= created_at));
CREATE UNIQUE INDEX backup_receiver_en_uso ON backup_receiver (tenant_id) WHERE revoked_at IS NULL;

ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_estado CHECK (state IN ('HECHO', 'FALLIDO'));
-- Uno hecho tiene su archivo, su tamaño y su huella; uno fallido, el motivo y ningún archivo.
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_hecho CHECK (
  (state = 'HECHO') = (file IS NOT NULL AND bytes IS NOT NULL AND sha256 IS NOT NULL)
  AND (state = 'HECHO' OR detail IS NOT NULL));
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_archivo CHECK (file IS NULL OR file ~ '^l2control-[0-9]{8}T[0-9]{6}Z\.l2r$');
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_tamano CHECK (bytes IS NULL OR bytes > 0);
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_huella CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_version CHECK (version IS NULL OR version ~ '^[0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6}$');
-- Solo se baja o se retira lo que existe, y después de hacerse; la bajada dice qué PC.
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_bajada CHECK (
  (downloaded_at IS NULL OR (state = 'HECHO' AND downloaded_at >= made_at))
  AND ((downloaded_at IS NULL) = (downloaded_by IS NULL))
  AND (downloaded_from IS NULL OR downloaded_at IS NOT NULL));
ALTER TABLE backup_copy ADD CONSTRAINT backup_copy_retirada CHECK (removed_at IS NULL OR (state = 'HECHO' AND removed_at >= made_at));

SELECT l2_aislar_por_tenant('backup_receiver');
SELECT l2_aislar_por_tenant('backup_copy');

-- Nada se borra (regla 5). De la PC, la aplicación solo la retira y anota cuándo se conectó; de un respaldo,
-- solo su bajada: lo demás lo escribe el servidor.
REVOKE UPDATE, DELETE ON backup_receiver FROM l2_app;
GRANT UPDATE (revoked_at, revoked_by_name, last_seen_at, last_seen_from) ON backup_receiver TO l2_app;
REVOKE UPDATE, DELETE ON backup_copy FROM l2_app;
GRANT UPDATE (downloaded_at, downloaded_from, downloaded_by) ON backup_copy TO l2_app;

COMMIT;
