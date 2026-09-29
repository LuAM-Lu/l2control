-- ═══════════════════════════════════════════════════════════════════════════
-- Tiempo real (B5-1, ADR-025): la tabla outbox.
--
-- Cada asiento HECHO de la auditoría añade aquí una fila en la MISMA transacción que la
-- operación: si la operación se deshace, su evento también; si se confirma, el evento ya está
-- escrito aunque el worker esté caído, y sale cuando vuelva. Todo caso de uso que escribe ya
-- audita (§3, DoD 3), así que ninguno puede olvidarse de avisar.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "audit_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_event_tenant_id_published_at_id_idx" ON "outbox_event"("tenant_id", "published_at", "id");

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branch"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE outbox_event ADD CONSTRAINT outbox_event_action_forma CHECK (action ~ '^[a-z_]+\.[a-z_]+$');
ALTER TABLE outbox_event ADD CONSTRAINT outbox_event_publicado_despues CHECK (published_at IS NULL OR published_at >= created_at);

SELECT l2_aislar_por_tenant('outbox_event');

-- La aplicación añade (por el disparador) y marca lo publicado; nada más. No borra: lo publicado
-- se queda como rastro de lo que se contó en vivo.
REVOKE UPDATE, DELETE ON outbox_event FROM l2_app;
GRANT UPDATE (published_at) ON outbox_event TO l2_app;

-- Publicar es una sola vez: lo publicado no vuelve a pendiente ni cambia de instante.
CREATE FUNCTION l2_outbox_se_publica_una_vez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'outbox_event %: ya está publicado', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  IF NEW.published_at IS NULL THEN
    RAISE EXCEPTION 'outbox_event %: publicar es poner el instante, no quitarlo', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER outbox_event_se_publica_una_vez BEFORE UPDATE ON outbox_event
  FOR EACH ROW EXECUTE FUNCTION l2_outbox_se_publica_una_vez();

-- El asiento HECHO produce su evento y despierta al worker. `pg_notify` se entrega al confirmar
-- la transacción, nunca antes; dos avisos iguales en la misma transacción llegan como uno.
-- El aviso no lleva datos: el worker lee la tabla (y la barre por si un aviso se perdió).
CREATE FUNCTION l2_outbox_desde_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO outbox_event (tenant_id, branch_id, audit_id, action)
    VALUES (NEW.tenant_id, NEW.branch_id, NEW.id, NEW.action);
  PERFORM pg_notify('l2_outbox', NEW.tenant_id::text);
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_log_al_outbox AFTER INSERT ON audit_log
  FOR EACH ROW WHEN (NEW.outcome = 'HECHO') EXECUTE FUNCTION l2_outbox_desde_auditoria();
