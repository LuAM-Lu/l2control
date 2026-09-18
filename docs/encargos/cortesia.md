Añade la **cortesía** al cobro: marcar una línea de la cuenta como regalada, con motivo y autorización. Es la tarea 4.4 del plan final (docs/PLAN-FRONTEND.md) y cubre F6-14, con §7.3 y §7.5. No es una sección del panel: vive dentro de la caja.

QUÉ ES UNA CORTESÍA, EXACTAMENTE: un ítem que se entrega y **no se cobra** —una invitación, un plato que salió mal de la cocina, lo que consume el personal—. No es un descuento ni un precio distinto: es lo mismo, sin cobrar. Por eso **la línea se queda con su importe**: el negocio tiene que poder ver al final del turno cuánto regaló. Lo que cambia es que deja de sumar al total a cobrar.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo antes de empezar):
- `packages/contracts/src/account.ts` (diez pruebas nuevas). **Ya está hecho también lo que la
  invariante de la cuenta necesitaba**: `pendiente` deja fuera las líneas regaladas, y una cuenta donde
  se regaló todo puede seguir estando `POR_COBRAR` —pasa por la caja igual, para cerrarla y dejar la
  cortesía en las excepciones—. No hace falta tocar el contrato: si crees que falta algo más, **dilo en
  el resumen**.
- Lo que hay en el contrato:
  · `MotivoCortesiaSchema`: lista cerrada — `INVITACION`, `ERROR_DE_COCINA`, `CONSUMO_DE_PERSONAL`, `OTRO`. Nada de texto libre como motivo.
  · `CortesiaSchema`: motivo, `detalle` (obligatorio solo con «Otro»), `autorizadaPor` —con su **rol**, que solo puede ser `ADMIN` o `SUPERVISOR`— y `en`.
  · `AccountLineSchema.cortesia`, opcional. Una cuenta sin cortesías sigue siendo válida.
- El permiso ya existe: `cuenta.cortesia` (§7.3) es 🔐 para cajero y supervisor, ✅ para administración.

EL PATRÓN A COPIAR: `apps/web/src/features/cash/AnularCobroDialog.tsx` — pedir autorización con PIN a quien puede darla, con motivo de lista cerrada y «Otro» que exige explicación. Es exactamente la misma conversación, y ya está resuelta ahí. Léelo entero antes de empezar; copia su forma, no la reinventes.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. `apps/web/src/features/cuentas/cuentas.ts`
   - `pendiente(c)` deja fuera las líneas con `cortesia`, igual que ya deja fuera las pagadas y las movidas a otra cuenta: `!l.paid && !l.movedTo && !l.cortesia`.
   - Añade `cortesias(c): Money` —cuánto se ha regalado en esa cuenta— y `lineasDeCortesia(c)`. Son funciones puras, en el mismo estilo que las de al lado, y con su comentario de por qué existen.
   - Cuidado con el orden: una línea ya **pagada** no se puede regalar. Eso lo comprueba la pantalla antes de ofrecer la acción.

2. `apps/web/src/features/cash/CortesiaDialog.tsx` (NUEVO, «use client»)
   - Copia la estructura de `AnularCobroDialog`: qué línea se regala y por cuánto, el motivo en botones de lista cerrada, el campo de explicación que **solo aparece con «Otro»**, y la autorización con PIN de quien puede concederla (`cuenta.cortesia`).
   - Fail-closed: sin motivo, sin explicación cuando hace falta, o sin autorización válida, **no se aplica nada** y el motivo se ve en la pantalla.
   - El diálogo no conoce la cuenta: recibe la línea y devuelve la `CortesiaDto` ya formada, validada con `CortesiaSchema.safeParse`.
   - A 1366×768 tiene que verse entero sin desplazar para llegar al PIN. El diálogo de anular tiene ese problema anotado en la Ola 5: no lo repitas.

3. `apps/web/src/features/cash/CajaScreen.tsx`
   - En la lista de líneas de la cuenta, cada línea **no pagada** ofrece «Cortesía» a quien tenga el permiso (`can(actor, "cuenta.cortesia") !== "DENEGADO"`; recuerda que `can` devuelve una palabra, no un booleano).
   - Una línea regalada se ve como lo que es: su importe **tachado**, el motivo en palabras y quién lo autorizó. Tono neutro, no de error — regalar algo es una decisión del negocio, no un fallo. Nada de rojo.
   - El total a cobrar baja solo, porque sale de `pendiente`. **No restes la cortesía a mano en ningún sitio**: si aparece una resta, está mal.
   - Quitar una cortesía antes de cerrar el cobro sí se puede —la cuenta todavía es un borrador—, y también pide autorización. Una vez cerrada la venta, no se toca nada.
   - El recibo (`apps/web/src/features/cash/recibo.ts`) nombra la cortesía en su línea: «Cortesía · error de cocina». El importe del recibo sigue siendo el que se cobró.

4. Las excepciones del turno (F4-08) — **ya existen, no las inventes**
   - `apps/web/src/features/cash/ExcepcionesTurno.tsx` pinta anulaciones, descuentos, cortesías y reimpresiones, y lo usan el inicio y el turno de caja. El tipo `Excepcion` está en `apps/web/src/features/cash/turno.ts` y **ya contempla `"CORTESÍA"`**.
   - Lo que falta es que una cortesía dada en la caja **llegue ahí**: con su hora, la cuenta y la línea en `detalle`, quién la dio, el motivo en palabras y quién la autorizó. Es el criterio de F6-14 —«todo aparece en el reporte de excepciones del turno»— y sin eso la tarea no está hecha.
   - Mira cómo llegan hoy las anulaciones a esa lista y haz lo mismo; no dupliques el componente.

NO HAGAS:
- No toques `packages/`. Si crees que falta algo en el contrato, **dilo en el resumen**.
- No cambies el importe de la línea ni la borres. Regalar no es descontar.
- No permitas regalar una línea ya cobrada: para eso está anular (DEC-24), que devuelve dinero.
- No dupliques las reglas del contrato con `if`: valida con `CortesiaSchema` y enseña su mensaje.
- No toques la pantalla de tasas, la de medios de pago ni sus proveedores.
- Ningún emoji. Colores solo desde los tokens. Objetivos táctiles de POS: 56 px.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; **no leas archivos con la terminal**). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: regalar una línea y ver que el total baja exactamente ese importe y que el cobro se cierra con el resto; elegir «Otro» sin explicar y ver que no deja; intentarlo con una cajera y ver que pide autorización; quitar la cortesía y ver que el total vuelve a subir; comprobar que la cortesía sale en las excepciones del turno y en el recibo; y medir a 1366×768 y 1024×600.
