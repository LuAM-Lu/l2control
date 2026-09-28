-- CreateTable
CREATE TABLE "guardian" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "contact_reference" TEXT NOT NULL,
    "contact_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kid" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "park_session" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "kid_id" UUID,
    "wristband_code" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "price_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "tariff_version" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "opened_by" UUID,
    "opened_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "check_in_key" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "closed_by" UUID,
    "closed_by_name" TEXT,
    "check_out_key" UUID,

    CONSTRAINT "park_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_tenant_id_id_key" ON "guardian"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_tenant_id_contact_key_key" ON "guardian"("tenant_id", "contact_key");

-- CreateIndex
CREATE INDEX "kid_tenant_id_guardian_id_idx" ON "kid"("tenant_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "kid_tenant_id_id_key" ON "kid"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "park_session_tenant_id_branch_id_status_idx" ON "park_session"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "park_session_tenant_id_account_id_idx" ON "park_session"("tenant_id", "account_id");

-- CreateIndex
CREATE INDEX "park_session_tenant_id_guardian_id_idx" ON "park_session"("tenant_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "park_session_tenant_id_id_key" ON "park_session"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "kid" ADD CONSTRAINT "kid_tenant_id_guardian_id_fkey" FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "park_session" ADD CONSTRAINT "park_session_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "park_session" ADD CONSTRAINT "park_session_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "park_session" ADD CONSTRAINT "park_session_tenant_id_guardian_id_fkey" FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardian"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "park_session" ADD CONSTRAINT "park_session_tenant_id_kid_id_fkey" FOREIGN KEY ("tenant_id", "kid_id") REFERENCES "kid"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B4-1, B4-2, F5-01, F5-02, ADR-010, I-04): el parque sale del navegador.
-- Representantes y niños se corrigen (con auditoría) pero no se borran; la estancia solo avanza de
-- ACTIVA a CERRADA, y el reloj que la mide es el del servidor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El directorio ────────────────────────────────────────────────────────────
ALTER TABLE guardian ADD CONSTRAINT guardian_nombre CHECK (length(btrim(full_name)) BETWEEN 2 AND 80);
ALTER TABLE guardian ADD CONSTRAINT guardian_contacto CHECK (length(btrim(contact_reference)) BETWEEN 4 AND 40);
-- La llave del contacto son solo dígitos: dos maneras de escribir el mismo teléfono son una familia.
ALTER TABLE guardian ADD CONSTRAINT guardian_llave CHECK (contact_key ~ '^[0-9]{4,20}$');
ALTER TABLE kid ADD CONSTRAINT kid_nombre CHECK (length(btrim(name)) BETWEEN 2 AND 60);
ALTER TABLE kid ADD CONSTRAINT kid_apodo CHECK (nickname IS NULL OR length(btrim(nickname)) BETWEEN 1 AND 30);

-- Una familia o un niño se corrigen, no se borran ni cambian de dueño: sus estancias los nombran.
CREATE FUNCTION l2_directorio_se_corrige() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla % no admite DELETE: el directorio se corrige, no se borra (regla 5).', TG_TABLE_NAME
      USING ERRCODE = 'L2001';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.created_at <> OLD.created_at
     OR (TG_TABLE_NAME = 'kid' AND NEW.guardian_id <> OLD.guardian_id) THEN
    RAISE EXCEPTION '%: solo se corrigen los datos, no quién es ni de quién es', TG_TABLE_NAME
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guardian_se_corrige BEFORE UPDATE OR DELETE ON guardian
  FOR EACH ROW EXECUTE FUNCTION l2_directorio_se_corrige();
CREATE TRIGGER kid_se_corrige BEFORE UPDATE OR DELETE ON kid
  FOR EACH ROW EXECUTE FUNCTION l2_directorio_se_corrige();

SELECT l2_aislar_por_tenant('guardian');
SELECT l2_aislar_por_tenant('kid');

-- ── La estancia ──────────────────────────────────────────────────────────────
-- Las columnas de los IN no admiten nulos: el IN no tiene nulo que colar.
ALTER TABLE park_session ADD CONSTRAINT park_session_status CHECK (status IN ('ACTIVA', 'CERRADA'));
ALTER TABLE park_session ADD CONSTRAINT park_session_mode CHECK (mode IN ('PREPAGO', 'POSTPAGO'));
-- El parque cobra en la moneda funcional (ADR-004), un paquete no es gratis (una cortesía lo sería).
ALTER TABLE park_session ADD CONSTRAINT park_session_precio CHECK (currency = 'USD' AND price_minor > 0);
-- ADR-011: un tiempo fijo es positivo; el abierto no tiene minutos.
ALTER TABLE park_session ADD CONSTRAINT park_session_duracion CHECK (duration_minutes IS NULL OR duration_minutes > 0);
ALTER TABLE park_session ADD CONSTRAINT park_session_pulsera CHECK (wristband_code ~ '^[A-Z0-9-]{4,32}$');
ALTER TABLE park_session ADD CONSTRAINT park_session_tarifario CHECK (tariff_version > 0);
ALTER TABLE park_session ADD CONSTRAINT park_session_condiciones CHECK (jsonb_typeof(terms) = 'object');
ALTER TABLE park_session ADD CONSTRAINT park_session_nombres CHECK (
  length(btrim(opened_by_name)) >= 2 AND length(btrim(package_name)) >= 1
  AND (closed_by_name IS NULL OR length(btrim(closed_by_name)) >= 2));
-- Una estancia cerrada dice cuándo y con qué operación; una activa, no. Booleanos que nunca son nulos.
ALTER TABLE park_session ADD CONSTRAINT park_session_cierre CHECK (
  (status = 'CERRADA') = (ended_at IS NOT NULL)
  AND (ended_at IS NULL) = (check_out_key IS NULL)
  AND (ended_at IS NULL) = (closed_by_name IS NULL));
ALTER TABLE park_session ADD CONSTRAINT park_session_cierre_despues CHECK (ended_at IS NULL OR ended_at >= started_at);

-- I-04: un código de pulsera tiene UNA estancia activa en la sucursal. Cerrada, el código se libera.
CREATE UNIQUE INDEX park_session_una_activa_por_pulsera ON park_session (tenant_id, branch_id, wristband_code)
  WHERE status = 'ACTIVA';
CREATE INDEX park_session_por_entrada ON park_session (tenant_id, check_in_key);

-- Una estancia no se borra y solo avanza: ACTIVA → CERRADA. Lo que se contrató al entrar no cambia;
-- el niño se puede nombrar una vez (de nulo a alguien), y el cierre, una vez hecho, tampoco cambia.
CREATE FUNCTION l2_estancia_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla park_session solo admite filas nuevas: DELETE no está permitido (regla 5).'
      USING ERRCODE = 'L2001';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.account_id, NEW.guardian_id, NEW.wristband_code,
      NEW.package_id, NEW.package_name, NEW.mode, NEW.duration_minutes, NEW.price_minor, NEW.currency,
      NEW.terms, NEW.tariff_version, NEW.started_at, NEW.opened_by, NEW.opened_by_name, NEW.device_id,
      NEW.check_in_key)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.account_id, OLD.guardian_id, OLD.wristband_code,
      OLD.package_id, OLD.package_name, OLD.mode, OLD.duration_minutes, OLD.price_minor, OLD.currency,
      OLD.terms, OLD.tariff_version, OLD.started_at, OLD.opened_by, OLD.opened_by_name, OLD.device_id,
      OLD.check_in_key)
     OR (OLD.kid_id IS NOT NULL AND NEW.kid_id IS DISTINCT FROM OLD.kid_id)
     OR (OLD.status = 'CERRADA' AND (NEW.status, NEW.ended_at, NEW.closed_by, NEW.closed_by_name, NEW.check_out_key)
                                     IS DISTINCT FROM (OLD.status, OLD.ended_at, OLD.closed_by, OLD.closed_by_name, OLD.check_out_key)) THEN
    RAISE EXCEPTION 'park_session %: una estancia solo se nombra y se cierra; lo contratado y el cierre no se reescriben', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER park_session_solo_avanza BEFORE UPDATE OR DELETE ON park_session
  FOR EACH ROW EXECUTE FUNCTION l2_estancia_solo_avanza();

-- El niño nombrado es de la familia de la estancia: nunca el de otra.
CREATE FUNCTION l2_estancia_nino_de_su_familia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kid_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM kid WHERE tenant_id = NEW.tenant_id AND id = NEW.kid_id AND guardian_id = NEW.guardian_id) THEN
    RAISE EXCEPTION 'park_session %: el niño % no es de la familia de la estancia', NEW.id, NEW.kid_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER park_session_nino_de_su_familia BEFORE INSERT OR UPDATE OF kid_id ON park_session
  FOR EACH ROW EXECUTE FUNCTION l2_estancia_nino_de_su_familia();

SELECT l2_aislar_por_tenant('park_session');

-- ── La cuenta de la familia: la abre la entrada y la cambia la salida ──────
ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA'));
