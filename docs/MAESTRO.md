# L2 Control — documento maestro

> **El único documento vivo del proyecto.** Actualizado: **2026-09-26**.
>
> Aquí están el estado, la ruta hasta producción, lo que bloquea y el handoff. Nada de esto se escribe
> en otro sitio. Hay tres referencias que **no se editan** y se citan por sección:
>
> - [PLAN.md](PLAN.md): la especificación. ADRs, decisiones del cliente (DEC-n) y tareas `Fn-nn` con su
>   criterio de aceptación en §12. Sus casillas y sus enlaces a documentos retirados están congelados.
> - [FLUJOS.md](FLUJOS.md): cómo se mueven personas, pedidos y dinero en el local. El código lo cita.
> - [adr/](adr/): las 17 decisiones de arquitectura, una por archivo.
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

**El frontend está terminado sobre datos de ejemplo y congelado. El backend no existe todavía.**

- **Interfaz hecha:** acceso por PIN (`1970`), monitor, entrada, salida, caja (cobro mixto, vuelto,
  cortesía, división de cuentas de mesa), ventas (reimpresión y anulación), turno (cortes X/Z y arqueo),
  mesas con plano, cocina (KDS) y el panel. El panel incluye el local en vivo y los editores de tarifas,
  plano, carta, tasas, medios de pago, sucursal, usuarios, roles, dispositivos y representantes.
  Es instalable como PWA y está medida en 12 tamaños de desktop y tablet.
- **Núcleo puro y probado:** `@l2/contracts` (Zod) y el dominio `money`, `rates`, `tax`, `cash`, `park`,
  `identity` y `orders`. Los contratos `impuestos.ts`, `impresoras.ts` y `turno.ts` ya existen, aunque
  sus pantallas no.
- **Sin servidor:** todo vive por pestaña (`sessionStorage`), y solo el simulador y las cuentas cruzan
  pestañas (`BroadcastChannel`). Entre dos equipos no se comparte nada. Los datos son inventados y
  están en `apps/web/src/demo`.
- **Base de datos local en marcha** (B0-1): `pnpm infra:up` levanta PostgreSQL y Valkey con Docker.
  En esta máquina ya hay otro PostgreSQL en el 5432 (ajeno al proyecto); el nuestro usa el 5433.
- **Persistencia base** (B0-2): `@l2/database` con `tenant` y `branch`, RLS forzada y su prueba
  negativa. Para trabajo de backend, la puerta es `pnpm verify:db`.

**Siguiente paso:** B0-4 (§3).

---

## 2. Decisiones de esta etapa (2026-09-26)

| # | Decisión | Consecuencia |
|---|---|---|
| **M-1** | **Se congela el frontend.** No se construyen más pantallas sobre datos de ejemplo | Las tres que faltaban (apertura de turno, impuestos, impresoras) se hacen **directamente contra el servidor**, en su etapa. Así cada pantalla se construye una sola vez. El inventario (tanda D) pasa a después del piloto, porque está fuera de la Ruta A. Los hallazgos de la antigua Ola 5 se corrigen al pasar por cada pantalla (§5), y la medición final se hace en staging (B7-3) |
| **M-2** | **Claude programa todo.** Se retira la orquesta con Gemini | Se borran `scripts/obrera.mjs`, ORQUESTA y los encargos. Los comentarios del código que dicen «escrito por la obrera» se quedan: son historia |
| **M-3** | **Nada fiscal por ahora** | F7 queda fuera, igual que el hito M1 (F3-08, las 20 facturas), la máquina fiscal y la nota de crédito. El recibo es **no fiscal**. IVA e IGTF **se siguen calculando** en el ticket, porque ya están hechos y cambian lo que se cobra |
| **M-4** | **Entornos: primero local (Docker), luego VPS** | ⚠ **Choca con ADR-003**, que pide un servidor en el local y usa la nube solo como réplica. Con solo un VPS, un corte de internet detiene los cobros y la cocina. **Propuesta:** el VPS sirve de staging y para el piloto en paralelo, donde el método anterior hace de respaldo (F11-04). La topología final (D-INF, §4) se decide antes de retirar ese método. El servidor se empaqueta en Docker para que la misma imagen corra en el VPS o en un mini-PC sin cambios |
| **M-5** | **Un solo documento vivo y handoff a petición** | Este archivo. El protocolo está en §8 |

La Ruta A (PLAN §11.3) sigue siendo el alcance: parque y caja primero. Las cinco reglas de CLAUDE.md
no se relajan.

---

## 3. Ruta a producción

El orden es por dependencia: **nada cobra sin identidad y auditoría debajo** (H-06). Cada paso cuenta
como hecho solo si su criterio se cumple y se puede demostrar, y se marca aquí en el mismo commit.
Los paquetes nuevos siguen el mapa de PLAN §9.2 (`database`, `application`, `auth`, `observability`,
`hardware` y `apps/worker`), y `pnpm arch` incorpora sus fronteras al crearlos.

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
- [ ] **B0-4 · CI en GitHub Actions** con `pnpm verify` y un lint que sí haga algo: `toFixed` fuera de
  `@l2/ui`, colores literales y `parseFloat` sobre dinero (F1-14).
  → Un PR con una violación sale en rojo.
- [ ] **B0-5 · La costura entre demo y servidor** (`packages/application`). Se fija un patrón único:
  acción de servidor → contrato Zod → dominio → repositorio en transacción con `SET LOCAL app.tenant_id`.
  El primer caso vertical es el **tarifario**: leer y publicar.
  → Una tarifa publicada se ve desde otro navegador y sobrevive a reiniciar el servidor.
  `NEXT_PUBLIC_DEMO` sigue sirviendo para enseñar la demo.

### Etapa 1 · Identidad y auditoría (F2 completa, no se recorta)

- [ ] **B1-1 · `AuditLog` append-only**: un disparador rechaza `UPDATE` y `DELETE` (F2-07).
- [ ] **B1-2 · Better Auth** con cookie `httpOnly`; administración con contraseña y segundo factor
  (F2-01, F2-04, ADR-013).
- [ ] **B1-3 · Dispositivos**: alta, aprobación y revocación, y revocar cierra sus sesiones (F2-02).
- [ ] **B1-4 · PIN con Argon2** y bloqueo creciente registrado; sesión compartida en el servidor
  (F2-03, F2-12).
  → Un PIN nunca viaja ni se guarda en claro. Un dispositivo desconocido no entra con PIN.
- [ ] **B1-5 · Permisos en el servidor**: usuarios, roles, excepciones por persona y ajustes de la
  sucursal persistidos. `can()` se evalúa en cada acción, y la autorización de supervisor se registra
  **antes** de ejecutar (F2-05, F2-08, F2-10, F2-11, F2-13).
  → Cada ❌ de la matriz tiene su prueba y devuelve 403. Dar de baja a alguien revoca su acceso en
  menos de 5 s.

### Etapa 2 · Dinero (F3, sin lo fiscal)

- [ ] **B2-1 · Tasas** (`ExchangeRate`): historial inmutable, carga manual con confirmación y doble
  verificación sobre el umbral, y fail-closed sin tasa del día (F3-03, F3-05, ADR-005). La
  sincronización con el BCV (F3-04) puede llegar después: para el piloto basta la carga manual.
- [ ] **B2-2 · Impuestos con vigencia** persistidos, más la pantalla **Configuración → Impuestos**
  (contrato `impuestos.ts`).
  → Programar una alícuota con fecha de hoy cambia el ticket; con fecha del mes que viene, no.
- [ ] **B2-3 · Libro de pagos append-only con idempotencia**, y la reversión como asiento (F3-09,
  F3-10, §5.5).
  → Un doble clic produce un solo cobro. Al revertir quedan los dos asientos y el original intacto.
- [ ] **B2-4 · `businessDate` en toda fila de dinero** (F3-11, ADR-009).
  → Una venta a la 1:30 am cuenta en el día del turno que la generó.

### Etapa 3 · Caja (F4)

- [ ] **B3-1 · Turno real**: la pantalla de **apertura** con fondo por moneda en `/turno` (contrato
  `turno.ts`) y un turno por dispositivo (I-06) (F4-01).
  → Sin turno abierto no se cobra.
- [ ] **B3-2 · Medios de pago y datos de cobro** persistidos; los datos de pago, **cifrados en reposo**
  (F4-02, F4-04).
- [ ] **B3-3 · Cobro mixto y vuelto en el servidor** contra el libro, con la tasa congelada (F4-03,
  F4-04b, F4-04c, §5.6).
  → Un cobro que no cuadra al céntimo no se confirma.
- [ ] **B3-4 · Ventas del turno**: reimprimir queda como copia auditada y anular es una reversión
  (DEC-24).
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
  monitor, la cola de caja y el panel en vivo se actualizan solos, y esto sustituye a `BroadcastChannel`.
  → El cambio llega a otro equipo en menos de 2 s. Una sucursal no recibe eventos de otra.
- [ ] **B5-2 · Cola de impresión por TCP 9100** y plantillas de 58 y 80 mm, más la pantalla
  **Configuración → Impresoras** (contrato `impresoras.ts`) (F1-10, F1-12, ADR-015).
  → El recibo no fiscal sale en papel real en los dos anchos. Sin confirmación de impresión, nada avanza.
- [ ] **B5-3 · Gaveta** que solo se abre asociada a una operación (F4-09).

### Etapa 6 · Restaurante en el servidor (fuera de la Ruta A, depende de D-RES)

- [ ] **B6-1** Mesas, plano y carta persistidos (F6-01 a F6-03).
- [ ] **B6-2** Comandas y KDS sobre el servidor, con la máquina de estados de `@l2/domain-orders`
  (F6-06 a F6-09).
- [ ] **B6-3** Cuenta de mesa, vinculación de pulseras y división (F6-05, F6-12, F6-14).

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
  también el equipo en espera ensayado (F11-07b).

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
| La medición de interfaz vive fuera del repo (`C:/tmp/pw_test`) | B7-3 (`pnpm audit:ui`) |
| Sin Storybook; sin `apps/printer-agent` (DEC-8: la impresora es de red) | Fuera de la Ruta A |

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

---

## 6. Estado por fase (resumen)

| Fase | Estado | Qué falta para cerrarla |
|---|---|---|
| F0 · Decisiones | 29 decisiones cerradas | Datos maestros, relevamiento y firma (§4) |
| F1 · Cimientos | Monorepo, tipos, fronteras, tokens, contratos, escáner y PWA hechos | Docker, Prisma, CI, observabilidad, staging y semillas (Etapas 0 y 7) |
| F2 · Identidad | `can()` y alcance por sucursal hechos; el resto solo en interfaz | Todo lo de servidor (Etapa 1) |
| F3 · Dinero | Dinero, IVA, IGTF y el dominio de tasas hechos | Persistencia, libro y `businessDate` (Etapa 2). **Sin F3-08** (M-3) |
| F4 · Caja | Interfaz completa | Turno, libro, cortes y excepciones reales (Etapa 3) |
| F5 · Parque | Interfaz completa, con el dominio de tiempo puro | Estancias y cronómetro en el servidor (Etapa 4) |
| F6 · Restaurante | Interfaz completa (DEC-22) | Etapa 6, según D-RES |
| F7 · Fiscal | **Fuera** (M-3) | — |
| F8 · Inventario | **Después del piloto** (M-1) | — |
| F9 · Panel | Inicio y el local en vivo, en interfaz | Tiempo real (B5-1); los informes, después del piloto |
| F10 y F11 | Sin empezar | Etapas 7 y 8 |

---

## 7. Registro

Una línea por sesión que cambie el rumbo. El historial anterior está en la bitácora retirada:
`git show e250c54:docs/BITACORA.md`.

- **2026-09-26** · Se consolida la documentación en este archivo y se retira la orquesta con Gemini
  (M-2). El frontend queda congelado (M-1), lo fiscal queda fuera (M-3) y se fija la ruta local → VPS
  (M-4). Empieza la Etapa 0.

---

## 8. Handoff

**Cuando el usuario escribe «handoff»:**

1. Se actualizan §1 (dónde estamos), las casillas de §3 y una línea en §7.
2. Si hubo código, se pasa `pnpm verify`. Después se hace commit; el push solo si se pide.
3. Se reescribe el bloque de abajo y se entrega en el chat, listo para copiar y pegar en una sesión
   nueva. Tiene como mucho 15 líneas y responde a: dónde quedó, el paso siguiente con su criterio, qué
   quedó a medias y con qué hay que tener cuidado.

**Último handoff (2026-09-26):**

```text
Proyecto L2 Control. Lee docs/MAESTRO.md (único documento vivo) y CLAUDE.md antes de nada.
Rol: desarrollador full-stack senior; programas tú todo (ya no hay obrera Gemini).
Estado: frontend congelado sobre datos de ejemplo; backend sin empezar. main limpio.
Siguiente: Etapa 0, paso B0-1 — docker-compose.yml con PostgreSQL 17 y Valkey 8.
  Criterio: `docker compose up -d` deja el entorno listo en una máquina limpia y el README lo explica.
Luego B0-2 (packages/database: Prisma 7.4+, tenant_id, RLS FORCE, prueba negativa de aislamiento).
A medias: nada.
Cuidado: D-INF está abierta (VPS solo o servidor en el local, ADR-003): empaqueta todo en Docker para
que sirva en ambos casos. Nada fiscal (M-3). Marca cada paso en MAESTRO §3 en el mismo commit.
```
