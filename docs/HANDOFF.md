# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-07 · v0.59.0 · `main` en 8e26960 más este relevo · nada a medias ni reclamado*

```text
Hecho, todo en main: T-9 (v0.55.0), v0.55.1, B7-2 y T-10 (v0.57.0), T-8b (v0.58.0) y B7-4 (v0.59.0). 59 de 66 pasos.
Staging (https://217-216-48-54.sslip.io) instalado por administración y en 0.59.0. Se pone al día SOLO: el cron del VPS
  corre infra/produccion/actualizador.sh cada minuto (ve los «release» con sus imágenes y llama a desplegar.sh); la 0.59.0
  entró así en 42 s. En producción la pide administración en Ajustes → Versión y actualizaciones (ahora o al cierre).
Respaldos (M-26): respaldar.sh a las 3:15 am, cifrado para la clave pública del local; la privada y su frase las guarda
  el usuario fuera del servidor. Una PC del local los baja (Ajustes → Respaldos la prepara). restaurar.sh ensaya en una
  base limpia: el primero del staging salió íntegro en 5 s. Todo en infra/produccion/README («Respaldos»).
Pendiente de administración en el staging: preparar la PC de los respaldos, cargar la semilla y los feriados (12 oct).
Siguiente: B7-5 · revisión de seguridad contra PLAN §7 y auditoría de dependencias. Criterio (F10-06): toda la matriz de
  §7.3 con prueba negativa, escaneo estático limpio, aislamiento de tenant verificado, sin secretos en el repo.
  B7-3 y T-8c van en el local, con los equipos reales. Dominio propio (D-DOM) antes de B8-3.
Cuidado: una versión cuyas tablas necesita el actualizador se pone la primera vez a mano; tras desplegar, las acciones
  de la versión vieja dan 404 (la pantalla se recarga sola al quedar libre); una migración sin publicar que cambias hay que
  deshacerla en tu base y en l2control_test; gh pr merge --delete-branch desde la rama te deja en main sin confirmar.
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
