/**
 * El cliente de una cuenta en el servidor — B6-9, M-33.
 *
 * Quien abre una cuenta en el salón consume primero y paga al final: si se va sin pagar, hay que saber a quién
 * cobrarle. La cuenta lleva su nombre, su cédula y su teléfono en su propia tabla (`account_customer`, solo agregar):
 * cambiarlo añade una fila y la vigente es la última. No va en el contenido de la versión de la cuenta, para que una
 * versión anterior de la app, que no lo conoce, no lo pierda al guardarla (ADR-028); al leer una cuenta, se pone.
 *
 * El directorio de representantes (B4-1) es también el de los clientes:
 *  · la **cédula** reconoce al cliente que vuelve (única en el local);
 *  · si no, el **teléfono**: un representante del parque que llega a la mesa ya está, y se le completa la cédula;
 *  · si ese teléfono es de otra persona con otra cédula (comparten número), la cuenta guarda los datos tal cual
 *    se dieron, sin enlazar a nadie: no se pisa a un cliente con los datos de otro;
 *  · si no está, se da de alta.
 * El nombre del directorio no se cambia desde aquí: corregirlo es del directorio, con su auditoría.
 *
 * B6-22 (M-40): con «Más rápido» se sienta con el nombre, y con «Solo si queda una deuda» sin teléfono. Lo que no se dio
 * queda vacío en la cuenta. El directorio necesita el teléfono (el parque llama al representante): sin él, el cliente
 * nuevo queda en su cuenta y el directorio lo aprende cuando lo dé. El que ya está se reconoce igual por su cédula, y por
 * su teléfono trae la cédula que el directorio ya tiene.
 */
import {
  AsignarClienteCommandSchema,
  BuscarClienteSchema,
  ClienteEncontradoSchema,
  ClientesDeAquiSchema,
  EncontrarClienteSchema,
  FamilyAccountSchema,
  problemasDe,
  type ClienteDeCuentaDto,
  type ClienteDeAquiDto,
  type ClienteEncontradoDto,
  type ClientesDeAquiDto,
  type DatosParcialesDelClienteDto,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { contactKey, documentKey, documentoLegible, telefonoLegible } from "@l2/domain-park";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { guardarVersion, vigenteDe } from "../caja/cuentas.ts";
import { asentarComandaDeCaja, prepararComandaDeCaja } from "../restaurante/comanda.ts";
import { avisosDeDeuda } from "../deudas/lectura.ts";
import { reservasDe } from "../park/eventos.ts";
import { enLaSalaDeHoy } from "../park/parque.ts";
import { sessionsVinculadas } from "../restaurante/plano.ts";
import { diaDeNegocioDe, zonaDe } from "../sucursal/ajustes.ts";
import { businessDayAt, businessDayEnd } from "@l2/domain-cash";
import { exigidoAlCompletar, type Exigido } from "@l2/domain-orders";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { addDays, calendarDay } from "@l2/domain-rates";
export { clientesDeCuentas } from "./de-cuentas.ts";

/** El cliente que se le pone a una cuenta, ya reconocido (o dado de alta) en el directorio. */
export type ClienteResuelto = Readonly<{
  /**
   * El cliente del directorio, o `null` si su teléfono es de otro cliente con otra cédula, o si es nuevo y no dio
   * teléfono (B6-22).
   */
  guardianId: string | null;
  nombre: string;
  /** Sin cédula (sentado «Más rápido», B6-22) o sin teléfono («Solo si queda una deuda»): `null`. */
  cedula: string | null;
  cedulaKey: string | null;
  telefono: string | null;
  telefonoKey: string | null;
  /** Si se dio de alta en el directorio ahora. */
  nuevo: boolean;
  /** Si un representante del parque recibió ahora su cédula. */
  completado: boolean;
}>;

const datosInvalidos = (path: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje: "Los datos del cliente no se entienden: revisa la cédula y el teléfono.",
  problemas: [{ path: ["cliente", path], message: "NO_SE_ENTIENDE" }],
});

/**
 * Lo que falta del cliente (B6-22): la cédula o el teléfono que los ajustes de la sucursal piden, con el mensaje que ve
 * quien atiende. `para`: lo que no se hace sin ellos («no se abre la cuenta»).
 */
export function faltaDelCliente(datos: DatosParcialesDelClienteDto, exige: Exigido, para: string): Rechazo | null {
  const falta = exige.cedula && !datos.cedula ? "cedula" : exige.telefono && !datos.telefono ? "telefono" : null;
  if (!falta) return null;
  return {
    ok: false,
    motivo: "INVALIDO",
    mensaje: falta === "cedula" ? `Falta la cédula de ${datos.nombre}: sin ella ${para}.` : `Falta el teléfono de ${datos.nombre}: sin él ${para}.`,
    problemas: [{ path: ["cliente", falta], message: falta === "cedula" ? "FALTA_LA_CEDULA" : "FALTA_EL_TELEFONO" }],
  };
}

/**
 * Para el asiento (B6-22): qué le falta al cliente, sin sus datos (PLAN §7.6). La clave no lleva «cédula» ni
 * «teléfono»: el registro las tapa.
 */
export function faltanDe(c: Readonly<{ cedula: string | null; telefono: string | null }>): { faltan?: ("CEDULA" | "TELEFONO")[] } {
  const faltan = [...(c.cedula === null ? (["CEDULA"] as const) : []), ...(c.telefono === null ? (["TELEFONO"] as const) : [])];
  return faltan.length > 0 ? { faltan } : {};
}

/**
 * Reconoce al cliente en el directorio, o lo da de alta (ver arriba). Lo llama quien abre o asigna, dentro de su
 * transacción y después de comprobar el permiso y lo que falta (`faltaDelCliente`).
 */
export async function resolverCliente(tx: Transaccion, ctx: Contexto, datos: DatosParcialesDelClienteDto, ahora: number): Promise<ClienteResuelto | Rechazo> {
  const conCedula = (datos.cedula ?? "").trim() !== "";
  const cedula = conCedula ? documentoLegible(datos.cedula!) : null;
  const cedulaKey = conCedula ? documentKey(datos.cedula!) : null;
  if (conCedula && (!cedula || !cedulaKey)) return datosInvalidos("cedula");
  const conTelefono = (datos.telefono ?? "").trim() !== "";
  const telefono = conTelefono ? telefonoLegible(datos.telefono!) : null;
  const telefonoKey = conTelefono ? contactKey(datos.telefono!) : null;
  if (conTelefono && (!telefono || !telefonoKey)) return datosInvalidos("telefono");
  const base = { nombre: datos.nombre, cedula, cedulaKey, telefono, telefonoKey } as const;

  if (cedulaKey) {
    const porCedula = await tx.guardian.findFirst({ where: { documentKey: cedulaKey }, select: { id: true } });
    if (porCedula) return { ...base, guardianId: porCedula.id, nuevo: false, completado: false };
  }

  const porTelefono = telefonoKey ? await tx.guardian.findFirst({ where: { contactKey: telefonoKey }, select: { id: true, document: true, documentKey: true } }) : null;
  if (porTelefono) {
    // Ese teléfono ya tiene su cédula: con otra, es otra persona (comparten número) y no se enlaza; sin ninguna (B6-22),
    // es él, y su cédula viene del directorio.
    if (porTelefono.documentKey !== null) {
      return cedulaKey
        ? { ...base, guardianId: null, nuevo: false, completado: false }
        : { ...base, cedula: porTelefono.document, cedulaKey: porTelefono.documentKey, guardianId: porTelefono.id, nuevo: false, completado: false };
    }
    if (!cedula || !cedulaKey) return { ...base, guardianId: porTelefono.id, nuevo: false, completado: false };
    await tx.guardian.update({ where: { id: porTelefono.id }, data: { document: cedula, documentKey: cedulaKey } });
    await auditar(tx, ctx, { action: "cliente.completar", entityType: "guardian", entityId: porTelefono.id, after: { cedula: "anotada" } });
    return { ...base, guardianId: porTelefono.id, nuevo: false, completado: true };
  }

  // Nuevo. Sin teléfono no entra al directorio (lo exige: el parque llama al representante): queda en su cuenta.
  if (!telefono || !telefonoKey) return { ...base, guardianId: null, nuevo: false, completado: false };
  const nuevo = await tx.guardian.create({
    data: {
      tenantId: ctx.tenantId,
      fullName: datos.nombre,
      contactReference: telefono,
      contactKey: telefonoKey,
      document: cedula,
      documentKey: cedulaKey,
      createdAt: new Date(ahora),
      createdBy: ctx.quien?.userId ?? null,
    },
    select: { id: true },
  });
  return { ...base, guardianId: nuevo.id, nuevo: true, completado: false };
}

/** Anota el cliente de una cuenta: una fila más, la vigente desde ahora. */
export async function anotarCliente(
  tx: Transaccion,
  ctx: Contexto,
  accountId: string,
  c: ClienteResuelto,
  ahora: number,
  quien: string,
): Promise<ClienteDeCuentaDto> {
  await tx.accountCustomer.create({
    data: {
      tenantId: ctx.tenantId,
      accountId,
      guardianId: c.guardianId,
      fullName: c.nombre,
      document: c.cedula,
      documentKey: c.cedulaKey,
      phone: c.telefono,
      phoneKey: c.telefonoKey,
      setAt: new Date(ahora),
      setBy: ctx.quien?.userId ?? null,
      setByName: quien,
      deviceId: ctx.quien?.deviceId ?? null,
    },
  });
  return { nombre: c.nombre, cedula: c.cedula, telefono: c.telefono, ...(c.guardianId ? { clienteId: c.guardianId } : {}) };
}

const llaveDeCedula = (v: string | null | undefined) => (v ? documentKey(v) : null);
const llaveDeTelefono = (v: string | null | undefined) => (v ? contactKey(v) : null);

/** ¿Es el mismo cliente? La misma cédula, el mismo teléfono y el mismo nombre: reenviarlo no añade otra fila. */
function mismo(a: ClienteDeCuentaDto, b: DatosParcialesDelClienteDto): boolean {
  return llaveDeCedula(a.cedula) === llaveDeCedula(b.cedula) && llaveDeTelefono(a.telefono) === llaveDeTelefono(b.telefono) && a.nombre.trim() === b.nombre.trim();
}

/**
 * ¿Completa al cliente que tiene la cuenta, en vez de cambiarlo (B6-22)? A una cuenta sin cédula (sentada «Más rápido»)
 * se le pone, con el nombre que sea: hasta ahora no tenía a quién cobrarle. Y a la que tiene su cédula se le añade el
 * teléfono que faltaba, si el nombre y la cédula siguen. Completar es de quien atiende; cambiar, con autorización.
 */
function completa(a: ClienteDeCuentaDto, b: DatosParcialesDelClienteDto): boolean {
  if (a.cedula === null) return true;
  return a.telefono === null && llaveDeCedula(a.cedula) === llaveDeCedula(b.cedula) && a.nombre.trim() === b.nombre.trim();
}

type Ficha = Readonly<{ id: string; fullName: string; document: string | null; documentKey: string | null; contactReference: string; contactKey: string }>;

/**
 * Un cliente del directorio como lo encuentra una pantalla: sus datos, lo que debe (B3-11), la última vez que vino y
 * cuántos niños tiene (T-23): con eso se reconoce en una lista sin abrir su ficha.
 */
async function encontradoDe(tx: Transaccion, g: Ficha): Promise<ClienteEncontradoDto> {
  const [entrada, cuenta, conNombre] = [
    await tx.parkSession.findFirst({ where: { guardianId: g.id }, orderBy: { startedAt: "desc" }, select: { startedAt: true, accountId: true } }),
    await tx.accountCustomer.findFirst({ where: { guardianId: g.id }, orderBy: { setAt: "desc" }, select: { setAt: true } }),
    await tx.kid.count({ where: { guardianId: g.id } }),
  ];
  const vino = Math.max(entrada?.startedAt.getTime() ?? 0, cuenta?.setAt.getTime() ?? 0);
  // Sus niños: los que tienen ficha o, si entraron sin nombre, los de su última visita.
  const ninos = Math.max(conNombre, entrada ? await tx.parkSession.count({ where: { guardianId: g.id, accountId: entrada.accountId } }) : 0);
  return ClienteEncontradoSchema.parse({
    clienteId: g.id,
    nombre: g.fullName,
    cedula: g.document,
    telefono: telefonoLegible(g.contactReference) ?? g.contactReference,
    // Lo que dejó sin pagar (B3-11): se avisa al encontrarlo.
    deudas: await avisosDeDeuda(tx, { guardianId: g.id, documentKey: g.documentKey, phoneKey: g.contactKey }),
    vinoEl: vino > 0 ? new Date(vino).toISOString() : null,
    ninos,
  });
}

/** ¿Atiende a un cliente (la caja, el salón) o a una familia (la sala)? Lo que pide el buscador y «aquí ahora». */
async function atiendeClientes(tx: Transaccion, ctx: Contexto): Promise<Rechazo | null> {
  const deCuenta = await permisoEn(tx, ctx, "cuenta.cliente");
  const deSala = deCuenta === "PERMITIDO" ? deCuenta : await permisoEn(tx, ctx, "parque.checkIn");
  return deSala === "PERMITIDO" ? null : exigirPermiso(tx, ctx, "cuenta.cliente");
}

export interface CasosClientes {
  /** El cliente del directorio con esa cédula o ese teléfono (completos), o `null` si no ha venido. */
  buscar(ctx: Contexto, entrada: unknown): Promise<Resultado<ClienteEncontradoDto | null>>;
  /**
   * El buscador (T-19, `EncontrarClienteSchema`): los clientes del directorio por su cédula o su teléfono completos, o
   * por una parte de su nombre; hasta 12, con lo que deben. Lo usan la caja, el salón y la sala; cada consulta queda en
   * la auditoría con cuántos encontró y no qué se buscó (PLAN §7.6).
   */
  encontrar(ctx: Contexto, entrada: unknown): Promise<Resultado<ClienteEncontradoDto[]>>;
  /**
   * Los clientes que están aquí ahora (T-23): las familias con niños en la sala (con sus estancias), el cliente de cada
   * cuenta abierta y el representante de cada cumpleaños de hoy. Es lo que el campo del cliente propone antes de escribir.
   */
  deAqui(ctx: Contexto, ahora?: number): Promise<Resultado<ClientesDeAquiDto>>;
  /**
   * Pone el cliente de una cuenta abierta del salón o del mostrador (`AsignarClienteCommandSchema`), o lo cambia: un
   * dato mal escrito. Ponerlo es de quien atiende; cambiarlo pide la autorización de supervisión. La cuenta pasa a
   * llamarse como el cliente. Reenviar el mismo cliente no cambia nada.
   */
  asignar(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
}

export function casosClientes(base: Base): CasosClientes {
  return {
    async buscar(ctx, entrada) {
      const v = BuscarClienteSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Escribe la cédula o el teléfono.", problemas: problemasDe(v.error) };
      const cedulaKey = v.data.cedula ? documentKey(v.data.cedula) : null;
      const telefonoKey = v.data.telefono ? contactKey(v.data.telefono) : null;
      const clienteId = v.data.clienteId ?? null;
      if (!clienteId && !cedulaKey && !(telefonoKey && /^0\d{10}$/.test(telefonoKey))) return { ok: true, valor: null };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ClienteEncontradoDto | null | Rechazo> => {
        // Quien atiende a un cliente o a una familia (T-23: la entrada lo busca por su ficha para avisar lo que debe).
        const rechazo = await atiendeClientes(tx, ctx);
        if (rechazo) return rechazo;
        const g =
          (clienteId ? await tx.guardian.findFirst({ where: { id: clienteId } }) : null) ??
          (cedulaKey ? await tx.guardian.findFirst({ where: { documentKey: cedulaKey } }) : null) ??
          (telefonoKey ? await tx.guardian.findFirst({ where: { contactKey: telefonoKey } }) : null);
        if (!g) return null;
        return encontradoDe(tx, g);
      });
      return r !== null && "ok" in r ? r : { ok: true, valor: r };
    },

    async encontrar(ctx, entrada) {
      const v = EncontrarClienteSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Escribe al menos 3 letras o dígitos.", problemas: problemasDe(v.error) };
      const texto = v.data.texto;
      const cedulaKey = documentKey(texto);
      const digitos = texto.replace(/\D/g, "");
      // Un número sin letra de documento: un teléfono entero, o una cédula escrita sin su letra («12345678»).
      const telefonoKey = /^[\d\s.()+-]+$/.test(texto) && digitos.length >= 10 ? contactKey(texto) : null;
      const sinLetra = /^[\d\s.]+$/.test(texto) && digitos.length >= 6 && digitos.length <= 9 ? digitos : null;
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<ClienteEncontradoDto[]>> => {
        // Quien atiende a un cliente (la caja, el salón) o a una familia (la sala).
        const rechazo = await atiendeClientes(tx, ctx);
        if (rechazo) return rechazo;
        const donde = cedulaKey
          ? { documentKey: cedulaKey }
          : telefonoKey
            ? { contactKey: telefonoKey }
            : sinLetra
              ? { documentKey: { in: ["V", "E"].map((l) => `${l}${sinLetra}`) } }
              : { fullName: { contains: texto, mode: "insensitive" as const } };
        const filas = await tx.guardian.findMany({ where: donde, orderBy: { fullName: "asc" }, take: v.data.limite ?? 12 });
        const encontrados: ClienteEncontradoDto[] = [];
        for (const g of filas) encontrados.push(await encontradoDe(tx, g));
        // PLAN §7.6: cuántos, no cuáles ni qué se escribió.
        await auditar(tx, ctx, { action: "cliente.buscar", entityType: "guardian", after: { encontrados: encontrados.length } });
        return { ok: true, valor: encontrados };
      });
    },

    async deAqui(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<ClientesDeAquiDto>> => {
        const rechazo = await atiendeClientes(tx, ctx);
        if (rechazo) return rechazo;
        const aqui: ClienteDeAquiDto[] = [];
        const vistos = new Set<string>();
        const sumar = async (guardianId: string, motivo: ClienteDeAquiDto["motivo"], detalle: string, estancias: string[] = [], en: Date | null = null) => {
          if (vistos.has(guardianId)) return;
          const g = await tx.guardian.findFirst({ where: { id: guardianId } });
          if (!g) return;
          vistos.add(guardianId);
          aqui.push({ cliente: await encontradoDe(tx, g), motivo, detalle: detalle.slice(0, 80), estancias, en: en ? en.toISOString() : null });
        };
        // Las familias con niños en la sala, la más reciente primero: son las que suelen pasar a una mesa. Una estancia
        // olvidada de otro día está a revisar: no está aquí. Un niño ya vinculado a una mesa no se ofrece para otra (R3):
        // si todos los de la familia lo están, la familia sale por su mesa.
        const deHoy = await enLaSalaDeHoy(tx, ctx.branchId, ahora);
        const vinculadas = await sessionsVinculadas(tx, ctx.branchId);
        const sala = (
          await tx.parkSession.findMany({ where: { branchId: ctx.branchId, status: "ACTIVA" }, orderBy: { startedAt: "desc" }, select: { id: true, guardianId: true, startedAt: true } })
        ).filter((e) => deHoy(e) && !vinculadas.has(e.id));
        const porFamilia = new Map<string, string[]>();
        for (const e of sala) porFamilia.set(e.guardianId, [...(porFamilia.get(e.guardianId) ?? []), e.id]);
        for (const [guardianId, estancias] of porFamilia) {
          await sumar(guardianId, "SALA", estancias.length === 1 ? "1 niño en la sala" : `${estancias.length} niños en la sala`, estancias);
        }
        // El cliente de cada cuenta abierta hoy: su mesa, de pie o el mostrador. La de un día anterior la cierra la caja
        // (B3-24): no está aquí.
        const dia = await diaDeNegocioDe(tx, ctx.branchId);
        const hoyDeNegocio = businessDayAt(ahora, dia.zona, dia.finMin);
        const abiertas = await tx.$queryRaw<{ guardian_id: string; kind: string; mesa: string | null; de_pie: string | null; opened_at: Date }[]>`
          SELECT DISTINCT ON (c.account_id) c.guardian_id, v.content->>'kind' AS kind, v.content->>'tableLabel' AS mesa, v.content->>'dePie' AS de_pie, a.opened_at
          FROM account_customer c
          JOIN account a ON a.id = c.account_id AND a.tenant_id = c.tenant_id AND a.branch_id = ${ctx.branchId}::uuid
          JOIN LATERAL (SELECT status, content FROM account_version x WHERE x.account_id = a.id ORDER BY version DESC LIMIT 1) v ON true
          WHERE v.status IN ('ABIERTA', 'POR_COBRAR') AND c.guardian_id IS NOT NULL
          ORDER BY c.account_id, c.set_at DESC`;
        for (const a of abiertas.filter((x) => businessDayAt(x.opened_at.getTime(), dia.zona, dia.finMin) === hoyDeNegocio)) await sumar(a.guardian_id, "CUENTA", a.de_pie === "true" ? "De pie" : a.kind === "MESA" ? (a.mesa ? `Mesa ${a.mesa}` : "Mesa") : a.kind === "MOSTRADOR" ? "Cuenta del mostrador" : "Cuenta abierta");
        // El representante de cada cumpleaños de hoy que sigue en pie.
        const hoy = calendarDay(new Date(ahora).toISOString(), await zonaDe(tx, ctx.branchId));
        for (const r of (await reservasDe(tx, { branchId: ctx.branchId, eventDate: new Date(hoy) })).filter((x) => x.estado !== "CANCELADA")) {
          await sumar(r.representante.id, "CUMPLEANOS", `Cumpleaños de ${r.cumpleanero}`);
        }
        // T-24: los que vinieron hoy y ya se fueron: salieron del parque o pagaron su cuenta. Vuelven a la mesa o a la caja
        // y no hay que escribir sus datos otra vez. Los más recientes primero.
        const inicioDeHoy = businessDayEnd(addDays(hoyDeNegocio, -1), dia.zona, dia.finMin);
        const salieron = await tx.parkSession.findMany({
          where: { branchId: ctx.branchId, status: { not: "ACTIVA" }, endedAt: { gte: new Date(inicioDeHoy) }, OR: [{ closureKind: null }, { closureKind: { not: "ANULADA" } }] },
          orderBy: { endedAt: "desc" },
          select: { guardianId: true, endedAt: true },
          take: 40,
        });
        const pagaron = await tx.$queryRaw<{ guardian_id: string; saved_at: Date }[]>`
          SELECT DISTINCT ON (c.guardian_id) c.guardian_id, v.saved_at
          FROM account_customer c
          JOIN account a ON a.id = c.account_id AND a.tenant_id = c.tenant_id AND a.branch_id = ${ctx.branchId}::uuid
          JOIN LATERAL (SELECT status, saved_at FROM account_version x WHERE x.account_id = a.id ORDER BY version DESC LIMIT 1) v ON true
          WHERE v.status = 'COBRADA' AND v.saved_at >= ${new Date(inicioDeHoy)} AND c.guardian_id IS NOT NULL
          ORDER BY c.guardian_id, v.saved_at DESC`;
        const seFueron = [
          ...salieron.map((s) => ({ guardianId: s.guardianId, en: s.endedAt!, detalle: "Salió del parque" })),
          ...pagaron.map((p) => ({ guardianId: p.guardian_id, en: p.saved_at, detalle: "Pagó su cuenta" })),
        ].sort((a, b) => b.en.getTime() - a.en.getTime());
        for (const s of seFueron) await sumar(s.guardianId, "HOY", s.detalle, [], s.en);
        return { ok: true, valor: ClientesDeAquiSchema.parse({ clientes: aqui.slice(0, 24) }) };
      });
    },

    async asignar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AsignarClienteCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cliente no se anotó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      let accion: "cuenta.cliente" | "cuenta.cambiar_cliente" = "cuenta.cliente";
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
          const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
          const vigente = fila && fila.branchId === ctx.branchId ? await vigenteDe(tx, cmd.accountId) : null;
          if (!vigente) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no está en esta sucursal." };
          const cuenta = vigente.cuenta;
          // La cuenta de una familia es de su representante (el parque) y la de un cumpleaños, de su reserva.
          if (cuenta.kind !== "MESA" && cuenta.kind !== "MOSTRADOR") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta ya es de su representante o de su reserva: su cliente no se cambia aquí." };
          }
          if (cuenta.status !== "ABIERTA" && cuenta.status !== "POR_COBRAR") return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta ya está cerrada." };

          // Completar (B6-22): el teléfono que ya tenía la cuenta se queda si no se volvió a dar.
          const datos = !cmd.cliente.telefono && cuenta.cliente?.telefono && completa(cuenta.cliente, cmd.cliente) ? { ...cmd.cliente, telefono: cuenta.cliente.telefono } : cmd.cliente;
          // Reenviar el mismo cliente (se cortó la red) no cambia nada ni pide autorización.
          if (cuenta.cliente && mismo(cuenta.cliente, datos)) return (await exigirPermiso(tx, ctx, "cuenta.cliente")) ?? cuenta;
          // Poner el primero o completarlo es de quien atiende; cambiarlo, con la autorización de supervisión (es a quien se
          // cobra).
          const cambia = cuenta.cliente !== undefined && !completa(cuenta.cliente, datos);
          accion = cambia ? "cuenta.cambiar_cliente" : "cuenta.cliente";
          let autorizadoPor: string | null = null;
          if (cambia) {
            const p = await exigirPermisoOAutorizacion(tx, ctx, "cuenta.cambiarCliente", autorizacion, ahora);
            if (!p.ok) return p;
            autorizadoPor = p.autorizadoPor;
          } else {
            const rechazo = await exigirPermiso(tx, ctx, "cuenta.cliente");
            if (rechazo) return rechazo;
          }

          // Una venta directa que queda pendiente (B6-16): lo que se prepara sale ya en su comanda, no al cobrarla. Se
          // comprueba antes de escribir nada (su impresora).
          const ventaDirecta = cuenta.kind === "MOSTRADOR" && !cuenta.dePie && !cuenta.divididaDe && cuenta.status === "POR_COBRAR";
          // La cédula, siempre; el teléfono, según la sucursal, y siempre en la venta que queda pendiente (B6-22).
          const falta = faltaDelCliente(datos, exigidoAlCompletar((await ajustesDe(tx, ctx.branchId)).telefonoDelCliente, ventaDirecta), "no se anota");
          if (falta) return falta;
          const porSalir = ventaDirecta ? await prepararComandaDeCaja(tx, ctx, cuenta, "la venta no quedó pendiente") : null;
          if (porSalir && "ok" in porSalir) return porSalir;

          const c = await resolverCliente(tx, ctx, datos, ahora);
          if ("ok" in c) return c;
          const quien = await nombreDe(tx, ctx);
          const cliente = await anotarCliente(tx, ctx, cuenta.id, c, ahora, quien.nombre);
          const conPedido = porSalir ? await asentarComandaDeCaja(tx, ctx, cuenta, porSalir, c.nombre, ahora) : cuenta;
          // La cuenta se llama como su cliente: así la ve la cola y la busca la caja.
          const nueva = FamilyAccountSchema.parse({ ...conPedido, family: c.nombre, cliente, version: vigente.version + 1 });
          await guardarVersion(tx, ctx, nueva, { cause: "GUARDAR", operationKey: null, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: accion,
            entityType: "account",
            entityId: cuenta.id,
            ...(autorizadoPor ? { authorizedBy: autorizadoPor } : {}),
            ...(autorizacion && typeof autorizacion === "object" && "motivo" in autorizacion && typeof autorizacion.motivo === "string"
              ? { reason: autorizacion.motivo }
              : {}),
            after: {
              nombre: c.nombre,
              clienteId: c.guardianId,
              nuevo: c.nuevo,
              orden: cuenta.orderNumber ?? null,
              // B6-22: completó la cédula (o el teléfono) de quien se sentó sin ella. Qué datos, no cuáles (PLAN §7.6).
              ...(cuenta.cliente && !cambia ? { completado: true } : {}),
              ...faltanDe(c),
            },
          });
          return nueva;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos equipos dieron de alta al mismo cliente a la vez: se vuelve a mirar y ya está.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },
  };
}
