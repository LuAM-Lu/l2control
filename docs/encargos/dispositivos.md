Construye «Personas → Dispositivos»: los equipos autorizados del local, con su estado y quién tiene sesión en cada uno. Es la tarea 4.6 del plan final (docs/PLAN-FRONTEND.md) y cubre F2-02 (ADR-013).

POR QUÉ IMPORTA: el dispositivo es el **primer factor** del acceso. El PIN solo abre sesión en un equipo aprobado, así que un PIN visto por encima del hombro no sirve desde otro aparato. Hoy esa lista está escrita a mano en la página del acceso y no se puede ver ni cambiar desde el panel: la sección enseña «por construir».

LO QUE YA HIZO LA MAESTRA (no lo cambies):
- Contratos en `@l2/contracts` (packages/contracts/src/identity.ts), con pruebas: `DeviceSchema` (id, label, branchId, status `APROBADO|PENDIENTE|REVOCADO`, `registeredAt`, `session` opcional con quién y desde cuándo, y `changes` con su historia), `DevicesDirectorySchema` (dos equipos no pueden llamarse igual) y `DeviceCommandSchema` (`APROBAR`, `REVOCAR`, `RENOMBRAR`, todos con motivo obligatorio de al menos 10 caracteres y **sin** autor ni hora: los pone el servidor). Léelos enteros.
- El dominio ya distingue los estados y decide si un equipo puede autenticar: `@l2/domain-identity` (`Device`, `checkDevice`). Úsalo para explicar, no reimplementes la regla.

EL PATRÓN A COPIAR: `apps/web/src/features/identity/UsuariosScreen.tsx` (lista densa, detalle al lado, cambios con motivo obligatorio y su asiento en la historia) y, para el proveedor, `apps/web/src/features/park/TarifarioProvider.tsx`. Léelos antes de empezar.

QUÉ HACER, ARCHIVO POR ARCHIVO:

1. NUEVO `apps/web/src/demo/dispositivos.ts`
   - `DEMO_DISPOSITIVOS: DevicesDirectoryDto = DevicesDirectorySchema.parse({ devices: [...] })` con cuatro equipos que cuenten una historia: «Tablet taquilla» y «Tablet caja» aprobadas (una con sesión abierta de alguien del directorio de `demo/usuarios.ts`), «Tablet mesero 3» pendiente de aprobación, y «Tablet extraviada» revocada con su motivo en `changes`. Fechas de 2026-09; nada de datos personales reales.
   - Cabecera explicando que son inventados hasta que exista el registro real (F2-02).

2. NUEVO `apps/web/src/features/identity/DispositivosProvider.tsx`
   - Patrón de `TarifarioProvider`: contexto `{ dispositivos: DevicesDirectoryDto; aplicar(cmd: DeviceCommand, autor: { id: string; nombre: string }): void }`, clave `"l2:dispositivos:v1"`, `safeParse` al cargar y validación con `DeviceCommandSchema` antes de aplicar.
   - `aplicar` construye el asiento: `APROBAR` → estado `APROBADO` + asiento `APROBADO`; `REVOCAR` → estado `REVOCADO` + asiento `REVOCADO`; `RENOMBRAR` → nuevo `label` + asiento `RENOMBRADO`. **Nada se borra** (regla 5): el equipo revocado se queda en la lista. Cada asiento lleva `by`, `byName`, `reason` y `at` (`new Date().toISOString()`), y el resultado se valida con `DevicesDirectorySchema` antes de guardarlo: si no cumple —dos con el mismo nombre, por ejemplo—, no se aplica y se devuelve el error.
   - `TODO(F2-02/backend)` diciendo que el registro y la revocación serán del servidor, y que revocar cerrará las sesiones de ese equipo.

4. NUEVO `apps/web/src/features/identity/DispositivosScreen.tsx` («use client»)
   - `<Container ancho="panel">` y `<PageHeader>` con migas Abby Kingdom / Personas / Dispositivos.
   - **Lista** de equipos con: nombre, estado con **color + icono + texto** (aprobado `state-ok`, pendiente `state-warn`, revocado `state-crit`), la sucursal, desde cuándo está registrado y, si hay sesión abierta, quién y desde qué hora (formato de 12 h del proyecto). Los revocados van al final y en tono apagado, nunca ocultos.
   - **Acciones por equipo**, según su estado: pendiente → «Aprobar»; aprobado → «Revocar»; revocado → nada (un equipo revocado no se reaprueba desde aquí: se registra otra vez desde el equipo, y eso es del servidor; dilo en la pantalla con una línea). Todos pueden «Renombrar».
   - Cada acción abre un `<Dialog>` (o `<Sheet>`) con el **motivo obligatorio** (mínimo 10 caracteres, el mensaje del contrato junto al campo) y, en «Revocar», una advertencia de que el equipo dejará de poder abrir sesión. Al confirmar, llama a `aplicar` y avisa con `avisar.ok`; si el proveedor devuelve error, se enseña sin cerrar el diálogo.
   - **La historia** de cada equipo, plegada: qué le pasó, quién y por qué, de lo más reciente a lo más antiguo.
   - Quién puede actuar: `usuarios.gestionar`, igual que la sección declara en el mapa. Usa `useActorEnSesion()` y `can(...)`; sin permiso se ve pero no se edita (fail-closed), como en `UsuariosScreen`.
   - Superficie de administración (32 px), tokens de color, `tnum` en fechas y cifras, sin emoji, estados vacíos con texto.

5. NUEVO `apps/web/src/features/identity/DispositivosPage.tsx` («use client»)
   - Pequeña envoltura que lee la sesión (`useActorEnSesion`, `useOperador`) y pinta `DispositivosScreen` con el autor, igual que `AccesosPage.tsx`, que ya existe: cópiala. Sin sesión, no pinta nada.

LO QUE **NO** TOCAS (lo hace la maestra al integrar, porque otra obrera trabaja a la vez en esos mismos archivos):
- `apps/web/app/layout.tsx` (montar el proveedor),
- `apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx` (la ruta de la sección),
- `apps/web/src/features/shell/navigation.ts` (el enlace del menú).
Deja `DispositivosPage` exportada y lista para montarse, y dilo en el resumen.

NO HAGAS:
- No toques `packages/`, ni la pantalla de acceso, ni el PIN, ni las guardias.
- No inventes campos fuera del contrato.
- No borres equipos: revocar es un estado, no una baja.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra probará: aprobar el equipo pendiente con motivo, revocar uno aprobado, intentar renombrar con el nombre de otro (que debe negarse), y comprobar con la supervisión que la sección no aparece en su menú (la abre `usuarios.gestionar`, que es de administración).
