-- B10-2 · El día del evento (V-10). Una tabla nueva, solo-agregar: el día de un cumpleaños empezado, con su
-- cuenta del día (el saldo y lo que incluye el paquete). Los invitados entran a esa cuenta como estancias del
-- parque. Las versiones de cuenta admiten la causa EMPEZAR_EVENTO.
BEGIN;

-- CreateTable
CREATE TABLE "event_day" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "started_by" UUID,
    "started_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "operation_key" UUID NOT NULL,

    CONSTRAINT "event_day_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_day_tenant_id_reservation_id_key" ON "event_day"("tenant_id", "reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_day_tenant_id_account_id_key" ON "event_day"("tenant_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_day_tenant_id_operation_key_key" ON "event_day"("tenant_id", "operation_key");

-- AddForeignKey
ALTER TABLE "event_day" ADD CONSTRAINT "event_day_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "event_day" ADD CONSTRAINT "event_day_tenant_id_reservation_id_fkey" FOREIGN KEY ("tenant_id", "reservation_id") REFERENCES "event_reservation"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "event_day" ADD CONSTRAINT "event_day_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE event_day ADD CONSTRAINT event_day_autor CHECK (length(btrim(started_by_name)) >= 2);

SELECT l2_aislar_por_tenant('event_day');
SELECT l2_solo_agregar('event_day');

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA', 'EMPEZAR_EVENTO'));

COMMIT;
