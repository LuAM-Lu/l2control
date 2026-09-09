# ADR-014 · Video: pasarela RTSP→WebRTC en la LAN, no la nube del fabricante

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F12, módulo opcional.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 propone el SDK en la nube de EZVIZ para ver cámaras que están en la misma red que el
usuario.
**Decisión.** **go2rtc** o **MediaMTX** como pasarela local RTSP→WebRTC, con paso directo de H.264 sin
recodificar.
**Por qué.** Latencia por debajo del segundo frente a varios segundos vía nube; funciona sin internet;
sirve cualquier cámara con RTSP, no solo EZVIZ, lo que elimina el amarre a un fabricante.
**Consecuencias.** Un servicio más que operar en el sitio. Las credenciales RTSP son secretos y nunca
llegan al navegador: el cliente recibe una sesión WebRTC, jamás la URL con usuario y contraseña.
