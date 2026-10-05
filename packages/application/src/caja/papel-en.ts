/**
 * Lo que comparten la entrada, la salida, el guardado y el cobro cuando lo que registran viene del papel —
 * B3-7, V-12, ADR-027. Todo dentro de la transacción del caso de uso.
 *
 * Un registro cargado desde papel es la MISMA operación de siempre (`parque.entrar`, `parque.salir`,
 * `cuentas.guardar`, `cuentas.cobrar`) hecha con la hora real que se anotó en el formulario en lugar de la
 * hora del servidor: así el cronómetro, la tasa, el IVA, el precio del catálogo y el asiento del libro
 * salen como habrían salido entonces. Lo único nuevo es que esa hora no se acepta suelta: tiene que caer
 * dentro de la ventana del corte de una carga abierta, en el turno de este equipo (ADR-027).
 *
 * Este archivo no importa los casos de uso (`parque`, `cuentas`) para que ellos puedan importarlo.
 */
import { admiteRegistros, horaRealProblem, type EstadoDeCarga, type ProblemaDeHora } from "@l2/domain-cash";
import type { MarcaDePapelDto, MoneyDto, Rechazo } from "@l2/contracts";
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { turnoSinCorteDe } from "./turnos.ts";

/**
 * Lo que un caso de uso recibe cuando lo que registra viene del papel: la carga y cuándo se cargó, con el
 * reloj del servidor. Lo arma `casosPapel`, nunca una pantalla (la hora real viaja en `ahora`).
 */
export type EnPapel = Readonly<{ cargaId: string; cargadoEn: number }>;

/** La carga en la que se registra, ya comprobada. */
export type CargaParaRegistrar = Readonly<{ id: string; turnoId: string; desde: number; hasta: number }>;

const MENSAJE_DE_HORA: Record<ProblemaDeHora, string> = {
  EN_EL_FUTURO: "Esa hora todavía no ha pasado: escribe la que anotaron en el formulario.",
  ANTES_DE_LA_VENTANA: "Esa hora es anterior al corte que declaraste para esta carga. Revisa la hora del formulario o el corte.",
  DESPUES_DE_LA_VENTANA: "Esa hora es posterior al corte que declaraste para esta carga. Revisa la hora del formulario o el corte.",
};

const QUE_ESTA: Record<EstadoDeCarga, string> = {
  ABIERTA: "abierta",
  CERRADA: "terminada y a la espera de revisión",
  REVISADA: "revisada",
  DESCARTADA: "descartada",
};

/**
 * Comprueba que `horaReal` se pueda registrar en la carga `papel.cargaId`: que sea de esta sucursal, que siga
 * abierta, que sea del turno de este equipo y que la hora caiga dentro de su ventana y no sea posterior a
 * `papel.cargadoEn`. Devuelve la carga o el rechazo (fail-closed: sin esto no se registra nada).
 */
export async function cargaParaRegistrar(tx: Transaccion, ctx: Contexto, papel: EnPapel, horaReal: number): Promise<CargaParaRegistrar | Rechazo> {
  const c = await tx.paperLoad.findUnique({ where: { id: papel.cargaId } });
  if (!c || c.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa carga desde papel no existe en esta sucursal." };
  if (!admiteRegistros(c.status as EstadoDeCarga)) {
    return { ok: false, motivo: "CONFLICTO", mensaje: `Esa carga ya está ${QUE_ESTA[c.status as EstadoDeCarga]}: no admite más registros. Abre otra.` };
  }
  // Se carga desde el equipo del turno donde se abrió: es su gaveta la que recibe lo que se cobró.
  const turno = ctx.quien?.deviceId ? await turnoSinCorteDe(tx, ctx.quien.deviceId) : null;
  if (!turno || turno.id !== c.shiftId) {
    return { ok: false, motivo: "CONFLICTO", mensaje: "Esa carga es de otro turno: se carga desde el equipo y el turno donde se abrió." };
  }
  const ventana = { desde: c.windowFrom.getTime(), hasta: c.windowTo.getTime() };
  const problema = horaRealProblem(horaReal, ventana, papel.cargadoEn);
  if (problema) {
    return {
      ok: false,
      motivo: "INVALIDO",
      mensaje: MENSAJE_DE_HORA[problema],
      problemas: [{ path: ["desdePapel", "ocurrioEn"], message: problema }],
    };
  }
  return { id: c.id, turnoId: c.shiftId, ...ventana };
}

/** Lo que cada tipo de registro guarda para que supervisión lo compare con el formulario. */
export type DetalleDeRegistro = Readonly<{ orden: number; familia: string }> &
  (
    | Readonly<{ modo: string; ninos: readonly { pulsera: string; nombre: string | null }[]; total: MoneyDto }>
    | Readonly<{ ninos: readonly { pulsera: string; nombre: string | null }[]; excedente: MoneyDto }>
    | Readonly<{ total: MoneyDto; pagos: readonly { medio: string; monto: MoneyDto }[] }>
  );

/** Deja constancia de un registro cargado: de qué tipo es, a qué cuenta toca, cuándo ocurrió y cuándo se cargó. */
export async function asentarRegistroEn(
  tx: Transaccion,
  ctx: Contexto,
  carga: CargaParaRegistrar,
  papel: EnPapel,
  r: Readonly<{
    tipo: "ENTRADA" | "SALIDA" | "COBRO";
    accountId: string;
    operationKey: string;
    ocurrioEn: number;
    quien: string;
    detalle: DetalleDeRegistro;
  }>,
): Promise<void> {
  await tx.paperLoadItem.create({
    data: {
      tenantId: ctx.tenantId,
      loadId: carga.id,
      kind: r.tipo,
      accountId: r.accountId,
      operationKey: r.operationKey,
      occurredAt: new Date(r.ocurrioEn),
      loadedAt: new Date(papel.cargadoEn),
      loadedBy: ctx.quien?.userId ?? null,
      loadedByName: r.quien,
      deviceId: ctx.quien?.deviceId ?? null,
      detail: r.detalle,
    },
  });
}

/** La marca que lleva lo cargado desde papel (la venta, la auditoría): la carga, la hora real y cuándo se cargó. */
export function marcaDePapel(carga: Pick<CargaParaRegistrar, "id">, papel: EnPapel, horaReal: number): MarcaDePapelDto {
  return { cargaId: carga.id, ocurrioEn: new Date(horaReal).toISOString(), cargadoEn: new Date(papel.cargadoEn).toISOString() };
}
