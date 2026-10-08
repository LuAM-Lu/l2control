/**
 * La matriz de permisos contra PLAN §7.3, celda por celda — B7-5 (F10-06).
 *
 * PLAN §7.3: «Cada celda ✅/🔐 de esta tabla debe tener su prueba negativa en CI: el rol que tiene ❌ recibe
 * 403». Aquí la tabla del PLAN está COPIADA (no derivada de `MATRIZ`): si alguien cambia una celda de la matriz
 * sin cambiar el plan, esta prueba lo dice. Las acciones que añadieron decisiones posteriores van aparte, cada
 * una con su decisión, y una acción nueva que no esté en ninguna de las dos tablas también falla.
 *
 * Es la matriz de fábrica: Roles y accesos (T-7) puede ajustarla por local, salvo las acciones intocables.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MATRIZ, can, isReachable, type Action, type Actor, type Role } from "./permissions.ts";

const ROLES: readonly Role[] = ["ADMIN", "SUPERVISOR", "CAJERO", "MESERO", "MONITOR_PARQUE", "COCINA"];
type Celda = "✅" | "🔐" | "❌";
type Fila = readonly [Celda, Celda, Celda, Celda, Celda, Celda];

/** PLAN §7.3, en el orden de sus columnas: Admin, Supervisor, Cajero, Mesero, Monitor parque, Cocina. */
const PLAN: Readonly<Partial<Record<Action, Fila>>> = {
  // Abrir / cerrar turno de caja
  "turno.abrir": ["✅", "✅", "✅", "❌", "❌", "❌"],
  "turno.corteX": ["✅", "✅", "✅", "❌", "❌", "❌"],
  "turno.corteZ": ["✅", "✅", "🔐", "❌", "❌", "❌"],
  "pedido.tomar": ["✅", "✅", "✅", "✅", "❌", "❌"],
  "pedido.enviarCocina": ["✅", "✅", "✅", "✅", "❌", "❌"],
  "pedido.anularNoEnviado": ["✅", "✅", "✅", "✅", "❌", "❌"],
  "pedido.anularEnProduccion": ["✅", "🔐", "🔐", "🔐", "❌", "❌"],
  "cuenta.descuento": ["✅", "🔐", "🔐", "❌", "❌", "❌"],
  "cuenta.cortesia": ["✅", "🔐", "🔐", "❌", "❌", "❌"],
  // Emitir documento fiscal (cobrar) — DEC-25
  "documento.emitir": ["✅", "✅", "✅", "❌", "❌", "❌"],
  "documento.notaCredito": ["✅", "🔐", "❌", "❌", "❌", "❌"],
  "documento.reimprimir": ["✅", "🔐", "🔐", "❌", "❌", "❌"],
  // Anular un cobro (DEC-24)
  "cobro.anular": ["✅", "🔐", "🔐", "❌", "❌", "❌"],
  "mesa.reabrir": ["✅", "🔐", "❌", "❌", "❌", "❌"],
  "kds.cambiarEstado": ["✅", "✅", "❌", "❌", "❌", "✅"],
  // Check-in / check-out de niño
  "parque.checkIn": ["✅", "✅", "✅", "❌", "✅", "❌"],
  "parque.checkOut": ["✅", "✅", "✅", "❌", "✅", "❌"],
  "parque.extenderSinCobro": ["✅", "🔐", "❌", "❌", "🔐", "❌"],
  // Vincular pulsera a mesa
  "parque.vincularMesa": ["✅", "✅", "✅", "✅", "✅", "❌"],
  "tasa.confirmar": ["✅", "🔐", "❌", "❌", "❌", "❌"],
  // Modificar precios o recetas
  "catalogo.modificar": ["✅", "❌", "❌", "❌", "❌", "❌"],
  "inventario.ajustar": ["✅", "🔐", "❌", "❌", "❌", "❌"],
  "reportes.verSucursal": ["✅", "✅", "❌", "❌", "❌", "❌"],
  "reportes.verTodas": ["✅", "❌", "❌", "❌", "❌", "❌"],
  // Gestionar usuarios y PIN
  "usuarios.gestionar": ["✅", "❌", "❌", "❌", "❌", "❌"],
  "camaras.ver": ["✅", "❌", "❌", "❌", "❌", "❌"],
  // Ver datos de contacto de representantes
  "parque.verContacto": ["✅", "✅", "❌", "❌", "✅", "❌"],
};

/** Lo que añadieron decisiones posteriores al plan, con la suya. */
const DESPUES: Readonly<Partial<Record<Action, { fila: Fila; decision: string }>>> = {
  "cuenta.incobrable": { fila: ["✅", "🔐", "🔐", "❌", "❌", "❌"], decision: "D-JOR" },
  "parque.cerrarHuerfana": { fila: ["✅", "✅", "❌", "❌", "❌", "❌"], decision: "F5-13, H-19" },
  "parque.anularEntrada": { fila: ["✅", "🔐", "❌", "❌", "❌", "❌"], decision: "B4-10, M-27 (P-7)" },
  "evento.reservar": { fila: ["✅", "✅", "✅", "❌", "❌", "❌"], decision: "B10-1, V-10" },
  "papel.revisar": { fila: ["✅", "✅", "❌", "❌", "❌", "❌"], decision: "B3-7, ADR-027" },
  "inventario.entrada": { fila: ["✅", "✅", "❌", "❌", "❌", "❌"], decision: "B9-3" },
  "inventario.catalogo": { fila: ["✅", "❌", "❌", "❌", "❌", "❌"], decision: "T-13, M-27 (P-15): ajustable" },
  "sistema.actualizar": { fila: ["✅", "❌", "❌", "❌", "❌", "❌"], decision: "T-8b, ADR-028" },
  "soporte.gestionar": { fila: ["✅", "❌", "❌", "❌", "❌", "❌"], decision: "T-11, M-27 (P-4), D-SOP: ajustable" },
};

const VALOR: Readonly<Record<Celda, string>> = { "✅": "PERMITIDO", "🔐": "REQUIERE_AUTORIZACION", "❌": "DENEGADO" };
const actor = (role: Role): Actor => ({ id: `u-${role}`, role, branchIds: ["b1"] });

function comprobar(accion: Action, fila: Fila, origen: string) {
  ROLES.forEach((rol, i) => {
    const celda = fila[i]!;
    test(`${origen} · ${rol} ${celda} ${accion}`, () => {
      assert.equal(MATRIZ[accion]?.[rol], VALOR[celda], `la matriz no dice lo que dice ${origen}`);
      assert.equal(can(actor(rol), accion, { branchId: "b1" }), VALOR[celda]);
      // El ❌ es «recibe 403»: ni lo hace ni se le ofrece pedir autorización.
      if (celda === "❌") assert.equal(isReachable(actor(rol), accion), false);
      else assert.equal(isReachable(actor(rol), accion), true);
      // Y en otra sucursal, nada (§7.3: un supervisor de la A no autoriza nada en la B).
      assert.equal(can(actor(rol), accion, { branchId: "b2" }), "DENEGADO");
    });
  });
}

describe("PLAN §7.3, celda por celda", () => {
  for (const [accion, fila] of Object.entries(PLAN) as [Action, Fila][]) comprobar(accion, fila, "PLAN §7.3");
});

describe("las acciones que llegaron después, con su decisión", () => {
  for (const [accion, { fila, decision }] of Object.entries(DESPUES) as [Action, { fila: Fila; decision: string }][]) comprobar(accion, fila, decision);
});

test("ninguna acción de la matriz queda sin su fila en el plan o en una decisión", () => {
  const conocidas = new Set([...Object.keys(PLAN), ...Object.keys(DESPUES)]);
  const sueltas = Object.keys(MATRIZ).filter((a) => !conocidas.has(a));
  assert.deepEqual(sueltas, [], "una acción nueva entra en DESPUES con su decisión");
});
