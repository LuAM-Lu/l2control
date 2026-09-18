Arregla la barra de estación para que NO se monte en tablets verticales (hallazgo F-03 de docs/cerrados/AUDITORIA-FRONTEND.md). A 768×1024, la pestaña «Turno» queda encima del indicador del turno: las pestañas y los chips de contexto no caben en una sola fila.

CAUSA: en apps/web/src/features/shell/StationBar.tsx la barra pasa a UNA fila desde el punto de corte sm (640 px). Entre 640 y 1023 px no cabe todo.

DECISIÓN YA TOMADA (no la cambies):
- Hasta 1023 px la barra usa DOS filas: arriba, «Panel» (si se ve), los chips de contexto, el botón de pantalla completa, la persona y salir; abajo, a todo el ancho, las pestañas del puesto repartiendo el ancho a partes iguales. Es lo que hoy ya pasa por debajo de 640 px.
- Desde 1024 px (punto de corte lg), UNA fila de 64 px, exactamente como hoy.
- En vertical hay alto de sobra; en horizontal a 1024 px, sí cabe en una fila (comprobado).

QUÉ HACER (solo en apps/web/src/features/shell/StationBar.tsx):
1. En las clases de maquetación de la barra, cambia el punto de corte sm: por lg: donde decide «una fila o dos»:
   - el contenedor (línea ~157): sm:h-16, sm:flex-nowrap, sm:gap-3 y los paddings sm:pl-[…] / sm:pr-[…] → lg:…
   - la navegación de pestañas (línea ~184): sm:order-none sm:w-auto → lg:…
   - cada pestaña (líneas ~190 y ~197): sm:flex-none, sm:justify-start → lg:…
   - el separador vertical (línea ~253): hidden sm:block → hidden lg:block
2. NO cambies ocultarTextoHasta ni el resto de puntos de corte que deciden si un chip muestra su texto (línea ~340): eso es otra cosa.
3. Actualiza el comentario de la envoltura (el que dice «a partir de sm todo cabe en una sola de 64 px») para que diga lg y por qué: entre 640 y 1023 px las pestañas y los chips no caben juntos (F-03).
4. Comprueba que la fila de abajo mantiene objetivos de 48 px y que la barra sigue respetando var(--seguro-arriba).

NO HAGAS:
- No toques ningún otro archivo.
- No cambies colores, textos, iconos ni el orden de los elementos en la fila de arriba.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué clases cambiaste.
