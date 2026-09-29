# ADR-025 · El tiempo real cuenta qué cambió, desde un outbox que escribe la auditoría

- **Estado:** Aceptada (2026-09-29, B5-1). **Concreta ADR-008** (Socket.io con adaptador Valkey,
  autorización en el apretón de manos) y ADR-006 (el worker aparte). No supersede ninguna.
- **Fecha:** 2026-09-29
- **Situación en el código:** hecha en B5-1 (v0.30.0). Tabla `outbox_event` con su disparador sobre
  `audit_log` (migración `20261011000000_outbox`); `tiempoReal` y `sesiones.enCurso` en
  `@l2/application`; `apps/worker` (canal, vuelta del outbox, latido y sincronización del BCV); en la
  web, `TiempoRealProvider`, `useAlCambiar` y `pedirTicketTiempoReal`.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** B5-1 pide que todo lo que cambia en el servidor llegue a los demás equipos en menos de
2 s, que una sucursal no reciba eventos de otra, que ningún evento se pierda ni salga de una operación
que no ocurrió, y que con el worker caído la operación siga. Hasta aquí las pantallas preguntaban cada 5 s
(sala y cuentas) o cada 60 s (tasa), y el bus del restaurante no salía de un navegador.

**Decisión.**

1. **El outbox lo escribe la base, desde la auditoría.** Toda escritura ya deja su asiento en
   `audit_log` en su transacción (DoD 3). Un disparador añade por cada asiento `HECHO` una fila a
   `outbox_event` y un `pg_notify` en esa misma transacción. Ningún caso de uso puede olvidarse de
   avisar, un rechazo no avisa, y lo que se deshace no deja evento. El worker marca lo publicado una sola
   vez; la aplicación no la borra ni la reescribe.
2. **Por el canal van temas, no datos.** La acción del asiento se traduce a temas (`sala`, `cuentas`,
   `tasas`…) con una tabla exhaustiva sobre el catálogo de acciones (una acción nueva no compila sin
   decidir qué invalida). Cada pantalla vuelve a leer lo suyo por su acción de siempre, con su sesión y
   sus permisos. El canal no puede filtrar lo que la persona no puede leer; un evento repetido cuesta una
   lectura de más, y al reconectar se vuelve a leer todo.
3. **El worker publica.** Escucha el `pg_notify` y barre la tabla cada 5 s por si un aviso se perdió;
   agrupa por sucursal y publica en la sala de la sucursal (o del tenant, si el asiento no es de una).
   Con él caído, los eventos esperan en la tabla y salen al volver; los navegadores, sin canal, dicen
   «Sin conexión en vivo» y vuelven a leer todo cada 30 s mientras dure.
4. **Autorización en el apretón de manos con un ticket.** El navegador no manda su cookie al worker:
   pide al servidor web un ticket HMAC (clave derivada con HKDF de `L2_CLAVE_CIFRADO`) de su sesión, que
   vale 60 s. El worker comprueba firma, plazo, tenant y, en la base, que la sesión siga viva. Sin
   credenciales ambientales no hace falta cerrar el origen (no hay CSWSH posible).
5. **Latido.** Cada minuto el worker confirma las sesiones con el canal abierto (y les apunta que siguen
   ahí, como hacía el sondeo) y cierra el canal de las que murieron; con una salida, revocación o baja,
   en el acto.
6. **Quién está en cada puesto** sale de las sesiones abiertas en la base (`sesiones.enCurso`), no de un
   evento que declare un navegador.
7. **El bus del restaurante** (provisional hasta la Etapa 6) viaja por el worker: solo tipos `mesa.*` y
   `pedido.*`, revalidados, con la hora del servidor, con tope de 30 eventos por 10 s por conexión y
   guardados por sucursal en Valkey (500, un día) para ponerse al día.
8. **Un worker por local**, con el tenant de su entorno, igual que el servidor web.

**Consecuencias.** Una sola vía para todo el tiempo real, cubierta por construcción. El precio es una
lectura por pantalla y cambio (decenas por minuto en el local, nada para la base) y un proceso más que
desplegar (B7-1: el proxy lleva `/tiempo-real` al worker). La tabla crece con cada asiento; purgar lo
publicado de más de unos días, con el papel del migrador, queda para el runbook (B8-2).
