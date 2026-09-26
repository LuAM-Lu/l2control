-- CreateTable
CREATE TABLE "staff_user" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pin_hash" TEXT,
    "pin_failures" INTEGER NOT NULL DEFAULT 0,
    "pin_last_failure_at" TIMESTAMPTZ(3),
    "password_hash" TEXT,
    "totp_secret_enc" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_user_branch" (
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "staff_user_branch_pkey" PRIMARY KEY ("tenant_id","user_id","branch_id")
);

-- CreateTable
CREATE TABLE "staff_user_change" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from_role" TEXT,
    "to_role" TEXT,
    "reason" TEXT NOT NULL,
    "by_user_id" UUID,
    "by_name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_user_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_exception" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "permission" TEXT,
    "reason" TEXT NOT NULL,
    "granted_by" UUID,
    "granted_by_name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "permission_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_adjustment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "by_user_id" UUID,
    "by_name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "role_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3),

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_change" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "reason" TEXT NOT NULL,
    "by_user_id" UUID,
    "by_name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_session" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elevated_until" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "closed_reason" TEXT,

    CONSTRAINT "staff_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_tenant_id_id_key" ON "staff_user"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "staff_user_change_tenant_id_user_id_at_idx" ON "staff_user_change"("tenant_id", "user_id", "at");

-- CreateIndex
CREATE INDEX "permission_exception_tenant_id_user_id_idx" ON "permission_exception"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "role_adjustment_tenant_id_branch_id_idx" ON "role_adjustment"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_secret_hash_key" ON "device"("secret_hash");

-- CreateIndex
CREATE UNIQUE INDEX "device_tenant_id_id_key" ON "device"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "device_change_tenant_id_device_id_at_idx" ON "device_change"("tenant_id", "device_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_session_token_hash_key" ON "staff_session"("token_hash");

-- CreateIndex
CREATE INDEX "staff_session_tenant_id_device_id_closed_at_idx" ON "staff_session"("tenant_id", "device_id", "closed_at");

-- CreateIndex
CREATE INDEX "staff_session_tenant_id_user_id_closed_at_idx" ON "staff_session"("tenant_id", "user_id", "closed_at");

-- AddForeignKey
ALTER TABLE "staff_user_branch" ADD CONSTRAINT "staff_user_branch_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_user_branch" ADD CONSTRAINT "staff_user_branch_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_user_change" ADD CONSTRAINT "staff_user_change_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "permission_exception" ADD CONSTRAINT "permission_exception_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_adjustment" ADD CONSTRAINT "role_adjustment_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "device_change" ADD CONSTRAINT "device_change_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "device"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "device"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano: catálogos, unicidades parciales, aislamiento y solo-agregar.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE staff_user ADD CONSTRAINT staff_user_role
  CHECK (role IN ('ADMIN', 'SUPERVISOR', 'CAJERO', 'MESERO', 'MONITOR_PARQUE', 'COCINA'));
ALTER TABLE staff_user ADD CONSTRAINT staff_user_pin_failures CHECK (pin_failures >= 0);
ALTER TABLE staff_user ADD CONSTRAINT staff_user_full_name CHECK (length(btrim(full_name)) >= 2);

ALTER TABLE staff_user_change ADD CONSTRAINT staff_user_change_kind
  CHECK (kind IN ('ALTA', 'BAJA', 'REINGRESO', 'ROL', 'PIN'));
ALTER TABLE staff_user_change ADD CONSTRAINT staff_user_change_reason CHECK (length(btrim(reason)) >= 10);

ALTER TABLE permission_exception ADD CONSTRAINT permission_exception_effect CHECK (
  (effect = 'GRANT' AND permission IN ('PERMITIDO', 'REQUIERE_AUTORIZACION'))
  OR (effect = 'REVOKE' AND permission IS NULL));
-- Una sola excepción VIGENTE por persona y acción; las retiradas se quedan como historia.
CREATE UNIQUE INDEX permission_exception_vigente
  ON permission_exception (tenant_id, user_id, action) WHERE retired_at IS NULL;

ALTER TABLE role_adjustment ADD CONSTRAINT role_adjustment_permission
  CHECK (permission IN ('PERMITIDO', 'REQUIERE_AUTORIZACION', 'DENEGADO'));
CREATE UNIQUE INDEX role_adjustment_vigente
  ON role_adjustment (tenant_id, branch_id, role, action) WHERE retired_at IS NULL;

ALTER TABLE device ADD CONSTRAINT device_status CHECK (status IN ('PENDIENTE', 'APROBADO', 'REVOCADO'));
ALTER TABLE device ADD CONSTRAINT device_label CHECK (length(btrim(label)) BETWEEN 2 AND 40);
-- «Revoca la tablet de mesero» no puede ser una pregunta: dos equipos no se llaman igual.
CREATE UNIQUE INDEX device_label_unico ON device (tenant_id, lower(label));

ALTER TABLE device_change ADD CONSTRAINT device_change_kind
  CHECK (kind IN ('ALTA', 'APROBADO', 'REVOCADO', 'RENOMBRADO'));

ALTER TABLE staff_session ADD CONSTRAINT staff_session_closed_reason CHECK (
  (closed_at IS NULL AND closed_reason IS NULL)
  OR (closed_at IS NOT NULL AND closed_reason IN
      ('SALIDA', 'INACTIVIDAD', 'DISPOSITIVO_REVOCADO', 'BAJA', 'CORTE_Z', 'OTRA_SESION')));
-- Un equipo, una sesión abierta a la vez (DEC-17: el aparato es del puesto).
CREATE UNIQUE INDEX staff_session_abierta_por_equipo
  ON staff_session (tenant_id, device_id) WHERE closed_at IS NULL;

SELECT l2_aislar_por_tenant('staff_user');
SELECT l2_aislar_por_tenant('staff_user_branch');
SELECT l2_aislar_por_tenant('staff_user_change');
SELECT l2_aislar_por_tenant('permission_exception');
SELECT l2_aislar_por_tenant('role_adjustment');
SELECT l2_aislar_por_tenant('device');
SELECT l2_aislar_por_tenant('device_change');
SELECT l2_aislar_por_tenant('staff_session');

SELECT l2_solo_agregar('staff_user_change');
SELECT l2_solo_agregar('device_change');
