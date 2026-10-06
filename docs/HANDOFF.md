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

*2026-10-06 · v0.51.0 · `main` en 681ac23 más el reclamo de T-4 y este relevo*

```text
Hecho hoy: T-2 (cero simulación) en main como v0.51.0; cierra también B0-4 (CI visto en rojo, PR #6). 51 de 62 pasos.
A medias: T-4 (instalación inicial y llaves de acceso, ADR-020), reclamado por aemorandin-coder, en la rama
  feat/instalacion-y-llaves (subida, sin PR, dos commits «wip» que se funden en uno al cerrar). Detalle en MAESTRO §3.
  Hecho y probado en el servidor (test:db de @l2/application, 534 en verde): migración 20261030000000 (solo expande),
  llaves WebAuthn, códigos de recuperación, elevación y aprobar equipo con contraseña + llave o código, enlaces de alta,
  instalación con código y puesta a punto. En la web: entorno (L2_URL_PUBLICA), código al arrancar y acciones.
  Falta: las pantallas (elevación, alta de equipo, «Instalar L2 Control», /alta, enlace con QR en Personas, Puesta a
  punto en Inicio), pnpm credenciales y la semilla (hoy rotos en esa rama: llaman a elevacion.credenciales), retirar
  pnpm totp, la prueba en navegador con el autenticador virtual de Chromium (también con la base vacía) y los documentos.
Criterio de T-4: una base vacía queda operativa sin tocar la consola; elevar y aprobar equipos piden contraseña + llave.
Cuidado: en esa rama NO se puede confirmar identidad desde el navegador hasta tener las pantallas; no la fusiones a medias.
  Añade L2_URL_PUBLICA=http://localhost:3000 a tu .env y entra siempre por localhost (la llave va atada al dominio).
  SUPERVISOR no tiene acciones elevadas: desde el panel solo ADMIN recibe enlace; la consola se lo da a cualquiera.
  Para ver la base vacía sin borrar nada: cambia L2_TENANT_ID y L2_BRANCH_ID del .env por dos UUID nuevos.
Después de T-4: T-8 (actualizaciones, ADR-028) y la Etapa 7 (VPS).
Para LuAMi: taché la última fila del inventario de lo provisional (PUESTO_DE_ROL, MAESTRO §5) porque D7 lo decidió así;
  si no era la intención, se revierte esa línea. Sigo con permiso WRITE (fusiono por PR); el maestro pedía Maintain.
```
