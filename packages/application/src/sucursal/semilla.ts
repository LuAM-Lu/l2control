/**
 * La semilla del local — B7-2, M-24; con casillas y lo que faltaba para la corrida limpia, B7-7 (M-29).
 *
 * Descargar: la configuración del local en un archivo (`SemillaSchema`): ajustes, impuestos, medios de pago
 * con los datos que el cliente ve para pagar, tarifas y paquetes, categorías, la carta con el precio que rige,
 * descuentos, el plano, los cumpleaños y las impresoras. Cargar: el local que la recibe solo AÑADE lo que le
 * falta (un tarifario si no tiene ninguno, los productos que no tiene por nombre, las categorías que no están en
 * su lista…) y nunca pisa lo que ya tiene. Antes de cargar se revisa: el mismo cálculo dice qué entra (y qué
 * elementos de cada lista, para sus casillas) y qué ya está, sin escribir nada. Quien descarga o carga elige
 * con casillas qué va: la semilla recortada (`recortarSemilla`) es otra semilla, y aquí se revalida entera.
 *
 * Cada parte entra por el mismo camino que si se tecleara (sus casos de uso, con sus reglas y sus asientos;
 * categorías y productos juntos, en una transacción), y al final un resumen `semilla.cargar`. Si una parte
 * falla, lo de antes queda (cada parte es entera) y volver a cargar la misma semilla añade solo lo que siga
 * faltando. Es del catálogo: `catalogo.modificar`, con elevación. Personas, PIN, llaves, equipos y
 * existencias nunca viajan.
 */
import { randomUUID } from "node:crypto";
import {
  CargarSemillaCommandSchema,
  DATOS_PAGO_MOVIL,
  DATOS_ZELLE,
  InformeDeSemillaSchema,
  ParteDeSemillaSchema,
  SemillaSchema,
  VERSION_DE_SEMILLA,
  nombreDeImpuesto,
  nombreDeTerminal,
  problemasDe,
  type DatosImpresoraDto,
  type DescuentoDeSemillaDto,
  type ImpuestoDeSemillaDto,
  type InformeDeSemillaDto,
  type MedioDeSemillaDto,
  type MediosDeSemillaDto,
  type ParteDeSemilla,
  type ProductoDeSemillaDto,
  type Rechazo,
  type Resultado,
  type SemillaDto,
} from "@l2/contracts";
import { findCategory, nameKey } from "@l2/domain-inventory";
import { calendarDay } from "@l2/domain-rates";
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
import type { CasosMedios } from "../caja/medios.ts";
import type { CasosDescuentos } from "../caja/descuentos.ts";
import type { CasosImpuestos } from "../dinero/impuestos.ts";
import type { CasosImpresion } from "../impresion/impresion.ts";

export interface CasosSemilla {
  /** La semilla de este local, entera, para descargarla (las casillas recortan en la pantalla). */
  exportar(ctx: Contexto, ahora?: number): Promise<Resultado<SemillaDto>>;
  /** Revisa (`cargar: false`) o carga (`cargar: true`) una semilla (`CargarSemillaCommandSchema`). */
  cargar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<InformeDeSemillaDto>>;
}

type Dependencias = Readonly<{
  ajustes: CasosAjustes;
  tarifario: CasosTarifario;
  plano: CasosPlano;
  eventos: CasosEventos;
  medios: CasosMedios;
  descuentos: CasosDescuentos;
  impuestos: CasosImpuestos;
  impresion: CasosImpresion;
}>;

type Parte = InformeDeSemillaDto["partes"][number];

/** Lo que entra de los medios de pago: los nuevos, los datos que faltan, los terminales y lo que se enciende. */
type PlanDeMedios = Readonly<{
  nuevos: MedioDeSemillaDto[];
  pagoMovil: MediosDeSemillaDto["pagoMovil"];
  zelle: MediosDeSemillaDto["zelle"];
  terminales: MediosDeSemillaDto["terminales"];
  encender: string[];
}>;

/** Lo que la semilla añadiría a este local, parte por parte. */
type Plan = Readonly<{
  partes: Parte[];
  categorias: string[];
  productos: (ProductoDeSemillaDto & { sinCodigo: boolean })[];
  impuestos: (ImpuestoDeSemillaDto & { dia: string })[];
  medios: PlanDeMedios | null;
  descuentos: (DescuentoDeSemillaDto & { desde: string })[];
  impresoras: DatosImpresoraDto[];
}>;

/** El precio que rige en `ahora` de un calendario de tramos; sin tramo vigente, el último programado. */
function precioVigente(tramos: readonly { precio: { minor: string }; desde: string; hasta: string | null }[], ahora: number): string | null {
  const vigente = tramos.find((t) => Date.parse(t.desde) <= ahora && (t.hasta === null || Date.parse(t.hasta) > ahora));
  return (vigente ?? tramos.at(-1))?.precio.minor ?? null;
}

const parte = (p: ParteDeSemilla, estado: Parte["estado"], detalle: string, cuantos: number | null = null, avisos: string[] = [], elementos: string[] = []): Parte => ({
  parte: p,
  estado,
  detalle,
  cuantos,
  avisos,
  elementos,
});

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function casosSemilla(base: Base, deps: Dependencias): CasosSemilla {
  /** Qué entra y qué ya está. Lee el local; no escribe. */
  async function planear(ctx: Contexto, s: SemillaDto, ahora: number): Promise<Plan> {
    const ajustes = await deps.ajustes.leer(ctx);
    const tarifario = await deps.tarifario.leer(ctx);
    const plano = await deps.plano.leer(ctx);
    const cumpleanos = await deps.eventos.leerCatalogo(ctx);
    const impuestosAqui = await deps.impuestos.leer(ctx);
    const mediosAqui = await deps.medios.leer(ctx);
    const descuentosAqui = await deps.descuentos.leer(ctx);
    const impresorasAqui = await deps.impresion.leer(ctx, ahora);
    const catalogo = await base.conTenant(ctx.tenantId, (tx) => cargarCatalogo(tx, ctx.branchId));
    const hoy = calendarDay(new Date(ahora).toISOString(), impuestosAqui.zonaHoraria);

    const partes = new Map<ParteDeSemilla, Parte>();
    partes.set(
      "AJUSTES",
      s.ajustes === null
        ? parte("AJUSTES", "NO_TRAE", "La semilla no trae ajustes publicados.")
        : ajustes.version > 0
          ? parte("AJUSTES", "YA_ESTA", `Este local ya publicó sus ajustes (versión ${ajustes.version}): no se tocan.`)
          : parte("AJUSTES", "CARGA", `Nombre «${s.ajustes.nombre}», ${s.ajustes.preciosConIva ? "precios con el IVA incluido" : "IVA aparte"}, hora en ${s.ajustes.formatoHora === "12h" ? "12 horas" : "24 horas"}.`),
    );

    // Los impuestos entran juntos y solo en un local que no programó ninguno: mezclar dos calendarios no se defiende.
    const impuestos: Plan["impuestos"] = [];
    if (!s.impuestos || s.impuestos.length === 0) partes.set("IMPUESTOS", parte("IMPUESTOS", "NO_TRAE", "La semilla no trae impuestos."));
    else if (impuestosAqui.vigencias.length > 0) partes.set("IMPUESTOS", parte("IMPUESTOS", "YA_ESTA", "Este local ya programó sus impuestos: no se tocan."));
    else {
      // El que regía al descargarla rige desde hoy; uno programado entra en su día, si no pasó.
      for (const i of s.impuestos) impuestos.push({ ...i, dia: i.desde !== null && i.desde > hoy ? i.desde : hoy });
      impuestos.sort((a, b) => a.dia.localeCompare(b.dia));
      const nombres = s.impuestos.map(nombreDeImpuesto);
      partes.set("IMPUESTOS", parte("IMPUESTOS", "CARGA", `${nombres.join(", ")}. Lo que regía allí rige aquí desde hoy.`, impuestos.length, [], nombres));
    }

    let medios: PlanDeMedios | null = null;
    if (!s.medios) partes.set("MEDIOS", parte("MEDIOS", "NO_TRAE", "La semilla no trae medios de pago."));
    else if (!mediosAqui.ok) partes.set("MEDIOS", parte("MEDIOS", "NO_TRAE", `Los medios de este local no se pueden leer: ${mediosAqui.mensaje}`));
    else {
      const aqui = mediosAqui.valor;
      const codigos = new Set(aqui.medios.map((m) => m.code));
      const nuevos = s.medios.medios.filter((m) => !codigos.has(m.code));
      const pagoMovil = s.medios.pagoMovil && !aqui.pagoMovil ? s.medios.pagoMovil : null;
      const zelle = s.medios.zelle && !aqui.zelle ? s.medios.zelle : null;
      const yaTerminales = new Set(aqui.terminales.map((t) => nameKey(t.name)));
      const terminales = s.medios.terminales.filter((t) => !yaTerminales.has(nameKey(t.name)));
      // Lo que tendrá sus datos al terminar: sin ellos, un medio que los pide no se enciende.
      const tendra = {
        PAGO_MOVIL: !!(aqui.pagoMovil ?? pagoMovil),
        ZELLE: !!(aqui.zelle ?? zelle),
        PUNTO: aqui.terminales.length + terminales.length > 0,
        USDT: true,
      } as const;
      // Se enciende lo nuevo, y lo que estaba apagado aquí porque le faltaban los datos que ahora entran.
      const entranDatos = new Set([...(pagoMovil ? ["PAGO_MOVIL"] : []), ...(zelle ? ["ZELLE"] : []), ...(terminales.length > 0 && aqui.terminales.length === 0 ? ["PUNTO"] : [])]);
      const encender: string[] = [];
      const avisos: string[] = [];
      for (const m of s.medios.medios) {
        if (!m.activo) continue;
        const esNuevo = nuevos.includes(m);
        const apagadoPorDatos = m.datos !== null && entranDatos.has(m.datos) && aqui.medios.find((x) => x.code === m.code)?.activo === false;
        if (!esNuevo && !apagadoPorDatos) continue;
        if (m.datos !== null && !tendra[m.datos]) avisos.push(`«${m.label}» entra apagado: le faltan sus datos.`);
        else encender.push(m.code);
      }
      const elementos = [...nuevos.map((m) => m.label), ...(pagoMovil ? [DATOS_PAGO_MOVIL] : []), ...(zelle ? [DATOS_ZELLE] : []), ...terminales.map(nombreDeTerminal)];
      if (elementos.length === 0 && encender.length === 0) partes.set("MEDIOS", parte("MEDIOS", "YA_ESTA", "Los medios de la semilla ya están configurados aquí."));
      else {
        const encendidos = encender.map((c) => s.medios!.medios.find((m) => m.code === c)!.label);
        medios = { nuevos, pagoMovil, zelle, terminales, encender };
        partes.set(
          "MEDIOS",
          parte(
            "MEDIOS",
            "CARGA",
            [
              nuevos.length > 0 ? `${plural(nuevos.length, "medio nuevo", "medios nuevos")}` : null,
              pagoMovil || zelle ? `los datos de ${[pagoMovil ? "Pago Móvil" : null, zelle ? "Zelle" : null].filter(Boolean).join(" y ")}` : null,
              terminales.length > 0 ? plural(terminales.length, "terminal del punto", "terminales del punto") : null,
              encendidos.length > 0 ? `se encienden ${encendidos.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join("; ")
              .replace(/^./, (c) => c.toUpperCase()) + ".",
            elementos.length,
            avisos,
            elementos,
          ),
        );
      }
    }

    partes.set(
      "TARIFARIO",
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
    partes.set(
      "CATEGORIAS",
      s.categorias.length === 0 && categorias.length === 0
        ? parte("CATEGORIAS", "NO_TRAE", "La semilla no trae categorías.")
        : categorias.length === 0
          ? parte("CATEGORIAS", "YA_ESTA", "Las categorías de la semilla ya están en la lista.")
          : parte("CATEGORIAS", "CARGA", categorias.join(", "), categorias.length, [], categorias),
    );

    // Los productos que este local no tiene por nombre (apartados incluidos: se vuelven a poner a la venta, no se duplican).
    const nombres = new Set(catalogo.productos.map((p) => nameKey(p.nombre)));
    const codigos = new Map(catalogo.productos.flatMap((p) => (p.codigoBarras ? [[p.codigoBarras, p.nombre] as const] : [])));
    const productos: Plan["productos"] = [];
    const avisosDeProductos: string[] = [];
    for (const p of s.productos) {
      if (nombres.has(nameKey(p.nombre))) continue;
      const deOtro = p.codigoBarras ? codigos.get(p.codigoBarras) : undefined;
      if (deOtro) avisosDeProductos.push(`«${p.nombre}» entra sin su código de barras: aquí ya es de «${deOtro}».`);
      productos.push({ ...p, sinCodigo: deOtro !== undefined });
      nombres.add(nameKey(p.nombre));
    }
    const yaEstan = s.productos.length - productos.length;
    partes.set(
      "PRODUCTOS",
      s.productos.length === 0
        ? parte("PRODUCTOS", "NO_TRAE", "La semilla no trae productos.")
        : productos.length === 0
          ? parte("PRODUCTOS", "YA_ESTA", `Los ${s.productos.length} productos de la semilla ya están en este local.`)
          : parte(
              "PRODUCTOS",
              "CARGA",
              `${plural(productos.length, "producto", "productos")} a la venta con su precio${yaEstan > 0 ? `; ${plural(yaEstan, "ya estaba", "ya estaban")}` : ""}. Sin existencias: lo que se cuenta queda sin inventario inicial.`,
              productos.length,
              avisosDeProductos,
              productos.map((p) => p.nombre),
            ),
    );

    // Los descuentos que este local no tiene (vigentes, por nombre) y que no terminaron: uno no empieza en el pasado.
    const descuentos: Plan["descuentos"] = [];
    if (!s.descuentos || s.descuentos.length === 0) partes.set("DESCUENTOS", parte("DESCUENTOS", "NO_TRAE", "La semilla no trae descuentos."));
    else {
      const yaHay = new Set(descuentosAqui.ok ? descuentosAqui.valor.reglas.filter((r) => r.retirada === null).map((r) => nameKey(r.nombre)) : []);
      const habraMedios = new Set([...(mediosAqui.ok ? mediosAqui.valor.medios.map((m) => m.code) : []), ...(medios?.nuevos.map((m) => m.code) ?? [])]);
      const avisos: string[] = [];
      for (const d of s.descuentos) {
        if (yaHay.has(nameKey(d.nombre))) continue;
        if (d.hasta !== null && d.hasta < hoy) {
          avisos.push(`«${d.nombre}» no entra: terminó el ${d.hasta}.`);
          continue;
        }
        if (d.medio !== null && !habraMedios.has(d.medio)) {
          avisos.push(`«${d.nombre}» no entra: su medio de pago (${d.medio}) no está aquí.`);
          continue;
        }
        descuentos.push({ ...d, desde: d.desde > hoy ? d.desde : hoy });
      }
      partes.set(
        "DESCUENTOS",
        descuentos.length === 0
          ? parte("DESCUENTOS", "YA_ESTA", "Los descuentos de la semilla ya están aquí (o no pueden entrar).", null, avisos)
          : parte("DESCUENTOS", "CARGA", `${plural(descuentos.length, "descuento", "descuentos")}, desde hoy o su día. Las familias VIP no viajan: se marcan aquí.`, descuentos.length, avisos, descuentos.map((d) => d.nombre)),
      );
    }

    const mesas = s.plano?.tables.filter((t) => !t.retiredAt).length ?? 0;
    partes.set(
      "PLANO",
      s.plano === null
        ? parte("PLANO", "NO_TRAE", "La semilla no trae plano.")
        : plano.plano
          ? parte("PLANO", "YA_ESTA", `Este local ya dibujó su plano (versión ${plano.version}): no se toca.`)
          : parte("PLANO", "CARGA", `${plural(mesas, "mesa", "mesas")}.`, mesas),
    );

    if (s.cumpleanos === null) partes.set("CUMPLEANOS", parte("CUMPLEANOS", "NO_TRAE", "La semilla no trae paquetes de cumpleaños."));
    else if (cumpleanos.catalogo) partes.set("CUMPLEANOS", parte("CUMPLEANOS", "YA_ESTA", `Este local ya tiene sus paquetes de cumpleaños (versión ${cumpleanos.version}): no se tocan.`));
    else {
      const habra = new Set([...catalogo.productos.filter((p) => p.activo).map((p) => nameKey(p.nombre)), ...productos.map((p) => nameKey(p.nombre))]);
      const faltan = [...new Set(s.cumpleanos.paquetes.flatMap((p) => p.incluye.map((x) => x.producto)).filter((n) => !habra.has(nameKey(n))))];
      partes.set(
        "CUMPLEANOS",
        parte(
          "CUMPLEANOS",
          "CARGA",
          `${plural(s.cumpleanos.paquetes.length, "paquete", "paquetes")}, anticipo del ${s.cumpleanos.anticipoBps / 100} %.`,
          s.cumpleanos.paquetes.length,
          faltan.map((n) => `«${n}» no está a la venta aquí: los paquetes que lo incluyen entran sin él.`),
          s.cumpleanos.paquetes.map((p) => p.name),
        ),
      );
    }

    // Las impresoras que no están (por nombre). Entran apagadas, como al darlas de alta: se encienden al comprobar que imprimen.
    const impresoras: DatosImpresoraDto[] = [];
    if (!s.impresoras || s.impresoras.length === 0) partes.set("IMPRESORAS", parte("IMPRESORAS", "NO_TRAE", "La semilla no trae impresoras."));
    else {
      const yaHay = new Set(impresorasAqui.ok ? impresorasAqui.valor.impresoras.map((i) => nameKey(i.nombre)) : []);
      impresoras.push(...s.impresoras.filter((i) => !yaHay.has(nameKey(i.nombre))));
      partes.set(
        "IMPRESORAS",
        impresoras.length === 0
          ? parte("IMPRESORAS", "YA_ESTA", "Las impresoras de la semilla ya están aquí.")
          : parte(
              "IMPRESORAS",
              "CARGA",
              `${plural(impresoras.length, "impresora", "impresoras")}. Entran apagadas: se encienden en Ajustes → Impresoras al vincular el agente y comprobar que imprimen.`,
              impresoras.length,
              [],
              impresoras.map((i) => i.nombre),
            ),
      );
    }

    return { partes: ParteDeSemillaSchema.options.map((p) => partes.get(p)!), categorias, productos, impuestos, medios, descuentos, impresoras };
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
          ...(p.minimo !== null && p.tipo === "PRODUCTO" ? { minimo: p.minimo } : {}),
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
      const impuestos = await deps.impuestos.leer(ctx);
      const medios = await deps.medios.leer(ctx);
      const descuentos = await deps.descuentos.leer(ctx);
      const impresoras = await deps.impresion.leer(ctx, ahora);
      const catalogo = await base.conTenant(ctx.tenantId, (tx) => cargarCatalogo(tx, ctx.branchId));
      const nombreDeId = new Map(catalogo.productos.map((p) => [p.id, p.nombre]));
      const hoy = calendarDay(new Date(ahora).toISOString(), impuestos.zonaHoraria);

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
        version: VERSION_DE_SEMILLA,
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
        // Lo que rige hoy (sin día: en el otro local, desde que se carga) y lo programado que no llegó.
        impuestos: impuestos.vigencias.length === 0
          ? null
          : impuestos.vigencias
              .filter((v) => v.hasta === null || Date.parse(v.hasta) > ahora)
              .map((v) => {
                const dia = calendarDay(v.desde, impuestos.zonaHoraria);
                return { impuesto: v.impuesto, code: v.code, basisPoints: v.basisPoints, desde: Date.parse(v.desde) <= ahora ? null : dia };
              }),
        medios: medios.ok
          ? {
              medios: medios.valor.medios.map((m) => ({
                code: m.code,
                label: m.label,
                currency: m.currency,
                triggersIgtf: m.triggersIgtf,
                canGiveChange: m.canGiveChange,
                datos: m.datos ?? null,
                activo: m.activo,
              })),
              pagoMovil: medios.valor.pagoMovil ?? null,
              zelle: medios.valor.zelle ?? null,
              terminales: medios.valor.terminales.map((t) => ({ name: t.name, bank: t.bank })),
            }
          : null,
        // Las reglas vigentes y las que no terminaron. Las familias VIP no viajan: son clientes del local.
        descuentos: descuentos.ok
          ? descuentos.valor.reglas
              .filter((r) => r.retirada === null && (r.hasta === null || r.hasta >= hoy))
              .map((r) => ({ nombre: r.nombre, tipo: r.tipo, valor: r.valor, alcance: r.alcance, medio: r.medio, desde: r.desde, hasta: r.hasta }))
          : null,
        impresoras: impresoras.ok
          ? impresoras.valor.impresoras
              // Solo las de red: una por USB es de un equipo con su agente, y la semilla no lleva equipos (B5-4). Se
              // da de alta en el local que la recibe.
              .filter((i) => i.conexion === "RED")
              .map((i) => ({
                nombre: i.nombre,
                conexion: "RED" as const,
                ip: i.ip,
                puerto: i.puerto,
                ancho: i.ancho,
                pagina: i.pagina,
                oscura: i.oscura,
                recibos: i.recibos,
                comandas: i.comandas,
                enVlanDeHardware: i.enVlanDeHardware,
                ipFija: i.ipFija,
              }))
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

      const plan = await planear(ctx, s, ahora);
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
      if (carga("IMPUESTOS")) {
        // Uno tras otro, un milisegundo aparte: dos programaciones del mismo impuesto en el mismo instante no se ordenan.
        for (const [n, i] of plan.impuestos.entries()) {
          const r = await deps.impuestos.programar(ctx, { impuesto: i.impuesto, code: i.code, basisPoints: i.basisPoints, dia: i.dia }, ahora + n);
          if (!r.ok) return fallo("Los impuestos no se cargaron", r);
        }
      }
      if (carga("MEDIOS") && plan.medios) {
        const m = plan.medios;
        const pasos: unknown[] = [
          ...m.nuevos.map((x) => ({
            kind: "AÑADIR_MEDIO",
            medio: { code: x.code, label: x.label, currency: x.currency, triggersIgtf: x.triggersIgtf, canGiveChange: x.canGiveChange, ...(x.datos ? { datos: x.datos } : {}) },
          })),
          ...(m.pagoMovil ? [{ kind: "DATOS_PAGO_MOVIL", datos: m.pagoMovil }] : []),
          ...(m.zelle ? [{ kind: "DATOS_ZELLE", datos: m.zelle }] : []),
          ...m.terminales.map((t) => ({ kind: "AÑADIR_TERMINAL", terminal: t })),
          ...m.encender.map((code) => ({ kind: "ACTIVAR", code, activo: true })),
        ];
        for (const paso of pasos) {
          const r = await deps.medios.aplicar(ctx, paso, ahora);
          if (!r.ok) return fallo("Los medios de pago no se cargaron", r);
        }
      }
      if (carga("TARIFARIO") && s.tarifario) {
        const r = await deps.tarifario.publicar(ctx, s.tarifario);
        if (!r.ok) return fallo("Las tarifas no se cargaron", r);
      }
      let avisosDeProductos: string[] = [];
      if (carga("CATEGORIAS") || carga("PRODUCTOS")) {
        avisosDeProductos = await base.conTenant(ctx.tenantId, (tx) => cargarCatalogoDeSemilla(tx, ctx, plan, ahora));
      }
      if (carga("DESCUENTOS")) {
        for (const d of plan.descuentos) {
          const r = await deps.descuentos.crear(
            ctx,
            { nombre: d.nombre, tipo: d.tipo, valor: d.valor, alcance: d.alcance, ...(d.medio ? { medio: d.medio } : {}), desde: d.desde, ...(d.hasta ? { hasta: d.hasta } : {}) },
            ahora,
          );
          if (!r.ok) return fallo("Los descuentos no se cargaron", r);
        }
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
      if (carga("IMPRESORAS")) {
        for (const datos of plan.impresoras) {
          const r = await deps.impresion.aplicar(ctx, { kind: "CREAR", datos }, ahora);
          if (!r.ok) return fallo("Las impresoras no se cargaron", r);
        }
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
            version: s.version,
            partes: Object.fromEntries(partes.map((p) => [p.parte, p.estado === "CARGA" ? (p.cuantos ?? "sí") : p.estado])),
          },
        }),
      );
      return informe(true, partes);
    },
  };
}
