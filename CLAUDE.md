# L2 Control — reglas del repositorio

Sistema de gestión para parque infantil + restaurante (Abby Kingdom, Venezuela).

**Un solo documento vivo: [`docs/MAESTRO.md`](docs/MAESTRO.md).** Ahí están el estado, la ruta
hasta producción (Etapas 0 a 11; la puesta en marcha es la 8), lo que bloquea y el handoff. Empieza siempre por su §1.

**El plan manda.** `docs/PLAN.md` es la especificación congelada: 17 ADRs, 29 decisiones del cliente y
las tareas `Fn-nn` con su criterio de aceptación en §12. Antes de construir algo, busca su paso en
MAESTRO §3 y su tarea en el plan. Si lo que vas a hacer no está en ninguno de los dos, es un cambio de
alcance: dilo, no lo hagas en silencio.

**Relevo entre sesiones ([`docs/HANDOFF.md`](docs/HANDOFF.md), una sección por persona).**

- **«siguiente»** (al abrir un chat): `git switch main` y `git pull --ff-only` (si hay cambios sin guardar o se
  está en otra rama, se dice y no se toca nada); se lee `docs/HANDOFF.md` entero y MAESTRO §1 y §3; se responde en
  pocas líneas qué dejó cada persona, qué pasos están reclamados y por quién, y cuál es el siguiente libre con su
  criterio; y se propone reclamarlo. No se empieza a programar sin el sí de quien escribió «siguiente».
- **«handoff»** (al cerrar): el protocolo de MAESTRO §8. Se reescribe solo la sección de quien trabajó y el
  relevo se sube por PR hasta `main`.

## Comandos

```bash
pnpm dev          # apps/web en http://localhost:3000 y apps/worker (canal en vivo) en :3001
pnpm infra:up     # PostgreSQL 17 + Valkey 8 en Docker (una vez: cp .env.example .env)
pnpm db:migrar    # migraciones · pnpm db:semilla deja el local de desarrollo listo (PIN 1970)
pnpm equipos      # la consola de equipos: pnpm equipos aprobar "<nombre>" aprueba el primero
pnpm credenciales "<nombre>"  # enlace de alta (contraseña + llave de acceso) de una persona; la semilla imprime el de Abigail
pnpm verify       # arquitectura + demostración de que muerde + pruebas
pnpm verify:db    # lo anterior + pruebas contra la base (aislamiento por tenant); antes de cada commit de backend
pnpm lint         # reglas de la casa: toFixed, parseFloat, colores, reloj en el dominio, emojis
pnpm arch         # solo las reglas de frontera
pnpm arch:demo    # comprueba que las reglas detectan una violación real
pnpm test         # pruebas de dominio
```

## Las cinco reglas que no se negocian

1. **El dominio es puro.** `packages/domain/*` no importa React, Next, Prisma, `fetch` ni
   `Date.now()`. El instante entra siempre como argumento (ADR-010). Si necesitas
   infraestructura ahí, el código va en otro sitio.
2. **`@l2/ui` no conoce el dominio.** Un componente recibe datos y emite eventos; no sabe qué
   es una estancia ni una comanda. Si lo necesita, pertenece a `apps/web/src/features/<contexto>`.
3. **El dinero es `bigint` en unidades menores, con su moneda al lado.** Nunca `number`, nunca
   `toFixed()`, nunca un monto suelto. Toda aritmética vive en `@l2/domain-money` (§5.1).
4. **Fail-closed.** Ante un error se niega, no se permite. Sin tasa de cambio vigente no se
   cobra; sin confirmación de impresión la comanda no avanza.
5. **Nada se borra.** Pagos, documentos fiscales y movimientos de stock son append-only. Un
   error se corrige con un asiento de reversión, no con un `UPDATE`.

`pnpm arch` impone las reglas 1 y 2 (y que las apps no importen `@l2/database`) y **rompe la
construcción** si se violan. `pnpm lint` impone lo que no es una importación: sin `toFixed` fuera de
`@l2/ui`, sin `parseFloat`, colores solo desde tokens, el dominio sin reloj, sin emojis en pantalla y sin
simulación (nada de negocio en el almacenamiento del navegador, ni PINs literales, ni listas de ejemplo).
Una excepción se escribe `lint-permitido: <regla> — <motivo>`, y sin motivo no vale. No es decorativo:
`pnpm arch:demo` lo demuestra inyectando una violación real.

## Estructura

```
apps/web                  Next.js 16 — todas las superficies
  app/                    rutas; app/informes/ son las vistas de impresión A4 (los PDF de Reportes, la hoja de conteo
                          y el informe de diferencias), fuera de la cáscara del panel
  src/features/<dominio>  pantallas y lógica de aplicación, por dominio (reportes/ tiene las piezas de todo informe)
  src/servidor/           entorno validado, conexión a application y logger (solo servidor)
apps/worker               canal en vivo (Socket.io + Valkey), outbox, trabajos programados (B5-1) y el aviso por correo de los reportes (T-11)
apps/printer-agent        agente de impresión de la laptop de caja: cola del servidor → impresora por TCP 9100 (ADR-026);
                          instalado, se actualiza solo y vuelve a la versión anterior si la nueva no arranca (T-8c)
packages/contracts        contratos Zod: la forma de cada dato, una vez
packages/domain/money     aritmética de dinero (puro)
packages/domain/rates     tasa vigente, fracción de conversión y límite de cordura (puro)
packages/domain/tax       IVA con vigencias e IGTF por medio (puro)
packages/domain/cash      cobro mixto, vuelto, cuadre, turno, devoluciones, carga desde papel e informe de ventas (puro)
packages/domain/park      tiempo, gracia, penalización, aforo (puro)
packages/domain/identity  permisos, autorizaciones, dispositivos, PIN y las puertas del equipo con la cuenta de soporte (puro)
packages/domain/inventory catálogo con precio por día, existencia, costo promedio, mínimos, conteo y su informe,
                          kárdex, ajuste de precio en lote y sabores (puro)
packages/domain/orders    plano del restaurante, pedido del mesero con su comanda y la atención en el salón (puro)
packages/domain/printing  ticket impreso (ESC/POS) y cola de impresión (puro)
packages/application      casos de uso: contrato + dominio + base en la transacción del tenant
packages/database         Prisma, migraciones y RLS forzada; solo lo importa application
packages/observability    logger JSON con redacción y entorno validado al arrancar (solo servidor)
packages/ui               nivel 1 primitivos + nivel 2 patrones; `cn` conoce la escala de texto (T-16)
packages/config           tokens de diseño + tsconfig base
docs/MAESTRO.md           estado, ruta a producción y protocolo de handoff (el único vivo)
docs/HANDOFF.md           el último relevo de cada persona («siguiente» lo lee, «handoff» lo reescribe)
docs/PLAN.md, FLUJOS.md   especificación y flujos del local (referencia, no se editan)
docs/adr/                 las 30 decisiones, una por archivo
```

**No hay modo demo ni simulador** (retirados el 2026-09-26, M-6): la app corre siempre contra su
servidor. Los datos provisionales de `apps/web/src/demo` se fueron paso a paso; el último (plano y carta
del restaurante) salió con B6-1 y la carpeta ya no existe. **Una pantalla nueva nace contra el servidor.**

**Del provisional al servidor (B0-5).** Una pantalla pasa a la base así: caso de uso en `@l2/application` con su
`*.test-db.ts`; lectura en `features/<dominio>/<x>.servidor.ts` (con `connection()`); escritura en
`<x>.acciones.ts` (`"use server"`, recibe `unknown`, devuelve `Resultado`); la ruta o el layout lee
en el servidor y el proveedor escribe con la acción. El modelo es el tarifario. **En vivo (B5-1, ADR-025):** toda escritura audita, y el asiento deja su evento en el
outbox en la misma transacción; el worker cuenta a cada sucursal qué temas cambiaron y cada pantalla
vuelve a leer lo suyo (`useAlCambiar` o `router.refresh()`). Nada de sondeos. Las mesas también son del servidor:
los pedidos (B6-2) y «por limpiar» (B6-14, `dining_table_cleaned`, tema `mesas`, `usePorLimpiar`); del bus del
restaurante (`features/operacion`) quedan sus eventos viejos, sin uso.

**La caja cerrada (B3-15).** Sin un turno abierto en el local nada mueve dinero (cobrar, cortesía, descuento): lo niega
el servidor. El corte Z decide solo: con otra caja abierta es RELEVO y cierra solo esa; la última es JORNADA y no cierra
con cuentas pendientes ni niños en la sala. Cerrar la caja de otro equipo es de supervisión y administración.

**El cliente de la cuenta (B6-9, M-33).** Toda cuenta del salón nace al sentar a su cliente (nombre, cédula y teléfono,
`mesas.abrir`): un pedido, una pulsera, una salida del parque o un «guardar» no abren una mesa (`MESA_SIN_CUENTA`). El
cliente vive en `account_customer` (solo agregar), no en el contenido de la versión: `vigenteDe` y `cuentas.leer` lo
ponen y `guardarVersion` lo quita. El directorio es el de representantes, con la cédula. Las pruebas sientan con
`sentarDePrueba`. La caja pregunta antes de dejar una venta del mostrador sin cobrar ni cliente (`VentaSinCobrar`).
**Las deudas (B3-11):** «Se fue sin pagar» deja la cuenta INCOBRABLE (sin estado nuevo, ADR-028) y la deuda en
`customer_debt`; se cobra en una cuenta nueva del mostrador (`deudas.cobrar`) que, cobrada entera, la salda en la misma
transacción (`deudas/saldar.ts`).

**Secciones con pestañas (T-18).** Lo que va junto vive en una sección con `pestanas` en `shell/navigation.ts`, cada
pestaña con su permiso (la sección se ve con cualquiera de ellos). La pestaña va en la dirección (`?pestana=…`,
`rutaPestana`, `pestanaPedida`) y la ruta del panel lee solo la abierta, dentro de `MarcoDeSeccion`. Una ruta que se
muda deja su entrada en `RUTAS_MOVIDAS`: un enlace guardado nunca se rompe.

**Reportes (Etapa 11).** De solo lectura (`reportes.verSucursal`), sacados de los asientos, por día de negocio del
local y con el periodo en la dirección. Cada uno arma sus secciones una vez y las pintan la pantalla y su PDF, que es la
vista de impresión de `app/informes/` con las piezas de `features/reportes/informe.tsx` (`TablaDeInforme`,
`DocumentoDeInforme`, `FiltroDePeriodo`) y la clase `.l2-informe` de los tokens. Sin librería de PDF ni Excel. El de
deudas (B11-4) lleva la cédula y el teléfono del cliente completos, en pantalla con `data-privado` y en el PDF tal cual (M-33).

**La cuenta de soporte (T-17).** Una persona de Administración con `support_login`: no sale en «¿Quién entra?», entra
por «Acceso de soporte», firma «Nombre (soporte)» y no cuenta como personal del local. Abre turnos y cobra solo con
`soporteOpera`, que la web enciende cuando `L2_ENTORNO` no es `produccion`.

**El punto de cobro y la entrada (B3-9).** El turno se abre en un equipo marcado como punto de cobro; en otro,
`turnos.abrir` pide la autorización de `turno.abrirFueraDelPunto` (el PIN de administración y un motivo). La entrada al
parque es una sola lógica (`park/useEntradaDeNinos.ts`) y unas piezas (`park/EntradaPiezas.tsx`) que usan Entrada y la
entrada desde la caja: lo que cambie en una, cambia en las dos.

**El precio del tiempo (B4-17, M-37).** Una sola regla, en `@l2/domain-park`: `precioDelTiempo` es la combinación más
barata de los paquetes de la tarifa con que entró (`porUso`) que cubre el tiempo real menos la gracia, con tope en el
pase libre; el tiempo de más va en bloques del paquete más chico, con tope en esa combinación (`tiempoDeMas`); «Más
tiempo» sube de paquete pagando la diferencia (`subirDePaquete`). La salida del servidor y la vista previa usan
`liquidarEstancia`: no se calcula un precio del parque en otro sitio. El tiempo abierto es el paquete `tiempo-abierto`
(solo en cuenta abierta, precio 0): no deja línea al entrar, y la salida le pone la suya (`abierto-<estancia>`) antes de
cerrar, así viaja con la estancia a una mesa. El bloque y el precio de excedente de la política ya no se editan.

**Vincular y desvincular (B6-3, B6-15).** Un niño vinculado está en `sessionIds` de la cuenta de su mesa y su salida va
ahí (`sessionsVinculadas`). Desvincular (`mesas.desvincular`, quien vincula, sin PIN) lo saca con `unlinkSession` y lo
pone en su familia o en otra cuenta de mesa con `receiveSession`; lo cobrado no se mueve (`unlinkProblem`). Una cuenta de
pie no recibe a un niño: su salida del parque no tiene a dónde ir.

**Cobrar juntas (B3-16).** `cobrarJuntas.juntar` lleva lo pendiente de varias cuentas de la cola a una (`joinInto`): las
líneas nuevas llevan `vieneDe` (de qué cuenta vinieron, también su clase: Ventas las cuenta en su origen) y las otras
quedan con `juntadaEn`, cerradas. Cada cuenta va con su versión; no se juntan un cumpleaños, una con partes cobradas o
descuento, la que otra persona está cobrando (su borrador, B3-13) ni, como otra, la que cobra una deuda. **Dividir por
ítems (B3-20)** usa la misma pieza: `dividir.partir` deja la línea `partida` (con su producto: el inventario sale una
vez) y crea sus partes (`parteDe`, sin producto); `dividir.dividir` pasa lo de cada persona a una cuenta del mostrador
con `divididaDe` (no es venta directa: no pide cliente ni se descarta); `dividir.unir` lo devuelve. El cobro exige todas
las líneas pendientes de una cuenta: por eso cada persona tiene la suya.

Cada paquete tiene su propio `README.md` con qué resuelve y **qué no le corresponde**. Léelo
antes de añadirle nada.

Se agrupa **por dominio, no por capa técnica**. La pregunta «¿dónde va esto?» se responde con
«¿de qué habla?», no con «¿qué tipo de archivo es?» (§9.1).

## Al escribir componentes

- Colores **solo** desde los tokens de `packages/config/tokens.css`. Ningún literal.
- **Hay dos temas (M-21): claro, el predeterminado, y oscuro**, por equipo (cookie `l2_tema`, `data-tema` en
  `<html>`). Una pantalla no sabe en cuál está: usa los tokens y los dos salen solos. Lo que se pruebe en el
  navegador se mira en los dos. En el claro, un aviso (`bg-state-crit-bg`, `bg-state-warn-bg`, o con opacidad
  de /40 en adelante) es un bloque sólido y los tokens de texto se redefinen dentro; con opacidad baja (/25,
  /35) es un tinte de zona y queda en pastel.
- Los colores de estado (`state-ok`, `state-warn`, `state-crit`) son **reservados**: significan
  siempre lo mismo y nunca se usan como decoración.
- El estado se comunica por **color + icono + texto**, nunca solo por color (§8.2).
- Cifras que se comparan o suman: clase `tnum`.
- **Tamaños de la escala (T-16), no píxeles sueltos:** `text-pagina`, `text-seccion`, `text-tarjeta`,
  `text-subtitulo`, `text-cuerpo`, `text-detalle`, `text-nota`, `text-etiqueta` y `text-cifra`; iconos con
  `size-(--icono-pos|tablet|admin|texto|etiqueta)` o `TAMANO_ICONO`. Un escalón nuevo va en los tokens **y** en
  `ESCALA_DE_TEXTO` de `packages/ui/src/cn.ts`: si no, `cn` lo toma por un color y lo descarta junto a otro color.
- **Un nombre que no cabe no se corta con «…»:** `Marquesina` de `@l2/ui` lo desliza y, con movimiento reducido, lo
  parte en renglones (T-15).
- **Lo nuevo se suma a lo que ya existe** (MAESTRO §3, definición de hecho, punto 10): su entrada en el manual de la
  ayuda y, si cambia el flujo de un puesto, su recorrido guiado; su tecla en la ayuda de atajos; lo privado con
  `data-privado`; lo que la cuenta de soporte puede en producción; su tema en vivo, su asiento y su permiso.
- **Una pantalla que vive en una pestaña** pone su cabecera con `EncabezadoDePagina` (`shell/MarcoDeSeccion.tsx`), no con
  `PageHeader`: el marco ya pone las migas, el nombre de la sección y las pestañas; queda su descripción y sus acciones.
- **Lo que va fijo en el teléfono** (una barra abajo) va con `createPortal` al `body`: dentro de la región del panel ni
  `sticky` ni `fixed` se sostienen (MAESTRO §5).
- **Lo privado en pantalla lleva `data-privado`** (referencias de un pago, sus datos): la captura de un reporte de
  problema no lo lleva, ni los campos de PIN o contraseña (T-11, PLAN §7.6).
- Objetivos táctiles por superficie: POS 56 px, tablet y teléfono 48 px, admin 32 px (§8.4). El KDS de
  64 px se retira con ADR-022: la cocina trabaja con la comanda impresa.
- Estados de carga, vacío y **error visibles**. Los errores ocultos son antipatrón explícito.
- **Formato monetario de Venezuela:** Mostrar importes con `MoneyDisplay` o `formatMoneyVE` desde `@l2/ui`.
  Bolívares: `Bs. ` a la izquierda, miles con punto (`.`) y decimales con coma (`,`). Dólares: `$` y dos decimales.
  Nunca usar `toFixed()` fuera de `@l2/ui`.
- **Formato de hora comercial:** Estándar de 12 horas con indicador en minúsculas y espacio (`2:00 pm`, `10:30 am`).
- **Sobriedad profesional:** Ningún emoji en elementos operativos, tarjetas o métricas del sistema; usar
  iconos SVG, barras de aforo y chips acordes a los tokens.
- **Montos grandes en bolívares:** Alojar en renglón propio o tarjeta dedicada con escalado tipográfico automático
  para soportar cifras de 6 a 8 dígitos sin colapsar horizontalmente.

## Contexto del cliente

Venezuela: multimoneda (USD funcional, Bs de liquidación), IVA + IGTF sobre pagos en divisas (el IGTF,
al 0 % por decisión del cliente, V-13; el motor se queda), cortes de luz e internet frecuentes. Aforo
del local: 30 niños, 7-10 mesas.
Equipos (visita técnica, M-15): la monitora en un teléfono (pulseras preimpresas de un solo uso, cámara
o lector Bluetooth), la caja en una laptop, el mesero en una tablet, la cocina con comanda impresa y una
sola impresora en caja, por red. Un solo servidor en la nube con internet de respaldo (ADR-021).
Equipo: dos personas — ver §11.3 para el recorte de alcance de la Ruta A.

## Flujo de trabajo

- **El VPS es la operación real (M-36).** Trabaja con datos reales y está en modo staging: **se pone al día solo con
  cada etiqueta `vX.Y.Z`**, aunque haya gente trabajando (un corte de un minuto). **No se etiqueta sin avisar al
  usuario.** Fusionar en `main` sin etiqueta no publica nada. **En tanda (M-37):** los pasos de una tanda entran en
  `main` probados y con su versión, y se publica una sola vez al final con la etiqueta de la última.
- **Somos dos (M-20).** Nada entra en `main` sin PR y sin el CI en verde: `main` está protegido y **siempre
  en verde**. Cada trabajo va en su rama desde `main` actualizado: `feat/<tema>`, `fix/<tema>` o
  `docs/<tema>`; no se reescribe historia compartida (nada de `push --force` en una rama que otro usa).
- **Solo `main` es permanente.** Una rama vive lo que dura su PR y se borra al fusionar (GitHub lo hace solo);
  las versiones se buscan por su etiqueta `vX.Y.Z`, no por la rama. Nada de ramas «wip» que se quedan.
  Con `main` protegido se fusiona con `gh pr merge --rebase --delete-branch` (historial lineal).
- **Antes de empezar un paso, se reclama:** su casilla de MAESTRO §3 pasa a `[~]` con «a cargo: <persona>»
  y la rama, en un commit pequeño que se sube enseguida. Si ya tiene dueño, se habla antes de tocarlo.
- **Antes de etiquetar,** `git log -1 origin/main` tiene que ser el commit del paso y su `package.json`, esa versión:
  una etiqueta sobre otro commit publica otra cosa. Si alguien fusiona aparte el commit de reclamo y el PR del paso ya
  no se puede fusionar, se aplica el commit del paso en una rama nueva desde `main` (cherry-pick) y se cierra el PR
  viejo; nunca `push --force` en una rama que otro usó (pasó con T-11, MAESTRO §5).
- **Un commit por paso**, con título en español que diga qué cambia para quien usa el sistema, y un
  cuerpo con el porqué. El mismo commit marca el paso en `docs/MAESTRO.md` §3.
- **Versionado semántico (M-10):** cada paso entregado sube el MINOR (`0.14.0`), cada corrección entre
  pasos el PATCH; `1.0.0` es la puesta en marcha. **En la rama**, lo que cambia se escribe en
  `## [Sin publicar]` de `CHANGELOG.md` y no se toca la versión; **al fusionar**, quien fusiona pone el
  número (`version` del `package.json` raíz y el encabezado del CHANGELOG) y la etiqueta `vX.Y.Z`. Así dos
  ramas no chocan por el número. Un paso cumple la definición de hecho de MAESTRO §3.
- **Las migraciones son de expandir y contraer** (ADR-028): la versión anterior tiene que funcionar con la
  base nueva, porque una actualización que falla vuelve sola atrás sin tocar datos.
- **La base y las claves del cliente no salen de su equipo.** Cada persona trabaja con `pnpm db:semilla` y su
  propio `.env` (con sus claves generadas). Las de producción viven solo en el VPS y en los secretos de GitHub.
- Una pantalla no está hecha hasta que se abre en el navegador: los errores que más se repiten aquí no
  los caza `pnpm typecheck` (lista en MAESTRO §5).
- **Nada de secretos en el repositorio.** `.env*` está ignorado: se documenta el nombre de la variable,
  nunca su valor. Referencias de pago, documentos y PIN no aparecen en logs ni en la URL (PLAN §7.6).
- Nada de datos personales reales en los datos de ejemplo.
