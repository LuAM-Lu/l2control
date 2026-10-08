/**
 * La semilla del local contra l2control_test — B7-2, M-24; con casillas y lo de la corrida limpia, B7-7.
 *
 * Un local con su configuración la descarga; otro, recién creado, la revisa y la carga, y queda con lo
 * mismo sin teclearlo (también impuestos, medios de pago, descuentos e impresoras). Cargarla otra vez no
 * duplica nada, lo que ya tenía no se pisa, lo desmarcado no entra y una semilla de la versión 1 sigue valiendo.
 * Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DATOS_PAGO_MOVIL, recortarSemilla, type InformeDeSemillaDto, type PlanoLocalDto, type SemillaDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const PAGO_MOVIL = { bankCode: "0102", phone: "0414-7654321", document: "J-41234567-8" };
const IMPRESORA = { nombre: "Caja", ip: "192.168.1.194", puerto: 9100, ancho: 80, recibos: true, comandas: true, enVlanDeHardware: true, ipFija: true };

let origen: LocalDePrueba;
let destino: LocalDePrueba;
let enOrigen: Contexto;
let enDestino: Contexto;
let cajeraDestino: Contexto;
let adminSinConfirmar: Contexto;
let semilla: SemillaDto;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const estados = (i: InformeDeSemillaDto) => Object.fromEntries(i.partes.map((p) => [p.parte, p.estado]));
const TODAS = ["AJUSTES", "IMPUESTOS", "MEDIOS", "TARIFARIO", "CATEGORIAS", "PRODUCTOS", "DESCUENTOS", "PLANO", "CUMPLEANOS", "IMPRESORAS"] as const;
const todas = (estado: string) => Object.fromEntries(TODAS.map((p) => [p, estado]));

const TARIFARIO = {
  packages: [
    { id: "pkg-30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: usd("300"), active: true },
    { id: "pkg-libre", name: "Pase libre", mode: "POSTPAGO", duration: { kind: "openEnded" }, price: usd("1200"), active: true },
  ],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
};
const PLANO: PlanoLocalDto = {
  width: 800,
  height: 400,
  tables: [1, 2, 3].map((n) => ({ id: `mesa-${n}`, label: String(n), zone: "Salón", seats: 4, shape: "REDONDA" as const, x: 100 + (n - 1) * 150, y: 200, width: 80, height: 80, rotation: 0 })),
  fixtures: [{ id: "caja", kind: "CAJA", x: 600, y: 0, width: 200, height: 80, label: "Caja" }],
};

before(async () => {
  origen = await abrirLocalDePrueba(URL_APP, "Semilla origen");
  destino = await abrirLocalDePrueba(URL_APP, "Semilla destino");
  const a = await crearPersona(origen, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  enOrigen = await contextoElevado(origen, await crearEquipo(origen, "PC admin"), { id: a, nombre: "Abigail Karam", pin: "4826" });
  const b = await crearPersona(destino, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const c = await crearPersona(destino, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  enDestino = await contextoElevado(destino, await crearEquipo(destino, "Oficina"), { id: b, nombre: "Abigail Karam", pin: "4826" });
  adminSinConfirmar = await contextoDe(destino, await crearEquipo(destino, "Oficina 2"), b, "4826");
  cajeraDestino = await contextoDe(destino, await crearEquipo(destino, "Caja 1"), c, "7391");

  // El local de origen, configurado como lo dejaría administración.
  const ajustes = await origen.app.ajustes.leer(enOrigen);
  valor(await origen.app.ajustes.publicar(enOrigen, { versionBase: ajustes.version, ajustes: { ...ajustes.ajustes, nombre: "Abby Kingdom", preciosConIva: true, formatoHora: "12h" } }));
  valor(await origen.app.tarifario.publicar(enOrigen, TARIFARIO));
  const crear = async (producto: Record<string, unknown>) => valor(await origen.app.productos.aplicar(enOrigen, { kind: "CREAR", producto }, AHORA - 60_000));
  await crear({ nombre: "Tequeños con salsa", categoria: "Entradas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "500" });
  await crear({ nombre: "Torta de cumpleaños", categoria: "Postres", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "2500" });
  await crear({ nombre: "Refresco 355 ml", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "150", codigoBarras: "036000291452" });
  const viejo = await crear({ nombre: "Plato que ya no va", categoria: "Platos", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "900" });
  valor(await origen.app.productos.aplicar(enOrigen, { kind: "ACTIVAR", productId: viejo.productos.find((p) => p.nombre === "Plato que ya no va")!.id, activo: false }, AHORA - 30_000));
  valor(await origen.app.categorias.aplicar(enOrigen, { kind: "CREAR", nombre: "Combos" }, AHORA - 30_000));
  valor(await origen.app.plano.publicar(enOrigen, { plano: PLANO, sobre: null }, AHORA - 30_000));
  const torta = (await origen.app.productos.leer(enOrigen)).productos.find((p) => p.nombre === "Torta de cumpleaños")!.id;
  valor(
    await origen.app.eventos.publicarCatalogo(
      enOrigen,
      {
        sobre: null,
        catalogo: {
          anticipoBps: 5000,
          paquetes: [{ id: "diez", name: "10 niños · lunes a viernes", price: usd("15000"), minInvitados: 1, maxInvitados: 10, incluye: [{ productId: torta, quantity: 1 }], active: true }],
        },
      },
      AHORA - 30_000,
    ),
  );
  // Lo de la corrida limpia (B7-7): impuestos (uno programado), el cobro con sus datos, descuentos y la impresora.
  valor(await origen.app.impuestos.programar(enOrigen, { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY }, AHORA - 30_000));
  valor(await origen.app.impuestos.programar(enOrigen, { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY }, AHORA - 29_000));
  valor(await origen.app.impuestos.programar(enOrigen, { impuesto: "IVA", code: "GENERAL", basisPoints: 1500, dia: "2026-11-01" }, AHORA - 28_000));
  for (const paso of [
    { kind: "DATOS_PAGO_MOVIL", datos: PAGO_MOVIL },
    { kind: "ACTIVAR", code: "PAGO_MOVIL", activo: true },
    { kind: "AÑADIR_TERMINAL", terminal: { name: "Banesco 1", bank: "Banesco" } },
    { kind: "ACTIVAR", code: "PDV_DEBITO", activo: true },
    { kind: "AÑADIR_MEDIO", medio: { code: "BIOPAGO", label: "Biopago", currency: "VES", triggersIgtf: false, canGiveChange: false, datos: "PUNTO" } },
    { kind: "ACTIVAR", code: "BIOPAGO", activo: true },
  ]) valor(await origen.app.medios.aplicar(enOrigen, paso, AHORA - 20_000));
  valor(await origen.app.descuentos.crear(enOrigen, { nombre: "Pago Móvil 5 %", tipo: "MEDIO", valor: { tipo: "PORCENTAJE", basisPoints: 500 }, alcance: { tipo: "CUENTA" }, medio: "PAGO_MOVIL", desde: HOY }, AHORA - 20_000));
  valor(await origen.app.descuentos.crear(enOrigen, { nombre: "VIP 10 %", tipo: "VIP", valor: { tipo: "PORCENTAJE", basisPoints: 1000 }, alcance: { tipo: "PARQUE" }, desde: HOY }, AHORA - 20_000));
  valor(await origen.app.impresion.aplicar(enOrigen, { kind: "CREAR", datos: IMPRESORA }, AHORA - 20_000));
});

after(async () => {
  await Promise.all([origen.cerrar(), destino.cerrar()]);
});

describe("descargar la semilla", () => {
  test("lleva ajustes, tarifas, categorías, la carta con su precio, el plano y los cumpleaños; nada apartado", async () => {
    semilla = valor(await origen.app.semilla.exportar(enOrigen, AHORA));
    assert.equal(semilla.formato, "l2-semilla");
    assert.equal(semilla.local, "Abby Kingdom");
    assert.equal(semilla.ajustes?.preciosConIva, true);
    assert.equal(semilla.tarifario?.packages.length, 2);
    assert.ok(semilla.categorias.includes("Combos") && semilla.categorias.includes("Bebidas"));
    assert.deepEqual(semilla.productos.map((p) => p.nombre).sort(), ["Refresco 355 ml", "Tequeños con salsa", "Torta de cumpleaños"]);
    assert.equal(semilla.productos.find((p) => p.nombre === "Tequeños con salsa")?.precioMinor, "500");
    assert.equal(semilla.plano?.tables.length, 3);
    assert.deepEqual(semilla.cumpleanos?.paquetes[0]?.incluye, [{ producto: "Torta de cumpleaños", cantidad: 1 }]);
  });

  test("desde la versión 2 lleva impuestos, medios con sus datos, descuentos e impresoras; nunca personas ni equipos", async () => {
    assert.equal(semilla.version, 2);
    // Lo que rige va sin día (en el otro local rige desde que se carga); lo programado, con el suyo.
    const clave = (i: { impuesto: string; basisPoints: number; desde: string | null }) => `${i.impuesto} ${i.basisPoints} ${i.desde ?? "hoy"}`;
    assert.deepEqual(semilla.impuestos?.map(clave).sort(), ["IGTF 0 hoy", "IVA 1500 2026-11-01", "IVA 1600 hoy"]);
    assert.deepEqual(semilla.medios?.pagoMovil, PAGO_MOVIL);
    assert.deepEqual(semilla.medios?.terminales, [{ name: "Banesco 1", bank: "Banesco" }]);
    assert.ok(semilla.medios?.medios.some((m) => m.code === "BIOPAGO" && m.activo));
    assert.deepEqual(semilla.descuentos?.map((d) => d.nombre).sort(), ["Pago Móvil 5 %", "VIP 10 %"]);
    assert.deepEqual(semilla.impresoras, [IMPRESORA]);
    const texto = JSON.stringify(semilla);
    assert.ok(!/pinHash|passwordHash|Marisol|deviceId/.test(texto), "ni personas, ni PIN, ni equipos");
  });

  test("es de administración con la identidad confirmada", async () => {
    const r = await destino.app.semilla.exportar(cajeraDestino, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const s = await destino.app.semilla.exportar(adminSinConfirmar, AHORA);
    assert.equal(!s.ok && s.motivo, "ELEVACION_REQUERIDA");
  });
});

describe("cargar la semilla en otro local", () => {
  test("revisar dice qué entra, sin escribir nada", async () => {
    const i = valor(await destino.app.semilla.cargar(enDestino, { semilla, cargar: false }, AHORA));
    assert.equal(i.cargada, false);
    assert.deepEqual(estados(i), todas("CARGA"));
    assert.equal(i.partes.find((p) => p.parte === "PRODUCTOS")?.cuantos, 3);
    // Los elementos de cada lista, para sus casillas.
    assert.deepEqual(i.partes.find((p) => p.parte === "MEDIOS")?.elementos, ["Biopago", DATOS_PAGO_MOVIL, "Terminal Banesco 1"]);
    assert.deepEqual(i.partes.find((p) => p.parte === "PRODUCTOS")?.elementos.slice().sort(), ["Refresco 355 ml", "Tequeños con salsa", "Torta de cumpleaños"]);
    assert.match(i.partes.find((p) => p.parte === "MEDIOS")!.detalle, /se encienden Pago Móvil, Punto débito, Biopago/);
    assert.equal((await destino.app.tarifario.leer(enDestino)), null, "revisar no carga nada");
  });

  test("cargar deja el local con lo mismo, sin existencias, y con sus asientos", async () => {
    const i = valor(await destino.app.semilla.cargar(enDestino, { semilla, cargar: true }, AHORA));
    assert.equal(i.cargada, true);
    const ajustes = await destino.app.ajustes.leer(enDestino);
    assert.deepEqual([ajustes.version, ajustes.ajustes.nombre, ajustes.ajustes.preciosConIva], [1, "Abby Kingdom", true]);
    assert.equal((await destino.app.tarifario.leer(enDestino))?.tarifario.packages.length, 2);
    const catalogo = await destino.app.productos.leer(enDestino);
    assert.ok(catalogo.categorias.some((c) => c.nombre === "Combos"));
    const refresco = catalogo.productos.find((p) => p.nombre === "Refresco 355 ml")!;
    assert.deepEqual([refresco.tipo, refresco.codigoBarras, refresco.existencia, refresco.precios.at(-1)?.precio], ["PRODUCTO", "036000291452", 0, usd("150")]);
    assert.equal((await destino.app.plano.leer(enDestino)).plano?.tables.length, 3);
    const cumple = await destino.app.eventos.leerCatalogo(enDestino);
    const torta = catalogo.productos.find((p) => p.nombre === "Torta de cumpleaños")!;
    assert.deepEqual(cumple.catalogo?.paquetes[0]?.incluye, [{ productId: torta.id, name: "Torta de cumpleaños", quantity: 1 }]);
    const resumen = await destino.base.conTenant(destino.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "semilla.cargar" } }));
    assert.equal((resumen?.after as { de: string }).de, "Abby Kingdom");
  });

  test("y queda listo para cobrar: impuestos, medios encendidos con sus datos, descuentos e impresora apagada", async () => {
    const impuestos = await destino.app.impuestos.leer(enDestino);
    assert.deepEqual(impuestos.vigencias.map((v) => [v.impuesto, v.basisPoints]).sort(), [["IGTF", 0], ["IVA", 1500], ["IVA", 1600]]);
    const medios = valor(await destino.app.medios.leer(enDestino));
    assert.deepEqual(medios.pagoMovil, PAGO_MOVIL);
    assert.deepEqual(medios.terminales.map((t) => t.name), ["Banesco 1"]);
    assert.deepEqual(medios.medios.filter((m) => m.activo).map((m) => m.code).sort(), ["BIOPAGO", "EFECTIVO_USD", "EFECTIVO_VES", "PAGO_MOVIL", "PDV_DEBITO", "USDT"]);
    const descuentos = valor(await destino.app.descuentos.leer(enDestino));
    assert.deepEqual(descuentos.reglas.map((r) => [r.nombre, r.desde]).sort(), [["Pago Móvil 5 %", HOY], ["VIP 10 %", HOY]]);
    const impresoras = valor(await destino.app.impresion.leer(enDestino, AHORA));
    assert.deepEqual(impresoras.impresoras.map((i) => [i.nombre, i.ip, i.activa]), [["Caja", "192.168.1.194", false]]);
  });

  test("cargarla otra vez no duplica nada: todo «ya está»", async () => {
    const antes = (await destino.app.productos.leer(enDestino)).productos.length;
    const i = valor(await destino.app.semilla.cargar(enDestino, { semilla, cargar: true }, AHORA));
    assert.deepEqual(estados(i), todas("YA_ESTA"));
    assert.equal((await destino.app.productos.leer(enDestino)).productos.length, antes);
  });

  test("lo que el local ya tiene no se pisa; un código ya usado aquí entra sin él", async () => {
    const tercero = await abrirLocalDePrueba(URL_APP, "Semilla tercero");
    try {
      const p = await crearPersona(tercero, { nombre: "Luis Guerrero", role: "ADMIN", pin: "5937" });
      const ctx = await contextoElevado(tercero, await crearEquipo(tercero, "Oficina"), { id: p, nombre: "Luis Guerrero", pin: "5937" });
      valor(await tercero.app.tarifario.publicar(ctx, { ...TARIFARIO, packages: [TARIFARIO.packages[0]] }));
      valor(await tercero.app.productos.aplicar(ctx, { kind: "CREAR", producto: { nombre: "Tequeños con salsa", categoria: "Entradas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "700" } }, AHORA));
      valor(await tercero.app.productos.aplicar(ctx, { kind: "CREAR", producto: { nombre: "Malta", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "175", codigoBarras: "036000291452" } }, AHORA));
      const i = valor(await tercero.app.semilla.cargar(ctx, { semilla, cargar: true }, AHORA));
      assert.equal(estados(i).TARIFARIO, "YA_ESTA");
      const productos = i.partes.find((x) => x.parte === "PRODUCTOS")!;
      assert.equal(productos.cuantos, 2);
      assert.match(productos.avisos.join(" "), /Refresco 355 ml.*sin su código/);
      const catalogo = await tercero.app.productos.leer(ctx);
      assert.equal(catalogo.productos.find((x) => x.nombre === "Tequeños con salsa")?.precios.at(-1)?.precio.minor, "700", "su precio no se toca");
      assert.equal(catalogo.productos.find((x) => x.nombre === "Refresco 355 ml")?.codigoBarras, null);
      assert.equal((await tercero.app.tarifario.leer(ctx))?.tarifario.packages.length, 1, "sus tarifas no se tocan");
    } finally {
      await tercero.cerrar();
    }
  });

  test("lo desmarcado no entra (B7-7): sin impresoras, sin un producto y sin los datos de Pago Móvil", async () => {
    const cuarto = await abrirLocalDePrueba(URL_APP, "Semilla con casillas");
    try {
      const p = await crearPersona(cuarto, { nombre: "Luis Guerrero", role: "ADMIN", pin: "5937" });
      const ctx = await contextoElevado(cuarto, await crearEquipo(cuarto, "Oficina"), { id: p, nombre: "Luis Guerrero", pin: "5937" });
      const recortada = recortarSemilla(semilla, { partes: ["IMPRESORAS"], elementos: { PRODUCTOS: ["Refresco 355 ml"], MEDIOS: [DATOS_PAGO_MOVIL] } });
      const i = valor(await cuarto.app.semilla.cargar(ctx, { semilla: recortada, cargar: true }, AHORA));
      assert.equal(estados(i).IMPRESORAS, "NO_TRAE");
      const catalogo = await cuarto.app.productos.leer(ctx);
      assert.equal(catalogo.productos.some((x) => x.nombre === "Refresco 355 ml"), false);
      const medios = valor(await cuarto.app.medios.leer(ctx));
      assert.equal(medios.pagoMovil, undefined);
      assert.equal(medios.medios.find((m) => m.code === "PAGO_MOVIL")?.activo, false, "sin sus datos no se enciende");
      assert.equal(valor(await cuarto.app.impresion.leer(ctx, AHORA)).impresoras.length, 0);
    } finally {
      await cuarto.cerrar();
    }
  });

  test("una semilla de la versión 1 sigue cargando: lo que no trae, «no la trae»", async () => {
    const { medios: _m, descuentos: _d, impuestos: _i, impresoras: _p, ...v1 } = semilla;
    const i = valor(await destino.app.semilla.cargar(enDestino, { semilla: { ...v1, version: 1 }, cargar: false }, AHORA));
    assert.deepEqual([estados(i).IMPUESTOS, estados(i).MEDIOS, estados(i).DESCUENTOS, estados(i).IMPRESORAS], ["NO_TRAE", "NO_TRAE", "NO_TRAE", "NO_TRAE"]);
  });

  test("lo que no es una semilla se rechaza con palabras, y cargarla es de administración", async () => {
    const otro = await destino.app.semilla.cargar(enDestino, { semilla: { formato: "otra-cosa" }, cargar: false }, AHORA);
    assert.equal(!otro.ok && otro.mensaje, "Ese archivo no es una semilla de L2 Control");
    const cambiada = await destino.app.semilla.cargar(enDestino, { semilla: { ...semilla, productos: [{ nombre: "X" }] }, cargar: false }, AHORA);
    assert.equal(!cambiada.ok && cambiada.motivo, "INVALIDO");
    const caja = await destino.app.semilla.cargar(cajeraDestino, { semilla, cargar: false }, AHORA);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
  });
});
