/**
 * El aviso al desarrollo de cada reporte de problema — T-11 (M-27, P-4, D-SOP).
 *
 * El reporte se queda en el servidor del local; lo que sale es un correo con su número, la versión y la pantalla, y el
 * enlace a la bandeja de soporte. Ni lo que contó la persona ni la captura: eso se lee en el servidor, con la cuenta de
 * soporte. Sale al entrar el reporte (el outbox avisa del tema «soporte») y, por si un aviso se pierde o el servidor de
 * correo no responde, en una vuelta cada dos minutos; un fallo se reintenta con espera y se deja tras unos intentos
 * (la aplicación decide cuáles tocan). Sin servidor de correo configurado no se programa: los reportes siguen en la
 * bandeja.
 */
import nodemailer from "nodemailer";
import type { Aplicacion, Contexto, ReporteParaAvisar } from "@l2/application";
import type { Logger } from "@l2/observability";

/** Cada cuánto se mira si queda algo por avisar (o por reintentar). */
const CADA_MS = 2 * 60_000;
/** Al arrancar se espera un poco: que el proceso termine de levantarse antes de salir a la red. */
const AL_ARRANCAR_MS = 10_000;

export type Correo = Readonly<{ asunto: string; texto: string }>;
export type Enviar = (correo: Correo) => Promise<void>;

/** El correo de un reporte: número, versión, pantalla, el error si es conocido y el enlace. Nada de lo que contó la persona. */
export function correoDe(r: ReporteParaAvisar, urlPublica: string | null): Correo {
  const enlace = urlPublica ? new URL("/panel/ajustes/soporte", urlPublica).href : "Panel → Ajustes → Soporte";
  const lineas = [
    `Hay un reporte de problema nuevo en L2 Control: el n.º ${r.numero}.`,
    "",
    `Versión: ${r.version}`,
    `Pantalla: ${r.ruta}`,
    ...(r.codigoError ? [`Error conocido: ${r.codigoError}`] : []),
    ...(r.iguales > 0 ? [`Reportes con el mismo error: ${r.iguales + 1}`] : []),
    "",
    `Para leerlo, con su captura: ${enlace}`,
    "",
    "Este aviso no lleva lo que contó la persona ni la captura: se leen en el servidor del local, con la cuenta de soporte.",
  ];
  return { asunto: `L2 Control · reporte n.º ${r.numero} · v${r.version}`, texto: lineas.join("\n") };
}

/** Enviar por SMTP. La URL lleva la contraseña: nunca se registra, ni aquí ni en un error. */
export function enviarPorSmtp(url: string, de: string | undefined, para: string): Enviar {
  const transporte = nodemailer.createTransport(url);
  return async (c) => {
    await transporte.sendMail({ from: de ?? para, to: para, subject: c.asunto, text: c.texto });
  };
}

/** Por qué no salió, sin datos: el tipo del fallo y su código (ni la respuesta del servidor ni direcciones). */
function porQue(e: unknown): string {
  if (!(e instanceof Error)) return "Error desconocido";
  const codigo = (e as { code?: unknown }).code;
  return typeof codigo === "string" && /^[A-Z_]{2,30}$/.test(codigo) ? `${e.name} ${codigo}` : e.name;
}

/** Una vuelta: avisa lo pendiente. Devuelve cuántos se intentaron. */
export async function avisarPendientes(app: Pick<Aplicacion, "soporte">, ctx: Contexto, enviar: Enviar, urlPublica: string | null, log: Logger): Promise<number> {
  const pendientes = await app.soporte.porAvisar(ctx, Date.now());
  for (const r of pendientes) {
    try {
      await enviar(correoDe(r, urlPublica));
      await app.soporte.anotarAviso(ctx, r.id, true, null, Date.now());
      log.info({ reporte: r.numero }, "aviso de reporte enviado");
    } catch (e) {
      const detalle = `No salió: ${porQue(e)}`;
      await app.soporte.anotarAviso(ctx, r.id, false, detalle, Date.now()).catch((err) => log.error({ err }, "no se pudo anotar el aviso"));
      log.warn({ reporte: r.numero, intento: r.intentos + 1, detalle }, "el aviso de reporte no salió");
    }
  }
  return pendientes.length;
}

export interface AvisosDeSoporte {
  /** Avisa ya lo pendiente (entró un reporte). */
  avisar(): void;
  parar(): void;
}

/** Programa los avisos: una vuelta al arrancar, cada dos minutos y cada vez que entra un reporte. */
export function programarAvisosDeSoporte(app: Pick<Aplicacion, "soporte">, ctx: Contexto, enviar: Enviar, urlPublica: string | null, log: Logger): AvisosDeSoporte {
  let enCurso: Promise<void> | null = null;
  let otraVez = false;
  let parado = false;

  // Una vuelta a la vez: si llega otro aviso mientras se envía, se hace otra al terminar.
  const vuelta = (): void => {
    if (parado) return;
    if (enCurso) {
      otraVez = true;
      return;
    }
    enCurso = (async () => {
      try {
        do {
          otraVez = false;
          await avisarPendientes(app, ctx, enviar, urlPublica, log);
        } while (otraVez && !parado);
      } catch (e) {
        log.error({ err: e }, "la vuelta de avisos de soporte falló");
      } finally {
        enCurso = null;
      }
    })();
  };

  const inicio = setTimeout(vuelta, AL_ARRANCAR_MS);
  const cada = setInterval(vuelta, CADA_MS);
  return {
    avisar: vuelta,
    parar() {
      parado = true;
      clearTimeout(inicio);
      clearInterval(cada);
    },
  };
}
