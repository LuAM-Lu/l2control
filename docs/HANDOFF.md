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

*Aún sin relevo.* Para empezar: el arranque de un equipo nuevo está en la sección de LuAMi y en el
README («Trabajar en el proyecto»); antes de nada, reclamar el paso en MAESTRO §3.
