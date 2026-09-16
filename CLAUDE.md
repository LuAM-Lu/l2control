# L2 Control — reglas del repositorio

Sistema de gestión para parque infantil + restaurante (Abby Kingdom, Venezuela).

**El plan manda.** `docs/PLAN.md` es la especificación: 17 ADRs, 24 decisiones del
cliente cerradas y 160 tareas con criterio de aceptación. El estado real está en `docs/PROGRESO.md`
y el porqué de cada paso en `docs/BITACORA.md`. Antes de construir algo, busca su
tarea `Fn-nn` en §12. Si lo que vas a hacer no está en el plan, es un cambio de alcance: dilo,
no lo hagas en silencio.

## Comandos

```bash
pnpm dev          # levanta apps/web en http://localhost:3000
pnpm verify       # arquitectura + demostración de que muerde + pruebas
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

`pnpm arch` impone las reglas 1 y 2 y **rompe la construcción** si se violan. No es decorativo:
`pnpm arch:demo` lo demuestra inyectando una violación real.

## Estructura

```
apps/web                  Next.js 16 — todas las superficies
  app/                    rutas; las únicas que importan src/demo
  src/features/<dominio>  pantallas y lógica de aplicación, por dominio
  src/demo/               datos de ejemplo e interruptor NEXT_PUBLIC_DEMO
packages/contracts        contratos Zod: la forma de cada dato, una vez
packages/domain/money     aritmética de dinero (puro)
packages/domain/tax       IVA con vigencias e IGTF por medio (puro)
packages/domain/cash      cobro mixto, vuelto, cuadre, turno, devoluciones (puro)
packages/domain/park      tiempo, gracia, penalización, aforo (puro)
packages/domain/identity  permisos, autorizaciones, dispositivos, PIN (puro)
packages/ui               nivel 1 primitivos + nivel 2 patrones
packages/config           tokens de diseño + tsconfig base
docs/adr/                 las 17 decisiones, una por archivo
```

**Datos de ejemplo.** Viven solo en `apps/web/src/demo` y entran solo por las rutas (`app/**`),
que los pasan a las pantallas por props. `pnpm arch` rompe si una pantalla o un proveedor los
importa. Lo que falta está en `docs/PENDIENTES.md`; el flujo de trabajo, en `CONTRIBUTING.md`.

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
- Objetivos táctiles por superficie: KDS 64 px, POS 56 px, tablet 48 px, admin 32 px (§8.4).
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

Venezuela: multimoneda (USD funcional, Bs de liquidación), IVA + IGTF del 3 % sobre pagos en
divisas, cortes de luz e internet frecuentes. Aforo del local: 30 niños, 7-10 mesas.
Equipo: dos personas — ver §11.3 para el recorte de alcance de la Ruta A.


## Orquesta de modelos (opcional)

Si la sesión tiene el servidor MCP `pal` (PAL MCP), Claude Code es **la maestra** y Gemini —y más
adelante DeepSeek— son **obreras** que se llaman como herramientas. Instalación y detalles en
[docs/ORQUESTA.md](docs/ORQUESTA.md). Sin `pal`, todo esto se ignora y se trabaja como siempre.

- **Se delega** lo acotado y comprobable: generar pruebas (`testgen`), segunda opinión en una revisión
  (`codereview`, `consensus`), revisión antes del commit (`precommit`), datos de ejemplo y documentación.
- **No se delega**: arquitectura, contratos (`packages/contracts`), el dominio (`packages/domain/*`) ni
  ninguna decisión del plan. La obrera opina; la maestra decide.
- **Qué puede salir del equipo.** A Gemini, el código del repo. A DeepSeek (cuando se conecte), **solo**
  pruebas, datos inventados e interfaz: nunca `domain/cash`, `domain/tax`, `domain/identity`, los
  contratos de pagos y ventas, ni nada con datos reales. Nunca, a ninguna, secretos ni `.env`.
- **Lo que devuelve una obrera no se aplica a ciegas**: se lee, se ajusta a las cinco reglas de arriba y
  pasa `pnpm verify` antes de entrar.
- **Solo la maestra hace commit**, y dice en el mensaje qué parte vino de una obrera.
