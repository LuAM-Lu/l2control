Reorganiza la caja para que se pueda COBRAR ENTERO en pantallas bajas (1024×600, 960×600, 1280×720 y un portátil de 1366×768 con la barra del navegador) y para que tenga disposición propia en tablet vertical (768×1024, 800×1280). Hallazgos F-02 y F-07 de docs/cerrados/AUDITORIA-FRONTEND.md.

EL PROBLEMA, MEDIDO:
- La columna de cobro (visor, medios, franja, teclado, fila de acciones) necesita 657 px de alto en una sola columna: 754 px de ventana. Por debajo, el teclado se corta: a 1024×600 no se ven el 0, «Añadir» ni «Cerrar cobro». No se puede terminar de cobrar.
- El ticket trunca los conceptos («Paqu…») cuando es estrecho (1024 px de ancho, y en vertical).
- En vertical (768×1024) la cola va encima del ticket y no caben: +167 px.

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- La variante de Tailwind `bajo:` (packages/config/tokens.css) = alto de ventana menor de 760 px. Se combina con el ancho: `md:bajo:`, `lg:bajo:`, `xl:bajo:`.
- ORDEN DEL CSS, COMPROBADO: md → lg → xl → (container queries) → md:bajo → lg:bajo → xl:bajo. Es decir, TODO lo `*:bajo:` sale después de TODO lo `lg:` y `xl:` normal. Consecuencia: si pones una propiedad con `md:bajo:` y esa misma propiedad también tiene valor con `lg:` o `xl:`, en pantalla baja gana `md:bajo:`; para que no pase, repítela con `lg:bajo:` y `xl:bajo:`. Las clases de abajo ya están escritas así.
- El marco de las estaciones mide la ventana desde 768 px (apps/web/app/(estacion)/layout.tsx): la pantalla debe repartir su alto por dentro, también en vertical.

LA ESTRUCTURA DE LA COLUMNA DE COBRO ES DEL CLIENTE Y NO SE NEGOCIA: visor, medios, franja de alto fijo, teclado SIEMPRE a la vista (nunca plegado ni detrás de un botón) y la fila «Cobrar exacto · Cerrar cobro». Cambiar de medio o teclear no mueve nada de sitio. Lo que cambia es CÓMO se colocan esas piezas.

DISEÑO DECIDIDO (hazlo así):

A. Dos modos de rejilla en CajaScreen (el Container de la línea ~1467):
   - TRES COLUMNAS (como hoy: cola | ticket | cobro): desde lg cuando NO es bajo, y desde xl cuando SÍ es bajo.
   - DOS COLUMNAS (cola PLEGADA): de md a lg, y de lg a xl cuando es bajo. La columna izquierda muestra O el ticket O la cola, con un conmutador encima; la derecha, el cobro a todo el alto.
   Clases del Container (sustituyen a las de hoy; conserva `grid flex-1 gap-4 py-4` y añade `bajo:py-3`):
     md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] md:grid-rows-[auto_minmax(0,1fr)]
     md:bajo:grid-cols-[minmax(0,1fr)_minmax(30rem,34.5rem)]
     lg:grid-cols-[15rem_minmax(0,1fr)_clamp(352px,26vw,400px)] lg:grid-rows-[minmax(0,1fr)]
     lg:bajo:grid-cols-[minmax(0,1fr)_34.5rem] lg:bajo:grid-rows-[auto_minmax(0,1fr)]
     xl:bajo:grid-cols-[15rem_minmax(0,1fr)_34.5rem] xl:bajo:grid-rows-[minmax(0,1fr)]

B. Colocación (pon TODAS las clases de colocación en CajaScreen, en constantes con nombre y un comentario; ColaCuentas deja de tener las suyas y recibe un prop `className`):
   - Conmutador: fila 1, columna 1. Visible solo en dos columnas: `hidden md:flex lg:hidden lg:bajo:flex xl:bajo:hidden`.
   - Cola: columna 1; `md:row-start-2 lg:row-start-1 lg:bajo:row-start-2 xl:bajo:row-start-1`.
   - Ticket (la sección de CobroCuenta y la sección de NuevaVentaDirecta): `md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1 lg:bajo:col-start-1 lg:bajo:row-start-2 xl:bajo:col-start-2 xl:bajo:row-start-1`.
   - Cobro (el aside de CobroCuenta y el aside de NuevaVentaDirecta): `md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3 lg:row-span-1 lg:bajo:col-start-2 lg:bajo:row-span-2 xl:bajo:col-start-3 xl:bajo:row-span-1`.
   - SinCuentas (no hay nada que cobrar): ocupa el sitio del COBRO en dos columnas y ticket+cobro en tres. Quita su `md:col-span-2 md:row-start-2` y usa exactamente:
     `md:col-start-2 md:col-span-1 md:row-span-2 md:row-start-1 lg:col-span-2 lg:row-span-1 lg:bajo:col-span-1 lg:bajo:row-span-2 xl:bajo:col-span-2 xl:bajo:row-span-1`
     (en tres columnas empieza en la 2 y ocupa dos; en dos columnas es la 2 a todo el alto). No lleva OCULTA_SI_PLEGADA.
   - Ocultar en dos columnas: la pieza que no toca lleva `md:hidden lg:flex lg:bajo:hidden xl:bajo:flex` (constante `OCULTA_SI_PLEGADA`). Las dos piezas siguen MONTADAS siempre: la cola contiene el lector de pulseras y no debe desmontarse ni duplicarse.

C. El conmutador (nuevo, dentro de CajaScreen):
   - Estado `vista: "cuenta" | "cola"`. Vista efectiva = "cola" si no hay cuenta elegida ni venta nueva; en ese caso el botón «Cuenta» está deshabilitado.
   - Dos botones de 56 px (min-h-14), a partes iguales y a todo el ancho, con role="radio"/aria-checked dentro de un role="radiogroup" aria-label="Qué ver". Copia el aspecto del conmutador «Plano | Atender» de apps/web/src/features/mesas/MesasScreen.tsx (línea ~297), a tamaño POS.
   - Etiquetas: «Cuenta» + el número de orden de la cuenta elegida (o «Venta directa»); «Por cobrar» + el total de la cola en un contador `tnum`. Si llegó una cuenta nueva (`recientes` no vacío) mientras se ve la cuenta, el contador usa el tono de marca.
   - Cambios de vista: elegir una cuenta (tocarla, flechas, pulsera leída) → "cuenta". Empezar una venta directa (botón o tecla N) → "cuenta". «/» (buscar) → "cola". Cobrar una cuenta ENTERA → "cola"; si quedan partes de una cuenta dividida, se queda en "cuenta".
   - En tres columnas el conmutador no se ve y el estado no cambia nada.

D. La columna de cobro en pantalla baja (`md:bajo:`), en CobroCuenta (aside de la línea ~850): DOS subcolumnas dentro del mismo aside.
   - Aside: `md:bajo:grid md:bajo:grid-cols-[minmax(0,1fr)_13.5rem] md:bajo:grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] md:bajo:gap-x-3 md:bajo:overflow-hidden` (sigue siendo flex en columna fuera de bajo).
   - Izquierda, de arriba abajo: visor (fila 1), medios (fila 2), franja (fila 3), avisos (fila 4), fila de acciones (fila 5). Derecha: el teclado a todo el alto (`md:bajo:col-start-2 md:bajo:row-span-5 md:bajo:row-start-1 md:bajo:auto-rows-fr`, pasado por `className` a NumericKeypad; el teclado ya es una rejilla y se estira solo).
   - Da fila y columna explícitas a cada pieza (no dejes que la rejilla las coloque sola).
   - Los tres avisos condicionales (sin tasa, umbral del vuelto, error) van dentro de UN div `flex flex-col gap-2 empty:hidden`, que es la fila 4.
   - Nada cambia de alto: medios h-14, franja h-14, teclas min-h-14, acciones min-h-14.

E. El ticket (sección de CobroCuenta, línea ~560) según SU ancho, con container queries de Tailwind 4 (`@container/ticket` en la sección):
   - COLUMNAS: estrecho = cantidad | concepto | importe (`grid-cols-[2.25rem_minmax(0,1fr)_5.75rem]`); desde `@md/ticket` (448 px), las cuatro de hoy. La columna «P. unit.» (cabecera y filas) lleva `hidden @md/ticket:block`.
   - Estrecho y cantidad > 1: debajo del concepto, en pequeño y `tnum`, «2 × $ 5.00».
   - El concepto NUNCA se trunca en una línea: `line-clamp-2 break-words` en vez de `truncate`. La fila sigue en min-h-12.
   - «Dividir la cuenta»: estrecho = la etiqueta en su renglón y debajo los seis botones en `grid grid-cols-6 gap-1` a todo el ancho, con alto h-14 (deja un comentario: grupo a todo el ancho, 56 de alto, el ancho lo reparte la fila); desde `@md/ticket`, etiqueta y botones en la misma fila como hoy (size-14).
   - «Factura a»: el `dt` con `shrink-0 whitespace-nowrap`; el nombre se trunca, la etiqueta nunca se parte en dos renglones.

F. Objetivos táctiles que faltaban en esta pantalla (superficie POS, 56):
   - Categorías de CartaMostrador (línea ~1597, min-h-10) → min-h-14.
   - Enlaces de SinCuentas (línea ~1708 y ~1714, min-h-11) → min-h-14.

DÓNDE ESTÁ CADA COSA en CajaScreen.tsx (unas 1720 líneas; léelo por tramos): `function CobroCuenta` en la línea 138 (su JSX empieza en la 557), `export function CajaScreen` en la 1187 (su JSX en la 1462), `COLUMNAS` en la 1573, `CartaMostrador` en la 1575, `NuevaVentaDirecta` en la 1630 y `SinCuentas` en la 1696. ColaCuentas.tsx: `export function ColaCuentas` en la línea 67 y su `<section>` en la 136.

ARCHIVOS QUE PUEDES TOCAR: apps/web/src/features/cash/CajaScreen.tsx y apps/web/src/features/cash/ColaCuentas.tsx. Nada más.

NO HAGAS:
- No cambies la lógica del cobro, los montos, los atajos (salvo lo de C) ni los textos que no se nombran aquí.
- No desmontes la cola ni la dupliques.
- No uses JavaScript para saber el tamaño de la pantalla (nada de matchMedia ni useMediaQuery): todo es CSS.
- No toques packages/, StationBar, el layout ni otras pantallas.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto (A a F) y cualquier decisión que hayas tenido que tomar. La maestra lo medirá en 1024×600, 960×600, 1280×720, 1366×657, 1366×768, 1024×768, 768×1024 y 800×1280.
