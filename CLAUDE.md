# L2 Control — reglas del repositorio

Sistema de gestión para parque infantil + restaurante (Abby Kingdom, Venezuela).

**Un solo documento vivo: [`docs/MAESTRO.md`](docs/MAESTRO.md).** Ahí están el estado, la ruta
hasta producción (etapas B0 a B8), lo que bloquea y el handoff. Empieza siempre por su §1.

**El plan manda.** `docs/PLAN.md` es la especificación congelada: 17 ADRs, 29 decisiones del cliente y
las tareas `Fn-nn` con su criterio de aceptación en §12. Antes de construir algo, busca su paso en
MAESTRO §3 y su tarea en el plan. Si lo que vas a hacer no está en ninguno de los dos, es un cambio de
alcance: dilo, no lo hagas en silencio.

**Handoff.** Cuando el usuario escribe «handoff», se sigue el protocolo de MAESTRO §8: actualizar el
maestro, hacer commit y entregar en el chat el bloque para pegar en una sesión nueva.

## Comandos

```bash
pnpm dev          # levanta apps/web en http://localhost:3000
pnpm infra:up     # PostgreSQL 17 + Valkey 8 en Docker (una vez: cp .env.example .env)
pnpm db:migrar    # migraciones · pnpm db:semilla deja el local de desarrollo listo (PIN 1970)
pnpm equipos      # la consola de equipos: pnpm equipos aprobar "<nombre>" aprueba el primero
pnpm totp         # código TOTP de la administración de desarrollo (contraseña: abby-kingdom-desarrollo)
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
`@l2/ui`, sin `parseFloat`, colores solo desde tokens, el dominio sin reloj y sin emojis en pantalla.
Una excepción se escribe `lint-permitido: <regla> — <motivo>`, y sin motivo no vale. No es decorativo:
`pnpm arch:demo` lo demuestra inyectando una violación real.

## Estructura

```
apps/web                  Next.js 16 — todas las superficies
  app/                    rutas; las únicas que importan src/demo
  src/features/<dominio>  pantallas y lógica de aplicación, por dominio
  src/demo/               datos provisionales; cada paso de backend borra el suyo (M-6)
  src/servidor/           entorno validado, conexión a application y logger (solo servidor)
packages/contracts        contratos Zod: la forma de cada dato, una vez
packages/domain/money     aritmética de dinero (puro)
packages/domain/rates     tasa vigente, fracción de conversión y límite de cordura (puro)
packages/domain/tax       IVA con vigencias e IGTF por medio (puro)
packages/domain/cash      cobro mixto, vuelto, cuadre, turno, devoluciones (puro)
packages/domain/park      tiempo, gracia, penalización, aforo (puro)
packages/domain/identity  permisos, autorizaciones, dispositivos, PIN (puro)
packages/domain/inventory catálogo de productos con precio por día; stock y costeo después (puro)
packages/application      casos de uso: contrato + dominio + base en la transacción del tenant
packages/database         Prisma, migraciones y RLS forzada; solo lo importa application
packages/observability    logger JSON con redacción y entorno validado al arrancar (solo servidor)
packages/ui               nivel 1 primitivos + nivel 2 patrones
packages/config           tokens de diseño + tsconfig base
docs/MAESTRO.md           estado, ruta a producción y handoff (el único vivo)
docs/PLAN.md, FLUJOS.md   especificación y flujos del local (referencia, no se editan)
docs/adr/                 las 23 decisiones, una por archivo
```

**No hay modo demo ni simulador** (retirados el 2026-09-26, M-6): la app corre siempre contra su
servidor. Lo que aún no tiene backend usa datos provisionales de `apps/web/src/demo`, que entran solo
por las rutas (`app/**`) y se pasan por props (`pnpm arch` lo impone). **Nada nuevo entra ahí**, y el
paso de backend que sustituye un archivo lo borra en el mismo commit.

**Del provisional al servidor (B0-5).** Una pantalla pasa a la base así: caso de uso en `@l2/application` con su
`*.test-db.ts`; lectura en `features/<dominio>/<x>.servidor.ts` (con `connection()`); escritura en
`<x>.acciones.ts` (`"use server"`, recibe `unknown`, devuelve `Resultado`); la ruta o el layout lee
en el servidor, el proveedor escribe con la acción y se borra su archivo de `src/demo`. El modelo es
el tarifario. Lo que las estaciones se cuentan entre sí va por el bus de `features/operacion` (eventos
del catálogo), que en B5-1 viaja por el servidor.

Cada paquete tiene su propio `README.md` con qué resuelve y **qué no le corresponde**. Léelo
antes de añadirle nada.

Se agrupa **por dominio, no por capa técnica**. La pregunta «¿dónde va esto?» se responde con
«¿de qué habla?», no con «¿qué tipo de archivo es?» (§9.1).

## Al escribir componentes

- Colores **solo** desde los tokens de `packages/config/tokens.css`. Ningún literal.
- Los colores de estado (`state-ok`, `state-warn`, `state-crit`) son **reservados**: significan
  siempre lo mismo y nunca se usan como decoración.
- El estado se comunica por **color + icono + texto**, nunca solo por color (§8.2).
- Cifras que se comparan o suman: clase `tnum`.
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

- `main` está **siempre en verde**: nada que rompa `pnpm verify` entra en `main`. Para trabajo largo,
  una rama `feat/<tema>` o `fix/<tema>`; no se reescribe historia compartida.
- **Un commit por paso**, con título en español que diga qué cambia para quien usa el sistema, y un
  cuerpo con el porqué. El mismo commit marca el paso en `docs/MAESTRO.md` §3.
- **Versionado semántico (M-10):** cada paso entregado sube el MINOR (`0.14.0`), cada corrección entre
  pasos el PATCH; `1.0.0` es la puesta en marcha. `version` del `package.json` raíz, entrada en
  `CHANGELOG.md` y etiqueta `vX.Y.Z` en el mismo commit. Un paso cumple la definición de hecho de
  MAESTRO §3.
- Una pantalla no está hecha hasta que se abre en el navegador: los errores que más se repiten aquí no
  los caza `pnpm typecheck` (lista en MAESTRO §5).
- **Nada de secretos en el repositorio.** `.env*` está ignorado: se documenta el nombre de la variable,
  nunca su valor. Referencias de pago, documentos y PIN no aparecen en logs ni en la URL (PLAN §7.6).
- Nada de datos personales reales en los datos de ejemplo.
