-- B4-19 · Pagar el parque antes de salir (M-39, X-4). Solo EXPANDE (ADR-028): una tabla nueva que la versión anterior no
-- lee, una causa más y una recarga que antes se negaba y ahora se permite solo con esa tabla.
--   · park_session_prepaid  el tiempo abierto de un niño que pasa a un paquete al pagarlo antes de salir: el paquete, sus
--                           minutos (desde que entró) y su precio, a nombre de quien lo hizo. Una por estancia, de una
--                           activa y de tiempo abierto; nada se corrige ni se borra.
--   · account_version.cause admite PAGAR_AHORA (la cuenta de la familia pasa a la cola con lo de sus niños).
--   · la recarga de tiempo admite una estancia de tiempo abierto que ya pasó a un paquete.
BEGIN;

CREATE TABLE "park_session_prepaid" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "package_id" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "operation_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "park_session_prepaid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "park_session_prepaid_tenant_id_id_key" ON "park_session_prepaid"("tenant_id", "id");
CREATE UNIQUE INDEX "park_session_prepaid_tenant_id_session_id_key" ON "park_session_prepaid"("tenant_id", "session_id");

ALTER TABLE "park_session_prepaid" ADD CONSTRAINT "park_session_prepaid_tenant_id_session_id_fkey"
  FOREIGN KEY ("tenant_id", "session_id") REFERENCES "park_session"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Escrito a mano: un paquete de tiempo fijo, en dólares, con su nombre y quién lo hizo.
ALTER TABLE park_session_prepaid ADD CONSTRAINT park_session_prepaid_datos CHECK (
  minutes > 0 AND price_minor >= 0 AND currency = 'USD'
  AND length(btrim(package_id)) >= 1 AND length(btrim(package_name)) >= 1 AND length(btrim(created_by_name)) >= 2);

-- Solo de una estancia activa y de tiempo abierto: un paquete fijo ya tiene sus minutos.
CREATE FUNCTION l2_prepago_de_tiempo_abierto() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s park_session%ROWTYPE;
BEGIN
  SELECT * INTO s FROM park_session WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF s.status <> 'ACTIVA' OR s.duration_minutes IS NOT NULL THEN
    RAISE EXCEPTION 'park_session_prepaid: la estancia % no es de tiempo abierto en sala', NEW.session_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER park_session_prepaid_de_tiempo_abierto BEFORE INSERT ON park_session_prepaid
  FOR EACH ROW EXECUTE FUNCTION l2_prepago_de_tiempo_abierto();

SELECT l2_aislar_por_tenant('park_session_prepaid');
SELECT l2_solo_agregar('park_session_prepaid');

-- La recarga de una estancia de tiempo abierto que ya pasó a un paquete (B4-19): ya tiene minutos que sumar.
CREATE OR REPLACE FUNCTION l2_recarga_de_estancia_activa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s park_session%ROWTYPE;
BEGIN
  SELECT * INTO s FROM park_session WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  IF NOT FOUND THEN
    RETURN NEW; -- la FK compuesta lo rechaza
  END IF;
  IF s.status <> 'ACTIVA' OR (s.duration_minutes IS NULL AND NOT EXISTS (
       SELECT 1 FROM park_session_prepaid p WHERE p.tenant_id = NEW.tenant_id AND p.session_id = NEW.session_id)) THEN
    RAISE EXCEPTION 'park_session_extension: la estancia % no admite recarga (cerrada o de tiempo abierto)', NEW.session_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA', 'EMPEZAR_EVENTO', 'ANULAR_ENTRADA', 'DESVINCULAR', 'JUNTAR', 'DIVIDIR', 'UNIR', 'CAMBIAR_MESA', 'PAGAR_AHORA'));

COMMIT;
