# Relevo entre sesiones

Lo último que dejó cada persona al cerrar su sesión. **No se lee a mano:** al abrir un chat se escribe
«siguiente» y Claude lo lee; al cerrar se escribe «handoff» y Claude reescribe la sección de quien
trabajó. Cada persona toca solo la suya (por su `git config user.name`); el estado completo está en
[`MAESTRO.md`](MAESTRO.md), y quién lleva cada paso, en sus casillas de §3.

## LuAMi

*2026-10-05 · v0.50.1 · `main` en 83e245d*

```text
Proyecto L2 Control (github.com/LuAM-Lu/l2control). Lee CLAUDE.md y docs/MAESTRO.md (§1, §3, §4, §5). Español.
Rol: full-stack senior; programas tú. Estado: v0.50.1 · 50 de 62 pasos en main; las etapas de construcción están cerradas.
Somos dos personas + Claude (M-20): main está protegido, todo entra por PR con el check «pnpm verify:db» en verde y se
  fusiona por rebase o squash; la versión y su etiqueta se ponen al fusionar (en la rama, CHANGELOG «Sin publicar»).
Antes de empezar un paso, reclámalo en MAESTRO §3 ([~] a cargo: <persona>, rama) en un PR pequeño; si tiene dueño, habla antes.
Equipo nuevo: Node 24, pnpm 12 y Docker Desktop → pnpm install → cp .env.example .env → pnpm infra:up → pnpm db:migrar →
  pnpm db:semilla → pnpm dev → /acceso (pnpm equipos aprobar "<nombre>", PIN 1970) → pnpm verify:db antes de cada PR.
Siguiente: T-2 (cero simulación, §3 Transversal): regla `sin-simulacion` en pnpm lint (datos de negocio en el almacenamiento
  del navegador, PINs literales, listas de ejemplo en features/); criterio: el CI sale en rojo con una violación (cierra B0-4).
  Luego T-4 (instalación inicial y llaves de acceso, ADR-020) → T-8 (actualizaciones, ADR-028) → Etapa 7 (VPS).
Cuidado: las cinco reglas de CLAUDE.md; migraciones de expandir y contraer, nunca editar una aplicada; una pantalla no está
  hecha hasta abrirla en el navegador (Playwright a 1366×768, 1280×800 y 800×1280, sin errores de consola).
La base real del cliente vive solo en el equipo de LuAM-Lu: nadie más la tiene ni la toca. Push solo por PR.
Pendiente de LuAM-Lu en GitHub (§4): dar acceso a aemorandin-coder (Maintain) y decidir si el repositorio pasa a privado.
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
