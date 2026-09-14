# @l2/domain-identity

Quién puede hacer qué, desde qué aparato y con qué PIN. Implementa §7.3 del plan (F2-02, F2-03,
F2-05, F2-06, F2-11, F2-12). **Puro**: sin React, sin Next, sin reloj; el instante entra como
argumento.

## Qué resuelve

| Pieza | Qué decide |
|---|---|
| `MATRIZ`, `can(actor, acción, { branchId })` | La matriz de §7.3 como dato: `PERMITIDO`, `REQUIERE_AUTORIZACION` (el 🔐) o `DENEGADO`. Deny-by-default, y la sucursal es parte del permiso |
| `explainPermission` | De dónde sale un permiso: el rol, una concesión o una revocación de esa persona (DEC-15) |
| `canAuthorize(autorizador, solicitante, acción)` | Quién puede dar la autorización de un 🔐: solo supervisión o administración, que alcancen la acción en esa sucursal (DEC-24) |
| `visibleSurfaces`, `SURFACE_ACTION` | Qué pantallas ve cada persona, derivado de una acción y no de una lista de roles |
| `checkDevice` | El dispositivo es el primer factor: aprobado, pendiente, revocado o desconocido (ADR-013) |
| `checkNewPin`, `computeLockout`, `describeLockout` | PIN aceptable y bloqueo creciente por intentos fallidos |
| `DEFAULT_STATION_IDLE` | Bloqueo por inactividad de un puesto compartido (F2-12) |

## Qué NO le corresponde

- **Verificar un PIN.** Eso es del servidor, con Argon2 (F2-03). Aquí solo se decide si un PIN
  nuevo es aceptable y cuánto dura un bloqueo.
- **La sesión.** Quién está conectado lo sabe la aplicación; este paquete recibe el `Actor`.
- **Auditar.** Registrar quién autorizó qué es infraestructura (F2-07); aquí se decide si podía.

## Pruebas

`pnpm --filter @l2/domain-identity test` — 81 pruebas. Cada ❌ de la matriz tiene su prueba
negativa (§10.1).
