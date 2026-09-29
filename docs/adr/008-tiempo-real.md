# ADR-008 · Tiempo real: WebSocket para lo bidireccional, SSE donde alcance

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** hecha en B5-1 (v0.30.0) con el diseño de [ADR-025](025-tiempo-real-por-outbox.md):
  `apps/worker`, autorización con ticket en el apretón de manos y una sala por sucursal. El envío de
  comandas (F6-06) lo usará en la Etapa 6.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 fija Socket.io para todo. Socket.io a escala exige sesiones pegajosas y un adaptador
de pub/sub; para una sucursal con decenas de conexiones eso es infraestructura sin retorno.
**Decisión.** **Socket.io con adaptador Valkey**, en **una sola instancia del worker** por sitio.
El adaptador se configura desde el inicio (para que escalar no sea una reescritura) pero no se despliega
un clúster hasta que haga falta.
**Por qué.** El KDS es genuinamente bidireccional: el cocinero cambia estados que vuelven al mesero.
El monitor de parque, en cambio, es unidireccional y podría ser SSE; se unifica en un solo transporte
por simplicidad operativa, no por necesidad técnica.
**Autorización.** La autenticación ocurre **en el handshake**, no después. Cada conexión se suscribe
solo a las salas de su `tenant_id` y su `branch_id`. Se aplica límite de tasa por conexión.
**Consecuencias.** Documentar que una instancia basta hasta ~10 000 conexiones concurrentes, muy por
encima de lo que este negocio necesita.
