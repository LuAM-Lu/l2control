Sube los objetivos táctiles de las pantallas de cobro (superficie POS, 56 px) y de mesas (superficie tablet, 48 px) a su mínimo, sin romper que esas pantallas quepan sin scroll a 1366×768 y 1280×800. Hallazgos F-04 y F-05 de docs/AUDITORIA-FRONTEND.md.

DECISIONES YA TOMADAS (no las cambies):
- Botones de icono, filtros, chips, pestañas y contadores de las pantallas de cobro: 56 px (size-14 o min-h-14).
- EXCEPCIÓN: las FILAS de una lista que ocupan todo el ancho (filas del ticket de caja, filas de la lista de ventas) quedan en 48 px (min-h-12). Un objetivo que ocupa toda la fila se acierta sin esfuerzo, y a 56 alargaría las listas hasta forzar scroll. Deja un comentario de una línea que lo diga donde lo apliques.
- La barra de estación (StationBar) NO se toca en este encargo.
- @l2/ui ya lo permite: Stepper y Tabs aceptan surface="pos" (56 px). Úsalo; no copies tamaños a mano.

QUÉ HACER:

1. apps/web/src/features/cash/CajaScreen.tsx
   - Filas editables del ticket (hoy min-h-8, cerca de la línea 632, en el botón y en el div de las no editables): min-h-12, con el comentario de la excepción.
   - Botones de «Dividir la cuenta» (—, 2…6; hoy size-9, cerca de la línea 815): size-14. Si a 1280 px no caben en una fila, que el grupo pueda partirse (flex-wrap) en vez de desbordar.
   - No toques el botón que ya amplía su zona con after:-inset-2 (cerca de la línea 724): ya mide 56 efectivos.

2. apps/web/src/features/cash/ColaCuentas.tsx
   - Botón de buscar (hoy size-10, cerca de la línea 154): size-14.
   - Botón de cerrar la búsqueda (hoy size-9, cerca de la línea 227): size-14.
   - «Recibo» (hoy min-h-11, cerca de la línea 326): min-h-14.
   Si para que quepan hay que ajustar el alto de la cabecera de la cola, hazlo sin cambiar su diseño.

3. apps/web/src/features/cash/VentasScreen.tsx
   - Botón de icono de la búsqueda (hoy size-9, cerca de la línea 183): size-14.
   - Filtros por medio (hoy min-h-12, cerca de la línea 198) y el enlace de la línea 214: min-h-14.
   - Filas de la lista de ventas: 48 (excepción), no las subas.
   - El control de la línea 256 (min-h-12): si es un botón dentro de la fila, déjalo en 48 como parte de la fila; si es un botón independiente, súbelo a 56. Explica en el resumen cuál era.

4. apps/web/src/features/cash/TurnoScreen.tsx
   - <Tabs …> (cerca de la línea 178): añade surface="pos".
   - Cada <Stepper …> del arqueo (cerca de la línea 218): añade surface="pos".
   - No cambies la disposición del arqueo (la de vertical es otra tarea, F-03).

5. apps/web/src/features/mesas/MesasScreen.tsx
   - Conmutador «Plano | Atender» (hoy min-h-11, cerca de la línea 306): min-h-12.

6. apps/web/src/features/mesas/TomaPedido.tsx
   - Botón de nota de cada plato del borrador (hoy min-h-8 con -my-2, cerca de la línea 178): que su zona táctil llegue a 48 px. Si subirlo a min-h-12 descuadra la fila, usa el mismo recurso que CajaScreen: un after:absolute after:-inset-2 (o el inset que haga falta) para ampliar la zona sin cambiar lo que se ve.

NO HAGAS:
- No toques nada fuera de estos seis archivos.
- No cambies colores, textos ni la estructura de las pantallas.
- No toques StationBar, AccesoScreen, BackOfficeShell ni layout.tsx (otra obrera trabaja en ellos).

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume, archivo por archivo, qué subiste y de cuánto a cuánto.
