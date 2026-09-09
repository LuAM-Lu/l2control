# ADR-015 · Impresión: cola con confirmación, nunca «disparar y olvidar»

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F6-09. DEC-8 lo resolvió a favor del modo red por TCP 9100.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Si la comanda se marca como enviada y la impresora estaba sin papel, la cocina nunca la ve
y nadie se entera hasta que el cliente reclama.
**Decisión.** Toda impresión es un **trabajo en cola** con estados `PENDIENTE → ENVIADO → CONFIRMADO |
FALLIDO`, reintento con espera creciente, y **alerta visible en pantalla cuando falla**. El estado de la
comanda **no avanza** por haber intentado imprimir: avanza por confirmación o por reconocimiento
explícito de una persona.
**Rutas soportadas.** Red por socket TCP 9100 (preferida); agente local para USB; `window.print()` con
CSS de impresión solo como último recurso, porque no confirma nada.

**DEC-8 resuelta a favor de la ruta simple.** El cliente confirma que la impresora comprada **admite
tanto USB como red**, y que soporta **ambos anchos de papel**. Consecuencias directas:

- Se despliega **en modo red, por socket TCP 9100**. Es la ruta preferida por una razón concreta: el
  servidor le habla directo, sin intermediarios, y **la confirmación de impresión es real** en lugar de
  la ficción que devuelve un diálogo del navegador.
- **`apps/printer-agent` sale de la Ruta A.** Es una aplicación entera que un equipo de dos personas ya
  no tiene que construir, empaquetar ni mantener actualizada en cada terminal. Queda en el plan como
  adaptador para una impresora futura que solo tenga USB, pero no se construye ahora.
- Las plantillas de 58 mm y 80 mm se construyen ambas igualmente (F1-12): el ancho es configuración por
  estación, no una decisión de una vez para siempre.
- **Contrapartida a cubrir:** una impresora en red es un dispositivo en la red. Va en la **VLAN de
  hardware** (§7.1, T4), sin exposición a internet, y con IP fija para que no se pierda al reiniciar el
  router. Sin esas dos cosas, cualquiera en la red del local puede imprimir en la cocina.
**Consecuencias.** El KDS en pantalla es la fuente de verdad y el papel es respaldo, no al revés.
