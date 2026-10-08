/**
 * La Puesta a punto — JORNADA §2 (P6), T-4.
 *
 * Tras la instalación inicial el local existe pero está vacío. Inicio le enseña a administración
 * esta lista, que **se tacha sola cuando el dato existe**: nadie marca nada a mano, así que no
 * puede decir «hecho» lo que no lo está. Cada punto dice qué puesto no puede trabajar sin él;
 * los que no bloquean nada son recomendables.
 *
 * Solo lee, y solo cuenta: no enseña ningún dato del negocio ni ningún secreto. La ve quien
 * gestiona personas (administración); a los demás no les dice nada que puedan arreglar.
 */
import {
  PosponerPuntoCommandSchema,
  PuestaAPuntoSchema,
  problemasDe,
  type PuestaAPuntoDto,
  type PuntoDePuestaAPuntoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { arranquesDe } from "../inventario/existencias.ts";

export interface CasosPuestaAPunto {
  leer(ctx: Contexto): Promise<Resultado<PuestaAPuntoDto>>;
  /**
   * Deja un punto recomendable para después, o lo retoma (`PosponerPuntoCommandSchema`). Lo que bloquea un
   * puesto no se pospone. Es de quien ve la lista, sin confirmar la identidad: no cambia nada del negocio.
   */
  posponer(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PuestaAPuntoDto>>;
}

type Punto = Omit<PuntoDePuestaAPuntoDto, "paraDespues">;

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** La lista del local, con lo que cada recomendable tiene dejado para después. */
async function calcular(tx: Transaccion, ctx: Contexto): Promise<PuestaAPuntoDto> {
  const enSucursal = { branches: { some: { branchId: ctx.branchId } } };

  // De una en una: es la única conexión de la transacción.
  const personas = await tx.staffUser.count({ where: { active: true, pinHash: { not: null }, ...enSucursal } });
  const equipos = await tx.device.count({ where: { branchId: ctx.branchId, status: "APROBADO" } });
  const tarifas = await tx.parkTariffVersion.count({ where: { branchId: ctx.branchId } });
  const impuestos = await tx.taxRate.count();
  const tasas = await tx.exchangeRate.count({ where: { confirmation: { isNot: null } } });
  // Los que piden datos del LOCAL (su teléfono, su correo, su terminal). El USDT también lleva
  // `dataKind`, pero nace encendido sin que nadie cargue nada: contarlo daría el punto por hecho.
  const mediosConDatos = await tx.paymentMethod.count({ where: { active: true, dataKind: { in: ["PAGO_MOVIL", "ZELLE", "PUNTO"] } } });
  const productos = await tx.product.count({ where: { active: true } });
  const impresoras = await tx.printer.count({ where: { branchId: ctx.branchId, active: true, retiredAt: null } });
  const feriados = await tx.bankHoliday.count({ where: { retiredAt: null } });
  const plano = await tx.floorPlanVersion.count({ where: { branchId: ctx.branchId } });
  const enCarta = await tx.product.count({ where: { active: true, onMenu: true } });
  // Lo que se cuenta y todavía no tiene su inventario inicial (B9-7): no se vende hasta contarlo.
  const contables = await tx.product.findMany({ where: { active: true, tracksStock: true }, select: { id: true } });
  const arrancados = await arranquesDe(tx, ctx.branchId);
  const sinInicial = contables.filter((p) => !arrancados.has(p.id)).length;
  const descuentos = await tx.discountRule.count({ where: { retiredAt: null } });
  const vip = await tx.guardianVip.count();
  // Con contraseña ya confirma identidad (en su equipo de confianza, con la app, la llave o un código).
  const administraciones = await tx.staffUser.count({ where: { active: true, role: "ADMIN", passwordHash: { not: null }, ...enSucursal } });
  // Fuera de su equipo de confianza hace falta la app o una llave (ADR-029).
  const desdeOtrosEquipos = await tx.staffUser.count({
    where: {
      active: true,
      role: "ADMIN",
      passwordHash: { not: null },
      OR: [{ passkeys: { some: { retiredAt: null } } }, { totpCredentials: { some: { confirmedAt: { not: null }, retiredAt: null } } }],
      ...enSucursal,
    },
  });

  const puntos: Punto[] = [
    {
      id: "personas",
      hecho: personas >= 2,
      bloquea: "Que otra persona opere",
      detalle: personas >= 2 ? `${cuantos(personas, "persona", "personas")} con su PIN` : "Solo estás tú: da de alta al equipo, con su rol y su PIN",
    },
    {
      id: "equipos",
      hecho: equipos >= 2,
      bloquea: "El puesto que no tenga equipo",
      detalle: equipos >= 2 ? `${cuantos(equipos, "equipo aprobado", "equipos aprobados")}` : "Solo este equipo está aprobado: registra el de cada puesto desde él mismo",
    },
    {
      id: "tarifas",
      hecho: tarifas > 0,
      bloquea: "La entrada al parque",
      detalle: tarifas > 0 ? "Tarifas del parque publicadas" : "Falta publicar las tarifas y paquetes del parque",
    },
    {
      id: "impuestos",
      hecho: impuestos > 0,
      bloquea: "Cobrar",
      detalle: impuestos > 0 ? "Impuestos programados" : "Una base nueva no los trae: prográmalos con lo que confirme el contador",
    },
    {
      id: "tasa",
      hecho: tasas > 0,
      bloquea: "Cobrar en bolívares",
      detalle: tasas > 0 ? "Hay tasa del BCV confirmada" : "La primera tasa no se aplica sola: confírmala",
    },
    {
      id: "medios",
      hecho: mediosConDatos > 0,
      bloquea: null,
      detalle:
        mediosConDatos > 0
          ? `${cuantos(mediosConDatos, "medio con datos del local encendido", "medios con datos del local encendidos")}`
          : "El efectivo y el USDT ya están; Pago Móvil, Zelle y el punto piden los datos del local",
    },
    {
      id: "catalogo",
      hecho: productos > 0,
      bloquea: "La venta directa en caja",
      detalle: productos > 0 ? `${cuantos(productos, "producto", "productos")} en el catálogo` : "Falta cargar lo que se vende en el mostrador",
    },
    {
      id: "impresoras",
      hecho: impresoras > 0,
      bloquea: "Las comandas y el ticket de corte",
      detalle: impresoras > 0 ? `${cuantos(impresoras, "impresora", "impresoras")}` : "Falta dar de alta la impresora y vincular su agente",
    },
    {
      id: "feriados",
      hecho: feriados > 0,
      bloquea: null,
      detalle: feriados > 0 ? `${cuantos(feriados, "feriado bancario cargado", "feriados bancarios cargados")}` : "Sin ellos, ese día la tasa se pide a mano",
    },
    {
      id: "carta_y_plano",
      hecho: plano > 0 && enCarta > 0,
      bloquea: "Las mesas y las comandas",
      detalle: plano > 0 && enCarta > 0 ? "Plano publicado y carta con productos" : plano > 0 ? "Falta poner productos en la carta" : "Falta publicar el plano del local",
    },
    {
      id: "existencias",
      // Hecho cuando todo lo que se cuenta tiene su inventario inicial; sin nada que se cuente, con el catálogo.
      hecho: contables.length === 0 ? productos > 0 : sinInicial === 0,
      bloquea: "Vender lo que lleva existencia",
      detalle:
        contables.length === 0
          ? productos > 0
            ? "Ningún producto lleva existencia"
            : "Se cargan después del catálogo"
          : sinInicial === 0
            ? `${cuantos(contables.length, "producto contado", "productos contados")}: todos tienen su inventario inicial`
            : `${cuantos(sinInicial, "producto sin inventario inicial", "productos sin inventario inicial")} de ${contables.length}: no se venden hasta contarlos`,
    },
    {
      id: "descuentos",
      hecho: descuentos > 0 || vip > 0,
      bloquea: null,
      detalle: descuentos > 0 || vip > 0 ? "Hay descuentos o familias VIP" : "Opcional: descuentos por medio de pago, manuales y familias VIP",
    },
    {
      id: "segunda_administracion",
      hecho: administraciones >= 2,
      bloquea: null,
      detalle:
        administraciones >= 2
          ? `${administraciones} personas de administración con sus credenciales`
          : "Regla de operación: siempre dos. Da de alta a otra y envíale su enlace",
    },
    {
      id: "otros_equipos",
      hecho: desdeOtrosEquipos >= 1,
      bloquea: null,
      detalle:
        desdeOtrosEquipos >= 1
          ? "Administración puede confirmar también fuera de su equipo"
          : "Configura la app de autenticación en Ajustes → Personas y equipos para confirmar desde otros equipos",
    },
  ];
  // Lo dejado para después solo cuenta en un recomendable que sigue sin hacer.
  const pospuestos = new Map((await tx.setupPostponement.findMany({ where: { branchId: ctx.branchId, resumedAt: null } })).map((p) => [p.item, p]));
  return PuestaAPuntoSchema.parse({
    puntos: puntos.map((p) => {
      const x = !p.hecho && p.bloquea === null ? pospuestos.get(p.id) : undefined;
      return { ...p, paraDespues: x ? { desde: x.postponedAt.toISOString(), por: x.postponedByName } : null };
    }),
    pendientesQueBloquean: puntos.filter((p) => !p.hecho && p.bloquea !== null).length,
  });
}

export function casosPuestaAPunto(base: Base): CasosPuestaAPunto {
  return {
    leer(ctx) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<PuestaAPuntoDto>> => {
        const permiso = await permisoEn(tx, ctx, "usuarios.gestionar");
        if (permiso !== "PERMITIDO") return rechazoDePermiso(permiso);
        return { ok: true, valor: await calcular(tx, ctx) };
      });
    },

    posponer(ctx, entrada, ahora = Date.now()) {
      const v = PosponerPuntoCommandSchema.safeParse(entrada);
      if (!v.success) return Promise.resolve({ ok: false, motivo: "INVALIDO", mensaje: "Falta qué punto dejar para después.", problemas: problemasDe(v.error) });
      const { id, paraDespues } = v.data;
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<PuestaAPuntoDto>> => {
        const permiso = await permisoEn(tx, ctx, "usuarios.gestionar");
        if (permiso !== "PERMITIDO") return rechazoDePermiso(permiso);
        const punto = (await calcular(tx, ctx)).puntos.find((p) => p.id === id)!;
        if (punto.bloquea !== null) {
          const r: Rechazo = { ok: false, motivo: "INVALIDO", mensaje: "Lo que bloquea un puesto no se deja para después: sin ello, ese puesto no trabaja." };
          return r;
        }
        const vigente = await tx.setupPostponement.findFirst({ where: { branchId: ctx.branchId, item: id, resumedAt: null } });
        if (paraDespues && !vigente) {
          const quien = await nombreDe(tx, ctx);
          const fila = await tx.setupPostponement.create({
            data: { tenantId: ctx.tenantId, branchId: ctx.branchId, item: id, postponedAt: new Date(ahora), postponedByName: quien.nombre },
          });
          await auditar(tx, ctx, { action: "puesta.posponer", entityType: "setup_postponement", entityId: fila.id, after: { punto: id } });
        } else if (!paraDespues && vigente) {
          await tx.setupPostponement.update({ where: { id: vigente.id }, data: { resumedAt: new Date(Math.max(ahora, vigente.postponedAt.getTime())) } });
          await auditar(tx, ctx, { action: "puesta.retomar", entityType: "setup_postponement", entityId: vigente.id, before: { punto: id } });
        }
        return { ok: true, valor: await calcular(tx, ctx) };
      });
    },
  };
}
