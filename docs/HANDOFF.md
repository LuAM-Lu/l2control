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

*2026-10-06 (tarde) · v0.52.0 · `main` en af9dec9*

```text
Hecho hoy: T-2 (v0.51.0), una corrección de contraste (v0.51.1) y T-4 (v0.52.0, PR #13). 52 de 62 pasos; nada a medias.
T-4 (ADR-020): con la base vacía el acceso ofrece «Instalar L2 Control» (código del registro del servidor); confirmar
  identidad y aprobar un equipo piden contraseña + llave de acceso, o un código de recuperación; Ajustes → Usuarios da
  credenciales con un enlace de 24 h con QR (/alta); Inicio enseña la Puesta a punto. Ya no hay TOTP ni pnpm totp.
v0.51.1: los fondos de estado tienen más luz que la tarjeta (antes se leían hundidos), el rojo es #f87171 y el icono de un
  aviso rojo se anima en bucle (el amarillo, tres veces). Va por selector en tokens.css; `l2-quieto` lo apaga en un icono.
Siguiente: T-8 (actualizaciones, ADR-028), libre. Criterio en MAESTRO §3: una etiqueta vX.Y.Z publica las imágenes y el
  agente; Ajustes → Sistema decide cuándo; con la salud forzada a fallar vuelve sola a la versión anterior. No hay ningún
  Dockerfile en el repositorio (ADR-021 dice que sí): es lo primero. Después, la Etapa 7 (VPS).
Al actualizar tu copia: pnpm install, pnpm db:migrar (solo expande) y L2_URL_PUBLICA=http://localhost:3000 en tu .env.
  Entra siempre por localhost (la llave va atada a la dirección). Para confirmar identidad necesitas una llave de verdad:
  pnpm credenciales "Abigail Karam" da el enlace; en Chrome sirve el autenticador virtual de DevTools → WebAuthn.
Cuidado: un local recién instalado no tiene tarifario y la app ya abre sin él (no lo exijas en el layout). No hay suite de Playwright (§5).
Abierto con el usuario: color sólido en etiquetas pequeñas y en la opción seleccionada (propuesto, sin respuesta), y un
  tema claro azulado que gustó en vista previa pero no está en el plan (MAESTRO §7). «Abby Kingdom» sigue escrito a mano (§5).
```
