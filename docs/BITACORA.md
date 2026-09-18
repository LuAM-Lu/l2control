# Bitácora

> Qué se hizo, cuándo y **por qué**, en orden cronológico. El estado actual de cada tarea no está
> aquí: está en [PROGRESO.md](PROGRESO.md). Esta página es para entender cómo se llegó a él; el
> detalle de cada cambio, en el historial de git.
>
> Se escribe añadiendo al final. Una entrada no se reescribe después: si algo cambió, se añade otra
> que lo diga — la misma regla que el sistema aplica al dinero.

## Definido el 2026-09-09: arquitectura de aplicación

El cliente señaló que las pantallas eran islas sin cáscara, y tenía razón. §9.10 del plan lo
resuelve, y siete decisiones nuevas (DEC-13 a DEC-18 y DEC-20) lo fijan:

- **Dos mundos, no uno.** Back-office con barra lateral; estaciones a pantalla completa sin
  navegación. Meterle un menú al KDS o al monitor de pared los empeora.
- **Una sola caja** para todo el local, pero cada cobro registra desde qué punto se hizo.
- **El mesero no toca dinero**: lleva la cuenta y el cliente paga en caja. Eso elimina la entrega
  de efectivo, el arqueo por persona y los controles antifraude sobre meseros.
- **El rol es la base; las excepciones por persona son un dato auditable.** Extiende §7.3.
- **Aparatos del puesto, compartidos**: cambio rápido de usuario y bloqueo por inactividad.
- **Sin capa de plataforma**: no hay planes ni facturación de suscripción. Se mantiene el
  , que cuesta poco ahora y es carísimo después.

Tareas nuevas: F1-17, F1-18, F2-11, F2-12, F4-01b y F9-00. **F1-17 y F1-18 ya están hechas**:
la cáscara del back-office existe, las seis superficies viven en el grupo de rutas que les toca, y
las pantallas dejaron de repetir el contexto (turno, tasa, conexión, usuario), que ahora vive una
sola vez en la barra de estación.

~~**Sigue abierta DEC-19**~~ — cerrada el 2026-09-09: **KDS en tablet + comanda impresa**. Un KDS es una página web y corre en una tablet barata, así que no hace falta un tercer equipo fijo.

Nota anterior: con los cuatro aparatos repartidos, la cocina se queda sin pantalla.
No bloquea nada hoy —el restaurante está fuera de la Ruta A— pero hay que responderla antes de F6.

## Diseño responsive y movimiento — comprobado, no supuesto

Se cerró el 2026-09-09 lo que el cliente señaló: contenedores inconsistentes, barra de estación
mal resuelta y sin transiciones.

| Qué | Cómo se comprobó |
|---|---|
| Un solo sistema de anchos (`Container`) | Antes convivían 1100, 1180, 1400, 1500 y 1600 px elegidos pantalla a pantalla. Ahora cuatro anchos con un trabajo cada uno: `prosa` 68ch, `panel` 1180, `operacion` 1440, `muro` 1680 |
| Sin desplazamiento horizontal | **48 combinaciones** —8 rutas × 320, 375, 414, 768, 1024 y 1440 px— medidas con navegador real (`scrollWidth − clientWidth`). Cero desbordes |
| Objetivos táctiles de la barra (§8.4) | Medidos en el navegador: todo lo pulsable ≥ 48 px. Antes las pestañas medían 28, un tamaño de ratón en una pantalla que se opera con el dedo |
| Transición de entrada | `.l2-entra` con los tokens de movimiento compartidos. **Nada del estado depende de que termine**: el estado base ya es el final, así que si la animación no corre —movimiento reducido, navegación encadenada— la pantalla se ve igual |

Lo que destapó la medición y no se veía a ojo: `/turno` desbordaba 62 px a 320 px porque los
elementos de una rejilla tienen `min-width: auto` y no encogen. Se arregló en la raíz —`min-w-0`
en las columnas—, no ensanchando la ventana de prueba.

Queda por hacer en esta línea: estados de carga y esqueletos (§8.6), y repetir la medición cada
vez que entre una pantalla nueva. Es un script, no una revisión a ojo.

## Organización de páginas y navegación — 2026-09-09

El back-office pasa a colgar de `/panel` y la navegación se adapta al dispositivo.

**Rutas.** Las estaciones conservan URL corta en la raíz —`/monitor`, `/entrada`, `/salida`,
`/caja`, `/turno`, `/acceso`— porque se teclean y se marcan en equipos fijos. El back-office vive
bajo `/panel`, con una página por módulo (`/panel/parque`) y una por sección sin construir
(`/panel/restaurante/mesas`). Dos rutas dinámicas sirven las veinte: un archivo por módulo serían
seis copias del mismo código esperando a desincronizarse.

**Una sola fuente.** `features/shell/navigation.ts` describe los seis módulos y sus secciones. De
ahí salen el menú, la página de cada módulo y las migas. Cada sección declara **la acción** que la
abre, no una lista de roles.

**Nada de enlaces muertos.** Las secciones sin construir tienen su página y dicen qué harán, qué
tarea del plan las cubre y qué hace falta antes. Es el cuarto estado que §8.6 no nombraba: además
de carga, vacío y error, «todavía no existe».

**Navegación por tamaño.** ≥1280 px barra lateral de 256 px con secciones desplegables; 768–1279 px
riel de 72 px solo iconos, donde tocar un módulo lleva a su página; <768 px barra superior con
cajón. Antes, **entre 768 y 1279 px no había navegación ninguna** —justo el ancho de la tablet del
local—, solo un botón redondo flotando sobre el contenido.

Comprobado en navegador: 17 rutas × 6 anchos (320, 375, 414, 768, 1024, 1440) sin desplazamiento
horizontal, y todo lo pulsable de las barras ≥ 44 px.

## La raíz reparte, no explica — 2026-09-09

`/` era una página de marketing que contaba el sistema con una línea de tiempo. Se eliminó: un
punto de venta no tiene página de bienvenida. Ahora `/` redirige al acceso por PIN, y **cada rol
entra directamente a su puesto** (§7.3): la cajera a caja, la monitora a la sala, la supervisora
al panel. Identificarse y luego tener que buscar dónde se trabaja eran dos pasos donde debe haber
uno. La cocina, que aún no tiene pantalla (F6-05), entra a la sección que lo explica.

Queda pendiente de F2-12: cuando exista sesión de dispositivo, `/` comprobará si ya hay una
abierta y saltará a su superficie sin volver a pedir el PIN.

El inicio del back-office se rehízo con el mismo criterio que la caja —densidad y jerarquía—:
cuatro cifras del día arriba con su comparación contra el mismo día de la semana pasada, la
atención en tarjetas compactas, y el detalle abajo. Las barras de «entró hoy» comparan **solo
dentro de cada moneda**: mezclar bolívares y dólares en una barra daría una imagen falsa.

## Pase de diseño de las estaciones — 2026-09-11

El mismo criterio de densidad y jerarquía que se aplicó a caja, llevado al resto.

| Pantalla | Qué estaba mal | Qué se hizo |
|---|---|---|
| Turno | El arqueo —la tarea— compartía ancho con información de solo lectura; campos de billetes de tamaño ratón; los cortes bajo el pliegue | Arqueo en la columna ancha con contador táctil de 48 px y subtotal por fila; cuadre y cortes al lado, clavados; el libro debajo |
| Entrada y salida | Estado vacío pequeño y media pantalla en negro | `ScanPrompt`: la espera ocupa el hueco, dice la acción en grande y enseña el recorrido en pasos |
| Acceso | Tarjeta pequeña flotando en una pantalla vacía | Pantalla de bloqueo: hora en grande, dispositivo autorizado y personas con objetivos de toque de 96 px |
| Monitor | Título ocupando el sitio de las cifras de sala | Tres contadores grandes, color + icono + texto, que vuelven a neutro en cero |

**Arreglado en la raíz, no por pantalla.** Un botón de color deshabilitado se veía como un amarillo
o un rojo apagado —parece roto—. Se había parcheado en caja; ahora lo resuelve `Button` una vez, y
entrada, salida y turno lo heredan.

**Componentes nuevos, reutilizables.** `Stepper` y `ScanPrompt` en `@l2/ui`, sin conocer el
dominio. `EntradasPorMedio` y `ExcepcionesTurno` en `features/cash`: inicio y turno pintaban la
misma información de dos formas distintas.

**Un fallo de comportamiento destapado.** El turno avisaba de «diferencia en el arqueo» con la
gaveta sin tocar: todo lo esperado aparecía como faltante antes de contar un billete. Ahora la
diferencia solo se señala en lo ya contado, y sin conteo pide contar antes del corte Z.

Comprobado en navegador: el arqueo cuadra de punta a punta (3×20 + 1×10 = 70,00 contra 70,58 →
«Falta 0,58», con el teórico oculto hasta contar), y 15 rutas × 6 anchos sin desplazamiento
horizontal.

## F4-01b · Punto de cobro — 2026-09-11

DEC-13 eligió una sola caja: un turno, una gaveta, un arqueo. El precio era que un faltante no se
podía atribuir. Ahora **cada movimiento del turno declara su origen** —taquilla, mostrador o el
propio turno, para el fondo inicial y las salidas de caja— y el cuadre lo desglosa.

- **Fail-closed.** Un cobro, vuelto o propina sin punto no se totaliza: el dominio lo rechaza. Se
  comprueba el valor y no solo el tipo, porque el dato puede llegar de una migración.
- **Dos cifras por punto.** Lo cobrado, por cualquier medio; y el efectivo que ese punto aportó a la
  gaveta, descontado el vuelto que se dio ahí. Es la segunda la que explica un faltante.
- **La propiedad que lo hace útil**, con prueba: fondo y salidas del turno más el efectivo de cada
  punto es exactamente lo esperado en la gaveta. Si no se cumpliera, el desglose sería una tabla
  más y no una herramienta para encontrar una diferencia.
- El punto **sale del dispositivo**, no de una elección en cada cobro: el aparato es del puesto
  (DEC-17). Caja lo muestra en su cabecera.

La regla nueva mordió al entrar: una prueba existente creaba cobros sin punto y el dominio los
rechazó. Queda parcial hasta que el backend guarde el punto con cada cobro. Pruebas de caja: 29 → 35.

## F2-11 · Permisos por persona — 2026-09-11

DEC-15: el rol es la base y la excepción es un dato. «Marisol es cajera, pero además puede
confirmar la tasa.» Se modela como concesiones y revocaciones sobre la persona, nunca como un rol
nuevo inventado para una sola.

**Dominio.** `can()` evalúa en este orden: sucursal → acción conocida → revocación → concesión →
matriz. De ese orden salen las garantías, cada una con su prueba:

- **Nunca amplía la sucursal**: la sede se comprueba antes que cualquier excepción.
- **No inventa acciones**: una concesión sobre una acción que la matriz no conoce no la crea.
- **Ante la duda, niega**: si una acción está concedida y revocada a la vez, gana la revocación.
- **No altera a quien no las tiene** (propiedad): sin excepciones, cada celda es la de la matriz.

`explainPermission()` dice de dónde sale cada permiso —rol, concesión o revocación— y `can` la usa
por dentro, así que la regla está escrita una vez. Pruebas de identidad: 60 → 68.

**Contrato primero.** La excepción no tiene campo de sucursal y el esquema la rechaza si lo trae: una
excepción que no puede nombrar una sede no puede ampliarla. El motivo es obligatorio y con
contenido. El comando para concederla no admite autor ni hora: los pone el servidor, o un cliente
podría atribuirle el cambio a otra persona. Pruebas de contratos: 17 → 29.

**Pantalla** `/panel/personas/usuarios`. El rol y las excepciones aparecen por separado —«Además: …»,
«Sin: …»—, cada excepción con quién la concedió, cuándo y por qué, y los permisos efectivos con lo
que daría el rol tachado al lado. Registrar una excepción valida con el mismo contrato que usará el
servidor, y bloquea las que no cambian nada: solo ensuciarían la auditoría.

Comprobado en navegador: revocar a Ana la reimpresión, rechazo del motivo corto y bloqueo de una
concesión sin efecto. Queda parcial hasta que el backend guarde las excepciones y su auditoría.

## F2-12 · Sesión en dispositivo compartido — 2026-09-11

DEC-17: los aparatos son del puesto, no de la persona. Los tres criterios, comprobados en navegador:

| Criterio | Cómo quedó |
|---|---|
| Bloqueo por inactividad configurable | Tres minutos en las estaciones, con treinta segundos de aviso y la cuenta atrás en palabras. Configurable por superficie: **el monitor de pared no se bloquea nunca**, porque se mira y no se toca |
| Cambio de usuario a un toque | El botón de la barra de estación lleva al acceso por PIN |
| El corte Z devuelve el aparato al acceso | Tras sellar, cuenta atrás de cinco segundos para leer la confirmación y botón para irse ya |

- **La regla es del dominio**, pura, con el instante como argumento (ADR-010), y con ocho pruebas.
  Pruebas de identidad: 68 → 76.
- **Una política mal escrita se rechaza**, nunca se lee como «no bloquear»: dejaría el puesto
  abierto por un error de configuración. Y «sin bloqueo» es una palabra, no un `null`.
- **Solo tocar, teclear o desplazar cuenta como actividad.** Mover el ratón por encima no: en un
  mostrador, alguien que pasa rozándolo no está atendiendo el puesto.
- `?inactividad=N` acorta el plazo para una demo o una prueba. **Solo puede acortarlo**: un
  parámetro que lo alargara sería una forma trivial de desactivarlo.

Queda parcial: la política vendrá de la configuración de la sucursal, y la sesión real del
dispositivo, del backend.

## Documentos, capas y transiciones — 2026-09-11

`PROGRESO` volvió a ser un estado y la narrativa pasó a esta bitácora. El §1 del plan fue al
archivo. Se añadieron `Sheet` y `Dialog` sobre el `<dialog>` nativo, y las transiciones pasaron a
tener dirección: avanzar entra desde la derecha, volver desde la izquierda, mismo nivel es un
fundido. La dirección se conserva al cruzar entre la cáscara del panel y la de una estación, que
desmonta la transición: la ruta anterior se guarda fuera de React.

## La cuenta de la familia (DEC-21) — 2026-09-11

El cliente decidió que una familia paga de una de dos formas, elegida en cada entrada. La cuenta
es lo que enlaza entrada, salida y caja; sus reglas son invariantes del contrato, no de cada
pantalla. La caja pasó a ser una cola de cuentas por cobrar en maestro-detalle. Los cinco flujos
—prepago, cuenta abierta, salida sin cargo, excedente y cuenta entera— se probaron de punta a punta
en navegador.

## Sin scroll de página en parque y caja — 2026-09-11

Medido en región interna, porque con la estructura fija la página ya no desplaza nunca y medirla
no dice nada. A 1366×768 caben las cinco estaciones: turno bajó de +644 px a cero con pestañas
(divulgación progresiva) y el monitor de +116 a cero. Con la sala llena, el monitor pasa a
baldosas compactas; la ficha de cada niño es una hoja que enlaza con su salida.

## El lector perdía el primer carácter al navegar — 2026-09-11

Lo destapó la prueba de flujos: tras volver de caja a entrada, «AK-0902» se leyó «K-0902». Se
comprobó antes de corregir: sin pausa tras navegar se perdía; con 300 ms, no. La causa era que
cada pantalla instalaba su oyente al montarse, y en esa ventana se escapaba la primera tecla. Lo
grave es que el código truncado también era válido, así que nada avisaba. Ahora hay un solo
oyente para toda la aplicación que no se quita al navegar, y una lectura que termina durante el
cambio de pantalla espera hasta 1,5 s a la siguiente.

## Flujos del local — 2026-09-11

Las visitas describieron cómo se mueve una familia de dos adultos y dos niños, el mesero, la
cocina y la caja, y que la administración quiere verlo todo en vivo. Se escribió
[FLUJOS.md](FLUJOS.md): cinco flujos paso a paso con sus eventos en tiempo real, un solo concepto de
cuenta para familia y mesa, veinticinco escenarios de orden, pico y caos, y un simulador como base
para construir el frontend. Casi todo ya estaba en el plan como R1–R7 y F6; lo nuevo es la zona de
personas conectadas. Queda la decisión de alcance D1: el restaurante está fuera de la Ruta A.

## Alcance del restaurante y el simulador — 2026-09-11

El cliente respondió a D1: la interfaz de mesas, mesero, cocina y panel en vivo se construye ya,
sobre un simulador, y su backend llega después del piloto del parque, sin mover la salida en vivo
del parque (DEC-22). Primer paso hecho: el catálogo de eventos de FLUJOS §4 es ahora un contrato
Zod (F1-20) y el simulador (F1-19) reproduce tres tardes —O1 tranquila, P1 sábado a las cuatro,
X3 impresora sin papel— a ×1, ×10 o ×60. El estado del local es una función pura de los eventos,
así que varias pestañas siguen la misma operación sin enviarse eventos: la que lleva el reloj solo
dice por dónde va, y una pestaña abierta tarde se pone al día sola. El monitor de sala ya lo
consume con el mismo traductor que usa para los datos del servidor.

Dos hallazgos por el camino. El cronómetro de cada tarjeta medía una sola vez el desfase con el
servidor y después ignoraba las horas nuevas: con datos en vivo se habría quedado atrás. Ahora se
remide con cada instante nuevo. Y un script de invariantes (aforo, todo cerrado al final,
idempotencia, ningún evento fuera de la tarde) encontró que el escenario X3 dejaba a una niña
dentro y liberaba una mesa después del final; se corrigió antes de enseñarlo.

## Mesas y mesero — 2026-09-12

Segundo paso de DEC-22: la estación del mesero en `/mesas`, sobre el simulador. Maestro-detalle a
pantalla fija: el plano por zonas a la izquierda y la mesa elegida a la derecha, con sus niños
vinculados, sus pedidos y la acción que toca —abrir, tomar pedido, servir lo que está listo, pedir la
cuenta, dejarla libre—. Tomar un pedido cambia a carta + ticket, porque la carta necesita el ancho
del plano; vincular pulseras es una hoja lateral con lector. Cabe sin desplazar a 1366×768 y
1280×800, y en tablet vertical; en móvil vuelve el flujo normal.

La regla que ordena la pantalla viene de FLUJOS §2: **el borrador es del mesero; lo enviado, de la
cocina**. El borrador se cambia y se descarta sin pedir permiso y la cocina no lo ve; el envío pasa
por una confirmación que repite el pedido, porque es el momento de leérselo a la mesa. Un plato
agotado no se puede enviar, y si algo del borrador no pasa, no se envía nada. El borrador de una mesa
que se libera no hereda a la familia siguiente. Si la tablet se apaga, el borrador se pierde: X4
sigue por decidir y no se inventó una respuesta.

El simulador tuvo que crecer: hasta ahora solo reproducía guiones, y el mesero **emite**. Los eventos
de las personas sí viajan entre pestañas —no están en ningún guion—, y quien los recibe los valida
contra el contrato como si vinieran del servidor. Sobreviven a la reconstrucción del local y
funcionan también sin escenario. Los guiones pasaron a usar las mesas del plano (`mesa-3`), así la
mesa 3 del simulador es la que ve el mesero. El plano y la carta son contratos Zod nuevos, con datos
inventados hasta F0-03 y F0-04.

La prueba en navegador encontró un fallo real: la píldora del simulador, abajo a la derecha, tapaba
el botón principal de la columna de acciones, que en todas las estaciones está a la derecha. Pasó a
la izquierda. Y dos ajustes de lectura: las insignias de solo icono y número («🍳 1») pasaron a decir
«1 en cocina», y cada línea del ticket pasó a una sola fila para que cinco platos quepan sin
desplazar.

## Auditoría de experiencia y plano del local — 2026-09-12

El cliente pidió una revisión de diseño con mirada de UX sénior y pasó un dibujo del local. Se
revisaron las diez pantallas a 1366×768 y salieron doce hallazgos. Los cuatro altos: el botón del
simulador tapa la operación, la barra de estación dice siempre «Marisol Prieto · Cajera», las
estaciones no filtran por rol y hay cinco formas distintas de avisar. Todo está en
[UX-MEJORAS.md](cerrados/UX-MEJORAS.md), con maquetas en `docs/cerrados/diseno/` y un orden propuesto (V1-V5).
**No se construyó nada: es una propuesta para aprobar.**

El dibujo corrige al prototipo: son 8 mesas redondas de **4 sillas**, cuatro junto al parque y dos
filas de dos hacia la calle, con la caja en L y la cocina detrás. Se propone un plano espacial en dos
modos que nunca se mezclan. En servicio nada se arrastra. En edición, solo la administración mueve
mesas, con borrador, publicación versionada y retirada en vez de borrado, porque los pedidos del pasado
nombran la mesa. Quedan cuatro decisiones: quién edita el plano (D10), numeración y zonas (D11), si hay
venta directa en caja (D6) y si el back-office puede desplazar (D12).

## V1: avisos, identidad y salidas animadas — 2026-09-12

El cliente aprobó el mini plan de [UX-MEJORAS.md](cerrados/UX-MEJORAS.md) y se hizo V1:

- **Una forma de avisar para cada caso.** Toasts con Sonner, vestidos con los tokens: arriba al centro en
  las estaciones, bajo la barra, y arriba a la derecha en el panel. Pasaron a toast los avisos de acción
  terminada: entrada con cuenta abierta (con «Ver en la sala»), salida cerrada, excepción registrada y
  todo lo del mesero. El cobro cerrado dejó de ser un diálogo que frenaba la cola: ahora es un toast
  con el vuelto y «Volver a Entrada». Los errores de un dato siguen junto a su campo, porque un toast se
  va solo y nadie lo vuelve a ver.
- **La barra dice quién está.** La identidad sale de quien entró por el acceso. Sin sesión, la barra dice
  «Sin identificar» en lugar de mostrar a Marisol. Bloquear por inactividad, el corte Z y «Salir» cierran
  la sesión. Se guarda también el rol de la matriz, que es lo que usará V2.
- **El simulador ya no tapa nada.** Es un chip «DEMO» dentro de la barra, del menú del panel y del acceso,
  y su panel se abre bajo la barra.
- **Las capas salen animadas** con `@starting-style`, sin librería. El cambio de pantalla sigue sin salida:
  eso pide View Transitions, todavía experimental en Next 16.
- Detalles: «Turno desde 14:00», iniciales neutras en el acceso y el indicador de desarrollo de Next
  apagado.

Probado en navegador de punta a punta: acceso → mesas con la identidad de Jesús, entrada prepago → caja
→ toast → vuelta a entrada, hoja que sigue visible y moviéndose a los 120 ms de cerrarla, y barra sin
desbordar de 390 a 1366 px.

## V2: cada rol ve su puesto — 2026-09-12

Segundo paso del mini plan. Hasta hoy el panel usaba una administradora fija y las estaciones enseñaban
todo a todos. Ahora las cuatro reglas de [UX-MEJORAS.md](cerrados/UX-MEJORAS.md) §3 salen de la matriz de §7.3,
escritas una sola vez en `identity/visibilidad.ts`:

- **La barra** muestra solo las pestañas que el rol puede abrir, y «Panel» solo a quien ve informes. La
  monitora, en caja, ve «Cobrar» pero no «Turno».
- **El menú del panel** se recorta con el rol de quien entró. Un módulo aparece si su acción alcanza o si
  alguna de sus secciones alcanza. Así la cocina ve Restaurante con solo «Comandas del día», que ahora
  pide `kds.cambiarEstado`.
- **La dirección no es una puerta.** Cada pantalla tiene guardia. Sin sesión dice «Nadie ha entrado en este
  equipo». Con otro rol, «Mesero no tiene acceso a la caja», y ofrece ir a su puesto o cambiar de usuario.
  Antes de leer la sesión no se pinta nada, para no destellar la pantalla ni el rechazo.
- La administradora entra por el acceso como los demás.

Probado en navegador con los seis roles contra la tabla de §3, sin errores de página. Tres cosas que
salieron por el camino:

- **Una página de módulo del panel dejaba de cargar**, porque recibía del servidor un objeto con un icono,
  que es una función y no puede pasar al cliente. Ahora recibe solo el id.
- **El hallazgo M5 no aplicaba.** El teléfono de la entrada lo teclea el operador; el dato guardado no se
  muestra en ninguna parte. Se corrigió la auditoría en vez de inventar un enmascarado.
- **La sesión vive en la pestaña**: una pestaña nueva pide entrar otra vez. Es lo correcto en un equipo
  compartido; para la demostración con varias pestañas hay que identificarse en cada una.

Recordatorio: es experiencia de usuario, no seguridad. La puerta de verdad la pondrá el servidor con la
misma matriz.

## Formato monetario VE y estándar horario 12h — 2026-09-12

Se establecieron como norma visual e institucional dos reglas de localización venezolana:

- **Formato monetario oficial de Venezuela (BCV / SENIAT):** Los bolívares se formatean con el símbolo
  `Bs. ` a la izquierda, punto (`.`) para separación de miles y coma (`,`) para decimales
  (ejemplo: `Bs. 18.272,80` y `Bs. 4.852,30`). Los dólares usan `$` a la izquierda con dos decimales
  limpios (ejemplo: `$ 94.17`). Se implementó en `@l2/ui` mediante los helpers `formatMoneyVE` y
  `formatPartsMoneyVE` en `packages/ui/src/patterns/MoneyDisplay.tsx`, exportados en el índice de la
  librería. La regla arquitectónica se cumple con rigor: `@l2/ui` recibe cadenas de caracteres y no
  conoce el tipo `bigint` del dominio, y queda estrictamente prohibido usar `toFixed(2)` fuera de `@l2/ui`.
- **Formato horario comercial de 12 horas:** El estándar comercial y cotidiano en Venezuela usa 12 horas
  con sufijo en minúsculas y espacio (`2:00 pm` y `10:30 am` en lugar del formato militar de 24 horas).
  Se ajustó `DEFAULT_TIME_FORMAT = "12h"` en `features/park/time-format.ts`, actualizando la cabecera
  del turno («Turno desde 2:00 pm · Marisol Prieto») y las horas de las excepciones de demo (`3:42 pm`,
  `4:20 pm`, `5:05 pm`, `6:11 pm`).

## Barras operativas compactas (Parque, Caja, Mesas y Cocina) — 2026-09-12

El panel de inicio requería visibilidad simultánea del parque y de la operación gastronómica sin
provocar desplazamiento vertical:

- **Eliminación total de emojis:** Se retiraron todos los emojis de las tarjetas y barras operativas,
  reemplazándolos por micro-gráficas sobrias, barras de aforo y chips tipográficos acordes con el sistema de tokens.
- **Fila 1 (Parque y Caja):** Vendido (`$ 94.17`), Niños atendidos (`8`), En sala ahora (`8 de 30`) y
  En gaveta bimoneda (`$ 70.58` · `Bs. 4.852,30`).
- **Fila 2 (Mesas y Cocina, debajo de Parque y Caja):** Mesas en servicio (`5 de 8` con barra turquesa
  de aforo salón y mesas libres), En cocina KDS (`4 comandas` con desglose de cola y preparación), Listas
  para servir (`2 en pase` con chip pulsante `[ ● Por retirar ]`) y Espera máxima (`18 min` de Mesa 4).
- **Diseño compacto vertical:** Se redujeron paddings y alturas para que ambas barras convivan dentro
  del primer pantallazo tanto en escritorio (1366×768 y 1920×961) como en tablet, sin desplazar las tarjetas de acción.

## V5: Caja rápida bimoneda, venta directa y catálogo táctil (D6) — 2026-09-12

Se resolvió la experiencia de cobro en `/caja`, transformándola en un flujo fintech ágil de 1 a 2 toques:

- **Doble visor bimoneda simultáneo en Hero:** Muestra en grande el monto pendiente en USD y en un renglón
  propio el contravalor en `Bs.` según la tasa oficial congelada para la transacción (`228,41 Bs/$`).
- **Cobro exacto en 1 toque:** Al seleccionar un medio (ej. Pago Móvil o Punto Débito), un botón
  prominente `Cobrar exacto (Medio)` autocompleta el 100% de la deuda en bolívares en 1 toque sin usar el
  teclado numérico.
- **6 medios de pago con jerarquía e iconos:** Efectivo $ (+3% IGTF), Efectivo Bs, Pago Móvil (0% IGTF),
  Punto débito, Zelle (+3% IGTF) y USDT (+3% IGTF).
- **Datos de Pago Móvil del comercio:** Panel desplegable al seleccionar Pago Móvil con Banco (Banesco 0134),
  Teléfono (0414-234.56.78), RIF (J-40123456-7) y botón interactivo `Copiar` con confirmación temporal.
- **IGTF automático y vuelto bimoneda:** Calcula el 3% fiscal sobre pagos en divisas y desglosa el vuelto
  dualmente ($ y Bs.) permitiendo elegir su destino: `Vuelto`, `Propina` o `A caja`.
- **Venta directa de mostrador (D6 / F8-02):** Botón `+ Venta directa (Mostrador)` en la cabecera de la
  cola de cuentas. Permite abrir de inmediato una venta rápida (`Mostrador #XX`) para personas que solo
  compran un café, bebida, golosina o delivery, sin exigir pulsera de parque ni registro previo de familia.
  Cumple al 100% con `FamilyAccountSchema` al inicializarse con un producto base y sesión `s-mostrador`.
- **Catálogo táctil integrado (1 toque, sin modal):** Desplegable táctil `+ Añadir snacks` en la
  cabecera de la cuenta activa. 14 productos de mostrador organizados en 5 categorías (`Todos`, `Bebidas`,
  `Snacks`, `Golosinas`, `Café`). Cada toque agrega una línea `RESTAURANTE` recalculando al instante subtotal,
  IVA (16%) y tasa BCV, con botón `X` de retiro para corrección de pedidos.
- **Adaptación para montos grandes en bolívares y smart tenders:**
  - Hero apilado con tarjeta independiente para bolívares y escalado tipográfico automático para montos
    de 6 a 8 dígitos (ej. `Bs. 1.250.000,00`).
  - Billetes rápidos inteligentes (`calcularBilletesSugeridos`): ofrece atajos estándar ($5, $10, $20, $50, $100)
    para deudas menores a $50, y redondeos superiores lógicos ($100, $150, $200) para cuentas de gran tamaño.
  - Botón de cierre multilínea que preserva la legibilidad del monto en USD y Bs. sin saltos rotos de caja.


## Revisión de V5 y ticket estilo factura — 2026-09-12

Antes de construir encima se revisaron los cambios de V5 (caja rápida, venta directa, formato
venezolano). Aportaron mucho, y la revisión encontró siete cosas que no podían quedar así:

- **El teclado de caja no se podía usar a 1366×768.** La columna de cobro tenía más contenido del que
  cabía, y el teclado era lo único que se encogía: sus botones quedaban montados bajo el botón de
  cierre. Ahora el teclado se abre con «Otro monto» y, con él abierto, el visor baja a un renglón. Cabe
  sin desplazar a 1366×768 y 1280×800, con cualquier medio de pago.
- **La venta directa nacía con un «Agua mineral» cargado**: si la cajera no lo quitaba, se cobraba algo
  que nadie pidió. Ahora la venta nace con el primer producto que se elige, y si se vacía se descarta.
- **La tasa de Inicio estaba escrita a mano** (`36,40`) y contradecía la que se usa para cobrar
  (`228,41`). Ahora sale del mismo dato.
- **El bruto con IGTF se calculaba en la pantalla**, con aritmética `bigint` suelta (regla 3). Pasó al
  dominio como `pagoQueCubreConIgtf`, con cuatro pruebas: el menor pago que salda la deuda y su propio
  impuesto, al céntimo. Una deuda de 100,00 se salda con 103,09, no con 103,00.
- **Quitar una línea no validaba qué se quitaba**: solo el botón visible lo impedía. Ahora la regla va en
  la acción. Lo consumido (paquetes, tiempo de más) no se toca desde la caja: eso es una cortesía con
  autorización (F6-14).
- **Objetivos táctiles de 20 a 32 px** en una superficie de 56 (billetes rápidos, la «x», categorías).
- **Montos en bolívares que se salían de su tarjeta** en «Por punto de cobro».

Y lo que pidió el cliente sobre la marcha: el ticket de «La cuenta» pasó a **estilo factura** —filas
compactas, concepto e importe, sin numerar—, los ítems repetidos de mostrador van **en una sola fila con
su cantidad** (contador de 56 px al tocarla, precio por unidad y «Eliminar»), y el botón pasó a llamarse
«Añadir ítems». Cada unidad sigue siendo su propia línea de la cuenta: solo se agrupan para leerlas.

Queda registrada una deuda: la venta de mostrador se guarda como cuenta de familia con una estancia
ficticia (`s-mostrador`), porque el contrato exige un niño. Necesita su propio tipo de cuenta.

## Número de orden y la caja como factura — 2026-09-12

Tres pedidos del cliente sobre la caja, en la misma sesión:

- **Cada cuenta lleva un número de orden** (`#1049`), un correlativo único para toda la sucursal: familia,
  mesa o mostrador. Es lo que se dice en voz alta y se busca en un reclamo. **No es el número de factura**:
  ese lo pone la máquina fiscal al emitir, con su propia serie. En el contrato es `orderNumber`, y lo asigna
  quien registra la cuenta —hoy el proveedor de cuentas, mañana el servidor en la misma transacción—,
  nunca la pantalla. Aparece en la cola, en la cabecera del ticket y en los avisos («Orden #1049 cobrada»).
  Queda abierta la decisión D13: si se reinicia cada día o es continuo.
- **La cabecera del ticket cabe en un renglón**: número, familia, forma de pago y hora de apertura. La
  fila «Caja · 2 cuentas por cobrar · cobra en mostrador» era redundante —la cola ya lo dice— y se quitó:
  ese alto es para los ítems.
- **Factura de verdad**: columnas de cantidad, concepto, precio unitario e importe, filas de 32 px, y la
  cuenta más ancha (675 px a 1366; 944 px a 1920, porque la caja ya usa el ancho de pantallas grandes).

## La columna de cobro, fija — 2026-09-12

El cliente pidió que «Otro monto» y «Faltan» fueran una sola fila de dos columnas para que el teclado
cupiera sin tener que abrir nada. Juntar esos dos botones liberaba unos 64 px y el teclado necesita unos
300, así que la columna se rehízo con una estructura que no cambia:

1. **Visor**: lo que falta (o el vuelto) y, al lado, lo que se está tecleando; los bolívares en su renglón.
2. **Medios de pago.**
3. **Una franja de 56 px exactos** según el medio: billetes rápidos, datos de Pago Móvil o de Zelle, una
   indicación para los demás y, si hay vuelto, su destino.
4. **El teclado, siempre a la vista.**
5. **Una fila de dos columnas**: «Cobrar exacto» y «Cerrar cobro».

«Otro monto» desapareció, porque el teclado ya está siempre. Medido en navegador: con los seis medios, a
1366×768 y a 1280×800, el teclado queda en el mismo píxel, nada desborda y teclear no mueve nada. De paso,
la tecla «Añadir» apagada ya no queda naranja a medias: se vuelve neutra, como los botones.

## Datos de cada pago y auditoría de Caja — 2026-09-12

El cliente preguntó qué pasa con los datos de un Pago Móvil, un Zelle, un USDT o un punto de venta cuando
hay más de un terminal. Era F4-04 y no existía: un pago así entraba sin referencia y no se podía conciliar.
Ahora el contrato `DatosDePagoSchema` dice qué exige cada medio, y la caja lo pide **al añadir** el pago,
en un diálogo pensado para la cola: el foco cae en la referencia, Enter confirma, se recuerdan el banco, el
terminal y la red, y una referencia repetida en el mismo cobro se rechaza. En la lista de pagos los datos
van enmascarados (§7.6).

La prueba de punta a punta con los cuatro medios destapó un fallo que venía de F4-03: **un cobro con USDT
nunca se podía cerrar**, porque se convertía con la tasa de bolívares. Va a la par con el dólar, como ya
asumía el IGTF, a confirmar con el contador.

La auditoría de Caja quedó en [UX-MEJORAS.md](cerrados/UX-MEJORAS.md) §9. Además de lo anterior, se corrigieron el
IGTF pintado con colores de alarma, las etiquetas de 9,5 px y el formato de lo tecleado en bolívares.
Quedan propuestas (atajos de teclado, avisos de cola, búsqueda, recibo) y una decisión nueva: D14,
identificar al cliente en la factura.

## A quién se factura — 2026-09-13

El cliente cerró la decisión D14 como DEC-23: **consumidor final por defecto**, y cédula o RIF con el
nombre cuando el cliente pide la factura a su nombre o al de su empresa. En la caja es una fila «Factura
a» sobre los totales, con «Identificar». El diálogo propone el nombre del representante, que casi siempre
es quien la pide, y valida el documento (V-, E-, J-, G-, P-). La dirección fiscal queda opcional hasta que
el contador confirme qué exige la factura (DEC-1). El documento se enseña enmascarado (`V-18···432`) y el
aviso de cobro dice a nombre de quién salió la factura.

De paso se corrigió una regresión de la tanda anterior: al agrandar las etiquetas de los medios de pago,
«Punto débito» se cortaba y «+3 % IGTF» se partía en dos renglones. El icono pasó junto a la moneda y el
nombre tiene su renglón entero; comprobado a 1366, 1280 y 1024.

## Las seis propuestas de Caja — 2026-09-13

El cliente aprobó las propuestas de la auditoría (§9 de UX-MEJORAS) y pidió hacerlas con las mejores
prácticas. Quedaron así:

- **La cola se atiende por antigüedad.** La cuenta guarda `pendingSince`, que fija quien la pasa a «por
  cobrar» y conserva mientras sigue esperando. Cada fila dice cuántos minutos lleva; desde los 10, en ámbar y
  con reloj. Una cuenta que llega con la caja abierta destella y se avisa, salvo la que crea la propia caja.
- **Encontrar sin recorrer.** Pasar la pulsera abre la cuenta del niño, o dice que sigue abierta o que no
  tiene. El buscador (familia o número de orden, con filtros Parque y Mostrador) solo ocupa sitio con más de
  cinco cuentas o cuando se pide con «/» o la lupa.
- **Corregir un pago tocándolo.** Monto y datos en el mismo formulario del alta, prellenado. Es un borrador:
  una vez cerrado el cobro, corregir será una reversión con motivo.
- **Atajos para el equipo del mostrador.** Los dígitos son el monto, así que los medios van por letra (E, B,
  P, T, Z, U), no por número como decía la propuesta. Cerrar pide Ctrl+Enter. No actúan mientras se escribe
  ni con un diálogo abierto, y una ráfaga del lector de pulseras se descarta entera: «AK-0158⏎» no elige
  un medio ni añade un pago. Enter sobre un botón al que se llegó con Tab lo pulsa a él.
- **Recibo no fiscal** tomado como foto al cerrar: impresión de solo el recibo a 80 mm y WhatsApp por
  `wa.me`, sin servidor, solo si el cliente lo pide.
- **«Venta directa» neutra** y el origen de cada cuenta con icono y texto. La pestaña «Cobrar» cuenta lo
  que espera cuando se está en «Turno».

Tres cosas aparecieron al probarlo en el navegador. Con dos oyentes de teclado (cola y cobro), el primero
cancelaba la tecla y el segundo la ignoraba: ahora solo se ignora lo que canceló otro. En Tailwind 4
`text-base` también se lee como color por el token `--color-base`: el nombre del recibo salía del color del
fondo. Queda revisar sus otros usos, que hoy se salvan porque llevan un color explícito detrás. Y a 1280 px
el chip «+3 % IGTF» del USDT se salía del botón: el icono pasó junto al nombre y la columna de cobro tiene
352 px de mínimo.

Límites honestos: sin backend, las cuentas viven por pestaña, así que la llegada «en vivo» se verá de verdad
con el servidor; y la búsqueda por mesa y el teléfono del representante en el recibo llegan con la caja de
mesas y la ficha de la familia.

## El efectivo se cuenta — 2026-09-13

Tres observaciones del cliente sobre la caja, las tres ciertas:

- **«Cobrar exacto» no va con el efectivo.** En efectivo casi nunca se entrega el monto justo, y un botón
  que registra el total de un toque invita a apuntar lo que no se contó. Queda para Pago Móvil, punto, Zelle
  y USDT, donde el monto sí es exacto. En efectivo «Cerrar cobro» ocupa la fila entera, con el mismo alto.
- **Faltaba el billete de $1**, el más usado aquí. La fila de billetes deja de ser «sugerida»: era distinta
  según el monto y ofrecía cosas como «$57», que no es un billete. Ahora son seis fijos, siempre en su sitio,
  y cada toque suma al mismo pago: tres de $1 y uno de $5 son un pago de $8, no cuatro renglones.
- **El IGTF no existe en bolívares**, así que los medios en Bs ya no dicen «0% IGTF». El chip queda en los
  medios en divisas y su porcentaje sale del dato, no del texto.

Quedan aprobadas, en este orden, la pantalla «Ventas» del turno (reimprimir como copia auditada) y anular
un cobro con reversión, motivo y supervisor. Para anular faltan dos decisiones del cliente: quién autoriza
y por qué medio se devuelve el dinero.

## Anular un cobro: quién y cómo (DEC-24) — 2026-09-13

El cliente decidió que un cobro ya cerrado lo **autoriza un supervisor con su PIN o el administrador**, y
pidió «lo más óptimo» para devolver el dinero. Lo óptimo es **el mismo medio y la misma moneda**: el dinero
vuelve a quien pagó y la devolución concilia sola. Devolver en efectivo lo que entró por Pago Móvil es la
forma clásica de sacar dinero de una caja, así que el efectivo queda como alternativa con motivo, solo si
la caja lo tiene y a la tasa congelada del cobro original. El punto de venta se anula en el terminal el
mismo día; después, reverso bancario. Nada se borra: son asientos de reversión.

En el dominio de identidad hay una acción nueva, `cobro.anular` (🔐 para cajero, supervisor y monitora),
y una regla que faltaba: `canAuthorize`, quién puede dar la autorización de un 🔐. Solo supervisor o
administrador, que alcancen la acción en esa sucursal; lo que el solicitante tiene denegado no se lo abre
nadie. Cinco pruebas. La pantalla «Ventas» del turno, para reimprimir y anular, es el paso siguiente.

## Ventas del turno y reimprimir con rastro — 2026-09-13

La cajera ya puede volver a cualquier cobro del turno. «Ventas» es una pestaña del puesto de caja, entre
«Cobrar» y «Turno», con la misma forma maestro-detalle: la lista a la izquierda (búsqueda por familia o
número de orden, filtro por medio) y el recibo a la derecha, tal como sale en papel.

La venta cerrada tiene contrato propio, `VentaCerradaSchema`: guarda el recibo **como foto**, con los
textos ya formateados, para que una copia de mañana diga lo que se cobró hoy aunque cambie una tasa o un
nombre del catálogo. Y guarda sus impresiones como lista que solo crece (regla 5): la primera es el
original y las siguientes salen marcadas «COPIA», con la hora y la persona a la vista. Reimprimir es un
vector de fraude conocido; por eso no tiene atajo de teclado. La caja registra cada cobro al cerrarlo, y
su «Último cobro» sale ya de ese registro, así que sobrevive a una recarga. La copia de la factura fiscal
seguirá pidiendo supervisor (§7.3) cuando exista F3.

Dos cosas más del cliente y de la prueba: los datos de Pago Móvil se amontonaban, y la franja quedó sin
el icono del medio, con el banco por su nombre, el teléfono sin puntos y «Copiar» como icono de 48 px. Y
al revisar un recibo apareció que **el IGTF se calcula sobre el billete entero, vuelto incluido**: $ 15
para $ 11,47 cargan $ 0,45. Queda anotado para el contador (DEC-1) antes de tocar el dominio fiscal.

Sigue anular un cobro (DEC-24).

## Anular un cobro — 2026-09-13

DEC-24 ya se puede hacer desde «Ventas». «Anular cobro…» es un botón discreto, bajo imprimir y WhatsApp, y
solo aparece para quien puede pedirlo. Abre una sola capa con tres bloques en el orden en que se piensa:

1. **Por qué:** cuatro motivos de lista cerrada; «Otro» exige explicarlo.
2. **Cómo vuelve el dinero, pago a pago.** Por el mismo medio y en su moneda, pidiendo la referencia de la
   devolución (en el punto, la aprobación de la anulación en el terminal). El efectivo es la alternativa:
   exige explicación y se niega si la gaveta no lo tiene en esa moneda.
3. **Quién autoriza:** un supervisor o el administrador, con su PIN. Tres intentos y se bloquea con la misma
   política del acceso. El administrador confirma igual con su PIN: una operación que devuelve dinero no se
   hace con una sesión que alguien dejó abierta.

Lo que no es obvio: **cuánto se devuelve de cada pago no se calcula al anular, sino al cobrar.** El
dominio de caja tiene ahora `refundableByTender`: el excedente (vuelto, propina o residuo) no se devuelve,
se descuenta primero del efectivo y se convierte con la tasa congelada de ese pago. La venta guarda ese
«devolvible» junto a cada pago, así una anulación de mañana no depende de la tasa de mañana. Seis pruebas.

La anulación se AÑADE a la venta una sola vez y el contrato la valida entera: autorizador con rol válido,
cada pago con su devolución exacta, referencias y explicaciones donde tocan. Seis pruebas más. El orden de
aplicación es fail-closed: primero se comprueba que la cuenta puede volver a «por cobrar», después se anota
la anulación y solo entonces se guarda la cuenta. El recibo pasa a decir «ANULADA», no se reimprime ni se
envía, y lo cobrado del turno deja de contarla. La cuenta vuelve a la cola de la caja: lo consumido se sigue
debiendo, y si no hay que cobrarlo será una cortesía con motivo (F6-14), no una anulación.

Pendiente y dicho: la gaveta se estima con las ventas de la sesión (sin fondo inicial, así que peca de negar),
el PIN y la auditoría los hará el servidor, y con factura fiscal hará falta la nota de crédito (F3).

## Orden, demo aislada y el repositorio en GitHub — 2026-09-13

Con un segundo desarrollador entrando al proyecto, se ordenó el repositorio antes de publicarlo en
`github.com/LuAM-Lu/l2control`.

**La demo, en su sitio.** Los datos de ejemplo estaban en seis archivos repartidos por las
funcionalidades, y tres piezas de la aplicación los importaban directamente: los proveedores de cuentas
y ventas, y el diálogo de anular (el directorio de personas). Eso significaba que conectar el backend
obligaba a reescribir pantallas. Ahora:

- Todos viven en `apps/web/src/demo`, con su README. Lo que en esos archivos era producto y no
  ejemplo —el tipo `MedioPago`, las excepciones del turno, las denominaciones y los nombres de los
  medios— volvió a su funcionalidad (`cash/medios.ts`, `cash/turno.ts`).
- Solo las rutas importan la demo y la pasan por props. Una regla nueva de `pnpm arch`,
  `demo-solo-desde-las-rutas`, rompe la construcción si una pantalla o un proveedor lo hace; se
  comprobó inyectando la violación.
- Un solo interruptor, `NEXT_PUBLIC_DEMO=off` (antes `NEXT_PUBLIC_SIMULADOR`), apaga el simulador y
  las cuentas y ventas de ejemplo. Tarifas, medios, personas y la instantánea del parque siguen
  saliendo de la demo hasta que los sirva el servidor.

**El KDS, aparte.** La cocina estaba a medio hacer y sin commit; quedó en la rama `wip/kds` para que
`main` suba limpio y en verde. `master` pasó a llamarse `main`.

**La documentación, al día.** `README.md` describe lo que existe hoy; `CONTRIBUTING.md` explica ramas,
commits, verificación y qué documento se toca en cada caso; `docs/PENDIENTES.md` junta en una lista todo
lo que falta, agrupado por quién lo desbloquea (cliente, contador, campo, producto, backend), y
`PROGRESO.md` se quedó con el estado por tarea. Se añadieron el README de `@l2/domain-identity` y el
índice de contratos por área.

## La cocina tiene pantalla — 2026-09-14

Tercer paso de DEC-22. El KDS estaba a medias en `wip/kds`: la máquina de estados de la comanda ya
era dominio puro con sus once pruebas, pero no había dónde verla. Ahora existe `/cocina`.

**Lo que decide la pantalla.** Una comanda, una acción: en cola se «Empieza», en preparación se marca
«Lista», y ahí sale de la rejilla de trabajo a su propia columna, con cuánto lleva esperando al mesero
—un plato listo que se enfría es tan malo como uno que no sale—. La cocina no entrega (eso es del
mesero, FLUJOS §2 C) ni anula (eso exige autorización, §7.3): solo confirma que vio una anulación.

**Las anulaciones mandan.** Van arriba, en rojo, con el motivo y quién autorizó, y no se van hasta que
alguien pulsa «Enterado»; entonces sale el evento `pedido.anulacion_vista`. Es la regla de FLUJOS C5:
un plato que se sigue cocinando porque nadie vio la anulación es comida tirada. Probado con el
escenario X5 de punta a punta.

**Tamaños de cocina.** Todo lo que se toca mide 64 px (§8.4), el cronómetro va en cifras tabulares y
grande, y el nivel de espera —a tiempo, tarda, atrasada— se dice con color, icono y texto, además de
cambiar el borde de la tarjeta para leerlo de lejos. El umbral (8 y 15 minutos) es un dato de la
pantalla, no una constante: será configuración de la sucursal.

De paso, el acceso llevaba a la cocina a una sección del back-office que solo explicaba que la
pantalla no existía; ahora Diego entra directo a `/cocina`, con su pestaña en la barra del
restaurante, y el mesero que intente abrirla se topa con el guardia de la estación.

## El plano se parece al local — 2026-09-14

V3. Las mesas eran una rejilla ordenada por zonas: se entendía, pero el mesero tenía que traducir «la 6»
a «la del fondo». Ahora `/mesas` dibuja el local: el parque arriba, la entrada de la calle a la izquierda,
la caja en L al centro-derecha y la cocina detrás. El cliente confirmó que la pared en diagonal del dibujo
fue un trazo involuntario: el local es rectangular, 8 × 6 m de trabajo hasta el relevamiento (F0-03).

**La geometría entró al contrato, no a la pantalla.** `PlanoLocalSchema` guarda las medidas del local y,
de cada mesa, su centro en **centímetros**, su forma, su tamaño y su giro; y la estructura fija —paredes,
puertas, parque, caja, cocina— va en su propia capa. En cm y no en píxeles porque el mismo plano se pinta
a 1366, en tablet y en móvil, y porque las medidas reales del relevamiento entrarán tal cual. El contrato
además **niega lo que no se puede publicar**: una mesa fuera de las paredes o encima de otra. Cinco pruebas.
Así el editor (V4) y el servidor aplicarán la misma regla sin repetirla.

Se dibuja con un `<svg>` y dos manejadores: con ocho mesas no hace falta una librería de diagramas. En
servicio **no se arrastra nada** (§2.2): tocar una mesa la elige. Cada mesa es un grupo con rol de botón,
foco propio y nombre accesible, y hay conmutador **Plano | Lista** para móvil y lectores de pantalla.

Decisiones cerradas de paso: **D10**, solo administración edita el plano; **D11**, 1-4 «Junto al parque» y
5-8 «Salón» de 4 sillas, como punto de partida **editable**. El número y la zona son etiquetas: renumerar
no reescribe lo ya cobrado, porque la identidad de la mesa no cambia.

De paso, el plano y la carta de ejemplo salieron de `features/mesas` a `src/demo`, que es donde va lo
inventado desde el orden del repositorio.

## El plano, rediseñado: sillas, barra de una pieza y «Atender» — 2026-09-14

El cliente miró V3 y dijo tres cosas: no se veía premium, no se apegaba al mapa y ocupaba demasiado.
Tenía razón en las tres.

- **Se apega al mapa.** La barra era dos rectángulos pegados y miraba al lado contrario. Ahora una pieza
  en L con su contorno propio —el contrato admite `points` para lo que no es un rectángulo— con el brazo
  largo hacia el salón y el corto bajando hacia la cocina. El local es rectangular: la diagonal del dibujo
  fue un trazo involuntario.
- **Se lee mejor.** Cada mesa lleva sus cuatro sillas y las ocupadas se rellenan: de un vistazo se ve si
  una mesa de cuatro tiene dos personas o está a tope, que es lo que mira el mesero al entrar al salón.
  Suelo, relieve corto y rótulos espaciados; el color queda para lo que pide atención.
- **Ocupa lo que debe.** El plano pasó de mandar en la pantalla a una columna de 340-480 px, y el detalle
  de la mesa se quedó con el resto. Las mesas y la barra se recolocaron con números: ninguna silla pisa
  otra pieza ni se sale del suelo.

**La vista Lista desaparece y llega «Atender».** Repetir el plano en forma de lista no servía de nada. Ahora
lista solo lo que pide acción, en el orden en que conviene hacerlo: platos listos que se enfrían, quien
quiere pagar, mesas que bloquean por limpiar y mesas largas. En el teléfono es la vista de entrada, porque
un plano de ocho metros ahí no se lee, y sigue siendo la alternativa para lector de pantalla.

El conmutador acabó donde le toca: **en la fila del título**, no sobre el contenido. Es un control de la
pantalla, no del plano, y así el dibujo recupera ese renglón.

## El editor del plano — 2026-09-14

V4, y con él la respuesta a «¿dónde añado o quito una mesa?»: **Panel → Restaurante → Plano del local**,
solo para administración (D10).

**Borrador y publicar, nunca en vivo.** Lo que se toca en el editor no sale de esa pantalla hasta pulsar
«Publicar»; hasta entonces el salón sigue viendo el plano anterior. Cambiar la distribución a mitad de
servicio dejaría a mesero, cocina y caja viendo cosas distintas. El plano publicado vive por encima de las
dos cáscaras, así que el mesero ve la mesa nueva en cuanto se publica.

**Lo que impide equivocarse.** Las mesas se ajustan a una rejilla de 10 cm al soltar; una mesa fuera de las
paredes o encima de otra se marca en rojo y «Publicar» se niega, con el contrato repitiendo la comprobación
al guardar. Una mesa nueva aparece en un hueco libre que no pisa el parque ni la cocina. Y se puede trabajar
**sin arrastrar** (WCAG 2.5.7): las flechas mueven 10 cm y 50 con Mayús, o se teclea la posición.

**Nada se borra** (regla 5): una mesa se **retira**, conserva su número y su historia —los pedidos y cobros
de antes la nombran— y puede devolverse al salón. El contrato lo respalda: las retiradas no cuentan para la
regla de números únicos ni para los solapes, y el servicio no las pinta.

Falta la capa de estructura editable (paredes, puertas, barra, cocina), las guías de alineación entre mesas
y el historial de versiones, que llegará con el servidor.

**Corregido el mismo día:** el editor dibujaba las piezas fijas con su propio código, así que «Entrada» salía
cortada contra la pared y el lienzo se comía la pantalla. El local se dibuja ahora una sola vez
(`piezas.tsx`) para el servicio y para el editor, y la pantalla usa el contenedor y la cabecera del
back-office, con el lienzo acotado al alto de la ventana.

## La cuenta de la mesa: una familia, un cobro — 2026-09-14

Paso 4 de DEC-22, y las dos decisiones que lo trababan, cerradas por el cliente con un «lo más óptimo»:

- **D2 — vincular MUEVE el parque a la mesa.** Cuando el mesero vincula las pulseras, las líneas de parque
  de esa familia pasan a la cuenta de la mesa. Así la familia paga una vez y la cajera no suma dos cuentas
  de cabeza. Nada se borra (regla 5): la línea se queda en la cuenta de la familia con `movedTo` diciendo
  adónde fue, y deja de contar como pendiente.
- **D3 — la mesa se cobra aunque los niños sigan jugando.** El contrato ya no exige que la familia entera
  haya salido para cerrar una cuenta **de mesa**; para una cuenta de familia sigue exigiéndolo.

**El circuito completo.** Cada pedido que el mesero envía a cocina entra en la cuenta de la mesa con el
precio de carta de ese momento —no con el de mañana—; una línea por unidad, para poder cobrar o hacer
cortesía de una sola. «Pide la cuenta» la manda a la cola de la caja con su número de orden, donde aparece
con icono de mesa y su propio filtro. Al cobrarla, la caja emite `mesa.por_limpiar` y el salón lo ve al
momento (D7 de FLUJOS §2).

**Dos cosas que faltaban para que esto se sostuviera.** La entrada abría la cuenta pero **no avisaba al
resto del local**: los niños registrados no aparecían en la sala ni se podían vincular a una mesa. Ahora la
entrada emite `estancia.abierta` por cada niño, con el mismo catálogo de eventos que usará el servidor. Y
lo que hacen las personas —abrir una mesa, enviar un pedido— **se perdía al recargar la página**, así que
cambiar de usuario borraba la tarde a medias; ahora se guarda en la pestaña y se valida contra el contrato
al recuperarlo, como lo que llega de otra pestaña.

El contrato de cuenta admite ahora una cuenta anclada a una mesa (`tableId`, `tableLabel`) y sin niños, con
la regla de que toda cuenta tiene que ser de alguien: de unos niños, de una mesa o del mostrador. Cuatro
pruebas nuevas.

Queda de la caja de mesas: **cobro dividido** (F6-12) y **propina explícita** (F6-13).

## Dividir la cuenta — 2026-09-14

F6-12, lo último que faltaba de la caja de mesas. «Pagamos entre tres» es lo que más se pide en una mesa,
así que la caja divide el **total del documento** en partes iguales, de dos a seis, con un toque.

**El céntimo no se pierde.** El reparto usa `allocate` del dominio de dinero, que reparte por mayor resto:
$ 11,02 entre tres son 3,68 + 3,67 + 3,67, y la suma es exactamente el total. Nada de redondear cada parte
por su cuenta y que falte o sobre un céntimo al final.

**Cada parte es un cobro completo**: su medio de pago, su IGTF si entra en divisas, su vuelto y su recibo,
que dice «Parte 2 de 3». La cuenta no se cierra hasta la última: mientras queden partes sigue en la cola,
elegida, para que la siguiente persona pague sin buscarla. El contrato lo impone —una cuenta con partes sin
cobrar no puede estar COBRADA— y el reparto se bloquea en cuanto se cobra la primera parte: cambiarlo a
mitad de camino haría que alguien pagara de más.

**La propina se va a Configuración.** El cliente decidió que la propina explícita y el servicio del 10 %
son un ajuste del local (DEC-6), no un paso del cobro. Queda la que ya existe: la que el cliente deja al
rechazar el vuelto, que no es ingreso del negocio (§5.6).

Falta dividir **por ítems** («cada quien lo suyo»), que se hará si el cliente lo pide: con el reparto en
partes iguales se resuelve la mayoría de las mesas.

## Cierre del frontend: qué queda y en qué orden — 2026-09-14

Con la caja de mesas terminada, las once primeras superficies del mapa de §11.4 tienen su interfaz:
parque (monitor, entrada, salida), caja (cobro mixto, ventas, reimpresión, anulación, cuentas de mesa y
división), mesas con su plano y su editor, y cocina. El plan se actualizó fila por fila y tarea por tarea;
`docs/PENDIENTES.md` queda como la única lista de lo que falta.

Lo siguiente es la **fila 12: el panel en vivo** (F9-08), que cierra DEC-22 y la interfaz completa. Después
cambia el terreno: se acaba el frontend y empieza el backend, y ahí la CI, la base de datos con RLS y la
auditoría dejan de ser deuda registrada para ser el trabajo.

## El local ahora mismo: panel en vivo — 2026-09-14 (F9-08)

Última superficie del mapa. La administración no puede estar en las cinco pantallas a la vez, así que
`/panel/vivo` responde a una sola pregunta —**¿qué está pasando y qué pide que me levante de la silla?**—
con cinco zonas: parque, cocina, mesas, caja y personas conectadas.

**Lo urgente va primero, arriba y con palabras.** Un tablero que solo enseña números se mira el primer día
y se ignora el segundo, así que cada zona calcula también *por qué* está en apuros: una estancia cumplida
sin liquidar, una comanda atrasada, una impresora caída, una mesa que pidió la cuenta hace rato, una cuenta
en caja cuya familia **ya salió del parque** —dinero que se puede ir por la puerta— o un puesto sin nadie
en hora de servicio. Si no hay nada, lo dice con todas sus letras. Estado con color, icono y texto (§8.2);
cifras con `tnum`; y cada zona enlaza a su pantalla, porque saber que tres familias esperan no sirve si hay
que buscar cómo llegar.

**Esta pantalla no decide nada: solo lee.** Es la única del back-office sin un botón que cambie el estado
del local. Todo el cálculo vive en `src/features/shell/vivo.ts`, puro: recibe el estado, las cuentas y el
instante, y devuelve las zonas resueltas.

**Personas conectadas (D7).** Cada acceso y cada salida emiten su evento, y el puesto sale del rol de quien
entró: caja, taquilla, salón o cocina. Fuera de servicio un puesto vacío no es noticia; en hora de servicio
sí, y se marca.

**Nada se recarga.** Faltaba una pieza: cada estación abre su propia pestaña y las cuentas vivían aisladas
en `sessionStorage`, de modo que la cajera cobraba y el panel seguía enseñando la cuenta en la cola. Ahora
las cuentas viajan por `BroadcastChannel`, como ya hacía el simulador, y lo que llega por el canal se valida
contra el contrato igual que cualquier entrada no confiable. Entre dos aparatos distintos sigue sin haber
nada: eso es el servidor (F5-08, ADR-008). Los proveedores de cuentas y ventas subieron al `layout` raíz,
porque el panel vive fuera del grupo de estaciones.

**Un fallo grave que solo aparece probando en el navegador.** Cobrar una cuenta **sin dividir** no hacía
nada: `marcarParteCobrada` intentaba escribir `partes: 1`, el contrato exige dos o más, y la excepción moría
dentro del manejador del clic sin dejar rastro en pantalla. Sin división, un cobro cierra la cuenta entera
y no hay partes que llevar. Corregido y las dos rutas comprobadas: cobro simple y cobro por partes.

Con esto **la interfaz de la Ruta A está completa** y se cierra DEC-22. Lo que sigue cambia de terreno:
el backend.

## Inicio y el panel en vivo se fusionan — 2026-09-14

El panel en vivo duró un día como pantalla propia. Al mirarlo al lado de Inicio se vio lo obvio: los
dos enseñaban sala, mesas, cocina y «requiere atención», con la diferencia de que **las cifras de
Inicio estaban escritas a mano en la ruta** (`mesasOcupadas={5}`, `comandasCocina={4}`,
`esperaMaximaMin={18}`) mientras el otro las calculaba. Dos tableros que dicen lo mismo con números
distintos son peores que ninguno.

Ahora hay uno solo, y el reparto es de **horizonte temporal, no de tema**: arriba lo que se mueve
ahora, abajo lo acumulado del día. De paso, las alertas dejaron de ser texto suelto y llevan a donde
se resuelven, «la tasa del día no está confirmada» pasó a ser una alerta de la zona de caja en vez de
vivir con lógica propia en Inicio, y el color de cada zona salió del aviso **más grave** y no de tener
alguno: el parque se pintaba de rojo por una advertencia, y los colores de estado son reservados.

La franja de avisos se rehízo después, a petición del cliente: una sola fila que reparte el ancho
—`flex-wrap` con base mínima, de modo que no quede un hueco cuando son impares— y movimiento por
gravedad. Lo crítico late sin parar; la advertencia entra y se queda quieta. Ninguno es la única
señal, y con `prefers-reduced-motion` no se mueve nada.

«Sala en vivo» pasó a llamarse **«Monitor de sala»**: era un tercer nombre para lo mismo y es la
estación del monitor.

## El acceso deja de ser mudo — 2026-09-14 (F2-03)

Un teclado numérico se usa de pie, con prisa y sin mirar la pantalla. El PIN se acusaba solo con
texto, y eso produce dos errores muy concretos: teclear de más o de menos, y volver a teclear el
mismo PIN errado creyendo que no se registró.

Cada dígito rebota al entrar; un PIN errado **sacude** la fila de puntos una vez, 320 ms, como una
negación con la cabeza; un PIN correcto pone los puntos verdes y **hace desaparecer el teclado**, que
deja su sitio al sello con «Adelante, <nombre>», a dónde se va y una barra que recorre mientras abre.
Ese último detalle no es estético: un teclado apagado invita a volver a pulsar, y así es como se
duplican las acciones.

Detalle de implementación que costó encontrar: el segundo PIN errado no se notaba, porque la clase de
la animación ya estaba puesta y el navegador no la repite. Se resuelve montando el elemento de nuevo
con el contador de fallos como `key`.

## Usuarios y permisos: de informe a gestión — 2026-09-14 (F2-11)

La pantalla enseñaba permisos y dejaba añadir excepciones, y nada más. No se podía dar de alta a
nadie, ni de baja, ni cambiar un rol, ni reponer un PIN: todo eso se hacía «hablando con quien
programa». Era un informe con un formulario pegado.

Los cinco cambios existen ahora, y lo primero que se escribió no fue la pantalla sino **las cinco
puertas**, en el dominio y con su prueba negativa cada una: solo quien alcanza `usuarios.gestionar`
en esa sucursal; nadie se da de baja ni se cambia el rol a sí mismo; el local no se queda sin
administración —ni dándola de baja ni degradándola—; y administrador solo lo nombra un administrador,
aunque a otro se le haya concedido gestionar personas por excepción. Todo lo que no encaje en una
regla escrita se niega.

Cada cambio deja su asiento en la historia de la persona, con quién, cuándo y **por qué**, incluido
reponer un PIN: «¿por qué se le repuso el PIN a la cajera el día del descuadre?» es exactamente la
pregunta que alguien hará. Y el cambio de rol guarda de dónde venía, porque «¿quién podía cobrar en
agosto?» se pregunta después de que pase algo.

En la disposición, tres decisiones: lista densa con buscador y filtro por rol (con siete personas
sobra una pila de tarjetas; con veinte, no); los permisos empiezan plegados con su resumen en una
línea, porque veintisiete filas seguidas no son jerarquía sino una pared; y el formulario de
excepciones pasó a una hoja, que ocupaba media ficha aunque no se fuera a usar.

## Auditoría de navegación y permisos — 2026-09-14

Con la interfaz cerrada, tocaba mirarla entera antes de empezar el backend: las trece rutas, la
matriz de §7.3 recorrida con el dominio, el mapa de módulos y las tres guardias. Está en
`docs/cerrados/AUDITORIA-NAVEGACION.md`, con la evidencia de cada hallazgo reproducida en el navegador.

Tres graves. **La monitora de parque acaba en la caja**: su puesto se calcula tomando la primera
superficie que alcanza de una lista que empieza por caja, y la taquilla cobra. **Hay dos verdades
sobre a dónde va cada rol** —el acceso las trae escritas a mano y `puestoDe` las deriva— y discrepan
justo en ese caso, que es como se encontró el primero. Y **«Dispositivos» del panel apunta a
`/acceso`**, la pantalla de bloqueo: para la administradora es indistinguible de que la hayan echado
de la sesión.

El que necesita decisión del cliente es otro: la caja y la taquilla no pueden abrir `/panel` pero sí
`/panel/caja`, porque son dos reglas escritas por separado. Hay que decidir si el back-office es solo
de administración y supervisión.

Nada de esto es seguridad todavía: las tres guardias son del navegador. La puerta de verdad es F2-05,
en el servidor, con esta misma matriz.

## Una sola puerta al back-office, y editable — 2026-09-14 (N-05, F2-13)

La auditoría dejó una pregunta que no se podía responder leyendo el código, porque el código decía dos
cosas: `/panel` pedía ver reportes y `/panel/caja` solo la acción del módulo, así que la cajera se
quedaba dentro de la cáscara del back-office, sin fila de Inicio y sin poder subir un nivel —las migas
la llevaban a una pantalla que le negaba el paso—. La pregunta era del cliente: ¿el back-office es
solo de administración y supervisión?

La respuesta fue «lo más óptimo, y además editable en Configuración», y eso cambió el arreglo de sitio.
Lo fácil era elegir una de las dos reglas y borrar la otra. Lo correcto resultó ser otra cosa: **una
sola puerta** —`reportes.verSucursal` para todo `/panel*`— y que **quién la cruza deje de estar
clavado en el código**.

**La matriz de §7.3 es la base, no un dogma.** Lo de fábrica es lo sensato para un parque con
restaurante; un local concreto decide que su caja cierra los domingos y necesita el resumen del día, y
eso no debería exigir un despliegue ni repetirse persona por persona. Así que la sucursal ajusta la
matriz desde Panel → Configuración → **Roles y accesos**, con motivo, autor y hora, y lo retira cuando
deja de hacer falta.

Lo que costó decidir bien fue **dónde poner esto sin montar un segundo sistema de permisos**. La
tentación era un ajuste de configuración aparte, con su propia lógica, leído por la guardia del panel:
dos fuentes de verdad sobre lo mismo, que es exactamente el hallazgo N-02 repetido. La solución fue
meterlo en el mecanismo que ya existía: `explainPermission` gana un escalón entre la matriz y las
excepciones por persona, y el orden queda **revocación de la persona → concesión de la persona →
ajuste del rol → matriz**. Lo de la persona gana siempre, porque es lo que se decidió mirándola a
ella (DEC-15).

**El suelo que ninguna sucursal puede tocar**, y es lo que hace que esto no sea un agujero:

- **La fila de administración.** Un local que se quita a sí mismo la administración se queda sin nadie
  que pueda devolvérsela, y eso no se arregla desde dentro del producto.
- **`usuarios.gestionar` y `catalogo.modificar`**, las dos llaves de la casa. La primera permite
  concederse todo lo demás; la segunda abre *esta misma pantalla*. Si se pudieran regalar por rol,
  cualquier ajuste sería el último que alguien necesita hacer.

Un ajuste guardado sobre una celda intocable —por un dato viejo o manipulado— **se ignora**, no se
obedece. Se comprueba en el dominio y otra vez al leerlo del almacén.

Y una distinción que el arreglo de N-01 dejó clara: **dónde se trabaja y qué se alcanza no son lo
mismo**. Al abrirle el panel a la caja, la cajera pasó a aterrizar en el panel al identificarse, que
no es lo que nadie quiere a las nueve de la mañana. El puesto de trabajo es un dato del rol; lo que
alcanza sale de la matriz y sus ajustes.

Comprobado de punta a punta en el navegador: antes, la caja no entra por ninguna de las tres puertas;
después de abrirla, la cajera entra al panel, **sigue aterrizando en la caja**, y sigue sin poder
abrir «Roles y accesos».

De la misma tanda salieron los otros dos graves: el destino de cada rol se decide ahora en un solo
sitio —la pantalla de acceso dejó de traerlo escrito a mano— y «Dispositivos» dejó de apuntar a la
pantalla de bloqueo.

Nada de esto es seguridad todavía: son tres guardias del navegador. La puerta de verdad es F2-05, en
el servidor, con esta misma matriz y estos mismos ajustes.

## La orquesta de modelos, y su primer encargo — 2026-09-16

El usuario quería trabajar con varias IA: Claude como maestra y Gemini (y más adelante DeepSeek) como
obreras. Se compararon las herramientas del momento y decidieron tres hechos: la suscripción Claude Pro
solo vale dentro de Claude Code (los términos de Anthropic lo prohíben en herramientas de terceros desde
febrero), Roo Code cerró en mayo, y la CLI de Gemini dejó de atender cuentas Pro en junio. Así que la
maestra es Claude Code y la obrera, la CLI de Antigravity (`agy`) con la suscripción Google AI Pro del
usuario, sin clave de API. PAL MCP quedó instalado para cuando haya clave.

**Primero se montó mal, y el usuario lo corrigió.** La obrera nació como revisora de solo lectura; el
usuario lo dijo sin rodeos —«Claude está programando, la idea es que Gemini lo haga»—. Rediseñada: la
obrera **programa**, pero en una **copia aislada** (`git worktree` hermano), con permisos que solo le
dejan escribir en `apps/` de esa copia y ejecutar `pnpm typecheck|test|arch|verify`. Ni `git`, ni
borrar, ni el dominio, ni los contratos: eso lo prepara la maestra antes de encargar. Cada límite se
comprobó por separado antes de confiarle nada.

**Un candado antes de mandar código fuera.** Los términos de Antigravity dicen que Google entrena con
lo que la herramienta lee, salvo que se desactive. El script se niega a trabajar hasta que quien lo usa
declara que lo desactivó.

**El piloto fue el editor de Carta y precios.** La maestra dejó el contrato listo (`retiredAt`, nombres
repetidos, carta sin nada que vender) y escribió un encargo con archivos, patrón, prohibiciones y
criterio de terminado. La obrera devolvió 8 archivos y 487 líneas en unos cinco minutos, con la
arquitectura bien y el grueso correcto. La maestra corrigió unas 60 líneas: un fallo real (el botón
«Editar» abría la hoja vacía, porque usaba una propiedad que no existe), un bucle que podía no terminar,
dos errores de tipos, un `TODO` perdido y detalles de interfaz.

**Dos lecciones que se quedan.** La obrera escribió en su resumen que el typecheck pasaría, sin haberlo
podido correr: el resumen de una obrera es una declaración, no una prueba. Y el motivo por el que no
pudo correrlo fue un permiso mal puesto por la maestra: en Windows la caja de arena de `agy` no aísla,
todos los comandos cuentan como «sin aislar», y negar eso negaba también `pnpm`. Se corrigió y se
comprobó que `pnpm` corre y `git` y `node` siguen negados.

También se vio que el servidor de desarrollo no siempre recoge los archivos que escribe `git apply`:
servía un 404 hasta que se tocaron. Queda anotado en el ciclo de la orquesta.

Antes del piloto, la obrera hizo una revisión de `equipo.ts` que encontró dos cosas buenas —un
`.parse` que dejaba un botón mudo si fallaba, y un sufijo de id que se repetía cada 28 minutos— y una
que no lo era. La maestra aceptó dos, descartó una y encontró otra que la obrera no vio: un rango de
expresión regular escrito con caracteres invisibles.

## Relevo: Tarifas, preparada para la obrera — 2026-09-16

Antes de cambiar de conversación se dejó hecha la parte de la maestra del siguiente encargo, para que la
sesión nueva empiece lanzándolo. El contrato ya tenía paquetes y política por separado; faltaba decidir
qué hace que **el conjunto** tenga sentido, porque se contradicen si se cambian por separado: un aviso de
«por vencer» de 30 minutos con un paquete de 20 salta en la misma entrada. `TarifarioSchema` los valida
juntos —al menos un paquete a la venta, precios en dólares y mayores que cero, sin nombres repetidos entre
los activos, pase libre solo al salir, aviso menor que el paquete más corto— con 9 pruebas.

El encargo quedó en `docs/encargos/tarifas-editor.md`, y `scripts/obrera.mjs` aprendió a leerlo con
`--encargo`: un encargo largo no debe pasar por las comillas de la terminal, y versionado junto al código
que produjo explica ese código mejor que cualquier comentario. Una decisión dentro del encargo: el
monitor calcula su modelo en el servidor y no puede leer un proveedor del navegador, así que su política
se queda para el backend, con su `TODO`.

## Frontend adaptable e instalable: auditoría conjunta y la app se instala — 2026-09-16 (F1-21)

El cliente pidió dos cosas que no estaban en el plan: que todo el frontend funcione en **cualquier**
tablet y desktop —no se sabe qué equipos llegarán— y que se instale en Android sin barra del navegador.
Se registró como F1-21 y se trabajó por primera vez con la orquesta en paralelo: skills compartidas por
las dos (con las reglas de Vercel fijadas en local para que nadie las cambie desde fuera) y copias por
tarea con permisos que el script pone y quita.

**La auditoría conjunta enseñó para qué sirve cada una.** La maestra midió 144 combinaciones de pantalla
y tamaño; la obrera leyó el código. La medición encontró los dos fallos graves —en una tablet de 1024×600
**no se puede terminar de cobrar** porque el teclado se corta, y en vertical la barra de estación se
monta—, y la obrera no vio ninguno de los dos: leyó unos 15 archivos para «todo el frontend» y devolvió
cuatro hallazgos, con un falso positivo. Desde ahora sus auditorías se encargan por áreas acotadas y la
medición, que es de la maestra, se repite al cerrar cada ola.

**La PWA la escribió la obrera y la corrigió la maestra.** Bien: manifiesto, iconos generados, service
worker que no cachea nada (la caché sin conexión es ADR-003 y llega con el backend; cachear ahora
serviría pantallas viejas), pantalla completa pedida dentro del clic de «Entrar» y solo con la app
instalada, botón «Instalar la app» y márgenes seguros. Corregido: los parámetros de la ruta de iconos
leídos como objeto cuando en Next 16 son una promesa; una segunda lista de estaciones escrita a mano
—el mismo error de «dos verdades» de N-02—; la barra móvil del panel con alto fijo, que se habría
aplastado con la muesca; y la regla de huérfanos, que no conocía las convenciones de la PWA.

Comprobado: Chrome la declara **instalable sin un solo error**; en el escritorio no cambia nada; y con la
app simulada como instalada, entrar a la caja la pone a pantalla completa y el botón de la barra la quita
y la vuelve a poner. Para instalarla en una tablet de verdad hace falta HTTPS, que llega con el despliegue.

## Cierre de la Ola 1 y una Ola 2 que no era la que se pensaba — 2026-09-17 (F1-21)

La Ola 1 cerró con la medición completa: 144 combinaciones sin un fallo, sin scroll horizontal, sin
errores y sin texto cortado a pelo. La app se instala. Pero medir de nuevo —que era la regla— cambió la
ola siguiente en tres puntos.

**El umbral de la caja no era de tablets.** La columna de cobro pide 657 px de alto en una sola
columna: 754 px de ventana. Eso deja fuera a la tablet de 1024×600, pero también a 1280×720 y a un
portátil corriente de 1366×768 con la barra del navegador. Apretar márgenes no alcanza —con controles de
56 px la columna no baja de ~590—, así que la respuesta es de disposición: por debajo de 760 px de alto,
el cobro se parte en dos subcolumnas (visor, medios, franja y acciones a un lado; el teclado entero al
otro). La estructura que pidió el cliente se conserva pieza por pieza: el teclado sigue siempre a la
vista. Para decirlo en CSS existe ahora la variante `bajo:`, y antes de encargar nada se comprobó en
qué orden la emite Tailwind: **todo lo `*:bajo:` sale después de todo lo `lg:` y `xl:`**, un detalle
que, sin comprobar, habría hecho que una clase de tablet pisara a una de escritorio.

**En vertical, el fallo era del marco.** Caja, entrada, monitor y turno desplazaban la página entera,
barra incluida, porque el marco de las estaciones solo medía la ventana desde 1024 px. Ahora la mide
desde 768: la barra queda quieta y cada pantalla desplaza dentro de su zona. Solo con eso el monitor
pasó a desplazar su lista y nada más, que es lo correcto.

**Medir vacío no basta.** Con tres niños cargados aparecieron cosas que la auditoría no vio: en la
entrada desplaza toda la zona —se van el lector y, en pantalla baja, «Registrar y cobrar»—, y el botón
de quitar pulsera mide 36 px (F-13). Y una captura enseñó que en el monitor a 768 px la tarjeta de un
niño con el tiempo cumplido se corta (F-14): la medición automática buscaba texto recortado, y aquí el
que recorta es la tarjeta. Las mediciones de cierre de ola se hacen desde ahora también con las
pantallas cargadas.

## El parque en tablet, con dos obreras a la vez — 2026-09-17 (F1-21, Ola 2)

Con permiso del cliente, dos obreras en paralelo: una con la caja y otra con el parque. La del parque
entregó primero y su diff era limpio y ceñido al encargo: la lista de niños desplaza sola, el panel del
representante y el de liquidación se parten en cuerpo y pie —el botón principal ya no se va de la
vista—, la entrada tiene en vertical su disposición propia (la lista arriba y el representante abajo,
más ancho que alto) y «Quitar» mide 48.

La medición encontró lo que el diff no dejaba ver. **La zona seguía desplazando entera**: el div raíz de
las dos pantallas crecía con su contenido porque le faltaba `min-h-0`, así que la lista nunca llegaba a
desplazar sola. Y **la tarjeta del monitor seguía cortada**: la causa no estaba donde apuntaba el
encargo (el cronómetro), sino en `StatusCard`, cuya rejilla sin columnas declaradas medía lo que el
nombre sin truncar. Las dos correcciones son de la maestra; la segunda, en @l2/ui, que es su carril.

Mientras las obreras trabajaban apareció una tablet que nadie había medido: la de 7" con densidad 1,33,
que mide **960×600** y en horizontal recibe la disposición vertical (F-15). La variante `apaisado:` ya
existe; su primera versión, con dos consultas separadas por coma, hacía que Tailwind generara un
selector inválido al combinarla con `bajo:` y tumbó el CSS de toda la app hasta pasarla a la forma de
bloque. Quedó comprobado su orden: después de `lg:`/`xl:` y antes de todo lo `bajo:`.

## La caja cobra en cualquier pantalla — 2026-09-17 (F1-21, Ola 2, F-02)

El fallo más grave de la auditoría —en una tablet de 1024×600 no se podía terminar de cobrar— quedó
resuelto sin tocar la estructura que pidió el cliente. Por debajo de 760 px de alto, la columna de cobro
se parte en dos: visor, medios, franja y acciones a la izquierda, y el teclado entero a la derecha, con
teclas que crecen hasta llenar el alto. Donde no caben tres columnas —tablets en vertical, 1024×600,
960×600—, la cola se pliega tras un conmutador «Por cobrar | Cuenta» que cambia solo: tocar una cuenta o
pasar una pulsera abre la cuenta; cobrarla entera vuelve a la cola. La cola nunca se desmonta, porque
dentro vive el lector de pulseras.

La obrera escribió casi todo bien. La maestra corrigió cuatro cosas: en dos columnas **ocultaba también
el cobro** al ver la cola, lo que habría dejado media pantalla vacía; los botones del conmutador medían
48 y no 56, porque el alto estaba en el contenedor con relleno; usaba un color literal en una sombra; y,
al llegar con una cuenta ya elegida desde la entrada o la salida, abría la cola en vez de la cuenta.
Además subió a 56 «Venta directa», «Añadir ítems» e «Identificar», y ajustó los anchos hasta que ningún
medio de pago se truncara.

Comprobado en diez tamaños, con el flujo entero —elegir, punto de venta, datos, cerrar— en los tres
donde la cola se pliega. En escritorio no cambió nada.

## El turno se cuenta entero — 2026-09-17 (F1-21, Ola 2, F-03)

El arqueo ponía las dos monedas lado a lado desde 768 px de ventana, pero lo que importa es el ancho de
la tarjeta: a 1024 en horizontal cada moneda tenía 288 px y el subtotal de cada billete quedaba fuera,
recortado sin aviso. Ahora decide la propia tarjeta (lado a lado desde 784 px) y, apiladas, la cabecera
de la moneda se queda fija al desplazar para saber qué se está contando. El turno es la primera pantalla
que usa `apaisado:` (F-15). Los cortes quedan a la vista en pantalla baja y la confirmación del corte Z
se desplaza sola hasta verse, con botones de 56.

La obrera lo hizo tal como se pidió. La maestra corrigió dos detalles que solo se ven midiendo: el
relleno de la cabecera fija alargaba el arqueo 15 px y volvía a hacer desplazar la pantalla a 1366×768,
donde el cliente pidió que no desplace; y los dos botones iguales de la confirmación partían «Sí, cerrar
el turno» en dos renglones.

## Cierre de la Ola 2: doce tamaños, ninguna estación desplaza — 2026-09-17 (F1-21)

La última pieza fue la tablet de 960×600. Con `apaisado:` la obrera cambió 32 clases en ocho archivos,
de forma mecánica y con una regla escrita en el encargo: lo que decide la disposición pasa a `apaisado:`,
lo que depende solo del ancho se queda. No hubo nada que corregir.

La medición de cierre creció a doce tamaños —se añadieron 1366×657 (un portátil con la barra del
navegador), 1280×720 y 960×600— y a 192 combinaciones: ningún fallo, ningún scroll horizontal, ningún
error, ningún texto cortado y **ninguna estación que desplace la página**. La medición con pantallas
cargadas, nueva en esta ola, confirma lo que importa: se cobra entero en todos los tamaños, el arqueo
enseña todos sus subtotales y el botón principal de entrada y salida no se va de la vista en horizontal.

Lo que dejó la ola para la siguiente: la navegación (N-04, N-06, N-07/N-08), el panel en tablet (F-09),
Tarifas y paquetes, y una decisión del cliente que la auditoría de navegación dejó escrita y nadie
tomó: si la taquilla ve las ventas del turno de los dos puntos de cobro (N-10).

## Otros puestos desde la barra — 2026-09-17 (F1-21, Ola 3, N-06)

La barra de estación solo enseñaba las pestañas del puesto actual, así que una cajera que también
atiende mesas —lo normal en un local de dos personas— no tenía cómo llegar a /mesas desde la caja. Ahora
un botón al final de las pestañas abre «Ir a otro puesto», con lo que su rol puede abrir, agrupado. No
cambia ninguna regla de quién ve qué: solo hace visible un camino que ya estaba permitido. Lo escribió la
segunda obrera, en paralelo con la de Tarifas, junto con los desplegables del menú lateral a 32 px y el
chip DEMO a 48; entró sin correcciones y se comprobó entrando con cinco roles.

## Tarifas y paquetes, el último editor del alcance de interfaz — 2026-09-17 (F5-04, Ola 3)

La primera obrera de la Ola 3 construyó el editor con el patrón de la carta: borrador con deshacer y
rehacer, «Publicar» que valida el conjunto con `TarifarioSchema`, paquetes que se retiran sin borrarse
—las estancias de ayer los nombran por su id— y las reglas del parque. La entrada ofrece solo lo que está
a la venta, y la salida e Inicio calculan con la política publicada. El monitor, que arma su modelo en
el servidor, queda con su `TODO` hasta el backend.

La maestra corrigió el formulario de reglas, que tenía un fallo de los que no se ven leyendo rápido: al
teclear en un campo, el borrador recibía el valor **anterior** de ese mismo campo, porque la función leía
el estado antes de que React lo actualizara; y cada tecla era un paso de deshacer. Ahora el error se
enseña mientras se escribe, el borrador cambia al salir del campo y deshacer va campo a campo. El
ejemplo del excedente («un niño que se pasa 20 minutos paga…») lo calcula ahora `@l2/domain-park`
con una estancia de ejemplo, en vez de repetir la fórmula en la pantalla, y el monto sale con el formato
del proyecto.

Probado en el navegador: cambiar una regla, deshacer y rehacer, un bloque de 0 que se rechaza junto al
campo, añadir «Hora y media» a 7,50, retirar «30 minutos», publicar y ver en la entrada exactamente los
paquetes nuevos; y retirarlos todos, que el contrato no deja publicar y lo dice.

## Solo la caja cobra — 2026-09-17 (DEC-25, DEC-26)

Al explicar N-10 —la taquilla veía las ventas de todo el turno— el cliente aclaró algo más amplio: **la
caja cobra todo**, lo del parque y lo del restaurante. La monitora registra entradas y salidas, y la
cuenta pasa a la cola de la caja. Se escribió como DEC-25 y se llevó al dominio: en la matriz, la monitora
deja de poder cobrar, reimprimir y anular (tres pruebas nuevas, y la que decía que «ve la caja» ahora dice
lo contrario). No se pierde flexibilidad: `documento.emitir` es ajustable por rol, así que un local que
la necesite cobrando se lo concede en Configuración sin programar. Con eso N-10 queda resuelto: Ventas es
de quien opera la caja.

El contrato de la salida llamaba `TAQUILLA` al destino «se paga ahora»; con DEC-25 el nombre decía lo
contrario de lo que pasa, y como aún no hay servidor que dependa de él se renombró a `CAJA`. El punto de
cobro del dominio de caja (`PointOfSale`) se queda como está, porque de los turnos el cliente todavía no
puede decir cómo serán: DEC-26 los deja genéricos —un turno por caja, como DEC-13— y ninguna pantalla
depende de ello.

La parte de pantalla la hizo la obrera ([solo-caja-cobra](encargos/solo-caja-cobra.md)): quien no puede
abrir la caja registra en la entrada con «Registrar y enviar a caja», y en la salida con «Enviar $ X a
caja»; la pantalla se queda lista para la siguiente familia y un aviso dice qué se envió. El turno ya no
enseña «Por punto de cobro» cuando solo cobró un punto, y los datos de ejemplo cobran todo en el
mostrador. La maestra sacó a una constante con nombre la condición de esa pestaña y adaptó los pasos de
la pantalla vacía («Registra y envía a caja»). Probado con dos roles en la misma tablet: la monitora
registra un prepago y una salida con excedente sin salir de su puesto, y la cajera los encuentra en su
cola.

## Documentos ordenados y plan final del frontend — 2026-09-17

El cliente pidió ordenar la documentación, quitar lo que sobra y un último plan para terminar el
frontend.

**Lo que se quitó.** La especificación v1 y su diagnóstico (`docs/archivo/`): los había superado el plan
v2 hace días y solo el plan los citaba; siguen en la historia de git y el plan dice cómo recuperarlos.
Nada más se borró, y no por pereza: `UX-MEJORAS.md` está cerrado, pero una veintena de comentarios del
código citan sus secciones para explicar por qué las cosas son como son, así que se marcó como cerrado en
vez de borrarlo; los encargos se versionan con el código que produjeron (regla de la orquesta); las dos
auditorías son la fuente de los hallazgos F-nn y N-nn que usan el plan y los commits; y los `AGENTS.md` y
`CLAUDE.md` de `apps/web` los vuelve a crear `next dev` cada vez que arranca.

**Lo que se ordenó.** `PLAN-FRONTEND.md` pasó de plan por olas a **plan final**: dónde estamos, los nueve
criterios de terminado con su estado, y lo que queda en cuatro olas. La Ola 4 es la pedida: las **diez
secciones del panel que seguían en «pendiente»** —tasas de cambio; insumos, recetas, compras y mermas;
representantes y niños; dispositivos; sucursal; impuestos e impresoras— más tres piezas de interfaz que
no tenían sección (apertura de turno, cortesía y medios de pago, cuyos datos del local la caja traía
fijos). Todas siguen el patrón que ya funcionó con tarifas y carta: contrato y proveedor de la maestra,
editor de la obrera, la estación leyendo lo publicado. Inventario está fuera de la Ruta A, así que queda
como decisión del cliente. Al repasar el menú aparecieron códigos de tarea que no correspondían (Tasas
apuntaba a los medios de pago; Sucursal, al PIN): se corrigen en la Ola 3.

`PENDIENTES.md` dejó de repetir lo de interfaz y remite al plan final; `PROGRESO.md`, las auditorías, los
README y el índice de `docs/` quedaron al día con DEC-25, DEC-26, la PWA y las 26 decisiones.

## Inventario entra en el cierre del frontend — 2026-09-17 (cambio de alcance)

Con el plan final sobre la mesa, la única decisión que quedaba era inventario: sus tres secciones
—insumos, recetas, compras y mermas— estaban **fuera de la Ruta A** (§11.3), que es el recorte que hace
realista el piloto con dos personas. El cliente decidió construirlas ahora.

Se registra como lo que es: un **cambio de alcance aprobado**, con su contrapartida escrita —el backend
empieza después de esa tanda—, porque la regla de §11.3 es que cada tarea nueva desplaza a otra. Entra
solo la interfaz: insumos con su unidad y su mínimo, recetas que dicen cuánto gasta cada plato de la
carta ya publicada, y compras y mermas como asientos (regla 5: nada se edita, todo se corrige con otro
movimiento). Descontar stock con cada venta, costear y avisar de stock crítico siguen siendo del
servidor.

## El panel avisa antes de sacarte, y se termina en tablet — 2026-09-17 (N-04, F-09)

Ocho secciones del back-office abren una estación a pantalla completa: al pulsarlas desaparecen el menú y
las migas. Ahora lo dicen antes, en el menú y en la tarjeta del módulo, y el mapa lo declara una sola vez
(`abre: "estacion"` en el tipo `Seccion`), que es lo que evita que la lista se desincronice. La otra mitad
de N-04 —quién puede volver— la había resuelto N-05 sin que nadie lo notara: con una sola puerta al panel,
quien llega por esas secciones es exactamente quien ve el botón «Panel» de la barra.

Con ello se cierra F-09: migas, desplegables, «Dispositivos» y la cifra del turno llegan a los 32 px de la
superficie de administración, y las dos rejillas de Inicio dejan de tener celdas vacías —la última zona
ocupa lo que sobra— a 2, 3 y 5 columnas. De paso apareció un resto de N-03: el enlace «Dispositivos» del
panel en vivo seguía llevando a la pantalla de bloqueo del equipo; ahora lleva a su sección.

Al revisar el mapa salieron seis códigos de tarea que no correspondían con el plan —«Tasas de cambio»
apuntaba a los medios de pago y «Sucursal» al acceso por PIN—, y un bloqueo que ya no existía en
«Comandas del día». Corregidos: el mapa es lo que la pantalla enseña cuando una sección todavía no está.

## El acceso sale del directorio, y la auditoría de navegación queda cerrada — 2026-09-17 (N-07, N-08)

Había dos listas de personas: la del acceso, escrita a mano con identificadores `u0…u5`, y la del
directorio de «Usuarios y permisos», con `u-abigail`… La consecuencia no era cosmética: dar de baja a
alguien no lo quitaba del acceso —Carla no aparecía por casualidad— y el mismo acto habría quedado
firmado por dos identidades distintas el día que exista auditoría.

Ahora el acceso lee el directorio y filtra `active`, y el nombre del rol sale del catálogo, que nombra la
función y no a la persona. «Usuarios y permisos» y «Roles y accesos» firman con quien entró por el
acceso; la obrera había dejado un actor «Anónimo» con rol de mesero para el caso sin sesión, y se
cambió por no pintar nada: la cáscara del panel ya exige sesión, y firmar un cambio con una identidad
inventada es peor que una pantalla vacía.

Con esto se cierran los diez hallazgos de la auditoría de navegación y la Ola 3 del plan final. Sigue la
Ola 4: las diez secciones que el panel todavía enseña como pendientes.

## Sucursal y Dispositivos: dos secciones menos en «pendiente» — 2026-09-18 (Ola 4, tanda A)

Dos obreras a la vez, en archivos que no se tocan, y con una regla nueva que evitó el choque: ninguna
montó su proveedor ni su ruta —`layout.tsx`, el mapa de pantallas y el menú los conectó la maestra al
integrar—, porque esos tres archivos los habrían escrito las dos.

**Sucursal** (F5-08b, F4-04c, F6-13) saca del código lo que estaba clavado: nombre, RIF y dirección, el
horario de los siete días, el formato de hora —que ahora cambia la salida, el monitor y los
dispositivos—, el umbral de vuelto que puede quedarse en la caja y el servicio. Probado: publicar 24 h y
verlo en la salida; subir el umbral a $2; y un lunes que cierra antes de abrir, que el contrato no deja
publicar y lo dice con su mensaje.

**Dispositivos** (F2-02) enseña los equipos con su estado, quién tiene sesión y su historia, y deja
aprobar, revocar y renombrar con motivo obligatorio. Aquí la revisión encontró un fallo de los que no se
ven leyendo: el proveedor validaba **dentro** del actualizador de estado de React, así que renombrar dos
equipos igual habría reventado el pintado en vez de explicarse; el `try/catch` de la pantalla tampoco
podía atraparlo. Ahora el cambio se calcula y se valida fuera, el error vuelve como texto y el diálogo se
queda abierto con lo escrito. Comprobado: «Dos dispositivos no pueden llamarse igual» con el motivo
intacto, y el renombrado válido a continuación.

Además: los días de la semana salían sin tilde («Miercoles»), la hora de sesión se pintaba «06:00 a. m.»
en vez de con el formato del proyecto, y «Ver historia» medía 18 px en una superficie de 32.

## La entrada se rediseña: la pulsera es el nombre — 2026-09-18 (DEC-27, DEC-28, DEC-29)

Antes de construir el directorio de familias, el cliente pidió estudiar el flujo del parque. Cinco
preguntas sobre cómo se comporta la gente en el local dieron tres datos que cambian el diseño: se puede
entrar **con la pulsera y el representante**, y el nombre del niño ponerse después; los adultos **dejan a
los niños y se sientan**, así que vincular la pulsera a la mesa debería poder hacerlo quien está en la
puerta; y **las tablets no tienen teclado**, con cola en las horas buenas.

Eso convierte lo que parecía una pantalla más —«Representantes y niños»— en un rediseño de la entrada.
Teclear dos nombres de niño en una tablet era lo que más tardaba de un registro que el plan quiere en
menos de 90 segundos, y ninguna regla de tiempo ni de dinero depende de ese nombre: **la estancia se
identifica por la pulsera, que el niño lleva puesta**. Se cerraron tres decisiones: el contacto del
representante es obligatorio (DEC-27), el nombre del niño es opcional de principio a fin (DEC-28), y
vincular a una mesa lo pueden hacer la puerta y el mesero (DEC-29).

En el contrato, `KidSchema.name` pasa a opcional y aparece `NombrarEstanciaCommandSchema`, que no pide
motivo: poner un nombre es completar un dato, no una decisión que justificar. En el dominio,
`ParkSession.childName` es opcional. Y en la interfaz hay ahora un solo sitio que decide cómo se llama
una estancia en pantalla —apodo, nombre o pulsera—, para que las cinco pantallas que la muestran digan lo
mismo. Cuatro pruebas nuevas (contracts: 127).

## La puerta en dos toques y la sala que completa — 2026-09-18

Lo que las tres decisiones del día pedían ya está en pantalla, hecho por dos obreras en paralelo sobre
archivos que no se tocan.

**La entrada** perdió los campos de nombre. Ahora la pantalla tiene un solo campo de texto —el teléfono
del representante— y todo lo demás son pulseras que entran por el lector y paquetes que se eligen con el
dedo. Medido a 1280×800 y a 1024×600: dos pulseras hacen dos filas, la familia conocida aparece sola, y
la cuenta que llega a la caja se llama por sus pulseras. El teléfono ya no es opcional y el botón apagado
dice cuál de las dos cosas falta.

**La sala** gana lo que la puerta ya no hace: en la ficha del niño, «Poner nombre» —que si escribes una
letra deja el error junto al campo y no guarda nada— y «Vincular a una mesa», que trae marcados a los
hermanos que aún no tienen mesa, ofrece solo las mesas abiertas y dice a cuál va. Probado con un guion
en marcha: dos hermanos a la mesa 1, y la ficha pasa a decir «En la mesa 1».

De la revisión salió un fallo que el compilador no ve: `can()` devuelve una palabra —`PERMITIDO`,
`REQUIERE_AUTORIZACION`, `DENEGADO`—, no un booleano, así que `actor ? can(...) : false` era cierto para
cualquiera que hubiera entrado. Es la tercera vez que un permiso se lee así; queda anotado para la
auditoría de la Ola 5. Lo demás fueron ajustes de sitio: «cómo paga» se quedaba medio tapado en una
tablet de 600 px de alto y ahora va pegado al botón que decide.
