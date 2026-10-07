-- T-9 · Confirmar identidad desde cualquier equipo (ADR-029, M-23).
-- Solo EXPANDE (ADR-028): dos tablas nuevas y ninguna columna tocada; la versión anterior sigue funcionando
-- con esta base. `staff_user.totp_secret_enc` sigue sin uso: el TOTP nuevo vive en su propia tabla, con el
-- último intervalo aceptado para que un código no valga dos veces.
--   trusted_device   el equipo de confianza de una persona de administración: en él, solo la contraseña
--   totp_credential  la app de autenticación de una persona: su secreto cifrado y el último código aceptado
BEGIN;

-- CreateTable
CREATE TABLE "trusted_device" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_name" TEXT,

    CONSTRAINT "trusted_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "totp_credential" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(3),
    "last_step" BIGINT,
    "last_used_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "totp_credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trusted_device_tenant_id_user_id_idx" ON "trusted_device"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "trusted_device_tenant_id_device_id_idx" ON "trusted_device"("tenant_id", "device_id");

-- CreateIndex
CREATE INDEX "totp_credential_tenant_id_user_id_idx" ON "totp_credential"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "trusted_device" ADD CONSTRAINT "trusted_device_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trusted_device" ADD CONSTRAINT "trusted_device_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "device"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "totp_credential" ADD CONSTRAINT "totp_credential_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trusted_device ADD CONSTRAINT trusted_device_motivo CHECK (length(btrim(reason)) >= 2 AND length(reason) <= 200);
ALTER TABLE trusted_device ADD CONSTRAINT trusted_device_fechas CHECK (revoked_at IS NULL OR revoked_at >= created_at);
-- Retirada consta quién la retiró; vigente, nadie.
ALTER TABLE trusted_device ADD CONSTRAINT trusted_device_retiro CHECK (
  (revoked_at IS NULL) = (revoked_by_name IS NULL)
  AND (revoked_by_name IS NULL OR length(btrim(revoked_by_name)) >= 2));
-- Una sola confianza vigente por persona y equipo.
CREATE UNIQUE INDEX trusted_device_vigente ON trusted_device (tenant_id, user_id, device_id) WHERE revoked_at IS NULL;

-- El secreto viaja cifrado con el formato del cifrador de la aplicación (nunca en claro).
ALTER TABLE totp_credential ADD CONSTRAINT totp_credential_cifrado CHECK (secret_enc LIKE 'v1.%' AND length(secret_enc) BETWEEN 24 AND 400);
ALTER TABLE totp_credential ADD CONSTRAINT totp_credential_paso CHECK (last_step IS NULL OR last_step >= 0);
ALTER TABLE totp_credential ADD CONSTRAINT totp_credential_fechas CHECK (
  (confirmed_at IS NULL OR confirmed_at >= created_at)
  AND (retired_at IS NULL OR retired_at >= created_at)
  AND (last_used_at IS NULL OR last_used_at >= created_at));
-- Sin confirmar no se ha aceptado ningún código, y un código aceptado deja su intervalo.
ALTER TABLE totp_credential ADD CONSTRAINT totp_credential_uso CHECK (
  (confirmed_at IS NOT NULL OR last_step IS NULL) AND ((last_step IS NULL) = (last_used_at IS NULL)));
-- Una sola app confirmada y vigente por persona (la nueva retira la anterior al confirmarse).
CREATE UNIQUE INDEX totp_credential_vigente ON totp_credential (tenant_id, user_id)
  WHERE retired_at IS NULL AND confirmed_at IS NOT NULL;

SELECT l2_aislar_por_tenant('trusted_device');
SELECT l2_aislar_por_tenant('totp_credential');

COMMIT;
