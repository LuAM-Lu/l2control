# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-11 · v0.131.0 en `main` y publicada (el VPS en 0.131.0) · M-38 entregado entero; nada reclamado*

```text
M-38 entero, en tanda y publicado una vez con la etiqueta v0.131.0 (el VPS se puso al día solo a las 5:09 am): B3-24 (un
  día sin cerrar), B5-6 (impresora principal y respaldo, red o USB), T-23 (el campo del cliente), B4-18 y B6-17 (las
  tablets), T-21 (la barra por pantalla), T-22 (las listas largas), B3-21 (mover efectivo) y B3-22 (el fondo fijo).
Quedan B8-1 (la red del local) y B8-4 (la puesta en marcha, 1.0.0), del usuario. B6-4, después del piloto.
El día 9: la caja «PC Recep. Lenovo» sigue abierta en el VPS. Con la 0.131.0 es una caja de un día anterior: solo cobra lo
  de su día y pide cerrarse (Turno → «Cerrar la caja»). La cierra el usuario con su PIN; nadie la tocó.
Impresoras en el VPS: «CAJA POS» (USB) encendida para recibos y «CAJA» (red) apagada, sin respaldo elegido. Si se quiere,
  administración pone una de respaldo en Ajustes → Impresoras.
El agente de la laptop de caja sigue en 0.111.0 (la laptop estaba apagada al publicar): al encenderla se pone al día solo;
  comprobarlo en Ajustes → Impresoras. La USB de verdad como respaldo no se probó en la laptop del local.
Por mirar en el local: «Paga …» del campo del cliente (T-23); el detalle de un representante en la tablet vertical (T-22);
  mover efectivo (tope de $ 20, Ajustes → Sucursal) y el fondo fijo (apagado; Ajustes → Dispositivos).
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
