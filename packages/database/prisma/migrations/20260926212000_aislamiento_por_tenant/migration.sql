-- ═══════════════════════════════════════════════════════════════════════════
-- Aislamiento por tenant: RLS FORZADA (ADR-002). Escrito a mano: Prisma no lo expresa.
-- ═══════════════════════════════════════════════════════════════════════════

-- El tenant de la transacción en curso, que fija `conTenant()` con set_config(..., true).
-- NULL si nadie lo fijó: `x = NULL` nunca es verdad, así que sin tenant no hay filas
-- (fail-closed). Un valor que no es un uuid rompe la consulta en vez de adivinar.
CREATE FUNCTION app_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Aísla una tabla por tenant: RLS habilitada Y forzada (también para el dueño de la
-- tabla) y una política por operación, como pide ADR-002. Toda tabla de negocio nueva
-- se aísla con una línea en su migración:   SELECT l2_aislar_por_tenant('mi_tabla');
-- La prueba de integración `toda tabla con tenant_id está aislada` falla si se olvida.
CREATE FUNCTION l2_aislar_por_tenant(tabla regclass, columna name DEFAULT 'tenant_id') RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabla);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabla);
  EXECUTE format('CREATE POLICY tenant_select ON %s FOR SELECT USING (%I = app_tenant())', tabla, columna);
  EXECUTE format('CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK (%I = app_tenant())', tabla, columna);
  EXECUTE format('CREATE POLICY tenant_update ON %s FOR UPDATE USING (%I = app_tenant()) WITH CHECK (%I = app_tenant())', tabla, columna, columna);
  EXECUTE format('CREATE POLICY tenant_delete ON %s FOR DELETE USING (%I = app_tenant())', tabla, columna);
END
$$;
REVOKE EXECUTE ON FUNCTION l2_aislar_por_tenant(regclass, name) FROM PUBLIC;

-- El tenant se ve a sí mismo y a nadie más; sus tablas, por su tenant_id.
SELECT l2_aislar_por_tenant('tenant', 'id');
SELECT l2_aislar_por_tenant('branch');

-- La aplicación no toca el historial de migraciones (los privilegios por defecto del
-- migrador se lo habrían dado).
-- En la base «sombra» con la que Prisma compara no existe esa tabla: de ahí el IF.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE _prisma_migrations FROM l2_app;
  END IF;
END
$$;
