import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { DiningTableDto, FamilyAccountDto, PedidoDto } from "@l2/contracts";
import { avisosDelSalon, platosSinServir, textoDePlatos } from "./mesas.ts";
import { ninosEnSalaDeLaCuenta } from "../cuentas/cuentas.ts";

/**
 * Los avisos suaves del salón (B6-14, M-35): uno por mesa y por umbral, a quien le toca, y lo que falta servir que la
 * caja enseña al cobrar.
 */

const T0 = Date.parse("2026-10-09T18:00:00.000Z");
const min = (m: number) => new Date(T0 + m * 60_000).toISOString();
const UMBRALES = { sinPedirMin: 15, esperaMin: 20, cuentaMin: 10, limpiarMin: 10 };
const plano = [{ id: "m3", label: "3" }] as unknown as DiningTableDto[];

function cuenta(c: Partial<FamilyAccountDto> & { id: string }): FamilyAccountDto {
  return { kind: "MESA", tableId: "m3", family: "Familia Prueba", status: "ABIERTA", openedAt: min(0), lines: [], sessionIds: [], closedSessionIds: [], mode: "POSPAGO", ...c } as unknown as FamilyAccountDto;
}
function pedido(id: string, cuentaId: string, enviadoEn: string, servidos: boolean[]): PedidoDto {
  return {
    id,
    cuentaId,
    enviadoEn,
    servido: null,
    lineas: servidos.map((s, i) => ({ productId: `p${i}`, nombre: i === 0 ? "Jugo natural" : "Pasta", cantidad: 1, servido: s ? { en: enviadoEn, por: "Mesero", sinHora: false } : null })),
  } as unknown as PedidoDto;
}

describe("los avisos del salón (B6-14)", () => {
  test("al salón: sin pedir y esperando, pasado su umbral; antes, nada", () => {
    const sentada = cuenta({ id: "a" });
    const datos = { cuentas: [sentada], pedidos: [], plano, porLimpiar: new Map<string, string>() };
    assert.deepEqual(avisosDelSalon("SALON", datos, T0 + 14 * 60_000, UMBRALES), []);
    assert.deepEqual(
      avisosDelSalon("SALON", datos, T0 + 15 * 60_000, UMBRALES).map((a) => [a.clave, a.texto]),
      [["SIN_PEDIR:a", "Mesa 3 lleva 15 min sin pedir"]],
    );
    // Con un pedido sin servir, el aviso es el de la espera, y su clave es la del pedido: uno nuevo es otro aviso.
    const conPedido = { ...datos, pedidos: [pedido("p1", "a", min(5), [false, true])] };
    assert.deepEqual(avisosDelSalon("SALON", conPedido, T0 + 24 * 60_000, UMBRALES), []);
    assert.deepEqual(
      avisosDelSalon("SALON", conPedido, T0 + 25 * 60_000, UMBRALES).map((a) => [a.clave, a.texto]),
      [["ESPERANDO:p1", "Mesa 3 espera su pedido hace 20 min"]],
    );
    // Servido todo, no espera nada.
    assert.deepEqual(avisosDelSalon("SALON", { ...datos, pedidos: [pedido("p1", "a", min(5), [true, true])] }, T0 + 60 * 60_000, UMBRALES), []);
  });

  test("la mesa por limpiar avisa al salón; la cuenta que pidió y no se cobra, a la caja", () => {
    const porLimpiar = new Map([["m3", min(0)]]);
    const pide = cuenta({ id: "b", status: "POR_COBRAR", pendingSince: min(2) });
    const datos = { cuentas: [pide], pedidos: [], plano, porLimpiar };
    const ahora = T0 + 12 * 60_000;
    assert.deepEqual(avisosDelSalon("SALON", datos, ahora, UMBRALES).map((a) => a.clave), [`LIMPIAR:m3:${min(0)}`]);
    assert.deepEqual(avisosDelSalon("CAJA", datos, ahora, UMBRALES).map((a) => [a.clave, a.texto]), [[`CUENTA:b:${min(2)}`, "Mesa 3 pidió la cuenta hace 10 min"]]);
    // Una cuenta del parque o del mostrador no es del salón: la caja no oye de ella aquí.
    const delParque = cuenta({ id: "c", kind: "FAMILIA", status: "POR_COBRAR", pendingSince: min(0) } as Partial<FamilyAccountDto> & { id: string });
    assert.deepEqual(avisosDelSalon("CAJA", { ...datos, cuentas: [delParque] }, ahora, UMBRALES), []);
  });

  test("sin reloj todavía, ningún aviso", () => {
    assert.deepEqual(avisosDelSalon("SALON", { cuentas: [cuenta({ id: "a" })], pedidos: [], plano, porLimpiar: new Map() }, 0, UMBRALES), []);
  });
});

describe("lo que falta servir (B6-13, B6-14)", () => {
  test("por pedido, lo que no se marcó; en palabras, junto por nombre", () => {
    const c = cuenta({ id: "a" });
    const platos = platosSinServir(c, [pedido("p1", "a", min(0), [false, true]), pedido("p2", "a", min(3), [false, false]), pedido("p3", "otra", min(3), [false])]);
    assert.deepEqual(platos.map((x) => [x.pedido.id, x.lineas]), [["p1", [0]], ["p2", [0, 1]]]);
    assert.equal(textoDePlatos(platos), "2× Jugo natural, 1× Pasta");
  });
});

describe("cobrar una mesa con niños en la sala (B6-14)", () => {
  test("avisa de los que siguen en la sala con lo suyo en la cuenta; no de los que pagaron aparte ni de los que salieron", () => {
    const linea = (sessionId: string) => ({ id: `l-${sessionId}`, sessionId }) as unknown as FamilyAccountDto["lines"][number];
    const mesa = cuenta({ id: "a", sessionIds: ["s1", "s2", "s3"], lines: [linea("s1"), linea("s3")] });
    const enSala = [{ id: "s1" }, { id: "s2" }];
    // s1: en la sala y en la cuenta; s2: en la sala, pagado aparte; s3: en la cuenta, ya salió.
    assert.deepEqual(ninosEnSalaDeLaCuenta(mesa, enSala).map((s) => s.id), ["s1"]);
    assert.deepEqual(ninosEnSalaDeLaCuenta(cuenta({ id: "b", kind: "MOSTRADOR", dePie: true }), enSala), []);
  });
});
