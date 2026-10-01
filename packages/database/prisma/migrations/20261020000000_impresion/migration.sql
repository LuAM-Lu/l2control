-- B5-2 · Impresión (ADR-015, ADR-026). Tablas nuevas; no rellena datos. Va entera en una transacción (§5).
BEGIN;

-- CreateTable
CREATE TABLE "printer" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "width" SMALLINT NOT NULL,
    "for_receipts" BOOLEAN NOT NULL,
    "for_orders" BOOLEAN NOT NULL,
    "in_hardware_lan" BOOLEAN NOT NULL,
    "fixed_ip" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_name" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by_name" TEXT,

    CONSTRAINT "printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_agent" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMPTZ(3),
    "token_hash" TEXT,
    "paired_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_name" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by_name" TEXT,

    CONSTRAINT "print_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_job" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "printer_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "copy" BOOLEAN NOT NULL,
    "sale_id" UUID,
    "cut_id" UUID,
    "content" JSONB NOT NULL,
    "payload" BYTEA NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "agent_id" UUID,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "print_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printer_tenant_id_branch_id_idx" ON "printer"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "printer_tenant_id_id_key" ON "printer"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "printer_tenant_id_branch_id_id_key" ON "printer"("tenant_id", "branch_id", "id");

-- CreateIndex
CREATE INDEX "print_agent_tenant_id_branch_id_idx" ON "print_agent"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_agent_tenant_id_id_key" ON "print_agent"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "print_job_tenant_id_branch_id_status_next_attempt_at_idx" ON "print_job"("tenant_id", "branch_id", "status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "print_job_tenant_id_branch_id_created_at_idx" ON "print_job"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "print_job_tenant_id_id_key" ON "print_job"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "printer" ADD CONSTRAINT "printer_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_agent" ADD CONSTRAINT "print_agent_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_branch_id_printer_id_fkey" FOREIGN KEY ("tenant_id", "branch_id", "printer_id") REFERENCES "printer"("tenant_id", "branch_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sale"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_cut_id_fkey" FOREIGN KEY ("tenant_id", "cut_id") REFERENCES "shift_cut"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "print_agent"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B5-2, ADR-015, ADR-026): las impresoras del local, los agentes que imprimen en ellas
-- desde la laptop de caja y la cola de impresión, con su máquina de estados en la base.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La impresora ─────────────────────────────────────────────────────────────
ALTER TABLE printer ADD CONSTRAINT printer_datos CHECK (
  width IN (58, 80) AND port BETWEEN 1 AND 65535 AND (for_receipts OR for_orders)
  AND length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(created_by_name)) >= 2
  -- Solo IP privadas: una impresora con IP pública está expuesta a internet (ADR-015).
  AND ip ~ '^(10\.([0-9]{1,3}\.){2}[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})$');
-- Encendida solo en la VLAN de hardware y con IP fija; retirada, apagada para siempre.
ALTER TABLE printer ADD CONSTRAINT printer_garantias CHECK (NOT active OR (in_hardware_lan AND fixed_ip));
ALTER TABLE printer ADD CONSTRAINT printer_retiro CHECK (
  (retired_at IS NULL) = (retired_by_name IS NULL) AND (retired_at IS NULL OR NOT active));
-- Un solo papel para cada cosa: una activa para recibos y una para comandas por sucursal.
CREATE UNIQUE INDEX printer_una_de_recibos ON printer (tenant_id, branch_id) WHERE active AND for_receipts;
CREATE UNIQUE INDEX printer_una_de_comandas ON printer (tenant_id, branch_id) WHERE active AND for_orders;
-- Dos nombres para el mismo aparato: al fallar uno, el otro parece sano.
CREATE UNIQUE INDEX printer_una_por_direccion ON printer (tenant_id, branch_id, ip, port) WHERE retired_at IS NULL;

CREATE FUNCTION l2_impresora_no_se_borra() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.retired_at IS NOT NULL
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.created_at, NEW.created_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.created_at, OLD.created_by_name) THEN
    RAISE EXCEPTION 'printer: % no está permitido (se edita, se apaga o se retira una vez; no se borra)', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER printer_no_se_borra BEFORE UPDATE OR DELETE ON printer
  FOR EACH ROW EXECUTE FUNCTION l2_impresora_no_se_borra();
CREATE TRIGGER printer_no_se_vacia BEFORE TRUNCATE ON printer
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();
SELECT l2_aislar_por_tenant('printer');

-- ── El agente ────────────────────────────────────────────────────────────────
ALTER TABLE print_agent ADD CONSTRAINT print_agent_datos CHECK (
  length(btrim(name)) BETWEEN 2 AND 40 AND length(btrim(created_by_name)) >= 2
  AND (code_hash IS NULL) = (code_expires_at IS NULL)
  AND (token_hash IS NULL) = (paired_at IS NULL)
  AND (retired_at IS NULL) = (retired_by_name IS NULL));
CREATE UNIQUE INDEX print_agent_credencial ON print_agent (token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX print_agent_codigo ON print_agent (code_hash) WHERE code_hash IS NOT NULL;

-- Se vincula una vez y se retira una vez: la credencial no se cambia ni se reutiliza.
CREATE FUNCTION l2_agente_se_vincula_una_vez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR OLD.retired_at IS NOT NULL
     OR (OLD.token_hash IS NOT NULL AND NEW.token_hash IS DISTINCT FROM OLD.token_hash)
     OR (OLD.code_hash IS NULL AND NEW.code_hash IS NOT NULL)
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.name, NEW.created_at, NEW.created_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.name, OLD.created_at, OLD.created_by_name) THEN
    RAISE EXCEPTION 'print_agent: % no está permitido (se vincula una vez y se retira una vez)', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER print_agent_se_vincula_una_vez BEFORE UPDATE OR DELETE ON print_agent
  FOR EACH ROW EXECUTE FUNCTION l2_agente_se_vincula_una_vez();
CREATE TRIGGER print_agent_no_se_vacia BEFORE TRUNCATE ON print_agent
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();
SELECT l2_aislar_por_tenant('print_agent');

-- ── El trabajo de impresión ──────────────────────────────────────────────────
ALTER TABLE print_job ADD CONSTRAINT print_job_datos CHECK (
  kind IN ('RECIBO', 'CORTE', 'COMANDA', 'PRUEBA')
  AND status IN ('PENDIENTE', 'ENVIADO', 'CONFIRMADO', 'FALLIDO')
  AND attempts >= 0
  AND length(btrim(title)) BETWEEN 1 AND 80 AND length(btrim(created_by_name)) >= 2
  AND octet_length(payload) BETWEEN 4 AND 65536
  AND (kind <> 'RECIBO' OR sale_id IS NOT NULL)
  AND (kind <> 'CORTE' OR cut_id IS NOT NULL)
  AND ((status = 'ENVIADO') = (sent_at IS NOT NULL))
  AND ((status IN ('CONFIRMADO', 'FALLIDO')) = (finished_at IS NOT NULL)));

-- Lo que se imprime no cambia; el estado solo avanza como dice ADR-015 y nada se borra.
CREATE FUNCTION l2_trabajo_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.printer_id, NEW.kind, NEW.title, NEW.copy, NEW.sale_id, NEW.cut_id,
         NEW.content, NEW.payload, NEW.created_at, NEW.created_by, NEW.created_by_name, NEW.device_id)
        IS DISTINCT FROM
        (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.printer_id, OLD.kind, OLD.title, OLD.copy, OLD.sale_id, OLD.cut_id,
         OLD.content, OLD.payload, OLD.created_at, OLD.created_by, OLD.created_by_name, OLD.device_id)
     OR NOT ((OLD.status, NEW.status) IN (
       ('PENDIENTE', 'ENVIADO'), ('ENVIADO', 'CONFIRMADO'), ('ENVIADO', 'PENDIENTE'), ('ENVIADO', 'FALLIDO'), ('FALLIDO', 'PENDIENTE'))) THEN
    RAISE EXCEPTION 'print_job: % no está permitido (de % a %)', TG_OP, OLD.status, COALESCE(NEW.status, '-')
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER print_job_solo_avanza BEFORE UPDATE OR DELETE ON print_job
  FOR EACH ROW EXECUTE FUNCTION l2_trabajo_solo_avanza();
CREATE TRIGGER print_job_no_se_vacia BEFORE TRUNCATE ON print_job
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();
SELECT l2_aislar_por_tenant('print_job');

COMMIT;
