# Cambios de L2 Control

Qué cambia en cada versión, para quien usa el sistema. Formato de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer 2.0.0](https://semver.org/lang/es/)
según M-10 (docs/MAESTRO.md §2):

- **MINOR** +1 por cada paso de la ruta a producción entregado: el número del medio dice cuántos van
  (de 46). **PATCH** +1 por cada corrección entre pasos. **1.0.0** es la puesta en marcha (B8-4).
- La fuente es `version` del `package.json` raíz, con su etapa en `l2.etapa`. `pnpm verify` falla si
  este archivo no abre con esa versión. Cada versión lleva su etiqueta git `vX.Y.Z`.

Las versiones hasta 0.13.0 se reconstruyeron el 2026-09-26 desde el historial; sus etiquetas apuntan
al commit que entregó cada paso.

## [0.20.0] — 2026-09-27 · Etapa 3 · Caja

T-3 · Rediseño del acceso (pedido del cliente). La ruta pasa de 45 a 46 pasos.

### Cambiado
- Todo el acceso comparte una estructura: a la izquierda, «L2 Control» con el local, la hora grande,
  el estado del equipo y la versión; a la derecha, lo que hay que hacer. En vertical, la marca es una
  franja arriba.
- Un equipo sin registrar ofrece «Soy de administración» desde la primera pantalla: el nombre del
  equipo, la contraseña y el código del autenticador, y queda registrado y aprobado de una vez. Si la
  contraseña o el código fallan, el equipo queda pendiente con su código y el error a la vista, y el
  siguiente intento solo lo aprueba.

## [0.19.0] — 2026-09-27 · Etapa 2 · Dinero

B2-4 · Día de negocio y feriados bancarios. Se cierra la Etapa 2.

### Añadido
- Panel → Configuración → Feriados bancarios: se registran por año, copiados del calendario de
  SUDEBAN, y se retiran si hubo un error (no se borran; quedan en la auditoría). Pide confirmar
  identidad.
- Un feriado entre semana cobra con la tasa del día hábil anterior, como un fin de semana, sin
  cargarla a mano. Tasas dice «feriado bancario» cuando lo es, y el aviso de la tasa que falta se
  salta los feriados.
- Cada asiento del libro de pagos lleva el día de negocio de su turno: lo cobrado a la 1:30 am
  cuenta en el día del turno que lo cobró.

## [0.18.0] — 2026-09-27 · Etapa 3 · Caja

B3-1 · Turno real. Se adelanta a B2-4 porque el turno es quien fija el día de negocio (ADR-009).

### Añadido
- «Turno» abre el turno del equipo con el fondo de la gaveta en dólares y en bolívares (cero vale).
  El turno queda a nombre de quien lo abre, en ese equipo y con el día de hoy como día de negocio:
  lo que se cobre a la 1:30 am sigue contando en ese día.
- Un equipo no puede tener dos turnos abiertos, ni aunque se pulse dos veces.
- La barra de las estaciones dice «Turno desde …» con la hora real, e Inicio enseña el turno abierto,
  quién lo abrió y el fondo en la gaveta.

### Cambiado
- Sin turno abierto, la caja no cobra: lo dice en la columna de cobro y lleva a abrirlo. El servidor
  tampoco asienta un cobro sin turno, y cada asiento del libro dice en qué turno entró.
- El punto de cobro es el equipo (su nombre), no el «mostrador» fijo.
- La pantalla de turno ya no simula el corte Z: el conteo de la gaveta se hace, pero los cortes X y Z
  se guardan en el servidor con B3-5.

## [0.17.0] — 2026-09-27 · Etapa 2 · Dinero

B2-3 · Libro de pagos de solo-agregar con idempotencia. Es la base del cobro en el servidor: la caja
lo usará en B3-3, así que en pantalla todavía no cambia nada.

### Añadido
- Cada pago, vuelto, propina o residuo es un asiento del libro que no se edita ni se borra, con su
  medio, su moneda, la tasa con la que se cobró (copiada de la base) y su IGTF, que calcula el
  servidor con la alícuota del instante.
- Un doble clic o un reintento tras un corte de red devuelven el mismo cobro: nunca se cobra dos
  veces. Los asientos de un cobro entran todos o ninguno.
- Anular un pago es un asiento con el signo contrario que apunta al original, una sola vez, con
  motivo de la lista; la caja lo hace con la autorización de supervisión (DEC-24). El original queda
  intacto y el saldo se recalcula solo.

## [0.16.0] — 2026-09-27 · Etapa 2 · Dinero

B2-2 · Impuestos con vigencia.

### Añadido
- Panel → Configuración → Impuestos: lo que rige ahora (IVA general, reducido, exento e IGTF), el
  calendario de cada impuesto y «Programar un cambio». Un cambio para hoy rige desde que se guarda;
  para otro día, desde su medianoche. Nunca hacia atrás: lo ya vendido se queda como se vendió.
- Corregir un cambio programado es programar otro para el mismo día; programar la alícuota que rige
  lo cancela. Programar lo que ya rige se rechaza en el campo.
- Programar pide confirmar identidad y queda en la auditoría con lo que regía y lo que regirá.

### Cambiado
- La caja calcula el ticket con las alícuotas de la base, las del instante: un cambio programado para
  mañana entra a la medianoche sin recargar. Sin alguna alícuota vigente, la caja no cobra y dice
  dónde se configura (antes, 16 %, 8 % y 3 % fijos en el código).

## [0.15.0] — 2026-09-27 · Etapa 2 · Dinero

B2-1c · Tasa automática y en vivo.

### Añadido
- La tasa de la web del BCV se aplica sola si no salta más del 10 % de la vigente. Si es la primera
  del local, salta más o solo la dio DolarApi, queda pendiente y sale una alerta crítica en Inicio y
  en Tasas con «Revisar y confirmar».
- Todas las pantallas ven la tasa nueva en menos de un minuto, sin navegar.
- Un cobro en curso conserva su tasa. Si cambia, la caja lo dice en la franja de encima del teclado
  («Tasa nueva») y la cajera elige «Mantener» o «Usar la nueva»; el teclado y «Cerrar cobro» no se
  mueven de sitio. Una tasa escrita con más decimales, pero con el mismo valor, no cuenta como cambio.
- Aviso si a las 6:00 pm de un día hábil el BCV no ha publicado la del día hábil siguiente.

### Cambiado
- Lo que teclea administración se aplica al guardarlo (dos veces si salta o es la primera).
- El servidor consulta el BCV al arrancar y cada 15 minutos (antes, cada hora).
- La alerta de Inicio dice «Sin tasa vigente» y lleva a Tasas, no a la caja.

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
