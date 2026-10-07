# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-07 · v0.60.1 · `main` en c7325c2 más este relevo · nada a medias ni reclamado*

```text
Hecho, todo en main: T-9, B7-2 y T-10, T-8b (v0.58.0), B7-4 (v0.59.0), B7-5 (v0.60.0) y v0.60.1. 60 de 66 pasos.
Staging (https://217-216-48-54.sslip.io) en 0.60.1: se pone al día SOLO (cron con infra/produccion/actualizador.sh;
  cada versión entró en ~40 s) y hace un respaldo cifrado cada noche (respaldar.sh, 3:15 am). README de infra/produccion.
B7-5: matriz §7.3 comprobada celda por celda (matriz-del-plan.test.ts), Next 16.3.7 (ejecución remota en next/og), el
  descifrado GCM exige la etiqueta entera, pnpm audit en el CI con 7 días de edad mínima y trustPolicy, cabeceras en Caddy.
Para decidir (MAESTRO §4): D-REIMP (reimprimir un recibo sin 🔐) y el calendario de actualización de dependencias.
Pendiente de administración en el staging: preparar la PC de los respaldos, cargar la semilla y los feriados (12 oct).
Siguiente que se puede hacer a distancia: B8-2 · runbooks, contingencia en papel, manual y capacitación por rol.
  Criterio: cada runbook («se cayó la impresora», «se perdió internet», «revertir un despliegue», «no cuadra la caja»)
  lo sigue alguien externo; el manual se lee en 30 min por rol. B7-3, T-8c, B8-1 y B8-3 van en el local.
Cuidado: una versión nueva espera 7 días en npm antes de entrar (un parche urgente va en minimumReleaseAgeExclude); en
  el VPS, Caddy monta su Caddyfile y git pull lo cambia por otro archivo: desplegar.sh ya lo recrea si difiere.
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
