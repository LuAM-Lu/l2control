Rediseña el registro de entrada al parque para que dos niños entren en menos de 90 segundos. Es la parte A de la tarea 4.5 del plan final (docs/PLAN-FRONTEND.md) y cubre F5-02 con tres decisiones nuevas del cliente: DEC-27, DEC-28 y DEC-29 (docs/PLAN.md §14).

POR QUÉ CAMBIA: el cliente estudió cómo se comporta la gente en el local. En la puerta hay cola en las horas buenas, las tablets **no tienen teclado físico** y lo que más tardaba del registro era teclear el nombre de cada niño. Ninguna regla de tiempo ni de dinero depende de ese nombre: **la estancia se identifica por su pulsera**, que el niño lleva puesta. Lo que sí es obligatorio es el **contacto del representante**: es a quien se llama si pasa algo y es la llave que reconoce a la familia la próxima vez.

EL RESULTADO QUE SE BUSCA: pasar las pulseras → elegir paquete (ya viene preseleccionado) → teclear el teléfono → registrar. Nada más. Ningún campo de texto libre salvo el teléfono y, solo si la familia es nueva, su nombre.

LO QUE YA HIZO LA MAESTRA (no lo cambies, y léelo antes de empezar):
- `packages/contracts/src/park.ts`: `KidSchema.name` es **opcional**, y existe `NombrarEstanciaCommandSchema` (sessionId, name, nickname opcional; sin motivo) para ponerle el nombre más tarde.
- `packages/contracts/src/eventos.ts`: existe el evento `estancia.nombrada` (`sessionId`, `name`, `nickname?`).
- `packages/domain/park/src/index.ts`: `ParkSession.childName` es opcional.
- `apps/web/src/features/park/view-model.ts`: la función `nombreVisible({ childNickname, childName, wristbandCode })` decide en **un solo sitio** cómo se llama una estancia en pantalla: apodo, si no nombre, si no la pulsera. Úsala siempre que pintes el nombre de un niño; no escribas `?? "Sin nombre"` por tu cuenta.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. `apps/web/src/features/park/CheckInScreen.tsx` — la entrada

   a) El tipo `Entrada` pierde `name` y `nickname`: queda `{ uid, wristbandCode, packageId }`. Con eso desaparecen `nameRefs`, `actualizar(... name ...)` y la rejilla de dos `Input` de cada fila.

   b) **La fila de un niño** pasa a ser: el código de la pulsera grande y legible (mismo `Badge` con `tnum font-mono` que hay hoy, pero como protagonista de la fila, no como pie), el `PackagePicker` y el botón de quitar de 48 px que ya existe. Nada más. El `Initial` con el nombre ya no tiene sentido: pon en su sitio el número de orden de la fila (1, 2, 3…), que es lo que la operadora canta en voz alta.

   c) **El foco después de escanear**: hoy salta al nombre del niño. Ahora, tras la **primera** pulsera y solo si el teléfono está vacío, salta al campo de teléfono. En las siguientes pulseras no se mueve el foco: la operadora sigue pasando pulseras.

   d) **El teléfono es obligatorio** (DEC-27). Ponlo el primero de la columna del representante, con `hint` que diga por qué: «A quién llamamos si pasa algo. Si ya vino, aparece solo». Sigue buscando como hoy (`encontrado`), y cuando la familia es nueva sigue apareciendo su nombre.

   e) **`puedeEnviar`** ya no mira nombres de niños. Queda: hay al menos una pulsera, el aforo no está lleno, el teléfono pasa la regla del contrato (`GuardianSchema.shape.contactReference`, no inventes otra longitud) y, si la familia es nueva, tiene nombre. El texto que explica por qué el botón está apagado se ajusta igual («Falta el teléfono del representante»).

   f) **El comando y las estancias**: en `entries`, `kid` ya no lleva `name` (`kid: {}` es válido ahora). En `estancias`, `kid: { id: \`k-${e.uid}\` }`. El concepto de cada línea de la cuenta pasa a `Paquete ${p.name} · ${e.wristbandCode}` — la cuenta y el recibo nombran la pulsera, que es lo que la familia puede señalar. El aviso de fallo de `sim.emitir` deja de decir `session.kid.name` y dice la pulsera.

   g) **`ScanPrompt`**: los pasos pasan a ser «Pasa las pulseras», «Elige el paquete», «Teléfono del representante», «Registra y cobra» / «Registra y envía a caja». El `detalle` explica lo nuevo: cada pulsera crea una fila y **el nombre del niño no hace falta aquí** — se le pone después, desde la sala, si hace falta.

   h) El subtítulo de la cabecera y los comentarios del encabezado del archivo (el bloque que explica el criterio de los 90 segundos) se actualizan para que digan lo que hace el código ahora. No dejes comentarios que hablen de campos que ya no existen.

2. `apps/web/src/features/mesas/VincularPulseras.tsx` — que un niño sin nombre no salga en blanco
   - Hoy usa `s.kid.nickname ?? s.kid.name` en tres sitios. Con el nombre opcional eso puede quedar vacío. Cambia los tres por `nombreVisible` (impórtala de `../park/view-model.ts`), que ya cae en la pulsera.
   - Revisa `apps/web/src/features/mesas/mesas.ts` y `MesasScreen.tsx` por si nombran niños de la misma forma; si lo hacen, mismo arreglo.

3. Busca en `apps/web/src` cualquier otro sitio que pinte el nombre de un niño (`kid.name`, `childName`) y no use `nombreVisible`. Si lo hay, arréglalo igual. Di en el resumen cuáles encontraste.

NO HAGAS:
- No toques `packages/` (contratos, dominio ni `@l2/ui`): eso es de la maestra.
- No toques `apps/web/app/layout.tsx` ni `apps/web/src/features/shell/navigation.ts`.
- No toques el monitor de sala (`ParkMonitor.tsx`, `ParkChildCard.tsx`), la salida (`CheckoutScreen.tsx`), `apps/web/src/features/simulacion/proyeccion.ts` ni `describir.ts`: poner el nombre desde la sala es otro encargo, que puede estar escribiéndose a la vez en esos mismos archivos.
- No añadas campos que DEC-9 no autorizó (documento, dirección, foto), ni un campo de edad.
- No pongas el nombre del niño «oculto tras un botón» en la entrada. En la puerta no se teclea el nombre: punto.
- Ningún emoji. Colores solo desde los tokens. Objetivos táctiles de tablet/POS: 48-56 px.

CRITERIO DE TERMINADO: `pnpm typecheck` pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida; no leas archivos con la terminal). Resume qué hiciste en cada punto y qué archivos tocaste.

CÓMO LO PROBARÁ LA MAESTRA: pasar dos pulseras con el lector simulado, elegir paquete, teclear un teléfono conocido y registrar, con cronómetro; repetirlo con un teléfono nuevo; comprobar que la cuenta que llega a la caja nombra la pulsera; y comprobar a 1280×800 y 1024×600 que no aparece scroll horizontal ni se corta nada.
