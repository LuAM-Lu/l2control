Dale a la sala del parque las dos cosas que la puerta necesita hacer después de registrar a un niño: **ponerle nombre** y **vincularlo a una mesa**. Es la parte B de la tarea 4.5 del plan final (docs/PLAN-FRONTEND.md) y cubre las decisiones DEC-28 y DEC-29 (docs/PLAN.md §14).

POR QUÉ: el cliente contó cómo se comporta la gente en Abby Kingdom. En la puerta hay cola, las tablets no tienen teclado físico y teclear el nombre de cada niño era lo que más tardaba: por eso ahora se entra **solo con la pulsera** y el nombre se pone después, con los niños ya jugando y sin nadie esperando (DEC-28). Y como los adultos dejan a los niños y **se sientan**, quien está en la puerta es quien sabe de qué familia son: vincular las pulseras a una mesa deja de ser solo cosa del mesero (DEC-29).

DÓNDE VA: en la sala, `/monitor`. Las dos acciones cuelgan de la **ficha del niño**, la hoja (`Sheet`) que ya se abre al tocar su tarjeta o al pasar su pulsera por el lector. Ahí es donde la persona de la puerta ya mira.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo antes de empezar):
- `packages/contracts/src/park.ts`: `KidSchema.name` es **opcional** y existe `NombrarEstanciaCommandSchema` (`sessionId`, `name`, `nickname?`; **sin motivo**: completar un dato no es una decisión que haya que justificar).
- `packages/contracts/src/eventos.ts`: el evento `estancia.nombrada` (`sessionId`, `name`, `nickname?`) y el que ya existía, `mesa.vinculada` (`tableId`, `sessionIds` con al menos uno).
- `packages/domain/park/src/index.ts`: `ParkSession.childName` es opcional.
- `apps/web/src/features/park/view-model.ts`: `nombreVisible({ childNickname, childName, wristbandCode })` decide en **un solo sitio** cómo se llama una estancia: apodo, si no nombre, si no la pulsera. Úsala siempre; no escribas `?? "Sin nombre"` por tu cuenta.

EL PATRÓN A COPIAR: `apps/web/src/features/mesas/VincularPulseras.tsx` (hoja con lector, lista de niños por familia y botón de confirmar) y `apps/web/src/features/mesas/MesasScreen.tsx` en su función `vincular` (cómo se emite `mesa.vinculada`). Léelos enteros antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. `apps/web/src/features/simulacion/proyeccion.ts` — que el nombre llegue a todas las pantallas
   - Añade el caso `estancia.nombrada`: busca la sesión por `sessionId` y devuelve un estado nuevo con `kid: { ...kid, name, ...(nickname ? { nickname } : {}) }`. Si esa sesión no existe —ya salió, o el evento llegó fuera de orden—, **devuelve el estado sin tocar**, como hacen los demás casos: no se inventa una sesión.
   - El archivo es puro (`estado + evento → estado`): sin fechas, sin azar, sin efectos.

2. `apps/web/src/features/simulacion/describir.ts`
   - Una línea para `estancia.nombrada`, en el mismo tono que las demás: qué pasó, en palabras de quien opera.

3. NUEVO `apps/web/src/features/park/PonerNombre.tsx` («use client»)
   - Formulario pequeño, pensado para ir **dentro** de la ficha del niño: `Input` de nombre y `Input` de apodo (opcional), y un botón de guardar.
   - Valida con `NombrarEstanciaCommandSchema.safeParse` y enseña el mensaje del contrato **junto al campo**, no en un `alert` ni en la consola. Si no pasa, no emite nada (fail-closed).
   - Props: `{ sessionId, nombreActual?, apodoActual?, onGuardar(cmd: NombrarEstanciaCommand): void, onCancelar(): void }`. El componente no conoce la simulación: recibe y emite.
   - Objetivo táctil de tablet: 48 px como mínimo en campos y botones.

4. NUEVO `apps/web/src/features/park/VincularAMesa.tsx` («use client»)
   - Una `Sheet` que se abre desde la ficha de un niño y responde a «¿en qué mesa están sus padres?».
   - Props: `{ abierto, onCerrar, sesionId, estado: EstadoLocal, plano: readonly DiningTableDto[], onVincular(tableId: string, sessionIds: string[]): void }`.
   - **Los hermanos vienen marcados**: usa `ninosSinMesa(estado)` (`apps/web/src/features/mesas/mesas.ts`) para encontrar el grupo de familia del niño de la ficha y preselecciona a todos los de su familia que aún no tienen mesa; cada uno se puede desmarcar. Llegan juntos y se sientan juntos: eso es lo normal, no la excepción.
   - **Las mesas que se ofrecen son las abiertas**: las que tienen ocupación en `estado.mesas`. Cada una con su etiqueta, cuántos comensales y cuántos niños lleva ya. Si no hay ninguna abierta, estado vacío con palabras: la mesa la abre el mesero primero, y desde aquí no se abre.
   - **Fail-closed**: un niño que ya está en otra mesa no se ofrece; si se intenta, se dice en qué mesa está (mismo comportamiento que `VincularPulseras`). Con cero niños marcados o sin mesa elegida, el botón de confirmar está apagado y **dice por qué**.
   - El texto explica la consecuencia, como ya hace la hoja del mesero: «Su tiempo de parque se cobrará con la cuenta de la mesa: la familia paga una sola vez».

5. `apps/web/src/features/park/ParkMonitor.tsx` — las dos acciones en la ficha
   - **Permiso**: `useActorEnSesion()` (`../identity/sesion.ts`) y `can(actor, "parque.vincularMesa")` del dominio de identidad, como hace `apps/web/src/features/cash/VentasScreen.tsx`. Sin permiso, la acción de vincular **no se pinta** (no se pinta apagada). Poner el nombre no necesita permiso propio: quien está en la sala ya ve al niño.
   - En la ficha, junto a «Registrar su salida»:
     · **«Poner nombre»** cuando la estancia no tiene nombre, **«Corregir el nombre»** cuando sí. Abre `PonerNombre` dentro de la misma hoja (no una hoja encima de otra). Al guardar, emite `estancia.nombrada` con `sim.emitir` y, si devuelve `{ ok: false }`, avisa con `avisar.aviso` diciendo el motivo; nunca en silencio.
     · **«Vincular a una mesa»**, que abre `VincularAMesa`. Al confirmar, emite `mesa.vinculada` igual que `MesasScreen.vincular`, con el mismo trato del resultado.
   - Si el niño ya está vinculado, la ficha lo dice («En la mesa 3») en vez de ofrecer vincularlo otra vez.
   - Mantén la hoja legible a 1280×800 y a 1024×600: el pie no puede empujar el contenido fuera de la pantalla. Si hacen falta dos filas de botones, que las haya.

6. `apps/web/src/features/park/ParkChildCard.tsx` — que se vea de un vistazo
   - Una estancia sin nombre ya se titula con su pulsera (`nombreVisible`). Añade, en la densidad normal, una marca discreta de que **le falta el nombre**: texto corto y un icono, con los tokens de siempre. No es un error ni una urgencia —la estancia funciona igual—, así que **no uses `state-crit` ni `state-warn`**: un tono neutro, `text-ink-3`.
   - En la densidad compacta no cabe y no se pinta.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`): eso es de la maestra.
- No toques `apps/web/src/features/park/CheckInScreen.tsx` ni `apps/web/src/features/mesas/VincularPulseras.tsx`: la entrada es otro encargo y puede estar escribiéndose a la vez.
- No toques `apps/web/app/layout.tsx` ni `apps/web/src/features/shell/navigation.ts`.
- No inventes un permiso nuevo ni cambies la matriz de permisos: `parque.vincularMesa` ya existe y ya lo tienen la monitora y el mesero.
- Ningún emoji. Colores solo desde los tokens de `packages/config/tokens.css`. Estado por color + icono + texto, nunca solo color.
- Nada de `toFixed` ni de formatos de hora a mano: `formatMoneyVE`, `MoneyDisplay` y `formatClock` ya existen.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; no leas archivos con la terminal). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: con un escenario del simulador en marcha, abrir la ficha de un niño sin nombre, ponerle nombre y ver que cambia en la sala, en la mesa y en la salida; intentar guardar «A» como nombre y ver el mensaje del contrato; vincular a dos hermanos a una mesa abierta desde la sala y comprobar que su parque aparece en la cuenta de esa mesa; e intentar vincular a un niño que ya está en otra mesa.
