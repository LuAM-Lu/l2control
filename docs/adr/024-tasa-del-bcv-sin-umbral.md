# ADR-024 · La tasa que publica el BCV se aplica siempre, sin límite de cordura

- **Estado:** Aceptada (2026-09-28, decisión del cliente, V-14 y D-CORD). **Supersede el punto 2 de
  ADR-019** (el límite de cordura). El resto de ADR-019 sigue entero: fuente oficial, fuentes que
  discrepan, rastro completo, carga manual, en vivo, cobro en curso y consulta periódica.
- **Fecha:** 2026-09-29
- **Situación en el código:** hecha en B5-1 (v0.30.0). `autoApplyDecision` de `@l2/domain-rates` ya no
  recibe umbral ni devuelve `SALTO`; la sincronización del BCV vive en `apps/worker`. El umbral
  `UMBRAL_VARIACION_BPS` (10 %) sigue, solo para pedir que una persona teclee dos veces lo que carga a
  mano (§5.2).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** ADR-019 dejaba pendiente, con alerta crítica, una tasa del BCV que se apartara más del 10 %
de la vigente, para que una persona la confirmara. En Venezuela la tasa oficial puede moverse mucho de
un día para otro, y cuando lo hace es justo cuando más importa cobrar con la nueva. El cliente decidió
(V-14) que la tasa del BCV es siempre la que trae la API: esperar a que alguien entre al panel dejaría la
caja cobrando con una tasa vieja, que es el riesgo que ADR-019 quería evitar.

**Decisión.**

1. Una tasa que publica la web oficial del BCV (leída con TLS verificado) se aplica sola **salte lo que
   salte** respecto de la vigente. Si ya había una para ese día (también una cargada a mano), la nueva
   la sustituye: rige la última confirmada.
2. Siguen esperando a una persona, con su alerta crítica: la que **solo** dio un tercero (DolarApi,
   amenaza T6) y la **primera** del local, que no tiene con qué contrastarse. Son las dos salvaguardas de
   ADR-019 que no son un umbral, y la primera ocurre una vez en la vida del local (Puesta a punto, T-4).
3. Si dos fuentes discrepan para el mismo día, no se captura ese día (ADR-019 §3, sin cambios).
4. Si la API falla, administración (o supervisión con 🔐) carga la tasa a mano en Ajustes → Tasas y se
   aplica al guardarla, como hasta ahora; en dólares se cobra siempre.
5. Una retenida antigua por salto (`held_back = 'SALTO'`, anterior a esta decisión) no se reescribe: la
   siguiente consulta al BCV la aplica si la web oficial la confirma.

**Consecuencias.** La caja nunca se queda con una tasa vieja por un salto real. Se pierde la defensa
contra un error de la propia web del BCV que dé un valor absurdo con TLS válido; se acepta porque es la
fuente legal de la tasa, y el rastro sigue completo (cada aplicación automática deja su asiento con la
respuesta cruda). Un error se corrige como siempre: se carga la correcta a mano, que la sustituye.
