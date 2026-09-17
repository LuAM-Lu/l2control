Dos arreglos del back-office: avisar de que una sección abre una estación a pantalla completa (N-04 de docs/AUDITORIA-NAVEGACION.md) y terminar el panel en tablet (F-09 de docs/AUDITORIA-FRONTEND.md).

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- El tipo `Seccion` de apps/web/src/features/shell/navigation.ts tiene ahora `abre?: "estacion"`, y las OCHO secciones que salen del panel ya lo declaran: Monitor de sala, Entrada, Salida, Mesas y pedidos, Comandas del día, Cobrar, Ventas del turno y Turnos y cortes.
- Las migas de `PageHeader` (@l2/ui) ya llegan a 32 px.

ARCHIVOS QUE PUEDES TOCAR: apps/web/src/features/shell/BackOfficeShell.tsx, ModuloScreen.tsx, EnVivo.tsx e InicioScreen.tsx. Nada más.

1. N-04 · EL MENÚ LATERAL (BackOfficeShell.tsx, la lista de secciones de la línea ~290)
   - Hoy, una sección sin construir enseña «pendiente» al final de su fila. Añade lo mismo para las que abren una estación: cuando `s.abre === "estacion"`, al final de la fila un icono `Maximize2` de lucide-react de 11 px con `aria-hidden`, y junto a él un texto solo para lectores de pantalla (`sr-only`) que diga «se abre a pantalla completa». El `title` del enlace dice lo mismo.
   - No cambies el alto de la fila (min-h-9) ni el orden de los elementos.

2. N-04 · LAS TARJETAS DEL MÓDULO (ModuloScreen.tsx, las tarjetas de la línea ~55)
   - En la tarjeta de una sección con `abre === "estacion"`, debajo del propósito, una línea tenue (`text-[12px] text-ink-3`, con el mismo icono `Maximize2` de 12 px) que diga: «Se abre a pantalla completa». Que no sea solo un icono: el texto es la señal (§8.2).
   - Las tarjetas de las secciones normales no cambian.

3. F-09 · EL ENLACE «DISPOSITIVOS» DE INICIO (EnVivo.tsx, línea ~258)
   - Lleva a `/acceso`, que es la PANTALLA DE BLOQUEO del equipo: desde el panel parece que te cierran la sesión. Es el mismo fallo que N-03 corrigió en el menú. Cámbialo a la sección del panel: `/panel/personas/dispositivos` (constrúyela con `rutaSeccion("personas", "dispositivos")` de navigation.ts, no a mano).
   - Mide 20 px de alto; la superficie es admin (32). Llega a 32 sin alargar la tarjeta, con el mismo recurso que usan las migas: `relative` y `after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']`.

4. F-09 · LA CIFRA DEL TURNO DE INICIO (InicioScreen.tsx, el enlace de la línea ~137)
   - Mide 31 px: súbelo a 32 con `min-h-8` (es un enlace, no una fila de lista).

5. F-09 · REJILLAS SIN CELDAS VACÍAS
   - EnVivo.tsx línea ~133: cinco zonas en una rejilla de `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`. Con 2 y con 3 columnas queda un hueco al final. Haz que la ÚLTIMA zona ocupe las columnas que sobran: `sm:[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1`.
   - InicioScreen.tsx línea ~167: tres cifras en `grid-cols-2 lg:grid-cols-3`. Con 2 columnas sobra una celda: `[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1`.
   - No cambies el contenido de las zonas ni de las cifras.

NO HAGAS:
- No toques navigation.ts, @l2/ui, las estaciones ni la guardia del panel.
- No cambies textos que no se nombren aquí, ni colores fuera de los tokens.
- Nada de JavaScript para saber el tamaño de la pantalla: todo es CSS.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra lo probará en el panel a 1366×768, 1024×768 y 768×1024: que las ocho secciones lo avisen, que «Dispositivos» lleve a su sección y que ninguna rejilla de Inicio deje huecos.
