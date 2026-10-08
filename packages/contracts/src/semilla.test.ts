/**
 * La semilla del local con casillas — B7-7 (M-29).
 *
 * Se prueba lo que impide: que una semilla de la versión 1 deje de cargarse, que una casilla desmarcada se
 * cuele en el archivo, o que una lista recortada quede vacía en vez de no viajar.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DATOS_PAGO_MOVIL, SemillaSchema, elementosDeSemilla, nombreDeImpuesto, recortarSemilla, type SemillaDto } from "./semilla.ts";

const v1 = {
  formato: "l2-semilla",
  version: 1,
  exportadaEn: "2026-10-07T14:00:00.000Z",
  local: "Abby Kingdom",
  ajustes: null,
  tarifario: null,
  categorias: ["Bebidas", "Prueba B97"],
  productos: [
    { nombre: "Malta", categoria: "Bebidas", tipo: "PRODUCTO", taxCode: "GENERAL", precioMinor: "150", presentacion: null, codigoBarras: null, enCarta: true, minimo: null },
    { nombre: "Prueba B97 Jugo", categoria: "Prueba B97", tipo: "PRODUCTO", taxCode: "GENERAL", precioMinor: "120", presentacion: null, codigoBarras: null, enCarta: true, minimo: 6 },
  ],
  plano: null,
  cumpleanos: null,
};

const v2 = (): SemillaDto =>
  SemillaSchema.parse({
    ...v1,
    version: 2,
    medios: {
      medios: [
        { code: "EFECTIVO_USD", label: "Efectivo $", currency: "USD", triggersIgtf: true, canGiveChange: true, datos: null, activo: true },
        { code: "PAGO_MOVIL", label: "Pago Móvil", currency: "VES", triggersIgtf: false, canGiveChange: false, datos: "PAGO_MOVIL", activo: true },
      ],
      pagoMovil: { bankCode: "0134", phone: "04141234567", document: "J-12345678-9" },
      zelle: null,
      terminales: [{ name: "Banesco 1", bank: "Banesco" }],
    },
    descuentos: [{ nombre: "Zelle 10 %", tipo: "MEDIO", valor: { tipo: "PORCENTAJE", basisPoints: 1000 }, alcance: { tipo: "CUENTA" }, medio: "PAGO_MOVIL", desde: "2026-10-01", hasta: null }],
    impuestos: [
      { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, desde: null },
      { impuesto: "IGTF", code: null, basisPoints: 0, desde: null },
    ],
    impresoras: [{ nombre: "Caja", ip: "192.168.1.194", puerto: 9100, ancho: 80, recibos: true, comandas: true, enVlanDeHardware: true, ipFija: true }],
  });

describe("la semilla y sus versiones", () => {
  test("una de la versión 1 sigue valiendo: no trae medios, descuentos, impuestos ni impresoras", () => {
    const r = SemillaSchema.safeParse(v1);
    assert.ok(r.success);
    assert.deepEqual([r.data.medios, r.data.descuentos, r.data.impuestos, r.data.impresoras], [null, null, null, null]);
    assert.equal(SemillaSchema.safeParse({ ...v1, version: 3 }).success, false);
  });

  test("la versión 2 trae lo nuevo, validado como al teclearlo", () => {
    assert.ok(v2().medios);
    const s = { ...v2(), impresoras: [{ ...v2().impresoras![0]!, ip: "8.8.8.8" }] };
    assert.equal(SemillaSchema.safeParse(s).success, false, "una impresora con IP pública no entra");
    assert.equal(SemillaSchema.safeParse({ ...v2(), impuestos: [{ impuesto: "IGTF", code: "GENERAL", basisPoints: 300, desde: null }] }).success, false);
  });
});

describe("las casillas (B7-7)", () => {
  test("cada lista dice sus elementos por su nombre", () => {
    const e = elementosDeSemilla(v2());
    assert.deepEqual(e.MEDIOS, ["Efectivo $", "Pago Móvil", DATOS_PAGO_MOVIL, "Terminal Banesco 1"]);
    assert.deepEqual(e.IMPUESTOS, ["IVA general 16 %", "IGTF 0 %"]);
    assert.deepEqual(e.PRODUCTOS, ["Malta", "Prueba B97 Jugo"]);
    assert.equal(nombreDeImpuesto({ impuesto: "IVA", code: "GENERAL", basisPoints: 1550, desde: "2026-11-01" }), "IVA general 15,5 % desde 2026-11-01");
  });

  test("lo desmarcado no viaja; una parte entera fuera, tampoco", () => {
    const r = recortarSemilla(v2(), {
      partes: ["IMPRESORAS"],
      elementos: { PRODUCTOS: ["Prueba B97 Jugo"], CATEGORIAS: ["Prueba B97"], MEDIOS: [DATOS_PAGO_MOVIL, "Terminal Banesco 1"] },
    });
    assert.deepEqual(r.productos.map((p) => p.nombre), ["Malta"]);
    assert.deepEqual(r.categorias, ["Bebidas"]);
    assert.equal(r.medios?.pagoMovil, null);
    assert.deepEqual(r.medios?.terminales, []);
    assert.equal(r.medios?.medios.length, 2);
    assert.equal(r.impresoras, null);
    assert.ok(SemillaSchema.safeParse(r).success, "la recortada es una semilla válida");
  });

  test("una lista que se queda sin nada no viaja", () => {
    const r = recortarSemilla(v2(), { partes: [], elementos: { IMPUESTOS: ["IVA general 16 %", "IGTF 0 %"], DESCUENTOS: ["Zelle 10 %"] } });
    assert.deepEqual([r.impuestos, r.descuentos], [null, null]);
    const sinMedios = recortarSemilla(v2(), { partes: [], elementos: { MEDIOS: elementosDeSemilla(v2()).MEDIOS } });
    assert.equal(sinMedios.medios, null);
  });
});
