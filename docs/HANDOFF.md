# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-08 (cierre, 2) · v0.84.0 · `main` en 1a2fd68 más este relevo · nada a medias ni reclamado*

```text
Hecho, todo en main y etiquetado: M-27, M-28 y M-29 enteros (v0.61.0 a v0.84.0). 84 de 91.
Decidido hoy, sin programar: M-30 (B8-2 sin manual aparte: la ayuda de la app ES el manual) y M-31 = B3-9, UNA tarea:
  el punto de cobro (solo equipos marcados abren turno; en otro, PIN de administración y motivo, auditado y en Inicio)
  y la entrada desde la caja (registrar y cobrar sin salir de ella, reutilizando Entrada). El aviso «sin pulsera», no.
  Regla nueva para todo paso: punto 10 de la definición de hecho (ayuda, soporte, data-privado, vivo, permisos…).
Siguiente, AUTOMÁTICO y sin pedir el sí entre partes (MAESTRO §3, orden 9 y 10): B3-9 → T-8c (programar y probar en
  una PC con Windows) → lo escrito de B8-2 (hoja del procedimiento en papel y runbooks; B8-2 se cierra en B8-3).
  Después, en el local: B7-3, B8-1, B8-3 y B8-4 = 1.0.0. La 1.0.0 NO se etiqueta desde aquí.
Para decidir (usuario): D-REL antes de B8-4. Para el usuario: L2_SMTP_URL y L2_CORREO_SOPORTE en el VPS; P-1, P-3,
  P-5, P-6 y P-14; dominio propio y firma del alcance (F0-09) antes de B8-3.
Cuidado: B3-9 parte CheckInScreen en piezas y Entrada debe quedar idéntica (2 niños < 90 s). Pruebas con azar: nunca un
  literal que el azar pueda dar (§5). Tras cambiar @l2/application, reiniciar pnpm dev. feat/t-11: no se borra.
```

## aemorandin-coder

*2026-10-06 (cierre) · v0.52.3 · `main` en 7382057 más este relevo*

```text
Hecho hoy, todo en main: T-2 (v0.51.0), T-4 (v0.52.0) y cuatro entregas entre pasos. 52 de 62 pasos; nada a medias ni reclamado.
T-4 (ADR-020): con la base vacía el acceso ofrece «Instalar L2 Control» (código del registro del servidor); confirmar
  identidad y aprobar un equipo piden contraseña + llave de acceso, o un código de recuperación; Ajustes → Usuarios da
  credenciales con un enlace de 24 h con QR (/alta); Inicio enseña la Puesta a punto. Ya no hay TOTP ni pnpm totp.
v0.51.1: fondos de estado con más luz que la tarjeta e iconos de aviso animados (por selector en tokens.css; `l2-quieto` apaga uno).
v0.52.1: un doble clic al anular un cobro ya no responde «ya se revirtió» (carrera en pagos.revertir; puso main en rojo).
v0.52.2 (M-21): tema claro, predeterminado y por equipo (cookie l2_tema, data-tema en <html>, botón en el acceso y el menú).
  En claro, los avisos rojos y amarillos son bloques sólidos y sus tokens se redefinen dentro. v0.52.3: logo de L2 (LogoL2).
Siguiente: T-8 (actualizaciones, ADR-028), libre. Criterio en MAESTRO §3: una etiqueta vX.Y.Z publica las imágenes y el agente;
  Ajustes → Sistema decide cuándo; con la salud forzada a fallar vuelve sola atrás. No hay ningún Dockerfile: es lo primero.
Al actualizar tu copia: pnpm install, pnpm db:migrar (solo expande) y L2_URL_PUBLICA=http://localhost:3000 en tu .env; entra
  siempre por localhost. Para confirmar identidad hace falta una llave: pnpm credenciales "Abigail Karam" da el enlace, y en
  Chrome sirve el autenticador virtual de DevTools → WebAuthn.
Cuidado: mira cada pantalla en los DOS temas; un local recién instalado no tiene tarifario (no lo exijas en el layout); una
  prueba de concurrencia de una sola pasada engaña. Sin ver: sala y mesas en alerta en claro. «Abby Kingdom», a mano (§5).
```
