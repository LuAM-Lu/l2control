-- AlterTable
ALTER TABLE "product" ADD COLUMN     "min_stock" INTEGER;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B9-5, F8-08, M-16): el stock mínimo de un producto es su punto de reorden. Se edita
-- (el cambio queda en la auditoría); un mínimo negativo o desmesurado es un error de tecleo.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE product ADD CONSTRAINT product_min_stock CHECK (min_stock IS NULL OR min_stock BETWEEN 0 AND 1000000);
