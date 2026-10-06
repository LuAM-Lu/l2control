-- T-4 · Llaves de acceso e instalación inicial (ADR-020, M-12).
-- Solo EXPANDE (ADR-028): cinco tablas nuevas y ninguna columna tocada, así que la versión anterior sigue
-- funcionando con esta base. `staff_user.totp_secret_enc` se queda (ya nadie la lee ni la escribe) y se quita en
-- una migración de contracción.
--   passkey          la clave pública de cada llave de acceso (WebAuthn) de una persona
--   recovery_code    los diez códigos de recuperación de un solo uso (solo su SHA-256)
--   enrollment_link  el enlace de alta de 24 h que administración da desde Panel → Personas
--   auth_challenge   el desafío pendiente de cada ceremonia, de un solo uso y de pocos minutos
--   installation     el código de instalación de un local sin instalar y la constancia de que se instaló
BEGIN;

-- CreateTable
CREATE TABLE "passkey" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_code" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_link" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "failures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "enrollment_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenge" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "user_id" UUID,
    "device_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation" (
    "tenant_id" UUID NOT NULL,
    "code_hash" TEXT,
    "issued_at" TIMESTAMPTZ(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "last_failure_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_name" TEXT,

    CONSTRAINT "installation_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passkey_credential_id_key" ON "passkey"("credential_id");

-- CreateIndex
CREATE INDEX "passkey_tenant_id_user_id_idx" ON "passkey"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "passkey_tenant_id_id_key" ON "passkey"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_code_code_hash_key" ON "recovery_code"("code_hash");

-- CreateIndex
CREATE INDEX "recovery_code_tenant_id_user_id_idx" ON "recovery_code"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_link_secret_hash_key" ON "enrollment_link"("secret_hash");

-- CreateIndex
CREATE INDEX "enrollment_link_tenant_id_user_id_idx" ON "enrollment_link"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "auth_challenge_tenant_id_expires_at_idx" ON "auth_challenge"("tenant_id", "expires_at");

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "enrollment_link" ADD CONSTRAINT "enrollment_link_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE passkey ADD CONSTRAINT passkey_credencial CHECK (length(credential_id) BETWEEN 16 AND 1400);
ALTER TABLE passkey ADD CONSTRAINT passkey_clave CHECK (octet_length(public_key) BETWEEN 32 AND 2048);
ALTER TABLE passkey ADD CONSTRAINT passkey_contador CHECK (counter >= 0);
ALTER TABLE passkey ADD CONSTRAINT passkey_nombre CHECK (length(btrim(label)) >= 2 AND length(label) <= 60);
ALTER TABLE passkey ADD CONSTRAINT passkey_fechas CHECK (
  (last_used_at IS NULL OR last_used_at >= created_at) AND (retired_at IS NULL OR retired_at >= created_at));

-- SHA-256 en hexadecimal, como las credenciales de equipo y de sesión.
ALTER TABLE recovery_code ADD CONSTRAINT recovery_code_huella CHECK (code_hash ~ '^[0-9a-f]{64}$');
-- Un código se usa una vez o se retira al reponer el juego; nunca las dos cosas.
ALTER TABLE recovery_code ADD CONSTRAINT recovery_code_un_final CHECK (used_at IS NULL OR retired_at IS NULL);

ALTER TABLE enrollment_link ADD CONSTRAINT enrollment_link_tipo CHECK (kind IN ('ALTA', 'LLAVE'));
ALTER TABLE enrollment_link ADD CONSTRAINT enrollment_link_huella CHECK (secret_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE enrollment_link ADD CONSTRAINT enrollment_link_autor CHECK (length(btrim(created_by_name)) >= 2);
-- Vale a lo sumo 24 horas (ADR-020).
ALTER TABLE enrollment_link ADD CONSTRAINT enrollment_link_plazo CHECK (
  expires_at > created_at AND expires_at - created_at <= interval '24 hours');
ALTER TABLE enrollment_link ADD CONSTRAINT enrollment_link_un_final CHECK (used_at IS NULL OR revoked_at IS NULL);
ALTER TABLE enrollment_link ADD CONSTRAINT enrollment_link_fallos CHECK (failures >= 0);

ALTER TABLE auth_challenge ADD CONSTRAINT auth_challenge_proposito CHECK (
  purpose IN ('INSTALACION', 'ALTA', 'LLAVE', 'ELEVAR', 'APROBAR_EQUIPO'));
ALTER TABLE auth_challenge ADD CONSTRAINT auth_challenge_desafio CHECK (length(challenge) BETWEEN 22 AND 200);
-- De pocos minutos: un desafío viejo no se responde.
ALTER TABLE auth_challenge ADD CONSTRAINT auth_challenge_plazo CHECK (
  expires_at > created_at AND expires_at - created_at <= interval '15 minutes');
ALTER TABLE auth_challenge ADD CONSTRAINT auth_challenge_payload CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object');

ALTER TABLE installation ADD CONSTRAINT installation_huella CHECK (code_hash IS NULL OR code_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE installation ADD CONSTRAINT installation_fallos CHECK (failures >= 0);
-- Sin instalar hay un código vigente con su fecha; instalado, ya no hay código y consta quién lo hizo. Todo en
-- booleanos que nunca son nulos: un CHECK desconocido pasa.
ALTER TABLE installation ADD CONSTRAINT installation_estado CHECK (
  (completed_at IS NULL) = (code_hash IS NOT NULL)
  AND (code_hash IS NULL) = (issued_at IS NULL)
  AND (completed_at IS NULL) = (completed_by_name IS NULL)
  AND (completed_by_name IS NULL OR length(btrim(completed_by_name)) >= 2));

-- Una instalación hecha no se deshace: la pantalla de instalación no vuelve a existir (ADR-020).
CREATE FUNCTION l2_instalacion_no_se_deshace() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'installation: la constancia de la instalación no se borra' USING ERRCODE = '23514';
  END IF;
  IF OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'installation: el local % ya está instalado', OLD.tenant_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER installation_no_se_deshace BEFORE UPDATE OR DELETE ON installation
  FOR EACH ROW EXECUTE FUNCTION l2_instalacion_no_se_deshace();

SELECT l2_aislar_por_tenant('passkey');
SELECT l2_aislar_por_tenant('recovery_code');
SELECT l2_aislar_por_tenant('enrollment_link');
SELECT l2_aislar_por_tenant('auth_challenge');
SELECT l2_aislar_por_tenant('installation');

COMMIT;
