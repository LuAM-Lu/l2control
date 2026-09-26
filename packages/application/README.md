# @l2/application

Los casos de uso del servidor (PLAN §9.2 ❹): cada uno valida con el contrato, aplica el dominio y
escribe en la base dentro de la transacción del tenant. **Es la única puerta de las apps a la base**:
`apps → application → database` (`pnpm arch` lo impone).

## Qué resuelve

- **`conectar(url)`** abre la base (y se niega si el usuario se salta la RLS) y devuelve los casos de
  uso agrupados por dominio: `app.tarifario`, `app.sucursal`…
- **Cada caso de uso recibe un `Contexto`** (`tenantId`, `branchId`) y nunca lo deduce.
- **El servidor revalida siempre.** Un comando recibe `unknown`, lo que mandó el navegador, y lo pasa
  por el contrato antes de tocar nada (ADR-017).
- **Un rechazo se devuelve, no se lanza**: `Resultado<T>` de `@l2/contracts`, con motivo `INVALIDO`
  (y sus problemas campo por campo), `CONFLICTO`, `NO_PERMITIDO` o `NO_DISPONIBLE`. Lanzar queda para
  lo inesperado.

| Dominio | Casos de uso | Paso |
|---|---|---|
| Parque | `tarifario.leer`, `tarifario.publicar` (versión nueva; dos a la vez → `CONFLICTO`) | B0-5 |
| Sucursal | `sucursal.asegurar` (semillas; idempotente) | B0-5 |

## Qué NO le corresponde

- **Reglas de negocio puras**: viven en `packages/domain/*`. Aquí solo se orquestan.
- **Forma de los datos**: `@l2/contracts`.
- **SQL, RLS y migraciones**: `@l2/database`.
- **Next, cookies, rutas**: `apps/web`. Este paquete no sabe que existe un navegador.
- **Permisos**: llegan en B1-5 con `can()` del dominio de identidad. Hasta entonces, la web solo
  deja escribir en desarrollo (`escrituraSinSesion()` en `apps/web/src/servidor`).

## Añadir un caso de uso

1. Su contrato en `@l2/contracts` y, si tiene reglas, su dominio.
2. `src/<dominio>/<caso>.ts` con una función `casos<Algo>(base)`, registrada en `conectar()`.
3. Su prueba `*.test-db.ts` contra `l2control_test`: el camino feliz, el contrato, el aislamiento
   entre tenants y lo que pase si dos personas lo hacen a la vez.
