-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tax_code" TEXT NOT NULL,
    "tracks_stock" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_by" UUID,
    "scheduled_by_name" TEXT NOT NULL,

    CONSTRAINT "product_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_tenant_id_id_key" ON "product"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "product_price_tenant_id_product_id_effective_from_idx" ON "product_price"("tenant_id", "product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "product_price_tenant_id_id_key" ON "product_price"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_price_tenant_id_product_id_scheduled_at_key" ON "product_price"("tenant_id", "product_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "product"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- Escrito a mano (B9-1, F8-02, §9.9): el catálogo de productos es un dato del local, y su precio
-- un calendario de solo-agregar. Producción nace sin productos (M-12): nada se siembra aquí.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El producto ──────────────────────────────────────────────────────────────
ALTER TABLE product ADD CONSTRAINT product_name CHECK (length(btrim(name)) BETWEEN 2 AND 40);
ALTER TABLE product ADD CONSTRAINT product_category CHECK (length(btrim(category)) BETWEEN 2 AND 24);
-- El trato del IVA (§5.3); la columna no admite nulos, así que el IN no tiene nulo que colar.
ALTER TABLE product ADD CONSTRAINT product_tax_code CHECK (tax_code IN ('GENERAL', 'REDUCIDA', 'EXENTA'));
ALTER TABLE product ADD CONSTRAINT product_created_by_name CHECK (length(btrim(created_by_name)) >= 2);
-- Un nombre, un producto: dos «Agua mineral» en la caja son un cobro equivocado esperando a pasar.
-- El dominio compara además sin acentos (`nameKey`); esto es la última línea.
CREATE UNIQUE INDEX product_nombre_unico ON product (tenant_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

-- No se borra (lo vendido lo nombra) y quién lo creó no cambia. Se renombra, se recategoriza, se
-- cambia su trato del IVA o su control de stock, y se aparta o se vuelve a vender.
CREATE FUNCTION l2_producto_no_se_borra() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by, NEW.created_by_name)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by, OLD.created_by_name) THEN
    RAISE EXCEPTION 'La tabla product no admite borrar ni cambiar quién la creó: % no está permitido (regla 5).', TG_OP
      USING ERRCODE = 'L2001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_no_se_borra BEFORE UPDATE OR DELETE ON product
  FOR EACH ROW EXECUTE FUNCTION l2_producto_no_se_borra();
CREATE TRIGGER product_no_se_vacia BEFORE TRUNCATE ON product
  FOR EACH STATEMENT EXECUTE FUNCTION l2_rechazar_cambios();

SELECT l2_aislar_por_tenant('product');

-- ── El precio ────────────────────────────────────────────────────────────────
-- Mayor que cero (lo regalado es una cortesía con firma, no un precio cero) y hasta $ 10.000,00
-- (`MAX_PRICE_MINOR`): por encima, alguien tecleó bolívares o céntimos como dólares.
ALTER TABLE product_price ADD CONSTRAINT product_price_amount CHECK (amount_minor > 0 AND amount_minor <= 1000000);
ALTER TABLE product_price ADD CONSTRAINT product_price_currency CHECK (currency = 'USD');
-- F8-02: cambiar un precio no altera lo ya vendido. Nada empieza antes de programarse.
ALTER TABLE product_price ADD CONSTRAINT product_price_no_hacia_atras CHECK (effective_from >= scheduled_at);
ALTER TABLE product_price ADD CONSTRAINT product_price_scheduled_by_name CHECK (length(btrim(scheduled_by_name)) >= 2);

SELECT l2_aislar_por_tenant('product_price');
-- Regla 5: lo programado no se edita ni se borra. Para corregir un precio futuro se programa otro
-- para el mismo día; manda el último.
SELECT l2_solo_agregar('product_price');
