-- B3-7 · La carga de lo anotado en papel (V-12, ADR-027).
-- Dos tablas nuevas: la carga (la ventana del corte, a nombre del turno donde se carga, que avanza ABIERTA →
-- CERRADA → REVISADA) y sus registros (entradas, salidas y cobros con su hora real, solo-agregar). Lo que hizo
-- cada registro vive en sus tablas de siempre —la cuenta, las estancias, el libro, la venta— con esa hora real;
-- estas dos dicen que vino del papel y dejan lo que revisa supervisión.
BEGIN;

-- CreateTable
CREATE TABLE "paper_load" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "window_from" TIMESTAMPTZ(3) NOT NULL,
    "window_to" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "opened_by" UUID NOT NULL,
    "opened_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by" UUID,
    "closed_by_name" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "reviewed_by_name" TEXT,
    "review_note" TEXT,

    CONSTRAINT "paper_load_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_load_item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "operation_key" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "loaded_at" TIMESTAMPTZ(3) NOT NULL,
    "loaded_by" UUID,
    "loaded_by_name" TEXT NOT NULL,
    "device_id" UUID,
    "detail" JSONB NOT NULL,

    CONSTRAINT "paper_load_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paper_load_tenant_id_branch_id_status_idx" ON "paper_load"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "paper_load_tenant_id_shift_id_idx" ON "paper_load"("tenant_id", "shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_load_tenant_id_id_key" ON "paper_load"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_load_tenant_id_operation_key_key" ON "paper_load"("tenant_id", "operation_key");

-- CreateIndex
CREATE INDEX "paper_load_item_tenant_id_load_id_occurred_at_idx" ON "paper_load_item"("tenant_id", "load_id", "occurred_at");

-- CreateIndex
CREATE INDEX "paper_load_item_tenant_id_account_id_idx" ON "paper_load_item"("tenant_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_load_item_tenant_id_id_key" ON "paper_load_item"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_load_item_tenant_id_operation_key_key" ON "paper_load_item"("tenant_id", "operation_key");

-- AddForeignKey
ALTER TABLE "paper_load" ADD CONSTRAINT "paper_load_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "paper_load" ADD CONSTRAINT "paper_load_tenant_id_shift_id_fkey" FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shift"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "paper_load_item" ADD CONSTRAINT "paper_load_item_tenant_id_load_id_fkey" FOREIGN KEY ("tenant_id", "load_id") REFERENCES "paper_load"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "paper_load_item" ADD CONSTRAINT "paper_load_item_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "account"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE paper_load ADD CONSTRAINT paper_load_estado CHECK (status IN ('ABIERTA', 'CERRADA', 'REVISADA', 'DESCARTADA'));

-- La ventana del corte empieza antes de terminar, dura a lo sumo un día y no termina después de abrirse la carga:
-- no se carga lo que todavía no pasó. Que no empiece más de un día antes de abrirse su turno lo comprueba la
-- aplicación (necesita al turno).
ALTER TABLE paper_load ADD CONSTRAINT paper_load_ventana CHECK (
  window_from < window_to AND window_to - window_from <= interval '24 hours' AND window_to <= opened_at);
ALTER TABLE paper_load ADD CONSTRAINT paper_load_nota CHECK (note IS NULL OR (length(btrim(note)) >= 1 AND length(note) <= 160));
ALTER TABLE paper_load ADD CONSTRAINT paper_load_autor CHECK (length(btrim(opened_by_name)) >= 2);

-- Una carga sin cerrar no dice quién la cerró; una cerrada, sí. Todo en booleanos que nunca son nulos: un CHECK
-- desconocido pasa.
ALTER TABLE paper_load ADD CONSTRAINT paper_load_cierre CHECK (
  (status = 'ABIERTA') = (closed_at IS NULL)
  AND (closed_at IS NULL) = (closed_by IS NULL)
  AND (closed_by IS NULL) = (closed_by_name IS NULL)
  AND (closed_at IS NULL OR closed_at >= opened_at)
  AND (closed_by_name IS NULL OR length(btrim(closed_by_name)) >= 2));
-- Solo una revisada dice quién la revisó y cuándo, y no antes de que la cajera terminara de cargar.
ALTER TABLE paper_load ADD CONSTRAINT paper_load_revision CHECK (
  (status = 'REVISADA') = (reviewed_at IS NOT NULL)
  AND (reviewed_at IS NULL) = (reviewed_by IS NULL)
  AND (reviewed_by IS NULL) = (reviewed_by_name IS NULL)
  AND (reviewed_at IS NULL OR (closed_at IS NOT NULL AND reviewed_at >= closed_at))
  AND (reviewed_by_name IS NULL OR length(btrim(reviewed_by_name)) >= 2)
  AND (review_note IS NULL OR (reviewed_at IS NOT NULL AND length(btrim(review_note)) >= 1 AND length(review_note) <= 280)));

-- Un turno, una carga abierta: dos a la vez mezclarían dos hojas de papel.
CREATE UNIQUE INDEX paper_load_una_abierta_por_turno ON paper_load (tenant_id, shift_id) WHERE status = 'ABIERTA';

-- Una carga nace abierta, en un turno sin sellar de su sucursal (F4-06: después del Z nada toca el turno).
CREATE FUNCTION l2_carga_papel_nace() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t cash_shift%ROWTYPE;
BEGIN
  IF NEW.status <> 'ABIERTA' THEN
    RAISE EXCEPTION 'paper_load: una carga nace abierta' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO t FROM cash_shift WHERE tenant_id = NEW.tenant_id AND id = NEW.shift_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF t.status = 'CERRADO_Z' OR t.branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION 'paper_load: el turno % no admite una carga (cerrado con corte Z o de otra sucursal)', NEW.shift_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER paper_load_nace BEFORE INSERT ON paper_load
  FOR EACH ROW EXECUTE FUNCTION l2_carga_papel_nace();

-- Una carga solo avanza: ABIERTA → CERRADA (con registros) o DESCARTADA (sin ellos), y CERRADA → REVISADA. Lo que
-- declaró al abrirse (su ventana, su turno, quién la abrió) no cambia nunca, y el cierre y la revisión, una vez
-- escritos, tampoco. No se borra (regla 5).
CREATE FUNCTION l2_carga_papel_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  con_registros boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla paper_load solo admite filas nuevas: DELETE no está permitido (regla 5).'
      USING ERRCODE = 'L2001';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.shift_id, NEW.window_from, NEW.window_to, NEW.note,
      NEW.operation_key, NEW.opened_at, NEW.opened_by, NEW.opened_by_name, NEW.device_id)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.shift_id, OLD.window_from, OLD.window_to, OLD.note,
      OLD.operation_key, OLD.opened_at, OLD.opened_by, OLD.opened_by_name, OLD.device_id) THEN
    RAISE EXCEPTION 'paper_load %: lo que declaró al abrirse no se reescribe', OLD.id USING ERRCODE = 'L2001';
  END IF;
  IF NEW.status <> OLD.status AND (OLD.status, NEW.status) NOT IN
     (('ABIERTA', 'CERRADA'), ('ABIERTA', 'DESCARTADA'), ('CERRADA', 'REVISADA')) THEN
    RAISE EXCEPTION 'paper_load %: una carga no pasa de % a %', OLD.id, OLD.status, NEW.status USING ERRCODE = 'L2001';
  END IF;
  IF OLD.closed_at IS NOT NULL AND (NEW.closed_at, NEW.closed_by, NEW.closed_by_name)
                                   IS DISTINCT FROM (OLD.closed_at, OLD.closed_by, OLD.closed_by_name) THEN
    RAISE EXCEPTION 'paper_load %: el cierre no se reescribe', OLD.id USING ERRCODE = 'L2001';
  END IF;
  IF OLD.reviewed_at IS NOT NULL AND (NEW.reviewed_at, NEW.reviewed_by, NEW.reviewed_by_name, NEW.review_note)
                                     IS DISTINCT FROM (OLD.reviewed_at, OLD.reviewed_by, OLD.reviewed_by_name, OLD.review_note) THEN
    RAISE EXCEPTION 'paper_load %: la revisión no se reescribe', OLD.id USING ERRCODE = 'L2001';
  END IF;
  IF NEW.status IN ('CERRADA', 'DESCARTADA') AND OLD.status = 'ABIERTA' THEN
    SELECT EXISTS (SELECT 1 FROM paper_load_item i WHERE i.tenant_id = NEW.tenant_id AND i.load_id = NEW.id) INTO con_registros;
    IF NEW.status = 'CERRADA' AND NOT con_registros THEN
      RAISE EXCEPTION 'paper_load %: una carga sin registros no se cierra para revisar: se descarta', OLD.id USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'DESCARTADA' AND con_registros THEN
      RAISE EXCEPTION 'paper_load %: una carga con registros no se descarta: se revisa', OLD.id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER paper_load_solo_avanza BEFORE UPDATE OR DELETE ON paper_load
  FOR EACH ROW EXECUTE FUNCTION l2_carga_papel_solo_avanza();

ALTER TABLE paper_load_item ADD CONSTRAINT paper_load_item_tipo CHECK (kind IN ('ENTRADA', 'SALIDA', 'COBRO'));
-- Se carga después de que ocurrió, nunca antes: la hora real no es posterior a la de la carga.
ALTER TABLE paper_load_item ADD CONSTRAINT paper_load_item_hora CHECK (occurred_at <= loaded_at);
ALTER TABLE paper_load_item ADD CONSTRAINT paper_load_item_autor CHECK (length(btrim(loaded_by_name)) >= 2);
ALTER TABLE paper_load_item ADD CONSTRAINT paper_load_item_detalle CHECK (jsonb_typeof(detail) = 'object');

-- Un registro solo entra en una carga abierta, con su hora real dentro de la ventana que declaró la cajera, y a
-- una cuenta de la misma sucursal. La aplicación lo comprueba antes; esto es la segunda puerta (fail-closed).
CREATE FUNCTION l2_registro_papel_en_su_ventana() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  c paper_load%ROWTYPE;
BEGIN
  SELECT * INTO c FROM paper_load WHERE tenant_id = NEW.tenant_id AND id = NEW.load_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF c.status <> 'ABIERTA' THEN
    RAISE EXCEPTION 'paper_load_item: la carga % no admite registros (está %)', c.id, c.status USING ERRCODE = '23514';
  END IF;
  IF NEW.occurred_at < c.window_from OR NEW.occurred_at > c.window_to THEN
    RAISE EXCEPTION 'paper_load_item: la hora real cae fuera de la ventana del corte de la carga %', c.id USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM account a WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.account_id AND a.branch_id = c.branch_id) THEN
    RAISE EXCEPTION 'paper_load_item: la cuenta no es de la sucursal de la carga %', c.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER paper_load_item_en_su_ventana BEFORE INSERT ON paper_load_item
  FOR EACH ROW EXECUTE FUNCTION l2_registro_papel_en_su_ventana();

SELECT l2_aislar_por_tenant('paper_load');
SELECT l2_aislar_por_tenant('paper_load_item');
SELECT l2_solo_agregar('paper_load_item');

COMMIT;
