# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-09 (noche) · v0.111.0 · `main` más este relevo · M-37 en curso (Claude); B8-3 hecho por el usuario*

```text
El usuario terminó la operación en paralelo (B8-3), B7-3, «Respaldar ahora» y la PC de respaldos. De lo que vio salió
  M-37 (MAESTRO §2 «M-37 en detalle», §3 punto 15): 4 correcciones (v0.111.1) y 10 pasos, en este orden:
  B4-17 (regla de precio del parque) → B6-15 (desvincular) → B3-16 (cobrar juntas) → B3-20 (dividir por ítems) → B3-19
  (el vuelto) → B3-18 (anular y devolver, de admin) → B3-17 (consumo del personal) → T-20 (los puestos, por uso) →
  B11-6 (Reportes → Parque) → B11-7 (Movimientos).
Sin parar entre pasos. Cada uno entra en main probado y con su versión, SIN etiqueta: se publica una sola vez al final
  (la etiqueta de la última), a la hora que diga el usuario. El VPS es la operación real en modo staging (M-36).
Cambian D-AUT (anular y devolver, PIN de administración), M-18 (devolver lo no usado) y B3-14 (el parque se devuelve).
Para la 1.0.0, después: listar lo de prueba en la base del VPS (solo leer), modo producción (D-ENT) y B8-1 (4G y UPS).
Cuidado: B6-15, B3-16 y B3-20 comparten «mover líneas entre cuentas» (movedTo); B3-19 y B3-17, el cobro y el arqueo.
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
