# ADR-019 · La tasa oficial del BCV se aplica sola, con salvaguardas, y llega en vivo

- **Estado:** Aceptada (pedido del cliente, 2026-09-26). **Cambia PLAN §5.2 y el criterio de F3-04** en
  un punto: la tasa traída automáticamente ya no espera siempre la confirmación de una persona.
  ADR-005 (la tasa se congela en cada transacción) sigue entero.
- **Fecha:** 2026-09-26
- **Situación en el código:** pendiente, paso B2-1c del MAESTRO. Hoy lo traído entra pendiente (B2-1b).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** §5.2 pide que toda tasa obtenida automáticamente entre como `PENDIENTE` y que un
administrador la confirme antes de cobrar con ella. Es la defensa contra la amenaza T6: un proveedor
tercero comprometido no debe poder mover los precios. En la práctica, la tasa cambia cada día hábil. Si
la confirmación depende de que alguien entre al panel, la caja se queda sin tasa o cobra con una vieja
hasta que alguien se acuerde. El cliente pide que la tasa del BCV se actualice sola y que el cambio
llegue a todas las pantallas en el momento.

**Decisión.** La tasa se aplica sola **solo cuando nada indica un problema**, y cuando algo lo indica
vuelve a pedir a una persona:

1. **Fuente oficial.** Se aplica sola la que publica la web del BCV, leída con la verificación TLS entera.
   Un tercero (DolarApi) sirve de contraste y de respaldo; si solo responde el tercero, lo traído queda
   pendiente.
2. **Límite de cordura.** Si el valor se aparta de la tasa vigente más que el umbral configurado (10 %),
   o es la primera tasa del local, **no** se aplica: queda pendiente y aparece como alerta crítica en
   Inicio y en la pantalla de tasas.
3. **Fuentes que discrepan.** Si dos fuentes dan valores distintos para la misma fecha valor, no se
   captura nada de esa fecha y se avisa.
4. **Rastro completo.** La confirmación automática es un asiento más, de solo-agregar, a nombre de
   «Aplicada automáticamente (BCV)» y con la respuesta cruda de la fuente. Un error se corrige como
   siempre: se captura otra tasa (regla 5).
5. **Carga manual.** Cuando administración teclea una tasa, se aplica al guardarla, sin segundo paso.
   Si salta más del umbral o es la primera, se teclea dos veces en el mismo formulario. Supervisión
   sigue necesitando autorización (🔐).
6. **En vivo.** Todas las pantallas que muestran o usan la tasa leen la misma fuente
   (`useTasaVigente`). Hasta el tiempo real (B5-1) consultan al servidor cada 60 s y al volver el foco;
   después, el cambio llega por el canal de eventos en menos de 2 s.
7. **Cobro en curso.** Un cobro ya empezado conserva la tasa con la que empezó (ADR-005). Si la tasa
   cambia mientras tanto, la caja lo avisa y ofrece recalcular; el servidor rechaza cerrar un cobro con
   una tasa que ya no es la vigente fuera de un margen corto (B3-3).
8. **Consulta.** La consulta se repite cada 15 minutos y al arrancar el servidor, y se aleja si la
   fuente falla. Si a la hora habitual de publicación de un día hábil no hay tasa para el siguiente día
   hábil, sale un aviso.

**Consecuencias.** La caja no depende de que alguien confirme cada día, y la amenaza T6 sigue cubierta:
un valor anómalo o sin respaldo oficial no se aplica solo. El coste es un canal de actualización en vivo
y una regla de congelamiento explícita en el cobro, que ya pedía ADR-005.
