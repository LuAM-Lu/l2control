# Qué queda pendiente

> **Actualizado:** 2026-09-14. Una sola lista con todo lo que falta, agrupada por **quién lo
> desbloquea**. El estado tarea por tarea sigue en [PROGRESO.md](PROGRESO.md); el porqué de cada
> paso, en [BITACORA.md](BITACORA.md). Cuando algo de aquí se resuelve, se tacha aquí y se anota
> en la bitácora en el mismo commit.

## 1. Lo que decide el cliente

| # | Decisión | Propuesta sobre la mesa | Dónde |
|---|---|---|---|
| ~~D10~~ | ~~¿Quién edita el plano?~~ | **Cerrada el 2026-09-14**: solo administración | [UX-MEJORAS](UX-MEJORAS.md) §8 |
| ~~D11~~ | ~~Numeración y zonas~~ | **Cerrada el 2026-09-14**: 1-4 «Junto al parque», 5-8 «Salón», 4 sillas, editable desde V4 | UX-MEJORAS §8 |
| D12 | ¿El back-office puede desplazar? | Sí; lo urgente arriba. Las estaciones siguen sin desplazar | UX-MEJORAS §8 |
| D13 | Número de orden continuo o diario | Hecho continuo (`#1049`); diario da números cortos pero obliga a decir la fecha | UX-MEJORAS §8 |
| D2, D3, D7, D8, D9 | Cuenta de mesa, cobrar con niños dentro, personas en vivo, servicio del 10 %, niño que sale sin su representante | Propuestas escritas | [FLUJOS](FLUJOS.md) §7 |
| F0-09 | Firma formal del alcance | Las 24 decisiones están cerradas; falta firmarlo | PLAN §12 |

## 2. Lo que confirma el contador (DEC-1)

| Tema | Qué hace hoy el sistema | Riesgo si está mal |
|---|---|---|
| **IGTF sobre el vuelto** (C13) | Grava todo lo entregado en divisas: $ 15 para $ 11,47 cargan $ 0,45 y no $ 0,34 | Cobrar de más en cada pago en efectivo con vuelto |
| USDT a la par con el dólar | 1:1 para el cobro y para el IGTF | Descuadre si el contador exige tasa propia |
| Alícuotas de IVA (16 % / 8 % / exento) e IGTF 3 % | Datos con vigencia, no constantes | Bajo: se cambian sin desplegar |
| Dirección fiscal del cliente identificado (DEC-23) | Opcional | Factura rechazada si es obligatoria para contribuyentes |
| Nota de crédito al anular con factura (DEC-24) | No existe todavía: la anulación solo revierte el cobro | Documento fiscal sin corregir (F3, F7) |

## 3. Trabajo de campo

- **F0-03 Relevamiento en sitio** — bloquea F1-16 (semillas) y F10-07.
- **F0-04 Datos maestros reales** — tarifas, carta, precios, personas. Hoy todo es inventado (ver
  [apps/web/src/demo](../apps/web/src/demo/README.md)).
- **Calibrar el lector de pulseras** (F1-11): el umbral de 55 ms entre pulsaciones y los 45 ms de
  los atajos de teclado dependen del aparato real.
- **Impresora y gaveta reales** (F1-10, F1-12): plantillas de 58 y 80 mm.

## 4. Producto: lo que sigue, en orden (DEC-22)

1. ~~**Cocina (KDS)**~~ — hecha el 2026-09-14: `/cocina` con su rol, su pestaña y el escenario X5
   probado. Queda el servidor (tiempo real), el umbral de espera configurable y los modificadores.
2. ~~**V3 y V4, plano del local**~~ — hechos el 2026-09-14: plano espacial en `/mesas` y editor en
   Panel → Restaurante → Plano del local. Queda la **capa de estructura editable** (paredes, puertas,
   barra, cocina), las guías de alineación entre mesas, el historial de versiones del plano y las
   medidas reales del local (F0-03).
3. **Caja de mesas** (paso 4) — cuenta maestra con platos y parque (D2), cobro dividido (F6-12),
   propina explícita (F6-13), mesa por limpiar al cobrar.
4. **Panel en vivo** (paso 5).
5. **Cortesía con motivo** (F6-14): hoy, anular un cobro devuelve la cuenta a «por cobrar»; si no
   hay que cobrar lo consumido, hace falta la cortesía.
6. Modificadores de plato (F6-04), escenarios que faltan del simulador (FLUJOS §5), plano editable.

## 5. Backend e infraestructura (Ruta A)

| Pieza | Por qué importa | Tarea |
|---|---|---|
| **CI** que ejecute `pnpm verify` en cada push | Las reglas muerden solo si alguien se acuerda de invocarlas | F1-14 |
| **Lint** | `pnpm lint` no ejecuta nada; la prohibición de `toFixed` fuera de `@l2/ui` no la impone nadie | F1-14 |
| Docker Compose (PostgreSQL 17 + Valkey 8) | Entorno local reproducible | F1-04 |
| **Prisma con RLS forzada** | Todo lo demás depende de tener persistencia | F1-05 |
| Acceso real (Better Auth), PIN verificado en servidor | Hoy el PIN de prueba es `1970` y la sesión vive en la pestaña | F2-03, F2-12 |
| Auditoría antes de ejecutar | Anulaciones, reimpresiones y permisos quedan hoy solo en el navegador | F2-07 a F2-10 |
| Cuentas, ventas y turno en el servidor | Hoy viven por pestaña (`sessionStorage`) | F5-14, F4-03, F4-05 |
| Gaveta real del turno | «¿Hay efectivo para devolver?» se estima con las ventas de la sesión, sin fondo inicial | F4-05 |
| Tiempo real (WebSocket) | El monitor y la cola de caja no se actualizan solos entre equipos | F5-08, ADR-008 |
| Cifrado en reposo y redacción en logs de datos de pago | §7.6 | F1-13, F4-04 |
| Observabilidad | Logger con redacción, trazas, métricas | F1-13 |
| Staging | — | F1-15 |

## 6. Deuda técnica registrada

| Qué | Por qué se aceptó | Cuándo se salda |
|---|---|---|
| Venta de mostrador guardada como cuenta de familia con una estancia ficticia (`s-mostrador`) | El contrato de cuenta exige al menos un niño | Cuando la cuenta tenga su tipo «mostrador» |
| Las pulseras registradas en la entrada no quedan en la cuenta | Sin backend no hay índice pulsera → estancia; pasarla en caja dice que no tiene cuenta | Con F5-14 en servidor |
| `text-base` pinta también `--color-base` (Tailwind 4 con ese token) | Se detectó en el recibo; los otros ~20 usos se salvan porque llevan color explícito detrás | Renombrar el token o revisar los usos |
| Sin Storybook | Recorte de la Ruta A | Cuando entre un tercer consumidor de `@l2/ui` |
| Solo el puerto de escáner | La impresora no hacía falta aún | F1-12 |
| `apps/printer-agent` sin construir | DEC-8: la impresora admite red | Solo si aparece una impresora solo-USB |

## 7. Limitaciones conocidas de la demostración

Ninguna es un fallo del producto: son consecuencias de no tener servidor todavía.

- **Cada pestaña es un mundo.** Cuentas, ventas y sesión viven en `sessionStorage`; el simulador sí
  sincroniza pestañas, pero las cuentas no. La llegada «en vivo» a la cola de caja se verá con el
  servidor.
- **Las ventas de ejemplo son del 11/09/2026** y se listan junto a las del día.
- **El diálogo de anular necesita desplazar** para llegar al PIN a 1366×768.
- **La búsqueda por mesa** en la cola de caja y el **teléfono del representante** en el recibo
  llegan con la caja de mesas y la ficha de la familia.
