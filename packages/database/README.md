# @l2/database

Persistencia de L2 Control (PLAN §9.2 ❸): el esquema Prisma, las migraciones y el aislamiento por
tenant con RLS forzada (ADR-002, ADR-007).

## Qué resuelve

- **Una sola puerta: `abrirBase(url)` → `conTenant(tenantId, trabajo)`.** Cada operación va en una
  transacción que fija `app.tenant_id` solo para esa transacción. No hay otro cliente que pedir, así
  que no se puede olvidar el tenant.
- **La base se defiende sola.** Toda tabla con `tenant_id` tiene RLS habilitada y **forzada**, con
  una política por operación. Sin tenant fijado no se ve ninguna fila ni se escribe ninguna; con el
  tenant A, las filas de B no existen.
- **Se niega a arrancar mal configurada.** `abrirBase` rechaza un usuario que se salte la RLS
  (superusuario o `BYPASSRLS`): conectarse así apagaría el aislamiento sin que nadie lo notara.

## Qué NO le corresponde

- **Reglas de negocio.** Viven en `packages/domain/*`, que no conoce Prisma.
- **Casos de uso.** Orquestar dominio, persistencia, permisos y auditoría es de
  `packages/application`. **Las apps nunca importan este paquete** (`pnpm arch` lo impide).
- **Validar la forma de los datos que llegan.** Eso es de `@l2/contracts`.

## Usuarios de la base

| Usuario | Para qué | Puede |
|---|---|---|
| `postgres` | Administrar el servidor | Todo. **Ignora la RLS**: nunca lo usa la aplicación |
| `l2_migrator` | Aplicar migraciones (`L2_DB_MIGRATOR_URL`) | Crear y alterar tablas. La RLS forzada le aplica |
| `l2_app` | La aplicación (`L2_DB_APP_URL`) | Leer y escribir filas de su tenant. No crea tablas ni lee `_prisma_migrations` |

## Comandos

```bash
pnpm --filter @l2/database db:migrate   # crea y aplica una migración en desarrollo
pnpm --filter @l2/database db:status    # qué migraciones faltan
pnpm test                                # reglas del esquema, sin base
pnpm test:db                             # aislamiento contra l2control_test (necesita pnpm infra:up)
```

## Añadir una tabla de negocio

1. El modelo lleva `tenantId String @map("tenant_id") @db.Uuid`, y `tenantId` es la primera columna
   de todo índice compuesto. El dinero es `BigInt` en unidades menores, nunca `Float`.
2. `db:migrate -- --create-only --name <nombre>` y al final del SQL generado:

   ```sql
   SELECT l2_aislar_por_tenant('nombre_de_la_tabla');
   ```

3. `db:migrate` para aplicarla y `pnpm test:db`. Si se olvidó el paso 2, falla
   «toda tabla con tenant_id tiene RLS habilitada, forzada y las cuatro políticas».

Una tabla sin `tenant_id` (como `tenant`) es una decisión de ADR-002: se añade a la lista de
excepciones de las dos pruebas y se explica por qué.

## Trampas

- `prisma migrate dev --create-only` **aplica antes las migraciones pendientes**. Si una ya se
  aplicó, no se edita: se escribe otra.
- La base «sombra» con la que Prisma compara no tiene `_prisma_migrations`: el SQL que la toque va
  dentro de un `IF to_regclass(...)`.
- Prisma 7 no lee `.env` solo; `prisma.config.ts` carga el de la raíz.
