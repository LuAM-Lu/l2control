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
  FijarMinimoCommandSchema,
  ProductoCommandSchema,
  problemasDe,
  type CatalogoDto,
  type ProductoCommand,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import {
  averageUnitCostMinor,
  barcodeProblem,
  changesTimeline,
  kindTracksStock,
  nextSku,
  skuPrefix,
  type BarcodeProblem,
  type ProductKind,
  nameClash,
  packCostOf,
  periodAt,
  priceProblem,
  priceTimeline,
  type PriceProblem,
  type ScheduledPrice,
  type StockValue,
} from "@l2/domain-inventory";
import { errorDeBase, type Base, type Product, type ProductPrice, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo, type AccionAuditada, type Asiento } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { zonaDe } from "../sucursal/ajustes.ts";
import { existenciasDe } from "./existencias.ts";
import { asegurarCategoria, categoriaComoEnLista, categoriasDe } from "./lista-de-categorias.ts";

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
  /** Fija o quita el stock mínimo de un producto (`FijarMinimoCommandSchema`, B9-5). */
  fijarMinimo(ctx: Contexto, entrada: unknown): Promise<Resultado<CatalogoDto>>;
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

/**
 * El catálogo del local como lo lee toda pantalla: los productos con sus precios, su existencia y su
 * costo en `branchId`, y la lista de categorías (T-10).
 */
export async function cargarCatalogo(tx: Transaccion, branchId: string): Promise<CatalogoDto> {
    const productos = await tx.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
    const precios = await tx.productPrice.findMany({ orderBy: { scheduledAt: "asc" } });
    const existencias = await existenciasDe(tx, branchId);
    // Cómo venía el bulto de la última entrada de cada producto y lo que costó: la pantalla de entradas
    // lo propone (T-10).
    const ultimas = await tx.stockMovement.findMany({
      where: { branchId, kind: "ENTRADA" },
      // En el mismo instante, la registrada después (los id crecen con el orden de creación).
      orderBy: [{ at: "desc" }, { id: "desc" }],
      distinct: ["productId"],
      select: { productId: true, packSize: true, packs: true, valueMinor: true },
    });
    const bulto = new Map(ultimas.map((u) => [u.productId, u.packSize]));
    const costoBulto = new Map(ultimas.map((u) => [u.productId, u.packs === null ? null : packCostOf({ packs: u.packs, valueMinor: u.valueMinor })]));
    const categorias = await categoriasDe(tx);
    // Se revalida al salir: lo que no cumple el contrato no llega a la caja (fail-closed).
    return CatalogoSchema.parse({
      productos: productos.map((p) => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category,
        taxCode: p.taxCode,
        tipo: p.kind,
        controlaStock: p.tracksStock,
        sku: p.sku,
        codigoBarras: p.barcode,
        presentacion: p.presentation,
        activo: p.active,
        enCarta: p.onMenu,
        precios: tramosDe(precios.filter((x) => x.productId === p.id)),
        existencia: p.tracksStock ? (existencias.get(p.id)?.quantity ?? 0) : null,
        costoPromedio: costoDe(p.tracksStock ? existencias.get(p.id) : undefined),
        ultimoBulto: bulto.get(p.id) ?? null,
        ultimoCostoBulto: costoDeBulto(costoBulto.get(p.id) ?? null),
        minimo: p.tracksStock ? p.minStock : null,
        valor: p.tracksStock ? { minor: String(existencias.get(p.id)?.valueMinor ?? 0n), currency: "USD" } : null,
      })),
      zonaHoraria: await zonaDe(tx, branchId),
      diasPorAdelantado: DIAS_POR_ADELANTADO_PRECIOS,
      categorias,
    });
}

export function casosProductos(base: Base): CasosProductos {
  const cargar = cargarCatalogo;

  return {
    async leer(ctx) {
      return base.conTenant(ctx.tenantId, (tx) => cargar(tx, ctx.branchId));
    },

    async fijarMinimo(ctx, entrada) {
      const v = FijarMinimoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El mínimo no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CatalogoDto | Rechazo> => {
        // Lo fija quien recibe la mercancía: no cambia lo que se cobra, no pide elevación.
        const rechazo = await exigirPermiso(tx, ctx, "inventario.entrada");
        if (rechazo) return rechazo;
        const p = await tx.product.findUnique({ where: { id: cmd.productId } });
        if (!p) return invalido("Ese producto no existe en este local.", ["productId"], "Producto desconocido");
        if (!p.tracksStock) return invalido(`${p.name} no lleva existencia: no tiene mínimo.`, ["productId"], "SIN_CONTROL_DE_STOCK");
        if (p.minStock !== cmd.minimo) {
          await tx.product.update({ where: { id: p.id }, data: { minStock: cmd.minimo } });
          await auditar(tx, ctx, { action: "producto.minimo", entityType: "product", entityId: p.id, before: { nombre: p.name, minimo: p.minStock }, after: { nombre: p.name, minimo: cmd.minimo } });
        }
        return cargar(tx, ctx.branchId);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "producto.minimo", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async aplicar(ctx, entrada, ahora = Date.now()) {
      const v = ProductoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cambio no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      // El precio se comprueba antes de abrir la transacción: solo depende de la zona del local.
      let desde = ahora;
      if (cmd.kind === "PROGRAMAR_PRECIO") {
        const zona = await base.conTenant(ctx.tenantId, (tx) => zonaDe(tx, ctx.branchId));
        const hoy = calendarDay(new Date(ahora).toISOString(), zona);
        if (cmd.dia < hoy) return invalido("Un precio no se programa hacia atrás: lo ya vendido se queda con el que tenía.", ["dia"], "Día pasado");
        if (cmd.dia > addDays(hoy, DIAS_POR_ADELANTADO_PRECIOS)) {
          return invalido(`Solo se programa con hasta ${DIAS_POR_ADELANTADO_PRECIOS} días de adelanto.`, ["dia"], "Día fuera de rango");
        }
        // Hoy, desde ya: lo vendido esta mañana se queda como se vendió. Otro día, desde su comienzo.
        desde = cmd.dia === hoy ? ahora : startOfDay(cmd.dia, zona);
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
          // Precios y carta son de `catalogo.modificar` (con elevación); el alta, la ficha y apartar, del inventario
          // (T-13), que se puede dar por rol o por persona sin confirmar identidad.
          const rechazo = await exigirPermiso(tx, ctx, cmd.kind === "PROGRAMAR_PRECIO" || cmd.kind === "EN_CARTA" ? "catalogo.modificar" : "inventario.catalogo");
          if (rechazo) return rechazo;
          const quien = await nombreDe(tx, ctx);
          const asiento = await guardar(tx, ctx, cmd, quien.nombre, ahora, desde);
          if ("ok" in asiento) return asiento;
          if (asiento.cambio) await auditar(tx, ctx, asiento.cambio);
          return cargar(tx, ctx.branchId);
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
            : invalido("Ya hay un producto con ese nombre o ese código de barras.", cmd.kind === "CREAR" ? ["producto", "nombre"] : ["nombre"], "Nombre o código repetido");
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
    case "EN_CARTA":
      return "producto.carta";
    case "PROGRAMAR_PRECIO":
      return "precio.programar";
  }
}

/** Lo que dice la auditoría de un producto: sin identificadores de la base, legible. */
const fotoDe = (p: Pick<Product, "name" | "category" | "taxCode" | "kind" | "sku" | "barcode" | "presentation" | "active">) => ({
  nombre: p.name,
  sku: p.sku,
  categoria: p.category,
  taxCode: p.taxCode,
  tipo: p.kind,
  codigoBarras: p.barcode,
  presentacion: p.presentation,
  activo: p.active,
});

const MENSAJE_CODIGO: Record<BarcodeProblem, string> = {
  FORMATO: "De 4 a 32 dígitos, letras o guiones",
  DIGITO_DE_CONTROL: "El dígito de control no cuadra: vuelve a leerlo",
};

/** Lo que pide el alta de un producto, venga de Productos o de una entrada de mercancía (B9-6). */
export type ProductoAlta = Readonly<{
  nombre: string;
  categoria: string;
  taxCode: string;
  tipo: ProductKind;
  precioMinor: string;
  codigoBarras?: string | undefined;
  presentacion?: string | undefined;
  /** Si el mesero lo ofrece (B6-1). Sin decirlo: sí, salvo un servicio. */
  enCarta?: boolean | undefined;
}>;

/**
 * Que un código de barras sirva: bien leído y de nadie más (salvo `exceptoId`, el propio producto).
 * `ruta` dice dónde señalarlo.
 */
async function problemaDeCodigo(tx: Transaccion, codigo: string, ruta: (string | number)[], exceptoId?: string): Promise<Rechazo | null> {
  const problema = barcodeProblem(codigo);
  if (problema) return invalido("Ese código de barras no sirve.", ruta, MENSAJE_CODIGO[problema]);
  const otro = await tx.product.findFirst({ where: { barcode: codigo, ...(exceptoId ? { id: { not: exceptoId } } : {}) }, select: { name: true } });
  return otro ? invalido(`Ese código ya es de «${otro.name}».`, ruta, `Ya es de «${otro.name}»`) : null;
}

/**
 * Da de alta un producto con su primer precio, rigiendo desde `ahora`, y su SKU (prefijo de la
 * categoría y el siguiente correlativo, con un candado para que dos altas a la vez no tomen el mismo).
 * Devuelve la fila y su asiento, o el rechazo. `ruta` es dónde está el producto en el mando.
 */
export async function crearProductoEn(
  tx: Transaccion,
  ctx: Contexto,
  p: ProductoAlta,
  quien: string,
  ahora: number,
  ruta: (string | number)[],
): Promise<{ fila: Product; asiento: Asiento } | Rechazo> {
  const choca = nameClash(await productosDe(tx), p.nombre);
  if (choca) return invalido("Ya hay un producto con ese nombre.", [...ruta, "nombre"], mensajeDeChoque(choca));
  if (p.codigoBarras !== undefined) {
    if (!kindTracksStock(p.tipo)) return invalido("Solo un producto que se cuenta lleva código de barras.", [...ruta, "codigoBarras"], "Sin código para este tipo");
    const malo = await problemaDeCodigo(tx, p.codigoBarras, [...ruta, "codigoBarras"]);
    if (malo) return malo;
  }
  // La categoría, como está en la lista; si es nueva, entra en ella (T-10).
  const categoria = await asegurarCategoria(tx, ctx, p.categoria, quien, ahora);
  const prefijo = skuPrefix(categoria);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sku:${ctx.tenantId}`}, 0))::text AS candado`;
  const existentes = await tx.product.findMany({ where: { sku: { startsWith: `${prefijo}-` } }, select: { sku: true } });
  const fila = await tx.product.create({
    data: {
      tenantId: ctx.tenantId,
      name: p.nombre,
      category: categoria,
      taxCode: p.taxCode,
      kind: p.tipo,
      tracksStock: kindTracksStock(p.tipo),
      sku: nextSku(prefijo, existentes.map((x) => x.sku)),
      barcode: p.codigoBarras ?? null,
      presentation: p.presentacion ?? null,
      active: true,
      onMenu: p.enCarta ?? p.tipo !== "SERVICIO",
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
  return { fila, asiento: { action: "producto.crear", entityType: "product", entityId: fila.id, after: { ...fotoDe(fila), precio: { minor: p.precioMinor, currency: "USD" } } } };
}

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
      const creado = await crearProductoEn(tx, ctx, cmd.producto, quien, ahora, ["producto"]);
      return "ok" in creado ? creado : { cambio: creado.asiento };
    }
    case "EDITAR": {
      const antes = await tx.product.findUnique({ where: { id: cmd.productId } });
      if (!antes) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
      const choca = nameClash(await productosDe(tx), cmd.nombre, cmd.productId);
      if (choca) return invalido("Ya hay otro producto con ese nombre.", ["nombre"], mensajeDeChoque(choca));
      const datos = {
        name: cmd.nombre,
        // La de la lista (sin contar mayúsculas ni acentos); si es nueva, entra en ella al guardar (T-10).
        category: await categoriaComoEnLista(tx, cmd.categoria),
        taxCode: cmd.taxCode,
        kind: cmd.tipo,
        tracksStock: kindTracksStock(cmd.tipo),
        barcode: cmd.codigoBarras,
        presentation: cmd.presentacion,
      };
      if (
        antes.name === datos.name &&
        antes.category === datos.category &&
        antes.taxCode === datos.taxCode &&
        antes.kind === datos.kind &&
        antes.barcode === datos.barcode &&
        antes.presentation === datos.presentation
      ) {
        return invalido("No cambia nada.", ["nombre"], "El producto ya está así");
      }
      if (datos.barcode !== null) {
        if (!datos.tracksStock) return invalido("Solo un producto que se cuenta lleva código de barras.", ["codigoBarras"], "Sin código para este tipo");
        if (datos.barcode !== antes.barcode) {
          const malo = await problemaDeCodigo(tx, datos.barcode, ["codigoBarras"], antes.id);
          if (malo) return malo;
        }
      }
      // Lo que tiene existencia no deja de contarse sin más: lo que hay se saca o se cuenta antes.
      if (antes.tracksStock && !datos.tracksStock) {
        const hay = (await existenciasDe(tx, ctx.branchId, [antes.id])).get(antes.id)?.quantity ?? 0;
        if (hay !== 0) return invalido(`${antes.name} tiene ${hay} en stock: sácalas o cuéntalas antes de cambiar su tipo.`, ["tipo"], "Tiene existencia");
      }
      if (datos.category !== antes.category) await asegurarCategoria(tx, ctx, datos.category, quien, ahora);
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
    case "EN_CARTA": {
      const antes = await tx.product.findUnique({ where: { id: cmd.productId } });
      if (!antes) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
      if (antes.onMenu === cmd.enCarta) return { cambio: null };
      const fila = await tx.product.update({ where: { id: cmd.productId }, data: { onMenu: cmd.enCarta } });
      return { cambio: { action, entityType: "product", entityId: fila.id, before: { nombre: antes.name, enCarta: antes.onMenu }, after: { nombre: fila.name, enCarta: fila.onMenu } } };
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

/** Lo que costó el último bulto, en la forma del contrato, o `null`. */
function costoDeBulto(minor: bigint | null) {
  return minor === null ? null : { minor: String(minor), currency: "USD" as const };
}

/** El costo promedio de una unidad para enseñarlo (B9-3), o `null` sin existencia. */
function costoDe(v: StockValue | undefined) {
  const minor = v ? averageUnitCostMinor(v) : null;
  return minor === null ? null : { minor: String(minor), currency: "USD" as const };
}
