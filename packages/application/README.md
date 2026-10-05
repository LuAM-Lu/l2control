# @l2/application

Los casos de uso del servidor (PLAN §9.2 ❹): cada uno valida con el contrato, aplica el dominio y
escribe en la base dentro de la transacción del tenant. **Es la única puerta de las apps a la base**:
`apps → application → database` (`pnpm arch` lo impone).

## Qué resuelve

- **`conectar(url)`** abre la base (y se niega si el usuario se salta la RLS) y devuelve los casos de
  uso agrupados por dominio: `app.tarifario`, `app.sucursal`…
- **Cada caso de uso recibe un `Contexto`** (`tenantId`, `branchId`) y nunca lo deduce.
- **El servidor revalida siempre.** Un comando recibe `unknown`, lo que mandó el navegador, y lo pasa
  por el contrato antes de tocar nada (ADR-017).
- **Un rechazo se devuelve, no se lanza**: `Resultado<T>` de `@l2/contracts`, con motivo `INVALIDO`
  (y sus problemas campo por campo), `CONFLICTO`, `NO_PERMITIDO` o `NO_DISPONIBLE`. Lanzar queda para
  lo inesperado.

| Dominio | Casos de uso | Paso |
|---|---|---|
| Parque | `tarifario.leer`, `tarifario.publicar` (versión nueva; dos a la vez → `CONFLICTO`) | B0-5 |
| Sucursal | `sucursal.asegurar` (semillas; idempotente) | B0-5 |
| Ajustes de la sucursal | `ajustes.leer` (sin persona; sin versión, los de fábrica) y `ajustes.publicar` (versión nueva sobre `versionBase`, la zona no cambia con la caja o el parque en marcha). Los demás casos de uso leen zona y umbrales con `ajustesDe`/`zonaDe` dentro de su transacción | B4-4 |
| Dinero | `tasas.leer`, `capturar`, `confirmar`, `sincronizar` (la del BCV se aplica sola con salvaguardas) | B2-1, B2-1b, B2-1c |
| Dinero | `impuestos.leer`, `impuestos.programar` (desde un día; hoy, desde ya; nunca hacia atrás) | B2-2 |
| Dinero | `pagos.asentar` (todo o nada, idempotente), `pagos.revertir` (asiento de signo contrario, 🔐), `pagos.libro` (saldo calculado) | B2-3 |
| Tiempo real | `tiempoReal.ticket` (lo firma la web para una sesión), `abrir` (firma, plazo y sesión viva), `latido`, `despachar` (outbox → temas por sucursal), `escuchar`; `sesiones.enCurso` (quién está en cada puesto). `temasDe` traduce cada acción auditada a lo que invalida | B5-1 |
| Caja | `medios.leer`, `medios.aplicar` (encender y apagar, añadir un medio, datos del local cifrados, terminales); el libro cita el medio del catálogo, cifra los datos de cada pago y rechaza una referencia ya cobrada | B3-2 |
| Impresión | `impresion.leer`, `aplicar` (impresoras y agentes; `catalogo.modificar` con elevación), `trabajos`, `imprimirPrueba`, `imprimirCorte`, `reintentar`; del agente: `vincular`, `abrirAgente`, `reclamar` (FOR UPDATE SKIP LOCKED), `responder`, `barrer` y `latido`. `encolarEn` pone un trabajo en la transacción de quien imprime (el recibo en `ventas.imprimir`, el ticket en el corte Z); las plantillas, en `impresion/plantillas.ts` | B5-2 |
| Caja | `papel.leer`, `abrir`, `terminar` y `revisar` (la carga de lo anotado en papel: la ventana del corte, su cierre y la revisión de supervisión con PIN) y `entrar`, `salir`, `guardar` y `cobrar`, que son `parque.entrar`, `parque.salir`, `cuentas.guardar` y `cuentas.cobrar` hechos con la hora real del formulario (la única hora que declara una pantalla, ADR-027). `papel-en.ts` es lo que esas cuatro operaciones comparten dentro de su transacción; el corte Z no sella un turno con cargas sin revisar | B3-7 |
| Caja | `descuentos.leer`, `crear` y `retirar` (reglas; `catalogo.modificar` con elevación), `marcarVip`, `deCuenta` (lo que se ofrece, el mayor primero) y `aplicar` (poner o quitar, con la 🔐 que toque; lo de administración lo autoriza administración). `cuentas.cobrar` cobra con el descuento y lo deja en la venta; las lecturas compartidas viven en `reglas-de-descuento.ts` | B3-6 |

## Qué NO le corresponde

- **Reglas de negocio puras**: viven en `packages/domain/*`. Aquí solo se orquestan.
- **Forma de los datos**: `@l2/contracts`.
- **SQL, RLS y migraciones**: `@l2/database`.
- **Next, cookies, rutas**: `apps/web`. Este paquete no sabe que existe un navegador.
- **Permisos**: llegan en B1-5 con `can()` del dominio de identidad. Hasta entonces, la web solo
  deja escribir en desarrollo (`escrituraSinSesion()` en `apps/web/src/servidor`).

## Añadir un caso de uso

1. Su contrato en `@l2/contracts` y, si tiene reglas, su dominio.
2. `src/<dominio>/<caso>.ts` con una función `casos<Algo>(base)`, registrada en `conectar()`.
3. Su prueba `*.test-db.ts` contra `l2control_test`: el camino feliz, el contrato, el aislamiento
   entre tenants y lo que pase si dos personas lo hacen a la vez.
