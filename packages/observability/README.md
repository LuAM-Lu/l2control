# @l2/observability

Saber qué pasa en el servidor sin filtrar datos sensibles (PLAN §9.2 ❽, §10.2, §7.6).

## Qué resuelve

- **`crearLogger({ servicio })`**: logs en JSON, una línea por evento, con nivel, hora y servicio.
  `conContexto(log, { tenantId, branchId, userId, deviceId, businessDate, traceId })` devuelve un
  hijo que lleva ese contexto en cada línea.
- **Redacción activa y sin atajos.** Todo pasa por `redactar()`: el objeto, el mensaje, los errores y
  el contexto de los hijos. Tapa:
  - por **nombre de campo**, a cualquier profundidad y palabra por palabra: `pin`, `referencia`,
    `txId`, `titular`, `telefono`, `contacto`, `correo`, `cedula`, `rif`, `token`, `authorization`…
    (`tarifa` no es un RIF);
  - por **forma del texto**: contraseñas en URLs de conexión, `Bearer …` y móviles venezolanos.
- **`leerEntorno(esquema)`**: valida las variables de entorno con Zod al arrancar. Si falta o sobra
  algo, lanza `EntornoInvalido` con **todos** los problemas y sin enseñar ningún valor. El proceso
  no arranca (§10.3). `urlPostgres`, `urlValkey` y `nivelLog` son piezas para declarar esquemas.

## Qué NO le corresponde

- **Decidir qué entorno necesita cada proceso.** Cada uno (web, worker) declara su propio esquema
  y llama a `leerEntorno` al arrancar.
- **El navegador.** Solo es para el servidor; ni el dominio ni `@l2/ui` lo importan (`pnpm arch`).
- **Trazas OpenTelemetry, métricas y Sentry** (§10.2). Llegan cuando haya un camino crítico que
  medir: cobrar, enviar comanda o imprimir.

## Si añades un dato sensible nuevo

Añade su palabra a `PALABRAS_SENSIBLES` en `src/redaccion.ts`, o su forma a `FORMAS_SENSIBLES`, y
una prueba en `src/logger.test.ts` que lo escriba y compruebe que no sale.
