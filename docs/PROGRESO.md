# Progreso real

> **Actualizado:** 2026-09-09 · Contrastado contra los criterios de aceptación de
> [PLAN.md §12](PLAN.md). Una tarea solo cuenta como hecha si su criterio se cumple y es
> demostrable — «ya lo programé» no basta.

## Resumen

| Fase | Hechas | Parciales | Pendientes | Estado |
|---|---:|---:|---:|---|
| F0 · Descubrimiento y decisiones | 4 | 1 | 5 | En curso — bloqueada por trabajo de campo |
| F1 · Cimientos técnicos | 8 | 2 | 6 | En curso |
| F2 · Identidad, permisos y auditoría | 2 | 2 | 6 | Permisos y acceso por PIN |
| F3 · Núcleo monetario y fiscal | 4 | 0 | 8 | Motor de impuestos listo |
| F4 · Caja y cobro mixto | 0 | 9 | 2 | Cobro, arqueo y cortes en pie |
| F5 · Parque | 4 | 4 | 8 | Tres superficies en pie |
| F6-F12 | 0 | 0 | — | Fuera de la Ruta A o sin empezar |

**Se puede ver funcionando:** monitor (`/monitor`), entrada (`/entrada`), salida (`/salida`) caja (`/caja`) turno (`/turno`) acceso (`/acceso`) y la cáscara por rol en `/`, con datos de ejemplo **derivados del contrato**.

> **Orden de ejecución cambiado el 2026-09-09** (§11.4): frontend → backend → producción.
> La condición para que ese orden no genere retrabajo es contratos primero, y ya está en marcha.

---

## F0 · Descubrimiento, cumplimiento y decisiones

| Tarea | Estado | Nota |
|---|---|---|
| F0-01 Asesoría fiscal | Pendiente | DEC-1: el cliente decidió que no es crítico ahora. F7 sale de la ruta crítica |
| F0-02 Imprenta y máquina fiscal | Pendiente | Diferido con F0-01 |
| F0-03 Relevamiento en sitio | **Pendiente** | **Es trabajo de campo y bloquea F1-16 y F10-07** |
| F0-04 Datos maestros reales | **Pendiente** | **Bloquea las semillas. Hoy se trabaja con datos inventados** |
| F0-05 Facturas reales | Pendiente | Diferido con F0-01 |
| F0-06 Tenencia y offline | ✅ Hecha | DEC-3 multi-tenant, DEC-4 topología C |
| F0-07 Monedas y redondeo | ✅ Hecha | DEC-2 USD funcional; DEC-5 resolvió el vuelto (§5.6) |
| F0-08 Datos de menores | ✅ Hecha | DEC-9: nombre, apodo, edad opcional y una referencia |
| F0-09 Firma del alcance | Parcial | Las 12 decisiones están cerradas; falta la firma formal |
| F0-10 ADRs escritos | ✅ Hecha | `docs/adr/`, 17 archivos, uno por decisión |

## F1 · Cimientos técnicos

| Tarea | Estado | Evidencia o qué falta |
|---|---|---|
| F1-01 Monorepo | ✅ Hecha | `pnpm build` en verde; cada paquete con su README |
| F1-02 TypeScript estricto | ✅ Hecha | `exactOptionalPropertyTypes` ya atrapó un error real que el dev server no ve |
| F1-03 Fronteras automatizadas | ✅ Hecha | `pnpm arch` 0 violaciones sobre 218 módulos; `pnpm arch:demo` prueba que muerde |
| F1-04 Docker Compose | Pendiente | PostgreSQL 17 + Valkey 8 |
| F1-05 Prisma + RLS forzada | Pendiente | **Es la siguiente pieza estructural** |
| F1-06 Tokens de diseño | ✅ Hecha | `packages/config/tokens.css`; ningún color literal fuera |
| F1-07 Tipografía | ✅ Hecha | Quicksand + Inter con numerales tabulares |
| F1-08 Primitivos + Storybook | **Parcial** | Primitivos y patrones sí. **Storybook no** — diferido en la Ruta A |
| F1-09 Contratos Zod | ✅ Hecha | `@l2/contracts`, 17 pruebas. Los datos de ejemplo se derivan del contrato (§11.4) |
| F1-10 Puertos de hardware | **Parcial** | Escáner sí. **Impresora, gaveta y dispositivo fiscal, no** |
| F1-11 Hook de escaneo | ✅ Hecha | Captura sin foco, valida formato, limita frecuencia |
| F1-12 Plantillas de ticket | Pendiente | 58 y 80 mm; la impresora comprada admite ambos |
| F1-13 Observabilidad | Pendiente | Logger con redacción, trazas, métricas |
| F1-14 CI | **Pendiente** | **`pnpm verify` existe pero nada lo ejecuta solo. Ver abajo** |
| F1-15 Staging | Pendiente | — |
| F1-16 Semillas | Pendiente | Bloqueada por F0-04 |

## F3 · Núcleo monetario — adelanto

Se construyó antes de tiempo porque el monitor de parque necesita mostrar el excedente.

| Tarea | Estado | Evidencia |
|---|---|---|
| F3-01 Paquete de dinero | ✅ Hecha | `Money` con `bigint`; sumar USD con Bs no compila; 14 pruebas |
| F3-12 `MoneyDisplay` | ✅ Hecha | Única vía de mostrar dinero; recibe cadena, no el tipo del dominio |
| F3-02 Prohibición de `FLOAT` en esquema | Pendiente | Necesita base de datos (F1-05) |
| F3-06 Motor de IVA con vigencias | ✅ Hecha | `@l2/domain-tax`; una factura vieja se recalcula con la regla que tenía |
| F3-07 Motor de IGTF por medio de pago | ✅ Hecha | Solo la porción en divisas o cripto; los 8 casos límite de §5.3 con prueba |
| F3-03 a F3-05, F3-08 a F3-11 | Pendiente | Tasas, ledger, vuelto, día de negocio, y las facturas reales del contador |

## F5 · Parque — prototipo de interfaz

| Tarea | Estado | Nota |
|---|---|---|
| F5-02 Registro rápido en entrada | **Parcial** | Pantalla completa en `/entrada`. Escaneo, foco automático, aforo, rechazo de pulsera ocupada. **Falta calibrar el umbral del lector con el aparato real** y el backend |
| F5-03 Búsqueda de representante | ✅ Hecha | Por teléfono; si ya vino, no se teclea nada |
| F5-03b Aforo con aviso | ✅ Hecha | Avisa antes de permitir un check-in de más; límite configurable |
| F5-04 Paquetes de tarifa | Parcial | Selector con botones grandes sobre el catálogo del contrato; falta que sea editable |
| F5-14 Salida y liquidación | ✅ Hecha (interfaz) | Pantalla en `/salida`. Varios niños en una salida, desglose paquete + excedente con minutos y bloques, y las dos rutas del plan: taquilla o cargo a mesa. Falta el backend |
| F5-08b Formato de hora configurable | Parcial | La hora de entrada se muestra en las tarjetas y el formateador acepta 24 h o 12 h; falta que la preferencia sea editable por sucursal |
| F5-08 Tablero en tiempo real | **Parcial** | La interfaz está y se lee a distancia. **Falta el WebSocket**: hoy no se actualiza solo |
| F5-10 Filtro por escaneo | ✅ Hecha | Pasar la pulsera resalta al niño, sin foco previo |
| F5-12 Sesión única por pulsera | Parcial | La interfaz lo rechaza; la invariante real necesita base de datos |
| F5-01, F5-05 a F5-14 (resto) | Pendiente | Necesitan persistencia |

Las reglas de tiempo, gracia, penalización y aforo **ya están escritas y son puras**
(`@l2/domain-park`); lo que falta es conectarlas a datos reales.

---

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

## Lo que hay que arreglar antes de seguir

1. **F1-14, la CI.** `pnpm verify` comprueba arquitectura y pruebas, pero **nadie lo ejecuta
   automáticamente**. Hoy las reglas solo muerden si alguien se acuerda de invocarlas — que es
   exactamente lo que §9.3 dice que no funciona. Es la tarea de mayor retorno pendiente.
2. **F1-05, Prisma con RLS.** Todo lo demás de la Ruta A depende de tener persistencia.
3. **F0-03 y F0-04, el trabajo de campo.** Hoy el sistema se prueba con nombres y tarifas
   inventadas. Hasta que entren el menú y las tarifas reales, no se puede validar nada con el
   cliente.
4. ~~Sin pruebas de `@l2/domain-park`~~ — **saldado**: 20 pruebas, incluidos los bloques de
   penalización y los bordes de la gracia.
5. **Modelo de pulsera corregido el 2026-09-09.** El cliente aclaró que son **desechables**: el
   código muere al salir el niño. Desaparecen `Wristband` y `WristbandAssignment` del modelo
   (§6.6). Consecuencia menos obvia y ya registrada: un lote nuevo puede repetir códigos de uno
   viejo, así que **la unicidad vale solo entre estancias activas**, nunca sobre el histórico.
6. **Calibrar el umbral del lector.** `ScannerField` distingue al lector de una persona por
   velocidad (55 ms entre pulsaciones). El valor depende del hardware y **F1-11 no está cerrada
   hasta comprobarlo con el aparato que compró el cliente**.

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

## Deuda técnica registrada

| Qué | Por qué se aceptó | Cuándo se salda |
|---|---|---|
| Sin Storybook | Recorte de la Ruta A | Cuando entre un tercer consumidor de `@l2/ui` |
| ~~Sin pruebas en `domain/park`~~ | Saldado el 2026-09-09: 20 pruebas | — |
| Datos de ejemplo en `features/park/fixtures.ts` | No hay backend. **Mitigado:** se validan contra el contrato al construirse, así que la forma ya es la definitiva | F1-05 + F0-04 |
| Solo el puerto de escáner | La impresora no hacía falta para el monitor | F1-12 |
| `apps/printer-agent` sin construir | DEC-8: la impresora admite red | No se construye salvo que aparezca una impresora solo-USB |
