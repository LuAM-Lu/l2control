# Progreso real

> **Actualizado:** 2026-09-14 · Contrastado contra los criterios de aceptación de
> [PLAN.md §12](PLAN.md). Una tarea solo cuenta como hecha si su criterio se cumple y es
> demostrable — «ya lo programé» no basta.
>
> Aquí está **el estado**, tarea por tarea. **Qué se hizo y por qué**, con fecha, está en
> [BITACORA.md](BITACORA.md).

## Resumen

| Fase | Hechas | Parciales | Pendientes | Estado |
|---|---:|---:|---:|---|
| F0 · Descubrimiento y decisiones | 4 | 1 | 5 | En curso — bloqueada por trabajo de campo |
| F1 · Cimientos técnicos | 8 | 2 | 6 | En curso |
| F2 · Identidad, permisos y auditoría | 2 | 4 | 6 | Permisos por persona, sesión compartida y quién autoriza |
| F3 · Núcleo monetario y fiscal | 4 | 0 | 8 | Motor de impuestos listo |
| F4 · Caja y cobro mixto | 2 | 11 | 1 | Interfaz completa: ventas, reimpresión, anulación y cuentas de mesa divididas; falta persistencia |
| F5 · Parque | 4 | 4 | 8 | Tres superficies en pie |
| F6 · Restaurante (interfaz, DEC-22) | 1 | 7 | 6 | Mesas con plano y editor, cocina (KDS) y caja de mesas con división |
| F9 · Back-office y panel en vivo | 0 | 2 | — | Panel con sus módulos y **el local en vivo** (F9-08) |
| F7-F12 (resto) | 0 | 0 | — | Fuera de la Ruta A o sin empezar |

**Se puede ver funcionando:** entra por `/` (acceso por PIN `1970`). Estaciones: `/monitor`, `/entrada`, `/salida`, `/caja`, `/ventas`, `/turno`, `/mesas`, `/cocina`. El chip «DEMO» de cada barra abre el simulador, que reproduce una tarde del local. Back-office: `/panel`, con sus módulos, `/panel/personas/usuarios` y **`/panel/vivo`, el local ahora mismo**. Todo con datos de ejemplo **derivados del contrato**, aislados en `apps/web/src/demo` y apagables con `NEXT_PUBLIC_DEMO=off`.

**Todo lo que falta, en una sola lista:** [PENDIENTES.md](PENDIENTES.md).

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
| F1-03 Fronteras automatizadas | ✅ Hecha | `pnpm arch` 0 violaciones sobre 336 módulos; `pnpm arch:demo` prueba que muerde. Regla nueva: la demo solo entra por las rutas (`demo-solo-desde-las-rutas`) |
| F1-04 Docker Compose | Pendiente | PostgreSQL 17 + Valkey 8 |
| F1-05 Prisma + RLS forzada | Pendiente | **Es la siguiente pieza estructural** |
| F1-06 Tokens de diseño | ✅ Hecha | `packages/config/tokens.css`; ningún color literal fuera |
| F1-07 Tipografía | ✅ Hecha | Quicksand + Inter con numerales tabulares |
| F1-08 Primitivos + Storybook | **Parcial** | Primitivos y patrones sí. **Storybook no** — diferido en la Ruta A |
| F1-09 Contratos Zod | ✅ Hecha | `@l2/contracts`, 64 pruebas. Los datos de ejemplo se derivan del contrato (§11.4) |
| F1-10 Puertos de hardware | **Parcial** | Escáner sí. **Impresora, gaveta y dispositivo fiscal, no** |
| F1-11 Hook de escaneo | Parcial | Captura sin foco, valida formato, limita frecuencia y ya no pierde el primer carácter al navegar (un solo oyente para toda la app). Falta calibrar el umbral con el lector real |
| F1-12 Plantillas de ticket | Pendiente | 58 y 80 mm; la impresora comprada admite ambos |
| F1-13 Observabilidad | Pendiente | Logger con redacción, trazas, métricas |
| F1-19 Simulador de operación | Parcial | Motor, proyección del local, tres escenarios y panel de control; sincronizado entre pestañas. Acepta eventos que emiten las pantallas, validados también al llegar de otra pestaña. Lo consumen el monitor y las mesas. Faltan escenarios de FLUJOS §5 |
| F1-20 Catálogo de eventos | Parcial | Contrato Zod de los eventos de FLUJOS §4 que emite el simulador; faltan los de cuentas |
| F1-14 CI | **Pendiente** | **`pnpm verify` existe pero nada lo ejecuta solo. Ver abajo** |
| F1-15 Staging | Pendiente | — |
| F1-16 Semillas | Pendiente | Bloqueada por F0-04 |

## F2 · Identidad, permisos y auditoría

| Tarea | Estado | Evidencia o qué falta |
|---|---|---|
| F2-02 Registro de dispositivos | Parcial | El dominio distingue aprobado, pendiente, revocado y desconocido; falta el alta real |
| F2-03 Acceso por PIN y dispositivo | Parcial | `/acceso`: el dispositivo es el primer factor y el bloqueo crece. Falta Better Auth |
| F2-05 Motor de permisos `can()` | ✅ Hecha | Matriz de §7.3 como dato, deny-by-default; cada ❌ con prueba negativa. `cobro.anular` y `canAuthorize` (quién da un 🔐) desde DEC-24; 81 pruebas en `@l2/domain-identity` |
| F2-06 Alcance por sucursal | ✅ Hecha | La sucursal es parte del permiso, no un `if` aparte |
| F2-11 Permisos por persona | Parcial | Concesiones y revocaciones, auditadas, sin ampliar la sede; pantalla en `/panel/personas/usuarios`. Falta persistirlas |
| F2-12 Sesión compartida | Parcial | Bloqueo por inactividad, cambio de usuario a un toque, el corte Z devuelve al acceso. La sesión (quién y con qué rol) sale del acceso y recorta barra, menú y pantallas por la matriz (V2). Vive en la pestaña: falta la sesión real del servidor |
| F2-01, F2-04, F2-07 a F2-10 | Pendiente | Necesitan backend |

## F3 · Núcleo monetario — adelanto

Se construyó antes de tiempo porque el monitor de parque necesita mostrar el excedente.

| Tarea | Estado | Evidencia |
|---|---|---|
| F3-01 Paquete de dinero | ✅ Hecha | `Money` con `bigint`; sumar USD con Bs no compila; 14 pruebas |
| F3-12 `MoneyDisplay` | ✅ Hecha | Única vía de mostrar dinero; recibe cadena, no el tipo del dominio. Incluye `formatMoneyVE` para formato oficial normativo de Venezuela (`Bs. 18.272,80`) y `$ 94.17` |
| F3-02 Prohibición de `FLOAT` en esquema | Pendiente | Necesita base de datos (F1-05) |
| F3-06 Motor de IVA con vigencias | ✅ Hecha | `@l2/domain-tax`; una factura vieja se recalcula con la regla que tenía |
| F3-07 Motor de IGTF por medio de pago | ✅ Hecha | Solo la porción en divisas o cripto; los 8 casos límite de §5.3 con prueba |
| F3-03 a F3-05, F3-08 a F3-11 | Pendiente | Tasas, ledger, vuelto, día de negocio, y las facturas reales del contador |

## F4 · Caja y cobro mixto

| Tarea | Estado | Evidencia o qué falta |
|---|---|---|
| F4-01 Apertura de turno | Parcial | Fondo inicial por moneda en los datos del turno; falta la pantalla de apertura |
| F4-01b Punto de cobro | Parcial | Cada movimiento declara su punto y el cuadre lo desglosa; fail-closed sin punto |
| F4-02 Medios de pago | Parcial | Catálogo en los datos, no `enum`; 6 medios con iconos y jerarquía financiera |
| F4-03 Cobro mixto | Parcial | `/caja`: varias monedas y medios en un cobro, con tasa congelada. Rediseño ágil bimoneda: atajo 1-toque «Cobrar exacto», billetes fijos de $1 a $100 que suman al mismo pago (sin «Cobrar exacto» en efectivo), datos de Pago Móvil con botón Copiar, hero apilado para montos grandes en Bs, y catálogo táctil de venta directa en mostrador (D6/V5) |
| F4-04b Vuelto y sus tres destinos | Parcial | Vuelto, propina o caja; la invariante de cierre no admite ajustes silenciosos |
| F4-04c Umbral de residuo | Parcial | Por encima del umbral no se retiene; falta que lo configure el administrador |
| F4-05 y F4-06 Cortes X y Z | Parcial | `/turno`: X repetible, Z irreversible con confirmación |
| F4-07 Arqueo por denominación | Parcial | Contador táctil por billete, teórico oculto hasta contar |
| F4-08 Excepciones del turno | Parcial | Visibles en turno e inicio en formato 12h; faltan las reales del libro |
| DEC-23 Cliente de la factura | Parcial | `ClienteFacturaSchema` (3 pruebas); en caja, «Factura a: Consumidor final» con «Identificar» (cédula o RIF, nombre, dirección fiscal opcional), documento enmascarado. Falta llevarlo al documento fiscal (F3, F7) |
| F4-04 Campos por medio de pago | Parcial | Contrato `DatosDePagoSchema` (5 pruebas): referencia y banco de Pago Móvil, titular de Zelle, TxID y red de USDT, terminal y referencia del punto. Se exigen al añadir el pago y se muestran enmascarados. Falta el cifrado en reposo y la redacción en logs, que son de servidor |
| Ventas del turno (C12) | ✅ Hecha (interfaz) | `/ventas`: contrato `VentaCerradaSchema` con la foto del recibo y sus impresiones (4 pruebas); la caja registra cada cobro; reimprimir sale «COPIA» con rastro. Anular (DEC-24): `refundableByTender` en el dominio de caja (6 pruebas), `AnulacionSchema` en el contrato (6 pruebas), diálogo con motivo, devolución y PIN; la cuenta vuelve a «por cobrar». Falta: turno y gaveta reales, PIN y auditoría en servidor, nota de crédito (F3) |
| UX Caja §9 (C5-C8, V4, V5, U3) | ✅ Hecha (interfaz) | Cola por antigüedad con espera y aviso de llegada, pulsera y buscador, corregir un pago tocándolo, atajos de teclado a prueba del lector, recibo no fiscal (imprimir, WhatsApp). Comprobado a 1366 y 1280 |
| F4-09 | Pendiente | Gaveta asociada a operación |

## F6 · Restaurante — interfaz sobre el simulador (DEC-22)

| Tarea | Estado | Evidencia o qué falta |
|---|---|---|
| F6-01 Plano de mesas | Parcial | `/mesas`: **plano espacial** en SVG con las medidas del local en cm (V3), parque, entrada, caja en L y cocina; mesas con sus sillas (las ocupadas rellenas) y la barra en L como una pieza; conmutador Plano \| **Atender**, que lista solo lo que pide acción; tocar elige, nunca mueve. Contrato `PlanoLocalSchema`: fuera de las paredes o encima de otra no se publica (5 pruebas). **Editor en Panel → Restaurante → Plano del local** (V4, solo administración): añadir, mover con rejilla de 10 cm o con las flechas, girar, renumerar, cambiar zona y **retirar sin borrar**; borrador con deshacer y «Publicar», que niega mesas fuera de las paredes o encima de otra. **8 mesas de 4 sillas inventadas hasta F0-03**; falta el servidor y la capa de estructura editable |
| F6-02 Estados de mesa en vivo | Parcial | Libre, ocupada, pide la cuenta, por limpiar, con minutos y color + icono + texto; una mesa abierta no se abre dos veces (I-05). Sin servidor |
| F6-03 Carta táctil | Parcial | Categorías y platos de 88 px, agotados visibles pero no pedibles, borrador con notas y confirmación antes de cocina. **Carta y precios inventados hasta F0-04** |
| F6-04 Modificadores | Pendiente | Hoy solo nota libre por plato |
| F6-07 KDS | Parcial | `/cocina`: comandas por antigüedad con cronómetro y nivel de espera (a tiempo, tarda, atrasada), «Empezar» y «Lista» de 64 px, columna de listas para servir, chip «sin ticket» y anulaciones en rojo que solo se van cuando la cocina confirma que las vio (FLUJOS C5). Comprobado a 1366, 1280 y 1024 con el escenario X5. Falta el servidor y el umbral configurable |
| F6-08 Máquina de estados de la comanda | ✅ Hecha | `@l2/domain-orders` (11 pruebas): solo avanza hacia delante, un evento repetido o retrasado no hace retroceder, anular tras LISTO exige revertir inventario y el nivel de espera es puro |
| F6-05 Vincular pulseras y cuenta de mesa | Parcial | Hoja con lector y lista por familia; un niño de otra mesa no se ofrece y al escanearlo se dice dónde está. **Cuenta de mesa hecha (D2, D3)**: cada pedido enviado entra en ella con el precio de carta, vincular mueve el parque desde la cuenta de la familia (la línea queda con `movedTo`, nada se borra), «Pide la cuenta» la manda a la cola de caja y al cobrar la mesa queda por limpiar. **Cobro dividido** (F6-12): la cuenta se divide en 2 a 6 partes iguales sobre el total del documento con la regla del mayor resto, cada parte se cobra por separado con su recibo («Parte 2 de 3») y la cuenta sigue en la cola hasta la última. Falta dividir por ítems; la propina explícita (F6-13) pasa a Configuración |

## F5 · Parque — prototipo de interfaz

| Tarea | Estado | Nota |
|---|---|---|
| F5-02 Registro rápido en entrada | **Parcial** | Pantalla completa en `/entrada`. Escaneo, foco automático, aforo, rechazo de pulsera ocupada. **Falta calibrar el umbral del lector con el aparato real** y el backend |
| F5-03 Búsqueda de representante | ✅ Hecha | Por teléfono; si ya vino, no se teclea nada |
| F5-03b Aforo con aviso | ✅ Hecha | Avisa antes de permitir un check-in de más; límite configurable |
| F5-04 Paquetes de tarifa | Parcial | Selector con botones grandes sobre el catálogo del contrato; falta que sea editable |
| F5-14 Salida y liquidación | ✅ Hecha (interfaz) | Pantalla en `/salida`. Varios niños en una salida, desglose paquete + excedente con minutos y bloques, y las dos rutas del plan: taquilla o cargo a mesa. Falta el backend |
| F5-08b Formato de hora comercial 12h | Parcial | La hora se muestra en formato comercial 12h con sufijo en minúsculas (`2:00 pm`, `10:30 am`); falta persistir preferencia por sucursal |
| F5-08 Tablero en tiempo real | **Parcial** | La interfaz está y se lee a distancia. **Falta el WebSocket**: hoy no se actualiza solo |
| DEC-21 Cuenta de la familia | Parcial | Entrada elige prepago o cuenta abierta; la salida dice qué pasa a caja; la caja es una cola de cuentas en maestro-detalle y devuelve a la pantalla de origen. Probado de punta a punta en navegador. Falta el backend |
| F5-10 Filtro por escaneo | ✅ Hecha | Pasar la pulsera resalta al niño, sin foco previo |
| F5-12 Sesión única por pulsera | Parcial | La interfaz lo rechaza; la invariante real necesita base de datos |
| F5-01, F5-05 a F5-14 (resto) | Pendiente | Necesitan persistencia |

Las reglas de tiempo, gracia, penalización y aforo **ya están escritas y son puras**
(`@l2/domain-park`); lo que falta es conectarlas a datos reales.

---

## F9 · Back-office y panel en vivo

| Tarea | Estado | Evidencia o qué falta |
|---|---|---|
| F9-00 Inicio del back-office | Parcial | `/panel` con sus módulos por dominio y los permisos de cada uno; sin datos reales detrás |
| F9-08 Panel en vivo del local | Parcial (interfaz) | `/panel/vivo`: cinco zonas —parque, cocina, mesas, caja y **personas conectadas** (D7)— calculadas en `vivo.ts`, puro, a partir de los mismos eventos que mueven las estaciones. Lo urgente va primero, con texto además de color (§8.2), y cada zona enlaza a su pantalla. **Nada se recarga**: las cuentas viajan entre pestañas por `BroadcastChannel` mientras no haya servidor. Comprobado en navegador con dos pestañas: el parque sube con el escenario, la caja baja al cobrar en la otra pestaña y un puesto queda «Sin nadie» al cerrar sesión. Falta el tiempo real del servidor (F5-08, ADR-008) |

---

## Próximos pasos y deuda técnica

Viven en **[PENDIENTES.md](PENDIENTES.md)**, agrupados por quién los desbloquea: el cliente, el
contador, el trabajo de campo, el producto y el backend. Aquí solo queda el estado por tarea, para
no contar lo mismo en dos sitios.
