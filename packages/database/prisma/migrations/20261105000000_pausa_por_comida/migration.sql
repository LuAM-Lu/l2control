-- B4-7 · Pausa por comida (M-27, P-14): el niño sale a comer y su tiempo se detiene, hasta el máximo de la
-- sucursal (10 min de fábrica), una vez por visita.
-- Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no lee.
--   park_session_pause  dos asientos posibles por estancia: PAUSA (cuándo y con qué máximo) y REANUDA
--                       (la monitora la terminó antes). Ninguno se borra ni se reescribe; la base impide
--                       una segunda pausa en la misma visita y una reanudación sin pausa.
BEGIN;

CREATE TABLE "park_session_pause" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "max_minutes" INTEGER,
    "operation_key" UUID NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "park_session_pause_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "park_session_pause_tenant_id_id_key" ON "park_session_pause"("tenant_id", "id");
-- Una pausa y un fin por visita: la segunda pausa choca aquí aunque dos equipos la pidan a la vez.
CREATE UNIQUE INDEX "park_session_pause_tenant_id_session_id_kind_key" ON "park_session_pause"("tenant_id", "session_id", "kind");
CREATE UNIQUE INDEX "park_session_pause_tenant_id_operation_key_key" ON "park_session_pause"("tenant_id", "operation_key");

ALTER TABLE "park_session_pause" ADD CONSTRAINT "park_session_pause_tenant_id_session_id_fkey"
  FOREIGN KEY ("tenant_id", "session_id") REFERENCES "park_session"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- La pausa dice su máximo (como regía al pausar); el fin, no. El máximo va de 1 a 30 minutos.
ALTER TABLE park_session_pause ADD CONSTRAINT park_session_pause_datos CHECK (
  kind IN ('PAUSA', 'REANUDA')
  AND (kind = 'PAUSA') = (max_minutes IS NOT NULL)
  AND (max_minutes IS NULL OR max_minutes BETWEEN 1 AND 30)
  AND length(btrim(created_by_name)) >= 2);

-- Solo se pausa una estancia activa, y solo se termina una pausa que existe y que empezó antes.
CREATE FUNCTION l2_pausa_de_estancia_activa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s park_session%ROWTYPE;
  inicio timestamptz;
BEGIN
  SELECT * INTO s FROM park_session WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF s.status <> 'ACTIVA' THEN
    RAISE EXCEPTION 'park_session_pause: la estancia % ya salió', NEW.session_id USING ERRCODE = '23514';
  END IF;
  IF NEW.at < s.started_at THEN
    RAISE EXCEPTION 'park_session_pause: no se pausa antes de entrar' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'REANUDA' THEN
    SELECT at INTO inicio FROM park_session_pause WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id AND kind = 'PAUSA';
    IF inicio IS NULL OR NEW.at < inicio THEN
      RAISE EXCEPTION 'park_session_pause: la estancia % no tiene una pausa que terminar', NEW.session_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER park_session_pause_de_activa BEFORE INSERT ON park_session_pause
  FOR EACH ROW EXECUTE FUNCTION l2_pausa_de_estancia_activa();

SELECT l2_aislar_por_tenant('park_session_pause');
SELECT l2_solo_agregar('park_session_pause');

COMMIT;
