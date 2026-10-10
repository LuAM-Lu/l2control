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
 */
import {
  AsignarClienteCommandSchema,
  BuscarClienteSchema,
  ClienteEncontradoSchema,
  EncontrarClienteSchema,
  FamilyAccountSchema,
  problemasDe,
  type ClienteDeCuentaDto,
  type ClienteEncontradoDto,
  type DatosDelClienteDto,
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
export { clientesDeCuentas } from "./de-cuentas.ts";

/** El cliente que se le pone a una cuenta, ya reconocido (o dado de alta) en el directorio. */
export type ClienteResuelto = Readonly<{
  /** El cliente del directorio, o `null` si su teléfono es de otro cliente con otra cédula. */
  guardianId: string | null;
  nombre: string;
  cedula: string;
  cedulaKey: string;
  telefono: string;
  telefonoKey: string;
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
 * Reconoce al cliente en el directorio, o lo da de alta (ver arriba). Lo llama quien abre o asigna, dentro de su
 * transacción y después de comprobar el permiso.
 */
export async function resolverCliente(tx: Transaccion, ctx: Contexto, datos: DatosDelClienteDto, ahora: number): Promise<ClienteResuelto | Rechazo> {
  const cedula = documentoLegible(datos.cedula);
  const cedulaKey = documentKey(datos.cedula);
  if (!cedula || !cedulaKey) return datosInvalidos("cedula");
  const telefono = telefonoLegible(datos.telefono);
  const telefonoKey = contactKey(datos.telefono);
  if (!telefono || !telefonoKey) return datosInvalidos("telefono");
  const base = { nombre: datos.nombre, cedula, cedulaKey, telefono, telefonoKey } as const;

  const porCedula = await tx.guardian.findFirst({ where: { documentKey: cedulaKey }, select: { id: true } });
  if (porCedula) return { ...base, guardianId: porCedula.id, nuevo: false, completado: false };

  const porTelefono = await tx.guardian.findFirst({ where: { contactKey: telefonoKey }, select: { id: true, documentKey: true } });
  if (porTelefono) {
    if (porTelefono.documentKey !== null) return { ...base, guardianId: null, nuevo: false, completado: false };
    await tx.guardian.update({ where: { id: porTelefono.id }, data: { document: cedula, documentKey: cedulaKey } });
    await auditar(tx, ctx, { action: "cliente.completar", entityType: "guardian", entityId: porTelefono.id, after: { cedula: "anotada" } });
    return { ...base, guardianId: porTelefono.id, nuevo: false, completado: true };
  }

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

/** ¿Es el mismo cliente? La misma cédula, el mismo teléfono y el mismo nombre: reenviarlo no añade otra fila. */
function mismo(a: ClienteDeCuentaDto, b: DatosDelClienteDto): boolean {
  return documentKey(a.cedula) === documentKey(b.cedula) && contactKey(a.telefono) === contactKey(b.telefono) && a.nombre.trim() === b.nombre.trim();
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
      if (!cedulaKey && !(telefonoKey && /^0\d{10}$/.test(telefonoKey))) return { ok: true, valor: null };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ClienteEncontradoDto | null | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "cuenta.cliente");
        if (rechazo) return rechazo;
        const g =
          (cedulaKey ? await tx.guardian.findFirst({ where: { documentKey: cedulaKey } }) : null) ??
          (telefonoKey ? await tx.guardian.findFirst({ where: { contactKey: telefonoKey } }) : null);
        if (!g) return null;
        return ClienteEncontradoSchema.parse({
          clienteId: g.id,
          nombre: g.fullName,
          cedula: g.document,
          telefono: telefonoLegible(g.contactReference) ?? g.contactReference,
          // Lo que dejó sin pagar (B3-11): se avisa al encontrarlo.
          deudas: await avisosDeDeuda(tx, { guardianId: g.id, documentKey: g.documentKey, phoneKey: g.contactKey }),
        });
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
        const deCuenta = await permisoEn(tx, ctx, "cuenta.cliente");
        const deSala = deCuenta === "PERMITIDO" ? deCuenta : await permisoEn(tx, ctx, "parque.checkIn");
        if (deSala !== "PERMITIDO") {
          const rechazo = await exigirPermiso(tx, ctx, "cuenta.cliente");
          if (rechazo) return rechazo;
        }
        const donde = cedulaKey
          ? { documentKey: cedulaKey }
          : telefonoKey
            ? { contactKey: telefonoKey }
            : sinLetra
              ? { documentKey: { in: ["V", "E"].map((l) => `${l}${sinLetra}`) } }
              : { fullName: { contains: texto, mode: "insensitive" as const } };
        const filas = await tx.guardian.findMany({ where: donde, orderBy: { fullName: "asc" }, take: 12 });
        const encontrados: ClienteEncontradoDto[] = [];
        for (const g of filas) {
          encontrados.push(
            ClienteEncontradoSchema.parse({
              clienteId: g.id,
              nombre: g.fullName,
              cedula: g.document,
              telefono: telefonoLegible(g.contactReference) ?? g.contactReference,
              deudas: await avisosDeDeuda(tx, { guardianId: g.id, documentKey: g.documentKey, phoneKey: g.contactKey }),
            }),
          );
        }
        // PLAN §7.6: cuántos, no cuáles ni qué se escribió.
        await auditar(tx, ctx, { action: "cliente.buscar", entityType: "guardian", after: { encontrados: encontrados.length } });
        return { ok: true, valor: encontrados };
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

          // Reenviar el mismo cliente (se cortó la red) no cambia nada ni pide autorización.
          if (cuenta.cliente && mismo(cuenta.cliente, cmd.cliente)) return (await exigirPermiso(tx, ctx, "cuenta.cliente")) ?? cuenta;
          // Poner el primero es de quien atiende; cambiarlo, con la autorización de supervisión (es a quien se cobra).
          accion = cuenta.cliente ? "cuenta.cambiar_cliente" : "cuenta.cliente";
          let autorizadoPor: string | null = null;
          if (cuenta.cliente) {
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
          const porSalir = ventaDirecta ? await prepararComandaDeCaja(tx, ctx, cuenta, "la venta no quedó pendiente") : null;
          if (porSalir && "ok" in porSalir) return porSalir;

          const c = await resolverCliente(tx, ctx, cmd.cliente, ahora);
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
            after: { nombre: c.nombre, clienteId: c.guardianId, nuevo: c.nuevo, orden: cuenta.orderNumber ?? null },
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
