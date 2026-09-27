-- AlterTable
ALTER TABLE "exchange_rate" ADD COLUMN     "held_back" TEXT;

-- AlterTable
ALTER TABLE "exchange_rate_confirmation" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B2-1c, ADR-019): la tasa del BCV se aplica sola con salvaguardas.
-- ═══════════════════════════════════════════════════════════════════════════

-- Por qué una traída automáticamente espera a una persona. Solo la trae un proceso: una tasa
-- tecleada por alguien no se «retiene», espera su confirmación como siempre.
ALTER TABLE exchange_rate ADD CONSTRAINT exchange_rate_held_back CHECK (
  held_back IS NULL OR (held_back IN ('PRIMERA', 'SALTO', 'SOLO_TERCERO') AND captured_by IS NULL));

-- Una confirmación automática no tiene persona detrás: ni quién confirma, ni quién autoriza, ni
-- valor tecleado dos veces. Si lo tuviera, sería una confirmación humana mal etiquetada.
ALTER TABLE exchange_rate_confirmation ADD CONSTRAINT exchange_rate_confirmation_automatic CHECK (
  NOT automatic OR (confirmed_by IS NULL AND authorized_by IS NULL AND NOT double_checked));
