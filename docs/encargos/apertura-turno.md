Construye la **apertura de turno** y haz que las **excepciones del turno** sean de verdad. Es la tarea 4.3 del plan final (docs/PLAN-FRONTEND.md) y cubre F4-01 y F4-08. No es una sección del panel: vive en `/turno` y en la caja.

POR QUÉ: hoy el turno es un texto fijo en la barra («Turno desde 2:00 pm») y las excepciones del turno son una lista de ejemplo que no cambia nunca — ni las anulaciones ni las cortesías que se hacen en la caja llegan a ella. Sin turno de verdad no se puede decir qué es lo que hay que cuadrar al cerrar, y sin excepciones de verdad el corte Z no sirve para vigilar nada (§7.5).

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo entero antes de empezar):
- `packages/contracts/src/turno.ts` (17 pruebas): `TurnoSchema` (id, `deviceId`, estado, quién y cuándo lo abrió, `fondos` por moneda, y la firma del corte Z), `TurnosSchema` —que impone **I-06: un equipo no puede tener dos turnos abiertos**— y `TurnoCommandSchema` (`ABRIR`, `INICIAR_CIERRE`, `CORTE_Z`).
- Lo que el contrato impide, y que **no tienes que comprobar con `if`**: un fondo negativo, la misma moneda declarada dos veces, un corte Z sin firma, cerrar antes de abrir, dos turnos abiertos en el mismo equipo, y **reabrir un turno cerrado** — el corte Z es irreversible (F4-06) y por eso ese mando no existe.
- `@l2/domain-cash` ya tiene lo que calcula: `assertShiftAcceptsMoney` (guarda del turno sellado), `tallyShift`, `reconcile` y `countDenominations`. **No reimplementes nada de eso.**

EL PATRÓN A COPIAR: `apps/web/src/features/cash/TasasProvider.tsx` (proveedor con mandos validados) y `apps/web/src/features/cash/TurnoScreen.tsx`, que es la pantalla que ya existe y donde entra casi todo esto. Léelos enteros antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/turnos.ts`
   - `TURNOS_DEMO: TurnosDto = TurnosSchema.parse({ ... })` con **un turno abierto** en el equipo del mostrador (fondos: unos dólares y unos bolívares) y **uno cerrado** del día anterior con su firma. Instantes fijos, nada de `Date.now()` en este archivo.
   - Cabecera: datos inventados hasta F0-04; el turno real vendrá del servidor (F4-01) y el equipo, del registro del dispositivo (F2-12).

2. NUEVO `apps/web/src/features/cash/TurnosProvider.tsx` («use client»)
   - Contexto `{ turnos: TurnosDto; abierto: TurnoDto | null; aplicar(cmd: TurnoCommand): string | null }`, clave de `sessionStorage` `"l2:turnos:v1"`, `safeParse` al cargar, **validación fuera del actualizador de estado de React**.
   - `ABRIR` pone el `id` y el `abiertoEn` —no vienen en el mando a propósito— y deja que el contrato rechace si ese equipo ya tiene uno abierto. Ese mensaje es el que se enseña.
   - `abierto` es el turno del equipo de esta caja. Mientras no exista el registro de dispositivos (F2-12), usa una constante `DEVICE_MOSTRADOR` con su `TODO(F2-12/backend)`.
   - `TODO(F4-01/backend)`: los turnos vendrán del servidor.

3. `apps/web/src/features/cash/TurnoScreen.tsx` — abrir el turno
   - **Sin turno abierto, la pantalla pide abrirlo**: un campo por moneda para declarar el fondo inicial (USD y VES), y nada más. Cero es un fondo válido y hay que poder escribirlo: se empieza sin cambio y se dice.
   - Con turno abierto, la pantalla es la que ya existe (arqueo y corte Z), más **desde cuándo está abierto y quién lo abrió**.
   - El corte Z usa el mando `CORTE_Z` con quién lo firma. Después, la pantalla deja claro que ese turno está sellado y que no hay vuelta atrás.

4. `apps/web/src/features/cash/CajaScreen.tsx` — sin turno no se cobra (F4-01)
   - Si no hay turno abierto, la caja **no cobra**: lo dice y lleva a `/turno`, igual que ya hace cuando no hay medios de pago (`SinMediosDePago`, copia su forma). No inventes un aviso flotante para esto: es un estado de la pantalla.
   - No cambies nada del cobro en sí.

5. `apps/web/src/features/shell/StationBar.tsx` — la barra dice el turno de verdad
   - Hoy recibe `turnoAbierto` como texto en `contexto`. Que lo lea del proveedor y **quita ese campo** del tipo y de `apps/web/app/(estacion)/layout.tsx`. Sin turno, la píldora lo dice, como ya hace con la tasa.

6. Las excepciones del turno, de verdad (F4-08)
   - NUEVO `apps/web/src/features/cash/excepciones.ts`: una función **pura** que construya `Excepcion[]` (el tipo ya existe en `apps/web/src/features/cash/turno.ts`) a partir de lo que ya hay en memoria: las **cortesías** de las cuentas (`lineasDeCortesia` en `features/cuentas/cuentas.ts`) y las **anulaciones** y **reimpresiones** de las ventas (`useVentas`). Sin fechas propias: el instante entra como argumento.
   - `TurnoScreen` e `InicioScreen` pasan a pintar esa lista en vez de `DEMO_EXCEPCIONES`. Las dos usan el mismo componente `ExcepcionesTurno`, que no se toca.
   - Cada excepción dice la hora, qué fue, en qué cuenta, quién la hizo y quién la autorizó. Si algo no consta, se calla — **no lo inventes** («Sistema», «Anónimo» y similares están prohibidos).

LO QUE **NO** TOCAS (lo monta la maestra al integrar):
- `apps/web/app/layout.tsx` (montar el proveedor).
El resto de rutas que sí tocas —`(estacion)/layout.tsx`— están en la lista de arriba a propósito.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`). Si crees que falta algo, **dilo en el resumen**.
- No inventes un mando para reabrir un turno cerrado: no existe, y esa ausencia es la decisión (F4-06).
- No toques el arqueo ni el cuadre: `tallyShift` y `reconcile` ya están probados en el dominio.
- No toques las pantallas de tasas, medios de pago, impuestos ni impresoras.
- Ningún emoji. Colores solo desde los tokens. Objetivos táctiles de POS: 56 px.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; **no leas archivos con la terminal**). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: cerrar el turno con un corte Z y comprobar que la caja deja de cobrar y lo dice; abrirlo declarando fondos y ver que la barra y la caja vuelven a funcionar; escribir un fondo negativo y ver el mensaje del contrato; dar una cortesía en la caja y verla aparecer en las excepciones del turno y en Inicio; y medir `/turno` a 1366×768 y 1024×600.
