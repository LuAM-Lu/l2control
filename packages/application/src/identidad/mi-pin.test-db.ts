/**
 * Cambiar el PIN propio desde «Mi cuenta» (T-14, M-27, P-17) contra l2control_test.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { abrirLocalDePrueba, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let cajera: string;
let mesero: string;
let equipo: string;
const T0 = Date.parse("2026-10-07T18:00:00.000Z");
const MIN = 60_000;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Mi PIN");
  cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  mesero = await crearPersona(local, { nombre: "Jesús Mendoza", role: "MESERO", pin: "5284" });
  equipo = await crearEquipo(local, "Laptop caja");
});

after(() => local.cerrar());

async function sesionDe(userId: string, pin: string, ahora = T0) {
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId, pin, ip: null, ahora });
  assert.ok(r.ok, JSON.stringify(r));
  return r.credencial;
}
const cambiar = (sesion: string | null, pinActual: unknown, pinNuevo: unknown, ahora = T0) =>
  local.app.sesiones.cambiarPin({ sesion, pinActual, pinNuevo, ip: null, ahora });

describe("mi PIN", () => {
  test("con el actual, cambia: entra con el nuevo y no con el viejo; queda en su historial y en la auditoría, sin el PIN", async () => {
    const sesion = await sesionDe(cajera, "7391");
    const r = await cambiar(sesion, "7391", "6058");
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await local.app.sesiones.entrar({ dispositivo: equipo, userId: cajera, pin: "7391", ip: null, ahora: T0 + MIN })).ok, false);
    assert.ok((await local.app.sesiones.entrar({ dispositivo: equipo, userId: cajera, pin: "6058", ip: null, ahora: T0 + MIN })).ok);
    const cambios = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUserChange.findMany({ where: { userId: cajera, kind: "PIN" } }));
    assert.deepEqual(cambios.map((c) => c.reason), ["Cambió su PIN desde Mi cuenta"]);
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "staff_user", entityId: cajera });
    assert.ok(asientos.some((a) => a.action === "usuario.pin"));
    const contenido = JSON.stringify(asientos.map((a) => [a.before, a.after, a.reason]));
    assert.ok(!contenido.includes('"6058"') && !contenido.includes('"7391"'), contenido);
  });

  test("el nuevo pasa las reglas: ni trivial, ni el mismo, ni con letras; y no se cambia nada", async () => {
    const sesion = await sesionDe(mesero, "5284");
    for (const [nuevo, motivo] of [["1234", /fácil de adivinar/], ["5284", /el mismo/], ["12a4", /dígitos/], ["123", /4 dígitos/]] as const) {
      const r = await cambiar(sesion, "5284", nuevo);
      assert.ok(!r.ok && r.motivo === "INVALIDO", nuevo);
      assert.match(r.mensaje, motivo);
    }
    assert.ok((await local.app.sesiones.entrar({ dispositivo: equipo, userId: mesero, pin: "5284", ip: null, ahora: T0 + MIN })).ok);
  });

  test("el actual errado cuenta para el bloqueo del acceso; bloqueado, ni el correcto cambia nada", async () => {
    const sesion = await sesionDe(mesero, "5284", T0 + 2 * MIN);
    let ultimo;
    for (let i = 0; i < 4; i++) ultimo = await cambiar(sesion, "0000", "6058", T0 + 2 * MIN + i);
    assert.ok(ultimo && !ultimo.ok && ultimo.bloqueo?.bloqueado, JSON.stringify(ultimo));
    const correcto = await cambiar(sesion, "5284", "6058", T0 + 2 * MIN + 10);
    assert.ok(!correcto.ok && correcto.bloqueo?.bloqueado, JSON.stringify(correcto));
    // El bloqueo es el mismo del acceso: tampoco entra.
    assert.equal((await local.app.sesiones.entrar({ dispositivo: equipo, userId: mesero, pin: "5284", ip: null, ahora: T0 + 2 * MIN + 20 })).ok, false);
  });

  test("sin sesión no se cambia nada", async () => {
    const r = await cambiar(null, "7391", "6058");
    assert.ok(!r.ok && r.motivo === "NO_PERMITIDO");
  });
});
