/**
 * La impresión en el servidor — B5-2, ADR-015, ADR-026.
 *
 * Quién decide qué:
 *  · el dominio (`@l2/domain-printing`): qué bytes salen (ESC/POS a 58 u 80 mm) y cómo avanza un
 *    trabajo (`reclamado`, `trasFallo`, `sinRespuesta`, `reintentado`);
 *  · las plantillas (`plantillas.ts`): qué dice el recibo, el ticket de corte y la prueba;
 *  · este archivo: las impresoras del local (`catalogo.modificar` con elevación), el código y la
 *    credencial del agente, encolar (en la transacción de lo que pide imprimir) y lo que el agente
 *    reclama y responde; el historial por páginas y descartar lo que ya no importa. La base impone
 *    que lo impreso no cambie y que el estado solo avance.
 *
 * El agente no es una persona: opera como el sistema del local de su sucursal, y su nombre va en la
 * auditoría. Nada de lo que pide imprimir (un recibo, un corte) cambia por cómo le vaya al papel.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  AgenteVinculadoSchema,
  ImpresoraCommandSchema,
  ImpresorasAplicadasSchema,
  ImpresorasDelLocalSchema,
  ImprimirCorteCommandSchema,
  ImprimirPruebaCommandSchema,
  ReintentarTrabajoCommandSchema,
  ResultadoDelAgenteSchema,
  TrabajoDeImpresionSchema,
  TrabajoParaElAgenteSchema,
  TrabajosDeImpresionSchema,
  VincularAgenteSchema,
  CorteSchema,
  DescartarTrabajosCommandSchema,
  HistorialDeImpresionSchema,
  HistorialQuerySchema,
  TrabajosDescartadosSchema,
  problemasDe,
  type AgenteVinculadoDto,
  type FiltroHistorial,
  type HistorialDeImpresionDto,
  type TrabajosDescartadosDto,
  type ImpresorasAplicadasDto,
  type ImpresorasDelLocalDto,
  type Rechazo,
  type Resultado,
  type TrabajoDeImpresionDto,
  type TrabajoParaElAgenteDto,
  type TrabajosDeImpresionDto,
} from "@l2/contracts";
import {
  comoTexto,
  descarteProblem,
  escpos,
  reclamado,
  reintentado,
  reintentoProblem,
  respuestaProblem,
  sinRespuesta,
  trasFallo,
  type Ancho,
  type Documento,
  type EstadoTrabajo,
} from "@l2/domain-printing";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { documentoDeCorte, documentoDePrueba } from "./plantillas.ts";

/** Lo que vale un código de vinculación (ADR-026). */
export const VIGENCIA_CODIGO_MS = 10 * 60_000;
/** Un agente cuyo último latido es más viejo que esto, no está conectado. */
export const AGENTE_CONECTADO_MS = 90_000;
/** Lo que enseña la cola: lo de las últimas 24 h, hasta 40 trabajos. */
const VENTANA_MS = 24 * 3_600_000;

/** Un agente abierto con su credencial: de qué sucursal es y cómo se llama. */
export type AgenteAbierto = Readonly<{ agenteId: string; tenantId: string; branchId: string; nombre: string }>;

export interface CasosImpresion {
  /** Las impresoras de la sucursal y sus agentes. */
  leer(ctx: Contexto, ahora?: number): Promise<Resultado<ImpresorasDelLocalDto>>;
  /** Cambia una impresora o un agente (`ImpresoraCommandSchema`). Al vincular, devuelve el código (solo esa vez). */
  aplicar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ImpresorasAplicadasDto>>;
  /** La cola de la sucursal: lo de las últimas 24 h. */
  trabajos(ctx: Contexto, ahora?: number): Promise<Resultado<TrabajosDeImpresionDto>>;
  /** Imprime una prueba en esa impresora (`ImprimirPruebaCommandSchema`). */
  imprimirPrueba(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<TrabajoDeImpresionDto>>;
  /** Imprime (o reimprime) el ticket de un corte guardado (`ImprimirCorteCommandSchema`). */
  imprimirCorte(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<TrabajoDeImpresionDto>>;
  /** Vuelve a poner en cola un trabajo FALLIDO (`ReintentarTrabajoCommandSchema`). */
  reintentar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<TrabajoDeImpresionDto>>;
  /** Descarta lo que falló o espera y ya no importa (`DescartarTrabajosCommandSchema`). Devuelve cuántos. */
  descartar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<TrabajosDescartadosDto>>;
  /** Una página del historial de la sucursal, con sus filtros y lo que cuenta cada uno (`HistorialQuerySchema`). */
  historial(ctx: Contexto, entrada: unknown): Promise<Resultado<HistorialDeImpresionDto>>;

  /** El agente cambia su código de un solo uso por su credencial. */
  vincular(tenantId: string, entrada: unknown, ahora?: number): Promise<Resultado<AgenteVinculadoDto>>;
  /** El agente de esa credencial, si sigue vinculado. `null` = no entra. */
  abrirAgente(tenantId: string, credencial: unknown): Promise<AgenteAbierto | null>;
  /** El siguiente trabajo de su sucursal que le toca, ya ENVIADO a su nombre; `null` si no hay. */
  reclamar(agente: AgenteAbierto, ahora?: number): Promise<TrabajoParaElAgenteDto | null>;
  /** Cómo le fue con un trabajo que reclamó (`ResultadoDelAgenteSchema`). */
  responder(agente: AgenteAbierto, entrada: unknown, ahora?: number): Promise<Resultado<{ estado: EstadoTrabajo }>>;
  /** Lo enviado que no respondió en 30 s vuelve a la cola (o falla). Devuelve cuántos. */
  barrer(tenantId: string, ahora?: number): Promise<number>;
  /** Anota que estos agentes siguen conectados y devuelve los que siguen vinculados (los demás, fuera). */
  latido(tenantId: string, agentes: readonly string[], ahora?: number): Promise<string[]>;
}

const huella = (s: string) => createHash("sha256").update(s).digest("hex");
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const nuevoCodigo = () => {
  const c = Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};
const normalCodigo = (c: string) => c.replace("-", "").toUpperCase();

/** Qué estados entran en cada filtro del historial. */
const ESTADOS_DEL_FILTRO: Record<FiltroHistorial, readonly EstadoTrabajo[] | null> = {
  TODOS: null,
  FALLIDOS: ["FALLIDO"],
  EN_COLA: ["PENDIENTE", "ENVIADO"],
  IMPRESOS: ["CONFIRMADO"],
  DESCARTADOS: ["DESCARTADO"],
};

const noDisponible = (mensaje: string): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje });
const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas: [{ path, message }] });

/** ¿Tiene quien opera alguna de estas acciones (sin DENEGADO)? */
async function puedeAlguna(tx: Transaccion, ctx: Contexto, acciones: readonly Action[]): Promise<boolean> {
  for (const a of acciones) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") return true;
  return false;
}

type FilaTrabajo = Awaited<ReturnType<Transaccion["printJob"]["findFirstOrThrow"]>>;
type FilaImpresora = Awaited<ReturnType<Transaccion["printer"]["findFirstOrThrow"]>>;

/** Un trabajo en la forma del contrato, con su vista previa compuesta al ancho de su impresora. */
function trabajoDto(t: FilaTrabajo, impresora: Pick<FilaImpresora, "id" | "name" | "width">): TrabajoDeImpresionDto {
  return TrabajoDeImpresionSchema.parse({
    id: t.id,
    tipo: t.kind,
    titulo: t.title,
    copia: t.copy,
    impresora: { id: impresora.id, nombre: impresora.name },
    estado: t.status,
    intentos: t.attempts,
    error: t.lastError,
    creadoEn: t.createdAt.toISOString(),
    creadoPor: t.createdByName,
    terminadoEn: t.finishedAt?.toISOString() ?? null,
    descartadoPor: t.discardedByName,
    vistaPrevia: comoTexto(t.content as unknown as Documento, impresora.width as Ancho),
    ventaId: t.saleId,
    corteId: t.cutId,
  });
}

/** Qué se pide imprimir. `para` elige la impresora activa de ese oficio; `impresoraId`, una concreta. */
export type Encargo = Readonly<{
  tipo: "RECIBO" | "CORTE" | "COMANDA" | "PRUEBA";
  titulo: string;
  copia?: boolean;
  saleId?: string;
  cutId?: string;
  documento: Documento;
}> &
  (Readonly<{ para: "recibos" | "comandas" }> | Readonly<{ impresoraId: string }>);

const SIN_IMPRESORA: Record<"recibos" | "comandas", string> = {
  recibos: "No hay impresora de recibos encendida: configúrala en Ajustes → Impresoras.",
  comandas: "No hay impresora de comandas encendida: configúrala en Ajustes → Impresoras.",
};

/**
 * Pone un trabajo en la cola, dentro de la transacción de quien lo pide: si lo que pidió imprimir no
 * ocurre, tampoco el trabajo. Sin impresora encendida para ese oficio, se dice (fail-closed).
 */
export async function encolarEn(tx: Transaccion, ctx: Contexto, e: Encargo, ahora: number): Promise<TrabajoDeImpresionDto | Rechazo> {
  const impresora =
    "para" in e
      ? await tx.printer.findFirst({ where: { branchId: ctx.branchId, active: true, ...(e.para === "recibos" ? { forReceipts: true } : { forOrders: true }) } })
      : await tx.printer.findFirst({ where: { id: e.impresoraId, branchId: ctx.branchId, retiredAt: null } });
  if (!impresora) return noDisponible("para" in e ? SIN_IMPRESORA[e.para] : "Esa impresora no existe en esta sucursal.");
  const quien = await nombreDe(tx, ctx);
  const fila = await tx.printJob.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      printerId: impresora.id,
      kind: e.tipo,
      title: e.titulo.slice(0, 80),
      copy: e.copia ?? false,
      saleId: e.saleId ?? null,
      cutId: e.cutId ?? null,
      content: e.documento as object,
      payload: Buffer.from(escpos(e.documento, impresora.width as Ancho)),
      status: "PENDIENTE",
      attempts: 0,
      nextAttemptAt: new Date(ahora),
      createdAt: new Date(ahora),
      createdBy: ctx.quien?.userId ?? null,
      createdByName: quien.nombre,
      deviceId: ctx.quien?.deviceId ?? null,
    },
  });
  await auditar(tx, ctx, {
    action: "impresion.encolar",
    entityType: "print_job",
    entityId: fila.id,
    after: { tipo: e.tipo, titulo: fila.title, copia: fila.copy, impresora: impresora.name },
  });
  return trabajoDto(fila, impresora);
}

/** Las impresoras y los agentes de la sucursal, como los lee una pantalla. */
async function delLocal(tx: Transaccion, branchId: string, ahora: number): Promise<ImpresorasDelLocalDto> {
  const impresoras = await tx.printer.findMany({ where: { branchId, retiredAt: null }, orderBy: { createdAt: "asc" } });
  const agentes = await tx.printAgent.findMany({ where: { branchId, retiredAt: null }, orderBy: { createdAt: "asc" } });
  const ultimos = new Map<string, FilaTrabajo>();
  for (const i of impresoras) {
    const t = await tx.printJob.findFirst({ where: { printerId: i.id }, orderBy: { createdAt: "desc" } });
    if (t) ultimos.set(i.id, t);
  }
  return ImpresorasDelLocalSchema.parse({
    impresoras: impresoras.map((i) => {
      const t = ultimos.get(i.id);
      return {
        id: i.id,
        nombre: i.name,
        ip: i.ip,
        puerto: i.port,
        ancho: i.width,
        recibos: i.forReceipts,
        comandas: i.forOrders,
        enVlanDeHardware: i.inHardwareLan,
        ipFija: i.fixedIp,
        activa: i.active,
        ultimo: t ? { estado: t.status, at: (t.finishedAt ?? t.createdAt).toISOString(), error: t.lastError } : null,
      };
    }),
    agentes: agentes
      // Un código que caducó sin usarse no es un agente: no se enseña.
      .filter((a) => a.pairedAt !== null || (a.codeExpiresAt !== null && a.codeExpiresAt.getTime() > ahora))
      .map((a) => ({
        id: a.id,
        nombre: a.name,
        vinculadoEn: a.pairedAt?.toISOString() ?? null,
        codigoHasta: a.pairedAt ? null : (a.codeExpiresAt?.toISOString() ?? null),
        ultimaVez: a.lastSeenAt?.toISOString() ?? null,
        conectado: a.lastSeenAt !== null && ahora - a.lastSeenAt.getTime() < AGENTE_CONECTADO_MS,
      })),
  });
}

export function casosImpresion(base: Base): CasosImpresion {
  /** El contexto con que opera un agente: el sistema de su sucursal (su nombre va en la auditoría). */
  const ctxDe = (a: AgenteAbierto): Contexto => ({ tenantId: a.tenantId, branchId: a.branchId, sistema: true });

  return {
    async leer(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<ImpresorasDelLocalDto>> => {
        if (!ctx.quien?.userId || !(await puedeAlguna(tx, ctx, ["catalogo.modificar", "documento.emitir"]))) return rechazoDePermiso("DENEGADO");
        return { ok: true, valor: await delLocal(tx, ctx.branchId, ahora) };
      });
    },

    async aplicar(ctx, entrada, ahora = Date.now()) {
      const v = ImpresoraCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<ImpresorasAplicadasDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const quien = await nombreDe(tx, ctx);
          let codigo: string | null = null;
          const buscar = async (id: string) => tx.printer.findFirst({ where: { id, branchId: ctx.branchId, retiredAt: null } });
          switch (cmd.kind) {
            case "CREAR":
            case "EDITAR": {
              const d = cmd.datos;
              const datos = {
                name: d.nombre,
                ip: d.ip,
                port: d.puerto,
                width: d.ancho,
                forReceipts: d.recibos,
                forOrders: d.comandas,
                inHardwareLan: d.enVlanDeHardware,
                fixedIp: d.ipFija,
              };
              if (cmd.kind === "CREAR") {
                // Nace apagada: se enciende cuando se comprueba que imprime (y con sus garantías).
                const f = await tx.printer.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, ...datos, active: false, createdAt: new Date(ahora), createdByName: quien.nombre } });
                await auditar(tx, ctx, { action: "impresora.crear", entityType: "printer", entityId: f.id, after: { ...datos } });
              } else {
                const antes = await buscar(cmd.impresoraId);
                if (!antes) return noDisponible("Esa impresora no existe en esta sucursal.");
                if (antes.active && !(d.enVlanDeHardware && d.ipFija)) {
                  return invalido("Una impresora encendida va en la VLAN de hardware y con IP fija (ADR-015): apágala antes.", ["datos", "ipFija"], "Sin garantías");
                }
                await tx.printer.update({ where: { id: antes.id }, data: datos });
                await auditar(tx, ctx, {
                  action: "impresora.editar",
                  entityType: "printer",
                  entityId: antes.id,
                  before: { name: antes.name, ip: antes.ip, port: antes.port, width: antes.width, forReceipts: antes.forReceipts, forOrders: antes.forOrders },
                  after: datos,
                });
              }
              break;
            }
            case "ACTIVAR": {
              const i = await buscar(cmd.impresoraId);
              if (!i) return noDisponible("Esa impresora no existe en esta sucursal.");
              if (cmd.activa && !(i.inHardwareLan && i.fixedIp)) {
                return invalido("Antes de encenderla, confirma que está en la VLAN de hardware y con IP fija (ADR-015).", ["impresoraId"], "Sin garantías");
              }
              if (cmd.activa) {
                const otra = await tx.printer.findFirst({
                  where: { branchId: ctx.branchId, active: true, id: { not: i.id }, OR: [...(i.forReceipts ? [{ forReceipts: true }] : []), ...(i.forOrders ? [{ forOrders: true }] : [])] },
                });
                if (otra) return { ok: false, motivo: "CONFLICTO", mensaje: `«${otra.name}» ya imprime ${i.forReceipts && otra.forReceipts ? "los recibos" : "las comandas"}: apágala primero.` };
              }
              if (i.active === cmd.activa) break;
              await tx.printer.update({ where: { id: i.id }, data: { active: cmd.activa } });
              // Lo que esperaba en ella ya no va a salir: falla con su motivo en vez de quedarse esperando
              // para siempre. Las pruebas, no: se prueba con la impresora apagada.
              if (!cmd.activa) await cancelarPendientesEn(tx, ctx, i.id, `«${i.name}» se apagó`, ahora, true);
              await auditar(tx, ctx, { action: "impresora.activar", entityType: "printer", entityId: i.id, after: { activa: cmd.activa, nombre: i.name } });
              break;
            }
            case "RETIRAR": {
              const i = await buscar(cmd.impresoraId);
              if (!i) return noDisponible("Esa impresora no existe en esta sucursal.");
              await cancelarPendientesEn(tx, ctx, i.id, `«${i.name}» se retiró`, ahora, false);
              await tx.printer.update({ where: { id: i.id }, data: { active: false, retiredAt: new Date(ahora), retiredByName: quien.nombre } });
              await auditar(tx, ctx, { action: "impresora.retirar", entityType: "printer", entityId: i.id, before: { nombre: i.name, ip: i.ip, port: i.port } });
              break;
            }
            case "VINCULAR_AGENTE": {
              codigo = nuevoCodigo();
              const a = await tx.printAgent.create({
                data: {
                  tenantId: ctx.tenantId,
                  branchId: ctx.branchId,
                  name: cmd.nombre,
                  codeHash: huella(normalCodigo(codigo)),
                  codeExpiresAt: new Date(ahora + VIGENCIA_CODIGO_MS),
                  createdAt: new Date(ahora),
                  createdByName: quien.nombre,
                },
              });
              // El código no va a la auditoría: es una credencial mientras vive.
              await auditar(tx, ctx, { action: "agente.codigo", entityType: "print_agent", entityId: a.id, after: { nombre: cmd.nombre, hasta: new Date(ahora + VIGENCIA_CODIGO_MS).toISOString() } });
              break;
            }
            case "RETIRAR_AGENTE": {
              const a = await tx.printAgent.findFirst({ where: { id: cmd.agenteId, branchId: ctx.branchId, retiredAt: null } });
              if (!a) return noDisponible("Ese agente no existe en esta sucursal.");
              await tx.printAgent.update({ where: { id: a.id }, data: { retiredAt: new Date(ahora), retiredByName: quien.nombre, codeHash: null, codeExpiresAt: null } });
              await auditar(tx, ctx, { action: "agente.retirar", entityType: "print_agent", entityId: a.id, before: { nombre: a.name } });
              break;
            }
          }
          return ImpresorasAplicadasSchema.parse({ local: await delLocal(tx, ctx.branchId, ahora), codigo });
        });
      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "impresora.editar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos encendidas para lo mismo, o dos en la misma dirección: los índices de la base dejan una.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        return { ok: false, motivo: "CONFLICTO", mensaje: "Ya hay una impresora en esa dirección, o encendida para lo mismo." };
      }
    },

    async trabajos(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<TrabajosDeImpresionDto>> => {
        if (!ctx.quien?.userId || !(await puedeAlguna(tx, ctx, ["catalogo.modificar", "documento.emitir"]))) return rechazoDePermiso("DENEGADO");
        const filas = await tx.printJob.findMany({
          where: { branchId: ctx.branchId, createdAt: { gte: new Date(ahora - VENTANA_MS) } },
          include: { printer: { select: { id: true, name: true, width: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 40,
        });
        return { ok: true, valor: TrabajosDeImpresionSchema.parse({ trabajos: filas.map((f) => trabajoDto(f, f.printer)) }) };
      });
    },

    async imprimirPrueba(ctx, entrada, ahora = Date.now()) {
      const v = ImprimirPruebaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se imprimió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<TrabajoDeImpresionDto | Rechazo> => {
        // Una prueba no cambia nada: basta poder configurar, sin confirmar identidad.
        if ((await permisoEn(tx, ctx, "catalogo.modificar")) !== "PERMITIDO") return rechazoDePermiso("DENEGADO");
        const i = await tx.printer.findFirst({ where: { id: v.data.impresoraId, branchId: ctx.branchId, retiredAt: null } });
        if (!i) return noDisponible("Esa impresora no existe en esta sucursal.");
        const quien = await nombreDe(tx, ctx);
        const doc = documentoDePrueba({ nombre: i.name, ip: i.ip, puerto: i.port, ancho: i.width as Ancho }, await ajustesDe(tx, ctx.branchId), ahora, quien.nombre);
        return encolarEn(tx, ctx, { tipo: "PRUEBA", titulo: `Prueba · ${i.name}`, documento: doc, impresoraId: i.id }, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async imprimirCorte(ctx, entrada, ahora = Date.now()) {
      const v = ImprimirCorteCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se imprimió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<TrabajoDeImpresionDto | Rechazo> => {
        if (!(await puedeAlguna(tx, ctx, ["turno.corteX", "reportes.verSucursal"]))) return rechazoDePermiso("DENEGADO");
        const c = await tx.shiftCut.findUnique({ where: { id: v.data.corteId }, include: { shift: { select: { branchId: true } } } });
        if (!c || c.shift.branchId !== ctx.branchId) return noDisponible("Ese corte no existe en esta sucursal.");
        return encolarCorteEn(tx, ctx, c, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async reintentar(ctx, entrada, ahora = Date.now()) {
      const v = ReintentarTrabajoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se reintentó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<TrabajoDeImpresionDto | Rechazo> => {
        if (!ctx.quien?.userId || !(await puedeAlguna(tx, ctx, ["catalogo.modificar", "documento.emitir"]))) return rechazoDePermiso("DENEGADO");
        const t = await tx.printJob.findFirst({ where: { id: v.data.trabajoId, branchId: ctx.branchId }, include: { printer: true } });
        if (!t) return noDisponible("Ese trabajo no existe en esta sucursal.");
        if (reintentoProblem({ estado: t.status as EstadoTrabajo })) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese trabajo no falló: ya se está intentando o ya salió." };
        const n = reintentado({ estado: "FALLIDO" as EstadoTrabajo, intentos: t.attempts, proximoIntento: 0, enviadoEn: null }, ahora);
        const f = await tx.printJob.update({
          where: { id: t.id },
          data: { status: n.estado, attempts: n.intentos, nextAttemptAt: new Date(n.proximoIntento), sentAt: null, finishedAt: null },
        });
        await auditar(tx, ctx, { action: "impresion.reintentar", entityType: "print_job", entityId: t.id, after: { titulo: t.title, error: t.lastError } });
        return trabajoDto(f, t.printer);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async descartar(ctx, entrada, ahora = Date.now()) {
      const v = DescartarTrabajosCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se descartó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<TrabajosDescartadosDto>> => {
        const userId = ctx.quien?.userId;
        if (!userId || !(await puedeAlguna(tx, ctx, ["catalogo.modificar", "documento.emitir"]))) return rechazoDePermiso("DENEGADO");
        // Las filas quedan bloqueadas: el agente reclama con SKIP LOCKED y no toma lo que se descarta.
        const pedidos = cmd.kind === "TRABAJOS" ? [...new Set(cmd.trabajoIds)] : [];
        const impresoraId = cmd.kind === "FALLIDOS" ? (cmd.impresoraId ?? null) : null;
        const tipo = cmd.kind === "FALLIDOS" ? (cmd.tipo ?? null) : null;
        const bloqueadas =
          cmd.kind === "TRABAJOS"
            ? await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM print_job
                WHERE branch_id = ${ctx.branchId}::uuid AND id = ANY(${pedidos}::uuid[])
                ORDER BY created_at, id
                FOR UPDATE`
            : await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM print_job
                WHERE branch_id = ${ctx.branchId}::uuid AND status = 'FALLIDO'
                  AND (${impresoraId}::uuid IS NULL OR printer_id = ${impresoraId}::uuid)
                  AND (${tipo}::text IS NULL OR kind = ${tipo}::text)
                ORDER BY created_at, id
                FOR UPDATE`;
        if (bloqueadas.length < pedidos.length) return noDisponible("Ese trabajo no existe en esta sucursal.");
        const filas = await tx.printJob.findMany({ where: { id: { in: bloqueadas.map((b) => b.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        // Fail-closed: si uno no se puede descartar, no se descarta ninguno y se dice cuál.
        for (const t of filas) {
          const p = descarteProblem({ estado: t.status as EstadoTrabajo });
          if (p === "EN_CURSO") return { ok: false, motivo: "CONFLICTO", mensaje: `«${t.title}» se está imprimiendo ahora mismo: espera unos segundos.` };
          if (p) return { ok: false, motivo: "CONFLICTO", mensaje: `«${t.title}» ya salió o ya se descartó.` };
        }
        const quien = await nombreDe(tx, ctx);
        for (const t of filas) {
          await tx.printJob.update({
            where: { id: t.id },
            data: { status: "DESCARTADO", sentAt: null, finishedAt: new Date(ahora), discardedBy: userId, discardedByName: quien.nombre },
          });
          await auditar(tx, ctx, { action: "impresion.descartar", entityType: "print_job", entityId: t.id, before: { estado: t.status, error: t.lastError }, after: { titulo: t.title } });
        }
        return { ok: true, valor: TrabajosDescartadosSchema.parse({ descartados: filas.length }) };
      });
    },

    async historial(ctx, entrada) {
      const v = HistorialQuerySchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Ese filtro no vale.", problemas: problemasDe(v.error) };
      const q = v.data;
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<HistorialDeImpresionDto>> => {
        if (!ctx.quien?.userId || !(await puedeAlguna(tx, ctx, ["catalogo.modificar", "documento.emitir"]))) return rechazoDePermiso("DENEGADO");
        const donde = { branchId: ctx.branchId, ...(q.impresoraId ? { printerId: q.impresoraId } : {}), ...(q.tipo ? { kind: q.tipo } : {}) };
        const porEstado = await tx.printJob.groupBy({ by: ["status"], where: donde, _count: { _all: true } });
        const cuenta = (estados: readonly EstadoTrabajo[] | null) =>
          porEstado.filter((g) => estados === null || estados.includes(g.status as EstadoTrabajo)).reduce((n, g) => n + g._count._all, 0);
        const conteos = {
          TODOS: cuenta(ESTADOS_DEL_FILTRO.TODOS),
          FALLIDOS: cuenta(ESTADOS_DEL_FILTRO.FALLIDOS),
          EN_COLA: cuenta(ESTADOS_DEL_FILTRO.EN_COLA),
          IMPRESOS: cuenta(ESTADOS_DEL_FILTRO.IMPRESOS),
          DESCARTADOS: cuenta(ESTADOS_DEL_FILTRO.DESCARTADOS),
        };
        // Con filtros, lo de toda la sucursal se cuenta aparte (para el resumen y la alerta).
        const sinFiltros = !q.impresoraId && !q.tipo;
        const deLaSucursal = sinFiltros ? porEstado : await tx.printJob.groupBy({ by: ["status"], where: { branchId: ctx.branchId }, _count: { _all: true } });
        const enLaSucursal = (estados: readonly EstadoTrabajo[]) =>
          deLaSucursal.filter((g) => estados.includes(g.status as EstadoTrabajo)).reduce((n, g) => n + g._count._all, 0);
        const pendientes = { fallidos: enLaSucursal(["FALLIDO"]), enCola: enLaSucursal(["PENDIENTE", "ENVIADO"]) };
        const total = conteos[q.filtro];
        // Una página que ya no existe (se descartó lo último de ella) se lee como la última que queda.
        const pagina = Math.min(q.pagina, Math.max(1, Math.ceil(total / q.porPagina)));
        const estados = ESTADOS_DEL_FILTRO[q.filtro];
        const filas = await tx.printJob.findMany({
          where: { ...donde, ...(estados ? { status: { in: [...estados] } } : {}) },
          include: { printer: { select: { id: true, name: true, width: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (pagina - 1) * q.porPagina,
          take: q.porPagina,
        });
        return {
          ok: true,
          valor: HistorialDeImpresionSchema.parse({ trabajos: filas.map((f) => trabajoDto(f, f.printer)), total, pagina, porPagina: q.porPagina, conteos, pendientes }),
        };
      });
    },

    async vincular(tenantId, entrada, ahora = Date.now()) {
      const v = VincularAgenteSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Ese no es un código de vinculación.", problemas: problemasDe(v.error) };
      return base.conTenant(tenantId, async (tx): Promise<Resultado<AgenteVinculadoDto>> => {
        const a = await tx.printAgent.findFirst({ where: { codeHash: huella(normalCodigo(v.data.codigo)), retiredAt: null, pairedAt: null } });
        if (!a || !a.codeExpiresAt || a.codeExpiresAt.getTime() <= ahora) {
          return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Ese código no vale o ya caducó: genera otro en Ajustes → Impresoras." };
        }
        const credencial = `l2ag_${randomBytes(32).toString("base64url")}`;
        await tx.printAgent.update({ where: { id: a.id }, data: { tokenHash: huella(credencial), pairedAt: new Date(ahora), codeHash: null, codeExpiresAt: null, lastSeenAt: new Date(ahora) } });
        await auditar(tx, { tenantId, branchId: a.branchId, sistema: true }, { action: "agente.vincular", entityType: "print_agent", entityId: a.id, after: { nombre: a.name } });
        return { ok: true, valor: AgenteVinculadoSchema.parse({ agenteId: a.id, nombre: a.name, credencial }) };
      });
    },

    async abrirAgente(tenantId, credencial) {
      if (typeof credencial !== "string" || !credencial.startsWith("l2ag_") || credencial.length > 100) return null;
      return base.conTenant(tenantId, async (tx) => {
        const a = await tx.printAgent.findFirst({ where: { tokenHash: huella(credencial), retiredAt: null } });
        return a ? { agenteId: a.id, tenantId, branchId: a.branchId, nombre: a.name } : null;
      });
    },

    async reclamar(agente, ahora = Date.now()) {
      return base.conTenant(agente.tenantId, async (tx) => {
        // Dos agentes (o dos vueltas) a la vez: cada trabajo lo toma uno.
        const [libre] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM print_job
          WHERE branch_id = ${agente.branchId}::uuid AND status = 'PENDIENTE' AND next_attempt_at <= ${new Date(ahora)}
          ORDER BY created_at, id
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        if (!libre) return null;
        const t = await tx.printJob.findUniqueOrThrow({ where: { id: libre.id }, include: { printer: true } });
        const r = reclamado({ estado: "PENDIENTE" as EstadoTrabajo, intentos: t.attempts, proximoIntento: t.nextAttemptAt.getTime(), enviadoEn: null }, ahora);
        // Una impresora retirada, o apagada desde que se encoló, no imprime: el trabajo falla con ese
        // motivo. La prueba sí sale en una apagada: se prueba antes de encenderla.
        if (t.printer.retiredAt || (!t.printer.active && t.kind !== "PRUEBA")) {
          await tx.printJob.update({ where: { id: t.id }, data: { status: "ENVIADO", attempts: r.intentos, sentAt: new Date(ahora), agentId: agente.agenteId } });
          await tx.printJob.update({ where: { id: t.id }, data: { status: "FALLIDO", sentAt: null, finishedAt: new Date(ahora), lastError: `«${t.printer.name}» está ${t.printer.retiredAt ? "retirada" : "apagada"}` } });
          await auditar(tx, ctxDe(agente), { action: "impresion.fallar", entityType: "print_job", entityId: t.id, after: { titulo: t.title, error: "Impresora apagada", agente: agente.nombre } });
          return null;
        }
        await tx.printJob.update({ where: { id: t.id }, data: { status: "ENVIADO", attempts: r.intentos, sentAt: new Date(ahora), agentId: agente.agenteId } });
        return TrabajoParaElAgenteSchema.parse({ id: t.id, ip: t.printer.ip, puerto: t.printer.port, bytes: Buffer.from(t.payload).toString("base64") });
      });
    },

    async responder(agente, entrada, ahora = Date.now()) {
      const v = ResultadoDelAgenteSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Respuesta del agente mal formada.", problemas: problemasDe(v.error) };
      const res = v.data;
      return base.conTenant(agente.tenantId, async (tx): Promise<Resultado<{ estado: EstadoTrabajo }>> => {
        const t = await tx.printJob.findFirst({ where: { id: res.trabajoId, branchId: agente.branchId } });
        if (!t) return noDisponible("Ese trabajo no existe en esta sucursal.");
        // Solo responde por lo que tiene enviado a su nombre; un trabajo devuelto a la cola ya es de otro intento.
        if (respuestaProblem({ estado: t.status as EstadoTrabajo }) || t.agentId !== agente.agenteId) {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Ese trabajo ya no espera respuesta de este agente." };
        }
        if (res.ok) {
          await tx.printJob.update({ where: { id: t.id }, data: { status: "CONFIRMADO", sentAt: null, finishedAt: new Date(ahora), lastError: null } });
          await auditar(tx, ctxDe(agente), { action: "impresion.confirmar", entityType: "print_job", entityId: t.id, after: { titulo: t.title, intentos: t.attempts, agente: agente.nombre } });
          return { ok: true, valor: { estado: "CONFIRMADO" } };
        }
        const error = res.error ?? "La impresora no respondió";
        const n = trasFallo({ estado: "ENVIADO" as EstadoTrabajo, intentos: t.attempts, proximoIntento: t.nextAttemptAt.getTime(), enviadoEn: t.sentAt?.getTime() ?? ahora }, ahora);
        await tx.printJob.update({
          where: { id: t.id },
          data: {
            status: n.estado,
            sentAt: null,
            nextAttemptAt: new Date(n.proximoIntento),
            lastError: error,
            finishedAt: n.estado === "FALLIDO" ? new Date(ahora) : null,
          },
        });
        await auditar(tx, ctxDe(agente), { action: "impresion.fallar", entityType: "print_job", entityId: t.id, after: { titulo: t.title, error, estado: n.estado, intentos: t.attempts, agente: agente.nombre } });
        return { ok: true, valor: { estado: n.estado } };
      });
    },

    async barrer(tenantId, ahora = Date.now()) {
      return base.conTenant(tenantId, async (tx) => {
        const enviados = await tx.printJob.findMany({ where: { status: "ENVIADO" } });
        let n = 0;
        for (const t of enviados) {
          const trabajo = { estado: "ENVIADO" as EstadoTrabajo, intentos: t.attempts, proximoIntento: t.nextAttemptAt.getTime(), enviadoEn: t.sentAt?.getTime() ?? null };
          if (!sinRespuesta(trabajo, ahora)) continue;
          const s = trasFallo(trabajo, ahora);
          await tx.printJob.update({
            where: { id: t.id },
            data: { status: s.estado, sentAt: null, nextAttemptAt: new Date(s.proximoIntento), lastError: "El agente no respondió", finishedAt: s.estado === "FALLIDO" ? new Date(ahora) : null },
          });
          await auditar(tx, { tenantId, branchId: t.branchId, sistema: true }, { action: "impresion.fallar", entityType: "print_job", entityId: t.id, after: { titulo: t.title, error: "El agente no respondió", estado: s.estado } });
          n += 1;
        }
        return n;
      });
    },

    async latido(tenantId, agentes, ahora = Date.now()) {
      if (agentes.length === 0) return [];
      return base.conTenant(tenantId, async (tx) => {
        await tx.printAgent.updateMany({ where: { id: { in: [...agentes] }, retiredAt: null }, data: { lastSeenAt: new Date(ahora) } });
        return (await tx.printAgent.findMany({ where: { id: { in: [...agentes] }, retiredAt: null }, select: { id: true } })).map((a) => a.id);
      });
    },
  };
}

/**
 * Los trabajos que esperaban en una impresora que se apaga o se retira pasan a FALLIDO con ese motivo
 * (por ENVIADO, que es el único camino que admite la base). `salvoPruebas`: al apagarla, las pruebas
 * siguen en cola. Lo ya enviado al agente se deja: su respuesta, o el barrido de 30 s, lo resuelve.
 */
async function cancelarPendientesEn(tx: Transaccion, ctx: Contexto, printerId: string, motivo: string, ahora: number, salvoPruebas: boolean): Promise<void> {
  const pendientes = await tx.printJob.findMany({ where: { printerId, status: "PENDIENTE", ...(salvoPruebas ? { kind: { not: "PRUEBA" } } : {}) } });
  for (const t of pendientes) {
    await tx.printJob.update({ where: { id: t.id }, data: { status: "ENVIADO", sentAt: new Date(ahora) } });
    await tx.printJob.update({ where: { id: t.id }, data: { status: "FALLIDO", sentAt: null, finishedAt: new Date(ahora), lastError: motivo } });
    await auditar(tx, ctx, { action: "impresion.fallar", entityType: "print_job", entityId: t.id, after: { titulo: t.title, error: motivo } });
  }
}

/** Encola el ticket de un corte guardado (lo usa también el Z al sellarse). */
export async function encolarCorteEn(
  tx: Transaccion,
  ctx: Contexto,
  c: Readonly<{ id: string; kind: string; content: unknown }>,
  ahora: number,
): Promise<TrabajoDeImpresionDto | Rechazo> {
  const corte = CorteSchema.parse(c.content);
  const copia = (await tx.printJob.count({ where: { cutId: c.id } })) > 0;
  return encolarEn(
    tx,
    ctx,
    {
      tipo: "CORTE",
      titulo: `Corte ${c.kind} · ${corte.turno.punto}`,
      copia,
      cutId: c.id,
      documento: documentoDeCorte(corte, await ajustesDe(tx, ctx.branchId)),
      para: "recibos",
    },
    ahora,
  );
}
