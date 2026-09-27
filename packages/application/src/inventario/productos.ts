/**
 * El catálogo de productos en el servidor — B9-1, F8-02, §9.9.
 *
 * Lo que la caja vende en el mostrador o añade a una cuenta es un dato del local, no una lista del
 * código. Quién decide qué:
 *  · el dominio (`@l2/domain-inventory`): el calendario de precios (`priceTimeline`), qué precio se
 *    puede programar (`priceProblem`, `changesTimeline`) y cuándo dos nombres son el mismo
 *    producto (`nameClash`);
 *  · la matriz: cambiarlo es `catalogo.modificar` (administración, con elevación), porque mueve lo
 *    que cobra el negocio;
 *  · este archivo: que el día que manda el navegador se convierta en un instante del local, en una
 *    transacción, con su asiento.
 *
 * Nada se borra: un producto se aparta (lo vendido lo nombra) y un precio no se edita, se programa
 * el siguiente. Lo vendido copió su concepto, su precio y su trato del IVA al venderse.
 */
import {
  CatalogoSchema,
  ProductoCommandSchema,
  problemasDe,
  type CatalogoDto,
  type ProductoCommand,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import {
  changesTimeline,
  nameClash,
  periodAt,
  priceProblem,
  priceTimeline,
  type PriceProblem,
  type ScheduledPrice,
} from "@l2/domain-inventory";
import { errorDeBase, type Base, type Product, type ProductPrice, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo, type AccionAuditada, type Asiento } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { ZONA_DEL_LOCAL } from "../dinero/tasas.ts";

/** Hasta cuántos días por delante se programa un precio: una lista nueva llega con semanas. */
export const DIAS_POR_ADELANTADO_PRECIOS = 366;

export interface CasosProductos {
  /**
   * El catálogo del local: todos los productos (a la venta o apartados) con su calendario de
   * precios. No exige persona: la caja de toda estación vende con él.
   */
  leer(ctx: Contexto): Promise<CatalogoDto>;
  /** Un cambio del catálogo (`ProductoCommandSchema`). Devuelve cómo queda. */
  aplicar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CatalogoDto>>;
}

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});

const MENSAJE_PRECIO: Record<PriceProblem, string> = {
  NO_POSITIVO: "El precio tiene que ser mayor que cero: lo que se regala es una cortesía",
  EXCESIVO: "Más de $ 10.000,00: ¿se tecleó en bolívares?",
  EN_EL_PASADO: "Un precio no se programa hacia atrás",
};

export function casosProductos(base: Base): CasosProductos {
  const cargar = async (tx: Transaccion): Promise<CatalogoDto> => {
    const [productos, precios] = await Promise.all([
      tx.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
      tx.productPrice.findMany({ orderBy: { scheduledAt: "asc" } }),
    ]);
    // Se revalida al salir: lo que no cumple el contrato no llega a la caja (fail-closed).
    return CatalogoSchema.parse({
      productos: productos.map((p) => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category,
        taxCode: p.taxCode,
        controlaStock: p.tracksStock,
        activo: p.active,
        precios: tramosDe(precios.filter((x) => x.productId === p.id)),
      })),
      zonaHoraria: ZONA_DEL_LOCAL,
      diasPorAdelantado: DIAS_POR_ADELANTADO_PRECIOS,
    });
  };

  return {
    async leer(ctx) {
      return base.conTenant(ctx.tenantId, cargar);
    },

    async aplicar(ctx, entrada, ahora = Date.now()) {
      const v = ProductoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cambio no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      // El precio se comprueba antes de abrir la transacción: no depende de la base.
      let desde = ahora;
      if (cmd.kind === "PROGRAMAR_PRECIO") {
        const hoy = calendarDay(new Date(ahora).toISOString(), ZONA_DEL_LOCAL);
        if (cmd.dia < hoy) return invalido("Un precio no se programa hacia atrás: lo ya vendido se queda con el que tenía.", ["dia"], "Día pasado");
        if (cmd.dia > addDays(hoy, DIAS_POR_ADELANTADO_PRECIOS)) {
          return invalido(`Solo se programa con hasta ${DIAS_POR_ADELANTADO_PRECIOS} días de adelanto.`, ["dia"], "Día fuera de rango");
        }
        // Hoy, desde ya: lo vendido esta mañana se queda como se vendió. Otro día, desde su comienzo.
        desde = cmd.dia === hoy ? ahora : startOfDay(cmd.dia, ZONA_DEL_LOCAL);
      }
      if (cmd.kind === "CREAR" || cmd.kind === "PROGRAMAR_PRECIO") {
        const precioMinor = cmd.kind === "CREAR" ? cmd.producto.precioMinor : cmd.precioMinor;
        const problema = priceProblem({ amountMinor: BigInt(precioMinor), effectiveFrom: desde }, ahora);
        if (problema) {
          const campo = cmd.kind === "CREAR" ? ["producto", "precioMinor"] : ["precioMinor"];
          return invalido("El precio no se guardó: hay datos que corregir.", problema === "EN_EL_PASADO" ? ["dia"] : campo, MENSAJE_PRECIO[problema]);
        }
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CatalogoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const quien = await nombreDe(tx, ctx);
          const asiento = await guardar(tx, ctx, cmd, quien.nombre, ahora, desde);
          if ("ok" in asiento) return asiento;
          if (asiento.cambio) await auditar(tx, ctx, asiento.cambio);
          return cargar(tx);
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accionDe(cmd), reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          // Dos personas a la vez: el mismo nombre, o dos precios del mismo producto en el mismo instante.
          return cmd.kind === "PROGRAMAR_PRECIO"
            ? { ok: false, motivo: "CONFLICTO", mensaje: "Se programó otro precio de ese producto en el mismo instante. Vuelve a intentarlo." }
            : invalido("Ya hay un producto con ese nombre.", cmd.kind === "CREAR" ? ["producto", "nombre"] : ["nombre"], "Nombre repetido");
        }
        throw e;
      }
    },
  };
}

function accionDe(cmd: ProductoCommand): AccionAuditada {
  switch (cmd.kind) {
    case "CREAR":
      return "producto.crear";
    case "EDITAR":
      return "producto.editar";
    case "ACTIVAR":
      return cmd.activo ? "producto.activar" : "producto.apartar";
    case "PROGRAMAR_PRECIO":
      return "precio.programar";
  }
}

/** Lo que dice la auditoría de un producto: sin identificadores de la base, legible. */
const fotoDe = (p: Pick<Product, "name" | "category" | "taxCode" | "tracksStock" | "active">) => ({
  nombre: p.name,
  categoria: p.category,
  taxCode: p.taxCode,
  controlaStock: p.tracksStock,
  activo: p.active,
});

/**
 * Escribe el cambio y devuelve su asiento de auditoría (`cambio: null` si no había nada que
 * cambiar), o el rechazo si el catálogo no lo admite.
 */
async function guardar(
  tx: Transaccion,
  ctx: Contexto,
  cmd: ProductoCommand,
  quien: string,
  ahora: number,
  desde: number,
): Promise<{ cambio: Asiento | null } | Rechazo> {
  const action = accionDe(cmd);
  switch (cmd.kind) {
    case "CREAR": {
      const p = cmd.producto;
      const choca = nameClash(await productosDe(tx), p.nombre);
      if (choca) return invalido("Ya hay un producto con ese nombre.", ["producto", "nombre"], mensajeDeChoque(choca));
      const fila = await tx.product.create({
        data: {
          tenantId: ctx.tenantId,
          name: p.nombre,
          category: p.categoria,
          taxCode: p.taxCode,
          tracksStock: p.controlaStock,
          active: true,
          createdAt: new Date(ahora),
          createdBy: ctx.quien?.userId ?? null,
          createdByName: quien,
        },
      });
      await tx.productPrice.create({
        data: {
          tenantId: ctx.tenantId,
          productId: fila.id,
          amountMinor: BigInt(p.precioMinor),
          effectiveFrom: new Date(ahora),
          scheduledAt: new Date(ahora),
          scheduledBy: ctx.quien?.userId ?? null,
          scheduledByName: quien,
        },
      });
      return { cambio: { action, entityType: "product", entityId: fila.id, after: { ...fotoDe(fila), precio: { minor: p.precioMinor, currency: "USD" } } } };
    }
    case "EDITAR": {
      const antes = await tx.product.findUnique({ where: { id: cmd.productId } });
      if (!antes) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
      const choca = nameClash(await productosDe(tx), cmd.nombre, cmd.productId);
      if (choca) return invalido("Ya hay otro producto con ese nombre.", ["nombre"], mensajeDeChoque(choca));
      const datos = { name: cmd.nombre, category: cmd.categoria, taxCode: cmd.taxCode, tracksStock: cmd.controlaStock };
      if (antes.name === datos.name && antes.category === datos.category && antes.taxCode === datos.taxCode && antes.tracksStock === datos.tracksStock) {
        return invalido("No cambia nada.", ["nombre"], "El producto ya está así");
      }
      const fila = await tx.product.update({ where: { id: cmd.productId }, data: datos });
      return { cambio: { action, entityType: "product", entityId: fila.id, before: fotoDe(antes), after: fotoDe(fila) } };
    }
    case "ACTIVAR": {
      const antes = await tx.product.findUnique({ where: { id: cmd.productId } });
      if (!antes) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
      if (antes.active === cmd.activo) return { cambio: null }; // ya estaba así: nada que guardar ni auditar
      const fila = await tx.product.update({ where: { id: cmd.productId }, data: { active: cmd.activo } });
      return { cambio: { action, entityType: "product", entityId: fila.id, before: { nombre: antes.name, activo: antes.active }, after: { nombre: fila.name, activo: fila.active } } };
    }
    case "PROGRAMAR_PRECIO": {
      const producto = await tx.product.findUnique({ where: { id: cmd.productId } });
      if (!producto) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
      const previos = (await tx.productPrice.findMany({ where: { productId: cmd.productId } })).map(programadoDeFila);
      const nuevo: ScheduledPrice = { id: "nuevo", productId: cmd.productId, amountMinor: BigInt(cmd.precioMinor), effectiveFrom: desde, scheduledAt: ahora };
      // Lo que no cambia el calendario no se guarda: ese día ya rige ese precio.
      if (!changesTimeline(previos, nuevo)) return invalido("No cambia nada: ese día ya rige ese precio.", ["precioMinor"], "Ese día ya rige ese precio");
      const fila = await tx.productPrice.create({
        data: {
          tenantId: ctx.tenantId,
          productId: cmd.productId,
          amountMinor: nuevo.amountMinor,
          effectiveFrom: new Date(desde),
          scheduledAt: new Date(ahora),
          scheduledBy: ctx.quien?.userId ?? null,
          scheduledByName: quien,
        },
      });
      // §7.4: el precio que regía ese día y el que regirá.
      const previo = periodAt(priceTimeline(previos), cmd.productId, desde);
      return {
        cambio: {
          action,
          entityType: "product_price",
          entityId: fila.id,
          before: previo ? { producto: producto.name, precio: { minor: String(previo.amountMinor), currency: "USD" }, desde: new Date(previo.effectiveFrom).toISOString() } : null,
          after: { producto: producto.name, precio: { minor: cmd.precioMinor, currency: "USD" }, desde: new Date(desde).toISOString(), dia: cmd.dia },
        },
      };
    }
  }
}

/** Los productos del local, en la forma que compara el dominio. */
function productosDe(tx: Transaccion) {
  return tx.product.findMany({ select: { id: true, name: true, category: true, active: true } });
}

const mensajeDeChoque = (p: { name: string; active: boolean }) =>
  p.active ? `Ya existe «${p.name}»` : `Ya existe «${p.name}», apartado: vuelve a ponerlo a la venta`;

/** La fila, como la entiende el dominio. */
function programadoDeFila(f: ProductPrice): ScheduledPrice {
  return { id: f.id, productId: f.productId, amountMinor: f.amountMinor, effectiveFrom: f.effectiveFrom.getTime(), scheduledAt: f.scheduledAt.getTime() };
}

/** El calendario resuelto de un producto, en la forma del contrato, con quién programó cada tramo. */
function tramosDe(filas: readonly ProductPrice[]) {
  const porId = new Map(filas.map((f) => [f.id, f]));
  return priceTimeline(filas.map(programadoDeFila)).map((p) => {
    const f = porId.get(p.id)!;
    return {
      id: p.id,
      precio: { minor: String(p.amountMinor), currency: "USD" as const },
      desde: new Date(p.effectiveFrom).toISOString(),
      hasta: p.effectiveTo === null ? null : new Date(p.effectiveTo).toISOString(),
      programadoEl: f.scheduledAt.toISOString(),
      programadoPor: f.scheduledByName,
    };
  });
}
