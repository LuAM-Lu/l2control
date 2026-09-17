Haz que las estaciones usen su disposición en columnas en toda pantalla APAISADA, no solo desde 1024 px. Hallazgo F-15 de docs/AUDITORIA-FRONTEND.md.

EL PROBLEMA, MEDIDO:
- Una tablet de 7" con densidad 1,33 (Galaxy Tab A 7.0, por ejemplo) mide 960×600 en CSS. En horizontal no llega a `lg:` (1024 px), así que recibe la disposición pensada para vertical: salida +717 y entrada +603 de scroll, con sus botones principales fuera de la ventana, y la barra de estación en dos filas (129 de 600 px).

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- Variante `apaisado:` = 1024 px o más de ancho, O 768 px o más en horizontal (packages/config/tokens.css).
- ORDEN DEL CSS (comprobado): md → md:max-lg → lg → xl → portrait → apaisado → (todo lo bajo: md:bajo, lg:bajo, xl:bajo) → apaisado:bajo. `apaisado:` pisa a `lg:`/`xl:`; todo lo `bajo:` pisa a `apaisado:`.
- Comprobado: a 960 px la barra cabe en una fila (ocupa unos 784 px, porque el texto del turno se oculta por debajo de 1024).

LA REGLA DE ESTE ENCARGO:
- Lo que decide la DISPOSICIÓN (columnas, filas, `min-h-0`, `overflow-y-auto`, `flex-1`, una fila o dos): `lg:` → `apaisado:`.
- Lo que decide solo por ANCHO (mostrar un texto, cuántas columnas de productos caben): se queda como está (`lg:`, `xl:`, `sm:`).
- Lo pensado para tablet VERTICAL (`md:max-lg:`): → `md:max-lg:portrait:` (así no se aplica a 960×600 en horizontal).
- No mezcles `lg:` y `apaisado:` en la misma propiedad de un mismo elemento.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. apps/web/src/features/shell/StationBar.tsx
   - Líneas ~158 (contenedor: `lg:h-16 lg:flex-nowrap lg:gap-3 lg:py-0 lg:pl-[…] lg:pr-[…]`), ~185 (`lg:order-none lg:w-auto`), ~191 (`lg:flex-none`), ~198 (`lg:flex-none lg:justify-start`) y ~254 (`hidden lg:block`): `lg:` → `apaisado:`.
   - `ocultarTextoHasta="lg"` (línea ~230) y la línea ~342 (`hidden lg:inline`): NO se tocan (es ancho).
   - Actualiza el comentario de la envoltura que explica cuándo va en una fila: ahora «en pantalla apaisada» (F-15), y en vertical estrecha dos filas.

2. apps/web/src/features/park/CheckInScreen.tsx
   - Zona (línea ~298): `lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]` → `apaisado:grid-cols-[…] apaisado:grid-rows-[…]`. Deja `md:min-h-0 md:grid-rows-[minmax(0,1fr)_auto]`.
   - Aside (línea ~396): `lg:max-h-full lg:self-start` → `apaisado:…`.
   - Líneas ~397, ~472 y ~487: todo `md:max-lg:` → `md:max-lg:portrait:`.

3. apps/web/src/features/park/CheckoutScreen.tsx
   - Líneas ~260, ~261, ~280, ~385 y ~386: todo `lg:` → `apaisado:`.

4. apps/web/src/features/park/ParkMonitor.tsx
   - Línea ~143: `md:max-lg:grid-cols-3` → `md:max-lg:portrait:grid-cols-3`.

5. apps/web/src/features/cash/VentasScreen.tsx
   - Línea ~139: `lg:min-h-0 lg:grid-cols-[…]` → `apaisado:…`. Si hay más `lg:` de disposición en la pantalla, aplica la regla.

6. apps/web/src/features/cocina/CocinaScreen.tsx
   - Línea ~67: `lg:min-h-0 lg:grid-cols-[…]` → `apaisado:…`. Si hay más `lg:` de disposición, aplica la regla.

7. apps/web/src/features/mesas/MesasScreen.tsx
   - Líneas ~267, ~273, ~291, ~350, ~352, ~354, ~363 y ~404: todo `lg:` de disposición → `apaisado:` (incluido `lg:content-stretch`).

8. apps/web/src/features/mesas/TomaPedido.tsx
   - Líneas ~67, ~88, ~137 y ~147: `lg:min-h-0` y `lg:overflow-y-auto` → `apaisado:…`. En la línea ~88, `sm:grid-cols-3` y `xl:grid-cols-4` se quedan (son ancho).

9. apps/web/src/features/mesas/PlanoLocal.tsx
   - Línea ~127 (`hidden lg:block`, una leyenda): se queda (es ancho). No toques el archivo.

NO TOQUES: CajaScreen.tsx, ColaCuentas.tsx y TurnoScreen.tsx (la caja ya resuelve 960×600 a su manera y el turno lo hace otra tarea), @l2/ui, packages/ ni el layout.

NO HAGAS: ningún otro cambio de clases, textos ni lógica. Es un cambio mecánico: si una clase no encaja en la regla, déjala y dilo en el resumen.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume, archivo por archivo, cuántas clases cambiaste y cualquier `lg:` que dejaste a propósito. La maestra lo medirá a 960×600, 1024×600, 1366×768, 768×1024 y 800×1280.
