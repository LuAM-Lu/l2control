# ADR-027 · Lo anotado en papel se carga con su hora real, dentro de la ventana del corte

- **Estado:** Aceptada (2026-10-05, B3-7, V-12). **Limita a ADR-017 y a ADR-010 con una excepción única y
  acotada**; no los supersede: siguen valiendo para todo lo demás.
- **Fecha:** 2026-10-05
- **Situación en el código:** B3-7 (`paper_load`, `paper_load_item`; `@l2/domain-cash` `papel.ts`;
  `application/caja/papel.ts` y `papel-en.ts`; `/papel`, la caja en modo papel y `/formularios-papel`).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** ADR-021 (N2) dice que, si caen los dos enlaces, el local trabaja en papel y, al volver, la cajera
carga lo anotado. Cargarlo con la hora de ahora estaría mal: el tiempo que se le cobra a un niño, la tasa que
regía, el IVA y el precio de una bebida dependen de CUÁNDO ocurrió cada cosa, y lo que ocurrió a las 3:10 pm
no ocurrió a las 5:20 pm que es cuando se carga. Pero ADR-017 y ADR-010 dicen lo contrario de lo que hace falta:
**nada del navegador declara instantes**, y el cronómetro es del servidor. Aquí hay una hora que SÍ la declara
una persona, porque es la que escribió otra persona en un papel cuando el sistema no existía.

**Decisión.**

1. **La excepción es una sola: la hora real de un registro cargado desde papel.** Nadie más declara un instante.
   La persona, el equipo, el turno, el número de orden, el precio y lo cobrado los sigue poniendo el servidor.
2. **Esa hora no se acepta suelta.** La cajera abre una **carga** en su turno y declara la **ventana del corte**
   (desde cuándo y hasta cuándo no hubo sistema). La ventana empieza antes de terminar, no termina después de
   ahora, dura a lo sumo 24 horas y no empieza más de 24 horas antes de abrirse el turno (sin conexión no se pudo
   abrir). Cada registro lleva su hora real, que tiene que caer dentro de la ventana de su carga y no ser
   posterior al momento de la carga. Se comprueba tres veces: en el dominio puro (`@l2/domain-cash`), en la
   transacción del caso de uso y por un disparador de la base (fail-closed: la segunda puerta no se salta).
3. **El servidor guarda además cuándo se cargó.** Cada registro lleva las dos horas (`occurred_at` y `loaded_at`),
   y las dos salen en la venta, en la auditoría y en la revisión de supervisión.
4. **Un registro no es una operación nueva: es la de siempre con la hora del formulario.** Entrar, salir, guardar
   una venta de mostrador y cobrar se ejecutan con `ahora` igual a esa hora: el cronómetro, la tasa citada, el IVA,
   el precio del catálogo, la existencia y el asiento del libro salen como habrían salido entonces. `ahora` no
   viaja desde la web: lo pasa solo el caso de uso de la carga, que antes revalida la hora y la ventana. No se
   cuenta el aforo a lo anotado: ya ocurrió, y no se puede rechazar lo que pasó.
5. **Una carga avanza ABIERTA → CERRADA → REVISADA** (o ABIERTA → DESCARTADA si no cargó nada). Mientras haya una
   abierta o sin revisar, el turno **no se sella** (corte Z, relevo o jornada) y la jornada no se cierra: sale en
   los pendientes del cierre, en Inicio y en las excepciones del turno. Revisa **supervisión o administración, con
   su PIN**, contra las hojas; **quien cargó no revisa su propia carga**.
6. **El alcance** es lo que decidió el cliente (V-12): entradas, salidas y cobros. Los cobros alcanzan a cualquier
   cuenta en la cola y a las ventas de mostrador; los pedidos del restaurante y abrir cuentas de mesa no se cargan
   desde papel (ver consecuencias).

**Consecuencias.**

- **El riesgo es real y está acotado, no eliminado.** Una cajera podría cargar algo que no ocurrió. Lo frenan la
  ventana (no puede ser de cualquier momento), la revisión de supervisión contra el papel con PIN, el rastro con
  las dos horas, y el arqueo: dinero que no entró no existe en la gaveta y aparece como diferencia en el Z.
- **El libro guarda la hora real** (`recorded_at`); cuándo se cargó está en el registro de la carga y en la
  auditoría. Los correlativos de orden siguen el orden de carga, no el de ocurrencia.
- **Precios y tarifario son los publicados al cargar**, no los de la hora real: el tarifario no se versiona por
  fecha. Es aceptable mientras un corte no cruce un cambio de precios; si pasa, el contador lo ve en la revisión.
- **Un corte de más de 24 horas se carga en dos**, una carga por ventana.
- **Fail-closed se mantiene:** sin tasa que rigiera a esa hora no se cobra en bolívares; sin hora válida el
  servidor rechaza y la caja de papel no cae al cobro de ahora por descuido.
- ADR-021 no cambia: no hay cola offline de escrituras ni sincronización. El papel es un procedimiento, y esto es
  el procedimiento de carga.

**Alternativas.**

- *Cargar con la hora de ahora y dejar la hora anotada como un texto informativo.* Se descarta: el cobro de tiempo,
  la tasa y el IVA saldrían de la hora equivocada, y la caja cuadraría contra un libro que miente sobre cuándo.
- *Una cola offline de escrituras en el navegador, que se sube al volver.* Se descarta por ADR-021: no hay
  conflictos que resolver ni cola que cuidar porque el trabajo sin conexión es papel.
- *Aceptar cualquier hora pasada, sin ventana.* Se descarta: la ventana es lo que convierte «una hora que dice el
  navegador» en «una hora de un corte que supervisión puede comprobar».
