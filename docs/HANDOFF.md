# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-14 · v0.143.0 en `main` (d9b2001), sin publicar: el VPS sigue en 0.131.0 · M-39 entregado entero; nada reclamado*

```text
M-39 entero en main, sin parar entre pasos: v0.131.1 y B3-25 a B10-5 (v0.132.0 a v0.143.0), seis migraciones de expandir.
Falta publicar: la etiqueta v0.143.0 sobre d9b2001 (git tag v0.143.0 d9b2001 y git push origin v0.143.0); el VPS se pone
  al día solo en un minuto. El permiso de la sesión no dejó crearla. Después: /salud en 0.143.0, que la caja cobre y que el
  agente de la laptop responda (Ajustes → Impresoras).
Quedan B8-1 (la red del local) y B8-4 (la 1.0.0), del usuario. B6-4, después del piloto.
Decidido al programar, para mirar en el local: con partes iguales ya cobradas no se pide más a esa cuenta (B6-18); una mesa
  sin cliente anotado (de antes de B6-9) no pregunta «otra familia» (B6-20); lo descontado en la quincena se marca con lo
  que hay ese día (B3-26); administración y soporte no cierran su otra sesión (B1-7); lo contado sin entrada vale $ 0 (B9-14);
  los lugares los guardan solo los cumpleaños con el anticipo cobrado (B10-4); la cuenta del cumpleaños con mesa no sale de
  la cola al pedir y el mesero puede sentarlo y empezarlo (B10-5).
El día 9: la caja «PC Recep. Lenovo» sigue abierta en el VPS; la cierra el usuario. Impresoras y agente, como el 11.
Cuidado: MAESTRO.md y muchos .ts van con CRLF. El día de negocio termina a las 4:00 am: un turno abierto antes es de ayer.
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
