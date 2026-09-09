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

## Deuda técnica registrada

| Qué | Por qué se aceptó | Cuándo se salda |
|---|---|---|
| Sin Storybook | Recorte de la Ruta A | Cuando entre un tercer consumidor de `@l2/ui` |
| ~~Sin pruebas en `domain/park`~~ | Saldado el 2026-09-09: 20 pruebas | — |
| Datos de ejemplo en `features/park/fixtures.ts` | No hay backend. **Mitigado:** se validan contra el contrato al construirse, así que la forma ya es la definitiva | F1-05 + F0-04 |
| Solo el puerto de escáner | La impresora no hacía falta para el monitor | F1-12 |
| `apps/printer-agent` sin construir | DEC-8: la impresora admite red | No se construye salvo que aparezca una impresora solo-USB |
