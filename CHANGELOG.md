# Cambios de L2 Control

Qué cambia en cada versión, para quien usa el sistema. Formato de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer 2.0.0](https://semver.org/lang/es/)
según M-10 (docs/MAESTRO.md §2):

- **MINOR** +1 por cada paso de la ruta a producción entregado: el número del medio dice cuántos van
  (de 45). **PATCH** +1 por cada corrección entre pasos. **1.0.0** es la puesta en marcha (B8-4).
- La fuente es `version` del `package.json` raíz, con su etapa en `l2.etapa`. `pnpm verify` falla si
  este archivo no abre con esa versión. Cada versión lleva su etiqueta git `vX.Y.Z`.

Las versiones hasta 0.13.0 se reconstruyeron el 2026-09-26 desde el historial; sus etiquetas apuntan
al commit que entregó cada paso.

## [Sin publicar]

## [0.14.0] — 2026-09-26 · Etapa 2 · Dinero

T-1 · Versión visible.

### Añadido
- La versión y la etapa se ven en el acceso de cada equipo y en Panel → Configuración, junto con
  cuántos pasos de la ruta van entregados.
- El servidor dice su versión al arrancar, en la misma línea del log que confirma la conexión a la base.
- Este archivo, con toda la historia desde 0.1.0, y las etiquetas `v0.1.0` … `v0.14.0`.
- `pnpm verify` comprueba que la versión del `package.json` y este archivo coinciden.

### Cambiado
- La base local de desarrollo se vació y se sembró de cero: las tasas de prueba (Bs. 228,41 y
  229,05) ya no tapan la del BCV. Los equipos se vuelven a aprobar.

## [0.13.0] — 2026-09-26 · Etapa 2 · Dinero

B2-1b · Tasa traída del BCV.

### Añadido
- «Traer del BCV» en Tasas de cambio y consulta automática cada hora: la web del BCV y DolarApi
  como respaldo. Lo traído entra pendiente y no cobra hasta confirmarlo; si dos fuentes no
  coinciden para el mismo día, ese día no se captura.

### Corregido
- La tasa rige desde su fecha valor hasta el siguiente día hábil: la del viernes cubre el fin de
  semana y el parque cobra en bolívares el sábado y el domingo.
- La caja escribía «45,81 Bs/$» con una tasa de 229,05.

## [0.12.4] — 2026-09-26

### Cambiado
- Sala, familias, turno e Inicio ya no enseñan datos inventados: dicen «Sin datos» o «Sin turno
  abierto» hasta tener su servidor.

## [0.12.3] — 2026-09-26

### Corregido
- La caja y el recibo escriben la tasa tal como se capturó.

## [0.12.2] — 2026-09-26

### Corregido
- Una sola barra de desplazamiento: el menú del panel y la barra de estación no se van nunca.

## [0.12.1] — 2026-09-26

### Corregido
- Un intento fallido de aprobar un equipo vacía también la contraseña.

## [0.12.0] — 2026-09-26 · Etapa 1 · Identidad

B1-6 · Alta de equipos con buenas prácticas (M-7).

### Añadido
- Un equipo nuevo se aprueba desde él mismo con la contraseña y el código TOTP de administración,
  sin consola.
- Cada equipo enseña un código de emparejamiento, que se compara al aprobar. Una solicitud caduca
  a las 24 h y se renueva desde el equipo; hay topes por dirección y por sucursal.

### Corregido
- La dirección IP de la auditoría ya no se puede falsear desde el navegador.

## [0.11.0] — 2026-09-26 · Etapa 2 · Dinero

B2-1 · Tasas de cambio en la base.

### Añadido
- Tasas con fecha valor, historial que no se borra, confirmación y doble tecleo si el salto pasa
  del 10 %. La caja solo cobra en bolívares con la tasa vigente confirmada.

## [0.10.0] — 2026-09-26 · Etapa 1 · Identidad

B1-5 · Permisos en el servidor.

### Añadido
- Personas, roles, excepciones por persona y ajustes de acceso guardados en la base. Dar de baja a
  alguien cierra sus sesiones en el acto.
- PIN temporal que se enseña una vez y obliga a elegir uno propio al entrar.
- Las autorizaciones de supervisión se registran antes de ejecutar la acción.

## [0.9.0] — 2026-09-26 · Etapa 1 · Identidad

B1-2 · Confirmar identidad para lo delicado.

### Añadido
- Configuración, precios y personas piden contraseña y código TOTP, válidos 15 minutos.

## [0.8.0] — 2026-09-26 · Etapa 1 · Identidad

B1-3 y B1-4 · Equipos y sesiones en el servidor. Dos pasos en una entrega: no hay 0.7.0.

### Añadido
- Un equipo desconocido pide su registro y no entra hasta que lo aprueban; revocarlo cierra sus
  sesiones.
- El PIN se comprueba en el servidor con Argon2id, con bloqueo creciente, y cada intento queda
  en la auditoría. La sesión caduca a los 30 minutos sin actividad.

## [0.6.0] — 2026-09-26 · Etapa 1 · Identidad

B1-1 · Auditoría de solo-agregar.

### Añadido
- Cada operación deja su asiento en la auditoría, en la misma transacción, y nadie lo puede
  cambiar ni borrar.

## [0.5.1] — 2026-09-26

### Retirado
- El modo demo y el simulador (M-6): la app corre siempre contra su servidor.

## [0.5.0] — 2026-09-26 · Etapa 0 · Cimientos

B0-5 · Primera pantalla con servidor.

### Añadido
- El tarifario se publica en la base: se ve desde cualquier equipo y sobrevive a reiniciar el servidor.

## [0.4.0] — 2026-09-26 · Etapa 0 · Cimientos

B0-4 · CI y reglas de la casa.

### Añadido
- CI en GitHub Actions y `pnpm lint` con las reglas de dinero, colores, reloj y emojis.

## [0.3.0] — 2026-09-26 · Etapa 0 · Cimientos

B0-3 · Logs y entorno.

### Añadido
- Logs que no filtran PIN, referencias de pago ni contraseñas, y el servidor no arranca si le
  falta una variable.

## [0.2.0] — 2026-09-26 · Etapa 0 · Cimientos

B0-2 · Base de datos con aislamiento.

### Añadido
- PostgreSQL con Prisma y aislamiento por cliente impuesto por la propia base (RLS forzada).

## [0.1.0] — 2026-09-26 · Etapa 0 · Cimientos

B0-1 · Entorno local.

### Añadido
- PostgreSQL 17 y Valkey 8 con un comando (`pnpm infra:up`).

## Antes de 0.1.0

La interfaz completa de parque, caja, restaurante y panel, construida sobre datos de ejemplo hasta
el 2026-09-18. No lleva versión: la ruta a producción empieza en B0-1.
