/**
 * La semilla del local — B7-2, M-24.
 *
 * Descargar: la configuración del local en un archivo (`SemillaSchema`): ajustes, tarifas y paquetes,
 * categorías, la carta con el precio que rige, el plano y los cumpleaños. Cargar: el local que la
 * recibe solo AÑADE lo que le falta (un tarifario si no tiene ninguno, los productos que no tiene por
 * nombre, las categorías que no están en su lista…) y nunca pisa lo que ya tiene. Antes de cargar se
 * revisa: el mismo cálculo dice qué entra y qué ya está, sin escribir nada.
 *
 * Cada parte entra por el mismo camino que si se tecleara (el tarifario, el plano y los cumpleaños por
 * sus casos de uso; categorías y productos juntos, en una transacción), con sus asientos, y al final un
 * resumen `semilla.cargar`. Si una parte falla, lo de antes queda (cada parte es entera) y volver a
 * cargar la misma semilla añade solo lo que siga faltando. Es del catálogo: `catalogo.modificar`, con
 * elevación.
 */
import { randomUUID } from "node:crypto";
import {
  CargarSemillaCommandSchema,
  InformeDeSemillaSchema,
  SemillaSchema,
  problemasDe,
  type InformeDeSemillaDto,
  type ParteDeSemilla,
  type ProductoDeSemillaDto,
  type Rechazo,
  type Resultado,
  type SemillaDto,
} from "@l2/contracts";
import { findCategory, nameKey } from "@l2/domain-inventory";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { asegurarCategoria } from "../inventario/lista-de-categorias.ts";
import { cargarCatalogo, crearProductoEn } from "../inventario/productos.ts";
import type { CasosAjustes } from "./ajustes.ts";
import type { CasosTarifario } from "../park/tarifario.ts";
import type { CasosPlano } from "../restaurante/plano.ts";
import type { CasosEventos } from "../park/eventos.ts";

export interface CasosSemilla {
  /** La semilla de este local, para descargarla. */
  exportar(ctx: Contexto, ahora?: number): Promise<Resultado<SemillaDto>>;
  /** Revisa (`cargar: false`) o carga (`cargar: true`) una semilla (`CargarSemillaCommandSchema`). */
  cargar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<InformeDeSemillaDto>>;
}

type Dependencias = Readonly<{ ajustes: CasosAjustes; tarifario: CasosTarifario; plano: CasosPlano; eventos: CasosEventos }>;

type Parte = InformeDeSemillaDto["partes"][number];

/** Lo que la semilla añadiría a este local, parte por parte. */
type Plan = Readonly<{
  partes: Parte[];
  categorias: string[];
  productos: (ProductoDeSemillaDto & { sinCodigo: boolean })[];
}>;

/** El precio que rige en `ahora` de un calendario de tramos; sin tramo vigente, el último programado. */
function precioVigente(tramos: readonly { precio: { minor: string }; desde: string; hasta: string | null }[], ahora: number): string | null {
  const vigente = tramos.find((t) => Date.parse(t.desde) <= ahora && (t.hasta === null || Date.parse(t.hasta) > ahora));
  return (vigente ?? tramos.at(-1))?.precio.minor ?? null;
}

const parte = (p: ParteDeSemilla, estado: Parte["estado"], detalle: string, cuantos: number | null = null, avisos: string[] = []): Parte => ({
  parte: p,
  estado,
  detalle,
  cuantos,
  avisos,
});

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function casosSemilla(base: Base, deps: Dependencias): CasosSemilla {
  /** Qué entra y qué ya está. Lee el local en una transacción; no escribe. */
  async function planear(ctx: Contexto, s: SemillaDto): Promise<Plan> {
    const ajustes = await deps.ajustes.leer(ctx);
    const tarifario = await deps.tarifario.leer(ctx);
    const plano = await deps.plano.leer(ctx);
    const cumpleanos = await deps.eventos.leerCatalogo(ctx);
    const catalogo = await base.conTenant(ctx.tenantId, (tx) => cargarCatalogo(tx, ctx.branchId));

    const partes: Parte[] = [];
    partes.push(
      s.ajustes === null
        ? parte("AJUSTES", "NO_TRAE", "La semilla no trae ajustes publicados.")
        : ajustes.version > 0
          ? parte("AJUSTES", "YA_ESTA", `Este local ya publicó sus ajustes (versión ${ajustes.version}): no se tocan.`)
          : parte("AJUSTES", "CARGA", `Nombre «${s.ajustes.nombre}», ${s.ajustes.preciosConIva ? "precios con el IVA incluido" : "IVA aparte"}, hora en ${s.ajustes.formatoHora === "12h" ? "12 horas" : "24 horas"}.`),
    );
    partes.push(
      s.tarifario === null
        ? parte("TARIFARIO", "NO_TRAE", "La semilla no trae tarifas.")
        : tarifario
          ? parte("TARIFARIO", "YA_ESTA", `Este local ya tiene sus tarifas (versión ${tarifario.version}): no se tocan.`)
          : parte("TARIFARIO", "CARGA", `${plural(s.tarifario.packages.length, "paquete", "paquetes")} y aforo de ${s.tarifario.policy.capacityLimit}.`, s.tarifario.packages.length),
    );

    // Las categorías que faltan: las de la semilla y las de sus productos, sin repetir.
    const categorias: string[] = [];
    const lista = catalogo.categorias.map((c) => ({ name: c.nombre }));
    for (const nombre of [...s.categorias, ...s.productos.map((p) => p.categoria)]) {
      if (findCategory(lista, nombre) || findCategory(categorias.map((c) => ({ name: c })), nombre)) continue;
      categorias.push(nombre.trim().replace(/\s+/g, " "));
    }
    partes.push(
      s.categorias.length === 0 && categorias.length === 0
        ? parte("CATEGORIAS", "NO_TRAE", "La semilla no trae categorías.")
        : categorias.length === 0
          ? parte("CATEGORIAS", "YA_ESTA", "Las categorías de la semilla ya están en la lista.")
          : parte("CATEGORIAS", "CARGA", categorias.join(", "), categorias.length),
    );

    // Los productos que este local no tiene por nombre (apartados incluidos: se vuelven a poner a la venta, no se duplican).
    const nombres = new Set(catalogo.productos.map((p) => nameKey(p.nombre)));
    const codigos = new Map(catalogo.productos.flatMap((p) => (p.codigoBarras ? [[p.codigoBarras, p.nombre] as const] : [])));
    const productos: Plan["productos"] = [];
    const avisos: string[] = [];
    for (const p of s.productos) {
      if (nombres.has(nameKey(p.nombre))) continue;
      const deOtro = p.codigoBarras ? codigos.get(p.codigoBarras) : undefined;
      if (deOtro) avisos.push(`«${p.nombre}» entra sin su código de barras: aquí ya es de «${deOtro}».`);
      productos.push({ ...p, sinCodigo: deOtro !== undefined });
      nombres.add(nameKey(p.nombre));
    }
    const yaEstan = s.productos.length - productos.length;
    partes.push(
      s.productos.length === 0
        ? parte("PRODUCTOS", "NO_TRAE", "La semilla no trae productos.")
        : productos.length === 0
          ? parte("PRODUCTOS", "YA_ESTA", `Los ${s.productos.length} productos de la semilla ya están en este local.`)
          : parte(
              "PRODUCTOS",
              "CARGA",
              `${plural(productos.length, "producto", "productos")} a la venta con su precio${yaEstan > 0 ? `; ${plural(yaEstan, "ya estaba", "ya estaban")}` : ""}. Sin existencias: el inventario se carga en el local.`,
              productos.length,
              avisos,
            ),
    );

    const mesas = s.plano?.tables.filter((t) => !t.retiredAt).length ?? 0;
    partes.push(
      s.plano === null
        ? parte("PLANO", "NO_TRAE", "La semilla no trae plano.")
        : plano.plano
          ? parte("PLANO", "YA_ESTA", `Este local ya dibujó su plano (versión ${plano.version}): no se toca.`)
          : parte("PLANO", "CARGA", `${plural(mesas, "mesa", "mesas")}.`, mesas),
    );

    if (s.cumpleanos === null) partes.push(parte("CUMPLEANOS", "NO_TRAE", "La semilla no trae paquetes de cumpleaños."));
    else if (cumpleanos.catalogo) partes.push(parte("CUMPLEANOS", "YA_ESTA", `Este local ya tiene sus paquetes de cumpleaños (versión ${cumpleanos.version}): no se tocan.`));
    else {
      const habra = new Set([...catalogo.productos.filter((p) => p.activo).map((p) => nameKey(p.nombre)), ...productos.map((p) => nameKey(p.nombre))]);
      const faltan = [...new Set(s.cumpleanos.paquetes.flatMap((p) => p.incluye.map((x) => x.producto)).filter((n) => !habra.has(nameKey(n))))];
      partes.push(
        parte(
          "CUMPLEANOS",
          "CARGA",
          `${plural(s.cumpleanos.paquetes.length, "paquete", "paquetes")}, anticipo del ${s.cumpleanos.anticipoBps / 100} %.`,
          s.cumpleanos.paquetes.length,
          faltan.map((n) => `«${n}» no está a la venta aquí: los paquetes que lo incluyen entran sin él.`),
        ),
      );
    }
    return { partes, categorias, productos };
  }

  /** Categorías y productos que faltan, en una transacción, con sus asientos. Devuelve los avisos de lo que se saltó. */
  async function cargarCatalogoDeSemilla(tx: Transaccion, ctx: Contexto, plan: Plan, ahora: number): Promise<string[]> {
    const quien = (await nombreDe(tx, ctx)).nombre;
    for (const c of plan.categorias) await asegurarCategoria(tx, ctx, c, quien, ahora);
    const avisos: string[] = [];
    for (const p of plan.productos) {
      const creado = await crearProductoEn(
        tx,
        ctx,
        {
          nombre: p.nombre,
          categoria: p.categoria,
          taxCode: p.taxCode,
          tipo: p.tipo,
          precioMinor: p.precioMinor,
          ...(p.codigoBarras && !p.sinCodigo ? { codigoBarras: p.codigoBarras } : {}),
          ...(p.presentacion ? { presentacion: p.presentacion } : {}),
          enCarta: p.enCarta,
        },
        quien,
        ahora,
        ["productos"],
      );
      // Lo que no vale se salta antes de escribir nada suyo: el resto entra.
      if ("ok" in creado) {
        avisos.push(`«${p.nombre}» no entró: ${creado.problemas?.[0]?.message ?? creado.mensaje}`);
        continue;
      }
      await auditar(tx, ctx, creado.asiento);
      if (p.minimo !== null && creado.fila.tracksStock) await tx.product.update({ where: { id: creado.fila.id }, data: { minStock: p.minimo } });
    }
    return avisos;
  }

  return {
    async exportar(ctx, ahora = Date.now()) {
      const permiso = await base.conTenant(ctx.tenantId, (tx) => exigirPermiso(tx, ctx, "catalogo.modificar"));
      if (permiso) return permiso;
      const ajustes = await deps.ajustes.leer(ctx);
      const tarifario = await deps.tarifario.leer(ctx);
      const plano = await deps.plano.leer(ctx);
      const cumpleanos = await deps.eventos.leerCatalogo(ctx);
      const catalogo = await base.conTenant(ctx.tenantId, (tx) => cargarCatalogo(tx, ctx.branchId));
      const nombreDeId = new Map(catalogo.productos.map((p) => [p.id, p.nombre]));

      const productos: ProductoDeSemillaDto[] = [];
      for (const p of catalogo.productos) {
        const precio = precioVigente(p.precios, ahora);
        // Lo apartado no viaja; un producto sin precio no se podría dar de alta.
        if (!p.activo || precio === null || p.taxCode === "REDUCIDA") continue;
        productos.push({
          nombre: p.nombre,
          categoria: p.categoria,
          tipo: p.tipo,
          taxCode: p.taxCode,
          precioMinor: precio,
          presentacion: p.presentacion,
          codigoBarras: p.codigoBarras,
          enCarta: p.enCarta,
          minimo: p.minimo,
        });
      }
      const semilla = SemillaSchema.parse({
        formato: "l2-semilla",
        version: 1,
        exportadaEn: new Date(ahora).toISOString(),
        local: ajustes.ajustes.nombre,
        ajustes: ajustes.version > 0 ? ajustes.ajustes : null,
        tarifario: tarifario?.tarifario ?? null,
        categorias: catalogo.categorias.map((c) => c.nombre),
        productos,
        plano: plano.plano,
        cumpleanos: cumpleanos.catalogo
          ? {
              anticipoBps: cumpleanos.catalogo.anticipoBps,
              paquetes: cumpleanos.catalogo.paquetes
                .filter((p) => p.active)
                .map(({ id: _, incluye, ...p }) => ({
                  ...p,
                  incluye: incluye.flatMap((x) => {
                    const nombre = nombreDeId.get(x.productId);
                    return nombre ? [{ producto: nombre, cantidad: x.quantity }] : [];
                  }),
                })),
            }
          : null,
      });
      return { ok: true, valor: semilla };
    },

    async cargar(ctx, entrada, ahora = Date.now()) {
      const cmd = CargarSemillaCommandSchema.safeParse(entrada);
      if (!cmd.success) return { ok: false, motivo: "INVALIDO", mensaje: "No llegó ninguna semilla.", problemas: problemasDe(cmd.error) };
      const v = SemillaSchema.safeParse(cmd.data.semilla);
      if (!v.success) {
        const primero = v.error.issues[0];
        return {
          ok: false,
          motivo: "INVALIDO",
          mensaje: primero?.path[0] === "formato" || primero?.path[0] === "version" ? primero.message : "Ese archivo no es una semilla que se pueda cargar: está incompleto o lo cambiaron a mano.",
          problemas: problemasDe(v.error),
        };
      }
      const s = v.data;
      const permiso = await base.conTenant(ctx.tenantId, (tx) => exigirPermiso(tx, ctx, "catalogo.modificar"));
      if (permiso) return permiso;

      const plan = await planear(ctx, s);
      const informe = (cargada: boolean, partes: Parte[]): Resultado<InformeDeSemillaDto> => ({
        ok: true,
        valor: InformeDeSemillaSchema.parse({ local: s.local, exportadaEn: s.exportadaEn, cargada, partes }),
      });
      if (!cmd.data.cargar) return informe(false, plan.partes);
      if (!plan.partes.some((p) => p.estado === "CARGA")) return informe(true, plan.partes);

      const carga = (p: ParteDeSemilla) => plan.partes.find((x) => x.parte === p)?.estado === "CARGA";
      const fallo = (p: string, r: Rechazo): Rechazo => ({ ...r, mensaje: `${p}: ${r.mensaje} Lo anterior sí quedó; vuelve a cargar la semilla para lo que falta.` });

      if (carga("AJUSTES") && s.ajustes) {
        const r = await deps.ajustes.publicar(ctx, { versionBase: 0, ajustes: s.ajustes });
        if (!r.ok) return fallo("Los ajustes no se cargaron", r);
      }
      if (carga("TARIFARIO") && s.tarifario) {
        const r = await deps.tarifario.publicar(ctx, s.tarifario);
        if (!r.ok) return fallo("Las tarifas no se cargaron", r);
      }
      let avisosDeProductos: string[] = [];
      if (carga("CATEGORIAS") || carga("PRODUCTOS")) {
        avisosDeProductos = await base.conTenant(ctx.tenantId, (tx) => cargarCatalogoDeSemilla(tx, ctx, plan, ahora));
      }
      if (carga("PLANO") && s.plano) {
        const r = await deps.plano.publicar(ctx, { plano: s.plano, sobre: null }, ahora);
        if (!r.ok) return fallo("El plano no se cargó", r);
      }
      if (carga("CUMPLEANOS") && s.cumpleanos) {
        const idDe = new Map((await base.conTenant(ctx.tenantId, (tx) => cargarCatalogo(tx, ctx.branchId))).productos.filter((p) => p.activo).map((p) => [nameKey(p.nombre), p.id]));
        const paquetes = s.cumpleanos.paquetes.map((p) => ({
          ...p,
          id: randomUUID(),
          incluye: p.incluye.flatMap((x) => {
            const productId = idDe.get(nameKey(x.producto));
            return productId ? [{ productId, quantity: x.cantidad }] : [];
          }),
        }));
        const r = await deps.eventos.publicarCatalogo(ctx, { sobre: null, catalogo: { anticipoBps: s.cumpleanos.anticipoBps, paquetes } }, ahora);
        if (!r.ok) return fallo("Los cumpleaños no se cargaron", r);
      }

      const partes = plan.partes.map((p) => (p.parte === "PRODUCTOS" ? { ...p, avisos: [...p.avisos, ...avisosDeProductos] } : p));
      await base.conTenant(ctx.tenantId, (tx) =>
        auditar(tx, ctx, {
          action: "semilla.cargar",
          entityType: "branch",
          entityId: ctx.branchId,
          after: {
            de: s.local,
            exportadaEn: s.exportadaEn,
            partes: Object.fromEntries(partes.map((p) => [p.parte, p.estado === "CARGA" ? (p.cuantos ?? "sí") : p.estado])),
          },
        }),
      );
      return informe(true, partes);
    },
  };
}
