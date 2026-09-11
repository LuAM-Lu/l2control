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
