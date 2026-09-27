# Datos provisionales (`src/demo`)

**El modo demo y el simulador se retiraron el 2026-09-26** (MAESTRO, decisión M-6). La app corre
siempre contra su servidor: sin base de datos no arranca.

Lo que queda aquí son datos **inventados** para las pantallas cuyo backend todavía no existe. No son un
modo: se van **archivo por archivo**, cada uno en el paso de la ruta que lo sustituye por la base. El
paso que lo sustituye **borra el archivo en el mismo commit**. Cuando esta carpeta quede vacía, se borra
también, y con ella la regla `demo-solo-desde-las-rutas` de `pnpm arch`.

| Archivo | Qué inventa | Se va con |
|---|---|---|
| `usuarios.ts` | Quién autoriza en los diálogos de anular y cortesía de la caja (usuarios, acceso y permisos ya son de la base) | B3-4 |
| `medios.ts` | Medios de pago y datos que ve el cliente | B3-2 |
| `turno.ts` | Nada: movimientos y excepciones **vacíos** desde el 2026-09-26 (la forma sigue aquí) | B3-1 y B3-5 |
| `caja.ts` | Medios y terminales del cobro (las alícuotas son de la base desde B2-2) | B3-2 |
| `parque.ts` | Nada: sala y representantes **vacíos** desde el 2026-09-26 (la forma sigue aquí) | B4-1 y B4-2 |
| `representantes.ts` | Nada: directorio **vacío** desde el 2026-09-26 | B4-1 |
| `sucursal.ts` | Ajustes del local | B4-4 |
| `restaurante.ts` | Plano y carta | B6-1 |

Ya se fueron: las tasas de cambio (B2-1), el tarifario (B0-5, ahora en la base; lo de desarrollo lo siembra
`scripts/semilla/tarifario.mts`), los dispositivos (B1-3), las cuentas y ventas de ejemplo, el interruptor `NEXT_PUBLIC_DEMO` y el
simulador de operación con sus escenarios.

Además, fuera de esta carpeta queda un dato inventado que incumple la regla y se mueve con B3-3:
el **catálogo de mostrador** de la caja (`features/cash/catalogo-mostrador.ts`: agua, maltas,
tequeños…), que es la carta real del local cuando llegue F0-04.

## Reglas mientras existan

- **Solo las rutas (`app/**`) importan de aquí** y pasan los datos a las pantallas por props. Una
  pantalla o un proveedor que los importe no se podría conectar al servidor sin reescribirse.
  `pnpm arch` lo impide.
- **Se validan contra el contrato al construirse.** Si un dato inventado no cumple el esquema, revienta
  aquí y no cuando llegue el backend.
- **Nada nuevo entra aquí.** Una pantalla nueva nace contra el servidor (patrón del tarifario, CLAUDE.md
  «Del ejemplo al servidor»).
- Nada de datos personales reales.
