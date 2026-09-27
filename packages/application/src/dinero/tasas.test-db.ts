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
import type { Lector } from "./fuentes.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let admin: string;
let ctxAdmin: Contexto, ctxSupervisor: Contexto, ctxCajera: Contexto;

/**
 * Reloj fijo: miércoles 23 de septiembre de 2026, 10:00 am en Caracas. Con la hora real, que la
 * tasa del viernes cubra el fin de semana haría que estas pruebas dieran otra cosa según el día
 * de la semana en que corran. Cada llamada avanza un segundo: dos capturas no comparten instante.
 */
let reloj = Date.parse("2026-09-23T14:00:00.000Z");
const ahora = () => (reloj += 1000);
const hoy = () => calendarDay(new Date(reloj).toISOString(), ZONA_DEL_LOCAL);
const capturar = (ctx: Contexto, entrada: unknown, instante = ahora()) => local.app.tasas.capturar(ctx, entrada, instante);
const confirmar = (ctx: Contexto, entrada: unknown, aut?: unknown, instante = ahora()) =>
  local.app.tasas.confirmar(ctx, entrada, aut, instante);
const captura = (value: string, effectiveDate = hoy(), pair = "USD/VES") => ({ pair, value, source: "BCV", effectiveDate });

/** La tasa con la que cobraría la caja ahora mismo, leída del servidor. */
async function tasaDelDia(pair: "USD/VES" | "USDT/VES" = "USD/VES"): Promise<RateRecord | null> {
  const h = await local.app.tasas.leer(local.sistema);
  return rateOfDay(h.tasas, pair, hoy(), new Date(reloj + 1000).toISOString());
}

async function capturada(ctx: Contexto, value: string, dia?: string): Promise<ExchangeRateDto> {
  const r = await capturar(ctx, captura(value, dia));
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
    const ahoraAyer = reloj - 86_400_000;
    const c = await capturar(ctxAdmin, captura("220.00", ayer), ahoraAyer);
    assert.ok(c.ok, JSON.stringify(c));
    const r = await confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "220.00" }, undefined, ahoraAyer + 60_000);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(await tasaDelDia(), null);
  });
});

describe("capturar (F3-04)", () => {
  test("quien cobra no mueve la tasa (§7.5): la cajera no captura, y queda el intento", async () => {
    const r = await capturar(ctxCajera, captura("228.41"));
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
      const r = await capturar(ctxAdmin, captura("228.41", dia));
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
      const r = await capturar(ctxAdmin, entrada);
      assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO", JSON.stringify(entrada));
    }
  });
});

describe("confirmar (F3-04) y la doble verificación (§5.2, T2)", () => {
  let primera: ExchangeRateDto;

  test("la primera de hoy tras la de ayer, dentro del umbral, se confirma de una vez", async () => {
    primera = await capturada(ctxAdmin, "228.41");
    const r = await confirmar(ctxAdmin, { rateId: primera.id });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmedBy, "Abigail Karam");
    assert.equal((await tasaDelDia())?.value, "228.41");
  });

  test("confirmar dos veces no se puede", async () => {
    const r = await confirmar(ctxAdmin, { rateId: primera.id });
    assert.equal(r.ok ? "ok" : r.motivo, "CONFLICTO");
  });

  test("un dedo de más (×10) exige teclearla otra vez, y que coincida", async () => {
    const mala = await capturada(ctxAdmin, "2284.10");
    const sinTeclear = await confirmar(ctxAdmin, { rateId: mala.id });
    assert.equal(sinTeclear.ok ? "ok" : sinTeclear.problemas?.[0]?.path[0], "valorVerificado");
    const distinta = await confirmar(ctxAdmin, { rateId: mala.id, valorVerificado: "228.41" });
    assert.equal(distinta.ok, false);
    // Mientras tanto, la caja sigue con la buena.
    assert.equal((await tasaDelDia())?.value, "228.41");
  });

  test("teclearla con otra escritura del mismo valor sí vale («2300.500»)", async () => {
    const otra = await capturada(ctxAdmin, "2300.5");
    const r = await confirmar(ctxAdmin, { rateId: otra.id, valorVerificado: "2300.500" });
    assert.ok(r.ok, JSON.stringify(r));
  });

  test("corregir es capturar otra: la más nueva confirmada es la del día, y la anterior no cambia (F3-03)", async () => {
    const antes = (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.id === primera.id);
    // Contra 2300,5 la vuelta a 228,90 es otro salto grande: se teclea.
    const buena = await capturada(ctxAdmin, "228.90");
    const r = await confirmar(ctxAdmin, { rateId: buena.id, valorVerificado: "228.90" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await tasaDelDia())?.id, buena.id);
    const despues = (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.id === primera.id);
    assert.deepEqual(despues, antes);
  });

  test("una tasa de un día que pasó sin confirmar ya no se confirma", async () => {
    const ahoraAyer = reloj - 86_400_000;
    const c = await capturar(ctxAdmin, captura("221.00", addDays(hoy(), -1)), ahoraAyer + 1000);
    assert.ok(c.ok, JSON.stringify(c));
    const r = await confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "221.00" });
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });

  test("la de mañana se confirma hoy, pero la caja no la usa hasta mañana", async () => {
    const manana = await capturada(ctxAdmin, "229.10", addDays(hoy(), 1));
    const r = await confirmar(ctxAdmin, { rateId: manana.id });
    assert.ok(r.ok, JSON.stringify(r));
    assert.notEqual((await tasaDelDia())?.id, manana.id);
  });

  test("una tasa que no existe, o un id que no es de la base, no se confirma", async () => {
    for (const rateId of ["0199a0c0-0000-7000-8000-000000000000", "no-es-un-uuid"]) {
      const r = await confirmar(ctxAdmin, { rateId });
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
    const r = await confirmar(ctxCajera, { rateId: pendiente.id }, { autorizadorId: admin, pin: "4826", motivo });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("sin autorización, supervisión no confirma", async () => {
    const r = await confirmar(ctxSupervisor, { rateId: pendiente.id });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("la lista de quién autoriza incluye a la administración; la administración no necesita a nadie", async () => {
    const lista = await local.app.tasas.autorizadores(ctxSupervisor);
    assert.ok(lista.some((p) => p.nombre === "Abigail Karam"), JSON.stringify(lista));
    assert.deepEqual(await local.app.tasas.autorizadores(ctxAdmin), []);
  });

  test("con un PIN equivocado se niega, y la tasa sigue pendiente", async () => {
    const r = await confirmar(ctxSupervisor, { rateId: pendiente.id }, { autorizadorId: admin, pin: "0000", motivo });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    const t = (await local.app.tasas.leer(local.sistema)).tasas.find((x) => x.id === pendiente.id);
    assert.equal(t?.confirmed, false);
  });

  test("con el PIN de la administración queda confirmada, y dice quién autorizó", async () => {
    const r = await confirmar(ctxSupervisor, { rateId: pendiente.id }, { autorizadorId: admin, pin: "4826", motivo });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmedBy, "Luis Guerrero");
    assert.equal(r.valor.authorizedBy, "Abigail Karam");
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "exchange_rate", entityId: pendiente.id });
    assert.ok(asientos.some((a) => a.action === "tasa.confirmar" && a.outcome === "HECHO" && a.authorizedBy === admin));
  });
});

/* ── traer la tasa del BCV (F3-04), con fuentes simuladas ── */

type Fuente = "BCV" | "DOLARAPI";
const lector = (fuente: Fuente, value: string, effectiveDate: string) => async () => ({
  ok: true as const,
  lectura: { fuente, pair: "USD/VES" as const, value, effectiveDate, crudo: { prueba: "sí" } },
});
const caido = (fuente: Fuente) => async () => ({ ok: false as const, fuente, error: `${fuente} no respondió a tiempo.` });
const sincronizar = (ctx: Contexto, fuentes: readonly Lector[]) => local.app.tasas.sincronizar(ctx, { fuentes, ahora: ahora() });

describe("traer la tasa del BCV (F3-04)", () => {
  // El reloj va por el miércoles 23; el jueves 24 es «mañana».
  test("dos fuentes que coinciden: se captura una, PENDIENTE, y dice que la verificaron dos", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "300.50000000", "2026-09-24"), lector("DOLARAPI", "300.5", "2026-09-24")]);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.capturadas.length, 1);
    const t = r.valor.capturadas[0]!;
    assert.equal(t.confirmed, false);
    assert.equal(t.source, "BCV");
    assert.equal(t.capturedBy, "Sincronización BCV (2 fuentes)");
    assert.equal(t.effectiveDate, "2026-09-24");
  });

  test("traerla otra vez no la repite", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "300.50000000", "2026-09-24"), lector("DOLARAPI", "300.5", "2026-09-24")]);
    assert.ok(r.ok);
    assert.equal(r.valor.capturadas.length, 0);
    assert.deepEqual(r.valor.yaEstaban.map((y) => y.effectiveDate), ["2026-09-24"]);
  });

  test("si dos fuentes dicen cosas distintas del mismo día, no se captura nada de ese día (T6)", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "310.00", "2026-09-25"), lector("DOLARAPI", "320.00", "2026-09-25")]);
    assert.ok(r.ok);
    assert.equal(r.valor.capturadas.length, 0);
    assert.match(r.valor.avisos[0] ?? "", /no coinciden/);
  });

  test("si una fuente cae, se sigue con la otra y se dice cuál cayó", async () => {
    const r = await sincronizar(ctxSupervisor, [caido("BCV"), lector("DOLARAPI", "305.25", "2026-09-28")]);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.capturadas[0]?.capturedBy, "Sincronización DolarApi");
    assert.deepEqual(r.valor.fuentes.map((f) => [f.fuente, f.ok]), [["BCV", false], ["DOLARAPI", true]]);
  });

  test("si ninguna responde, se pide cargarla a mano (una comodidad, nunca una dependencia)", async () => {
    const r = await sincronizar(ctxAdmin, [caido("BCV"), caido("DOLARAPI")]);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    if (!r.ok) assert.match(r.mensaje, /a mano/);
  });

  test("lo que ya no rige o queda muy lejos se ignora", async () => {
    // El domingo 20 ya no rige el miércoles (el lunes 21 fue día hábil); el 10 de octubre queda lejos.
    const r = await sincronizar(ctxAdmin, [lector("BCV", "290.00", "2026-09-20"), lector("DOLARAPI", "400.00", "2026-10-10")]);
    assert.ok(r.ok);
    assert.equal(r.valor.capturadas.length, 0);
  });

  test("quien cobra no la trae", async () => {
    const r = await sincronizar(ctxCajera, [lector("BCV", "300.50", "2026-09-24")]);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("lo traído no cobra hasta que alguien lo confirma", async () => {
    const antes = await tasaDelDia();
    const r = await sincronizar(ctxAdmin, [lector("BCV", "299.99", hoy())]);
    assert.ok(r.ok);
    assert.equal((await tasaDelDia())?.id, antes?.id);
  });
});

describe("el fin de semana cobra con la del viernes", () => {
  test("la del viernes, confirmada el sábado, rige sábado y domingo; el lunes, no", async () => {
    reloj = Date.parse("2026-09-25T20:00:00.000Z"); // viernes 25, 4:00 pm
    const c = await capturar(ctxAdmin, captura("301.00", "2026-09-25"));
    assert.ok(c.ok, JSON.stringify(c));
    reloj = Date.parse("2026-09-26T14:00:00.000Z"); // sábado 26
    const r = await confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "301.00" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await tasaDelDia())?.id, c.valor.id);
    reloj = Date.parse("2026-09-27T14:00:00.000Z"); // domingo 27
    assert.equal((await tasaDelDia())?.id, c.valor.id);
    reloj = Date.parse("2026-09-28T14:00:00.000Z"); // lunes 28: la del lunes sigue pendiente (la trajo DolarApi)
    assert.notEqual((await tasaDelDia())?.id, c.valor.id);
  });
});
