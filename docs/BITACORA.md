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
[UX-MEJORAS.md](UX-MEJORAS.md), con maquetas en `docs/diseno/` y un orden propuesto (V1-V5).
**No se construyó nada: es una propuesta para aprobar.**

El dibujo corrige al prototipo: son 8 mesas redondas de **4 sillas**, cuatro junto al parque y dos
filas de dos hacia la calle, con la caja en L y la cocina detrás. Se propone un plano espacial en dos
modos que nunca se mezclan. En servicio nada se arrastra. En edición, solo la administración mueve
mesas, con borrador, publicación versionada y retirada en vez de borrado, porque los pedidos del pasado
nombran la mesa. Quedan cuatro decisiones: quién edita el plano (D10), numeración y zonas (D11), si hay
venta directa en caja (D6) y si el back-office puede desplazar (D12).

## V1: avisos, identidad y salidas animadas — 2026-09-12

El cliente aprobó el mini plan de [UX-MEJORAS.md](UX-MEJORAS.md) y se hizo V1:

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
todo a todos. Ahora las cuatro reglas de [UX-MEJORAS.md](UX-MEJORAS.md) §3 salen de la matriz de §7.3,
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

La auditoría de Caja quedó en [UX-MEJORAS.md](UX-MEJORAS.md) §9. Además de lo anterior, se corrigieron el
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
