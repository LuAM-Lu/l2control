/**
 * Las tasas de cambio en el servidor (B2-1, B2-1c: F3-03, F3-04, F3-05, ADR-019) contra
 * l2control_test.
 *
 * Se prueba lo que impide: cobrar con una tasa sin confirmar o de ayer, que capture quien cobra,
 * aplicar un salto grande sin teclearlo otra vez, que supervisión confirme sin autorización, que
 * una tasa nueva cambie lo que ya estaba confirmado y que se aplique sola una tasa del BCV
 * sospechosa (solo de un tercero, la primera o con un salto de más del 10 %).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { addDays, calendarDay, rateOfDay, type RateRecord } from "@l2/domain-rates";
import type { ExchangeRateDto } from "@l2/contracts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import type { Contexto } from "../contexto.ts";
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
/** El local de las pruebas no publica ajustes: rige la zona de fábrica, Venezuela. */
const hoy = () => calendarDay(new Date(reloj).toISOString(), "America/Caracas");
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

let supervisor: string;
before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Tasas");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
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

  test("la de ayer, aunque se aplicara, no sirve hoy", async () => {
    const ayer = addDays(hoy(), -1);
    const ahoraAyer = reloj - 86_400_000;
    // La primera del local: administración la aplica al guardarla, tecleándola dos veces.
    const c = await capturar(ctxAdmin, { ...captura("220.00", ayer), valorVerificado: "220.00" }, ahoraAyer);
    assert.ok(c.ok, JSON.stringify(c));
    assert.equal(c.valor.confirmed, true);
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

  test("la de supervisión entra sin confirmar, a su nombre, y la caja todavía no la usa", async () => {
    const t = await capturada(ctxSupervisor, "228.41");
    assert.equal(t.confirmed, false);
    assert.equal(t.capturedBy, "Luis Guerrero");
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

describe("administración la aplica al guardarla (ADR-019 §5)", () => {
  let aplicada: ExchangeRateDto;

  test("dentro del umbral se aplica de una vez y la caja cobra con ella", async () => {
    // La vigente de referencia es la de ayer, 220,00: 228,50 salta un 3,9 %.
    const r = await capturar(ctxAdmin, captura("228.50"));
    assert.ok(r.ok, JSON.stringify(r));
    aplicada = r.valor;
    assert.equal(aplicada.confirmed, true);
    assert.equal(aplicada.confirmedBy, "Abigail Karam");
    assert.equal(aplicada.automatic, undefined);
    assert.equal((await tasaDelDia())?.value, "228.50");
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "exchange_rate", entityId: aplicada.id });
    assert.deepEqual(asientos.map((a) => a.action).sort(), ["tasa.capturar", "tasa.confirmar"]);
  });

  test("un dedo de más (×10) no se guarda hasta teclearla otra vez, y que coincida", async () => {
    const antes = (await local.app.tasas.leer(local.sistema)).tasas.length;
    const sinTeclear = await capturar(ctxAdmin, captura("2285.00"));
    assert.equal(sinTeclear.ok ? "ok" : sinTeclear.problemas?.[0]?.path[0], "valorVerificado");
    const distinta = await capturar(ctxAdmin, { ...captura("2285.00"), valorVerificado: "228.50" });
    assert.equal(distinta.ok ? "ok" : distinta.problemas?.[0]?.message, "No coincide");
    // Nada entró en el historial, y la caja sigue con la buena.
    assert.equal((await local.app.tasas.leer(local.sistema)).tasas.length, antes);
    assert.equal((await tasaDelDia())?.value, "228.50");
    const negados = await local.app.auditoria.listar(local.sistema, { actorId: ctxAdmin.quien!.userId! });
    assert.ok(negados.some((a) => a.action === "tasa.capturar" && a.outcome === "NEGADO"));
  });

  test("tecleada dos veces se aplica, y queda dicho que se verificó", async () => {
    const r = await capturar(ctxAdmin, { ...captura("2285.00"), valorVerificado: "2285" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmed, true);
    assert.equal((await tasaDelDia())?.value, "2285.00");
  });

  test("corregir es capturar otra: la anterior no cambia (F3-03)", async () => {
    const antes = (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.id === aplicada.id);
    const r = await capturar(ctxAdmin, { ...captura("228.60"), valorVerificado: "228.60" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await tasaDelDia())?.id, r.valor.id);
    const despues = (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.id === aplicada.id);
    assert.deepEqual(despues, antes);
  });
});

describe("confirmar una pendiente (F3-04) y la doble verificación (§5.2, T2)", () => {
  let primera: ExchangeRateDto;

  test("la de supervisión, dentro del umbral, administración la confirma de una vez", async () => {
    primera = await capturada(ctxSupervisor, "229.00");
    const r = await confirmar(ctxAdmin, { rateId: primera.id });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmedBy, "Abigail Karam");
    assert.equal((await tasaDelDia())?.value, "229.00");
  });

  test("confirmar dos veces no se puede", async () => {
    const r = await confirmar(ctxAdmin, { rateId: primera.id });
    assert.equal(r.ok ? "ok" : r.motivo, "CONFLICTO");
  });

  test("un dedo de más (×10) exige teclearla otra vez, y que coincida", async () => {
    const mala = await capturada(ctxSupervisor, "2290.00");
    const sinTeclear = await confirmar(ctxAdmin, { rateId: mala.id });
    assert.equal(sinTeclear.ok ? "ok" : sinTeclear.problemas?.[0]?.path[0], "valorVerificado");
    const distinta = await confirmar(ctxAdmin, { rateId: mala.id, valorVerificado: "229.00" });
    assert.equal(distinta.ok, false);
    assert.equal((await tasaDelDia())?.value, "229.00");
  });

  test("teclearla con otra escritura del mismo valor sí vale («2300.500»)", async () => {
    const otra = await capturada(ctxSupervisor, "2300.5");
    const r = await confirmar(ctxAdmin, { rateId: otra.id, valorVerificado: "2300.500" });
    assert.ok(r.ok, JSON.stringify(r));
    // Y se vuelve a la buena, que contra 2300,5 también es un salto.
    const buena = await capturar(ctxAdmin, { ...captura("229.00"), valorVerificado: "229.00" });
    assert.ok(buena.ok, JSON.stringify(buena));
  });

  test("teclearla como se ve en pantalla (dos decimales) vale; con una tecla equivocada, no (v0.46.1)", async () => {
    // La API trae cuatro decimales y la pantalla enseña dos: quien confirma teclea lo que lee.
    const larga = await capturada(ctxSupervisor, "2300.5612");
    const errada = await confirmar(ctxAdmin, { rateId: larga.id, valorVerificado: "2300.57" });
    assert.equal(errada.ok ? "ok" : errada.problemas?.[0]?.message, "No coincide");
    const r = await confirmar(ctxAdmin, { rateId: larga.id, valorVerificado: "2300.56" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.value, "2300.5612", "se confirma la tasa completa, no la redondeada");
    const buena = await capturar(ctxAdmin, { ...captura("229.00"), valorVerificado: "229.00" });
    assert.ok(buena.ok, JSON.stringify(buena));
  });

  test("una tasa de un día que pasó sin confirmar ya no se confirma", async () => {
    const ahoraAyer = reloj - 86_400_000;
    const c = await capturar(ctxSupervisor, captura("221.00", addDays(hoy(), -1)), ahoraAyer + 1000);
    assert.ok(c.ok, JSON.stringify(c));
    const r = await confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "221.00" });
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });

  test("la de mañana se confirma hoy, pero la caja no la usa hasta mañana", async () => {
    const manana = await capturada(ctxSupervisor, "229.20", addDays(hoy(), 1));
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

  test("supervisión no se autoriza a sí misma una tasa (D-AUT): la confirma otra persona", async () => {
    const r = await confirmar(ctxSupervisor, { rateId: pendiente.id }, { autorizadorId: supervisor, pin: "5937", motivo });
    assert.equal(r.ok ? "ok" : r.mensaje, "Esa persona no puede autorizar esto.");
  });

  test("la lista de quién autoriza incluye a la administración, no a quien pide; la administración no necesita a nadie", async () => {
    const lista = await local.app.tasas.autorizadores(ctxSupervisor);
    assert.ok(lista.some((p) => p.nombre === "Abigail Karam"), JSON.stringify(lista));
    assert.ok(!lista.some((p) => p.nombre === "Luis Guerrero"), JSON.stringify(lista));
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

  test("la que teclea supervisión no se aplica al guardarla, aunque la teclee dos veces", async () => {
    const r = await capturar(ctxSupervisor, { ...captura("229.05"), valorVerificado: "229.05" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.confirmed, false);
  });
});

/* ── traer la tasa del BCV (F3-04) y aplicarla sola (ADR-019), con fuentes simuladas ── */

type Fuente = "BCV" | "DOLARAPI";
const lector = (fuente: Fuente, value: string, effectiveDate: string) => async () => ({
  ok: true as const,
  lectura: { fuente, pair: "USD/VES" as const, value, effectiveDate, crudo: { prueba: "sí" } },
});
const caido = (fuente: Fuente) => async () => ({ ok: false as const, fuente, error: `${fuente} no respondió a tiempo.` });
const sincronizar = (ctx: Contexto, fuentes: readonly Lector[], en: LocalDePrueba = local) =>
  en.app.tasas.sincronizar(ctx, { fuentes, ahora: ahora() });
const alertas = async (instante = reloj) => (await local.app.tasas.leer(local.sistema, instante)).alertas;

describe("traer la tasa del BCV y aplicarla sola (F3-04, ADR-019)", () => {
  // El reloj va por el miércoles 23, con 229,00 vigente; el jueves 24 es «mañana».
  let delLunes: ExchangeRateDto;

  test("de la web oficial y dentro del umbral: se aplica sola, sin persona detrás", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "230.50000000", "2026-09-24"), lector("DOLARAPI", "230.5", "2026-09-24")]);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.capturadas.length, 1);
    const t = r.valor.capturadas[0]!;
    assert.equal(t.source, "BCV");
    assert.equal(t.capturedBy, "Sincronización BCV (2 fuentes)");
    assert.equal(t.confirmed, true);
    assert.equal(t.automatic, true);
    assert.equal(t.confirmedBy, "Aplicada automáticamente (BCV)");
    assert.equal(t.heldBack, undefined);
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "exchange_rate", entityId: t.id });
    assert.ok(asientos.some((a) => a.action === "tasa.aplicar" && a.outcome === "HECHO"));
  });

  test("traerla otra vez no la repite ni la vuelve a aplicar", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "230.50000000", "2026-09-24"), lector("DOLARAPI", "230.5", "2026-09-24")]);
    assert.ok(r.ok);
    assert.equal(r.valor.capturadas.length, 0);
    assert.equal(r.valor.aplicadas.length, 0);
    assert.deepEqual(r.valor.yaEstaban.map((y) => y.effectiveDate), ["2026-09-24"]);
  });

  test("si dos fuentes dicen cosas distintas del mismo día, no se captura nada de ese día (T6)", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "231.00", "2026-09-25"), lector("DOLARAPI", "241.00", "2026-09-25")]);
    assert.ok(r.ok);
    assert.equal(r.valor.capturadas.length, 0);
    assert.match(r.valor.avisos[0] ?? "", /no coinciden/);
  });

  test("si solo responde un tercero, se captura pero NO se aplica sola, y sale alerta crítica", async () => {
    const r = await sincronizar(ctxSupervisor, [caido("BCV"), lector("DOLARAPI", "231.25", "2026-09-28")]);
    assert.ok(r.ok, JSON.stringify(r));
    delLunes = r.valor.capturadas[0]!;
    assert.equal(delLunes.capturedBy, "Sincronización DolarApi");
    assert.equal(delLunes.confirmed, false);
    assert.equal(delLunes.heldBack, "SOLO_TERCERO");
    assert.deepEqual(r.valor.fuentes.map((f) => [f.fuente, f.ok]), [["BCV", false], ["DOLARAPI", true]]);
    const a = (await alertas()).find((x) => x.rateId === delLunes.id);
    assert.equal(a?.tipo, "RETENIDA");
    assert.equal(a?.tono, "crit");
    assert.match(a?.mensaje ?? "", /lunes, 28 de septiembre.*solo la dio DolarApi/);
  });

  test("cuando la web oficial dice lo mismo, la retenida se aplica sola y la alerta se va", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "231.25000000", "2026-09-28")]);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.capturadas.length, 0);
    assert.deepEqual(r.valor.aplicadas.map((t) => [t.id, t.automatic]), [[delLunes.id, true]]);
    assert.equal((await alertas()).some((x) => x.rateId === delLunes.id), false);
  });

  test("un salto de más del 10 % se aplica solo y sustituye a la de hoy, aunque fuera a mano (V-14)", async () => {
    const r = await sincronizar(ctxAdmin, [lector("BCV", "300.00", hoy())]);
    assert.ok(r.ok, JSON.stringify(r));
    const t = r.valor.capturadas[0]!;
    assert.equal(t.confirmed, true);
    assert.equal(t.automatic, true);
    assert.equal(t.heldBack, undefined);
    assert.equal((await tasaDelDia())?.id, t.id);
    assert.equal((await alertas()).some((x) => x.rateId === t.id), false);
  });

  test("una retenida la revisa una persona y la confirma tecleándola: deja de ser alerta", async () => {
    const r0 = await sincronizar(ctxAdmin, [caido("BCV"), lector("DOLARAPI", "301.00", hoy())]);
    assert.ok(r0.ok, JSON.stringify(r0));
    const retenida = (await alertas()).find((x) => x.tipo === "RETENIDA")!;
    assert.equal(retenida.rateId, r0.valor.capturadas[0]?.id);
    const r = await confirmar(ctxAdmin, { rateId: retenida.rateId, valorVerificado: "301.00" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await tasaDelDia())?.value, "301.00");
    assert.equal((await alertas()).some((x) => x.tipo === "RETENIDA"), false);
    // Se vuelve a la buena para lo que sigue.
    assert.ok((await capturar(ctxAdmin, { ...captura("229.00"), valorVerificado: "229.00" })).ok);
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
    const r = await sincronizar(ctxCajera, [lector("BCV", "230.50", "2026-09-24")]);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });
});

describe("un local sin tasas (ADR-019)", () => {
  let nuevo: LocalDePrueba;
  before(async () => {
    nuevo = await abrirLocalDePrueba(URL_APP, "Tasas nuevas");
  });
  after(() => nuevo.cerrar());

  test("la primera del BCV no se aplica sola: no hay con qué compararla", async () => {
    const r = await sincronizar(nuevo.sistema, [lector("BCV", "230.50", "2026-09-24")], nuevo);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.capturadas[0]?.heldBack, "PRIMERA");
    assert.equal(r.valor.capturadas[0]?.confirmed, false);
  });

  test("el viernes a las 6:30 pm sin la del lunes, avisa; a las 3:00 pm, todavía no", async () => {
    const tarde = await nuevo.app.tasas.leer(nuevo.sistema, Date.parse("2026-09-25T22:30:00.000Z"));
    const aviso = tarde.alertas.find((a) => a.tipo === "FALTA_SIGUIENTE");
    assert.equal(aviso?.tono, "warn");
    assert.match(aviso?.mensaje ?? "", /lunes, 28 de septiembre/);
    const temprano = await nuevo.app.tasas.leer(nuevo.sistema, Date.parse("2026-09-25T19:00:00.000Z"));
    assert.equal(temprano.alertas.some((a) => a.tipo === "FALTA_SIGUIENTE"), false);
  });
});

describe("el fin de semana cobra con la del viernes", () => {
  test("la del viernes, confirmada el sábado, rige sábado y domingo; el lunes, no", async () => {
    reloj = Date.parse("2026-09-25T20:00:00.000Z"); // viernes 25, 4:00 pm
    const c = await capturar(ctxSupervisor, captura("301.00", "2026-09-25"));
    assert.ok(c.ok, JSON.stringify(c));
    reloj = Date.parse("2026-09-26T14:00:00.000Z"); // sábado 26
    const r = await confirmar(ctxAdmin, { rateId: c.valor.id, valorVerificado: "301.00" });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await tasaDelDia())?.id, c.valor.id);
    reloj = Date.parse("2026-09-27T14:00:00.000Z"); // domingo 27
    assert.equal((await tasaDelDia())?.id, c.valor.id);
    reloj = Date.parse("2026-09-28T14:00:00.000Z"); // lunes 28: rige la del lunes, que se aplicó sola
    assert.equal((await tasaDelDia())?.id, (await local.app.tasas.leer(local.sistema)).tasas.find((t) => t.value === "231.25")?.id);
  });
});
