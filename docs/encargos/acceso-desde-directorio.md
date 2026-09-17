Haz que el acceso saque sus personas del directorio de «Usuarios y permisos» en vez de tener su propia lista. Hallazgos N-07 y N-08 de docs/AUDITORIA-NAVEGACION.md.

EL PROBLEMA: hoy son DOS listas con identificadores distintos. El acceso (apps/web/app/(estacion)/acceso/page.tsx) usa `u0…u5` escritos a mano; el directorio (apps/web/src/demo/usuarios.ts, validado con `UsersDirectorySchema`) usa `u-abigail`, `u-marisol`… Consecuencias:
- Dar de baja a alguien en Usuarios **no la quita del acceso**. Carla Benítez no aparece por casualidad, no por regla (N-08).
- La sesión guarda `u0`, y la pantalla de usuarios asume que quien la usa es `u-abigail`: el mismo acto quedaría firmado por dos identidades distintas cuando exista auditoría (N-07).

ARCHIVOS QUE PUEDES TOCAR:
- apps/web/app/(estacion)/acceso/page.tsx
- apps/web/app/(admin)/panel/[modulo]/[seccion]/page.tsx
- apps/web/src/features/identity/UsuariosPage.tsx
Nada más. NO toques `apps/web/src/demo/usuarios.ts`, ni los contratos, ni el dominio, ni AccesoScreen.

QUÉ HACER:

1. El acceso se alimenta del directorio (acceso/page.tsx)
   - Importa `DEMO_USUARIOS` de `../../../src/demo/usuarios` (es una ruta: puede importar la demo).
   - Construye la lista de operadores desde `DEMO_USUARIOS.users`, **filtrando `active`** (N-08), conservando el orden del directorio y mapeando cada persona a `Operador`: `id` = el del directorio (`u-abigail`…), `nombre` = `fullName`, `role` = `role`, y `rol` = el nombre legible del rol, que ya existe: `NOMBRE_ROL` en apps/web/src/features/identity/permisos.ts (no escribas los nombres a mano). Ojo: nombra la FUNCIÓN y no a la persona («Caja», no «Cajera»), a propósito; el género lo pone el nombre de quien la ocupa.
   - Borra la lista `OPERADORES` escrita a mano y el `TODO(F2-11/backend)` que hablaba de esto, y deja en su lugar un comentario corto: de dónde salen ahora las personas, y que el filtro de bajas es la regla (N-07, N-08).
   - No cambies nada del dispositivo (`DISPOSITIVOS`, `?device=`), ni la firma de `AccesoScreen`.

2. Quien usa el panel es quien entró (UsuariosPage.tsx)
   - Hoy el actor está escrito a mano: `{ id: "u-abigail", role: "ADMIN", branchIds: ["b1"] }` y el autor, «Abigail Karam».
   - Usa la sesión: `useActorEnSesion()` de apps/web/src/features/identity/sesion.ts y `useOperador()` de identity/operador.ts. Como son ganchos, `UsuariosPage` pasa a ser componente de cliente (`"use client"` arriba).
   - `puedeGestionar` se calcula con ese actor (`can(actor, "usuarios.gestionar", { branchId: "b1" }) === "PERMITIDO"`). **Sin sesión, `false`** y sin autor: fail-closed, se ve pero no se edita.
   - `autor` = `{ id: actor.id, nombre: operador.nombre }`.
   - Conserva el comentario de por qué el actor viaja entero, y deja un `TODO(F2-12/backend)` diciendo que la sesión vendrá del servidor.

3. Lo mismo para «Roles y accesos» (panel/[modulo]/[seccion]/page.tsx, línea ~26)
   - `<AccesosScreen autor={{ id: "u-abigail", nombre: "Abigail Karam" }} branchId="b1" />` tiene el autor escrito a mano. Saca el autor de la sesión igual que en el punto 2. Si eso obliga a convertir el mapa `PANTALLAS` en un componente de cliente, NO lo conviertas: crea un componente pequeño de cliente al lado (por ejemplo `AccesosPage`, junto a `UsuariosPage`, en apps/web/src/features/identity/) que lea la sesión y pinte `AccesosScreen`, y monta ese en el mapa. Explica en su cabecera por qué existe.

NO HAGAS:
- No cambies los PIN ni la lógica de bloqueo del acceso.
- No inventes nombres de rol ni de persona: salen del directorio y del catálogo de roles.
- No toques las pantallas `UsuariosScreen` ni `AccesosScreen` por dentro.

CRITERIO DE TERMINADO: "pnpm typecheck" pasa sin errores (ejecútalo tú desde la raíz de la copia y lee su salida). Resume qué hiciste en cada punto. La maestra comprobará en el navegador: que el acceso enseña a las seis personas activas del directorio y no a Carla; que entrar como Marisol y abrir Usuarios muestra a Marisol como autora y **sin** poder gestionar; y que como Abigail sí puede.
