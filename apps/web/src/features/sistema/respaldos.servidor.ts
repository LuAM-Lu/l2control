import "server-only";
import { connection } from "next/server";
import type { PcDeRespaldos } from "@l2/application";
import { InformeDeLaPcSchema, type EstadoDeRespaldosDto, type InformeDeLaPcDto, type NivelDeRespaldos, type Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { entorno } from "../../servidor/entorno";
import { contextoActual, ipDeLaPeticion } from "../../servidor/sesion";

/** Ajustes → Respaldos (B7-4): cómo están, para quien decide el sistema. */
export async function estadoDeRespaldos(): Promise<Resultado<EstadoDeRespaldosDto>> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los respaldos." };
  return (await aplicacion()).respaldos.estado(ctx);
}

/**
 * Lo que enseña Inicio a quien decide: lo que no va bien y, al día, que el último ensayo de restauración salió
 * íntegro (B7-6). Al día y sin ensayo todavía (la primera semana), nada.
 */
export type AvisoDeRespaldos = Readonly<{ nivel: NivelDeRespaldos; aviso: string; ensayadoEn: string | null }>;

export async function avisoDeRespaldos(): Promise<AvisoDeRespaldos | null> {
  const r = await estadoDeRespaldos();
  if (!r.ok) return null;
  const { nivel, aviso, ensayo } = r.valor;
  if (nivel === "AL_DIA" && !ensayo?.integro) return null;
  return { nivel, aviso, ensayadoEn: ensayo?.en ?? null };
}

/**
 * Lo que la PC dice de sí misma en cada petición (B7-6): su programa (`X-L2-Programa`), dónde guarda
 * (`X-L2-Carpeta`, escapada: puede llevar acentos) y de qué tipo es esa carpeta (`X-L2-Carpeta-Tipo`). Lo que no
 * se entiende se ignora: no impide bajar respaldos.
 */
function informeDe(peticion: Request): InformeDeLaPcDto | null {
  const h = peticion.headers;
  let carpeta: string | null = null;
  try {
    carpeta = h.get("x-l2-carpeta") ? decodeURIComponent(h.get("x-l2-carpeta")!) : null;
  } catch {
    carpeta = null;
  }
  const programa = Number(h.get("x-l2-programa") ?? "");
  const r = InformeDeLaPcSchema.safeParse({
    programa: Number.isInteger(programa) && programa > 0 ? programa : null,
    carpeta,
    tipoDeCarpeta: h.get("x-l2-carpeta-tipo") ?? null,
  });
  return r.success ? r.data : null;
}

/**
 * La PC del local (M-26) pide los respaldos con su credencial en `Authorization: Bearer …`, no con una sesión:
 * es una tarea programada, sin nadie delante. La reconoce la aplicación por la huella de esa credencial. Si
 * vale, devuelve la PC y la carpeta de los respaldos; si no, la respuesta que hay que dar. Sin carpeta, este
 * servidor no sirve respaldos.
 */
export async function pcDeRespaldos(peticion: Request): Promise<{ pc: PcDeRespaldos; dir: string } | Response> {
  const e = entorno();
  if (!e.L2_RESPALDOS_DIR) return new Response("Este servidor no sirve respaldos.", { status: 404 });
  const ip = await ipDeLaPeticion();
  const credencial = /^Bearer (\S+)$/.exec(peticion.headers.get("authorization") ?? "")?.[1] ?? "";
  const pc = credencial ? await (await aplicacion()).respaldos.entrarPc({ tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID }, credencial, ip, Date.now(), informeDe(peticion)) : null;
  if (!pc) {
    log().warn({ ip, ruta: new URL(peticion.url).pathname }, "respaldos: credencial que no vale");
    return new Response("Credencial de respaldos que no vale: prepara la PC otra vez desde Ajustes → Respaldos.", {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    });
  }
  return { pc, dir: e.L2_RESPALDOS_DIR };
}
