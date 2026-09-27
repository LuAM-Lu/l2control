# L2 Control — documento maestro

> **El único documento vivo del proyecto.** Actualizado: **2026-09-27**.
>
> Aquí están el estado, la ruta hasta producción, lo que bloquea y el handoff. Nada de esto se escribe
> en otro sitio. Hay tres referencias que **no se editan** y se citan por sección:
>
> - [PLAN.md](PLAN.md): la especificación. ADRs, decisiones del cliente (DEC-n) y tareas `Fn-nn` con su
>   criterio de aceptación en §12. Sus casillas y sus enlaces a documentos retirados están congelados.
> - [FLUJOS.md](FLUJOS.md): cómo se mueven personas, pedidos y dinero en el local. El código lo cita.
> - [adr/](adr/): las decisiones de arquitectura, una por archivo (19; ADR-018 supersede la biblioteca
>   de ADR-013 y ADR-019 cambia la confirmación de la tasa automática de §5.2).
>
> Las reglas del código están en [CLAUDE.md](../CLAUDE.md).

**Documentos retirados el 2026-09-26.** PROGRESO, PENDIENTES, PLAN-FRONTEND, BITACORA, ORQUESTA,
`docs/README`, `encargos/` y `cerrados/` (entre ellos UX-MEJORAS y las dos auditorías). Su contenido
útil está resumido aquí. El código todavía cita «UX-MEJORAS §n» o «AUDITORIA-…», y esas citas se leen
en la historia de git:

```bash
git show e250c54:docs/cerrados/UX-MEJORAS.md     # o PROGRESO.md, BITACORA.md, encargos/<tarea>.md…
```

---

## 1. Dónde estamos

**Versión 0.17.0 · 17 de 45 pasos.** Etapas 0 y 1 hechas, y la versión ya se ve (T-1); Etapa 2 (dinero) en curso: las tasas
son de la base, se traen del BCV, se aplican solas con salvaguardas y llegan en vivo a toda pantalla
(B2-1c), los impuestos son de la base con su vigencia (B2-2) y **el libro de pagos existe en el
servidor (B2-3)**, a la espera de que la caja cobre contra él (B3-3). Sin modo demo; lo provisional y lo simulado que queda está
inventariado en §5, y cada pieza tiene el paso que la elimina (M-11). La versión sigue M-10: el
número del medio cuenta los pasos entregados.

- **Infraestructura local:** `pnpm infra:up` (PostgreSQL 17 en el 5433, Valkey 8), `pnpm db:migrar`,
  `pnpm db:semilla` (local, equipo con PIN 1970, credenciales de Abigail, tarifario).
- **Servidor:** `@l2/database` (RLS forzada, solo-agregar, auditoría), `@l2/application` (tarifario,
  auditoría, equipos, sesiones, elevación, personas, excepciones, accesos, autorización 🔐, tasas y
  su sincronización con el BCV, impuestos con vigencia, libro de pagos), `@l2/observability` (logs redactados, entorno validado). La web lee
  la sesión de cookies `httpOnly` y recibe el actor COMPLETO del servidor.
- **Ya van contra la base:** acceso (equipo + PIN, alta de equipos con código de emparejamiento),
  tarifario, Dispositivos, Usuarios y permisos, Roles y accesos, Tasas de cambio (barra, caja e
  Inicio) e Impuestos (Configuración y el ticket de la caja). No se enseña nada inventado: sala, familias, turno y cifras de Inicio dicen «Sin datos» o
  «Sin turno abierto» hasta su paso. Lo demás es configuración provisional o simulación, en §5.
- **Entrar en local:** navegador nuevo → «Pedir registro» en `/acceso` → «Soy de administración» con
  contraseña `abby-kingdom-desarrollo` + código de `pnpm totp` (o `pnpm equipos aprobar "<nombre>"`)
  → persona → PIN 1970. Tope: 10 solicitudes por hora desde la misma dirección.
- **Pruebas:** `pnpm verify:db` en verde (36 de base, 145 de aplicación; en el dominio, 50 de tasas,
  44 de impuestos y 51 de caja). **Subido a GitHub el
  2026-09-26** (`main`) y el CI pasó en verde allí; para cerrar B0-4 falta verlo en rojo con un PR de prueba.

**La tasa en la base local (2026-09-27).** Vaciada y sembrada de cero; el servidor trajo del BCV la del
viernes 25 (855,6625, solo DolarApi) y la del lunes 28 (857,0058, web del BCV), retenidas las dos. La
del viernes la confirmó Abigail Karam al comprobar B2-1c; la del lunes se aplicó sola en cuanto hubo
vigente. Para probar el aviso de la caja se aplicaron a mano para el domingo 27, dos veces, 860,00 y
luego 855,6625: la vigente de ese día quedó en 855,6625, el valor del BCV. Equipos de prueba «Verif Caja» y «Verif
Admin» revocados.

**Los impuestos en la base local.** La semilla programó 16 %, 8 % y 3 % el 2026-09-27. Al comprobar
B2-2 se programó el IVA general al 15 % (hoy y el 27 oct) y se devolvió al 16 %, y el IGTF al 2 % el
27 oct y se canceló: rige 16 %, 8 % y 3 %, sin nada programado. Equipos «Prueba B22 Admin» y «Prueba
B22 Caja» revocados.

**Siguiente paso:** B2-4 (`businessDate` en toda fila de dinero y feriados bancarios; necesita D-FER).
Luego, el orden de §3.

---

## 2. Decisiones de esta etapa (2026-09-26)

| # | Decisión | Consecuencia |
|---|---|---|
| **M-1** | **Se congela el frontend.** No se construyen más pantallas sobre datos de ejemplo | Las tres que faltaban (apertura de turno, impuestos, impresoras) se hacen **directamente contra el servidor**, en su etapa. Así cada pantalla se construye una sola vez. El inventario (tanda D) pasa a después del piloto, porque está fuera de la Ruta A. Los hallazgos de la antigua Ola 5 se corrigen al pasar por cada pantalla (§5), y la medición final se hace en staging (B7-3) |
| **M-2** | **Claude programa todo.** Se retira la orquesta con Gemini | Se borran `scripts/obrera.mjs`, ORQUESTA y los encargos. Los comentarios del código que dicen «escrito por la obrera» se quedan: son historia |
| **M-3** | **Nada fiscal por ahora** | F7 queda fuera, igual que el hito M1 (F3-08, las 20 facturas), la máquina fiscal y la nota de crédito. El recibo es **no fiscal**. IVA e IGTF **se siguen calculando** en el ticket, porque ya están hechos y cambian lo que se cobra |
| **M-4** | **Entornos: primero local (Docker), luego VPS** | ⚠ **Choca con ADR-003**, que pide un servidor en el local y usa la nube solo como réplica. Con solo un VPS, un corte de internet detiene los cobros y la cocina. **Propuesta:** el VPS sirve de staging y para el piloto en paralelo, donde el método anterior hace de respaldo (F11-04). La topología final (D-INF, §4) se decide antes de retirar ese método. El servidor se empaqueta en Docker para que la misma imagen corra en el VPS o en un mini-PC sin cambios |
| **M-5** | **Un solo documento vivo y handoff a petición** | Este archivo. El protocolo está en §8 |
| **M-7** | **Alta de equipos con buenas prácticas** (2026-09-26, pedido del cliente) | Amplía F2-02. El primer equipo de un local, o el que sustituye a uno perdido, se aprueba **desde él mismo con la contraseña y el TOTP** de quien gestiona personas (nunca con un PIN, y sin enseñar nombres en un equipo no aprobado); la consola `pnpm equipos` queda como puerta de emergencia. Cada equipo enseña un **código de emparejamiento** que quien aprueba compara. Una solicitud **caduca a las 24 h** y se renueva desde el equipo. Tope de 10 solicitudes por hora y dirección y de 20 pendientes por sucursal. Regla de operación (runbook, B8-2): **siempre dos equipos de administración aprobados** |
| **M-6** | **Fuera el modo demo y el simulador** (2026-09-26), y **todo el backend según esta ruta** | Se retiran el chip «DEMO», su panel, los escenarios, el reloj acelerado, `NEXT_PUBLIC_DEMO` y `L2_FUENTE_DE_DATOS`: la app corre siempre contra su servidor. Queda el bus de eventos (`features/operacion`), que no era simulado y en B5-1 viaja por el servidor. Lo que aún no tiene backend usa datos provisionales de `src/demo`; **cada paso borra el suyo** (tabla en su README). Cambio de alcance sobre F1-19 (DEC-22), pedido por el cliente |

| **M-8** | **La tasa del BCV se aplica sola y llega en vivo a todas las pantallas** (2026-09-26, pedido del cliente, [ADR-019](adr/019-tasa-automatica.md)) | Cambia §5.2 y F3-04 (confirmación humana de toda tasa automática). Salvaguardas: solo se aplica sola la de la web oficial del BCV con TLS verificado; si salta más del 10 % respecto de la vigente, si es la primera o si solo respondió un tercero, **no** se aplica y sale alerta crítica; si dos fuentes discrepan para el mismo día, no se captura. Todo queda auditado como «Aplicada automáticamente». La carga manual de administración también se aplica al guardarla (supervisión sigue con 🔐). En vivo: sondeo de 60 s hasta B5-1, push después. Un cobro en curso conserva su tasa y avisa si cambió (ADR-005) |
| **M-9** | **El inventario vuelve al plan** (2026-09-26, pedido del cliente; revierte esa parte de M-1) | Nueva **Etapa 9** (catálogo de productos, movimientos de solo-agregar, compras con costo promedio, ajustes con motivo y 🔐, alertas y conteo físico). Su primer paso, el catálogo, va antes del cobro en servidor (B3-3), que lo necesita. Recetas, descarga al marcar LISTO y merma (F8-03, F8-04, F8-09) van con el restaurante (B6-4), porque dependen de las comandas |
| **M-10** | **Versionado semántico visible** (2026-09-26, pedido del cliente) | SemVer 2.0.0. **MAJOR** 0 hasta producción; **1.0.0 = puesta en marcha** (B8-4). **MINOR** +1 por cada paso de la ruta entregado: la versión dice cuántos van. **PATCH** +1 por cada corrección entre pasos. Staging publica `-rc.N`. Fuente única: `version` del `package.json` raíz; `CHANGELOG.md` por versión (Keep a Changelog, en español) y etiqueta git `vX.Y.Z` en cada entrega. Se ve en el acceso y en Configuración con su etapa: «v0.14.0 · Etapa 2 · Dinero». Punto de partida: **0.13.0** |
| **M-11** | **Cero código demo o simulado en producción** (2026-09-26, pedido del cliente) | Todo lo provisional o simulado está inventariado en §5 con el paso que lo borra, y un paso no está hecho si deja simulado algo suyo. Antes del staging, **T-2** lo impone en CI: `src/demo` borrada, sin datos de negocio en `sessionStorage`/`localStorage`, sin PINs literales ni listas inventadas |

La Ruta A (PLAN §11.3) sigue siendo el alcance, **más el inventario de mostrador** (M-9): parque y caja
primero. Las cinco reglas de CLAUDE.md no se relajan.

---

## 3. Ruta a producción

El orden es por dependencia: **nada cobra sin identidad y auditoría debajo** (H-06). Cada paso cuenta
como hecho solo si su criterio se cumple y se puede demostrar, y se marca aquí en el mismo commit.
Los paquetes nuevos siguen el mapa de PLAN §9.2 (`database`, `application`, `auth`, `observability`,
`hardware` y `apps/worker`), y `pnpm arch` incorpora sus fronteras al crearlos.

**Definición de hecho de un paso de backend.** Un paso cuenta como hecho solo si cumple todo esto:

1. **Contrato** Zod de entrada y salida en `@l2/contracts`. El servidor revalida lo que llega (ADR-017)
   y nada del navegador declara identidades ni instantes.
2. **Dominio** puro con sus pruebas. Las reglas de negocio viven ahí, no en la acción ni en la pantalla.
3. **Caso de uso** en `@l2/application`, dentro de la transacción del tenant: `exigirPermiso…` antes de
   tocar nada, `auditar()` en la misma transacción y rechazos auditados.
4. **Base:** migración versionada y nunca editada una vez aplicada, `l2_aislar_por_tenant`, solo-agregar
   donde haya dinero, stock o historia, CHECKs, FK compuestas con el tenant, sin `Float` e índices con
   el tenant primero.
5. **Dinero:** clave de idempotencia en toda escritura de dinero y tasa congelada en el asiento (ADR-005).
6. **Pruebas:** unitarias del dominio, `*.test-db.ts` contra la base con reloj fijo si depende del día,
   y negativas de permiso y de aislamiento.
7. **Web:** lectura en `*.servidor.ts` con `connection()`, escritura en `*.acciones.ts` (`unknown` →
   `Resultado`) y el proveedor adopta lo que devuelve. Nada de negocio en el almacenamiento del navegador.
8. **Limpieza:** se borra lo provisional o simulado del paso, tanto el archivo de `src/demo` como su
   fila de §5 (M-11).
9. **Navegador:** el flujo real, con Playwright, a 1366×768, 1280×800 y 800×1280; sin errores de
   consola; estados de carga, vacío y error visibles.
10. **Cierre:** `pnpm verify:db` en verde, versión +1 MINOR con su entrada en `CHANGELOG.md` y su
    etiqueta (M-10), y la casilla de este archivo marcada en el mismo commit.

**Orden de ejecución.** Es el camino crítico, y no coincide con el número de etapa:

1. ~~Limpiar la base local → T-1 → B2-1c → B2-2 → B2-3~~ → **B2-4** (se cierra Dinero).
2. B3-1 → B3-2 → **B9-1** (catálogo, que el cobro necesita) → B3-3 → B3-4 → B3-5 (se cierra Caja).
3. **B5-1** (tiempo real, antes del parque: la entrada y el monitor viven en equipos distintos) →
   B4-1 → B4-2 → B4-3 → B4-4 (se cierra Parque).
4. B9-2 → B9-3 → B9-4 → B9-5 (se cierra Inventario) → B5-2 → B5-3.
5. **T-2** (cero simulación) → Etapa 7 (staging) → Etapa 8 (producción, 1.0.0).
6. Etapa 6 (restaurante), según D-RES.

### Transversal

- [x] **T-1 · Versión visible** (M-10).
  → El acceso y Configuración dicen «v0.13.0 · Etapa 2 · Dinero» (con la versión que toque), el log de
  arranque la repite, y `pnpm verify` falla si `CHANGELOG.md` no tiene la versión del `package.json`.
  Incluye `CHANGELOG.md` reconstruido desde el historial (0.1.0 = B0-1 … 0.13.0 = B2-1b) y las
  etiquetas `vX.Y.Z` en los commits de cada paso.
  *Hecho el 2026-09-27 (v0.14.0): `version` y `l2.etapa`/`l2.pasos` en el `package.json` raíz;
  `next.config.ts` incrusta solo esos tres datos (el navegador no recibe el `package.json`). Se ven
  en los tres estados del acceso (desconocido, pendiente y «¿Quién entra?») y en Panel →
  Configuración → Sistema, con «14 de 45 pasos» y su barra; el log «servidor web conectado a la
  base» lleva `version` y `etapa`. `pnpm version:comprobar` entra en `pnpm verify` y falla si
  CHANGELOG.md no abre con la versión del `package.json`; 6 pruebas demuestran que muerde.
  CHANGELOG reconstruido de 0.1.0 a 0.13.0 (B1-3 y B1-4 salieron juntos: no hay 0.7.0) y etiquetas
  en el commit de cada paso. Comprobado con Playwright a 1366×768, 1280×800 y 800×1280, sin errores
  de consola ni desplazamiento del documento.*
- [ ] **T-2 · Cero simulación** (M-11), antes de B7-1.
  → La carpeta `src/demo` ya no existe, se retira la regla `demo-solo-desde-las-rutas` y `pnpm lint`
  suma la regla `sin-simulacion`: rechaza datos de negocio en el almacenamiento del navegador, PINs
  literales y listas de ejemplo en `features/`. El CI sale en rojo con una violación.

### Etapa 0 · Cimientos del servidor (local)

- [x] **B0-1 · Docker Compose** con PostgreSQL 17 y Valkey 8 (F1-04).
  → `docker compose up -d` deja el entorno listo en una máquina limpia; documentado en el README.
  *Hecho el 2026-09-26: `pnpm infra:up` con PostgreSQL 17.11 y Valkey 8.1.10 fijos, puertos solo en
  127.0.0.1 y tres papeles en la base (el de la aplicación no crea tablas ni se salta la RLS).*
- [x] **B0-2 · `packages/database`**: Prisma 7.4+, `tenant_id` en toda tabla y RLS `FORCE` (F1-05,
  ADR-002, ADR-007), sin `FLOAT` para montos (F3-02).
  → Pasan la prueba negativa de aislamiento (el tenant A no lee filas de B) y la prueba que falla ante
  una columna `Float` de dinero.
  *Hecho el 2026-09-26: Prisma 7.10, `abrirBase()` → `conTenant()` como única puerta, que se niega a
  arrancar con un usuario que se salte la RLS. `l2_aislar_por_tenant()` aísla una tabla en una línea.
  19 pruebas (4 estáticas y 15 contra `l2control_test`) que fallan si se apaga la RLS (comprobado).*
- [x] **B0-3 · Configuración validada al arrancar y logger con redacción** (`packages/observability`,
  F1-13, §10.3).
  → Si falta una variable, el proceso no arranca. Una prueba demuestra que un PIN o una referencia de
  pago no aparece en el log.
  *Hecho el 2026-09-26: `@l2/observability` con `crearLogger()` (pino 10, JSON), `redactar()` por
  nombre de campo y por forma del texto (URL con contraseña, `Bearer`, móviles venezolanos) y
  `leerEntorno()`, que lista todos los problemas sin enseñar un solo valor. 20 pruebas; cazaron dos
  filtraciones reales (`txId` y el contexto de `child()`). **Se engancha al arranque de Next en B0-5**,
  que es cuando la app empieza a necesitar variables.*
- [~] **B0-4 · CI en GitHub Actions** con `pnpm verify` y un lint que sí haga algo: `toFixed` fuera de
  `@l2/ui`, colores literales y `parseFloat` sobre dinero (F1-14).
  → Un PR con una violación sale en rojo.
  *Hecho en local el 2026-09-26: `.github/workflows/ci.yml` (acciones fijadas por hash, Node 24,
  mismo `docker-compose.yml`, `pnpm verify:db`) y `pnpm lint` con 5 reglas y 9 pruebas que demuestran
  que muerden: `toFixed` fuera de `@l2/ui`, `parseFloat`, colores literales, reloj en el dominio y
  emojis en pantalla. Excepciones solo con `lint-permitido: <regla> — <motivo>`. **Visto en verde en
  GitHub el 2026-09-26** (primer push, `verify:db` completo con la base en el runner). Falta ver en
  rojo un PR con una violación a propósito (una rama de prueba que no se fusiona).*
- [x] **B0-5 · La costura entre demo y servidor** (`packages/application`). Se fija un patrón único:
  acción de servidor → contrato Zod → dominio → repositorio en transacción con `SET LOCAL app.tenant_id`.
  El primer caso vertical es el **tarifario**: leer y publicar.
  → Una tarifa publicada se ve desde otro navegador y sobrevive a reiniciar el servidor.
  *Hecho el 2026-09-26. `@l2/application` (`conectar()`, `tarifario.leer/publicar`,
  `sucursal.asegurar`), tabla `park_tariff_version` de solo-agregar con FK compuesta, contratos
  `TarifarioPublicadoSchema` y `Resultado`. En la web, el entorno validado en `instrumentation.ts`, `publicarTarifario` como server action y
  `pnpm db:semilla`. Comprobado en el navegador: publicar $ 7,25 en una sesión, leerlo en otra
  independiente, en la entrada, y tras reiniciar el servidor; con el entorno roto el servidor no
  arranca y no enseña la contraseña. 33 pruebas contra la base. **Hasta B1 solo se escribe con
  `L2_ENTORNO=desarrollo`.***

### Etapa 1 · Identidad y auditoría (F2 completa, no se recorta)

- [x] **B1-1 · `AuditLog` append-only**: un disparador rechaza `UPDATE` y `DELETE` (F2-07).
  *Hecho el 2026-09-27: tabla `audit_log` (RLS y solo-agregar), `auditar(tx, ctx, asiento)` en la misma
  transacción que la operación, con `before`/`after` redactados, y catálogo `AccionAuditada`. Publicar
  el tarifario ya deja su asiento. Pendiente de B7: enviarlo fuera de la máquina (§7.4).*
- [x] **B1-2 · Sesión en el servidor** con cookie `httpOnly`; administración con contraseña y segundo
  factor como elevación (F2-01, F2-04). **Sesión propia en vez de Better Auth: [ADR-018](adr/018-sesion-propia.md)**,
  porque Better Auth no puede vivir bajo la RLS forzada; los controles de ADR-013 se mantienen.
  *Hecho el 2026-09-27: `catalogo.modificar`, `usuarios.gestionar` y `reportes.verTodas` exigen,
  además del permiso, confirmar identidad con contraseña (Argon2id) y código TOTP; vale 15 minutos
  en esa sesión. El servidor responde `ELEVACION_REQUERIDA` y la pantalla abre el diálogo y
  reintenta. Secreto TOTP cifrado con AES-256-GCM (`L2_CLAVE_CIFRADO`); sin clave, no hay elevación.
  Los fallos cuentan para el mismo bloqueo que el PIN. Credenciales con `pnpm credenciales
  "<nombre>"`; en desarrollo, `pnpm totp`. 9 pruebas. Pendiente: dar credenciales desde el panel
  con QR (hoy, consola) y protección contra reutilizar el mismo código dentro de su ventana.*
- [x] **B1-3 · Dispositivos**: alta, aprobación y revocación, y revocar cierra sus sesiones (F2-02).
  *Hecho el 2026-09-27: un equipo nuevo pide su registro desde el acceso (credencial en cookie
  `httpOnly`, solo su SHA-256 en la base); se aprueba en Panel → Personas → Dispositivos o, el
  primero de un local, con `pnpm equipos aprobar "<nombre>"`. Revocar cierra sus sesiones en el
  acto (comprobado en el navegador con dos equipos).*
- [x] **B1-4 · PIN con Argon2** y bloqueo creciente registrado; sesión compartida en el servidor
  (F2-03, F2-12).
  → Un PIN nunca viaja ni se guarda en claro. Un dispositivo desconocido no entra con PIN.
  *Hecho el 2026-09-27: Argon2id, bloqueo de `@l2/domain-identity` decidido en el servidor, sesión en
  cookie `httpOnly` con su hash en la base, una por equipo, caduca a los 30 min sin actividad y
  muere al salir, al revocar el equipo o al dar de baja a la persona. Cada intento, bueno o malo,
  queda en la auditoría. Publicar el tarifario ya exige la sesión y `catalogo.modificar`. Se retira
  el «solo en desarrollo» de B0-5. 18 pruebas de identidad contra la base.*
- [x] **B1-5 · Permisos en el servidor**: usuarios, roles, excepciones por persona y ajustes de la
  sucursal persistidos. `can()` se evalúa en cada acción, y la autorización de supervisor se registra
  **antes** de ejecutar (F2-05, F2-08, F2-10, F2-11, F2-13).
  → Cada ❌ de la matriz tiene su prueba y devuelve 403. Dar de baja a alguien revoca su acceso en
  menos de 5 s.
  *Código hecho el 2026-09-27, con 19 pruebas contra la base y `pnpm verify:db` en verde: directorio,
  alta/baja/reingreso/rol/PIN con las cinco puertas del dominio sobre el equipo real (la baja cierra
  sus sesiones en el acto), PIN temporal que se muestra una vez y obliga a elegir uno propio al
  entrar, excepciones (sin llaves de la casa ni a uno mismo), ajustes de sucursal con su suelo
  intocable, y `exigirPermisoOAutorizacion()` para los 🔐 (PIN del autorizador, `canAuthorize`,
  asiento antes de ejecutar). La web recibe el actor del servidor; se borran `equipo.ts` y
  `accesos.ts` del cliente. Comprobado en el navegador el 2026-09-26 con dos equipos: el alta
  enseña el PIN temporal una vez (al recargar ya no está), con él la persona entra en otro equipo y
  elige el suyo antes de llegar a su puesto; una concesión aparece en su ficha; ajustar «Reportes de
  la sucursal» para Caja le abre el panel en el otro equipo y retirarlo se lo cierra. Los 🔐 de la
  caja se conectan en B3-4.*

- [x] **B1-6 · Alta de equipos con buenas prácticas** (M-7, amplía F2-02).
  → Un local nuevo aprueba su primer equipo sin consola; aprobar exige comparar el código; una
  solicitud vieja no se aprueba.
  *Hecho el 2026-09-26: `elevacion.aprobarEquipo` (la contraseña identifica a la persona entre
  quienes tienen credenciales en la sucursal; exige `usuarios.gestionar`; los fallos bloquean al
  EQUIPO con el bloqueo creciente y, si la contraseña era de alguien, también a esa persona);
  código de emparejamiento derivado del id (sin 0/O ni 1/I) en la pantalla del equipo, en Panel →
  Dispositivos, en el diálogo de aprobar y en `pnpm equipos`; caducidad a las 24 h con renovación
  (`RENOVADO` en su historia); topes contados sobre la auditoría y la tabla (valen con varios
  procesos). Se corrige `ipDeLaPeticion`: tomaba la PRIMERA dirección de `x-forwarded-for`, que
  inventa el cliente; ahora la última, la del proxy más cercano. 13 pruebas contra la base.
  Comprobado en el navegador: tope por dirección, código igual en pantalla y consola, contraseña
  mala rechazada y buena aprobando, panel con el código, caducada en los dos lados y renovada; sin
  desplazar la página a 1366×768, 1280×800 y 800×1280.*

### Etapa 2 · Dinero (F3, sin lo fiscal)

- [x] **B2-1 · Tasas** (`ExchangeRate`): historial inmutable, carga manual con confirmación y doble
  verificación sobre el umbral, y fail-closed sin tasa del día (F3-03, F3-05, ADR-005). La
  sincronización con el BCV (F3-04) puede llegar después: para el piloto basta la carga manual.
  *Hecho el 2026-09-26: tablas `exchange_rate` y `exchange_rate_confirmation`, las dos de
  solo-agregar y con RLS (confirmar AÑADE un hecho; el valor es texto exacto con CHECK distinto de
  cero). Cada tasa lleva su **fecha valor** (`effectiveDate`, el `effectiveFrom` de §5.2): se captura
  para hoy o hasta 7 días por delante, y la caja cobra solo con `rateOfDay`, la del día confirmada;
  la de ayer bloquea. Capturan administración y supervisión (quien cobra, no); confirma
  administración, y supervisión con autorización 🔐 (PIN de quien autoriza, antes de ejecutar).
  Salto de más del 10 % o primera tasa del par: se teclea otra vez y debe coincidir. Quién captura
  y confirma lo pone el servidor, no el navegador. 20 pruebas de aplicación y 3 de base. Comprobado
  en el navegador con tres equipos: caja «Sin tasa» → capturar → confirmar (un valor mal tecleado
  se rechaza) → la caja cobra con Bs. 228,41 → supervisión confirma otra con autorización. Inicio
  del panel lee la misma tasa. Se borra `src/demo/tasas.ts`.*
- [x] **B2-1b · Tasa traída del BCV** (F3-04) y **vigencia por días hábiles**.
  → Lo traído entra pendiente y no cobra hasta confirmarlo; si la fuente cae, la carga manual sigue.
  *Hecho el 2026-09-26: dos lectores, la web del BCV (valor y fecha valor) y DolarApi (respaldo y
  contraste), probados en vivo. El servidor del BCV manda incompleta su cadena TLS: se añade el
  intermediario público de Sectigo solo a esa conexión, sin apagar la verificación (un certificado
  caducado se sigue rechazando). `tasas.sincronizar` captura PENDIENTE lo que rige hoy o en los
  próximos 7 días, no repite, y si dos fuentes discrepan para el mismo día no captura ese día (T6).
  Botón «Traer del BCV» y consulta automática cada hora (`L2_SINCRONIZAR_TASA`, se muda a
  `apps/worker` en B5). **Se corrige la regla de B2-1:** la tasa rige desde su fecha valor hasta el
  siguiente día hábil (la del viernes cubre el fin de semana; el lunes exige la del lunes); antes
  exigía fecha valor = hoy y el parque no habría cobrado en bolívares los fines de semana. Las
  pruebas de tasas corren con un reloj fijo. 9 pruebas nuevas de aplicación, 4 de lectores y 5 de
  dominio. La caja escribía «45,81 Bs/$» con 229,05 (leía la fracción como /100): corregido.*
- [x] **B2-1c · Tasa automática y en vivo** (M-8, ADR-019).
  → Un cambio de la tasa del BCV llega a todas las pantallas sin navegar, en menos de 1 minuto (menos
  de 2 s tras B5-1), y la caja cobra con él sin que nadie lo confirme. Un salto de más del 10 %, la
  primera tasa o un valor solo de un tercero no se aplican solos: salen como alerta crítica. Un cobro
  en curso conserva su tasa y avisa si cambió.
  Incluye:
  - la confirmación automática como asiento de solo-agregar («Aplicada automáticamente (BCV)»);
  - consulta cada 15 min y al arrancar, alejándose si la fuente falla, y aviso si falta la tasa del
    siguiente día hábil a la hora habitual;
  - carga manual de administración que se aplica al guardar (tecleada dos veces si salta);
  - sondeo de 60 s y al volver el foco en `TasasProvider`;
  - una sola fuente de tasa para toda pantalla que muestre bolívares (entrada, salida, caja, recibo,
    ventas, Inicio);
  - la alerta de Inicio llevando a Tasas y diciendo «Sin tasa vigente».

  *Hecho el 2026-09-27 (v0.15.0):*
  *· Dominio: `autoApplyDecision` (SOLO_TERCERO → PRIMERA → SALTO), `heldRates`,
  `missingNextBusinessDayRate`, `isBusinessDay`/`nextBusinessDay`; 13 pruebas nuevas. En
  `@l2/domain-money`, `sameRate`: dos tasas se comparan por valor (857,0058 = 857,00580000).*
  *· Base: migración `20260929000000_tasa_automatica`: `exchange_rate.held_back` (solo si la trajo un
  proceso) y `exchange_rate_confirmation.automatic` (sin persona, autorizador ni doble tecleo), con
  CHECK y 2 pruebas.*
  *· Aplicación: `sincronizar` aplica sola con asiento `tasa.aplicar` y a nombre de «Aplicada
  automáticamente (BCV)», y vuelve a mirar las pendientes que trajo un proceso; `capturar` de
  administración se aplica al guardar (tecleada dos veces si salta o es la primera), la de supervisión
  sigue con 🔐; `leer(ctx, ahora)` devuelve `alertas` (RETENIDA crítica, FALTA_SIGUIENTE aviso desde
  las 6:00 pm de un día hábil).*
  *· Web: sondeo de 60 s y al volver el foco en `TasasProvider`; Tasas con alertas, «Revisar y
  confirmar», «Guardar y aplicar» y «Aplicada sola»; Inicio lee `useTasaVigente` y su alerta dice «Sin
  tasa vigente» y lleva a Tasas; consulta al BCV al arrancar y cada 15 min, alejándose si no responde.
  La caja congela la tasa con el primer pago y, si la vigente cambia, lo dice en la franja del medio
  (56 px fijos): «Tasa nueva» con «Mantener» y «Usar la nueva». La primera versión del aviso iba
  dentro del visor, ocupaba cuatro renglones y sacaba «Cerrar cobro» de la pantalla a 1366×768.*
  *· Comprobado en el navegador con dos equipos: confirmar la del viernes en Tasas llega a la barra de
  la caja a los 57 s sin navegar; «Traer del BCV» aplica sola la del lunes («Aplicada sola: …») y se
  va la alerta; con un pago en Bs. a medias, aplicar otra tasa desde administración saca el aviso en
  la caja a los 55 s, «Usar la nueva» reconvierte (Bs. 4.954,29 → 4.979,40) y «Mantener» sigue con la
  del cobro. Tasas, Inicio y caja a 1366×768, 1280×800 y 800×1280 sin desplazar el documento ni
  desbordar a lo ancho, con «Cerrar cobro» siempre a la vista; sin errores de consola.*
  *Queda para después: el rechazo en el servidor de un cobro con una tasa que ya no rige (B3-3), el
  empuje en menos de 2 s (B5-1) y el umbral configurable (D-CORD).*
- [x] **B2-2 · Impuestos con vigencia** persistidos, más la pantalla **Configuración → Impuestos**
  (contrato `impuestos.ts`).
  → Programar una alícuota con fecha de hoy cambia el ticket; con fecha del mes que viene, no.
  *Hecho el 2026-09-27 (v0.16.0):*
  *· Dominio (`@l2/domain-tax`): `taxTimeline` arma el calendario de lo programado (el fin de un tramo
  es el comienzo del siguiente; con el mismo comienzo manda la última; lo que no cambia la alícuota no
  abre tramo, y así programar la vigente cancela un cambio), `ivaRulesOf` (lo exento, 0 % siempre),
  `igtfAt`, `missingTaxesAt`, `scheduleProblem` (nunca hacia atrás) y porcentajes sin coma flotante.
  `startOfDay` en `@l2/domain-rates`. 18 pruebas nuevas.*
  *· Contrato: `VigenciaImpuestoSchema`, `ImpuestosSchema` (vacío vale: local nuevo) y
  `ProgramarImpuestoCommandSchema` con el DÍA; el instante y quién lo pone el servidor (se retira el
  `por` que mandaba el navegador).*
  *· Base: migraciones `20260930000000_impuestos` y `…010000_impuestos_trato_obligatorio`: `tax_rate`
  de solo-agregar con RLS, CHECK de impuesto, trato (lo exento no se guarda), rango y
  `effective_from >= scheduled_at` (el pasado no se reescribe), y una sola programación por impuesto e
  instante. La segunda corrige un CHECK que dejaba pasar un IVA sin trato (ver §5). 3 pruebas.*
  *· Aplicación: `impuestos.leer` (sin persona: la caja lo necesita) e `impuestos.programar`
  (`catalogo.modificar` con elevación; hoy rige desde ya, otro día desde su medianoche en Caracas;
  hasta 366 días; lo que no cambia nada se rechaza; asiento `impuesto.programar` con lo que regía y lo
  que regirá; el rechazo por permiso, auditado). La semilla programa 16 %, 8 % y 3 %. 15 pruebas.*
  *· Web: Configuración → Impuestos (rige ahora, calendario por impuesto con «Rige ahora»,
  «Programado» y «Terminó», y «Programar un cambio»). La caja lee el calendario en el servidor y
  elige las alícuotas del instante (hora del servidor que avanza con el reloj); sin alguna vigente no
  cobra y enlaza a Impuestos. Se borran las alícuotas de `src/demo/caja.ts`.*
  *· Comprobado en el navegador con dos equipos: ticket de $ 5,00 → total $ 5,80; programar el IVA
  general al 15 % para el 27 oct no lo cambia; al 15 % para hoy, $ 5,75 (IVA 15 %); devuelto al 16 %,
  $ 5,80. Programar el 16 % que ya rige: «Ese día ya rige esa alícuota» en el campo; IGTF al 2 % el 27
  oct y luego al 3 %: «se cancela el cambio». Impuestos a 1366×768, 1280×800 y 800×1280 sin desplazar
  el documento ni desbordar; sin errores de consola. No se vio en el navegador la caja sin impuestos
  (la base local los tiene): lo cubren `missingTaxesAt` y su prueba.*
- [x] **B2-3 · Libro de pagos append-only con idempotencia**, y la reversión como asiento (F3-09,
  F3-10, §5.5).
  → Un doble clic produce un solo cobro. Al revertir quedan los dos asientos y el original intacto.
  *Hecho el 2026-09-27 (v0.17.0). **Alcance acordado con el cliente:** el libro en el servidor; la
  caja cobra contra él en B3-3, así que este paso no tiene pantalla ni se comprueba en el navegador
  (DoD 7 y 9 no aplican; el criterio se demuestra contra la base).*
  *· Dominio (`@l2/domain-cash`, `libro.ts`): tipos COBRO, VUELTO, PROPINA y RESIDUO (§5.6), los siete
  medios de §5.5 con su moneda, `entryProblem`, `reversalOf`, `reversalProblem` y `ledgerBalance`
  (cada asiento con su tasa congelada; USDT a la par). 9 pruebas.*
  *· Contrato (`libro.ts`): `AsentarPagosCommandSchema` (clave de la operación, documento y asientos;
  el navegador no manda ni el valor de la tasa, ni el IGTF, ni quién), `RevertirPagoCommandSchema`
  (motivo de la lista; «Otro» exige explicarlo) y `LibroDocumentoSchema`. 8 pruebas.*
  *· Base: migración `20261001000000_libro_de_pagos`: `payment` de solo-agregar con RLS, FK compuestas
  (sucursal, tasa, persona, equipo, asiento revertido), única `(operation_key, line)` (I-11) y una
  reversión por asiento; CHECK de tipo, medio y moneda del medio, signo (original positivo, reversión
  negativa con motivo), IGTF solo en cobros, vuelto solo en efectivo y bolívares con su tasa; y un
  disparador que exige que la reversión sea el original con el signo contrario (mismo documento,
  medio, tasa e IGTF) y que no se revierta una reversión. 5 pruebas.*
  *· Aplicación (`pagos`): `asentar` (`documento.emitir`; tasa citada y confirmada, su valor copiado
  de la base; IGTF del instante con la alícuota de la base, y sin ella no se cobra en divisas; todo o
  nada; la misma clave devuelve lo asentado y con otro contenido es CONFLICTO; el doble clic
  simultáneo se resuelve con la unicidad de la base), `revertir` (`cobro.anular`, 🔐 registrado antes
  de ejecutar; idempotente; una sola vez) y `libro` (saldo calculado). Asientos `pago.asentar` y
  `pago.revertir`. 17 pruebas.*
- [ ] **B2-4 · `businessDate` en toda fila de dinero** (F3-11, ADR-009), y **calendario de feriados
  bancarios** (lo usa la vigencia de la tasa).
  → Una venta a la 1:30 am cuenta en el día del turno que la generó. Un feriado entre semana sigue
  cobrando con la tasa del día hábil anterior, sin carga manual.

### Etapa 3 · Caja (F4)

- [ ] **B3-1 · Turno real**: la pantalla de **apertura** con fondo por moneda en `/turno` (contrato
  `turno.ts`) y un turno por dispositivo (I-06) (F4-01). El punto de cobro sale del equipo, no fijo.
  → Sin turno abierto no se cobra. La barra deja de decir «Turno sin abrir» fijo: lee el turno real.
- [ ] **B3-2 · Medios de pago, terminales y datos de cobro** persistidos; los datos de pago, **cifrados
  en reposo** (F4-02, F4-04). Se borran `src/demo/medios.ts` y la parte de medios de `caja.ts`.
- [ ] **B3-3 · Cobro mixto y vuelto en el servidor** contra el libro, con la tasa congelada (F4-03,
  F4-04b, F4-04c, §5.6). Necesita B9-1: la venta de mostrador vende del catálogo de la base y tiene su
  tipo de cuenta «mostrador». Las cuentas dejan de vivir en el almacenamiento del navegador.
  → Un cobro que no cuadra al céntimo no se confirma. Un cobro con una tasa que ya no es la vigente se
  rechaza fuera de un margen corto (ADR-019).
- [ ] **B3-4 · Ventas del turno**: reimprimir queda como copia auditada y anular es una reversión
  (DEC-24). Las autorizaciones 🔐 de la caja (anular, cortesía, descuento) van al servidor con
  `exigirPermisoOAutorizacion`: se quitan los PIN «1970» comprobados en el navegador y se borra
  `src/demo/usuarios.ts`.
- [ ] **B3-5 · Cortes X y Z, arqueo y excepciones reales** derivadas del libro, cortesías y
  anulaciones incluidas (F4-05 a F4-08). Hoy las excepciones son un dato fijo.
  → Después del Z, ninguna operación toca ese turno.

### Etapa 4 · Parque (F5, es el producto)

- [ ] **B4-1 · `Guardian`, `Kid` y `ParkSession`**, sin entidad pulsera. El código solo es único entre
  estancias activas (F5-01, F5-12, I-04). El directorio de representantes se persiste.
- [ ] **B4-2 · Entrada y estancias con cronómetro del servidor**: prepago y postpago, gracia y
  penalización. El monitor usa el tarifario publicado (F5-02, F5-05 a F5-07, ADR-010).
  → Cambiar el reloj de la tablet no altera el tiempo cobrado.
- [ ] **B4-3 · Salida y liquidación**: cobrar en caja o cargar a una mesa sin cobrar dos veces. Incluye
  la recarga de tiempo, las estancias huérfanas y el paso pulsera → cuenta en caja (F5-11, F5-13,
  F5-14).
- [ ] **B4-4 · Ajustes de la sucursal** persistidos: formato de hora, umbral de residuo y servicio
  (F5-08b).

### Etapa 5 · Tiempo real e impresión (`apps/worker`, ADR-006)

- [ ] **B5-1 · Socket.io con adaptador Valkey** y autorización en el handshake (F2-09, ADR-008). El
  monitor, la cola de caja, la tasa y el panel en vivo se actualizan solos, y esto sustituye a
  `BroadcastChannel` y al sondeo de la tasa. Los eventos salen de una **tabla outbox** escrita en la
  misma transacción que la operación: ninguno se pierde ni se publica uno de una operación que no
  ocurrió. Nace `apps/worker`, con los trabajos programados: la sincronización del BCV se muda allí.
  → El cambio llega a otro equipo en menos de 2 s. Una sucursal no recibe eventos de otra. Con el
  worker caído, la operación sigue y los eventos se entregan al volver.
- [ ] **B5-2 · Cola de impresión por TCP 9100** y plantillas de 58 y 80 mm, más la pantalla
  **Configuración → Impresoras** (contrato `impresoras.ts`) (F1-10, F1-12, ADR-015).
  → El recibo no fiscal sale en papel real en los dos anchos. Sin confirmación de impresión, nada avanza.
- [ ] **B5-3 · Gaveta** que solo se abre asociada a una operación (F4-09).

### Etapa 9 · Catálogo e inventario (F8, M-9)

Número nuevo para no renumerar las etapas que el código ya cita. Va antes del staging; su primer paso,
antes del cobro en servidor (orden de ejecución).

- [ ] **B9-1 · Catálogo de productos** de venta directa y de consumo en cuenta: nombre, categoría,
  precio en USD con vigencia, código de IVA y si lleva control de stock (F8-02). Pantalla Panel →
  Inventario → Productos.
  → La caja vende del catálogo de la base y se borra `features/cash/catalogo-mostrador.ts`. Cambiar un
  precio no altera una venta ya hecha.
- [ ] **B9-2 · Movimientos de stock de solo-agregar** (F8-05, I-10): la existencia es la suma de
  movimientos. Una venta de mostrador descuenta en la misma transacción que el cobro, y anular es un
  movimiento de reversión.
  → Toda diferencia de existencia tiene un movimiento que la explica. Un doble clic no descuenta dos veces.
- [ ] **B9-3 · Compras y costo promedio ponderado** (F8-06), con insumos y conversiones de unidad
  (F8-01).
  → El costo tras dos compras a precios distintos coincide con el cálculo del contador; comprar por caja
  y vender por unidad cuadra.
- [ ] **B9-4 · Ajustes con motivo de lista cerrada y 🔐, y conteo físico** (F8-07): se cuenta, se ve la
  diferencia y se ajusta con autorización.
  → Ningún ajuste sin motivo ni asiento. El conteo deja la existencia igual a lo contado.
- [ ] **B9-5 · Alertas de stock crítico** con antelación por producto (F8-08), en Inicio y en el
  inventario.
  → Avisa antes de quedarse sin producto.

### Etapa 6 · Restaurante en el servidor (fuera de la Ruta A, depende de D-RES)

- [ ] **B6-1** Mesas, plano y carta persistidos (F6-01 a F6-03).
- [ ] **B6-2** Comandas y KDS sobre el servidor, con la máquina de estados de `@l2/domain-orders`
  (F6-06 a F6-09).
- [ ] **B6-3** Cuenta de mesa, vinculación de pulseras y división (F6-05, F6-12, F6-14).
- [ ] **B6-4** Recetas con subrecetas, descarga de stock al marcar LISTO (idempotente, ADR-012) y reporte
  de merma (F8-03, F8-04, F8-09).

### Etapa 7 · Staging en VPS

- [ ] **B7-1 · VPS con Docker, HTTPS y dominio**; despliegue reversible y migraciones ensayadas antes
  (F1-15, §10.3).
- [ ] **B7-2 · Datos maestros reales** cargados con semillas (`pnpm db:seed`) (F0-04, F1-16).
  **Bloqueado por el cliente.**
- [ ] **B7-3 · Medición con red real**: carga, error y degradación con latencia de verdad (RIE-13); la
  app instalada en una tablet Android real (T-5); los 12 tamaños otra vez.
- [ ] **B7-4 · Respaldos**: volcado diario cifrado fuera del VPS y una **restauración ensayada**
  (F10-04, F10-05).
- [ ] **B7-5 · Revisión de seguridad** contra PLAN §7 y auditoría de dependencias (F10-06, F10-09).

### Etapa 8 · Producción

- [ ] **B8-1 · Decidir D-INF** (§4) y, si es servidor en el local, montarlo con su runbook (F10-03,
  F10-03b).
- [ ] **B8-2 · Runbooks, contingencia en papel, manual y capacitación por rol** (F10-10, F11-02,
  F11-03, F11-08).
- [ ] **B8-3 · Operación en paralelo** con el método anterior, piloto de un turno y ajustes (F11-04 a
  F11-06).
  → Los totales de los dos sistemas coinciden todos los días del período.
- [ ] **B8-4 · Puesta en marcha con plan de reversión** (F11-07). Si D-INF es un servidor en el local,
  también el equipo en espera ensayado (F11-07b). **Es la versión 1.0.0** (M-10).

---

## 4. Lo que bloquea y quién lo desbloquea

**Decide el cliente**

| # | Decisión | Propuesta | Hace falta antes de |
|---|---|---|---|
| **D-INF** | Producción solo en un VPS, o servidor en el local con el VPS como réplica (ADR-003) | Servidor en el local: con cortes de internet frecuentes, un VPS solo deja sin caja y sin cocina | B8-1 |
| **D-RES** | ¿El piloto incluye el restaurante en el sistema? | No: primero el parque (DEC-12, Ruta A). El restaurante sigue como hoy durante el piloto | Etapa 6 |
| F0-04 | Datos maestros reales: tarifas, carta, precios y personas | Los editores ya existen para cargarlos | B7-2 |
| F0-03 | Medidas reales del local para el plano | — | B6-1 |
| D7 | Quién asigna los puestos de trabajo | Hoy se deducen del rol (`PUESTO_DE_ROL`) | B1-5 |
| D9 | Un niño que sale sin su representante | Sin propuesta todavía | B4-3 |
| D13 | Número de orden continuo o diario | Hoy es continuo (`#1049`) | B3-4 |
| — | Informes del panel ejecutivo (F9-01 a F9-07) | Después del piloto; Inicio ya enseña el día | — |
| F-12 | ¿El teléfono entra en el objetivo? | Revisarlo en B7-3 | B7-3 |
| F0-09 | Firma formal del alcance | Las 29 decisiones están cerradas | B8-3 |
| D-CORD | Umbral de cordura de la tasa automática (M-8) | 10 % respecto de la vigente (hoy fijo en el código) | B7-2 |
| D-FER | Calendario de feriados bancarios de Venezuela | Cargarlo por año desde el panel, con los de ley precargados | B2-4 |
| D-INV | Alcance del inventario en el piloto | Solo productos de mostrador (bebidas, snacks); los insumos de cocina con el restaurante | B9-1 |
| D-AUT | ¿Supervisión puede autorizarse a sí misma un 🔐? (hoy sí, `canAuthorize`) | No en tasas ni ajustes de inventario; sí en la caja cuando no hay otra persona | B3-4 |

**Confirma el contador** (lo fiscal queda fuera, pero esto cambia lo que se cobra)

- **IGTF sobre el vuelto (C13).** Hoy se grava todo lo entregado en divisas: para una cuenta de
  $ 11,47 pagada con $ 15 se cobran $ 0,45 de IGTF, no $ 0,34. **Hay que confirmarlo antes del piloto.**
- USDT a la par con el dólar para el cobro y para el IGTF.
- Alícuotas vigentes: IVA 16 %, 8 % y exento, e IGTF 3 %. Con B2-2 se cambian sin desplegar.

**Trabajo de campo:** calibrar el lector de pulseras (umbrales de 55 y 45 ms), probar la impresora y la
gaveta reales (B5-2) e instalar la app en una tablet Android (B7-3, necesita HTTPS).

---

## 5. Deuda y errores ya vistos

**Deuda registrada**

| Qué | Se salda en |
|---|---|
| La venta de mostrador se guarda como cuenta de familia con una estancia ficticia (`s-mostrador`) | B3-3: la cuenta tendrá su tipo «mostrador» |
| Las pulseras de la entrada no quedan en la cuenta: en caja, «no tiene cuenta» | B4-3 |
| El dominio de caja conserva `PointOfSale` con taquilla y mostrador (DEC-25/26 los dejan genéricos) | B3-1 |
| `text-base` pinta también `--color-base` (Tailwind 4): para 16 px se usa `text-[16px]` | Al pasar por cada pantalla |
| El diálogo de anular un cobro desplaza para llegar al PIN a 1366×768 | B3-4 |
| Aprobar un equipo no avisa en vivo a la administración (queda en la auditoría y en su historia) | B5-1 |
| Un código TOTP se puede reutilizar dentro de su ventana de 30 s (elevar y aprobar equipos) | B7-5 |
| La IP es la última de `x-forwarded-for`: correcto con UN proxy delante; con dos (p. ej. Cloudflare + Caddy) hay que contar saltos. En desarrollo, sin proxy, se puede falsear | B7-1 |
| La medición de interfaz vive fuera del repo (`C:/tmp/pw_test`) | B7-3 (`pnpm audit:ui`) |
| Sin Storybook; sin `apps/printer-agent` (DEC-8: la impresora es de red) | Fuera de la Ruta A |
| El umbral de variación de la tasa es fijo (10 %) y la zona horaria, `America/Caracas` en el código | D-CORD (umbral) y B4-4 (zona) |
| El «día» de la tasa es el del calendario del local, no el que declara el turno (ADR-009) | B2-4 |
| Los feriados entre semana no se conocen: ese día exige capturar la tasa a mano (aunque el BCV no publique) | B2-4 (D-FER) |
| Una pendiente traída antes de B2-1c no tiene `held_back`: no sale como alerta (solo afecta a bases con datos viejos) | Base limpia antes del piloto |
| El motivo de una retenida es el del momento en que se trajo: si al volver a mirarla cambia (p. ej. de SOLO_TERCERO a SALTO), el texto de la alerta no lo dice | B5-1 |
| El documento del libro (`payment.document_id`) no tiene FK: la tabla de cuentas y ventas llega con B3-3 | B3-3 |
| El libro no tiene turno ni `businessDate` todavía | B2-4 (`businessDate`) y B3-1 (turno) |
| Qué medios disparan IGTF en el libro es el trato por defecto (divisas y cripto), no la configuración del local | B3-2 |
| Un asiento del libro no guarda la referencia del pago (Pago Móvil, punto, TxID): se añade cifrada | B3-2 |
| El libro no comprueba que el cobro cuadre con el total del documento ni que la tasa citada sea la vigente | B3-3 |
| Supervisión puede autorizarse a sí misma un 🔐 (regla del dominio, `canAuthorize`): en la tasa, confirma con su propio PIN | B3-4 (D-AUT) |

**Inventario de lo provisional y lo simulado (M-11).** Lo que queda al 2026-09-26. Cada fila sale de
aquí en el paso que la sustituye, y T-2 comprueba que no quede ninguna.

| Qué | Dónde | Se va con |
|---|---|---|
| Medios de pago, datos que ve el cliente y terminales | `src/demo/medios.ts`, `caja.ts`, `MediosProvider` (en el navegador) | B3-2 |
| Movimientos y excepciones del turno (vacíos), turno «sin abrir» fijo en la barra, punto de cobro fijo | `src/demo/turno.ts`, layout de estación, página de caja | B3-1 y B3-5 |
| Catálogo de mostrador (agua, maltas, tequeños…) | `features/cash/catalogo-mostrador.ts` | B9-1 |
| Cuentas y ventas guardadas en el navegador | `CuentasProvider`, `VentasProvider` | B3-3 y B3-4 |
| PIN del autorizador comprobado en el navegador (`"1970"`) y la lista de autorizadores | `AnularCobroDialog`, `CortesiaDialog`, `src/demo/usuarios.ts` | B3-4 |
| Sala y representantes (vacíos) y el mapa pulsera → estancia de la caja | `src/demo/parque.ts`, página de caja | B4-2 y B4-3 |
| Directorio de familias (vacío) guardado en el navegador | `src/demo/representantes.ts`, `RepresentantesProvider` | B4-1 |
| Ajustes del local guardados en el navegador | `src/demo/sucursal.ts`, `SucursalProvider` | B4-4 |
| Bus de operación entre pestañas del mismo navegador y estado de conexión fijo («N0») | `OperacionProvider`, layout de estación | B5-1 |
| Cifras de Inicio sin fuente (venta, semana pasada) | `app/(admin)/panel/page.tsx` | B2-3, B3-5 y B4-2 |
| Plano y carta del restaurante guardados en el navegador | `src/demo/restaurante.ts`, `PlanoProvider`, `CartaProvider` | B6-1 |
| Puestos deducidos del rol (`PUESTO_DE_ROL`) | `features/identity/operador.ts` | D7 |

**Trampas del código.** Ninguna la caza `pnpm typecheck`; todas se ven abriendo la pantalla.

- `can()` devuelve una palabra (`PERMITIDO`, `REQUIERE_AUTORIZACION` o `DENEGADO`), no un booleano. Se
  compara siempre así: `can(...) !== "DENEGADO"`. Escribir `actor ? can(...) : false` da cierto para
  cualquiera. Mejor crear un ayudante con nombre, como `alcanza(actor, accion)`.
- `MoneyDisplay` pinta unidades **mayores** (`toMajor`). Si recibe unidades menores, «$ 5,00» sale
  como «500».
- Para nombrar a un niño se usa `nombreVisible` o `nombreDeEstancia`, nunca `kid.nickname ?? kid.name`,
  porque el nombre es opcional desde DEC-28.
- Nada de `parseFloat` ni `toFixed` sobre dinero o tasas. Nada de `require()` en un componente de
  cliente. Los relojes (`useAhoraLocal`) no deben colgar del pintado de un proveedor. Un dato se decide
  con una bandera, no leyendo el texto.
- Las raíces de pantalla necesitan `min-h-0` para que desplace la lista y no toda la zona.
- **El documento no desplaza nunca desde 768 px.** Las dos cáscaras (panel y estación) van con
  `md:fixed md:inset-0` y `html`/`body` con `overflow: hidden`: solo desplazan sus zonas. Una
  pantalla nueva NO pone `h-dvh` ni `min-h-screen` propios; reparte su alto dentro de la zona de
  contenido (`min-h-0` + `overflow-y-auto` donde toque). Sin esto, cualquier cosa colgada de
  `<body>` (una extensión del navegador, p. ej.) daba doble barra y se llevaba el menú.
- La web guarda la conexión con `@l2/application` en `globalThis`: tras añadir un caso de uso o un
  método, **reiniciar `pnpm dev`**, o sale «Cannot read properties of undefined».
- Un dato provisional de `src/demo` que se valida contra un contrato (p. ej. el monitor lleva una
  tasa) revienta al abrir la pantalla si el contrato cambia: `pnpm typecheck` no lo ve.
- Una prueba que depende del día (la tasa, el día de negocio) corre con **reloj fijo**; con la hora real
  da otra cosa según el día de la semana (la del viernes vale el sábado).
- Una fracción de `@l2/domain-rates` está **reducida** (229,05 = 4581/20): para escribir una tasa se usa
  el valor capturado con `formatTasaVE`, nunca el numerador.
- Un CHECK con `columna IN (...)` sobre una columna que admite nulos **deja pasar el nulo** (`NULL IN`
  es desconocido, y un CHECK desconocido pasa). Se escribe `columna IS NOT NULL AND columna IN (...)`.
- El servidor del BCV manda incompleta su cadena TLS: su lector añade el intermediario de Sectigo
  (`certificado-bcv.ts`, vence en 2036). Nunca se apaga la verificación.

---

## 6. Estado por fase (resumen)

| Fase | Estado | Qué falta para cerrarla |
|---|---|---|
| F0 · Decisiones | 29 decisiones cerradas | Datos maestros, relevamiento y firma (§4) |
| F1 · Cimientos | Monorepo, tipos, fronteras, tokens, contratos, escáner y PWA hechos | Docker, Prisma, CI, observabilidad, staging y semillas (Etapas 0 y 7) |
| F2 · Identidad | **Hecha en el servidor** (Etapa 1, más M-7) | Tiempo real en el handshake (B5-1) |
| F3 · Dinero | Tasas en la base, traídas del BCV, aplicadas solas y en vivo (B2-1, B2-1b, B2-1c); impuestos con vigencia (B2-2); libro de pagos (B2-3) | `businessDate` y feriados (B2-4). **Sin F3-08** (M-3) |
| F4 · Caja | Interfaz completa | Turno, libro, cortes y excepciones reales (Etapa 3) |
| F5 · Parque | Interfaz completa, con el dominio de tiempo puro | Estancias y cronómetro en el servidor (Etapa 4) |
| F6 · Restaurante | Interfaz completa (DEC-22) | Etapa 6, según D-RES |
| F7 · Fiscal | **Fuera** (M-3) | — |
| F8 · Inventario | Interfaz de insumos y recetas por hacer; **vuelve al plan** (M-9) | Etapa 9 (mostrador) y B6-4 (recetas) |
| F9 · Panel | Inicio y el local en vivo, en interfaz | Tiempo real (B5-1); los informes, después del piloto |
| F10 y F11 | Sin empezar | Etapas 7 y 8 |

---

## 7. Registro

Una línea por sesión que cambie el rumbo. El historial anterior está en la bitácora retirada:
`git show e250c54:docs/BITACORA.md`.

- **2026-09-26** · Se consolida la documentación en este archivo y se retira la orquesta con Gemini
  (M-2). El frontend queda congelado (M-1), lo fiscal queda fuera (M-3) y se fija la ruta local → VPS
  (M-4). Empieza la Etapa 0.
- **2026-09-26** · Etapa 0 hecha en local (B0-1 a B0-5): Docker, Prisma con RLS forzada, logs con
  redacción, lint y CI, y el tarifario como primera escritura real. B0-4 queda a falta de ver el CI
  en GitHub.
- **2026-09-26** · Pedido del cliente: fuera el modo demo y el simulador (M-6) y todo el backend según
  la ruta. Se retiran; queda el bus de operación. ADR-018: sesión propia en vez de Better Auth.
- **2026-09-27** · Etapa 1: auditoría (B1-1), equipos y sesiones (B1-3, B1-4), elevación con TOTP
  (B1-2) y personas/permisos/accesos/autorización (B1-5, falta el navegador).
- **2026-09-26** · B1-5 comprobado en el navegador: Etapa 1 cerrada. B2-1: tasas en la base con
  fecha valor; la caja cobra solo con la del día confirmada.
- **2026-09-26** · M-7: el alta de equipos sigue buenas prácticas (aprobar desde el propio equipo con
  credenciales de administración, código de emparejamiento, caducidad y topes). Se corrige la IP de
  la auditoría, que se podía falsear.
- **2026-09-26** · Una sola barra de desplazamiento en todo el proyecto; fuera los datos inventados de
  sala, familias, turno e Inicio; la tasa se trae del BCV (B2-1b) y la del viernes cubre el fin de
  semana. Evolución del plan a pedido del cliente: tasa automática y en vivo (M-8, ADR-019), el
  inventario vuelve (M-9, Etapa 9), versionado semántico visible (M-10, desde 0.13.0), cero código
  simulado (M-11, T-2), definición de hecho de un paso y orden de ejecución.
- **2026-09-27** · Base local vaciada y sembrada de cero (las tasas de prueba tapaban la del BCV).
  T-1: la versión se ve en el acceso y en Configuración (v0.14.0), con CHANGELOG y etiquetas.
  B2-1c con el código hecho (la tasa del BCV se aplica sola con salvaguardas, sondeo de 60 s, la caja
  congela la tasa del cobro); falta verlo en el navegador.
- **2026-09-27** · B2-1c comprobado en el navegador y entregado (v0.15.0): el aviso de tasa cambiada
  pasa a la franja fija de la caja con «Mantener» y «Usar la nueva». Sigue B2-2.
- **2026-09-27** · B2-2 entregado (v0.16.0): los impuestos se programan con fecha en Configuración →
  Impuestos y la caja cobra con los del instante. Sigue B2-3.
- **2026-09-27** · B2-3 entregado (v0.17.0): el libro de pagos en el servidor, idempotente y con la
  reversión como asiento; la caja lo usará en B3-3 (alcance acordado con el cliente). Sigue B2-4.

---

## 8. Handoff

**Cuando el usuario escribe «handoff»:**

1. Se actualizan §1 (dónde estamos), las casillas de §3 y una línea en §7.
2. Si hubo código, se pasa `pnpm verify`. Después se hace commit; el push solo si se pide.
3. Se reescribe el bloque de abajo y se entrega en el chat, listo para copiar y pegar en una sesión
   nueva. Tiene como mucho 15 líneas y responde a: dónde quedó, el paso siguiente con su criterio, qué
   quedó a medias y con qué hay que tener cuidado.

**Último handoff (2026-09-27, v0.14.0, B2-1c a medias):**

```text
Proyecto L2 Control. Lee docs/MAESTRO.md (§1, §2 M-8 a M-11 y §3 con su DoD y orden) y CLAUDE.md. Español.
Rol: full-stack senior; programas tú todo. Versión 0.14.0 (T-1 hecho: versión visible, CHANGELOG, etiquetas v0.1.0…v0.14.0 locales).
Arrancar: Docker Desktop → pnpm infra:up → pnpm db:migrar → pnpm dev (la base local ya está limpia y sembrada).
Entrar: /acceso → «Pedir registro» → «Soy de administración» (contraseña abby-kingdom-desarrollo +
  código de `pnpm totp`) → persona → PIN 1970. Tras cambiar @l2/application, reinicia pnpm dev.
Estado de la base: vaciada el 2026-09-27; el servidor trajo del BCV las reales y las dejó RETENIDAS (viernes 855,6625
  solo DolarApi; lunes 857,0058 primera del local). El cliente las revisa en Tasas y aprueba su «Pc Admin».
A medias: B2-1c. Código y pruebas hechos (verify:db en verde); falta el navegador: lista (1)-(6) en su casilla de §3
  (en vivo < 60 s en otro equipo, «Traer del BCV» aplica la del lunes, aviso de tasa cambiada en la caja, 3 tamaños,
  ADR-019, cierre con 0.15.0 y etiqueta).
Luego el orden de §3: B2-2 → B2-3 → B2-4 → B3-1 → B3-2 → B9-1 → B3-3 … Inventario = Etapa 9 (M-9).
Cuidado: cada paso cumple la DoD de §3 y borra lo suyo del inventario de §5 (M-11). Heredocs grandes en bash fallan:
  escribe scripts con Write. Etiquetas y commits sin subir: push solo si se pide (con --tags).
Puerta: pnpm verify:db.
```
