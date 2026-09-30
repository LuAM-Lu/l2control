-- ═══════════════════════════════════════════════════════════════════════════
-- El umbral del arqueo pasa a los ajustes de la sucursal (B4-4). Un conteo guarda con qué umbral
-- se decidió quién firma su Z: si el local lo cambia después, el conteo sellado sigue diciendo lo
-- que valía entonces. Los anteriores quedan en NULL: se decidieron con $ 1,00 (M-13).
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "shift_count" ADD COLUMN     "threshold_usd_minor" BIGINT;

-- Escrito a mano.
ALTER TABLE shift_count ADD CONSTRAINT shift_count_umbral CHECK (threshold_usd_minor IS NULL OR threshold_usd_minor >= 0);
-- Con umbral y diferencia medida, la firma es la que dice el umbral: la base no deja asentar otra.
ALTER TABLE shift_count ADD CONSTRAINT shift_count_firma_por_umbral CHECK (
  threshold_usd_minor IS NULL OR difference_usd_minor IS NULL
  OR (signer = 'CAJERA') = (difference_usd_minor <= threshold_usd_minor)
);
