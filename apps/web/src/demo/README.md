# Demo

Todo lo que es **demostración** vive aquí, y solo aquí: los datos con los que arrancan las pantallas
mientras no hay backend, y el interruptor que la apaga.

| Archivo | Qué trae | Lo usa |
|---|---|---|
| `modo.ts` | `DEMO_ACTIVA`: `NEXT_PUBLIC_DEMO=off` apaga el simulador y las cuentas y ventas de ejemplo | Layout de estaciones, simulador |
| `parque.ts` | Tarifas, representantes conocidos y la instantánea del monitor (8 niños en sala) | Monitor, entrada, salida, caja, panel |
| `cuentas.ts` | Cuentas de familia: prepagos pagados, cuentas abiertas y una en la cola de caja | Layout de estaciones |
| `caja.ts` | Alícuotas, IGTF, umbral de residuo, 6 medios de pago y 2 terminales | Caja |
| `turno.ts` | Movimientos de una tarde y excepciones del turno | Turno, panel |
| `ventas.ts` | Tres ventas cerradas (#1041 a #1043) para que «Ventas» no arranque vacía | Layout de estaciones |
| `usuarios.ts` | Siete personas con sus roles y excepciones de permiso | Usuarios, anular un cobro |

## Tres reglas

1. **Solo las rutas importan la demo.** `app/**` la pasa a las pantallas por props. Una pantalla o
   un proveedor que la importa no se puede conectar al backend sin reescribirlo. Lo impone la
   regla `demo-solo-desde-las-rutas` de `pnpm arch`; la única excepción es el simulador, que lee
   `modo.ts`.
2. **Todo se valida contra el contrato al construirse.** Si un dato de ejemplo tiene una forma que
   el servidor nunca devolverá, la aplicación falla al arrancar, no meses después.
3. **Nada de aquí es real.** Tarifas, carta, precios y personas son inventados hasta F0-04. Los
   tipos que sí son del producto (`MedioPago`, `Excepcion`, denominaciones) viven en su
   funcionalidad, no aquí.

## El simulador

El motor que reproduce una tarde del local está en `src/features/simulacion`: sus eventos son los
del catálogo real (F1-20) y las pantallas lo leen como leerán el tiempo real del servidor. Con la
demo apagada no se muestra ni se puede iniciar.

## Cuando llegue el backend

Cada importación de este directorio en `app/**` se sustituye por la llamada al servidor, y el
directorio se borra. Las pantallas no cambian: ya reciben la forma definitiva.
