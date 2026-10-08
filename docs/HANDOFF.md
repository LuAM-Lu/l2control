# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-08 (cierre, 3) · v0.86.1 · `main` en dac7d93 más este relevo · B8-2 a medias: lo escrito, hecho; la capacitación, en B8-3*

```text
Hecho hoy, todo en main y etiquetado (86 de 91): B3-9 (v0.85.0: el punto de cobro, con PIN de administración y motivo
  fuera de él; y la entrada desde la caja, con la lógica de Entrada en useEntradaDeNinos y EntradaPiezas), T-8c (v0.86.0:
  el agente se actualiza solo y Windows vuelve a la anterior si la nueva no arranca; ensayado en una PC con Windows) y
  lo escrito de B8-2 (v0.86.1: /procedimiento-papel y infra/produccion/RUNBOOKS.md). Staging al día solo.
Ya NO queda nada que programar para la 1.0.0. Todo lo que sigue es en el local, con los equipos reales:
  B7-3 (medir con la red real; instalar el agente 0.86.x en la laptop de caja y ver que se actualiza y vuelve atrás),
  B8-1 (red con 4G y UPS), B8-3 (operación en paralelo + capacitación por rol: ahí se cierra B8-2) y B8-4 = 1.0.0.
  La 1.0.0 NO se etiqueta desde aquí.
Para decidir (usuario): D-REL antes de B8-4. Para el usuario: L2_SMTP_URL y L2_CORREO_SOPORTE en el VPS; P-1, P-3,
  P-5, P-6 y P-14; dominio propio y firma del alcance (F0-09) antes de B8-3. En el staging: PC de respaldos, semilla y
  feriados; el punto de cobro lo marcó la migración en los equipos que ya cobraban (revisarlo en Dispositivos).
Cuidado: un agente instalado antes de la 0.86.0 no sabe actualizarse (se reinstala una vez); la tarea «(cambio)» del
  agente no se borra. turnos.abrir es ahora (ctx, entrada, autorizacion?, ahora?). feat/t-11: no se borra.
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
