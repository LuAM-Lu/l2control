/**
 * La versión del sistema (M-10): de dónde sale y qué tiene que cumplir.
 *
 * Fuente única: `version` del package.json raíz, con su etapa en `l2.etapa`. `CHANGELOG.md`
 * tiene que abrir con ESA versión: quien sube el número y no cuenta qué cambió (o al revés) rompe
 * `pnpm verify`. Lo usan `scripts/version.mjs` (la puerta) y `apps/web/next.config.ts` (lo que se
 * enseña en el acceso, en Configuración y en el log de arranque).
 */

/** SemVer 2.0.0 sin metadatos de compilación; staging publica `-rc.N`. */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-rc\.(0|[1-9]\d*))?$/;

/** Primer encabezado de versión del CHANGELOG, saltando «Sin publicar». */
const ENCABEZADO = /^## \[(\d+\.\d+\.\d+(?:-rc\.\d+)?)\]/m;

/**
 * @param {unknown} paquete el package.json raíz ya leído
 * @param {string} changelog el texto de CHANGELOG.md
 * @returns {{ ok: true, version: string, etapa: string, pasos: number, entregados: number } | { ok: false, problemas: string[] }}
 */
export function comprobarVersion(paquete, changelog) {
  const problemas = [];
  const p = /** @type {{ version?: unknown, l2?: { etapa?: unknown, pasos?: unknown } }} */ (paquete ?? {});
  const version = typeof p.version === "string" ? p.version : "";
  const etapa = typeof p.l2?.etapa === "string" ? p.l2.etapa.trim() : "";
  const pasos = typeof p.l2?.pasos === "number" ? p.l2.pasos : NaN;

  const partes = SEMVER.exec(version);
  if (!partes) problemas.push(`«version» del package.json raíz no es SemVer (X.Y.Z o X.Y.Z-rc.N): «${version}».`);
  if (!etapa) problemas.push("Falta «l2.etapa» en el package.json raíz (p. ej. «Etapa 2 · Dinero»).");
  if (!Number.isInteger(pasos) || pasos <= 0) problemas.push("Falta «l2.pasos» (los pasos de la ruta a producción) en el package.json raíz.");

  const entregados = partes ? Number(partes[2]) : NaN;
  if (partes && Number.isInteger(pasos) && entregados > pasos) {
    problemas.push(`El MINOR (${entregados}) cuenta pasos entregados y no puede pasar de «l2.pasos» (${pasos}).`);
  }

  const primera = ENCABEZADO.exec(changelog)?.[1];
  if (primera === undefined) {
    problemas.push("CHANGELOG.md no tiene ninguna versión («## [X.Y.Z] — fecha»).");
  } else if (version && primera !== version) {
    problemas.push(
      `CHANGELOG.md abre con ${primera} y el package.json dice ${version}: sube los dos a la vez (M-10).`,
    );
  }

  if (problemas.length > 0) return { ok: false, problemas };
  return { ok: true, version, etapa, pasos, entregados };
}
