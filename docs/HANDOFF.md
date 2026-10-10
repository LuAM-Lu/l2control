# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-10 · v0.122.2 en `main` (publicada, la 0.122.0) · M-38 definido entero; nada reclamado*

```text
M-38 definido con una propuesta dibujada y cuatro rondas de preguntas (MAESTRO §2, «M-38 en detalle», W-1 a W-14). Su
  corrección (v0.122.1 y v0.122.2) ya está en main, sin publicar: avisos legibles en el tema claro y un renglón por puesto.
Siguen, en tanda y sin parar (Claude): B3-24 → B5-6 → T-23 → B4-18 → B6-17 → T-21 → T-22 → B3-21 → B3-22. Cada uno
  entra en main probado y con su versión. Se publica una sola vez al final, con el permiso del usuario del 2026-10-10:
  se le avisa la hora, se etiqueta la última y se comprueba el VPS solo leyendo. Ruta: 136 pasos.
El siguiente: B3-24. Criterio: con la caja de ayer abierta, cobrar hoy lleva al cierre y lo de hoy nunca cuenta en el
  día de ayer; el día de negocio termina a la hora de los ajustes (4:00 am de fábrica); de noche, Inicio avisa.
El día 9: la caja de «PC Recep. Lenovo» quedó abierta con seis mesas. El usuario la cierra con lo que ya tiene L2
  (cobrar o «Se fue sin pagar», cerrar con su justificación, abrir la del 10). Hay que confirmar que se hizo.
La impresora: hoy por USB («CAJA POS», POS-80C), sin aviso de papel; el agente va en 0.111.0. «CAJA» es la de red.
  B5-6 las une como principal y respaldo, a elección de administración (L2 sugiere la de red).
Cuidado: MAESTRO.md va con finales CRLF (un guion que lo edite los respeta). La cocina no tiene pantalla: su gente entra
  una vez para cambiar el PIN temporal, o no firma su consumo. Sonner sigue data-tema. Mira cada pantalla en los dos temas.
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
