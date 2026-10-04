-- B10-1 · Cumpleaños: reserva con fecha y anticipo (V-10, D-EVT).
-- Dos tablas nuevas, las dos solo-agregar: las versiones del catálogo de paquetes de cumpleaños (con el
-- anticipo) y las reservas, con el paquete copiado. La cuenta admite el tipo EVENTO (la cuenta del
-- anticipo) y dos causas nuevas en sus versiones: RESERVA (nace) y CANCELAR_RESERVA (se cierra sin consumo).
BEGIN;

-- CreateTable
CREATE TABLE "event_catalog_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,
    "published_by_name" TEXT,

    CONSTRAINT "event_catalog_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_reservation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "starts_minute" INTEGER NOT NULL,
    "ends_minute" INTEGER NOT NULL,
    "guests" INTEGER NOT NULL,
    "honoree" TEXT NOT NULL,
    "honoree_age" INTEGER,
    "package" JSONB NOT NULL,
    "catalog_version" INTEGER NOT NULL,
    "deposit_bps" INTEGER NOT NULL,
    "deposit_minor" BIGINT NOT NULL,
    "balance_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "operation_key" UUID NOT NULL,

    CONSTRAINT "event_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_catalog_version_tenant_id_branch_id_version_key" ON "event_catalog_version"("tenant_id", "branch_id", "version");

-- CreateIndex
CREATE INDEX "event_reservation_tenant_id_branch_id_event_date_idx" ON "event_reservation"("tenant_id", "branch_id", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "event_reservation_tenant_id_id_key" ON "event_reservation"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "event_reservation_tenant_id_operation_key_key" ON "event_reservation"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "event_reservation_tenant_id_account_id_key" ON "event_reservation"("tenant_id", "account_id");

-- AddForeignKey
ALTER TABLE "event_catalog_version" ADD CONSTRAINT "event_catalog_version_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "event_reservation" ADD CONSTRAINT "event_reservation_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "event_reservation" ADD CONSTRAINT "event_reservation_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "event_reservation" ADD CONSTRAINT "event_reservation_tenant_id_guardian_id_fkey" FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE event_catalog_version ADD CONSTRAINT event_catalog_version_version_positiva CHECK (version > 0);
ALTER TABLE event_catalog_version ADD CONSTRAINT event_catalog_version_contenido
  CHECK (jsonb_typeof(content) = 'object' AND jsonb_typeof(content->'paquetes') = 'array');
-- Un catálogo lo publica una persona, con su nombre.
ALTER TABLE event_catalog_version ADD CONSTRAINT event_catalog_version_autor
  CHECK (published_by IS NOT NULL AND length(btrim(published_by_name)) >= 2);

-- El horario cabe en el día y empieza antes de terminar; los invitados y el anticipo, con sentido; el
-- anticipo más el saldo es el precio del paquete (que va en el JSON), y los dos en dólares.
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_horario
  CHECK (starts_minute >= 0 AND ends_minute <= 1440 AND starts_minute < ends_minute);
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_invitados CHECK (guests > 0);
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_edad CHECK (honoree_age IS NULL OR honoree_age > 0);
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_cumpleanero CHECK (length(btrim(honoree)) >= 2);
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_anticipo
  CHECK (deposit_bps BETWEEN 1 AND 10000 AND deposit_minor > 0 AND balance_minor >= 0);
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_paquete
  CHECK (jsonb_typeof(package) = 'object' AND (package->'price'->>'minor')::bigint = deposit_minor + balance_minor);
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_moneda CHECK (currency = 'USD');
ALTER TABLE event_reservation ADD CONSTRAINT event_reservation_autor CHECK (length(btrim(created_by_name)) >= 2);

SELECT l2_aislar_por_tenant('event_catalog_version');
SELECT l2_solo_agregar('event_catalog_version');
SELECT l2_aislar_por_tenant('event_reservation');
SELECT l2_solo_agregar('event_reservation');

ALTER TABLE account DROP CONSTRAINT account_kind;
ALTER TABLE account ADD CONSTRAINT account_kind CHECK (kind IN ('FAMILIA', 'MESA', 'MOSTRADOR', 'EVENTO'));

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA'));

COMMIT;
