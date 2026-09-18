Arregla las tres pantallas del parque para tablets: entrada y salida (la lista desplaza sola y la acción principal queda siempre a la vista), una disposición vertical propia para la entrada, y el monitor a 768 px. Hallazgos F-06, F-07, F-13 y F-14 de docs/cerrados/AUDITORIA-FRONTEND.md.

EL PROBLEMA, MEDIDO (con tres niños cargados):
- Entrada: a 1024×600 desplaza TODA la zona (+245) y a 1366×768 también (+77). Al desplazar se van de la vista el lector y, en pantalla baja, «Registrar y cobrar». Vacía, a 1024×600 el aviso de espera no cabe (+39).
- Salida: a 1024×600, +163, con el mismo efecto.
- Entrada en vertical (768×1024): +384. La decisión del cliente (F-07) es darle disposición propia.
- «Quitar pulsera» mide 36 px (`size-9`) en las dos pantallas; la superficie es tablet: 48 (F-13).
- Monitor a 768 px: fuerza tres columnas de 229 px (`md:max-lg:grid-cols-3`) y la tarjeta de un niño con el tiempo cumplido no cabe: se cortan el nombre, «RESTANTE» y el porcentaje (F-14).

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- Variante `bajo:` = alto de ventana menor de 760 px (combinable: `lg:bajo:`). Orden del CSS comprobado: TODO lo `*:bajo:` sale después de TODO lo `lg:`/`xl:`.
- El marco de las estaciones mide la ventana desde 768 px: cada pantalla reparte su alto por dentro.
- `ScanPrompt` (@l2/ui) ya se compacta solo en pantalla baja.

ARCHIVOS QUE PUEDES TOCAR: apps/web/src/features/park/CheckInScreen.tsx, CheckoutScreen.tsx, ParkMonitor.tsx y ParkChildCard.tsx. Nada más.

QUÉ HACER:

1. ENTRADA (CheckInScreen.tsx) — «la lista desplaza sola, la acción queda fija»:
   a. Zona (`<Container as="main">`, línea ~292): `md:min-h-0` y filas con alto fijo:
      - de md a lg (vertical): UNA columna con dos filas, `md:grid-rows-[minmax(0,1fr)_auto]`;
      - desde lg: las dos columnas de hoy y `lg:grid-rows-[minmax(0,1fr)]`.
      Quita `lg:min-h-0` (lo cubre md:min-h-0). En pantalla baja: `bajo:py-3`.
   b. Sección de niños (línea ~294): `min-h-0`. El lector y el aviso quedan arriba sin encogerse (`shrink-0`). La lista (el `<ul>`) o el ScanPrompt van dentro de UN div nuevo `-m-1 min-h-0 flex-1 overflow-y-auto p-1` (el mismo recurso que el monitor, ParkMonitor.tsx línea ~137, para no recortar los anillos de foco). Cuando llega una pulsera nueva, su fila se desplaza a la vista (`scrollIntoView({ block: "nearest" })` sobre el `<li>` nuevo; ya hay refs del campo de nombre: `nameRefs`, úsalas o añade una al li).
   c. Panel del representante (el `<aside>`, línea ~386): deja de ser `h-fit lg:sticky lg:top-20`. Se parte en dos:
      - CUERPO: título, teléfono, representante encontrado o nuevo, y «Cómo paga» → en un div `min-h-0 flex-1 overflow-y-auto` (con el mismo `-m-1 p-1`).
      - PIE fijo (`shrink-0`, con `border-t border-line pt-4`): el total de paquetes (con su «N niños»), el botón «Registrar y cobrar» y el motivo por el que está deshabilitado.
      - El aside: `min-h-0` y, desde lg, `lg:max-h-full lg:self-start` (mide lo que su contenido y, si no cabe, desplaza el cuerpo, nunca el pie).
   d. Disposición vertical propia (solo de md a lg, con `md:max-lg:`): el panel del representante es la fila de abajo, más ancho que alto:
      - el cuerpo en DOS columnas (`md:max-lg:grid md:max-lg:grid-cols-2 md:max-lg:gap-x-5 md:max-lg:overflow-visible`): a la izquierda el título, el teléfono y el representante encontrado o nuevo; a la derecha «Cómo paga». Envuelve cada lado en un div para que la rejilla los coloque.
      - el pie en UNA fila (`md:max-lg:flex-row md:max-lg:items-center md:max-lg:gap-4`): el total a la izquierda y el botón a la derecha ocupando la mitad (`md:max-lg:w-1/2 md:max-lg:shrink-0`), y el motivo debajo del botón.
   e. Pantalla baja (`bajo:`): cabecera de la pantalla (línea ~267) `bajo:py-2`; el subtítulo de la cabecera `bajo:hidden`; el aside `bajo:gap-3 bajo:p-4`.
   f. «Quitar pulsera» (línea ~360): `size-9` → `size-12` (F-13).

2. SALIDA (CheckoutScreen.tsx) — lo mismo que 1a, 1b, 1c, 1e y 1f, SIN disposición vertical propia (decisión F-07: en vertical se acepta desplazar la zona):
   - Zona (línea ~254): `lg:grid-rows-[minmax(0,1fr)]` (conserva `lg:min-h-0`), `bajo:py-3`. En vertical no cambies la rejilla.
   - Sección (línea ~255): `lg:min-h-0`; lector y aviso `shrink-0`; la lista o el ScanPrompt en el div `-m-1 min-h-0 flex-1 overflow-y-auto p-1` solo desde lg (`lg:min-h-0 lg:flex-1 lg:overflow-y-auto`); pulsera nueva → a la vista.
   - Aside «Liquidación» (línea ~374): CUERPO = el título y la lista de cuentas (línea ~395), que desplaza; PIE fijo = «A cobrar ahora» con su total y su línea de detalle, los dos botones, la nota de «Cargar a una mesa» y la insignia «Esperando pulseras». Desde lg: `lg:min-h-0 lg:max-h-full lg:self-start`, cuerpo `lg:min-h-0 lg:flex-1 lg:overflow-y-auto`.
   - Pantalla baja: cabecera `bajo:py-2`, subtítulo `bajo:hidden`, aside `bajo:gap-3 bajo:p-4`, y la nota de «Cargar a una mesa» `bajo:hidden` (sigue en el `title` del botón: añádelo).
   - «Quitar» (línea ~312): `size-9` → `size-12` (F-13).

3. MONITOR (F-14):
   - ParkChildCard.tsx, fila del cronómetro (línea ~168, `flex items-end justify-between gap-2`): que la etiqueta «restante/acumulado» pueda bajar de renglón cuando no cabe (`flex-wrap`, `gap-x-2`), y que nada dentro de la tarjeta imponga un ancho mínimo mayor que la tarjeta (revisa que el título trunque con puntos suspensivos).
   - ParkMonitor.tsx (línea ~143): se quedan las tres columnas de 768 a 1023 px (el cliente quiere ver más niños en la pared). Si después del punto anterior la tarjeta vencida aún no cabe en 229 px, NO quites las tres columnas: dilo en el resumen.

NO HAGAS:
- No cambies la lógica (lecturas de pulsera, cálculo de paquetes, liquidación, cuentas) ni los textos (salvo el `title` del punto 2).
- No uses JavaScript para saber el tamaño de la pantalla: todo es CSS (los únicos efectos nuevos son los scrollIntoView).
- No toques @l2/ui, StationBar, el layout ni otras pantallas.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto y cualquier decisión que hayas tomado. La maestra lo medirá con 0 y con 3 niños cargados a 1366×768, 1280×800, 1024×768, 1024×600, 768×1024 y 800×1280.
