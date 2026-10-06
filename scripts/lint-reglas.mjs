/**
 * Las reglas de la casa que ni TypeScript ni `pnpm arch` pueden ver — B0-4 (F1-14).
 *
 * Cada una sale de CLAUDE.md o del plan, y cada una tiene su prueba en
 * `lint.test.mjs`, que demuestra que MUERDE y que no salta con lo que no debe.
 * Son deliberadamente simples (una expresión por línea de código): lo que no cabe
 * aquí se revisa a mano, no se pretende cazar con una regla a medias.
 *
 * Excepción puntual: `lint-permitido: <regla> — <motivo>` en la misma línea o en la
 * anterior. El motivo es obligatorio: una excepción sin porqué no se acepta.
 * Excepción de archivo entero: `EXCEPCIONES`, abajo, también con su porqué.
 */

/**
 * Dos reglas pueden llevar el mismo nombre: son caras de una misma regla, cada una con su porqué.
 * @typedef {{ nombre: string, explica: string, aplica: (ruta: string) => boolean, busca: RegExp }} Regla
 */

const esCodigo = (ruta) => /\.(ts|tsx|mjs|js)$/.test(ruta);
// Las pruebas y sus utilidades (`para-pruebas.ts`) montan su propio local con datos inventados: es su trabajo.
const esPrueba = (ruta) => /(\.test(-db)?\.(ts|tsx|mjs|js)|\/para-pruebas\.ts)$/.test(ruta);
const esLaWeb = (ruta) => ruta.startsWith("apps/web/") && esCodigo(ruta) && !esPrueba(ruta);
const esPantallaOEstilo = (ruta) => /\.(ts|tsx|css)$/.test(ruta);

/** @type {Regla[]} */
export const REGLAS = [
  {
    nombre: "dinero-sin-toFixed",
    explica: "El dinero se muestra con MoneyDisplay o formatMoneyVE de @l2/ui; toFixed() redondea en punto flotante (regla 3, F3-12).",
    aplica: (ruta) => esCodigo(ruta) && !ruta.startsWith("packages/ui/"),
    busca: /\.toFixed\(/,
  },
  {
    nombre: "dinero-sin-parseFloat",
    explica: "Montos y tasas se leen como enteros en unidades menores o fracciones exactas (ADR-004); parseFloat los convierte en punto flotante.",
    aplica: esCodigo,
    busca: /\bparseFloat\(/,
  },
  {
    nombre: "colores-solo-desde-tokens",
    explica: "Los colores salen de packages/config/tokens.css (F1-06). Usa la clase o la variable del token.",
    aplica: (ruta) => esPantallaOEstilo(ruta) && ruta !== "packages/config/tokens.css",
    // #rgb, #rrggbb o #rrggbbaa detrás de comilla, espacio, dos puntos, paréntesis, coma o
    // corchete (no `this.#campo`), y funciones de color. #rgba (4 cifras) no se busca: choca
    // con los números de orden («#1042») y nadie la usa.
    busca:
      /(?<=["'`\s:(,[])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/,
  },
  {
    nombre: "dominio-sin-reloj",
    explica: "El dominio no lee el reloj: el instante entra como argumento (regla 1, ADR-010).",
    aplica: (ruta) => /^packages\/domain\/[^/]+\/src\//.test(ruta) && esCodigo(ruta) && !/\.test\.ts$/.test(ruta),
    busca: /\bDate\.now\(|new Date\(\s*\)|performance\.now\(/,
  },
  {
    nombre: "transaccion-sin-consultas-a-la-vez",
    explica:
      "En @l2/application casi todo corre en la transacción del tenant, con UNA conexión: dos consultas a la vez son un aviso de pg hoy y un error en pg@9. Una tras otra; si no toca la base, lint-permitido con su motivo.",
    // Las pruebas y sus utilidades (`para-pruebas.ts`) abren y cierran conexiones propias.
    aplica: (ruta) => ruta.startsWith("packages/application/src/") && esCodigo(ruta) && !/(\.test(-db)?|\/para-pruebas)\.ts$/.test(ruta),
    busca: /\bPromise\.(all|allSettled|any|race)\(/,
  },
  {
    nombre: "sin-emojis-en-pantalla",
    explica: "Ningún emoji en la interfaz: iconos SVG, chips y barras con los tokens (CLAUDE.md, sobriedad profesional).",
    aplica: (ruta) => /\.(tsx|ts)$/.test(ruta) && (ruta.startsWith("apps/") || ruta.startsWith("packages/ui/")),
    busca: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u,
  },
  // `sin-simulacion` (T-2, M-11) tiene tres caras con un solo nombre: la excepción se escribe igual para las tres.
  {
    nombre: "sin-simulacion",
    explica:
      "Nada de negocio en el almacenamiento del navegador: se lee del servidor (`*.servidor.ts`) y se escribe con una acción (M-11). Una comodidad de pantalla lleva lint-permitido con su motivo.",
    aplica: esLaWeb,
    busca: /\b(?:localStorage|sessionStorage|indexedDB)\b/,
  },
  {
    nombre: "sin-simulacion",
    explica: "Un PIN no se escribe en el código: lo teclea la persona y lo comprueba el servidor (PLAN §7.6).",
    aplica: (ruta) => esCodigo(ruta) && !esPrueba(ruta),
    // `pin: "1970"`, `PIN_ADMIN = "1970"`, `pin === "1970"`, `pin ?? "1970"`; no `opinion` ni `spinner`.
    busca: /(?:(?<![A-Za-z])(?:pin|PIN)|(?<=[a-z])Pin)\w*["']?\s*(?::|={1,3}|\?\?|\|\|)\s*["'`]\d{4,8}["'`]/,
  },
  {
    nombre: "sin-simulacion",
    explica:
      "Una pantalla no trae datos de ejemplo: los lee del servidor, y lo que no existe dice «Sin datos» (M-11). Ni listas de datos del negocio escritas a mano, ni nombres de demostración, ni importar de una carpeta demo.",
    aplica: esLaWeb,
    // 1) una constante de módulo que es una lista de datos del contrato (`…Dto[]`) con contenido;
    // 2) un nombre que se declara de demostración (`PRODUCTOS_DEMO`, `mockCuentas`, `familiasDeEjemplo`);
    // 3) una importación desde una carpeta `demo`.
    busca:
      /^(?:export\s+)?const\s+\w+\s*:\s*(?:readonly\s+)?(?:\w+Dto\[\]|(?:Readonly)?Array<\w+Dto>)\s*=\s*\[(?!\s*\]\s*;?\s*$)|\b(?:const|let|var|function)\s+(?:\w*_)?(?:DEMO|MOCKS?|FAKE|FALS[OA]S?|EJEMPLOS?|SIMULAD[OA]S?|FICTICI[OA]S?)(?:_\w*)?(?![A-Za-z0-9])|\b(?:const|let|var|function)\s+(?:(?:demo|mock|fake)(?=[A-Z])\w*|\w*(?:Demo|Mock|Fake|DeEjemplo|Simulad[oa]s?|Fictici[oa]s?)(?![a-z]))|\bfrom\s+["'][^"']*\/demo(?:\/[^"']*)?["']/,
  },
];

/** Archivos enteros exentos de una regla, con el porqué. */
export const EXCEPCIONES = {
  "colores-solo-desde-tokens": {
    "apps/web/app/manifest.ts": "El manifiesto de la PWA lo lee el sistema operativo, no el CSS: no admite var().",
    "apps/web/app/layout.tsx": "themeColor es metadato del navegador: no admite var().",
    "apps/web/src/features/shell/iconoApp.tsx": "ImageResponse dibuja el icono en el servidor, sin la hoja de estilos: copia los valores de los tokens.",
  },
};

/** ¿La línea es solo comentario? Los comentarios pueden citar colores, emojis o `toFixed`. */
function esComentario(linea) {
  const t = linea.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || /^\{\s*\/\*/.test(t);
}

/** Quita los comentarios de bloque que caben en la línea y el `//` final (fuera de URLs). */
function sinComentarios(linea) {
  return linea.replace(/\/\*.*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/, "$1");
}

const permiso = (linea, regla) => new RegExp(`lint-permitido:\\s*${regla}\\s+—\\s*\\S`).test(linea);

/**
 * Las violaciones de un archivo. Pura: recibe la ruta (relativa a la raíz, con `/`) y el
 * texto, y devuelve `{ regla, linea, texto, explica }[]`.
 */
export function revisar(ruta, texto) {
  const reglas = REGLAS.filter((r) => r.aplica(ruta) && !EXCEPCIONES[r.nombre]?.[ruta]);
  if (reglas.length === 0) return [];

  const lineas = texto.split(/\r?\n/);
  const hallazgos = [];
  lineas.forEach((linea, i) => {
    if (esComentario(linea)) return;
    const codigo = sinComentarios(linea);
    for (const regla of reglas) {
      if (!regla.busca.test(codigo)) continue;
      if (permiso(linea, regla.nombre) || permiso(lineas[i - 1] ?? "", regla.nombre)) continue;
      hallazgos.push({ regla: regla.nombre, linea: i + 1, texto: linea.trim(), explica: regla.explica });
    }
  });
  return hallazgos;
}
