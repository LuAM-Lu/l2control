-- T-10 · Inventario en lote (M-24): las categorías como lista propia y la entrada de inventario inicial.
-- Solo EXPANDE (ADR-028): una tabla nueva y un valor más permitido en un CHECK. La versión anterior sigue
-- funcionando con esta base: no lee la tabla nueva, y una entrada INICIAL solo la escribe esta versión.
--   product_category  las categorías del local: crear, renombrar, unir y retirar una vacía. El producto sigue
--                     guardando el nombre de la suya (`product.category`).
-- Todo o nada: hay un relleno de datos y Prisma no envuelve la migración en una transacción.
BEGIN;

-- CreateTable
CREATE TABLE "product_category" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_name" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by_name" TEXT,

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_category_tenant_id_id_key" ON "product_category"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- Lo mismo que pide `product.category`: de 2 a 24 caracteres.
ALTER TABLE product_category ADD CONSTRAINT product_category_nombre CHECK (length(btrim(name)) BETWEEN 2 AND 24);
ALTER TABLE product_category ADD CONSTRAINT product_category_created_by_name CHECK (length(btrim(created_by_name)) >= 2);
-- Retirada consta quién la retiró; vigente, nadie.
ALTER TABLE product_category ADD CONSTRAINT product_category_retiro CHECK (
  (retired_at IS NULL) = (retired_by_name IS NULL)
  AND (retired_by_name IS NULL OR length(btrim(retired_by_name)) >= 2));
-- Dos vigentes no se llaman igual (sin contar mayúsculas ni espacios de más), como los productos.
CREATE UNIQUE INDEX product_category_vigente
  ON product_category (tenant_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))
  WHERE retired_at IS NULL;

-- ── Lo que ya existe ─────────────────────────────────────────────────────────
-- Las categorías que ya usan los productos de cada local (escrita como la primera vez que apareció) y las de
-- arranque que falten. `product` y `tenant` tienen la RLS forzada: el dueño la suspende solo mientras rellena,
-- dentro de esta misma transacción (como B9-6).
ALTER TABLE product NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;

INSERT INTO product_category (id, tenant_id, name, created_at, created_by_name)
SELECT gen_random_uuid(), tenant_id, nombre, desde, 'L2 Control'
  FROM (
    SELECT DISTINCT ON (tenant_id, lower(regexp_replace(btrim(category), '\s+', ' ', 'g')))
           tenant_id, regexp_replace(btrim(category), '\s+', ' ', 'g') AS nombre, created_at AS desde
      FROM product
     ORDER BY tenant_id, lower(regexp_replace(btrim(category), '\s+', ' ', 'g')), created_at
  ) usadas;

-- Las mismas que `CATEGORIAS_DE_ARRANQUE` en @l2/domain-inventory, que pone la instalación de un local nuevo.
INSERT INTO product_category (id, tenant_id, name, created_by_name)
SELECT gen_random_uuid(), t.id, a.nombre, 'L2 Control'
  FROM tenant t
 CROSS JOIN (VALUES ('Bebidas'), ('Snacks'), ('Golosinas'), ('Helados'), ('Postres'), ('Juguetes'),
                    ('Entradas'), ('Platos'), ('Hamburguesas'), ('Servicios')) AS a(nombre)
 WHERE NOT EXISTS (
   SELECT 1 FROM product_category c
    WHERE c.tenant_id = t.id AND c.retired_at IS NULL AND lower(c.name) = lower(a.nombre));

ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE product FORCE ROW LEVEL SECURITY;

SELECT l2_aislar_por_tenant('product_category');

-- ── El inventario inicial ────────────────────────────────────────────────────
-- La existencia de arranque de un local (lo que ya había el primer día), con su costo. No es una compra:
-- no tiene proveedor ni factura.
ALTER TABLE stock_entry DROP CONSTRAINT stock_entry_kind;
ALTER TABLE stock_entry ADD CONSTRAINT stock_entry_kind CHECK (kind IN ('COMPRA', 'REPOSICION', 'INICIAL'));
ALTER TABLE stock_entry ADD CONSTRAINT stock_entry_inicial CHECK (kind <> 'INICIAL' OR (supplier IS NULL AND invoice IS NULL));

COMMIT;
