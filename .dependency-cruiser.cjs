/**
 * Reglas de arquitectura — F1-03, §9.2 y §9.3 del docs/PLAN.md.
 *
 * Estas reglas existen porque una convención que solo vive en un documento se
 * rompe el primer viernes con prisa. Aquí, una importación que cruza una
 * frontera prohibida ROMPE LA CONSTRUCCIÓN — no genera una discusión en la
 * revisión de código.
 *
 *   apps  →  application  →  domain
 *     ↓          ↓             ↑
 *    ui      database     contracts
 *
 * NOTA DE IMPLEMENTACIÓN: pnpm aísla los node_modules de cada paquete, así
 * que una importación prohibida entre paquetes ni siquiera se resuelve: llega
 * aquí como el especificador crudo (`@l2/domain-park`) y no como una ruta de
 * disco. Por eso cada regla contempla AMBAS formas. Verificado con una
 * violación deliberada; ver `pnpm arch:demo`.
 */

/** Paquetes de dominio, en sus dos formas posibles. */
const DOMAIN = "^(@l2/domain-|packages/domain/)";
/** Infraestructura que el dominio no puede tocar. */
const INFRA = "^(react|react-dom|next(/|$)|@prisma/|prisma|axios|pino|@l2/ui|@l2/database|@l2/observability)";

module.exports = {
  forbidden: [
    {
      name: "dominio-sin-infraestructura",
      severity: "error",
      comment:
        "§9.2 regla 1: el dominio no importa infraestructura. Ni Prisma, ni Next, ni React, " +
        "ni fetch. Recibe lo que necesita como argumento. Es lo que hace que el motor de " +
        "impuestos se pruebe en milisegundos y sin base de datos, y que ADR-010 (el " +
        "cronómetro es del servidor) sea verificable.",
      from: { path: "^packages/domain/" },
      to: { path: INFRA },
    },
    {
      name: "ui-no-conoce-el-dominio",
      severity: "error",
      comment:
        "§9.2 regla 4: un componente de @l2/ui recibe datos y emite eventos; no sabe qué es " +
        "una comanda ni una estancia. Si necesita saberlo, pertenece a " +
        "apps/web/src/features/<contexto>.",
      from: { path: "^packages/ui/" },
      to: { path: `${DOMAIN}|^(@l2/database|packages/database/|@l2/observability|packages/observability/)` },
    },
    {
      name: "las-apps-no-tocan-la-base",
      severity: "error",
      comment:
        "§9.2 regla 2: apps nunca importa database directamente; pasa por application, que " +
        "es donde viven la transacción, el tenant y la auditoría. Una pantalla que habla con " +
        "Prisma se salta las tres.",
      from: { path: "^apps/" },
      to: { path: "^(@l2/database|packages/database/|@prisma/)" },
    },
    {
      name: "el-agente-solo-habla-por-la-red",
      severity: "error",
      comment:
        "ADR-026: el agente de impresión corre en la laptop de caja y solo habla con el worker por la " +
        "red. Si importara la aplicación o la base, llevaría credenciales del servidor a un equipo del local.",
      from: { path: "^apps/printer-agent/" },
      to: { path: "^(@l2/application|packages/application/|@l2/database|packages/database/|@l2/observability|packages/observability/)" },
    },
    {
      name: "sin-importaciones-relativas-entre-paquetes",
      severity: "error",
      comment:
        "§9.3: nada de ../../../otro-paquete. Se usa el nombre del paquete, para que la " +
        "superficie pública sea una decisión y no un accidente de dónde quedó el archivo.",
      from: { path: "^(packages|apps)/" },
      to: { path: "^\\.\\..*\\.\\./" , dependencyTypes: ["local"] },
    },
    {
      name: "sin-imports-no-resueltos",
      severity: "error",
      comment:
        "Un import que no resuelve es una dependencia fantasma o un error de nombre. Con los " +
        "node_modules aislados de pnpm (ADR-001) aparece aquí en lugar de explotar en " +
        "producción. Si el paquete es legítimo, decláralo en su package.json.",
      from: { pathNot: "\\.d\\.ts$" },
      to: { couldNotResolve: true },
    },
    {
      name: "sin-ciclos",
      severity: "error",
      comment: "Un ciclo de dependencias significa que dos módulos son en realidad uno.",
      from: {},
      to: { circular: true },
    },
    {
      name: "demo-solo-desde-las-rutas",
      severity: "error",
      comment:
        "Los datos de ejemplo viven en apps/web/src/demo y entran SOLO por las rutas " +
        "(app/**), que se los pasan a las pantallas por props. Una pantalla o un proveedor " +
        "que importa la demo no se puede conectar al backend sin reescribirlo, y la demo " +
        "acaba en producción sin que nadie lo decida. Lo que queda en src/demo se vacía " +
        "paso a paso del backend (MAESTRO, M-6).",
      from: {
        path: "^(apps/web/src/|packages/)",
        pathNot: ["^apps/web/src/demo/"],
      },
      to: { path: "^apps/web/src/demo/" },
    },
    {
      name: "sin-huerfanos",
      severity: "warn",
      comment: "Módulo que nadie importa: o falta cablearlo, o sobra.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$",
          // Next carga estos por convención de rutas: nadie los importa, y
          // eso es correcto, no un módulo suelto.
          "apps/web/(next|postcss)\\.config\\.",
          "apps/web/app/.*(page|layout|route|loading|error|not-found)\\.tsx?$",
          "apps/web/app/(manifest|apple-icon|icon)\\.tsx?$",
          // Los cargan la CLI de Prisma y node --test, no un import.
          "packages/database/prisma\\.config\\.ts$",
          "packages/database/scripts/",
          "apps/web/scripts/",
          "apps/web/instrumentation\\.ts$",
          // El proceso del worker arranca por aquí (`node src/main.ts`).
          "apps/worker/src/main\\.ts$",
          "\\.test(-db)?\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // El cliente de Prisma es código generado: no se versiona ni se juzga.
    exclude: { path: "(node_modules|\\.next|dist|\\.turbo|packages/database/src/generated)" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      mainFields: ["main", "module", "types"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default", "types"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
