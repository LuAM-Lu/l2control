# Cambios de L2 Control

Qué cambia en cada versión, para quien usa el sistema. Formato de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer 2.0.0](https://semver.org/lang/es/)
según M-10 (docs/MAESTRO.md §2):

- **MINOR** +1 por cada paso de la ruta a producción entregado: el número del medio dice cuántos van
  (de 109). **PATCH** +1 por cada corrección entre pasos. **1.0.0** es la puesta en marcha (B8-4).
- Cada rama escribe lo suyo en `## [Sin publicar]`; al fusionar en `main`, quien fusiona le pone número y
  fecha y crea la etiqueta (M-20).
- La fuente es `version` del `package.json` raíz, con su etapa en `l2.etapa`. `pnpm verify` falla si
  este archivo no abre con esa versión. Cada versión lleva su etiqueta git `vX.Y.Z`.

Las versiones hasta 0.13.0 se reconstruyeron el 2026-09-26 desde el historial; sus etiquetas apuntan
al commit que entregó cada paso.

## [Sin publicar]

El cobro en curso no se pierde (B3-13, M-34).

### Añadido
- **Lo que se lleva de un cobro se guarda solo, en el servidor:** los pagos con sus datos (un Pago Móvil con su
  referencia, el efectivo…), la tasa con que se congeló, el vuelto, «Factura a» y el recibo. Aguanta cambiar de cuenta o
  de pestaña, recargar y un corte de luz: al volver a la cuenta, sigue ahí. Cifrado, como los datos de los pagos.
- **Otra caja lo ve:** «Cobro en curso por Marisol · Pago Móvil Bs. 1.000,00», con «Retomar» (sigue con sus pagos y su
  tasa) o «Descartar». Si dos lo tocan a la vez, el segundo lo vuelve a leer. Cobrar lo borra.
- **Al abrir el turno, a Cobrar.**

## [0.94.0] — 2026-10-09 · Hacia la puesta en marcha

La pulsera vinculada sale a su mesa (B4-14, M-34).

### Corregido
- **Una pulsera vinculada a una mesa sale a su mesa, sin elegir:** lo que debe y su tiempo de más van a la cuenta de la
  mesa. Antes, si en la salida quedaba «En caja», el tiempo de más caía en la cuenta de la familia. El servidor lo hace
  aunque la pantalla diga otra cosa, y niega sacar juntos niños vinculados con otros sueltos (o de otra mesa).

### Añadido
- **Los niños de la mesa, con lo suyo:** en la tablet y en la caja, cada niño vinculado dice «en la cuenta» o «pagado»
  (si pagó su parque antes de vincularse: no se cobra otra vez).

## [0.93.0] — 2026-10-09 · Hacia la puesta en marcha

El recibo dice lo que pasó en la caja (B3-12, M-34).

### Cambiado
- **Cada pago en su moneda y, si es en bolívares, con lo que vale en dólares** a la tasa del cobro; **«Pagado»**, cuando
  hubo varios pagos, otra moneda o algo de más; y **el vuelto también en bolívares**. Lo pagado menos el vuelto es el
  total, a la vista. Igual en el papel y en el recibo de la pantalla (y en el de WhatsApp): las cuentas se hacen una vez.
- En el papel, la orden y la hora van cada una en su renglón: a 58 mm la hora ya no se parte.

## [0.92.0] — 2026-10-08 · Hacia la puesta en marcha

La impresora por red o por USB, con sus acentos y su tinta (B5-4, M-34).

### Añadido
- **Impresora por USB:** en Ajustes → Impresoras, «Conectada por» red (como siempre) o USB en un equipo: se elige el
  equipo y su impresora de la lista que da su agente. El agente de esa laptop la imprime en modo directo.
- **La página de las tildes**, por impresora, con «Imprimir la prueba de acentos»: sale el mismo texto con cada página,
  numerado, para elegir la que se lee bien. Lo que una página no tiene sale sin tilde, nunca como un signo raro.
- **Impresión oscura**, por impresora: todo en negrita y con doble pasada, para la que marca pálido.

### Cambiado
- Un agente de antes no recibe trabajos por USB: la tarjeta de la impresora avisa que se actualice y lo suyo espera en
  la cola.

## [0.91.0] — 2026-10-08 · Hacia la puesta en marcha

El reloj de la sala no se queda pegado (B4-13, M-34).

### Corregido
- **El reloj de cada niño ya no se atrasa** al volver a la sala desde Entrada o Salida, ni al despertar el teléfono: se
  quedaba atrás lo que tuviera de vieja la última lectura, hasta recargar. Ahora la sala mide la hora del servidor al
  recibir cada lectura y se vuelve a leer al volver a la pestaña o a la red.
- **El estado de cada niño avanza solo:** pasa a «Por vencer» y a «Tiempo cumplido» a su hora, con las cifras de arriba
  y el orden por urgencia, sin que nadie tenga que recargar.
- **Sin conexión, la sala lo dice al instante** («Sin conexión con el servidor desde las 9:48 pm»): los relojes siguen
  contando; lo de otros equipos llega al volver.

## [0.90.2] — 2026-10-08 · Hacia la puesta en marcha

Los papeles con sus acentos (M-34, S-21).

### Corregido
- **Recibos, comandas y cortes salían sin acentos y con símbolos chinos.** Muchas impresoras térmicas genéricas vienen
  de fábrica en modo chino: cada letra con tilde se juntaba con la siguiente y salía un ideograma, que además descuadraba
  el renglón. Cada papel apaga ahora ese modo antes de elegir la página de las tildes; a las que no lo tienen no les
  cambia nada. Si una impresora sigue sin acentos, su página se elegirá en su ficha (B5-4).

## [0.90.1] — 2026-10-08 · Hacia la puesta en marcha

La entrada al parque desde la caja, legible (M-34, S-12).

### Corregido
- **La entrada desde la caja** partía los nombres de los paquetes letra por letra y montaba el precio sobre el borde: en
  una laptop elegía cuatro columnas por el ancho de la pantalla, aunque su hoja mide 480 px. Ahora los paquetes miden
  el sitio donde están: en la hoja (y en el teléfono) van en 2×2, enteros; en la entrada del parque, en fila si caben.
  Lo mismo para recargar tiempo y la entrada de la carga desde papel.

## [0.90.0] — 2026-10-08 · Hacia la puesta en marcha

Reportes → Deudas (B11-4, M-33): el flujo entero de quien se fue sin pagar.

### Añadido
- **Reportes → Deudas:** lo que quedó en deuda en el periodo, lo recuperado, lo perdido y lo que sigue pendiente; por
  mesero (quien sentó al cliente; en el mostrador, la cajera) y por quien autorizó dejarla en deuda o darla por perdida.
- **La historia de cada deuda:** el número de orden la abre, de la mesa al desenlace: quién lo sentó, cada pedido con lo
  que valía, «Se fue sin pagar» con quién lo autorizó, su paso por la caja y cómo terminó (cobrada, con qué y en qué
  turno; perdida, con su motivo; o pendiente, con los días que lleva). El cliente con su cédula y su teléfono.
- **Su PDF:** el resumen, las tablas y la historia de todas las deudas del periodo.
- **Ventas** dice en una línea las deudas del periodo, con el enlace a su informe.

## [0.89.0] — 2026-10-08 · Hacia la puesta en marcha

Deudas de clientes (B3-11, M-33): quien se va sin pagar deja una deuda a su nombre.

### Añadido
- **«Se fue sin pagar»** en la cuenta de la caja, en Mesas y al cerrar el turno, con el PIN de supervisión. La cuenta
  sale de la cola y del cierre, la mesa queda libre y lo que debe queda a nombre de su cliente (si la cuenta no tenía
  cliente, se escriben sus datos ahí mismo).
- **Caja → Deudas:** las pendientes, cobradas y perdidas, con el cliente, lo que debe, de dónde, quién lo atendió y
  quién lo autorizó. «Cobrar» la pasa a la caja con lo que consumió; «Devolver a deudas» si al final no pagó; «Dar por
  perdida», administración con su PIN y un motivo.
- **Cuando vuelve:** al buscarlo en la cola de la caja sale «Debe de antes», y al sentarlo en una mesa se avisa cuánto
  debe. Inicio dice cuántas deudas hay pendientes y por cuánto.

## [0.88.0] — 2026-10-08 · Hacia la puesta en marcha

Saber a quién cobrarle (B6-9, M-33): quien se sienta en el salón deja su nombre, su cédula y su teléfono.

### Añadido
- **Sentar a alguien pide su cédula, su teléfono y su nombre**, los tres obligatorios: en una mesa, en una mesa
  compartida y de pie. La cuenta se llama como el cliente. Si ya vino antes (o es una familia del parque), al escribir
  su cédula o su teléfono lo demás se rellena solo.
- **La caja pregunta antes de dejar una venta del mostrador sin cobrar:** cobrarla ahora, dejarla pendiente a nombre
  del cliente (con los mismos tres datos) o descartarla. En la cola, una venta pendiente sin datos dice «Sin datos».
- La búsqueda de la cola encuentra también por cédula y teléfono, y «Factura a» propone al cliente de la cuenta.

### Cambiado
- Una mesa ya no se abre con un pedido, una pulsera ni una salida del parque: primero se sienta a su cliente.
- La comanda dice la mesa y el nombre del cliente.
- La ayuda de Mesas y de Cobrar, y el recorrido de Mesas (se vuelve a enseñar una vez), lo cuentan.

## [0.87.0] — 2026-10-08 · Hacia la puesta en marcha

La caja más clara (B3-10, M-32): con todo el catálogo en la carta, buscar en vez de recorrerla, y los ítems que se
cobran a la vista.

### Añadido
- **Un buscador en la carta de la caja** (venta directa y «Añadir ítems»): al escribir busca en toda la carta, por
  nombre (sin tildes), categoría, SKU o código de barras, e Intro añade el primero. Al borrarlo vuelve la categoría que
  estaba. La tecla «/» busca en lo que está a la vista: en la carta si está abierta, si no en la cola.

### Cambiado
- **Lo que no se vende ahora va al final de la carta**, atenuado y bajo «No se venden ahora · N», cada uno con su
  motivo («Sin contar» o «Agotado»). Lo que se vende, primero.
- Los botones de categoría de la carta son más bajos (44 px): con muchas categorías, los productos se ven antes.
- **El pie de la cuenta, compacto:** «Factura a», «Descuento» y «Dividir» son una fila de tres botones que dicen cómo
  está cada uno («Consumidor final», «− 10 %», «Entre 3»); dividir abre las partes de 2 a 6 con «Sin dividir». El
  subtotal y los impuestos van en un renglón y el total, grande; dividida, dice «Parte 1 de 3». Con ocho ítems se ven
  todos sin desplazar.
- **«Cerrar cobro» ahora dice «Cobrar $ 13.00»**, con el monto que se cobra (el de la parte, si está dividida).
- La ayuda de Cobrar, el recorrido de la caja (se vuelve a enseñar una vez) y los atajos lo cuentan.

### Corregido
- La carta de la venta directa ya no se sale de su tarjeta con muchos productos: desplaza por dentro, en el
  escritorio, la tablet y el teléfono. Con la carta abierta en una cuenta, los ítems siguen a la vista.
- En la tablet, «Quedan N» ya no se sale de la tarjeta del producto: la carta pone dos columnas cuando es angosta y
  tres cuando hay sitio.

## [0.86.1] — 2026-10-08 · Hacia la puesta en marcha

Lo escrito de B8-2 (M-30): el procedimiento en papel y los runbooks del técnico. No cuenta como paso todavía: B8-2 se
cierra con la capacitación por rol, en B8-3.

### Añadido
- **El procedimiento en papel**, una hoja A4 para pegar junto a la caja: cuándo se pasa al papel, quién anota qué, cómo
  se carga al volver y a quién se llama. Se imprime desde Caja → Papel («El procedimiento») o desde los formularios. La
  ayuda tiene la entrada «Carga desde papel».
- **Los runbooks del técnico** (`infra/produccion/RUNBOOKS.md`): restaurar un respaldo, volver atrás una actualización,
  el equipo que sustituye a uno perdido, cambiar la impresora, los feriados del año, la laptop de caja que no enciende,
  el agente que no imprime y la caída de los dos enlaces.

### Corregido
- Al imprimir los formularios de papel (y la hoja nueva), el fondo de la página ya no sale como una franja bajo la hoja.

## [0.86.0] — 2026-10-08 · Hacia la puesta en marcha

El agente de impresión se actualiza solo (T-8c, ADR-028 punto 5).

### Añadido
- **El agente de la laptop de caja se actualiza solo.** Dice su versión al servidor; cuando el sistema trae otra, la
  baja del propio servidor, comprueba que su huella es la publicada y que arranca, y se cambia con la cola vacía, sin
  papel a medias. Si la versión nueva no arranca, Windows vuelve a poner la anterior y lo avisa.
- **Ajustes → Impresoras → Agente** enseña la versión de cada agente frente a la disponible, «Actualizar ahora» (no
  espera a su próxima revisión) y cómo le fue a su último cambio: «Se actualizó a la X», «La X no se instaló: su
  descarga no tenía la huella publicada» o «La X no arrancó: volvió la anterior». El manual de Impresoras lo explica.

### Cambiado
- El agente empaquetado lleva al lado su versión (`l2-impresion.exe.version`), que se publica con la versión del
  sistema.
- Un agente instalado antes de esta versión no sabe actualizarse: se instala una vez el de Ajustes → Impresoras y
  desde ahí lo hace solo.

## [0.85.0] — 2026-10-08 · Hacia la puesta en marcha

El punto de cobro y la entrada desde la caja (B3-9, M-31).

### Añadido
- **El punto de cobro.** El equipo de la caja lleva la marca «Punto de cobro» (Ajustes → Personas y equipos →
  Dispositivos, con la identidad confirmada). En él, el turno se abre como siempre. En otro equipo, abrirlo pide el PIN
  de administración y un motivo («La laptop de caja no enciende»): queda en la auditoría con quién lo autorizó, e Inicio
  avisa «Turno abierto fuera del punto de cobro» mientras siga abierto. Reportes → Ventas → Turnos lo marca.
- **La entrada al parque desde la caja.** «Entrada» (tecla A) o una pulsera que no está en la sala abre un panel
  lateral: cada pulsera leída suma un niño (si no se lee, se escribe su número; «Sin pulsera», con su nombre), el
  paquete más común ya elegido, las medias y el teléfono del representante. «Registrar y cobrar» deja la cuenta lista
  en la columna de cobro, sin salir de la caja. Se paga ahora: la cuenta abierta y los invitados de un cumpleaños
  siguen en Entrada.
- La Puesta a punto pide marcar un punto de cobro; el recorrido de la caja y el manual lo cuentan.

### Cambiado
- Al actualizar, cada equipo que ya abrió un turno queda como punto de cobro: ninguna caja se bloquea ese día.
- Entrada se ve y funciona igual; su lógica es ahora la misma pieza que usa la caja. El teléfono del representante no
  sale en la captura de un reporte de problema.
- La ruta a producción cuenta 91 pasos.

## [0.84.0] — 2026-10-08 · Inventario, respaldos y reportes

Duplicar un producto y sus sabores (B9-8, M-28).

### Añadido
- **«Duplicar»** en la ficha de un producto: abre el alta con su ficha copiada (categoría, presentación, precio, IVA,
  mínimo y carta) para cambiarle el nombre y, si lleva, el código. Nace con su SKU, sin inventario inicial.
- **«Con otros sabores»**: de «Jugo Naranja», escribiendo «Manzana, Pera y Uva», salen «Jugo Manzana», «Jugo Pera» y
  «Jugo Uva» de una vez, cada uno con su código de barras si se escribe o se pasa por el lector. Todo o nada.

## [0.83.0] — 2026-10-08 · Inventario, respaldos y reportes

Editar en lote (B9-9, M-29).

### Añadido
- **Editar varios productos a la vez.** En Inventario → Productos se eligen con las casillas de la tabla (uno a uno o
  «todos los que se ven») y la barra ofrece cambiarles la categoría, el mínimo, la carta o el precio, o apartarlos.
- **El precio en lote**: en por ciento (+10, −5) o en dólares (+0,50), desde un día. La hoja enseña cómo queda cada
  uno antes de aplicar.
- Una sola confirmación: todo o nada (si uno no puede, no cambia ninguno, y dice cuál), y cada producto queda en la
  auditoría como si se hubiera cambiado solo.

## [0.82.0] — 2026-10-08 · Inventario, respaldos y reportes

Conteo a ciegas y su informe de diferencias (B9-10, M-29).

### Cambiado
- **«Contar» es a ciegas.** En Inventario → Salidas y conteo se elige qué se cuenta (todo o una categoría) y la lista ya
  no dice lo que espera el sistema: se escribe lo que hay en el estante. Al terminar, «Terminé: ver diferencias» enseña
  lo contado contra el sistema, por categoría y por producto, antes de ajustar; la autorización se pide ahí, como antes.

### Añadido
- **La hoja para imprimir**: los productos que se cuentan (todos o de una categoría), con una casilla en blanco para lo
  que hay, sin lo que dice el sistema, y espacio para quién contó y quién revisó.
- **El informe de diferencias** de cada conteo, desde el historial: lo que faltó y lo que sobró, por categoría y por
  producto, al costo con que se ajustó, con su fecha, quién contó y quién autorizó. Se imprime o se guarda como PDF, y
  dos conteos se comparan abriendo sus informes.

## [0.81.0] — 2026-10-08 · Inventario, respaldos y reportes

La cuenta de soporte (T-17, M-28).

### Añadido
- **La cuenta de soporte.** En Ajustes → Personas y equipos, una persona de Administración se marca como «Cuenta de
  soporte» con un usuario propio (por ejemplo, `soporte.l2`). No sale en «¿Quién entra?»: entra por **«Acceso de
  soporte»** con ese usuario y su PIN, desde un equipo aprobado y con el mismo bloqueo que todos.
- Firma como «Nombre (soporte)» en todo lo que hace, se ve como «Soporte» en Inicio mientras está conectada y no cuenta
  como personal del local (ni en las cifras de Personas ni en la Puesta a punto).
- En producción no abre turnos ni cobra; en staging sí, para reproducir un error con una copia de la base.
- «Quitar soporte» la devuelve a la lista como una persona más de Administración. Nadie se marca a sí misma, y la única
  administración del local no se puede marcar.

## [0.80.0] — 2026-10-08 · Inventario, respaldos y reportes

El inventario al momento (B11-2, M-29).

### Añadido
- **Reportes → Inventario al momento**: lo que hay a esta hora y lo que vale al costo, por categoría y producto, con su
  existencia, su mínimo, su costo promedio y su estado (sin inventario inicial, agotado, bajo mínimo o bien). Arriba, el
  valor al costo, los agotados, lo bajo mínimo y lo sin contar, que filtran; también por categoría. Un producto retirado
  que todavía tiene existencia sigue contando.
- **Su PDF**, con el filtro que se puso en la pantalla.

## [0.79.0] — 2026-10-08 · Inventario, respaldos y reportes

Movimientos de inventario: el kárdex (B11-3, M-29).

### Añadido
- **Reportes → Movimientos**: de un producto o de una categoría, en un día o un rango (hasta 93 días), cada entrada,
  venta, salida, ajuste y conteo con su fecha, quién (y quién autorizó), de dónde vino o por qué, y el saldo que dejó.
  Arriba, lo que había al empezar, lo que entró, lo que salió y lo que quedó, que es la existencia a esa hora. Con una
  categoría, un renglón por producto y el kárdex del que se toque.
- Un conteo que cuadró y un inventario inicial en cero también se ven, con cantidad 0.
- **Su PDF:** el resumen de la categoría y el kárdex de cada producto, en hojas A4 con su número.

## [0.78.0] — 2026-10-08 · Inventario, respaldos y reportes

Ajustes unificados (T-18, M-29).

### Cambiado
- **Ajustes pasa de 18 secciones a 12.** Lo que va junto vive junto, en pestañas: **Personas y equipos** (usuarios y
  permisos, roles y accesos, dispositivos), **Tasas de cambio** con sus feriados bancarios y **Sistema** (versión y
  actualizaciones, respaldos y la semilla del local).
- **La carta está en Inventario → Productos**, pestaña «En la carta»: un solo sitio para el precio de lo que se vende.
- Los enlaces guardados a las secciones de antes llevan a su pestaña. Cada pestaña se ve con su permiso: supervisión ve
  las tasas, pero no los feriados.
- El manual de la ayuda, al día, con la entrada de Reportes.

## [0.77.0] — 2026-10-08 · Inventario, respaldos y reportes

La sección Reportes y las ventas (B11-1, M-29).

### Añadido
- **Reportes, en el panel**, para administración y supervisión: de solo lectura y sacado de los asientos. Llega con
  **Ventas**; Inventario al momento y Movimientos vienen detrás.
- **Reportes → Ventas** de hoy, ayer, esta semana, este mes, el mes anterior o un rango (hasta 93 días), de todas las
  cajeras o de una: lo vendido, lo cobrado en dólares con la tasa con que se cobró cada pago, lo anulado y cuántos
  turnos tienen su Z. Debajo, por medio de pago y moneda, por origen (parque, restaurante, mostrador y cumpleaños), por
  cajera, por turno (con «Cuadra con su Z», «No cuadra» y qué, o «Sin Z todavía») y las ventas anuladas con su motivo y
  quién lo autorizó. El periodo va en la dirección: el enlace se guarda o se comparte. Lo de hoy se pone al día solo.
- **Su PDF:** «PDF» abre la hoja A4 del informe, en blanco y negro, con el local, el periodo, quién lo pidió y cuándo,
  y el número de página; «Imprimir o guardar PDF» abre el diálogo del navegador.

## [0.76.0] — 2026-10-08 · Inventario, respaldos y reportes

Respaldos con carpeta, fijados e integridad a la vista (B7-6, M-29).

### Añadido
- **El ensayo semanal de restauración.** Una vez por semana el servidor restaura el respaldo de esa noche en una base
  de usar y tirar y comprueba su huella: Ajustes → Respaldos dice «ÍNTEGRO» (o qué falló) e Inicio, «Respaldo ÍNTEGRO»,
  o avisa si no salió íntegro o si pasó más de una semana sin ensayar.
- **Fijar un respaldo** con su nombre («antes de producción»): ni el servidor ni la escalera de la PC lo borran, y la
  PC lo guarda además en su carpeta «fijados». «Soltar» lo devuelve a la retención de siempre.
- **Elegir dónde guarda la PC** al prepararla: un disco externo, una carpeta en la nube (OneDrive, Google Drive) o
  Documentos. El panel enseña dónde guarda (y avisa si es la misma PC: la copia no está fuera del local) y si su
  programa es de una versión anterior.
- Cada respaldo bajado dice «huella comprobada».

## [0.75.0] — 2026-10-08 · Inventario, respaldos y reportes

La semilla con casillas (B7-7, M-29): el camino de la corrida limpia de producción.

### Añadido
- **La semilla lleva también los impuestos, los medios de pago con los datos que el cliente ve para pagar (Pago
  Móvil, Zelle y los terminales del punto), los descuentos vigentes y las impresoras.** Nunca personas, PIN, llaves,
  equipos ni existencias. Al cargarla en una base nueva, los medios que traen sus datos se encienden, los impuestos
  rigen desde ese día (lo programado, en su día) y las impresoras entran apagadas hasta comprobar que imprimen.
- **Casillas al descargar y al cargar.** «Preparar semilla» enseña lo que lleva, parte por parte y elemento por
  elemento, con lo que se llama «Prueba…» desmarcado, y el archivo lleva solo lo marcado. Al cargar, el informe dice
  qué entra y deja elegir lo mismo antes de «Cargar lo marcado».

### Cambiado
- El formato de la semilla pasa a la versión 2; las de la versión 1 se siguen cargando.

## [0.74.0] — 2026-10-08 · Inventario, respaldos y reportes

Catálogo sin existencias y su conteo inicial (B9-7, M-28).

### Añadido
- **Inventario → Productos → «Alta en lote».** El catálogo se carga de una vez en una hoja, sin cantidades: nombre,
  categoría, presentación, precio, IVA, mínimo y código de barras. Se escribe con el teclado, se pega desde Excel o
  Google Sheets y el lector pone el código en la fila en la que se está. Todo o nada: si una fila no vale, no se crea
  ninguno y se dice cuál.
- **«Sin inventario inicial»**, un estado nuevo y distinto de «Agotado»: lo que se cuenta y todavía no se contó. No se
  vende, y la caja («Sin contar»), la carta del mesero, la carta de Ajustes y Productos dicen por qué. Productos tiene
  su cifra y su filtro, y «Contar N pendientes»; la ficha de cada uno, «Contarlo», o el día de su inventario inicial.
- Inicio y la Puesta a punto cuentan los productos sin inventario inicial; el punto «Existencias iniciales» se tacha
  cuando todo lo que está a la venta tiene el suyo.

### Cambiado
- **El inventario inicial trae solo los que faltan** («Traer los que faltan»): 0 si no hay ninguno (queda «Agotado»,
  sin costo) y en blanco si todavía no se contó. Lo que ya tiene su inventario inicial no entra otra vez: lo que falte
  o sobre se corrige con un conteo.
- Una compra, una reposición o un conteo también arrancan un producto pendiente: desde entonces ya tuvo existencia.

## [0.73.0] — 2026-10-07 · Lo pedido en la primera visita

Tiempo de atención en el salón (B6-8, M-27). Con él, lo pedido en la primera visita queda entregado entero.

### Añadido
- **«Servido» en la tablet.** Cada pedido dice cuánto lleva esperando y tiene su botón «Servido»; al tocarlo queda la
  hora y cuánto esperó. En «Atender» salen las mesas que esperan su pedido o que no han pedido, pasado su tiempo.
- **Restaurante → Atención en el salón**, para administración y supervisión: cada mesa con cuánto lleva sentada, sin
  pedir y esperando, la que más pide atención primero, y la espera media y máxima del día.
- En Ajustes → Sucursal, a partir de cuántos minutos sin pedir o esperando se avisa (de fábrica, 15 y 20).

## [0.72.1] — 2026-10-07 · Lo pedido en la primera visita

Corrección.

### Corregido
- Las cifras de cabecera de la entrada, la salida y las mesas, y las etiquetas de estado de las tarjetas de la sala,
  volvieron a su tamaño: con la escala de títulos de la 0.71.0 salían con el tamaño de texto normal.

## [0.72.0] — 2026-10-07 · Lo pedido en la primera visita

Reportar un problema (T-11, M-27).

### Añadido
- **Reportar un problema.** Desde la ayuda de cualquier pantalla (F1), desde la ayuda de un error y con «Reportar» en
  el aviso de un error, cada persona cuenta qué pasó. El sistema adjunta la pantalla, la versión, el equipo, su rol, los
  últimos errores y una captura de la pantalla (que se ve antes de enviar y se puede quitar). Nunca datos de cobro ni
  el PIN.
- **Mis reportes**, en la ayuda: cada reporte con su estado (nuevo, visto, en curso o resuelto en una versión), al día.
  Si el mismo error ya se había reportado, se dice cómo va.
- **Ajustes → Soporte:** los reportes del local con su captura y sus errores, para marcarlos vistos, en curso o
  resueltos. Los del mismo error dicen cuántos son.
- **Aviso por correo al desarrollo** de cada reporte nuevo, con su número, la versión y la pantalla (sin lo que contó
  la persona ni la captura), en cuanto se configura el correo del servidor.

## [0.71.0] — 2026-10-07 · Lo pedido en la primera visita

Jerarquía tipográfica y ancho completo (T-16, M-27).

### Cambiado
- **Todas las secciones del panel usan el ancho de Inicio.** En una pantalla ancha ya no quedan márgenes vacíos a los
  lados, y al pasar de Inicio a otra sección el contenido no encoge.
- **Una sola escala de títulos y textos.** El título de cada pantalla, el de cada bloque, los subtítulos, las
  etiquetas y las cifras tienen tamaños fijos y distinguibles en todo el sistema (el título de pantalla pasa de 32 a
  28 px); los iconos crecen con el tamaño del botón de cada puesto.
- El nombre y el rol al pie del menú lateral se leen enteros; la ayuda, el tema y salir pasan al renglón de abajo.

## [0.70.0] — 2026-10-07 · Lo pedido en la primera visita

La operación se lee de un vistazo (T-15, M-27).

### Añadido
- **El código de la pulsera, a mano.** Junto a «Pasa la pulsera», «Escribir» deja teclear el código de una pulsera
  que el lector no lee, en la entrada, la sala, la salida, la caja y la tablet del mesero.
- **Precios de la carta en $, Bs o los dos.** En la caja, al final de las categorías: cada equipo recuerda su vista.
- **Paquetes con su reloj.** Cada paquete de tiempo lleva un anillo que dice cuánto dura («30'», «1h», «2h»; el pase
  libre, el infinito) y su nombre entero.

### Cambiado
- **Nada de nombres cortados.** En «Por cobrar», la cabecera de la cuenta, la factura y las tarjetas de la sala, un
  nombre que no cabe se desliza despacio y vuelve, en vez de terminar en «…».
- **Medios de pago:** el icono arriba, el nombre debajo y la moneda debajo; la letra del atajo, en su esquina.

## [0.69.0] — 2026-10-07 · Lo pedido en la primera visita

Mi PIN y el acceso con teclado (T-14, M-27).

### Añadido
- **Mi cuenta.** Tocando tu nombre (abajo a la izquierda en el panel, arriba a la derecha en caja, entrada, sala o
  mesas) cambias tu PIN: el actual y el nuevo dos veces. Sigue las reglas de siempre (ni fácil de adivinar ni el
  mismo), y un PIN actual errado cuenta como un intento del acceso.
- **Entrar con el teclado.** En «¿Quién entra?» cada persona tiene su tecla (1 a 9; con más personas, su inicial). En
  el PIN se escribe o se pega, Intro entra, Retroceso borra y Esc vuelve a elegir persona.

## [0.68.0] — 2026-10-07 · Lo pedido en la primera visita

Cobrar con el teclado y el recibo a elección (B3-8, M-27).

### Añadido
- **Imprimir recibo, a elección.** Junto a «Cerrar cobro», un interruptor «Recibo / Sin recibo» (tecla `*`) decide si
  el recibo sale al cobrar. Arranca con lo que diga Ajustes → Sucursal («Recibo al cobrar»: se imprime, de fábrica, o a
  pedido). Lo que no se imprimió se saca después desde Ventas del turno. Si no hay impresora de recibos encendida, el
  cobro se cierra igual y la caja avisa de que el recibo no salió.
- **Cobrar sin el ratón.** Cada medio de pago muestra su letra (E, B, P, T, Z, U) y en la búsqueda de la cola (`/`)
  Intro elige la primera cuenta encontrada: buscar, medio, monto, recibo y Ctrl+Intro, todo con el teclado.

### Cambiado
- Antes el cobro no imprimía solo: el recibo salía si se abría «Ver recibo» y se pulsaba «Imprimir». Ahora, de
  fábrica, sale al cobrar.

## [0.67.0] — 2026-10-07 · Lo pedido en la primera visita

Roles que se pueden dar (T-13, M-27).

### Corregido
- **Supervisión ya puede hacer inventario.** Dar de alta productos y categorías, y cargar el inventario inicial con
  productos nuevos, pedía el permiso de cambiar precios y tarifas, que no se regala: aunque administración le diera a
  supervisión «todo el inventario», no cambiaba nada. Ahora es un permiso propio, «Dar de alta y editar productos y
  categorías», que se ajusta por rol o se concede a una persona en Roles y accesos, y no pide confirmar identidad.
  Cambiar un precio sigue siendo de administración.
- El menú de Inventario muestra cada sección a quien puede trabajar en ella: Entradas, a quien carga mercancía;
  Productos, a quien da de alta, carga o ajusta.

### Añadido
- En Roles y accesos, la fila que no se ajusta dice por qué y qué permiso dar en su lugar.

## [0.66.0] — 2026-10-07 · Lo pedido en la primera visita

Medias en la entrada (B4-9, M-27).

### Añadido
- **Medias.** Con el producto de medias elegido en Ajustes → Sucursal, la entrada pregunta por cada niño si trae sus
  medias. Si no, el par se cobra en la cuenta de la familia (el total ya lo incluye) y sale del inventario. Si no quedan,
  la entrada lo avisa y no se registra hasta corregirlo.

## [0.65.0] — 2026-10-07 · Lo pedido en la primera visita

La sala para administración: cortesía y anular una entrada (B4-10, M-27).

### Añadido
- **Regalar su tiempo**, desde la ficha del niño en la sala: su paquete, sus recargas y su tiempo de más pasan a ser
  cortesía, con un motivo y la autorización con PIN de siempre. Quedan en la cuenta con su importe y en las excepciones
  del turno.
- **Anular la entrada** registrada por error (la pulsera equivocada, un niño registrado dos veces): sale de la sala sin
  cobro, su paquete deja de cobrarse y su pulsera vuelve a servir. Pide un motivo y el PIN de administración
  (supervisión la pide con el de administración). Si su paquete ya se cobró, primero se anula ese cobro en la caja.

## [0.64.0] — 2026-10-07 · Lo pedido en la primera visita

Ayuda dentro de la app y recorridos guiados (T-12, M-27).

### Añadido
- **Ayuda en cada pantalla.** El botón de ayuda (o la tecla F1) abre lo que dice el manual de la pantalla en la que se
  está: para qué sirve, cómo se usa y sus problemas frecuentes con su solución. Se puede buscar en todo el manual con
  las palabras de cada uno («pulsera usada», «no imprime»).
- **«Cómo se resuelve».** Cuando sale un error que el manual conoce, su aviso trae ese botón y abre la ayuda con la
  solución.
- **Recorridos guiados.** La primera vez que cada persona abre la entrada, la sala, la salida, la caja o las mesas, un
  recorrido corto le enseña lo principal, señalando cada parte. Se salta cuando se quiera y se puede volver a ver desde
  la ayuda. Queda guardado por persona, no por equipo.

## [0.63.0] — 2026-10-07 · Lo pedido en la primera visita

Entrar sin pulsera (B4-8, M-27).

### Añadido
- **Niños sin pulsera.** Para los niños que no toleran la pulsera, la entrada tiene «Sin pulsera» junto al lector: el
  niño entra con su nombre (obligatorio: se le reconoce por él) y el sistema le da un código propio (SP-00001…) que
  ninguna pulsera puede traer. Cuenta en el aforo, corre su tiempo y se cobra como los demás.
- La sala marca su tarjeta «Sin pulsera», y la salida tiene «Sin pulsera (N)» para elegirlo por su nombre.
- Una pulsera con un código que empiece por «SP-» se rechaza: esos son solo de los niños sin pulsera.

## [0.62.0] — 2026-10-07 · Lo pedido en la primera visita

Pausa por comida (B4-7, M-27).

### Añadido
- **Pausa por comida.** Cuando un niño sale a comer, la monitora pausa su tiempo desde su ficha en la sala: el reloj se
  queda quieto y la tarjeta dice «En pausa» con lo que le queda. A los 10 minutos vuelve a correr solo, o antes con
  «Terminar la pausa». Hay una sola pausa por visita, y lo que estuvo comiendo no cuenta ni como tiempo consumido ni
  como tiempo de más.
- El máximo de la pausa es un ajuste de la sucursal (Ajustes → Sucursal), de 1 a 30 minutos; 10 de fábrica.

### Cambiado
- Los botones de la ficha del niño van en dos columnas: con cuatro en una fila, el texto se partía en tres líneas.

## [0.61.0] — 2026-10-07 · Lo pedido en la primera visita

Varias cuentas en una mesa y cuentas de pie (B6-7, M-27).

### Añadido
- **Mesas compartidas.** Cuando familias distintas se sientan en la misma mesa, cada una tiene su cuenta, con su nombre
  y cuántas personas son: el mesero elige a cuál le pide, la comanda sale con la mesa y el nombre («MESA 3 · Familia
  Pérez») y cada una se cobra, se vincula y se libera por separado. La mesa queda libre cuando no le queda ninguna. El
  plano marca con un número cuántas cuentas tiene una mesa.
- **Cuentas de pie.** Para quien pide sin estar en una mesa: «De pie», encima del plano, abre una cuenta con un nombre o
  una seña («Sr. Luis, camisa azul»). Se le pide igual que a una mesa y la comanda sale «DE PIE».
- **Sentar a una familia** abre su cuenta en el momento, con cuántas personas son. La primera de una mesa puede ir sin
  nombre (se llama como la mesa); las siguientes llevan el de la familia, y dos con el mismo nombre no se permiten.

### Cambiado
- El plano, «Atender» e Inicio saben qué mesas están ocupadas, desde cuándo y cuánta gente hay por las cuentas del
  servidor, no por los avisos del salón: una mesa con su cuenta abierta ya no puede verse libre.
- Vincular niños a una mesa (desde la sala o desde la salida «A una mesa») elige la cuenta de la familia cuando la mesa
  es compartida.
- La caja, las ventas, el recibo y los pendientes del cierre nombran las cuentas del salón como se ven en él: «Mesa 3»,
  «Mesa 3 · Familia Pérez» o «De pie · Sr. Luis».
- La mesa queda «por limpiar» al cobrar su última cuenta, no la primera.

### Seguridad
- Next.js 16.3.7 → 16.3.8: corrige una falsificación de peticiones del servidor en la optimización de imágenes
  (GHSA-cjq9-62q9-8jv4), que la auditoría de dependencias del CI marcó como alta.

## [0.60.1] — 2026-10-07 · Staging en el VPS

Corrección vista al poner la 0.60.0 en el staging.

### Corregido
- **Las cabeceras de seguridad nuevas no llegaban al servidor.** Caddy leía el `Caddyfile` de antes: el contenedor
  monta ese archivo, `git pull` lo reemplaza por otro y dentro se seguía viendo el viejo. Ahora el despliegue lo
  compara y, si cambió, recrea Caddy.

## [0.60.0] — 2026-10-07 · Staging en el VPS

Revisión de seguridad (B7-5).

### Seguridad
- **Next 16.3.7**: la 16.3.4 tenía una ejecución remota de código en la generación de imágenes, la que dibuja los iconos
  de la app instalada (GHSA-vcvr-r3jv-pc5j, crítica).
- **Los datos cifrados (referencias de pago, datos del local) exigen la etiqueta de autenticación entera**: antes se
  aceptaba una recortada, y con 4 bytes falsificar un texto cifrado dejaba de ser imposible.
- **El sistema no se deja incrustar en otra página** y el navegador solo le da la cámara: cabeceras de seguridad nuevas.
- **Ver los contactos de los representantes queda en la auditoría**, cada vez, con cuántos y no cuáles (PLAN §7.6).
- Dependencias de dependencias con avisos altos (`mysql2`, `sharp`, `source-map-js`, `fast-uri`) en su versión
  corregida. El CI rechaza una dependencia con un aviso alto o crítico, y una versión nueva espera siete días antes de
  entrar.

## [0.59.0] — 2026-10-07 · Staging en el VPS

Respaldos fuera del servidor (B7-4, M-26).

### Añadido
- **Un respaldo cada noche, cifrado y fuera del servidor.** El servidor guarda a las 3:15 am un respaldo de la base
  cifrado con la clave del local, que no está en el servidor: sin ella nadie lo puede abrir. Una PC del local lo baja
  cada mañana, comprueba que llegó entero y guarda los últimos 30 días, una copia por semana y una por mes.
- **Ajustes → Respaldos**: si el de anoche se hizo, cuándo lo bajó la PC del local y las últimas noches. Desde ahí se
  prepara esa PC (con tu identidad confirmada): el panel da una orden para pegar en PowerShell y una credencial que se
  enseña una sola vez. Cambiarla o retirarla deja sin valer la anterior.
- **Si un respaldo falla, no se hizo o no sale del servidor, se ve**: en Ajustes → Respaldos y con un aviso en Inicio
  para administración.
- **La restauración se ensaya**: cada respaldo lleva su huella (las filas de cada tabla y lo que suma el libro de
  pagos) y el ensayo la comprueba sobre una base limpia.

## [0.58.0] — 2026-10-07 · Staging en el VPS

Actualizaciones desde el panel (T-8b, M-25).

### Añadido
- **Ajustes → Versión y actualizaciones**: la versión en marcha, las nuevas con lo que trae cada una y lo último que se
  puso. En producción decide administración, con su identidad confirmada: «Actualizar ahora» (solo sin turnos abiertos
  ni niños en sala) o «Esta noche al cierre», que se pone sola cuando no queda nada abierto; mientras espera se puede
  cancelar. Si no se pide, la versión sigue ahí hasta que se pida. El staging se pone al día solo con cada versión.
- **El servidor pone la versión solo**, con respaldo antes, y si no queda sana vuelve a la anterior: el panel lo dice
  («Volvió a la anterior», con el motivo). Inicio enseña un aviso discreto cuando hay una versión nueva.
- **Las pantallas abiertas se ponen al día solas** al terminar una actualización, en cuanto están libres: sin un diálogo
  abierto, sin escribir en un campo y sin un pedido o un plano sin enviar. Si no están libres, un aviso abajo lo dice y
  se pueden poner al día con un toque.
- **La versión del sistema**, en letra pequeña bajo el nombre en el menú del panel.
- **Puesta a punto: «Después»** en los consejos recomendables. Se apartan a un grupo «Para después» que se puede abrir y
  retomar, y si solo quedan esos, Inicio enseña una línea en vez del cuadro. Lo imprescindible no se aparta.

### Cambiado
- Con el canal en vivo recién vuelto, o sin él, una pantalla solo vuelve a leer todo si el servidor contesta: antes,
  repintar contra un servidor caído podía dejar la página de error del navegador.

## [0.57.0] — 2026-10-07 · Staging en el VPS

La semilla del local (B7-2) y el inventario en lote (T-10), con el icono de Android (M-24).

### Añadido
- **Semilla del local** (Ajustes → Semilla del local): descarga en un archivo lo que se tarda en teclear (los ajustes de
  la sucursal, las tarifas y paquetes, las categorías y la carta con sus precios, el plano y los cumpleaños) y carga la
  de otro local. Primero enseña qué entra, qué ya está y qué no trae; después solo añade lo que falta: lo que el local ya
  tiene no se toca. No lleva personas, medios de pago, impuestos ni existencias.
- **Las entradas de mercancía son una tabla**: se busca el producto por nombre, SKU o código, la cantidad va en unidades
  sueltas o en bultos de N y el costo como venga en la factura (por unidad, por bulto o el total de la fila). Cada fila
  dice su total y lo que cuesta cada unidad, propone el último costo de ese producto, e Intro en el costo pasa a la
  siguiente. Un producto nuevo se da de alta en su misma fila.
- **Pegar desde Excel** o Google Sheets: producto, cantidad, costo y, para los nuevos, categoría y precio. Se revisa
  fila por fila antes de pasar a la tabla.
- **Inventario inicial**: trae todos los productos que se cuentan para escribir lo que hay de cada uno, en unidades y al
  costo de una; queda como tal en el historial. La Puesta a punto lo abre directamente.
- **Categorías como lista propia** (Inventario → Productos → Categorías): crear, renombrar (con sus productos), unir dos
  y retirar una vacía. Un local nace con unas de arranque, y «bebidas» o «BEBIDAS» son la misma que «Bebidas».

### Cambiado
- El icono de la app instalada es el logo de L2 sobre transparente (y sobre fondo claro en el adaptable de Android y en
  el de Apple), con los colores del tema claro en la pantalla de arranque. Para que Android la instale de verdad (sin el
  sello de Chrome), se elige «Instalar app» en el menú de Chrome.

### Corregido
- Una entrada con varios productos nuevos en la que uno no valía (un nombre o un código ya usados) dejaba creados los de
  las filas anteriores. Ahora no queda nada de esa entrada.

## [0.55.1] — 2026-10-07 · Staging en el VPS

Corrección vista al probar T-9 en el servidor.

### Corregido
- **Inicio decía la fecha de mañana desde las 8 pm.** La tomaba del reloj del servidor, que en el VPS va en hora
  universal; ahora es la del local, en su zona horaria (Ajustes → Sucursal).

## [0.55.0] — 2026-10-07 · Staging en el VPS

Confirmar identidad desde cualquier equipo (T-9, M-23).

### Añadido
- **En tu propio equipo, confirmar que eres tú es solo tu contraseña.** El equipo donde se instala L2 Control
  queda de confianza para quien lo instala, y cualquier persona de administración puede marcar «Confiar en este
  equipo» al confirmar en un equipo suyo. La confianza es de esa persona en ese equipo: no le sirve a nadie más,
  se ve y se retira en Ajustes → Usuarios, y si el equipo se revoca, deja de valer.
- **App de autenticación** (Google Authenticator, Authy, Microsoft Authenticator o el gestor del iPhone): el
  código de 6 cifras sirve para confirmar desde cualquier equipo, aunque no tenga huella ni Windows Hello. Cada
  persona la configura con un QR en Ajustes → Usuarios. Un código ya usado no vale otra vez. También sirve para
  aprobar un equipo desde sí mismo.
- La Puesta a punto avisa si nadie de administración puede confirmar fuera de su equipo de confianza.

### Cambiado
- **Instalar L2 Control ya no exige una llave de acceso**, ni el enlace de alta de una persona de administración:
  la llave queda como opción para los equipos que la admiten. Antes, una laptop sin Windows Hello o una tableta
  sin los servicios de Google no podían ni instalar.
- Reponer las credenciales de alguien retira también su app y sus equipos de confianza.
- Una sección protegida ya no dice «con tu contraseña» en un equipo donde hace falta además la app: dice que hay que
  confirmar que eres tú, y el diálogo ofrece lo que vale en ese equipo.

### Corregido
- En el teléfono, el nombre de un equipo de confianza o de una llave de acceso se quedaba en una sola letra en
  Ajustes → Usuarios; ahora la fecha baja de renglón.
- La pantalla del enlace de alta (`/alta`) no estiraba el panel de la marca hasta el pie de la pantalla.

## [0.54.0] — 2026-10-07 · Staging en el VPS

El sistema en el servidor (B7-1).

### Añadido
- **L2 Control ya está en internet**, en su servidor (VPS), con HTTPS: `https://217-216-48-54.sslip.io`. Es el
  staging: aquí se prueba con los equipos reales del local antes de la puesta en marcha. Las actualizaciones se
  ponen sin miedo: si una versión no queda sana, el servidor vuelve solo a la anterior (ensayado allí mismo).

## [0.53.1] — 2026-10-07 · Preparación del staging

Corrección al instalar en el servidor de staging.

### Corregido
- **Si no se puede crear una llave de acceso, la pantalla dice por qué.** Antes, ante un fallo que no reconocía,
  decía solo «No se pudo registrar la llave de acceso en este equipo». Ahora explica los casos de Windows: si el
  equipo no tiene Windows Hello (sin PIN, huella ni cara), dice dónde configurarlo o que se puede crear la llave
  en el teléfono, y si el equipo ya tenía una llave para esa persona, lo dice. Cualquier otro fallo sale con el
  nombre del error.

## [0.53.0] — 2026-10-06 · Preparación del staging

Publicar y desplegar (T-8a, M-22).

### Añadido
- **El sistema se puede poner en un servidor y se actualiza sin miedo.** Cada versión tiene sus imágenes (la web,
  el canal en vivo y las migraciones) y un servidor completo con HTTPS automático. Poner una versión nueva respalda
  la base, la migra, arranca la versión y comprueba que responde; **si no queda sana, vuelve sola a la que estaba**,
  sin tocar los datos, y queda anotado. Lo prepara el siguiente paso: el sistema en el VPS.
- Al publicar una versión, el agente de impresión de la laptop de caja sale con su huella y con las novedades de
  esta lista.
- La web dice su versión y si alcanza la base en `/salud`, como ya hacía el canal en vivo.

## [0.52.3] — 2026-10-06 · Preparación del staging

El logo de L2 (pedido del usuario).

### Cambiado
- **El sistema lleva el logo oficial de L2**, la «L2» azul y verde de la suite, en lugar del recuadro con las
  letras: en el acceso, en el menú del panel, en la pestaña del navegador y en el icono de la app instalada.
  Es el mismo en el tema claro y en el oscuro. Quien ya tenía la app instalada verá el icono nuevo cuando su
  equipo la actualice, o al reinstalarla.

## [0.52.2] — 2026-10-06 · Preparación del staging

Tema claro (pedido del usuario; M-21).

### Añadido
- **Tema claro, y es el que sale por defecto.** Fondo azul muy claro, tarjetas blancas, azul como color
  principal y texto azul marino (inspirado en «Light Blue» de L2Lab). Cada equipo elige el suyo con el botón
  del sol o la luna, en el acceso y en el pie del menú del panel, y se queda así en ese equipo: la laptop de
  caja puede ir en claro y el teléfono de la sala en oscuro. El tema oscuro sigue igual que estaba.
- **En el tema claro, los avisos rojos y amarillos son bloques de color sólido.** El rojo lleva la letra blanca
  y el amarillo, azul marino (sobre el amarillo el blanco no se lee). Las zonas teñidas enteras, como la barra
  de la caja sin turno abierto, se quedan en un tono suave. El verde no cambia.
- La barra del navegador toma el color del tema.

## [0.52.1] — 2026-10-06 · Preparación del staging

Corrección entre pasos.

### Corregido
- **Un doble clic al anular un cobro ya no puede acabar en «Ese asiento ya se revirtió».** Si las dos
  peticiones llegaban casi a la vez, la segunda podía responder con ese error aunque la anulación se había
  hecho, y bien, una sola vez. Ahora devuelve lo ya anulado, como hacía en el resto de los casos. El dinero
  nunca estuvo mal: siempre quedó una sola reversión.

## [0.52.0] — 2026-10-06 · Preparación del staging

Paso T-4 de la ruta: instalación inicial y llaves de acceso (ADR-020, M-12).

### Añadido
- **Un servidor recién puesto se instala desde el navegador, sin consola.** Con la base vacía, el acceso
  ofrece «Instalar L2 Control»: el código de un solo uso que el servidor escribe en su registro, el nombre
  del local y la primera persona de administración con su contraseña, su PIN y su llave de acceso. Al
  terminar, ese equipo queda aprobado, la persona entra y la pantalla no vuelve a existir.
- **Llaves de acceso en lugar del autenticador.** Confirmar identidad y aprobar un equipo desde sí mismo
  piden la contraseña y la llave de acceso (la huella, la cara o el PIN del equipo, o el teléfono). Quien
  no tenga su llave a mano usa uno de sus diez códigos de recuperación, que valen una vez cada uno y se
  imprimen al recibirlos.
- **Las credenciales de administración se dan desde el panel.** En Ajustes → Usuarios, cada persona de
  administración enseña si puede confirmar identidad, sus llaves y los códigos que le quedan.
  «Dar credenciales» y «Añadir otra llave» generan un enlace de 24 horas y un solo uso, con su código QR:
  la persona lo abre en su equipo o su teléfono y pone ella su contraseña y su llave. Quien genera el
  enlace no ve la contraseña.
- **Puesta a punto en Inicio.** Tras instalar, Inicio dice a administración qué falta para abrir el primer
  día (personas, equipos, tarifas, impuestos, tasa, catálogo, impresoras, carta y plano, existencias…) y
  qué puesto no puede trabajar sin cada cosa. Se tacha sola cuando el dato existe y, con todo hecho, deja
  de salir.

### Cambiado
- **Un local sin tarifas ya abre.** Antes la app no arrancaba sin un tarifario publicado; ahora la entrada
  dice «Todavía no hay tarifas del parque» y Ajustes → Tarifas y paquetes deja publicar el primero.
- `pnpm db:semilla` y `pnpm credenciales "<nombre>"` imprimen un enlace de alta en vez de una contraseña.
- El worker no consulta la tasa del BCV mientras el local está sin instalar; la trae en cuanto se instala.

### Corregido
- Cuando el navegador rellena solo un campo (el gestor de contraseñas, el autocompletado), la pantalla ya no
  falla con «Cannot read properties of undefined»: el lector de códigos y los atajos de la caja trataban ese
  aviso del navegador como si fuera una tecla.

### Retirado
- El código del autenticador (TOTP) y `pnpm totp`. Quien tenía contraseña de la etapa anterior necesita
  un enlace de alta para registrar su llave.

## [0.51.1] — 2026-10-06 · Preparación del staging

Corrección entre pasos: el contraste de los avisos y sus iconos.

### Corregido
- **Los avisos y lo seleccionado ya no parecen botones hundidos.** Los fondos verde, amarillo y rojo de avisos,
  distintivos y tarjetas de estado eran más oscuros que la tarjeta sobre la que iban, y se leían como algo ya
  presionado; ahora tienen más luz que ella. La opción elegida en los selectores (motivos, medios, paquetes,
  «Soy de administración») lleva un relleno dorado más visible. El rojo de errores y bloqueos es un tono más
  claro, que se lee mejor sobre el fondo oscuro, y el botón de peligro lleva el texto oscuro. Ningún color
  cambia de significado.

### Añadido
- **Los iconos de los avisos se mueven para encontrarlos de un vistazo.** El de un aviso rojo (sin tasa, agotados,
  un bloqueo) crece, se sacude y suelta un destello cada pocos segundos mientras el aviso siga ahí. El de uno
  amarillo se balancea tres veces al aparecer y se queda quieto. Lo verde no se mueve. Con «reducir movimiento»
  activado en el equipo, ninguno se anima.

## [0.51.0] — 2026-10-06 · Preparación del staging

Paso T-2 de la ruta: cero simulación.

### Añadido
- **El sistema ya no puede volver a enseñar datos inventados sin que alguien lo note.** `pnpm lint` suma la regla
  `sin-simulacion`, que rechaza tres cosas en el código: datos guardados en el almacenamiento del navegador (lo del
  negocio vive en el servidor), un PIN escrito en el código y listas de ejemplo o carpetas de demostración en las
  pantallas. Para quien usa el sistema no cambia nada: lo que ve sigue saliendo del servidor.

### Comprobado
- Cuatro pruebas nuevas demuestran que la regla muerde y que no salta con las opciones de una pantalla, una lista
  vacía ni un ejemplo calculado. El código actual pasa sin violaciones; la única excepción, con su motivo, es la
  vista (tabla o tarjetas) que Inventario recuerda en cada navegador.

## [0.50.1] — 2026-10-05 · Preparación del staging

Corrección entre pasos.

### Corregido
- **Inicio ya no enseña «Calling client.query() when the client is already executing a query».** Al leer los
  cumpleaños del día, Prisma pedía a la vez varias partes de la reserva por la misma conexión; la base lo aguantaba,
  pero avisaba de que la próxima versión de `pg` dejará de hacerlo, y en desarrollo salía como error. Ahora cada
  conexión atiende sus consultas de una en una, en todas las pantallas. Lo que se ve y lo que se cobra no cambia.

### Comprobado
- Prueba nueva contra la base (falla sin la corrección); `pnpm verify:db` en verde.

### Cambiado
- **La etapa que acompaña a la versión dice dónde va el proyecto**, no de qué etapa era el último paso entregado: tras
  B2-5 decía «Etapa 2 · Dinero», como si se volviera atrás. Las etapas de construcción están cerradas y lo que queda
  (T-2 y T-4) va antes del staging: «Preparación del staging».

## [0.50.0] — 2026-10-05 · Etapa 2 · Dinero

B2-5 (M-19): precios con el IVA incluido.

### Añadido
- **Ajustes → Sucursal → Precios: «IVA incluido» o «IVA aparte».** Con el IVA incluido, lo que dice el menú es lo que
  paga el cliente: tres alitas de $ 6,00 se cobran $ 18,00, no $ 20,88 ni $ 17,99. El IVA se saca de dentro (y así sale
  en la caja, el recibo y el ticket: «IVA 16 % (incluido)»). Vale para el catálogo, el parque y los cumpleaños.
  Apagado de fábrica; no se cambia con turnos abiertos, porque cambiaría lo que se cobra de cada cuenta.

### Comprobado
- `pnpm verify:db` en verde.

## [0.49.0] — 2026-10-05 · Etapa 3 · Caja

B3-7 (V-12, ADR-027): la carga de lo anotado en papel.

### Añadido
- **Carga desde papel.** Si caen internet y luz, el local sigue en formularios; al volver, la cajera abre en Caja →
  Papel una carga con la ventana del corte (desde cuándo hasta cuándo) y va cargando lo anotado: **entradas**
  (familia, niños con su pulsera y paquete), **salidas** (con su tiempo de más) y **cobros**, en la caja de siempre
  (cola de cuentas, ventas de mostrador, cobro mixto). Cada registro lleva **la hora real que se anotó**: con ella el
  tiempo de un niño, la tasa, el IVA, el precio y la existencia salen como entonces. La hora tiene que caer dentro del
  corte declarado, y el sistema guarda además cuándo se cargó. No se cuenta el aforo a lo que ya ocurrió.
- **Formularios impresos desde la app** (`Imprimir los formularios`): dos hojas A4, entradas y cobros, para guardar
  junto a la caja.
- **Supervisión lo revisa antes del Z.** La carga terminada espera en «Por revisar»: supervisión (o administración) la
  compara con las hojas y la da por revisada con su PIN; quien cargó no revisa su propia carga. Mientras haya una
  abierta o sin revisar, el turno no se sella (ni el relevo ni la jornada) y sale en los pendientes del cierre.
- **Se distingue.** Una venta cargada desde papel dice «Desde papel» en el turno, con su hora real y cuándo se cargó;
  Inicio avisa de las cargas por revisar y cuenta las ventas que vienen del papel; el turno, el día y el ticket del
  corte las dejan como una excepción (con quién la revisó); la auditoría lleva las dos horas.

### Cambiado
- Un permiso nuevo, «Revisar lo cargado desde papel» (supervisión y administración), ajustable por rol.

### Comprobado
- `pnpm verify:db` en verde. En el navegador, con la base de pruebas: una carga con corte de 3:00 a 4:30 pm, una
  entrada a las 3:10, su salida a las 3:50, el cobro a las 3:12 y una venta de mostrador a las 3:30; una hora fuera
  del corte rechazada, la caja de papel sin hora rechazada por el servidor, la revisión de supervisión con PIN, el
  aviso en Inicio, la marca en el turno y la lista de pendientes del cierre; las hojas en pantalla y en PDF; a
  1366×768, 1280×800 y 800×1280 sin desplazar el documento.

## [0.48.0] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

B10-2 (V-10): el día del cumpleaños, de punta a punta.

### Añadido
- **Empezar el cumpleaños.** En su día y con el anticipo cobrado, desde la agenda («Empezar el cumpleaños») o solo
  al entrar el primer invitado. Nace la cuenta del día con el saldo y lo que incluye el paquete (a $ 0: lo paga el
  paquete), que sale del estante; si falta existencia de algo incluido, no empieza y lo dice.
- **Entrada de invitados.** En la entrada, cuando hay cumpleaños hoy, «Entran a: Visita / Cumpleaños de …». Los
  invitados entran solo con su pulsera, sin paquete, representante ni cobro, a la cuenta del día; cuentan en el aforo
  y no entran más de los reservados (el resto entra como visita normal). Su tiempo llega hasta la hora de fin del
  evento; después, en sala, pasan a «en gracia» como aviso y no se cobra tiempo de más. No se les recarga tiempo ni
  se vinculan a una mesa. Un cumpleaños que ya terminó o con el saldo incobrable no se ofrece.
- **El saldo, en la caja.** La cuenta del día («Cumpleaños · N niños») se cobra cuando se quiera, con su IVA, como
  una mesa: cobrada, queda cobrada aunque haya invitados dentro. Hasta cobrarla sale en los pendientes del cierre;
  si no se va a cobrar, supervisión la da por incobrable (con los invitados ya fuera). La salida de un invitado no
  cobra nada ni lleva a la caja.
- **La agenda lo cuenta:** «En curso · saldo por cobrar», «Saldada» o «Saldo incobrable», con cuántos invitados
  entraron y cuántos siguen dentro.

### Comprobado
- `pnpm verify:db` en verde (81 de base, 461 de aplicación; dominio de caja 149). En el navegador, con la base de
  pruebas: reserva para esa noche, anticipo cobrado, «sin existencia» al empezar, empezado tras cargar la entrada,
  dos invitados por la entrada, la sala, la salida sin cargo y el saldo cobrado en la caja, a 1366×768, 800×1280 y
  390×844.

## [0.47.1] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

Corrección: el menú lateral con Ajustes desplegado.

### Corregido
- **Al desplegar Ajustes, desplaza solo su lista.** Antes desplazaba el menú entero y los módulos de operación se
  iban hacia arriba. Ahora la marca, los módulos de operación, la fila «Ajustes» y la persona se quedan a la vista;
  Ajustes ocupa el alto que queda y sus secciones desplazan por su cuenta. Con Ajustes plegado, la operación usa
  todo el alto (ya no se corta a medio menú) y Ajustes queda abajo. Barra de desplazamiento fina.

### Comprobado
- En el navegador a 1366×768 y 1366×950, con Ajustes plegado y desplegado (y Restaurante y Caja abiertos).

## [0.47.0] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

B10-1 (V-10, D-EVT): cumpleaños con reserva y anticipo.

### Añadido
- **Ajustes → Cumpleaños.** Administración carga los paquetes de cumpleaños: precio sin IVA, mínimo y máximo de
  invitados (nunca por encima del aforo) y lo que incluyen, del catálogo de productos. Junto a ellos, el anticipo que
  se cobra al reservar (50 % por defecto, configurable). Un paquete no se borra: se retira y puede volver a la venta.
- **Parque → Eventos: la agenda.** Los próximos tres meses agrupados por día, con el estado de cada reserva (anticipo
  por cobrar, confirmada o cancelada). «Nueva reserva» pide día, horario, paquete, invitados, cumpleañero y la familia
  por su teléfono (la del directorio aparece sola). No se reserva en una fecha pasada, fuera del mínimo y el máximo del
  paquete, ni si con los cumpleaños del mismo horario se pasa del aforo.
- **El anticipo, en la caja.** Al reservar nace la cuenta del evento con «Anticipo 50 % · Cumpleaños de …»; la caja la
  cobra con su IVA, con su venta y en su turno, y la reserva queda confirmada. Esa cuenta solo se cobra: no se le
  añaden ítems, no se regala, no se descuenta, no se divide ni se da por incobrable.
- **Cancelar.** Con el anticipo sin cobrar, la reserva se cancela desde la agenda y su cuenta sale de la caja y de los
  pendientes del cierre. Con el anticipo cobrado, devolverlo es anular su cobro en la caja (DEC-24) y después cancelar.
- **«Hoy hay un cumpleaños»** en la cabecera de Inicio y en la apertura del turno, con la hora y el enlace a la agenda.
- Permiso nuevo «Reservar y cancelar cumpleaños» (administración, supervisión y caja).

### Comprobado
- `pnpm verify:db` en verde (81 de base, 455 de aplicación; dominio del parque 54, de caja 145). En el navegador, con
  la base de pruebas: dos paquetes publicados, dos reservas, el anticipo cobrado en la caja ($ 87,00 con IVA) y la
  reserva confirmada, una cancelada, y los avisos de Inicio y de la apertura del turno, a 1366×768, 1280×800 y 800×1280.

## [0.46.1] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

Corrección: confirmar una tasa tecleándola otra vez.

### Corregido
- **Confirmar una tasa tecleando lo que se ve ya vale.** Las pantallas enseñan la tasa con dos decimales (pedido del
  cliente, v0.27.1), pero la que trae la API tiene más (866,5612) y el servidor comparaba lo tecleado con la tasa
  completa: quien tecleaba «866,56» recibía siempre «El valor tecleado no coincide con el capturado». Ahora vale la
  tasa como se ve o la completa; una tecla equivocada (866,65) sigue sin pasar, y lo que se confirma es la tasa
  completa. La hoja enseña además la tasa con todos sus decimales, para compararla con la del BCV.

### Comprobado
- Dominio de tasas (3 pruebas nuevas, 58) y `tasas.test-db.ts` (una nueva: 2300,5612 se confirma con «2300,56» y no
  con «2300,57»). `pnpm verify` en verde.

## [0.46.0] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

B4-6 (M-18): salir antes de tiempo.

### Añadido
- **En cuenta abierta, quien sale antes paga lo que usó.** La salida cobra el paquete más barato del tarifario con que
  entró que cubre el tiempo que estuvo (con la gracia), no el que eligió al entrar. Vale también para el pase libre, y
  el paquete y sus recargas se cambian juntos (1 hora + 1 hora y sale a los 70 min: se cobran 2 horas). Si se pasó de
  lo elegido, se cobra como siempre: el paquete y el tiempo de más.
- **El desglose lo explica.** La salida dice lo elegido, tachado, y lo que se cobra: «Paquete contratado · 1 hora
  $ 5,00 → Por uso: 30 minutos (25 min) $ 3,00». En la caja, la línea del paquete elegido sale tachada con «Cambiado
  por uso · estuvo 25 min» y debajo la del paquete que se cobra.
- **Si el niño está vinculado a una mesa**, el cambio se hace en la cuenta de la mesa, que se cobra con lo demás.
- **En prepago no se devuelve nada**, y la entrada lo avisa antes de cobrar («Si sale antes, no se devuelve»; la
  cuenta abierta dice «Al salir, por lo que usó»).

### Comprobado
- `pnpm verify:db` en verde (81 de base, 440 de aplicación; dominio del parque 42, de caja 140): la salida temprana,
  el pase libre, la gracia, el prepago, el tiempo de más, las recargas, la mesa y el reintento de la misma salida. En
  el navegador, con la base de pruebas: entrada en cuenta abierta con 1 hora, salida a los 2 minutos con 30 minutos
  ($ 3,00) y la caja con lo elegido tachado, a 1366×768, 1280×800 y 800×1280.

## [0.45.1] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

Corrección de B6-3: una mesa con un plato anulado se cobra bien.

### Corregido
- **La caja cobra una mesa con un plato anulado.** La caja contaba lo anulado como algo por cobrar y el servidor no:
  el cobro chocaba («la cuenta cambió») y la mesa no se podía cobrar. Ahora la caja cobra lo mismo que el servidor y
  enseña lo anulado tachado, con «Anulado en cocina» y quién lo autorizó.
- Al cobrar, lo anulado ya no se marca pagado (no se cobró), y una cuenta cobrada con platos anulados es válida.

### Comprobado
- `pnpm verify:db` en verde (81 de base, 433 de aplicación). En la caja, con la base de pruebas: una mesa con una
  comanda anulada y otra servida se cobró por lo servido ($ 2,90) y quedó cobrada, con lo anulado sin pagar.

## [0.45.0] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

B6-6: al anular lo que ya está en cocina, la cocina se entera en papel y el inventario cuadra (M-18).

### Añadido
- **El papel «ANULAR».** Al anular un pedido ya enviado, sale en la impresora de comandas un papel «ANULAR · NO
  PREPARAR» con la mesa, la comanda que corrige, quién lo autorizó, el motivo y los platos anulados. Si no sale, la
  tarjeta del pedido lo avisa en rojo («avisa a la cocina de palabra») y la barra lo cuenta entre los «sin imprimir»,
  con su «Reintentar». En Impresoras, el historial se filtra también por «Anulaciones».
- **¿La cocina ya lo preparó?** El diálogo de anular lo pregunta. **Todavía no:** lo que lleva existencia vuelve al
  inventario. **Sí:** sale como merma, con su costo y la misma autorización, y aparece en Inventario → salidas.

### Cambiado
- Un pedido se anula **de una vez**: todos sus platos en una sola operación, con un solo PIN y un solo papel. Antes,
  la tablet anulaba plato a plato. Platos de dos comandas distintas no se anulan juntos.
- **Sin impresora de comandas encendida no se anula** (como no se envía): la cocina no se enteraría.
- Una comanda anulada ya no ofrece «Volver a imprimir».

### Comprobado
- `pnpm verify:db` en verde (81 de base, 432 de aplicación). Navegador en la base de pruebas a 1366×768, 1280×800 y
  800×1280: anular sin preparar, el papel en cola, el aviso cuando no sale y «Liberar mesa» tras anular todo.

## [0.44.0] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

B6-5: una mesa sin nada que cobrar se libera desde la tablet (M-18).

### Añadido
- **Liberar mesa.** Si la familia se va sin pedir, o todo lo que pidió se anuló o se regaló, la tablet ofrece
  «Liberar mesa» en lugar de «Pide la cuenta». La libera el mesero sin PIN, con una confirmación, y queda registrado
  quién y cuándo. La mesa vuelve a estar libre para otra familia.
- La cuenta de esa mesa se cierra **«sin consumo»**: no va a la caja, no impide cerrar la jornada y no cuenta como
  incobrable. Lo anulado sigue en sus líneas, con su importe y su autorización: nada se borra.

### Corregido
- Una mesa a la que se le anulaba todo se quedaba abierta en $ 0: la caja no podía cobrarla y el cierre de la jornada
  la contaba como pendiente. «Pide la cuenta» tampoco manda ya a la caja una mesa sin nada que cobrar.

### Comprobado
- `pnpm verify:db` en verde (81 de base, 428 de aplicación). Navegador en la base de pruebas a 1366×768, 1280×800 y
  800×1280: una mesa con el pedido anulado, dos vacías y una con paquetes por cobrar (que no ofrece «Liberar»).

## [0.43.0] — 2026-10-03 · Etapa 6 · Restaurante en el servidor

B6-3: la cuenta de la mesa se mueve en el servidor. El dinero del parque ya no viaja por el bus: vincular, cargar
a mesa y anular un plato pasan por una sola operación con su comprobación.

### Añadido
- **Vincular pulseras a una mesa** (desde la mesa y desde la ficha del niño en el Monitor): lo pendiente de esos
  niños pasa a la cuenta de la mesa en la misma operación. La familia paga todo junto en caja.
- **Cargar la salida a una mesa**: en la salida, «A una mesa» elige la mesa del plano y lo pendiente de esos niños
  pasa a su cuenta, sin cobrar en ese momento. Con «En caja», como antes.
- **Anular un pedido enviado a cocina** (🔐 de administración o supervisión): con motivo (pedido equivocado, el cliente
  desistió, sin existencia u otro con explicación). El plato no se borra: queda anulado en la cuenta y entra en las
  excepciones del turno.

### Cambiado
- El aviso «mesa vinculada» sale del bus: el servidor es el que decide y el que lo guarda.

### Conocido
- La ocupación de cada mesa en el plano todavía la marca el bus, no la cuenta del servidor. Una mesa con cuenta
  abierta puede verse «Libre» en el plano; la cuenta sí existe y el servidor no duplica la mesa.
- La división por ítems (F6-12) no entra en este paso: va en uno propio.

### Comprobado
- `pnpm verify:db` en verde (423 pruebas de aplicación). Navegador en 1366×768, 1280×800 y 800×1280: sin desplazar la
  página y sin errores de consola.

## [0.42.0] — 2026-10-02 · Etapa 6 · Restaurante en el servidor

T-7: Roles y accesos, Usuarios, Dispositivos, Descuentos, Tasas de cambio y Tarifas y paquetes pasan al patrón de
Ajustes que estrenó Impresoras (M-17): resumen arriba, pestañas, hoja lateral o diálogo para lo irreversible, y las
listas que crecen por páginas en el servidor.

### Añadido
- **Dispositivos**: resumen (pendientes, aprobados, con sesión ahora, revocados) que filtra la lista; búsqueda por
  nombre o código de emparejamiento; la historia de un equipo en una hoja lateral; páginas en el servidor.
- **Tasas de cambio**: resumen con el USD y el USDT de hoy, la próxima tasa ya aplicada y cuántas esperan
  confirmación; el historial completo por páginas, filtrable por en qué quedó cada tasa (aplicada, por confirmar, no
  usada) y por par; cargar una tasa a mano pasa a una hoja lateral.
- **Tarifas y paquetes**: resumen (paquetes a la venta, retirados, reglas del parque, versión publicada); pestañas
  para los paquetes, las reglas y el historial de versiones; cada versión dice qué cambió respecto de la anterior
  (precios, duraciones, paquetes nuevos o retirados, reglas del parque), por páginas.
- **Descuentos**: resumen (vigentes, programados, familias VIP, tope de supervisión); vigentes y retirados en
  pestañas, cada uno con su filtro por tipo; el alta pasa a una hoja lateral y retirar pide confirmarlo.
- **Usuarios y permisos**: resumen (activas, con excepciones, que entran al panel, de baja) que filtra la lista;
  buscador y filtro por rol en una fila.
- **Roles y accesos**: resumen (ajustes del local, roles que entran al panel, acciones con autorización del rol
  elegido, total de roles); la matriz, quién entra al panel y los ajustes del local, en pestañas; cada ajuste se
  puede devolver a los valores de fábrica desde su propia pestaña.

### Cambiado
- Ninguna regla de negocio cambia: cada pantalla que ahora lee por páginas lo hace con un caso de uso nuevo
  (`dispositivos.pagina`, `tasas.pagina`, `tarifario.versiones`) con sus pruebas contra la base.

## [0.41.0] — 2026-10-02 · Etapa 6 · Restaurante en el servidor

B6-2: lo que pide el mesero sale en papel. La cocina trabaja con la comanda impresa (ADR-022).

### Añadido
- **La comanda impresa.** Al enviar un pedido desde la tablet, sus platos entran en la cuenta de la mesa y su
  comanda sale en la impresora de comandas, las dos cosas juntas o ninguna. La comanda lleva la mesa en grande, su
  número (continuo en el local), la hora, quién la pidió y cada plato con su cantidad y su nota, sin precios.
- **Si no sale, se ve.** Cada pedido de la mesa dice si su comanda se está imprimiendo, salió, no salió (con el
  motivo) o se descartó. Lo que no salió se avisa en rojo en la tablet del mesero, en «Atender», en la barra de la
  caja y en Inicio, y se vuelve a imprimir con un toque: si la cocina no la tenía, sale como la primera vez; si ya
  salió y se perdió el papel, sale una copia marcada «REIMPRESIÓN · NO PREPARAR DOS VECES».
- Inicio: la zona «Comandas» (las de hoy, imprimiéndose y las que no salieron) sustituye a «Cocina».

### Cambiado
- **Sin impresora de comandas encendida, el pedido no se envía** (y se dice dónde configurarla): ningún pedido se
  queda sin su comanda.
- El servidor pone el precio, el IVA y la existencia de lo pedido; si un precio cambió desde que la tablet lo
  enseñó, el pedido no se envía hasta revisarlo con la mesa. Reenviar el mismo pedido (se cortó la red) no lo pide
  dos veces.
- Quien entra con el rol de cocina oye que su puesto no usa el sistema, en vez de quedarse en blanco.

### Quitado
- La pantalla de cocina (KDS), con sus estados «en fuego», «listo» y «entregado» y los avisos de «plato listo»: la
  cocina trabaja con el papel (ADR-022). Los pedidos ya no viajan por el bus del navegador.

## [0.40.0] — 2026-10-02 · Etapa 6 · Restaurante en el servidor

B6-1: el plano del local y la carta del restaurante son del servidor. Ya no queda nada provisional en el navegador.

### Añadido
- **Plano del local, publicado y con versiones.** Ajustes → Plano del local edita un borrador y, al publicar, guarda
  una versión nueva con quién y cuándo, que llega en vivo al salón. Resumen arriba (mesas en el salón y sus sillas,
  ocupadas ahora, retiradas, versión publicada) y tres pestañas: *Plano* (el lienzo, como antes), *Mesas* (todas,
  también las retiradas, con «Devolver al salón») y *Local* (medidas del local y su estructura: paredes, puertas,
  parque, caja, cocina, barra). Si otra persona publica mientras editas, se avisa y publicar no la pisa.
- **Una mesa no se borra: se retira**, a la hora del servidor y conservando su número; con su cuenta abierta no se
  retira. Retirar mesas al publicar pide confirmarlo.
- **Carta y precios, nueva.** La carta es el catálogo de productos: el mesero ofrece lo que está a la venta y marcado
  «en la carta». Resumen (en la carta, fuera, agotados, precios programados) que filtra, filtros con su cuenta,
  búsqueda y «Limpiar filtros», tabla en el escritorio y tarjetas en tableta y teléfono, por páginas. Un interruptor
  saca o pone un plato en la carta (la caja lo sigue vendiendo); «Precio» programa el siguiente con su día; «Nuevo
  plato» da de alta un preparado o un producto que se cuenta, ya en la carta. Los servicios nacen fuera de la carta.
- La **toma de pedido** enseña cuántos quedan de lo que se cuenta y no deja pedir lo agotado; una carta vacía dice
  dónde se arma.
- Un local **sin plano** lo dice en Mesas, con el enlace a Ajustes → Plano del local, en vez de inventar mesas.

### Cambiado
- **Una mesa tiene una sola cuenta abierta**, y solo en una mesa del plano publicado: lo comprueba el servidor, también
  si dos tablets la abren a la vez. El número de la mesa en la cuenta lo pone el plano.
- **Lo que se pide en la mesa lleva su producto**: el servidor comprueba el precio de hoy, el IVA y la existencia, y lo
  que se cuenta sale del estante al pedirlo. Un pedido entra primero en la cuenta y solo si se acepta sale a cocina.
- Ajustes → Impresoras usa las piezas comunes del rediseño de Ajustes (resumen, filtros, páginas, confirmación); se ve
  igual.

### Quitado
- La carta y el plano de ejemplo guardados en el navegador, y la carpeta de datos provisionales (`src/demo`) con su
  regla de arquitectura: ya no queda nada provisional.

## [0.39.2] — 2026-10-01 · Etapa 5 · Tiempo real e impresión

Ajustes → Impresoras, reordenada (pedido del cliente): nada de listas sin fin, y lo que no salió se puede limpiar.

### Añadido
- **Resumen arriba**: impresoras encendidas, el agente, lo que no salió y lo que está en cola. Cada cifra lleva a
  su sitio («No salieron» abre la cola ya filtrada).
- **Tres pestañas**: *Impresoras* (tarjetas con prueba, encender/apagar, su historial, editar y retirar), *Cola e
  historial* y *Agente* (equipos vinculados, vincular otro y la descarga con sus pasos).
- **Historial por páginas** (10, 20 o 50), lo más reciente primero, con filtros por estado (todo, no salieron, en
  cola, impresos, descartados, con su cuenta), impresora y tipo, y «Limpiar filtros». Tabla en el escritorio;
  tarjetas en la tableta y el teléfono. Tocar un trabajo enseña el ticket tal como sale en el papel, con su
  estado, intentos y motivo.
- **Descartar**: lo que no salió (o espera) y ya no hace falta se descarta, uno a uno o todos los que no salieron
  de una vez (respetando el filtro de impresora y tipo). No se imprime y la alerta roja se apaga; **no se borra**:
  queda en el historial como «Descartado», con quién lo hizo, y en la auditoría. También desde la alerta de la
  barra y de Inicio. Lo que se está imprimiendo en ese momento no se puede descartar.
- Alta y edición de una impresora en una **hoja lateral**; retirar una impresora o un agente pide confirmarlo.

## [0.39.1] — 2026-10-01 · Etapa 5 · Tiempo real e impresión

El agente de impresión, listo para instalar en la laptop de caja (adelanto de B7-3, pedido del cliente).

### Añadido
- **`l2-impresion.exe`**: un solo ejecutable, sin Node ni el proyecto. Doble clic abre el asistente: se pega la
  dirección del servidor y el código de Ajustes → Impresoras, pide permiso de administrador una vez, comprueba el
  servidor, se vincula y queda instalado como **tarea de Windows**: arranca sola al encender la laptop, sin
  ventana, y se vuelve a levantar si se cae. Volver a abrirlo enseña su estado y deja imprimir una prueba,
  vincularlo otra vez o desinstalarlo. Registro en `C:\ProgramData\L2 Control\Impresion\agente.log`.
- **«Descargar el agente»** en Ajustes → Impresoras, con su versión y su huella SHA-256; el código de vinculación
  sale con lo que hay que pegar y un botón para copiarlo.
- **«N en espera»** (ámbar) en la barra y en Inicio cuando algo lleva más de un minuto sin que el agente lo tome
  (laptop apagada, sin internet o el agente parado).
- `pnpm agente:empaquetar` construye el ejecutable; `pnpm impresora:falsa` levanta una impresora falsa para
  probar sin la de verdad.

### Corregido
- El agente volvía a conectarse solo tras un corte de red, pero no si el servidor lo rechazaba un momento al
  entrar (por ejemplo, con la base caída): ahora lo reintenta siempre.
- Apagar o retirar una impresora deja en «no salió», con su motivo, lo que esperaba en ella (al apagarla, salvo
  las pruebas), en vez de dejarlo esperando para siempre.

## [0.39.0] — 2026-10-01 · Etapa 5 · Tiempo real e impresión

B5-2 · La impresión en papel: recibo, ticket del corte y la cola con confirmación.

### Añadido
- **Ajustes → Impresoras**: la impresora térmica del local (IP de la red del local, puerto, 58 u 80 mm y para
  qué sirve: recibos y cortes, comandas). Nace apagada: se imprime una prueba y se enciende. Una sola encendida
  para cada papel; para encenderla se confirma que está en la red de los equipos y con IP fija.
- **El agente de impresión** para la laptop de caja (`l2-impresion`): se vincula una vez con un código de 10
  minutos que da el panel, se conecta al servidor por su cuenta y manda cada trabajo a la impresora. Retirarlo
  desde el panel lo desconecta en el acto.
- **El recibo sale en papel** desde la caja y desde Turno: original y copias, a la venezolana, con el
  descuento, el IVA y la tasa del cobro. El diálogo dice si está en cola, si se imprimió o por qué no salió.
- **El ticket del corte Z** sale solo al sellar el turno, con lo vendido, por medio, la gaveta, el arqueo, la
  firma y las excepciones; se reimprime desde la pantalla del Z.
- **Lo que no sale en papel se avisa**: «N sin imprimir» en la barra de las estaciones y en Inicio, con su
  motivo (sin papel, la impresora no responde) y «Reintentar». Hasta cinco intentos solos antes de avisar.
- La apertura del turno avisa si no hay impresora de recibos encendida.

### Cambiado
- Imprimir ya no abre el diálogo del navegador: el trabajo va a la impresora del local por el agente.

## [0.38.0] — 2026-10-01 · Etapa 3 · Caja

B3-6 · Descuentos configurables.

### Añadido
- **Ajustes → Descuentos**: administración crea los descuentos que la caja puede aplicar, **por medio de pago**
  (p. ej. pagando todo en efectivo en dólares o por Zelle), **VIP** y **manuales**; un porcentaje o un monto, sobre
  toda la cuenta, el parque, el restaurante o unas categorías, con su vigencia por días. Un descuento no se edita
  ni se borra: se retira, y lo cobrado con él sigue diciendo cuál fue.
- **Familias VIP**: en Parque → Representantes, administración marca a una familia con un descuento VIP.
- **En la caja, «Descuento · Aplicar»**: la caja enseña los que aplican a la cuenta, el mayor primero, con lo que
  descuenta cada uno. Uno por cuenta, y siempre **antes del IVA**. El de medio de pago pide el PIN de supervisión y
  que toda la cuenta se cobre por ese medio (la caja se pone sola en ese medio); el manual, un motivo y el PIN de
  supervisión, que llega hasta el **tope del 20 %** (por encima lo autoriza administración); el VIP no pide PIN; y
  administración aplica el que quiera con su PIN y un motivo escrito.
- El descuento sale en el **recibo**, en las **excepciones del turno** y en las del día en Inicio, con quién lo
  autorizó.
- **Tope de supervisión** configurable en Ajustes → Descuentos.

### Cambiado
- Con el IGTF al 0 % (V-13), la caja ya no enseña «+0 % IGTF» en los medios ni «+ IGTF $ 0,00» en los pagos.
- Una cuenta con descuento no se divide: se quita el descuento para dividirla.

## [0.37.0] — 2026-09-30 · Etapa 9 · Inventario

B9-6 · Identificación, tipos y la vista del inventario. Se cierra el Inventario.

### Añadido
- **Productos enseña el stock primero**: arriba, cuántos están agotados, cuántos bajo su mínimo, las unidades y el
  valor del inventario al costo (cada cifra filtra); debajo, la **tabla** (stock y estado, producto, SKU y código,
  categoría, mínimo, costo, precio y margen), ordenada por lo que exige atención, o las **tarjetas**, con una barra de
  nivel. Se busca por nombre, SKU o código, y se filtra por categoría, estado y apartados.
- **Cada producto tiene su SKU** (BEB-0001), que pone el sistema y no cambia, su **código de barras** y su
  **presentación** («Lata 355 ml»).
- **Tres tipos**: Producto (se cuenta), Preparado (se hace al momento) y Servicio (alquiler, paquetes).
- **La entrada de mercancía da de alta lo que llega por primera vez**, con una ficha corta (nombre, categoría,
  presentación, código, precio e IVA): nace a la venta con su stock y su costo.
- **El lector de códigos**: en la caja vende el producto; en una entrada suma un bulto o abre la ficha del producto
  nuevo; en el conteo lleva a su casilla; en Productos abre su ficha. Un código mal leído (el dígito de control de un
  EAN o un UPC no cuadra) se rechaza.

### Cambiado
- «Lleva existencia» ya no es una casilla: lo dice el tipo. Lo que la llevaba es un Producto; lo demás, un Preparado.
- Lo que tiene stock no cambia de tipo hasta sacarlo o contarlo.

## [0.36.0] — 2026-09-30 · Etapa 9 · Inventario

B9-5 · Mínimos y alertas de stock crítico.

### Añadido
- **El stock mínimo de cada producto**, su punto de reorden, en la ficha del producto. Lo fija administración o
  supervisión.
- **El estado del stock**: agotado, bajo mínimo o bien, con color, icono y texto.
- **Inicio avisa** de lo que hay que reponer («Inventario: 3 agotados · 2 bajo mínimo») y lleva al inventario.

### Corregido
- El corte Z enseña las cuentas incobrables en el orden en que se marcaron (antes, cada vez de una forma).

## [0.35.0] — 2026-09-30 · Etapa 9 · Inventario

B9-4 · Salidas y ajustes con motivo y autorización, y conteo físico.

### Añadido
- **Inventario → Salidas y conteo.** Lo que sale sin venderse se registra con su motivo: merma o daño, consumo
  interno, regalo o devolución al proveedor. Sale al costo promedio y queda con quién lo hizo y quién lo autorizó.
- **El conteo físico**: se escribe lo que hay en el estante y la existencia queda igual a lo contado; lo que falta
  sale y lo que sobra entra, al costo. Un conteo que cuadra también queda registrado.
- Si se vende algo mientras se cuenta, el conteo no ajusta a ciegas: avisa de lo que dice el sistema ahora para
  revisarlo y volver a registrarlo.
- Las dos cosas con autorización: administración confirma con su PIN y supervisión pide el de administración.

### Cambiado
- Una entrada mal cargada ya tiene arreglo: una salida (devolución al proveedor) o un conteo.

## [0.34.0] — 2026-09-30 · Etapa 9 · Inventario

B9-3 · Entradas de mercancía y costo promedio ponderado.

### Añadido
- **Inventario → Entradas de mercancía.** Lo que llega se carga de una vez: una compra a un proveedor (con su
  factura, si la hay) o una reposición del depósito, con uno o varios productos. Cada línea dice cuántos bultos de
  cuántas unidades y lo que costó el bulto, en dólares: se compra la caja de 24 y se vende la unidad. La pantalla
  propone las unidades del último bulto y dice lo que entra, lo que cuesta cada unidad y el promedio de hoy.
- **El costo promedio ponderado de cada producto**, como lo calcula el contador, y su **margen** sobre el precio,
  en la ficha del producto, que además dice cuántas quedan y tiene «Cargar entrada».
- Un permiso nuevo, «Cargar entradas de mercancía» (administración y supervisión), que se ajusta en Roles y accesos.
- Cada entrada queda con quién la recibió y cuándo, y no se edita ni se borra.

### Cambiado
- Lo que llega vuelve a estar a la venta en la caja en el acto, en todos los equipos.
- «Compras y mermas» se parte en «Entradas de mercancía» y «Salidas y conteo» (llega con el paso siguiente).

## [0.33.0] — 2026-09-30 · Etapa 9 · Inventario

B9-2 · Existencias en tiempo real, de solo-agregar.

### Añadido
- **Lo que no hay no se vende** (ADR-023). Un producto que lleva existencia sale del estante cuando entra en una
  cuenta (la venta de mostrador, la mesa, la cuenta de la familia) y vuelve cuando se quita sin pagar. Sin
  existencia, la cuenta no se guarda y la caja dice de qué producto y cuántas quedan.
- La carta de la caja dice **«Quedan N»** de cada producto que lleva existencia y enseña lo **«Agotado»** sin dejar
  tocarlo; Inventario → Productos dice cuántas quedan. Todo en vivo en todos los equipos.
- Cada movimiento queda guardado con la cuenta que lo causó y quién: la existencia es su suma, y no se edita.

### Cambiado
- Lo que lleva existencia sale «Agotado» hasta que se carga su primera entrada de mercancía.

## [0.32.0] — 2026-09-30 · Etapa 4 · Parque

B4-5 · La monitora en el teléfono y las pulseras de un solo uso. Se cierra el Parque.

### Añadido
- **La cámara lee las pulseras** (QR y código de barras) en la entrada, la sala y la salida: con el lector
  del navegador o, si el teléfono no lo trae, con uno de respaldo que se carga solo cuando hace falta. El
  lector Bluetooth en modo teclado sigue valiendo igual.
- **Una pulsera sirve para una sola visita.** Una ya usada se rechaza al pasarla («ya se usó en otra
  visita: pon una nueva») y el servidor no deja registrarla.
- **La serie de las pulseras** en Ajustes → Sucursal: prefijo y longitud, sin fijar hasta el primer lote.
  Con la serie fijada, un código de otra serie (una pulsera ajena, una lectura torcida) no entra, y la
  pantalla dice cómo son las del local.

### Cambiado
- **Entrada, sala y salida en el teléfono** sin desplazar la página: la entrada y la salida van en dos
  pasos (pulseras y luego la familia o la liquidación, con «← Pulseras» siempre a la vista), los paquetes
  de cada niño en 2×2 y la sala en baldosas de un renglón.
- Fuera la pantalla de pared del monitor (DEC-18): la sala se bloquea por inactividad como las demás.
- Un niño sin nombre ya no sale en la sala con su pulsera repetida: su tarjeta dice «Falta nombre».
- «Turno sin abrir» solo lo ve quien puede abrir el turno.

## [0.31.0] — 2026-09-30 · Etapa 4 · Parque

B4-4 · Los ajustes de la sucursal, en el servidor.

### Añadido
- **Ajustes → Sucursal guarda en el servidor**: el nombre del local, su RIF, dirección y teléfono, el
  horario, el formato de hora, la zona horaria, el residuo que la caja puede quedarse, el **umbral del
  arqueo** ($ 1,00) y las **horas tras las que una estancia pasa a revisar** (8). Se publican enteros,
  administración confirma su identidad y todas las pantallas cambian a la vez en menos de 2 s.
- Si otra persona publica mientras se edita, la pantalla lo avisa y el servidor no deja pisarla.
- El recibo lleva el nombre del local y, si ya se declararon, su RIF y su dirección.

### Cambiado
- **Toda hora y fecha sale con el formato y la zona del local**, no con los del navegador: el reloj del
  acceso y los historiales de Usuarios, Accesos y Mesas estaban fijos en 24 h, y la caja, las ventas del
  turno, el recibo y la sala usaban la zona del aparato.
- La caja, el corte Z y la sala usan los umbrales del local en vez de valores escritos en el código. Un
  arqueo guarda con qué umbral se decidió quién firma: cambiarlo después no altera lo ya contado.
- La zona horaria no se cambia con un turno abierto ni con niños en sala (decide el día de negocio).
- La sala vuelve a leer sola, justo en el momento en que una estancia pasa a revisar, sin sondear.
- Sin ajustes publicados rigen los de fábrica (los de antes); el RIF, la dirección y el horario quedan
  «sin declarar» en vez de un RIF inventado.

## [0.30.1] — 2026-09-29 · Etapa 4 · Parque

### Cambiado
- **El IVA reducido (8 %) ya no aparece**: el local no lo usa (decisión del cliente). Al crear o editar
  un producto solo se elige «IVA general» o «Exento de IVA», y el servidor rechaza el reducido.
  Ajustes → Impuestos enseña el IVA general, el IGTF y el exento, y la caja ya no exige el reducido
  para cobrar. El cálculo sigue dentro por si algún día hiciera falta, y lo ya vendido no cambia.
- Un local nuevo arranca con el IVA general al 16 % y el IGTF al 0 % (V-13).

## [0.30.0] — 2026-09-29 · Etapa 4 · Parque

B5-1 · Todo en tiempo real.

### Añadido
- **Lo que pasa en un equipo se ve en los demás en menos de 2 segundos**, sin recargar: la sala, las
  cuentas y la cola de la caja, el turno y lo que falta para cerrar la jornada, las ventas, la tasa, los
  medios de pago, el catálogo, los impuestos, el tarifario, los equipos y las personas. Una entrada en la
  taquilla aparece en la sala de otro equipo, y una salida pone la cuenta en la cola de la caja al momento.
- **Inicio sabe quién está en cada puesto** aunque esté en otro aparato, y con el turno abierto avisa
  «Sin nadie en caja» (o en taquilla o salón). La cocina ya no cuenta: trabaja con la comanda impresa.
- **La barra dice si hay conexión en vivo.** Sin ella («Sin conexión en vivo») se sigue trabajando, lo de
  los demás equipos se ve cada 30 s, y al volver todo se pone al día solo.
- Las mesas y los pedidos que se cuentan el salón y la caja viajan por el servidor, no solo entre
  pestañas de un mismo navegador.

### Cambiado
- **La tasa del BCV se aplica siempre**, aunque salte mucho respecto de la vigente (decisión del cliente,
  V-14). Siguen esperando a una persona la que solo dio DolarApi y la primera del local.
- La consulta automática al BCV la hace un proceso aparte (el worker), no el servidor de páginas.
- Las pantallas ya no preguntan al servidor cada 5 o 60 segundos: el servidor avisa cuando algo cambia.

## [0.29.1] — 2026-09-29 · Etapa 4 · Parque

### Corregido
- El servidor ya no avisa «Calling client.query() when the client is already executing a
  query» (lo enseñaba el aviso de Next en el navegador): dentro de una transacción se lanzaban
  consultas a la vez. Era un aviso; con la próxima versión de la biblioteca de PostgreSQL, sería un
  error. `pnpm lint` impide volver a hacerlo con `Promise.all`.

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
