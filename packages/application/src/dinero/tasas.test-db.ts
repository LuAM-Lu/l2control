/**
 * Las tasas de cambio en el servidor (B2-1: F3-03, F3-04, F3-05) contra l2control_test.
 *
 * Se prueba lo que impide: cobrar con una tasa sin confirmar o de ayer, que capture quien cobra,
 * confirmar un salto grande sin teclearlo otra vez, que supervisión confirme sin autorización y
 * que una tasa nueva cambie lo que ya estaba confirmado.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { addDays, calendarDay, rateOfDay, type RateRecord } from "@l2/domain-rates";
import type { ExchangeRateDto } from "@l2/contracts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import type { Contexto } from "../contexto.ts";
import { ZONA_DEL_LOCAL } from "./tasas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let admin: string;
let ctxAdmin: Contexto, ctxSupervisor: Contexto, ctxCajera: Contexto;

const hoy = () => calendarDay(new Date().toISOString(), ZONA_DEL_LOCAL);
const captura = (value: string, effectiveDate = hoy(), pair = "USD/VES") => ({ pair, value, source: "BCV", effectiveDate });

/** La tasa con la que cobraría la caja ahora mismo, leída del servidor. */
async function tasaDelDia(pair: "USD/VES" | "USDT/VES" = "USD/VES"): Promise<RateRecord | null> {
  const h = await local.app.tasas.leer(local.sistema);
  return rateOfDay(h.tasas, pair, hoy(), new Date(Date.now() + 1000).toISOString());
}

async function capturada(ctx: Contexto, value: string, dia?: string): Promise<ExchangeRateDto> {
  const r = await local.app.tasas.capturar(ctx, captura(value, dia));
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
}

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Tasas");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  // Un equipo por persona: un equipo tiene una sola sesión abierta (DEC-17).
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Supervisión"), supervisor, "5937");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(() => local.cerrar());

describe("sin tasa del día no se cobra (F3-05)", () => {
  test("un local sin tasas no tiene ninguna con la que cobrar, y no se inventa", async () => {
    const h = await local.app.tasas.leer(local.sistema);
    assert.deepEqual(h.tasas, []);
    assert.equal(h.zonaHoraria, "America/Caracas");
    assert.equal(await tasaDelDia(), null);
  });

  test("la de ayer, aunque se confirmara, no sirve hoy", async () => {
    const ayer = addDays(hoy(), -1);
    const ahoraAyer = Date.now() - 86_400_000;
    const c = await local.app.tasas.capturar(ctxAdmin, captura("220.00", ayer), ahoraAyer);
    assert.ok(c.ok, JSON.stringify(c));
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "220.00" }, undefined, ahoraAyer + 60_000);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(await tasaDelDia(), null);
  });
});

describe("capturar (F3-04)", () => {
  test("quien cobra no mueve la tasa (§7.5): la cajera no captura, y queda el intento", async () => {
    const r = await local.app.tasas.capturar(ctxCajera, captura("228.41"));
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxCajera.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "tasa.capturar" && a.outcome === "NEGADO"));
  });

  test("entra sin confirmar, a nombre de quien la capturó, y la caja todavía no la usa", async () => {
    const t = await capturada(ctxAdmin, "228.41");
    assert.equal(t.confirmed, false);
    assert.equal(t.capturedBy, "Abigail Karam");
    assert.equal(t.effectiveDate, hoy());
    assert.equal(await tasaDelDia(), null);
  });

  test("ni para un día pasado ni con más de una semana de adelanto", async () => {
    for (const dia of [addDays(hoy(), -1), addDays(hoy(), 8)]) {
      const r = await local.app.tasas.capturar(ctxAdmin, captura("228.41", dia));
      assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO", dia);
    }
  });

  test("lo que llega del navegador se revalida: sin cero, sin coma, sin firmar por otro", async () => {
    for (const entrada of [
      captura("0.00"),
      captura("228,41"),
      { ...captura("228.41"), capturedBy: "Otra persona" },
      { ...captura("228.41"), confirmed: true },
    ]) {
      const r = await local.app.tasas.capturar(ctxAdmin, entrada);
      assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO", JSON.stringify(entrada));
    }
  });
});

describe("confirmar (F3-04) y la doble verificación (§5.2, T2)", () => {
  let primera: ExchangeRateDto;

  test("la primera de hoy tras la de ayer, dentro del umbral, se confirma de una vez", async () => {
    primera = await capturada(ctxAdmin, "228.41");
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: primera.id });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmedBy, "Abigail Karam");
    assert.equal((await tasaDelDia())?.value, "228.41");
  });

  test("confirmar dos veces no se puede", async () => {
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: primera.id });
    assert.equal(r.ok ? "ok" : r.motivo, "CONFLICTO");
  });

  test("un dedo de más (×10) exige teclearla otra vez, y que coincida", async () => {
    const mala = await capturada(ctxAdmin, "2284.10");
    const sinTeclear = await local.app.tasas.confirmar(ctxAdmin, { rateId: mala.id });
    assert.equal(sinTeclear.ok ? "ok" : sinTeclear.problemas?.[0]?.path[0], "valorVerificado");
    const distinta = await local.app.tasas.confirmar(ctxAdmin, { rateId: mala.id, valorVerificado: "228.41" });
    assert.equal(distinta.ok, false);
    // Mientras tanto, la caja sigue con la buena.
    assert.equal((await tasaDelDia())?.value, "228.41");
  });

  test("teclearla con otra escritura del mismo valor sí vale («2300.500»)", async () => {
    const otra = await capturada(ctxAdmin, "2300.5");
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: otra.id, valorVerificado: "2300.500" });
    assert.ok(r.ok, JSON.stringify(r));
  });

  test("corregir es capturar otra: la más nueva confirmada es la del día, y la anterior no cambia (F3-03)", async () => {
    const antes = (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.id === primera.id);
    // Contra 2300,5 la vuelta a 228,90 es otro salto grande: se teclea.
    const buena = await capturada(ctxAdmin, "228.90");
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: buena.id, valorVerificado: "228.90" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await tasaDelDia())?.id, buena.id);
    const despues = (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.id === primera.id);
    assert.deepEqual(despues, antes);
  });

  test("una tasa de un día que pasó sin confirmar ya no se confirma", async () => {
    const ahoraAyer = Date.now() - 86_400_000;
    const c = await local.app.tasas.capturar(ctxAdmin, captura("221.00", addDays(hoy(), -1)), ahoraAyer + 1000);
    assert.ok(c.ok, JSON.stringify(c));
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "221.00" });
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });

  test("la de mañana se confirma hoy, pero la caja no la usa hasta mañana", async () => {
    const manana = await capturada(ctxAdmin, "229.10", addDays(hoy(), 1));
    const r = await local.app.tasas.confirmar(ctxAdmin, { rateId: manana.id });
    assert.ok(r.ok, JSON.stringify(r));
    assert.notEqual((await tasaDelDia())?.id, manana.id);
  });

  test("una tasa que no existe, o un id que no es de la base, no se confirma", async () => {
    for (const rateId of ["0199a0c0-0000-7000-8000-000000000000", "no-es-un-uuid"]) {
      const r = await local.app.tasas.confirmar(ctxAdmin, { rateId });
      assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    }
  });
});

describe("supervisión confirma con autorización (🔐, §7.3)", () => {
  let pendiente: ExchangeRateDto;
  const motivo = "La administradora no está en el local";

  before(async () => {
    pendiente = await capturada(ctxSupervisor, "229.00");
  });

  test("supervisión sí captura (una pendiente no cobra nada)", () => {
    assert.equal(pendiente.capturedBy, "Luis Guerrero");
  });

  test("la cajera no confirma ni con autorización", async () => {
    const r = await local.app.tasas.confirmar(ctxCajera, { rateId: pendiente.id }, { autorizadorId: admin, pin: "4826", motivo });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("sin autorización, supervisión no confirma", async () => {
    const r = await local.app.tasas.confirmar(ctxSupervisor, { rateId: pendiente.id });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("la lista de quién autoriza incluye a la administración; la administración no necesita a nadie", async () => {
    const lista = await local.app.tasas.autorizadores(ctxSupervisor);
    assert.ok(lista.some((p) => p.nombre === "Abigail Karam"), JSON.stringify(lista));
    assert.deepEqual(await local.app.tasas.autorizadores(ctxAdmin), []);
  });

  test("con un PIN equivocado se niega, y la tasa sigue pendiente", async () => {
    const r = await local.app.tasas.confirmar(ctxSupervisor, { rateId: pendiente.id }, { autorizadorId: admin, pin: "0000", motivo });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    const t = (await local.app.tasas.leer(local.sistema)).tasas.find((x) => x.id === pendiente.id);
    assert.equal(t?.confirmed, false);
  });

  test("con el PIN de la administración queda confirmada, y dice quién autorizó", async () => {
    const r = await local.app.tasas.confirmar(ctxSupervisor, { rateId: pendiente.id }, { autorizadorId: admin, pin: "4826", motivo });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmedBy, "Luis Guerrero");
    assert.equal(r.valor.authorizedBy, "Abigail Karam");
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "exchange_rate", entityId: pendiente.id });
    assert.ok(asientos.some((a) => a.action === "tasa.confirmar" && a.outcome === "HECHO" && a.authorizedBy === admin));
  });
});
