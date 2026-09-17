Arregla el turno de caja (apps/web/src/features/cash/TurnoScreen.tsx) para que el arqueo se lea entero en cualquier ancho y los cortes estén siempre a la vista en pantallas bajas. Hallazgos F-03, F-04 y F-06 de docs/AUDITORIA-FRONTEND.md.

EL PROBLEMA, MEDIDO:
- El subtotal de cada denominación del arqueo NO SE VE a 768×1024 ni a 1024 px en horizontal: las dos monedas van lado a lado (`md:grid-cols-2`, línea ~197) y cada una necesita unos 390 px con su subtotal; a 1024 tiene 288. La tarjeta (`overflow-hidden`) lo recorta sin avisar.
- A 1024×600 desplaza toda la zona (+168) y «Corte Z» queda cortado abajo.
- La rejilla de la línea ~174 no fija sus filas, así que el panel de pestañas crece con su contenido en vez de desplazar por dentro.
- Los botones de la confirmación del corte Z y «Ir al acceso ahora» son de superficie tablet (48); la pantalla es POS (56).

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- Variante `apaisado:` = 1024 px o más de ancho, o 768 px o más en horizontal (una tablet de 960×600 también es apaisada). ÚSALA EN LUGAR DE `lg:` en todo este encargo: donde la pantalla tiene hoy `lg:`, cámbialo por `apaisado:` (F-15).
- Variante `bajo:` = alto de ventana menor de 760 px. Combínala así: `apaisado:bajo:`.
- ORDEN DEL CSS (comprobado): lg → xl → apaisado → (todo lo bajo) → apaisado:bajo. Es decir, `apaisado:` pisa a `lg:` y `apaisado:bajo:` pisa a todo. No mezcles `lg:` y `apaisado:` en la misma propiedad.
- El marco de las estaciones mide la ventana desde 768 px: la zona de la pantalla desplaza por dentro si no cabe (en vertical eso se acepta para el turno: decisión F-07).
- Container queries con tamaño libre funcionan así (comprobado): `@container/arqueo` en el padre y `@min-[49rem]/arqueo:grid-cols-2` en el hijo.

QUÉ HACER (solo en TurnoScreen.tsx):

0. El div raíz (línea ~147, `flex flex-1 flex-col`) pasa a `flex min-h-0 flex-1 flex-col`: sin `min-h-0` crece con su contenido y la zona entera desplaza (pasó en entrada y salida).

1. Arqueo por su propio ancho, no por el de la ventana:
   - La `<section>` del arqueo (línea ~189) lleva `@container/arqueo`.
   - La rejilla de monedas (línea ~197): `md:grid-cols-2` → `@min-[49rem]/arqueo:grid-cols-2`. Por debajo de 784 px de tarjeta, una moneda debajo de la otra.
   - Cada fila (línea ~215) debe caber en 348 px (380 con el relleno de su moneda; dos monedas = 761, por debajo de los 784 del umbral): etiqueta `w-14` (hoy w-16), huecos `gap-2` (hoy gap-3), subtotal `w-20` (hoy w-24) con `min-w-0`, y el relleno de cada moneda `px-4` (hoy px-5). El Stepper no se toca (surface="pos").
   - Con las monedas apiladas, la cabecera de cada moneda (el h3 de la línea ~202) queda `sticky top-0 z-10` con el fondo de la tarjeta (`bg-surface`) y un pequeño relleno vertical, para saber qué moneda se está contando al desplazar. Para que `sticky` funcione, la sección cambia `overflow-hidden` por `overflow-clip` (recorta igual las esquinas, pero no crea un contenedor de desplazamiento propio).

2. Que desplace el panel, no la zona (desde `apaisado:`):
   - La zona (línea ~173): su `lg:min-h-0` pasa a `apaisado:min-h-0`. La rejilla de la línea ~174: `lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]` pasa a `apaisado:min-h-0 apaisado:flex-1 apaisado:grid-cols-[minmax(0,1fr)_380px]`, y añade `apaisado:grid-rows-[minmax(0,1fr)]`. Las Tabs (línea ~183): `lg:min-h-0` → `apaisado:min-h-0`.
   - El panel de pestañas ya desplaza por dentro si su contenedor tiene alto (Tabs de @l2/ui: `min-h-0 flex-1 overflow-y-auto`): no lo cambies.
   - El aside del cuadre y los cortes (línea ~267): quita `h-fit lg:sticky lg:top-20` y usa `apaisado:min-h-0 apaisado:overflow-y-auto` (red de seguridad: si aun así no cabe, desplaza el aside, no la zona).

3. Pantalla baja (`apaisado:bajo:`), para que Cuadre y Cortes quepan enteros a 1024×600 (hay unos 470 px):
   - Cabecera de la pantalla (línea ~151): `apaisado:bajo:py-2`. Zona (línea ~173): `apaisado:bajo:py-3 apaisado:bajo:gap-3`.
   - Aside: `apaisado:bajo:gap-3`. Tarjeta Cuadre: `apaisado:bajo:p-3`, su h2 `apaisado:bajo:mb-2`, cada fila de moneda `apaisado:bajo:py-2`, y la cifra (MoneyDisplay size="xl") con `className="apaisado:bajo:text-2xl"` (acepta className y resuelve el conflicto con tailwind-merge). La cifra en bolívares sigue en su renglón propio: NO pongas las dos monedas lado a lado.
   - Tarjeta Cortes: `apaisado:bajo:p-3 apaisado:bajo:gap-2`.
   - Al abrir la confirmación del corte Z (confirmandoZ pasa a true), la caja de confirmación se desplaza a la vista (`scrollIntoView({ block: "nearest" })` desde un ref, en un efecto que dependa de confirmandoZ).

4. Objetivos táctiles (POS, 56): los dos botones de la confirmación del corte Z («Cancelar», «Sí, cerrar el turno», líneas ~377 y ~385) y «Ir al acceso ahora» (línea ~418): `surface="tablet"` → `surface="pos"`.

NO HAGAS:
- No toques ningún otro archivo (ni PuntosDeCobro, ni EntradasPorMedio, ni ExcepcionesTurno, ni @l2/ui).
- No cambies la lógica del arqueo, del cuadre ni de los cortes, ni los textos.
- No uses JavaScript para saber el tamaño de la pantalla: todo es CSS (el único efecto nuevo es el scrollIntoView del punto 3).

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra lo medirá a 1366×768, 1366×657, 1280×800, 1024×768, 1024×600, 960×600, 768×1024 y 800×1280, comprobando que se ve el subtotal de cada fila y que «Corte Z» está entero a la vista.
