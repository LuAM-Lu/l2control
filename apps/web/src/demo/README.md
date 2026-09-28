# Datos provisionales (`src/demo`)

**El modo demo y el simulador se retiraron el 2026-09-26** (MAESTRO, decisión M-6). La app corre
siempre contra su servidor: sin base de datos no arranca.

Lo que queda aquí son datos **inventados** para las pantallas cuyo backend todavía no existe. No son un
modo: se van **archivo por archivo**, cada uno en el paso de la ruta que lo sustituye por la base. El
paso que lo sustituye **borra el archivo en el mismo commit**. Cuando esta carpeta quede vacía, se borra
también, y con ella la regla `demo-solo-desde-las-rutas` de `pnpm arch`.

| Archivo | Qué inventa | Se va con |
|---|---|---|
| `sucursal.ts` | Ajustes del local | B4-4 |
| `restaurante.ts` | Plano y carta | B6-1 |

Ya se fueron: la sala del parque y el directorio de familias (`parque.ts` y `representantes.ts`,
B4-1 y B4-2: estancias, representantes y niños son de la base), el catálogo de mostrador de la caja (`features/cash/catalogo-mostrador.ts`, B9-1; lo de
desarrollo lo siembra `scripts/semilla/productos.mts`), los medios de pago, sus terminales y los datos que ve el cliente (`medios.ts` y `caja.ts`, B3-2), las tasas de cambio (B2-1), el tarifario (B0-5, ahora en la base; lo de desarrollo lo siembra
`scripts/semilla/tarifario.mts`), los dispositivos (B1-3), las cuentas y ventas de ejemplo, el interruptor `NEXT_PUBLIC_DEMO` y el
simulador de operación con sus escenarios.

## Reglas mientras existan

- **Solo las rutas (`app/**`) importan de aquí** y pasan los datos a las pantallas por props. Una
  pantalla o un proveedor que los importe no se podría conectar al servidor sin reescribirse.
  `pnpm arch` lo impide.
- **Se validan contra el contrato al construirse.** Si un dato inventado no cumple el esquema, revienta
  aquí y no cuando llegue el backend.
- **Nada nuevo entra aquí.** Una pantalla nueva nace contra el servidor (patrón del tarifario, CLAUDE.md
  «Del ejemplo al servidor»).
- Nada de datos personales reales.
