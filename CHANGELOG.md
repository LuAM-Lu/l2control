# Cambios de L2 Control

Qué cambia en cada versión, para quien usa el sistema. Formato de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer 2.0.0](https://semver.org/lang/es/)
según M-10 (docs/MAESTRO.md §2):

- **MINOR** +1 por cada paso de la ruta a producción entregado: el número del medio dice cuántos van
  (de 48). **PATCH** +1 por cada corrección entre pasos. **1.0.0** es la puesta en marcha (B8-4).
- La fuente es `version` del `package.json` raíz, con su etapa en `l2.etapa`. `pnpm verify` falla si
  este archivo no abre con esa versión. Cada versión lleva su etiqueta git `vX.Y.Z`.

Las versiones hasta 0.13.0 se reconstruyeron el 2026-09-26 desde el historial; sus etiquetas apuntan
al commit que entregó cada paso.

## [0.29.0] — 2026-09-28 · Etapa 4 · Parque

B3-5 · Cortes X y Z, arqueo a ciegas, relevo y cierre de la jornada. Se cierra la Etapa 3 (Caja).

### Añadido
- **Turno** sale del libro de pagos del servidor: lo cobrado por medio (lo que quedó, sin el vuelto),
  el IGTF y las excepciones del turno (anulaciones, cortesías, reimpresiones, redondeos, incobrables y
  diferencias de arqueo), con quién, por qué y quién autorizó.
- **Cambiar de cajera** y **Cerrar la jornada**: se cuenta la gaveta **a ciegas** por billetes, el
  servidor dice después lo que esperaba y la diferencia en dólares con la tasa del turno. Hasta
  $ 1,00, la cajera firma el **corte Z** con su PIN; por encima, supervisión revisa, justifica y firma.
  Se dice qué se deja en la gaveta (el fondo, en un relevo) y lo demás se retira. Después del Z, ese
  turno no se toca: ni cobros, ni anulaciones, ni otro conteo.
- **La jornada no se cierra con pendientes**: cuentas por cobrar, niños en sala, estancias huérfanas y
  turnos abiertos en otros equipos, cada uno con su enlace para resolverlo. Una cuenta que no se va a
  cobrar se marca **incobrable** con motivo y la autorización de supervisión (nada se borra).
- **Corte X** desde el resumen del turno; lo que debería haber en la gaveta solo lo ve supervisión.
- **Supervisión cierra el turno de otro equipo** desde Inicio (la cajera se fue o el equipo falló), con
  el mismo arqueo.
- **Abrir el turno comprueba** tasa, impuestos, medios y tarifario y lista lo que falta; enseña antes
  que nada los turnos que quedaron abiertos de días anteriores y propone el fondo que dejó el último Z.
- **Inicio** enseña el día desde el libro: lo vendido, lo cobrado por medio, los turnos del día con su
  diferencia y quién firmó, y las excepciones del día.

### Corregido
- Al anular, no se devuelve en efectivo lo que la gaveta del turno no tiene.
- Una cuenta de mesa incobrable ya no se toma por la cuenta abierta de la mesa.

## [0.28.1] — 2026-09-28 · Etapa 4 · Parque

### Corregido
- En el menú del panel, **Ajustes** (o cualquier módulo) se puede plegar aunque estés en una de sus
  pantallas: antes se volvía a abrir solo. Al navegar, se despliega el módulo donde estás.

## [0.28.0] — 2026-09-28 · Etapa 4 · Parque

B4-3 · Salida y liquidación: recarga de tiempo, a quién se entrega el niño y estancias huérfanas.

### Añadido
- **Recargar tiempo** desde la ficha del niño en la sala: se elige un paquete de tiempo fijo, la
  tarjeta vuelve a estar en tiempo y la recarga entra en la cuenta de la familia (en prepago, a la caja).
  La ficha enseña sus recargas.
- La salida pregunta **quién recoge** a cada familia: su representante u otra persona, con su nombre.
  Sin marcarlo, la salida no se registra; queda constancia en la estancia.
- **Estancias a revisar**: las que siguen abiertas desde un día anterior o llevan más de 8 horas salen
  aparte en la sala y en Inicio, no cuentan en el aforo y la dirección (supervisión o administración)
  las cierra con un motivo, **sin cobrar tiempo de más**.
- En la entrada se puede poner **el nombre de cada niño** (opcional). Si la familia ya vino, se
  proponen sus niños conocidos.

## [0.27.1] — 2026-09-28 · Etapa 4 · Parque

### Cambiado
- La tasa de cambio se enseña con **dos decimales** en todas las pantallas y en el recibo
  («Bs. 857,01» en lugar de «Bs. 857,00580000»), redondeada hacia arriba desde la mitad. El cobro
  sigue convirtiendo con la tasa completa que publicó el BCV.

## [0.27.0] — 2026-09-28 · Etapa 4 · Parque

B4-1 y B4-2 · Familias, niños y estancias en el servidor, con su cronómetro. Salen juntos: no hay 0.26.0.

### Añadido
- **El parque funciona entre equipos.** Lo que registra la entrada lo ve la sala de cualquier otra
  tablet, la salida y la caja, con el reloj del servidor: cambiar la hora de una tablet no cambia el
  tiempo que se cobra.
- La entrada **reconoce a la familia que vuelve** por su teléfono, lo escriba como lo escriba
  (0412-1234567, +58 412 1234567…), y no la duplica.
- La salida **liquida en el servidor** el tiempo de más, con las condiciones que regían cuando el niño
  entró: publicar otro tarifario no cambia lo que se le cobra a quien ya está dentro. Si se van varias
  familias juntas, cada una sale con su propia cuenta.
- La caja abre la cuenta de una familia **pasando la pulsera** de cualquiera de sus niños.
- Inicio cuenta los **niños atendidos** hoy contra el mismo día de la semana pasada.
- El directorio de familias (Parque → Representantes y niños) es de la base: se corrige con registro
  de quién lo hizo, y un niño nombrado en la sala aparece en su familia.

### Cambiado
- El precio del paquete lo pone el servidor con el tarifario vigente, y el aforo y las pulseras en uso
  los comprueba él: dos entradas a la vez no cuelan un niño de más.
- Una pantalla ya no puede abrir la cuenta de una familia, sacar niños de ella ni ponerle paquete o
  tiempo de más: eso lo hacen la entrada y la salida del parque.
- Un niño sin nombre se ve por su pulsera también en la salida.

### Quitado
- «Cargar a una mesa» en la salida: anunciaba una carga que no hacía. Vuelve con el restaurante.
- El directorio y la sala guardados en el navegador.

## [0.25.0] — 2026-09-28 · Etapa 3 · Caja

B3-4 · Ventas del turno, reimpresión, anulación y cortesía en el servidor.

### Añadido
- Cada cobro deja su **venta** en el servidor: lo cobrado y lo regalado, el IVA, el IGTF, la tasa,
  cada pago con lo que se devolvería y el vuelto. El recibo sale de ella: la caja ya no lo compone.
- Turno → ventas: se ven desde cualquier pestaña de la caja y sobreviven a cerrarla. Imprimir queda
  anotado con quién y cuándo; desde la segunda, el recibo sale como **COPIA**.
- La anulación queda en la venta: quién la pidió, quién la autorizó y cómo volvió el dinero de cada
  pago, con la referencia de la devolución guardada cifrada.

### Cambiado
- La **cortesía** la autoriza el servidor: supervisión o administración con su PIN, y queda a su
  nombre con la hora. Una pantalla ya no puede regalar por su cuenta.
- La administración confirma con su **PIN** al anular un cobro o regalar algo.
- Supervisión puede autorizarse a sí misma en la caja, pero no una tasa ni un ajuste de inventario:
  eso lo autoriza otra persona.
- El diálogo de anular cabe entero a 1366×768: ya no hay que desplazarse para llegar al PIN.

### Quitado
- El PIN de prueba «1970» y el directorio de ejemplo con que la caja decidía quién autorizaba.

## [0.24.0] — 2026-09-28 · Etapa 3 · Caja

B3-3 · Cobro mixto y vuelto en el servidor, y todas las cuentas en la base (F4-03, F4-04b, F4-04c).

### Añadido
- Las cuentas de las familias, de las mesas y del mostrador se guardan en el servidor: la entrada, el
  salón y la caja ven la misma cuenta desde cualquier equipo, y una cuenta nueva llega a la cola de
  la caja de otro equipo en unos segundos. El número de orden lo da el servidor.
- Cerrar un cobro lo decide el servidor: recalcula el total con el IVA y el IGTF de ese instante, exige
  la tasa vigente (o la que regía hace menos de 10 minutos) y rechaza un cobro que no cuadra al
  céntimo o cuyo total no es el que vio el cliente. Los pagos, el vuelto, la propina o el residuo
  quedan en el libro en la misma operación que marca la cuenta pagada.
- Anular un cobro lo hace el servidor: la lista de quién puede autorizar y el PIN de supervisión se
  comprueban allí, con su bloqueo, y cada pago se revierte en el libro con su motivo y quién lo
  autorizó. Anular una parte de una cuenta dividida resta solo esa parte.

### Cambiado
- Una venta de mostrador es una cuenta de mostrador (ya no una familia inventada), y vende solo del
  catálogo con el precio del momento.
- Si otro equipo cambió la cuenta mientras se tenía abierta, se avisa y se vuelve a lo que tiene el
  servidor en vez de pisar su cambio.

### Seguridad
- El registro del servidor ya no escribe los datos que recibe cada acción: el PIN de quien entra o
  autoriza y las referencias de un pago salían en claro.

## [0.23.0] — 2026-09-27 · Etapa 3 · Caja

B9-1 · Catálogo de productos en el servidor (F8-02).

### Añadido
- Panel → Inventario → **Productos**: lo que la caja vende en el mostrador o añade a una cuenta, con
  su categoría, su trato del IVA (general, reducido o exento), si lleva existencia y su precio en
  dólares. «Nuevo producto» lo pone a la venta al guardarlo; cada cambio pide confirmar identidad.
- El precio se **programa con su día**: hoy rige desde que se guarda; otro día, desde su medianoche.
  La ficha del producto enseña su calendario (rige ahora, programado, terminó) y quién puso cada
  precio. Para cancelar un cambio se programa ese día el precio que rige.
- Un producto que ya no se vende se **aparta** (no se borra) y vuelve a la venta cuando haga falta.
  Dos productos no pueden llamarse igual, aunque cambien mayúsculas, acentos o espacios.

### Cambiado
- La caja vende del catálogo de la base: sus pestañas salen de las categorías que hay a la venta, y
  un precio programado para mañana entra a la medianoche sin recargar. Sin productos lo dice y dice
  dónde se cargan.
- **Cambiar un precio no altera lo ya vendido**: cada línea copia el precio, el nombre y el IVA del
  producto al venderse. Una cuenta a medias conserva el precio con que se añadió; sumar unidades a
  esa fila a un precio que ya no rige se niega con un aviso.
- El IVA de cada producto llega al ticket: un producto exento se cobra sin IVA (antes todo lo del
  mostrador pagaba el general).

### Retirado
- La lista de productos escrita en el código (`catalogo-mostrador.ts`).

## [0.22.0] — 2026-09-27 · Etapa 3 · Caja

T-6 · Menú por operación (M-13). La ruta pasa a 48 pasos.

### Cambiado
- El menú del panel pone arriba lo que se opera: Inicio, Parque, Restaurante, Caja e Inventario. Todo
  lo que se configura de vez en cuando está abajo, en **Ajustes**, agrupado: Parque y restaurante
  (tarifas, carta, plano), Dinero (medios de pago, tasas, impuestos, feriados), Equipo (usuarios,
  dispositivos, roles y accesos) y El local (sucursal, impresoras). Representantes y niños pasa a
  Parque.
- La caja tiene dos pestañas: **Cobrar | Turno**. Turno reúne lo que antes eran «Ventas del turno» y
  «Turnos y cortes»: el resumen del turno (fondo, lo cobrado por medio, excepciones), las ventas con
  su recibo y, al pie, «Cerrar turno», que lleva al arqueo.
- Las direcciones viejas (Configuración, Personas, las secciones que se movieron y `/ventas`) llevan
  solas a su sitio nuevo.

## [0.21.0] — 2026-09-27 · Etapa 3 · Caja

B3-2 · Medios de pago, terminales y datos de cobro en el servidor.

### Añadido
- Caja → Medios de pago, en tres pestañas: los medios (encender y apagar), los datos que ve el
  cliente (Pago Móvil y Zelle del local) y los terminales de punto de venta. Todo se guarda en el
  servidor y cada cambio pide confirmar identidad.
- «Añadir medio»: un medio nuevo (Biopago, por ejemplo) se crea desde el panel, sin actualizar el
  sistema. Nace apagado; lo que lo define (código, moneda, si es efectivo y qué datos pide) no cambia
  después, porque los cobros lo citan.
- Con más de seis medios, la caja agrupa los que no caben en «Otros medios» y «Cerrar cobro» sigue a
  la vista.
- El libro de pagos guarda los datos de cada pago (referencia, TxID, titular, terminal) cifrados, y
  rechaza una referencia que ya se cobró: el mismo capture de Pago Móvil no paga dos cuentas.

### Cambiado
- La caja ofrece los medios encendidos en el servidor y con los datos del local completos. Un medio
  no se borra: se apaga. Un terminal se retira y queda en el historial.
- Un local nuevo nace con los siete medios habituales; los que piden datos del local, apagados.
- Los logs tapan también el RIF, la cédula de quien paga y el titular de un Zelle.

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
