-- T-11 · Reportar un problema (M-27, P-4, D-SOP).
-- Solo EXPANDE (ADR-028): cuatro tablas nuevas que la versión anterior no lee.
--   support_report          el reporte: quién, desde qué equipo y pantalla, en qué versión, qué pasó y los últimos
--                           errores. Correlativo por local. Nunca datos de cobro ni PIN (PLAN §7.6).
--   support_report_capture  su captura, aparte (no se carga al listar), con tope de tamaño.
--   support_report_status   su historia: visto, en curso, resuelto en una versión. El estado es el último paso.
--   support_report_notice   los intentos de avisar al desarrollo por correo (D-SOP). El vigente es el último.
-- Las cuatro solo se agregan: nada se corrige ni se borra.
BEGIN;

CREATE TABLE "support_report" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_role" TEXT NOT NULL,
    "device_id" UUID,
    "device_label" TEXT,
    "route" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "error_code" TEXT,
    "fingerprint" TEXT,
    "recent_errors" JSONB NOT NULL,
    "has_capture" BOOLEAN NOT NULL,

    CONSTRAINT "support_report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_report_capture" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_report_capture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_report_status" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "resolved_version" TEXT,
    "note" TEXT,
    "by_user_id" UUID,
    "by_name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_report_status_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_report_notice" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_report_notice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_report_tenant_id_id_key" ON "support_report"("tenant_id", "id");
CREATE UNIQUE INDEX "support_report_tenant_id_number_key" ON "support_report"("tenant_id", "number");
CREATE INDEX "support_report_tenant_id_fingerprint_idx" ON "support_report"("tenant_id", "fingerprint");
CREATE INDEX "support_report_tenant_id_user_id_created_at_idx" ON "support_report"("tenant_id", "user_id", "created_at");
CREATE UNIQUE INDEX "support_report_capture_tenant_id_id_key" ON "support_report_capture"("tenant_id", "id");
CREATE UNIQUE INDEX "support_report_capture_tenant_id_report_id_key" ON "support_report_capture"("tenant_id", "report_id");
CREATE UNIQUE INDEX "support_report_status_tenant_id_id_key" ON "support_report_status"("tenant_id", "id");
CREATE INDEX "support_report_status_tenant_id_report_id_at_idx" ON "support_report_status"("tenant_id", "report_id", "at");
CREATE UNIQUE INDEX "support_report_notice_tenant_id_id_key" ON "support_report_notice"("tenant_id", "id");
CREATE INDEX "support_report_notice_tenant_id_report_id_at_idx" ON "support_report_notice"("tenant_id", "report_id", "at");

ALTER TABLE "support_report" ADD CONSTRAINT "support_report_tenant_id_branch_id_fkey"
  FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_report" ADD CONSTRAINT "support_report_tenant_id_user_id_fkey"
  FOREIGN KEY ("tenant_id", "user_id") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_report_capture" ADD CONSTRAINT "support_report_capture_tenant_id_report_id_fkey"
  FOREIGN KEY ("tenant_id", "report_id") REFERENCES "support_report"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_report_status" ADD CONSTRAINT "support_report_status_tenant_id_report_id_fkey"
  FOREIGN KEY ("tenant_id", "report_id") REFERENCES "support_report"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_report_notice" ADD CONSTRAINT "support_report_notice_tenant_id_report_id_fkey"
  FOREIGN KEY ("tenant_id", "report_id") REFERENCES "support_report"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano: lo que la base impone aunque la aplicación se equivoque.
ALTER TABLE support_report ADD CONSTRAINT support_report_datos CHECK (
  number > 0
  AND char_length(text) BETWEEN 3 AND 2000
  AND route ~ '^/[A-Za-z0-9/_-]{0,199}$'
  AND app_version ~ '^[0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6}$'
  AND (error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9-]{1,59}$')
  AND (fingerprint IS NULL OR char_length(fingerprint) <= 200)
  AND jsonb_typeof(recent_errors) = 'array' AND jsonb_array_length(recent_errors) <= 10);
ALTER TABLE support_report_capture ADD CONSTRAINT support_report_capture_datos CHECK (
  mime IN ('image/jpeg', 'image/png') AND octet_length(bytes) BETWEEN 1 AND 1500000);
ALTER TABLE support_report_status ADD CONSTRAINT support_report_status_datos CHECK (
  status IN ('VISTO', 'EN_CURSO', 'RESUELTO')
  AND (status = 'RESUELTO') = (resolved_version IS NOT NULL)
  AND (resolved_version IS NULL OR resolved_version ~ '^[0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6}$')
  AND (note IS NULL OR char_length(note) <= 500));
ALTER TABLE support_report_notice ADD CONSTRAINT support_report_notice_datos CHECK (
  detail IS NULL OR char_length(detail) <= 300);

SELECT l2_aislar_por_tenant('support_report');
SELECT l2_aislar_por_tenant('support_report_capture');
SELECT l2_aislar_por_tenant('support_report_status');
SELECT l2_aislar_por_tenant('support_report_notice');
SELECT l2_solo_agregar('support_report');
SELECT l2_solo_agregar('support_report_capture');
SELECT l2_solo_agregar('support_report_status');
SELECT l2_solo_agregar('support_report_notice');

COMMIT;
