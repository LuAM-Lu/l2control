# ADR-028 · Las actualizaciones las decide administración y llegan solas a cada equipo

- **Estado:** Aceptada (2026-10-05, decisión del usuario antes de ir al VPS; M-20). **Concreta** lo que PLAN §10.3
  y B7-1 dejaban en «despliegue reversible, nunca en horario de servicio»: quién lo decide, cómo se vuelve atrás y
  cómo llega la versión nueva a lo que ya está abierto en el local.
- **Fecha:** 2026-10-05
- **Situación en el código:** nada todavía. Lo construye **T-8**, antes de B7-1. Piezas que ya existen y se
  reutilizan: la versión del `package.json` (M-10), el `/salud` del worker que dice su versión, el canal en vivo
  (ADR-025) y el agente de impresión empaquetado (ADR-026).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Con un solo servidor en la nube (ADR-021), el software vive en un sitio: el teléfono, la tablet y la
laptop abren la web y no instalan nada. Actualizar es poner una versión nueva en el VPS. Pero hay tres cosas que
hoy nadie resuelve:

1. **Cuándo.** Una actualización en mitad de un cobro, con niños en sala, es justo lo que PLAN §10.3 prohíbe, y
   quien sabe si el local está tranquilo es el local, no quien programa.
2. **Lo que ya está abierto.** Una pestaña sigue con el código viejo hasta que se recarga. Tras un despliegue,
   Next cambia los identificadores de las acciones del servidor: una caja con la pestaña vieja puede fallar al
   cobrar («Failed to find Server Action»), y hoy nada lo avisa.
3. **El agente de impresión** es un programa instalado en la laptop de caja (`l2-impresion.exe`): solo se
   actualiza reinstalándolo a mano.

**Decisión.**

1. **De GitHub al VPS, sin manos y sin tocar producción.** Todo entra a `main` por PR con el CI en verde. Una
   etiqueta `vX.Y.Z` construye las imágenes de la web y del worker (y el ejecutable del agente) y las publica;
   staging se actualiza solo. Para producción la versión queda **disponible**: un push nunca actualiza producción.
2. **En producción decide administración, desde el panel.** Ajustes → Sistema dice «Hay una versión nueva:
   vX.Y.Z», con sus novedades tal como las cuenta `CHANGELOG.md`, y ofrece **Actualizar ahora · Esta noche al
   cierre · Más tarde**. «Ahora» solo se puede sin turnos abiertos ni niños en sala; si no, propone «al cierre».
   Lo pide quien tiene el permiso (administración, con su 🔐) y queda en la auditoría. Una versión marcada
   **urgente** (seguridad) insiste en cada entrada de administración, pero tampoco corta un cobro.
3. **Cada actualización se puede deshacer sola.** El orden es: respaldo de la base → migraciones → la versión
   nueva → comprobación de salud (web, worker, base). Si la comprobación falla, vuelve sola a la versión anterior
   y lo avisa en el panel. Para que volver atrás sea cambiar de versión sin tocar datos (regla 5), **las
   migraciones son de expandir y contraer**: la versión anterior tiene que funcionar con la base nueva; lo que se
   retira (una columna, una tabla) se retira en una versión posterior.
4. **El personal no decide nada: su pantalla se pone al día sola.** Cuando la versión nueva está en marcha, el
   canal en vivo lo dice a todas las pantallas. Cada una se recarga en cuanto está libre (sin un cobro, un
   diálogo o un formulario a medias); si está ocupada, como mucho dice «al terminar se actualiza el sistema».
   **Fail-closed:** si el servidor ya no acepta la versión de una pantalla, esa pantalla no cobra ni escribe
   hasta recargarse (lo de la cuenta no se pierde: es del servidor).
5. **El agente se actualiza solo, con la cola vacía.** Dice su versión al servidor; si hay una nueva, la descarga
   del propio servidor, comprueba su huella (SHA-256 publicada con la versión) y se cambia sin papel pendiente.
   Ajustes → Impresoras enseña la versión del agente y la disponible, con «Actualizar ahora». Si la versión nueva
   no arranca, la tarea de Windows vuelve a la anterior.

**Consecuencias.**

- Nace un paso, **T-8 · Actualizaciones**, antes de B7-1; B7-1 lo usa para su primer despliegue y para ensayar
  una vuelta atrás.
- El servidor necesita conocer su propia versión y la disponible: la publicada por la etiqueta, no la del
  navegador (ADR-017).
- Escribir una migración pasa a tener una regla más (expandir y contraer); se añade a la definición de hecho.
- Se descarta la actualización automática nocturna sin preguntar (el usuario eligió que decida administración) y
  la de solo desarrollo (el local no sabría qué versión tiene ni cuándo cambió).
