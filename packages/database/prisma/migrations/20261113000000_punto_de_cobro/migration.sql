-- B3-9 (M-31): el punto de cobro. Solo expande (ADR-028): la versión anterior ignora las columnas nuevas y sigue
-- abriendo turnos como siempre.
--
-- Un equipo marcado como punto de cobro abre su turno como hasta ahora. En otro, abrirlo pide el PIN de
-- administración y un motivo («La laptop de caja no enciende»): el turno guarda quién lo autorizó y por qué, e Inicio
-- lo avisa mientras siga abierto. Un equipo, un turno (I-06) sigue igual.

-- Todo o nada: lleva un relleno de datos (Prisma no envuelve la migración en una transacción).
BEGIN;

-- AlterTable
ALTER TABLE "cash_shift" ADD COLUMN     "outside_point_by" UUID,
ADD COLUMN     "outside_point_by_name" TEXT,
ADD COLUMN     "outside_point_reason" TEXT;

-- AlterTable
ALTER TABLE "device" ADD COLUMN     "cash_point" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "cash_shift" ADD CONSTRAINT "cash_shift_tenant_id_outside_point_by_fkey" FOREIGN KEY ("tenant_id", "outside_point_by") REFERENCES "staff_user"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B3-9, M-31).
-- ═══════════════════════════════════════════════════════════════════════════

-- Quién autorizó, su nombre y el motivo van juntos o no van: un turno fuera del punto sin su autorización no se
-- puede auditar.
ALTER TABLE cash_shift ADD CONSTRAINT cash_shift_fuera_del_punto CHECK (
  (outside_point_by IS NULL AND outside_point_by_name IS NULL AND outside_point_reason IS NULL)
  OR (outside_point_by IS NOT NULL AND length(btrim(outside_point_by_name)) >= 2 AND length(btrim(outside_point_reason)) >= 3)
);

-- La apertura no se reescribe: tampoco quién la autorizó fuera del punto ni por qué.
CREATE OR REPLACE FUNCTION l2_turno_solo_avanza() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  orden CONSTANT text[] := ARRAY['ABIERTO', 'EN_CIERRE', 'CERRADO_Z'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla cash_shift solo admite filas nuevas: DELETE no está permitido (regla 5).'
      USING ERRCODE = 'L2001';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.branch_id, NEW.device_id, NEW.point_label, NEW.business_date,
      NEW.opened_at, NEW.opened_by, NEW.opened_by_name,
      NEW.outside_point_by, NEW.outside_point_by_name, NEW.outside_point_reason)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.branch_id, OLD.device_id, OLD.point_label, OLD.business_date,
      OLD.opened_at, OLD.opened_by, OLD.opened_by_name,
      OLD.outside_point_by, OLD.outside_point_by_name, OLD.outside_point_reason)
     OR array_position(orden, NEW.status) < array_position(orden, OLD.status)
     OR (OLD.closed_at IS NOT NULL AND (NEW.closed_at, NEW.closed_by, NEW.closed_by_name)
                                       IS DISTINCT FROM (OLD.closed_at, OLD.closed_by, OLD.closed_by_name)) THEN
    RAISE EXCEPTION 'cash_shift %: un turno solo avanza hacia el corte Z y no reescribe su apertura ni su cierre', OLD.id
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Lo que ya existe ─────────────────────────────────────────────────────────
-- Al actualizar, ninguna caja se bloquea ese día: cada equipo que ya abrió un turno queda como punto de cobro.
-- `device` tiene la RLS forzada: el dueño la suspende solo mientras rellena, dentro de esta misma transacción.
ALTER TABLE device NO FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_shift NO FORCE ROW LEVEL SECURITY;
UPDATE device SET cash_point = true WHERE EXISTS (SELECT 1 FROM cash_shift s WHERE s.device_id = device.id AND s.tenant_id = device.tenant_id);
ALTER TABLE cash_shift FORCE ROW LEVEL SECURITY;
ALTER TABLE device FORCE ROW LEVEL SECURITY;

COMMIT;
