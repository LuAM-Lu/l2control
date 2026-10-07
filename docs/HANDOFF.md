# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-07 · v0.54.0 · `main` en 926a4d8 más este relevo · T-9 a medias en `feat/t-9` (36050ec)*

```text
Hecho: T-8a (v0.53.0: imágenes, infra/produccion con Caddy, desplegar.sh con vuelta atrás, publicar.yml por etiqueta),
  v0.53.1 (la llave dice por qué falla) y B7-1 (v0.54.0): staging en https://217-216-48-54.sslip.io (VPS Ubuntu, usuario
  luami en el grupo docker, repo en ~/l2control; vuelta atrás ensayada allí). 54 de 64 pasos. El VPS corre la 0.53.1.
M-23/ADR-029: ni una laptop sin Windows Hello ni una tableta pudieron crear la llave al instalar → equipo de confianza
  (solo contraseña en el propio), app de autenticación (TOTP, sin repetir códigos) y la llave opcional. Paso T-9.
A medias, T-9 en feat/t-9: código y pruebas hechos, pnpm verify:db en verde. Falta verlo en el navegador desde una
  instalación limpia (imágenes locales en https://localhost como en T-8a; README de infra/produccion): instalar sin llave,
  confirmar con contraseña, configurar la app con el QR, confirmar desde otro equipo, confiar y retirar; en los dos temas.
  Después: v0.55.0 al fusionar, etiqueta, ./desplegar.sh 0.55.0 en el VPS y que administración instale (código de
  instalación: docker compose ... logs web | grep codigoDeInstalacion). El staging sigue SIN instalar.
Siguiente tras T-9: B7-2 a B7-5 y T-8b. Dominio propio (D-DOM) antes de B8-3.
Cuidado: cada despliegue reinicia la web y cambia el código de instalación; tras traer migraciones, prisma generate
  (pnpm install no lo hace); en el runner de Windows, pnpm bajo PowerShell no hace nada: los pasos van en bash.
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
