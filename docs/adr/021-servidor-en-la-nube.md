# ADR-021 · Un solo servidor en la nube, con doble enlace a internet en el local

- **Estado:** Aceptada (2026-09-28, decisión del cliente tras la visita técnica, M-15). **Supersede la
  topología de ADR-003** (servidor en el local, topologías B y C) y con ella DEC-4 y DEC-10 en lo que
  piden un equipo en el local. Los niveles de degradación de ADR-003 siguen como idea, con otro reparto.
- **Fecha:** 2026-09-28
- **Situación en el código:** el servidor ya se empaqueta en Docker (M-4); falta el VPS (B7-1) y la red
  del local (B8-1).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** ADR-003 eligió un servidor en el local (mini-PC) con la nube como réplica, porque en
Venezuela los cortes de internet son frecuentes y el cliente no aceptaba cerrar (DEC-4). En la visita
técnica el cliente eligió **un solo servidor en la nube (VPS)** y, a cambio, **internet de respaldo** en
el local. La razón es operativa: no quiere un equipo más que cuidar, respaldar y reponer en el local.

**Decisión.**

1. La aplicación, PostgreSQL y Valkey corren **solo en el VPS** (B7-1). No hay servidor en el local ni
   réplica en sitio.
2. El local tiene **dos enlaces a internet**: el principal y un **router 4G de respaldo** que entra solo
   cuando falla el principal, con **UPS en el router, el módem y el punto de acceso WiFi**. Es parte de la
   puesta en marcha (B8-1), con su prueba de corte.
3. Todos los equipos (teléfono de la monitora, laptop de caja, tablet del mesero) hablan con el VPS por
   HTTPS y reciben los cambios en tiempo real (ADR-008, B5-1).
4. **Si caen los dos enlaces, se trabaja en papel** con los formularios impresos (entrada y cobro) y, al
   volver, la cajera carga lo anotado en su turno, marcado «desde papel» con la hora real, y supervisión
   lo revisa en el cierre (B3-7). La cocina no se entera de nada nuevo: ya trabaja con papel (ADR-022).

**Niveles de degradación, con esta topología.**

| Nivel | Situación | Qué sigue | Qué se detiene |
|---|---|---|---|
| **N0** | Todo bien | Todo | — |
| **N1** | Cae el enlace principal | Todo, por el 4G (más lento; el tiempo real sigue) | — |
| **N2** | Caen los dos enlaces, o el VPS | La pantalla dice «Sin conexión» y no deja operar a medias | Todo lo digital: se pasa a papel |
| **N3** | Sin luz y sin UPS | Nada digital | Todo: papel |

**Consecuencias.**

- **El tiempo real es más simple**: una sola instancia, sin replicación entre sitios ni conflictos al
  reconectar. Los eventos salen de la outbox del VPS (B5-1).
- **El papel es un procedimiento real**, no hipotético: formularios, carga posterior y revisión (B3-7,
  B8-2). Un corte largo de los dos enlaces detiene la caja.
- **Fail-closed se mantiene**: un equipo sin conexión no cobra ni registra en local para «subirlo
  después» (no hay cola offline de escrituras); lo dice en pantalla y remite al papel.
- **La latencia importa**: el objetivo de 2 s de B5-1 y la medición con red real de B7-3 se hacen con el
  4G, no solo con el enlace principal.
- **Correlativos y cronómetros** siguen con una sola fuente (la base del VPS y su reloj, ADR-010).

**Alternativas.** Las de ADR-003 (servidor en sitio, con o sin equipo en espera). Se descartan por
decisión del cliente, no por técnica: si los cortes simultáneos de los dos enlaces resultan frecuentes en
el piloto (B8-3), se reabre con un ADR nuevo; la imagen Docker corre igual en un mini-PC.
