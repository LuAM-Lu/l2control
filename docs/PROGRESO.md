# Progreso real

> **Actualizado:** 2026-09-08 · Contrastado contra los criterios de aceptación de
> [PLAN.md §12](PLAN.md). Una tarea solo cuenta como hecha si su criterio se cumple y es
> demostrable — «ya lo programé» no basta.

## Resumen

| Fase | Hechas | Parciales | Pendientes | Estado |
|---|---:|---:|---:|---|
| F0 · Descubrimiento y decisiones | 4 | 1 | 5 | En curso — bloqueada por trabajo de campo |
| F1 · Cimientos técnicos | 7 | 2 | 7 | En curso |
| F2 · Identidad, permisos y auditoría | 0 | 0 | 10 | Sin empezar |
| F3 · Núcleo monetario y fiscal | 2 | 0 | 10 | Adelanto parcial |
| F4 · Caja y cobro mixto | 0 | 0 | 11 | Sin empezar |
| F5 · Parque | 1 | 2 | 12 | Prototipo de interfaz |
| F6-F12 | 0 | 0 | — | Fuera de la Ruta A o sin empezar |

**Se puede ver funcionando:** el monitor de parque en `/monitor`, con datos de ejemplo.

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
| F1-09 Contratos Zod | Pendiente | Llega con la primera escritura real |
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
| F3-03 a F3-11 | Pendiente | Tasas, impuestos, ledger, vuelto, día de negocio |

## F5 · Parque — prototipo de interfaz

| Tarea | Estado | Nota |
|---|---|---|
| F5-08 Tablero en tiempo real | **Parcial** | La interfaz está y se lee a distancia. **Falta el WebSocket**: hoy no se actualiza solo |
| F5-10 Filtro por escaneo | ✅ Hecha | Pasar la pulsera resalta al niño, sin foco previo |
| F5-04 Paquetes de tarifa | Parcial | El tipo `Duration` existe; falta el catálogo configurable |
| F5-01 a F5-14 (resto) | Pendiente | Necesitan persistencia |

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
4. **Sin pruebas de `@l2/domain-park`.** El paquete tiene lógica de cobro y cero pruebas. Es
   una deuda que contradice el DoD de §0.4 y hay que saldarla antes de que crezca.

## Deuda técnica registrada

| Qué | Por qué se aceptó | Cuándo se salda |
|---|---|---|
| Sin Storybook | Recorte de la Ruta A | Cuando entre un tercer consumidor de `@l2/ui` |
| Sin pruebas en `domain/park` | Se priorizó ver la interfaz | Antes de F5-05 |
| Datos de ejemplo en `features/park/data.ts` | No hay backend | F1-05 + F0-04 |
| Solo el puerto de escáner | La impresora no hacía falta para el monitor | F1-12 |
| `apps/printer-agent` sin construir | DEC-8: la impresora admite red | No se construye salvo que aparezca una impresora solo-USB |
