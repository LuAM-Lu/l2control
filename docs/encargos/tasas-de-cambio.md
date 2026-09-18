Construye «Caja → Tasas de cambio»: la tasa del día, su historial y su confirmación. Es la tarea 4.1 del plan final (docs/PLAN-FRONTEND.md) y cubre F3-03, F3-04 y F3-05, con §5.2 y ADR-005.

POR QUÉ IMPORTA MÁS QUE UNA PANTALLA DE AJUSTES: en Venezuela el precio del día depende de la tasa, y el plan la trata como **registro histórico, no como un ajuste que se sobrescribe**: cada pago de ayer referencia la tasa con la que se cobró, y el arqueo de ayer tiene que seguir cuadrando. Además es el vector T2 del plan —tocar la tasa para beneficiarse—, así que ninguna tasa se usa para cobrar hasta que una persona la confirma. Hoy la tasa está **escrita a mano** en tres sitios del código; al terminar este encargo saldrá de aquí.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo entero antes de empezar):
- `packages/domain/rates` (NUEVO, puro, 19 pruebas) — léelo, es lo que decide:
  · `currentRate(historial, par, ahora)`: la última confirmada ya capturada en ese instante, o `null`.
  · `frozenRateOf(tasa)`: la fracción exacta con la que convierte `@l2/domain-money`.
  · `variationBasisPoints(anterior, nueva)` y `needsDoubleCheck(anterior, nueva, umbralBps)`.
  · `currenciesOf(par)`.
- `packages/contracts/src/tasas.ts` (16 pruebas): `ExchangeRateSchema` (valor > 0; **confirmada dice quién y cuándo, o no está confirmada**), `HistorialTasasSchema` (ids únicos; no dos capturas del mismo par en el mismo instante; `umbralVariacionBasisPoints`), `CapturarTasaCommandSchema` (**no admite `confirmed`**), `ConfirmarTasaCommandSchema` (con `valorVerificado` opcional) y `TasaCommandSchema` (solo CAPTURAR y CONFIRMAR: **no existe editar ni borrar**).

EL PATRÓN A COPIAR: `apps/web/src/features/sucursal/SucursalProvider.tsx` y `EditorSucursal.tsx` (proveedor + editor del panel), y `apps/web/src/features/park/RepresentantesScreen.tsx` (lista densa con detalle al lado y hojas de edición). Léelos antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/tasas.ts`
   - `HISTORIAL_DEMO: HistorialTasasDto = HistorialTasasSchema.parse({ ... })` con **seis o siete capturas inventadas** de los últimos días: unas del BCV y alguna MANUAL, todas confirmadas menos la última, que queda **pendiente** para que se vea el caso. Valores alrededor de 228,41 —que es la cifra que hoy está escrita a mano— y `umbralVariacionBasisPoints: 1000` (10 %).
   - Los instantes, **fijos y en el pasado**: nada de `Date.now()` en este archivo, que lo lee el servidor al pintar y cambiaría entre el servidor y el navegador.
   - Cabecera diciendo que son datos inventados hasta F0-04 y que el historial vendrá del servidor (F3-03) y la sincronización del BCV con él (F3-04).

2. NUEVO `apps/web/src/features/cash/TasasProvider.tsx` («use client»)
   - Patrón de `SucursalProvider`: contexto `{ historial: HistorialTasasDto; aplicar(cmd: TasaCommand): string | null }`, clave de `sessionStorage` `"l2:tasas:v1"`, `safeParse` al cargar.
   - `aplicar` valida el mando con `TasaCommandSchema`, calcula el historial nuevo, lo **vuelve a validar entero** con `HistorialTasasSchema` y solo entonces guarda. Devuelve el mensaje de error o `null`. **Valida fuera del actualizador de estado de React**: un `throw` dentro de `setState` rompe el pintado y no hay `try/catch` que lo recoja.
   - `CAPTURAR`: añade una tasa nueva con `id` propio (`crypto.randomUUID()`), `capturedAt` de ahora y **`confirmed: false` siempre**, venga de donde venga. Nunca toca una tasa existente.
   - `CONFIRMAR`: marca esa tasa como confirmada con `confirmedBy` y `confirmedAt`. Antes, con `needsDoubleCheck(currentRate(...), esaTasa, historial.umbralVariacionBasisPoints)`, decide si hacía falta el valor tecleado de nuevo: si hacía falta y `valorVerificado` no llega o **no coincide** con el valor de la tasa, **no confirma** y devuelve el motivo (fail-closed). Confirmar una tasa que ya está confirmada tampoco: devuelve el motivo.
   - Expón también un ayudante `useTasaVigente(par)` que devuelva `{ tasa, congelada }` usando `currentRate` y `frozenRateOf`, con el instante de `useAhoraLocal()` (`../simulacion/SimulacionProvider.tsx`), para que ninguna pantalla repita esa lógica.
   - `TODO(F3-03/F3-04 backend)`: el historial será append-only en el servidor y la sincronización con el BCV entra por ahí.

3. NUEVO `apps/web/src/features/cash/TasasScreen.tsx` («use client»)
   - `<Container ancho="panel">` y `<PageHeader>` con migas Abby Kingdom / Caja / Tasas de cambio.
   - **Arriba, la tasa vigente de cada par** (USD/VES y USDT/VES), grande y legible, con su origen y la hora de captura («BCV · capturada a las 8:00 am»). Si un par no tiene tasa confirmada, **se dice con palabras y con el color de estado que le toca**: sin ella no se cobra en esa moneda (ADR-005). Es un aviso accionable, no un guion bajo.
   - **Capturar la tasa del día**: un campo para el valor, el par y el origen (BCV / MANUAL / COMERCIAL). Al guardar entra **pendiente**, y se ve que entró pendiente.
   - **Confirmar**: sobre una tasa pendiente. Si `needsDoubleCheck` dice que sí, la pantalla pide **teclear el valor otra vez** antes de dejar confirmar, y explica por qué («se aparta un 12 % de la última confirmada»). Si dice que no, se confirma con un toque.
   - **El historial**, lo más reciente arriba: valor, par, origen, cuándo se capturó, quién, y si está confirmada y por quién. **No hay botón de editar ni de borrar** — corregir una tasa mal tecleada es capturar otra, y eso se dice en la pantalla, no solo en el código.
   - Superficie de administración (32 px), tokens de color, `tnum` en todas las cifras, formato de hora de 12 h con `formatClock`, sin emoji. Cifras de bolívares con la coma decimal y el punto de miles como manda CLAUDE.md.

4. NUEVO `apps/web/src/features/cash/TasasPage.tsx` («use client»)
   - Envoltura mínima como `apps/web/src/features/park/RepresentantesPage.tsx`: lee la sesión y pinta la pantalla. Sin sesión, no pinta nada.
   - **El permiso manda**: confirmar una tasa es `tasa.confirmar` (`can(actor, "tasa.confirmar")`, de `@l2/domain-identity`). Recuerda que **`can` devuelve una palabra**, no un booleano: `PERMITIDO`, `REQUIERE_AUTORIZACION` o `DENEGADO`. Quien tiene `DENEGADO` ve el historial y la vigente, pero no el botón de confirmar. No inventes un permiso nuevo para capturar: capturar no cobra nada.

5. QUE LAS SUPERFICIES LEAN LA TASA PUBLICADA (esto es la mitad del encargo)
   - `apps/web/src/features/shell/StationBar.tsx`: hoy recibe `tasa` y `tasaHora` dentro de `contexto`. Que los lea del proveedor con `useTasaVigente("USD/VES")` y **quita esos dos campos del tipo y de quien se los pasa** (`apps/web/app/(estacion)/layout.tsx`, que es lo único que los pasa). Sin tasa confirmada, la píldora de la barra lo dice —es justo lo que §5.2 pide que el cajero vea sin buscarlo—.
   - `apps/web/src/features/cash/CajaScreen.tsx`: hoy recibe `rate: FrozenRate | null` como propiedad desde la ruta. Que lo lea del proveedor y **quita esa propiedad**, incluida la línea escrita a mano de `apps/web/app/(estacion)/caja/page.tsx`. El resto de la caja no cambia: ya está escrita para quedarse sin tasa (`faltaTasa`, «Sin tasa confirmada del día no se puede cobrar en esa moneda»), y ahora ese camino es de verdad.
   - **No toques `PARIDAD_USDT`**: que el USDT vaya a la par del dólar es una decisión del cliente, no un valor que salga de esta pantalla.

LO QUE **NO** TOCAS (lo monta la maestra al integrar):
- `apps/web/app/layout.tsx` (montar el proveedor),
- `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` (la ruta de la sección),
- `apps/web/src/features/shell/navigation.ts` (el enlace del menú).
Deja `TasasPage` exportada y lista, y dilo en el resumen.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`): eso es de la maestra. Si crees que falta algo en `@l2/domain-rates`, **dilo en el resumen** en vez de rodearlo.
- No repitas en la pantalla la aritmética del dominio: `frozenRateOf`, `currentRate`, `variationBasisPoints` y `needsDoubleCheck` ya existen y están probados. Nada de `Number(tasa)` ni `parseFloat` para comparar valores.
- No escribas ninguna tasa a mano, ni como valor por defecto, ni como respaldo «por si acaso». Sin tasa confirmada, **no hay tasa**.
- No añadas editar ni borrar una tasa. No existen en el contrato y no deben existir en la pantalla.
- No llames a ninguna API del BCV: la sincronización es del servidor (F3-04). En la pantalla, el origen `BCV` es un dato que se teclea hasta que exista.
- Ningún emoji. Colores solo desde los tokens. Estado por color + icono + texto.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; **no leas archivos con la terminal**). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: capturar una tasa y ver que entra pendiente y que la caja **no** la usa todavía; confirmarla y ver que la barra de todas las estaciones y la caja cambian; capturar una tasa con un dedo de más (2.284,10 en vez de 228,41) y comprobar que exige teclearla otra vez y que un valor distinto no confirma; borrar el historial y comprobar que la caja bloquea el cobro en bolívares con su aviso; y medir la pantalla a 1366×768 y 1024×768.
