# ADR-026 · La impresión llega al local por un agente en la laptop de caja

- **Estado:** Aceptada (2026-10-01, decisión del equipo con el cliente al llegar a B5-2). **Supersede la parte
  de ADR-015 que decía quién abre la conexión** («el servidor le habla directo» por TCP 9100) y la consecuencia
  de DEC-8 que sacaba `apps/printer-agent` de la Ruta A. Todo lo demás de ADR-015 sigue: la impresión es un
  trabajo en cola con estados, reintentos y alerta visible, y nada avanza por haber intentado imprimir.
- **Fecha:** 2026-10-01
- **Situación en el código:** B5-2 (`print_job`, `printer`, `print_agent`; `@l2/domain-printing`;
  `apps/worker` con el espacio `/impresion`; `apps/printer-agent`).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** ADR-015 eligió que el servidor imprimiera directo en la impresora de red (TCP 9100), cuando el
servidor iba a estar en el local (ADR-003). Con ADR-021 el servidor es **un solo VPS en la nube**: no puede
abrir una conexión hacia una impresora con IP privada (192.168.x.x) dentro del local. Las alternativas eran
una impresora con impresión en la nube (Epson Server Direct Print, Star CloudPRNT: depende del modelo, que
aún no se conoce), un túnel VPN entre el router del local y el VPS (depende del router y se complica con el
internet 4G de respaldo) o imprimir desde el diálogo del navegador (no confirma nada).

**Decisión.**

1. Un **agente de impresión** (`apps/printer-agent`) corre en la laptop de caja, que está encendida mientras el
   local opera. Se conecta **hacia fuera** al worker (Socket.io, espacio `/impresion`), como cualquier equipo:
   no se abre ningún puerto en el router.
2. Se **vincula una vez** con un código de un solo uso (10 minutos) que genera administración en Ajustes →
   Impresoras. El agente lo cambia por una credencial propia, larga y aleatoria, que el servidor guarda solo
   como huella; retirarla desde el panel lo desconecta en el acto.
3. El servidor guarda la **cola** (`print_job`, por sucursal): `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO`, con
   reintentos de espera creciente (5 intentos) y un trabajo enviado que no responde vuelve a la cola. Lo que
   falló o espera y ya no hace falta, una persona lo **descarta** (`DESCARTADO`, v0.39.2): no se imprime, deja
   de avisar y queda en el historial con su nombre; lo que el agente tiene en la mano, no. El
   **servidor compone el ticket** en ESC/POS (`@l2/domain-printing`, 58 y 80 mm, página de códigos 850 para
   tildes y eñes): el agente no sabe de recibos ni de comandas, solo manda bytes a una IP y un puerto.
4. El agente imprime por **TCP 9100 en la red del local**. Antes pregunta el estado del papel (DLE EOT 4) y,
   si la impresora dice que no tiene, el trabajo **falla** con ese motivo. **Confirmado** significa que la
   impresora aceptó los bytes y la conexión cerró bien: es la confirmación que da el protocolo, no una foto
   del papel.
5. Las impresoras son un **dato del local** (Ajustes → Impresoras): IP privada, puerto, ancho, y para qué sirve
   cada una (**recibos y cortes**, **comandas**); a lo sumo una activa para cada cosa. Hoy una sola, en la caja,
   hace las dos (V-4, V-5).

**Consecuencias.** Hay un programa que instalar en la laptop de caja (B7-3 ya instala la app en los equipos) y
que debe estar en marcha: si no lo está, los trabajos esperan en la cola y la caja lo ve. Un fallo de la
laptop deja sin papel hasta que vuelva, como un corte de la impresora. La impresora sigue en la VLAN de
hardware con IP fija (ADR-015). Si el cliente compra una impresora con impresión en la nube, se puede añadir
ese camino sin tocar la cola.
