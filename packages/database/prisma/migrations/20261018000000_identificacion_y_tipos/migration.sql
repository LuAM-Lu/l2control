-- Todo o nada: con un relleno de datos, una migración a medias deja la base en un estado que nadie
-- escribió (Prisma no envuelve la migración en una transacción).
BEGIN;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "presentation" TEXT,
ADD COLUMN     "sku" TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B9-6, M-16): lo que identifica un producto y de qué tipo es.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Lo que ya existe ─────────────────────────────────────────────────────────
-- El tipo sale de la casilla de antes: lo que llevaba existencia es un PRODUCTO; lo demás se preparaba
-- al momento (café, tequeños). Un servicio lo marca administración después, si lo hay.
-- `product` tiene la RLS forzada: el dueño la suspende solo mientras rellena, dentro de esta misma
-- transacción (como la siembra de medios de B3-2).
ALTER TABLE product NO FORCE ROW LEVEL SECURITY;
UPDATE product SET kind = CASE WHEN tracks_stock THEN 'PRODUCTO' ELSE 'PREPARADO' END;
-- Su SKU: las tres primeras letras de la categoría (sin acentos) y un correlativo por orden de creación,
-- como lo hará el dominio (`skuPrefix`) con los que vengan.
WITH numerados AS (
  SELECT id,
         rpad(upper(left(regexp_replace(translate(category, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^A-Za-z]', '', 'g'), 3)), 3, 'X') AS prefijo,
         tenant_id, created_at
    FROM product
), correlativos AS (
  SELECT id, prefijo || '-' || lpad(row_number() OVER (PARTITION BY tenant_id, prefijo ORDER BY created_at, id)::text, 4, '0') AS sku
    FROM numerados
)
UPDATE product p SET sku = c.sku FROM correlativos c WHERE p.id = c.id;
ALTER TABLE product FORCE ROW LEVEL SECURITY;

ALTER TABLE product ALTER COLUMN kind SET NOT NULL;
ALTER TABLE product ALTER COLUMN sku SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "product_tenant_id_sku_key" ON "product"("tenant_id", "sku");

-- ── Las reglas ───────────────────────────────────────────────────────────────
ALTER TABLE product ADD CONSTRAINT product_kind CHECK (kind IN ('PRODUCTO', 'PREPARADO', 'SERVICIO'));
-- Solo se cuenta lo que es un PRODUCTO: el tipo y el control de existencia dicen lo mismo.
ALTER TABLE product ADD CONSTRAINT product_kind_existencia CHECK (tracks_stock = (kind = 'PRODUCTO'));
ALTER TABLE product ADD CONSTRAINT product_sku CHECK (sku ~ '^[A-Z]{3}-[0-9]{4,6}$');
-- El código de barras, del empaque: solo un PRODUCTO lo trae. Mayúsculas, dígitos y guiones.
ALTER TABLE product ADD CONSTRAINT product_barcode CHECK (barcode IS NULL OR (barcode ~ '^[0-9A-Z-]{4,32}$' AND kind = 'PRODUCTO'));
ALTER TABLE product ADD CONSTRAINT product_presentation CHECK (presentation IS NULL OR length(btrim(presentation)) BETWEEN 2 AND 40);
-- Un código, un producto: leerlo en la caja no puede dudar entre dos.
CREATE UNIQUE INDEX product_barcode_unico ON product (tenant_id, barcode) WHERE barcode IS NOT NULL;

-- El SKU, como quién lo creó, no cambia: lo citan los conteos, las listas y lo que se habló de él.
CREATE OR REPLACE FUNCTION l2_producto_no_se_borra() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by, NEW.created_by_name, NEW.sku)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by, OLD.created_by_name, OLD.sku) THEN
    RAISE EXCEPTION 'La tabla product no admite borrar ni cambiar quién la creó ni su SKU: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
