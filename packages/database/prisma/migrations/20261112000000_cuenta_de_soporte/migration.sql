-- T-17 (M-28): la cuenta de soporte. Solo expande (ADR-028): la versión anterior la ignora.
--
-- Una persona de Administración con un nombre de usuario de soporte no sale en «¿Quién entra?»: entra por «Acceso de
-- soporte» con ese nombre y su PIN, desde un equipo aprobado. Marcarla y quitarla deja su asiento en staff_user_change.

-- AlterTable
ALTER TABLE "staff_user" ADD COLUMN "support_login" TEXT;

-- Escrito a mano: solo de Administración, en minúsculas, y único en el tenant.
ALTER TABLE staff_user ADD CONSTRAINT staff_user_support_login
  CHECK (support_login IS NULL OR (role = 'ADMIN' AND support_login ~ '^[a-z0-9][a-z0-9._-]{2,31}$'));
CREATE UNIQUE INDEX staff_user_support_login_unico ON staff_user (tenant_id, support_login) WHERE support_login IS NOT NULL;

-- Lo que le pasa a una persona: también marcarla y quitarle la marca de soporte.
ALTER TABLE staff_user_change DROP CONSTRAINT staff_user_change_kind;
ALTER TABLE staff_user_change ADD CONSTRAINT staff_user_change_kind
  CHECK (kind IN ('ALTA', 'BAJA', 'REINGRESO', 'ROL', 'PIN', 'SOPORTE', 'SOPORTE_FIN'));
