# @l2/contracts

Contratos de datos con Zod. Implementa [ADR-017](../../docs/adr/017-validacion-zod.md).

## Qué resuelve

La duplicación más cara de un proyecto full-stack: validar lo mismo en el formulario, en la API
y en la base de datos, con tres definiciones que se desincronizan. Aquí cada contrato se define
**una vez** y de ahí salen los tipos de TypeScript, la validación del cliente y la del servidor.

```ts
import { CheckInCommandSchema, type CheckInCommand } from "@l2/contracts";

const result = CheckInCommandSchema.safeParse(entrada);
if (!result.success) return mostrarErrores(result.error);
```

**El servidor siempre revalida**, aunque el cliente ya lo haya hecho. Lo que llega por el cable
es entrada no confiable, venga de donde venga.

## Por qué existe ahora y no después

§11.4 cambió el orden de ejecución a frontend → backend → producción. El riesgo de ese orden es
construir pantallas contra datos de ejemplo con la forma que resulte cómoda y descubrir al
llegar el backend que la mitad no encaja.

**Este paquete es la neutralización de ese riesgo.** Los datos de ejemplo se derivan del
contrato, nunca al revés, y el backend implementará después este mismo contrato. El contrato es
el acuerdo entre las dos mitades.

## Decisiones de forma que no son obvias

**El dinero viaja como texto.** `{ minor: "1750", currency: "USD" }`. `bigint` no es
serializable a JSON y `number` pierde precisión por encima de 2⁵³. Un entero en texto no pierde
nada. Sigue vigente la regla de §5.1: un monto nunca viaja sin su moneda.

**Los instantes viajan como ISO 8601, no como epoch.** El cable se lee en logs, en la pestaña de
red y en un volcado de auditoría: `1757419200000` no dice nada, `2026-09-09T14:00:00.000Z` se
comprueba de un vistazo. En un sistema cuyo producto es el tiempo, esa legibilidad vale más que
los bytes que ahorra el número.

**Los errores llevan código, no solo texto.** La interfaz decide qué mostrar según el código; el
texto es para la persona.

## Reglas que el esquema impone, no la buena voluntad

| Regla | Cómo se impone |
|---|---|
| Minimización de datos de menores (DEC-9) | `KidSchema` solo admite nombre, apodo y edad. Cédula, dirección y foto se descartan; añadirlos exige cambiar este contrato a la vista de todos |
| No existe la duración cero (ADR-011) | `DurationSchema` es una unión discriminada: «pase libre» es otra variante, no un número |
| El bloque de penalización es positivo | `.positive()` — un bloque de 0 sería una división por cero |
| Un doble clic no cobra dos veces (I-11) | `idempotencyKey` obligatoria en todo comando que escribe |
| Siempre hay a quién llamar | `CheckInCommand` exige representante nuevo **o** existente, nunca ninguno ni ambos |
| El código de pulsera se valida una sola vez | `WristbandCodeSchema` — la misma regla para el lector, el formulario y el servidor |

## Contratos por área

| Archivo | Qué define |
|---|---|
| `primitives.ts` | Id, instante, moneda, dinero (`minor` en texto + moneda), clave de idempotencia |
| `park.ts`, `checkout.ts` | Pulseras, estancias, tarifas, representantes, entrada, salida y liquidación |
| `account.ts` | La cuenta de la familia (DEC-21), con número de orden y hora de entrada a la cola |
| `pagos.ts` | Datos obligatorios por medio de pago: Pago Móvil, Zelle, USDT, punto (F4-04) |
| `documento.ts` | A quién se factura: consumidor final o identificado (DEC-23) |
| `ventas.ts` | La venta cerrada con la foto de su recibo, sus impresiones y su anulación (DEC-24) |
| `restaurante.ts` | Plano de mesas y carta |
| `eventos.ts` | Catálogo de eventos de operación que emiten el simulador y las pantallas (F1-20) |
| `identity.ts` | Personas, roles y excepciones de permiso |

## Qué NO le corresponde

- **Lógica de negocio.** Un contrato dice qué forma tiene un dato, no qué se hace con él. El
  cálculo vive en `@l2/domain-*`.
- **Mapeo a los tipos del dominio.** Ocurre en el borde que consume el contrato, porque cada
  lado mapea en dirección contraria.
- **Persistencia.** El esquema de base de datos es otra cosa y puede diferir a propósito.

Es la **hoja del grafo de dependencias**: no importa de nadie salvo `zod`.

```bash
pnpm test    # 17 pruebas
```
