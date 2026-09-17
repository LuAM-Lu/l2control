# Qué queda pendiente

> **Actualizado:** 2026-09-17. Todo lo que falta, agrupado por **quién lo desbloquea**. El estado tarea
> por tarea está en [PROGRESO.md](PROGRESO.md); el porqué de cada paso, en [BITACORA.md](BITACORA.md).
> Cuando algo de aquí se resuelve, se tacha aquí y se anota en la bitácora en el mismo commit.
>
> **El frontend tiene su propio plan final:** [PLAN-FRONTEND.md](PLAN-FRONTEND.md). Lo que falta de
> interfaz se lleva allí, no aquí, para no contarlo en dos sitios.

## 1. Lo que decide el cliente

| # | Decisión | Propuesta sobre la mesa | Dónde |
|---|---|---|---|
| **Inventario** | ¿Se construye ya la interfaz de inventario? Está fuera de la Ruta A | Decidir antes de la Tanda D del plan final | [PLAN-FRONTEND](PLAN-FRONTEND.md) §4 |
| **Informes** | ¿Entran los informes del panel ejecutivo (F9-01 a F9-07)? Fuera de la Ruta A | Después del piloto; Inicio ya enseña el día | PLAN §11.3 |
| D7 | Quién asigna los puestos de trabajo | Hoy se deducen del rol (`PUESTO_DE_ROL`) | [FLUJOS](FLUJOS.md) §7 |
| D9 | Un niño que sale sin su representante | Sin propuesta todavía | FLUJOS §7 |
| D12 | ¿El back-office puede desplazar? | Sí, con lo urgente arriba; las estaciones no desplazan (así está hecho) | [UX-MEJORAS](UX-MEJORAS.md) §8 |
| D13 | Número de orden continuo o diario | Hoy continuo (`#1049`); diario da números cortos pero obliga a decir la fecha | UX-MEJORAS §8 |
| F-12 | ¿El teléfono entra en el objetivo del frontend? | Revisarlo al cerrar el frontend | [AUDITORIA-FRONTEND](AUDITORIA-FRONTEND.md) |
| F0-09 | Firma formal del alcance | Las 26 decisiones están cerradas; falta firmarlo | PLAN §14 |

Cerradas el 2026-09-14 a 17 y ya construidas: D2, D3, D8, D10, D11, **DEC-25 (solo la caja cobra)** y
**DEC-26 (turnos genéricos)**. El detalle está en PLAN §14 y en la bitácora.

## 2. Lo que confirma el contador (DEC-1)

| Tema | Qué hace hoy el sistema | Riesgo si está mal |
|---|---|---|
| **IGTF sobre el vuelto** (C13) | Grava todo lo entregado en divisas: $ 15 para $ 11,47 cargan $ 0,45 y no $ 0,34 | Cobrar de más en cada pago en efectivo con vuelto |
| USDT a la par con el dólar | 1:1 para el cobro y para el IGTF | Descuadre si el contador exige tasa propia |
| Alícuotas de IVA (16 % / 8 % / exento) e IGTF 3 % | Datos con vigencia, no constantes | Bajo: se cambiarán desde Configuración → Impuestos |
| Dirección fiscal del cliente identificado (DEC-23) | Opcional | Factura rechazada si es obligatoria para contribuyentes |
| Nota de crédito al anular con factura (DEC-24) | No existe todavía: la anulación solo revierte el cobro | Documento fiscal sin corregir (F3, F7) |

## 3. Trabajo de campo

- **F0-03 Relevamiento en sitio**: medidas reales del local para el plano; bloquea F1-16 (semillas) y F10-07.
- **F0-04 Datos maestros reales**: tarifas, carta, precios y personas. Hoy todo es inventado (ver
  [apps/web/src/demo](../apps/web/src/demo/README.md)); los editores ya existen para cargarlos.
- **Calibrar el lector de pulseras** (F1-11): el umbral de 55 ms entre pulsaciones y los 45 ms de los
  atajos de teclado dependen del aparato real.
- **Impresora y gaveta reales** (F1-10, F1-12): plantillas de 58 y 80 mm.
- **Instalar la app en una tablet Android** (T-5 del plan final): necesita HTTPS o la excepción de Chrome.

## 4. Producto

**El frontend:** [plan final](PLAN-FRONTEND.md) — navegación y panel en tablet (Ola 3), las diez
secciones del panel que siguen «pendientes» más apertura de turno, cortesía y medios de pago (Ola 4),
auditoría por módulos (Ola 5) y cierre (Ola 6).

**Solo si el cliente lo pide**, fuera de ese plan: dividir la cuenta **por ítems** (F6-12), modificadores
de plato (F6-04), pre-cuenta no fiscal (F6-11), la capa de estructura editable del plano (paredes,
puertas, barra) con sus guías y su historial de versiones, el umbral de espera de cocina configurable y
los escenarios del simulador que faltan (FLUJOS §5).

## 5. Navegación y permisos

Los hallazgos están en [AUDITORIA-NAVEGACION.md](AUDITORIA-NAVEGACION.md). Resueltos: N-01, N-02, N-03,
N-05, N-06, N-09 y N-10. **Quedan N-04 y N-07 + N-08**, en la Ola 3 del plan final.

## 6. Backend e infraestructura (Ruta A)

| Pieza | Por qué importa | Tarea |
|---|---|---|
| **CI** que ejecute `pnpm verify` en cada push | Las reglas muerden solo si alguien se acuerda de invocarlas | F1-14 |
| **Lint** | `pnpm lint` no ejecuta nada; la prohibición de `toFixed` fuera de `@l2/ui` no la impone nadie | F1-14 |
| Docker Compose (PostgreSQL 17 + Valkey 8) | Entorno local reproducible | F1-04 |
| **Prisma con RLS forzada** | Todo lo demás depende de tener persistencia | F1-05 |
| Acceso real (Better Auth), PIN verificado en servidor | Hoy el PIN de prueba es `1970` y la sesión vive en la pestaña | F2-03, F2-12 |
| Auditoría antes de ejecutar | Anulaciones, reimpresiones y permisos quedan hoy solo en el navegador | F2-07 a F2-10 |
| Cuentas, ventas, turno y catálogos en el servidor | Hoy viven por pestaña (`sessionStorage`): cuentas, ventas, carta, plano y tarifario | F5-14, F4-03, F4-05, F5-04, F6-01, F6-03 |
| Tasa BCV sincronizada con historial | Hoy la tasa es un dato de ejemplo | F3-03, F3-04 |
| Gaveta real del turno | «¿Hay efectivo para devolver?» se estima con las ventas de la sesión, sin fondo inicial | F4-05 |
| Tiempo real (WebSocket) | El monitor y la cola de caja no se actualizan solos entre equipos | F5-08, ADR-008 |
| Cifrado en reposo y redacción en logs de datos de pago | §7.6 | F1-13, F4-04 |
| Observabilidad | Logger con redacción, trazas, métricas | F1-13 |
| Staging y HTTPS | También hace falta para instalar la app en tablets reales | F1-15 |

## 7. Deuda técnica registrada

| Qué | Por qué se aceptó | Cuándo se salda |
|---|---|---|
| Venta de mostrador guardada como cuenta de familia con una estancia ficticia (`s-mostrador`) | El contrato de cuenta exige al menos un niño | Cuando la cuenta tenga su tipo «mostrador» |
| Las pulseras registradas en la entrada no quedan en la cuenta | Sin backend no hay índice pulsera → estancia; pasarla en caja dice que no tiene cuenta | Con F5-14 en servidor |
| `text-base` pinta también `--color-base` (Tailwind 4 con ese token) | Se detectó en el recibo; los demás usos llevan color explícito detrás | Ola 5 del plan final |
| El contrato de salida se llamaba `TAQUILLA`; el dominio de caja conserva `PointOfSale` con taquilla y mostrador | DEC-25/26: los puntos se dejan genéricos hasta decidir los turnos | Con el backend |
| Sin Storybook | Recorte de la Ruta A | Cuando entre un tercer consumidor de `@l2/ui` |
| Solo el puerto de escáner | La impresora no hacía falta aún | F1-12 |
| `apps/printer-agent` sin construir | DEC-8: la impresora admite red | Solo si aparece una impresora solo-USB |
| La medición de interfaz vive fuera del repositorio (`C:/tmp/pw_test`) | Añadir Playwright es una dependencia | Ola 6 (`pnpm audit:ui`) |

## 8. Limitaciones conocidas de la demostración

Ninguna es un fallo del producto: son consecuencias de no tener servidor todavía.

- **Cada pestaña es un mundo, con dos excepciones.** Ventas, sesión y catálogos viven en
  `sessionStorage`; el simulador y **las cuentas** sincronizan pestañas por `BroadcastChannel`, que es lo
  que hace creíble el panel en vivo. Entre dos aparatos distintos no hay nada todavía.
- **Las ventas de ejemplo son del 11/09/2026** y se listan junto a las del día.
- **El monitor usa la política del parque de ejemplo**, no la publicada en Tarifas: calcula en el
  servidor y esa lectura llega con el backend.
- **La búsqueda por mesa** en la cola de caja y el **teléfono del representante** en el recibo llegan
  con la ficha de la familia (Ola 4.5).
