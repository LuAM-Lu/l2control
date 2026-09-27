/**
 * De dónde se trae la tasa del BCV — F3-04, §5.2, amenaza T6.
 *
 * El BCV no publica una API: publica el valor en su web. Aquí hay dos lectores:
 *  · la web del BCV (la fuente oficial), de la que se toma el valor del dólar y su fecha valor;
 *  · DolarApi (`ve.dolarapi.com`), un tercero que republica la oficial en JSON: sirve para
 *    comprobar la del BCV cuando las dos hablan del mismo día, y de respaldo si el BCV no responde.
 *
 * Todo lo que llega de fuera es una entrada NO confiable (§7.5): se valida con la misma forma que
 * una tasa tecleada y nunca se usa para cobrar sin que una persona la confirme. Un lector que
 * falla no lanza: devuelve por qué, y la sincronización sigue con lo demás (una comodidad, nunca
 * una dependencia).
 *
 * El análisis del texto está separado de la descarga para probarlo sin internet.
 */
import { get } from "node:https";
import { rootCertificates } from "node:tls";
import { RateValueSchema } from "@l2/contracts";
import { SECTIGO_DV_R36 } from "./certificado-bcv.ts";

export type NombreDeFuente = "BCV" | "DOLARAPI";

/** Lo que dice una fuente: el valor del dólar, el día para el que vale y lo que respondió. */
export interface LecturaDeTasa {
  readonly fuente: NombreDeFuente;
  readonly pair: "USD/VES";
  readonly value: string;
  readonly effectiveDate: string;
  /** Lo justo de la respuesta para auditarla (§5.2 `rawPayload`), no la página entera. */
  readonly crudo: Readonly<Record<string, string>>;
}

export type ResultadoDeLectura = { ok: true; lectura: LecturaDeTasa } | { ok: false; fuente: NombreDeFuente; error: string };

export type Lector = () => Promise<ResultadoDeLectura>;

export const URL_BCV = "https://www.bcv.org.ve/";
export const URL_DOLARAPI = "https://ve.dolarapi.com/v1/dolares/oficial";
const ESPERA_MS = 12_000;

/**
 * La web del BCV: el bloque `id="dolar"` trae el valor con coma decimal («857,00580000») y la
 * «Fecha Valor» trae el día en su atributo `content` («2026-09-28T00:00:00-04:00»).
 */
export function analizarBcv(html: string): ResultadoDeLectura {
  const fallo = (error: string): ResultadoDeLectura => ({ ok: false, fuente: "BCV", error });
  const bloque = html.match(/id="dolar"[\s\S]{0,1200}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  if (!bloque?.[1]) return fallo("La página del BCV no trae el valor del dólar donde se esperaba.");
  const fecha = html.match(/Fecha Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})T/);
  if (!fecha?.[1]) return fallo("La página del BCV no trae la fecha valor donde se esperaba.");
  // Formato venezolano: puntos de miles (si los hubiera) y coma decimal.
  const value = bloque[1].replace(/\./g, "").replace(",", ".");
  const valido = RateValueSchema.safeParse(value);
  if (!valido.success) return fallo(`El BCV publicó un valor que no es una tasa: «${bloque[1]}».`);
  return {
    ok: true,
    lectura: {
      fuente: "BCV",
      pair: "USD/VES",
      value: valido.data,
      effectiveDate: fecha[1],
      crudo: { url: URL_BCV, valor: bloque[1], fechaValor: fecha[1] },
    },
  };
}

/**
 * DolarApi: `{"promedio": 855.6625, "fechaActualizacion": "2026-09-25T00:00:00-04:00", …}`. El
 * número se toma del TEXTO de la respuesta, no del JSON ya leído: `JSON.parse` lo convertiría en
 * un flotante, que es justo lo que una tasa no puede ser.
 */
export function analizarDolarApi(texto: string): ResultadoDeLectura {
  const fallo = (error: string): ResultadoDeLectura => ({ ok: false, fuente: "DOLARAPI", error });
  const valor = texto.match(/"promedio"\s*:\s*(\d+(?:\.\d+)?)/);
  const fecha = texto.match(/"fechaActualizacion"\s*:\s*"(\d{4}-\d{2}-\d{2})T/);
  if (!valor?.[1] || !fecha?.[1]) return fallo("DolarApi no trae el promedio o la fecha donde se esperaba.");
  const valido = RateValueSchema.safeParse(valor[1]);
  if (!valido.success) return fallo(`DolarApi publicó un valor que no es una tasa: «${valor[1]}».`);
  return {
    ok: true,
    lectura: {
      fuente: "DOLARAPI",
      pair: "USD/VES",
      value: valido.data,
      effectiveDate: fecha[1],
      crudo: { url: URL_DOLARAPI, valor: valor[1], fecha: fecha[1] },
    },
  };
}

/** Descarga con un plazo: una fuente colgada no puede dejar colgada la pantalla. */
async function descargar(url: string, fuente: NombreDeFuente): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(ESPERA_MS),
      headers: { "user-agent": "L2Control/1.0 (sincronizacion de tasa)" },
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, error: `${fuente} respondió ${r.status}.` };
    return { ok: true, texto: await r.text() };
  } catch (e) {
    const causa = e instanceof Error && e.name === "TimeoutError" ? "no respondió a tiempo" : "no se pudo consultar";
    return { ok: false, error: `${fuente} ${causa}.` };
  }
}

/**
 * Descarga de la web del BCV con su intermediario añadido a las raíces (ver `certificado-bcv.ts`).
 * La verificación TLS sigue entera: solo se completa la cadena que el servidor manda incompleta.
 */
function descargarBcv(): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  return new Promise((resolver) => {
    const peticion = get(
      URL_BCV,
      {
        ca: [...rootCertificates, SECTIGO_DV_R36],
        headers: { "user-agent": "L2Control/1.0 (sincronizacion de tasa)" },
        timeout: ESPERA_MS,
      },
      (r) => {
        if (r.statusCode !== 200) {
          r.resume();
          return resolver({ ok: false, error: `BCV respondió ${r.statusCode ?? "sin código"}.` });
        }
        r.setEncoding("utf8");
        let texto = "";
        r.on("data", (trozo: string) => {
          texto += trozo;
        });
        r.on("end", () => resolver({ ok: true, texto }));
        r.on("error", () => resolver({ ok: false, error: "BCV cortó la respuesta." }));
      },
    );
    peticion.on("timeout", () => {
      peticion.destroy();
      resolver({ ok: false, error: "BCV no respondió a tiempo." });
    });
    peticion.on("error", () => resolver({ ok: false, error: "BCV no se pudo consultar." }));
  });
}

export const leerBcv: Lector = async () => {
  const r = await descargarBcv();
  return r.ok ? analizarBcv(r.texto) : { ok: false, fuente: "BCV", error: r.error };
};

export const leerDolarApi: Lector = async () => {
  const r = await descargar(URL_DOLARAPI, "DOLARAPI");
  return r.ok ? analizarDolarApi(r.texto) : { ok: false, fuente: "DOLARAPI", error: r.error };
};

/** Las fuentes reales, en orden de autoridad: la oficial primero. */
export const FUENTES_REALES: readonly Lector[] = [leerBcv, leerDolarApi];
