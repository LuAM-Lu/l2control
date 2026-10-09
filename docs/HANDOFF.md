# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-09 (cierre) · v0.111.0 · `main` en 6dda47d más este relevo · B8-3 en curso (el usuario, en el local)*

```text
Hecho hoy, todo en main y etiquetado: el fin de M-34 (v0.94.0 a v0.104.0), el disco lleno del VPS (v0.104.1: limpia
  imágenes viejas) y M-35 entera (v0.104.2 a v0.111.0: la caja cerrada no mueve dinero, servir y cerrar la mesa, por
  limpiar en la base, medias con interruptor, entradas por periodo, «Respaldar ahora» y los PDF compactos). 111 de 116.
M-36: el VPS ES la operación real (perfiles, equipos e inventario reales), en modo staging (D-ENT). Se pone al día
  solo con cada etiqueta: NO etiquetar sin avisar al usuario. Fusionar sin etiqueta no publica nada.
El usuario: B8-3 (paralelo con el método escrito hasta que los totales coincidan; capacitación por rol), B8-1 (4G y
  UPS; probar sin el internet principal) y B7-3 (la Xprinter por USB; la app por el 4G). Opcional: L2_SMTP_URL y
  L2_CORREO_SOPORTE en el VPS.
Siguiente para Claude: lo que salga de B8-3, como PATCH, publicado cuando el usuario diga. Para B8-4: listar (solo
  leyendo) lo que quedó de prueba en la base del VPS; pasar a modo producción con su sí y la hora; etiqueta 1.0.0.
Cuidado: «Respaldar ahora» solo se probó con el SQL simulado (pulsarlo una vez en el VPS). «Dales salida antes»
  solo con prueba unitaria. La PC de respaldos bajó el último el 8 oct.: debe encenderse para bajar los nuevos.
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
