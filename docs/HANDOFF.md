# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-08 (cierre) · v0.84.0 · `main` en 1b2d47f más este relevo · nada a medias ni reclamado*

```text
Hecho, todo en main y etiquetado: M-28 y M-29 enteros, once pasos de v0.74.0 a v0.84.0 (84 de 90): B9-7, B7-7, B7-6,
  B11-1, T-18, B11-3, B11-2, T-17, B9-10, B9-9 y B9-8. Cada uno con su PR del paso y su PR de versión aparte.
  Reportes en PDF (app/informes/), Ajustes en 12 secciones con pestañas (MarcoDeSeccion), cuenta de soporte
  (Acceso de soporte; soporteOpera fuera de producción), conteo a ciegas, editar en lote y duplicar con sabores.
Siguiente: nada programable sin el local. B7-3 y T-8c esperan la visita (equipos reales, agente que se actualiza solo);
  después, la Etapa 8. Criterio de cada uno en MAESTRO §3.
Para decidir (usuario): D-REL (qué entra en la 1.0.0, §4). Para el usuario: L2_SMTP_URL y L2_CORREO_SOPORTE en el VPS;
  confirmar P-1, P-3, P-5, P-6 y P-14 de M-27. En el staging: PC de respaldos, semilla y feriados (MAESTRO §1).
Cuidado: tres pruebas fallaban por azar (un UUID con «1970», un PIN temporal igual al propio): corregidas, ver §5. Tras
  cambiar @l2/application, reiniciar pnpm dev (guarda aplicacion() al arrancar). Lo fijo en el teléfono va con portal.
  La rama feat/t-11 sigue en GitHub (la usó otra persona): no se borra sin preguntar.
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
