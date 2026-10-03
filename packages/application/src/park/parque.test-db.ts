/**
 * El parque en el servidor, contra l2control_test — B4-1, B4-2, B4-3, ADR-010, DEC-21, I-04.
 *
 * Con reloj fijo: la entrada es a las 10:00 am (Caracas) del domingo 27 de septiembre de 2026 y la
 * salida se mide desde ahí, con el reloj del servidor y las condiciones de la entrada. Corre con
 * `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CheckInResult } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxMonitora: Contexto;
let ctxCajera: Contexto;
let ctxMesero: Contexto;
let ctxCocina: Contexto;
let ctxSupervisor: Contexto;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

/** El tarifario de las pruebas: 1 hora a $ 5,00, 2 horas a $ 8,00 y pase libre a $ 12,00; aforo 4. */
const TARIFARIO = {
  packages: [
    { id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true },
    { id: "pkg-120", name: "2 horas", mode: "PREPAGO", duration: { kind: "fixed", minutes: 120 }, price: usd("800"), active: true },
    { id: "libre", name: "Pase libre", mode: "POSTPAGO", duration: { kind: "openEnded" }, price: usd("1200"), active: true },
    { id: "pkg-30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: usd("300"), active: false },
  ],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 4 },
};

let pulsera = 0;
const nuevaPulsera = () => `AK-${String(++pulsera).padStart(4, "0")}`;

/** Una entrada con un representante nuevo (o conocido, si se da su id). */
const entrada = (ninos: { code?: string; packageId?: string; kid?: Record<string, unknown> }[], extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  paymentMode: "PREPAGO",
  entries: ninos.map((n) => ({ wristbandCode: n.code ?? nuevaPulsera(), kid: n.kid ?? {}, packageId: n.packageId ?? "pkg-60" })),
  guardian: { fullName: "María Pérez", contactReference: `0412-${String(1_000_000 + pulsera)}` },
  ...extra,
});
const entrar = async (cmd: unknown, ctx: Contexto = ctxMonitora, ahora = AHORA): Promise<CheckInResult> => valor(await local.app.parque.entrar(ctx, cmd, ahora));
const salida = (sessionIds: string[], extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  sessionIds,
  disposition: { kind: "CAJA" },
  recogida: { kind: "REPRESENTANTE" },
  ...extra,
});
/** Deja la sala vacía, sacando a todos y cerrando las huérfanas (entre pruebas, para que nada se arrastre). */
const vaciarSala = async (ahora = AHORA) => {
  const { sessions, huerfanas } = valor(await local.app.parque.sala(ctxMonitora, ahora));
  for (const cuenta of new Set(sessions.map((s) => s.accountId))) {
    valor(await local.app.parque.salir(ctxMonitora, salida(sessions.filter((s) => s.accountId === cuenta).map((s) => s.id)), ahora));
  }
  for (const h of huerfanas) {
    valor(await local.app.parque.cerrarHuerfana(local.sistema, { idempotencyKey: randomUUID(), sessionId: h.id, motivo: "Limpieza de la prueba" }, ahora));
  }
};

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Parque");
  otro = await abrirLocalDePrueba(URL_APP, "Parque de otro");
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const mesero = await crearPersona(local, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const cocinera = await crearPersona(local, { nombre: "Rosa Mata", role: "COCINA", pin: "8462" });
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Entrada"), monitora, "6284");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Salón"), mesero, "3175");
  ctxCocina = await contextoDe(local, await crearEquipo(local, "Cocina"), cocinera, "8462");
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Oficina"), supervisor, "5937");
  valor(await local.app.tarifario.publicar(local.sistema, TARIFARIO));
  valor(await otro.app.tarifario.publicar(otro.sistema, TARIFARIO));
  await planoDePrueba(local, 12);
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("la entrada (B4-2)", () => {
  test("abre las estancias con la hora del servidor y la cuenta con el precio del tarifario", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-60" }, { packageId: "pkg-120" }]));
    assert.equal(r.sessions.length, 2);
    for (const s of r.sessions) {
      assert.equal(s.startedAt, new Date(AHORA).toISOString());
      assert.equal(s.accountId, r.account.id);
      assert.equal(s.guardianName, "María Pérez");
      assert.deepEqual(s.terms, { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10 });
    }
    assert.equal(r.account.kind, "FAMILIA");
    assert.equal(r.account.status, "POR_COBRAR"); // prepago: a la cola de la caja
    assert.equal(r.account.pendingSince, new Date(AHORA).toISOString());
    assert.ok(r.account.orderNumber! > 0);
    assert.deepEqual(r.account.lines.map((l) => [l.kind, l.amount.minor, l.sessionId]), [
      ["PAQUETE", "500", r.sessions[0]!.id],
      ["PAQUETE", "800", r.sessions[1]!.id],
    ]);
    // La cuenta la ve la caja en su cola, como cualquier otra.
    const { cuentas } = valor(await local.app.cuentas.leer(ctxCajera, AHORA));
    assert.ok(cuentas.some((c) => c.id === r.account.id && c.status === "POR_COBRAR"));
    await vaciarSala();
  });

  test("en cuenta abierta no se cobra al entrar: la cuenta queda abierta", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }));
    assert.equal(r.account.status, "ABIERTA");
    assert.equal(r.account.pendingSince, undefined);
    await vaciarSala();
  });

  test("un doble toque no abre dos entradas: el reintento devuelve la misma", async () => {
    const cmd = entrada([{}]);
    const a = await entrar(cmd);
    const b = await entrar(cmd);
    assert.equal(b.account.id, a.account.id);
    assert.deepEqual(b.sessions.map((s) => s.id), a.sessions.map((s) => s.id));
    await vaciarSala();
  });

  test("una pulsera tiene una estancia activa (I-04), y no va dos veces en la misma entrada", async () => {
    const r = await entrar(entrada([{ code: "AK-9001" }]));
    const otra = await local.app.parque.entrar(ctxMonitora, entrada([{ code: "AK-9001" }]), AHORA);
    assert.equal(!otra.ok && otra.problemas?.[0]?.message, "PULSERA_ACTIVA");
    const doble = await local.app.parque.entrar(ctxMonitora, entrada([{ code: "AK-9002" }, { code: "AK-9002" }]), AHORA);
    assert.equal(!doble.ok && doble.problemas?.[0]?.message, "PULSERA_REPETIDA");
    valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 30 * MIN));
    await vaciarSala(AHORA + 31 * MIN);
  });

  test("una pulsera, una visita (V-1): la usada ayer no entra hoy, y la entrada no entra a medias", async () => {
    const ayer = AHORA - 24 * 60 * MIN;
    const r = await entrar(entrada([{ code: "AK-9101" }]), ctxMonitora, ayer);
    valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), ayer + 30 * MIN));
    const hoy = await local.app.parque.entrar(ctxMonitora, entrada([{ code: "AK-9102" }, { code: "AK-9101" }]), AHORA);
    assert.equal(!hoy.ok && hoy.problemas?.[0]?.message, "PULSERA_USADA", JSON.stringify(hoy));
    assert.deepEqual(!hoy.ok && hoy.problemas?.[0]?.path, ["entries", 1, "wristbandCode"]);
    assert.match(!hoy.ok ? hoy.mensaje : "", /AK-9101 ya se usó en otra visita/);
    // Nada entró: tampoco la otra pulsera de la misma entrada.
    assert.equal(valor(await local.app.parque.sala(ctxMonitora, AHORA)).sessions.length, 0);
    await entrar(entrada([{ code: "AK-9102" }]));
    await vaciarSala();
  });

  test("al pasar una pulsera, el servidor dice si está libre, en sala o ya usada; la cajera no pregunta", async () => {
    const estado = async (codigo: string) => valor(await local.app.parque.pulsera(ctxMonitora, { codigo })).estado;
    assert.equal(await estado("ak-9301"), "LIBRE");
    const r = await entrar(entrada([{ code: "AK-9301" }]));
    assert.equal(await estado("AK-9301"), "ACTIVA");
    valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 30 * MIN));
    const usada = valor(await local.app.parque.pulsera(ctxMonitora, { codigo: "AK-9301" }));
    assert.equal(usada.estado, "USADA");
    assert.match(usada.mensaje ?? "", /ya se usó en otra visita/);
    const mesero = await local.app.parque.pulsera(ctxMesero, { codigo: "AK-9302" });
    assert.equal(!mesero.ok && mesero.motivo, "NO_PERMITIDO");
    assert.equal((await local.app.parque.pulsera(ctxMonitora, { codigo: "a b" })).ok, false);
    await vaciarSala(AHORA + 30 * MIN);
  });

  test("con la serie del local fijada, un código de otra serie no entra (D-PUL)", async () => {
    const v = await local.app.ajustes.leer(local.sistema);
    valor(await local.app.ajustes.publicar(local.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, pulseras: { prefijo: "AK-", longitud: 7 } } }));
    try {
      assert.equal(valor(await local.app.parque.pulsera(ctxMonitora, { codigo: "BK-9201" })).estado, "FUERA_DE_SERIE");
      for (const [code, que] of [["BK-9201", /empiezan por AK-/], ["AK-92011", /tienen 7 caracteres/]] as const) {
        const r = await local.app.parque.entrar(ctxMonitora, entrada([{ code }]), AHORA);
        assert.equal(!r.ok && r.problemas?.[0]?.message, "PULSERA_FUERA_DE_SERIE", JSON.stringify(r));
        assert.match(!r.ok ? r.mensaje : "", que);
      }
      await entrar(entrada([{ code: "AK-9201" }]));
      await vaciarSala();
    } finally {
      const w = await local.app.ajustes.leer(local.sistema);
      valor(await local.app.ajustes.publicar(local.sistema, { versionBase: w.version, ajustes: { ...w.ajustes, pulseras: { prefijo: null, longitud: null } } }));
    }
  });

  test("el aforo se llena pero no se pasa, y una entrada no entra a medias", async () => {
    await entrar(entrada([{}, {}, {}]));
    const dos = await local.app.parque.entrar(ctxMonitora, entrada([{}, {}]), AHORA);
    assert.equal(!dos.ok && dos.motivo, "CONFLICTO");
    assert.match(!dos.ok ? dos.mensaje : "", /quedan 1 plaza/);
    await entrar(entrada([{}]));
    const lleno = await local.app.parque.entrar(ctxMonitora, entrada([{}]), AHORA);
    assert.match(!lleno.ok ? lleno.mensaje : "", /Aforo completo \(4\)/);
    assert.equal(valor(await local.app.parque.sala(ctxMonitora, AHORA)).sessions.length, 4);
    await vaciarSala();
  });

  test("solo se vende lo que el tarifario vende hoy", async () => {
    const apartado = await local.app.parque.entrar(ctxMonitora, entrada([{ packageId: "pkg-30" }]), AHORA);
    assert.equal(!apartado.ok && apartado.problemas?.[0]?.message, "PAQUETE_QUE_NO_SE_VENDE");
    const inventado = await local.app.parque.entrar(ctxMonitora, entrada([{ packageId: "gratis" }]), AHORA);
    assert.equal(!inventado.ok && inventado.motivo, "INVALIDO");
  });

  test("sin tarifario publicado no se vende nada", async () => {
    const vacio = await abrirLocalDePrueba(URL_APP, "Parque sin tarifario");
    try {
      const r = await vacio.app.parque.entrar(vacio.sistema, entrada([{}]), AHORA);
      assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
    } finally {
      await vacio.cerrar();
    }
  });
});

describe("el directorio (B4-1)", () => {
  test("una familia que vuelve se reconoce por su teléfono, escrito como se escriba", async () => {
    const primera = await entrar(entrada([{}], { guardian: { fullName: "José Díaz", contactReference: "0424-555.12.34" } }));
    const encontrada = valor(await local.app.representantes.buscar(ctxMonitora, { contacto: "+58 424 5551234" }));
    assert.equal(encontrada?.fullName, "José Díaz");
    assert.equal(encontrada?.id, primera.sessions[0]!.guardianId);
    // Entrar otra vez con su id no crea otra familia; darla por nueva con su teléfono, tampoco.
    await entrar(entrada([{}], { guardian: undefined, guardianId: encontrada!.id }));
    const repetida = await entrar(entrada([{}], { guardian: { fullName: "Jose Diaz", contactReference: "04245551234" } }));
    assert.equal(repetida.sessions[0]!.guardianId, encontrada!.id);
    assert.equal(valor(await local.app.representantes.buscar(ctxMonitora, { contacto: "0424-555-9999" })), null);
    await vaciarSala();
  });

  test("un niño se nombra desde la sala y queda en el directorio de su familia (DEC-28)", async () => {
    const r = await entrar(entrada([{}], { guardian: { fullName: "Carmen Silva", contactReference: "0414-777-0001" } }));
    const s = r.sessions[0]!;
    assert.deepEqual(s.kid, {});
    const nombrada = valor(await local.app.parque.nombrar(ctxMonitora, { sessionId: s.id, name: "Valentina", nickname: "Vale" }));
    assert.equal(nombrada.kid.name, "Valentina");
    const familia = valor(await local.app.representantes.buscar(ctxMonitora, { contacto: "04147770001" }));
    assert.deepEqual(familia?.kids.map((k) => k.name), ["Valentina"]);
    // La próxima vez entra ya con su nombre, citándola del directorio.
    const vuelve = await entrar(entrada([{ kid: { id: familia!.kids[0]!.id } }], { guardian: undefined, guardianId: familia!.id }), ctxMonitora, AHORA + MIN);
    assert.equal(vuelve.sessions[0]!.kid.nickname, "Vale");
    // Un niño de otra familia no se cuela.
    const ajena = await local.app.parque.entrar(ctxMonitora, entrada([{ kid: { id: familia!.kids[0]!.id } }]), AHORA);
    assert.equal(!ajena.ok && ajena.problemas?.[0]?.message, "NINO_DE_OTRA_FAMILIA");
    await vaciarSala(AHORA + MIN);
  });

  test("el directorio cuenta las visitas y se corrige sin borrar; los contactos son de quien puede verlos", async () => {
    const d = valor(await local.app.representantes.directorio(ctxMonitora));
    const jose = d.representantes.find((r) => r.fullName === "José Díaz")!;
    assert.equal(jose.visitas, 3);
    valor(await local.app.representantes.corregir(ctxMonitora, { kind: "CORREGIR_REPRESENTANTE", representanteId: jose.id, fullName: "José Díaz Rojas", contactReference: jose.contactReference }));
    const choque = await local.app.representantes.corregir(ctxMonitora, { kind: "CORREGIR_REPRESENTANTE", representanteId: jose.id, fullName: "José Díaz Rojas", contactReference: "0414-777-0001" });
    assert.equal(!choque.ok && choque.motivo, "CONFLICTO");
    const cajera = await local.app.representantes.directorio(ctxCajera);
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
  });
});

describe("la salida (B4-3)", () => {
  test("prepago sin pasarse: sale sin cargo y la cuenta queda como estaba", async () => {
    const r = await entrar(entrada([{}]));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 50 * MIN));
    assert.equal(s.lines[0]!.consumedMinutes, 50);
    assert.equal(s.lines[0]!.overdue.minor, "0");
    assert.equal(s.lines[0]!.endedAt, new Date(AHORA + 50 * MIN).toISOString());
    // El paquete sigue por cobrar: la familia no lo pagó al entrar.
    assert.equal(s.account.status, "POR_COBRAR");
    assert.deepEqual(s.account.closedSessionIds, [r.sessions[0]!.id]);
  });

  test("el excedente lo mide el servidor con las condiciones de la entrada, aunque el tarifario cambie", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }));
    // Se publica un bloque más caro después de la entrada: a esta familia no le toca.
    valor(await local.app.tarifario.publicar(local.sistema, { ...TARIFARIO, policy: { ...TARIFARIO.policy, penaltyPricePerBlock: usd("400") } }));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 72 * MIN));
    assert.equal(s.lines[0]!.billableOverdueMinutes, 7);
    assert.equal(s.lines[0]!.penaltyBlocks, 1);
    assert.equal(s.lines[0]!.overdue.minor, "150");
    assert.equal(s.lines[0]!.total.minor, "650");
    assert.equal(s.account.status, "POR_COBRAR"); // el último salió: a la caja
    assert.deepEqual(s.account.lines.map((l) => [l.kind, l.amount.minor]), [["PAQUETE", "500"], ["EXCEDENTE", "150"]]);
    valor(await local.app.tarifario.publicar(local.sistema, TARIFARIO));
  });

  test("cuenta abierta: se acumula mientras quede un hermano dentro", async () => {
    const r = await entrar(entrada([{}, {}], { paymentMode: "CUENTA_ABIERTA" }));
    const uno = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 90 * MIN));
    assert.equal(uno.account.status, "ABIERTA");
    const dos = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[1]!.id]), AHORA + 95 * MIN));
    assert.equal(dos.account.status, "POR_COBRAR");
    assert.equal(dos.account.lines.filter((l) => l.kind === "EXCEDENTE").length, 2);
  });

  test("un niño sale una vez; un reintento devuelve la misma salida; cada familia sale por separado", async () => {
    const a = await entrar(entrada([{}]));
    const b = await entrar(entrada([{}]));
    const cmd = salida([a.sessions[0]!.id]);
    const primera = valor(await local.app.parque.salir(ctxMonitora, cmd, AHORA + 10 * MIN));
    const reintento = valor(await local.app.parque.salir(ctxMonitora, cmd, AHORA + 20 * MIN));
    assert.equal(reintento.account.version, primera.account.version);
    assert.equal(reintento.lines[0]!.endedAt, primera.lines[0]!.endedAt);
    const otraVez = await local.app.parque.salir(ctxMonitora, salida([a.sessions[0]!.id]), AHORA + 20 * MIN);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
    const juntas = await local.app.parque.salir(ctxMonitora, salida([b.sessions[0]!.id, (await entrar(entrada([{}]))).sessions[0]!.id]), AHORA);
    assert.equal(!juntas.ok && juntas.problemas?.[0]?.message, "VARIAS_FAMILIAS");
    await vaciarSala();
  });

  test("cargar la salida a una mesa (F5-14, D-RES, B6-3): el paquete y el excedente pasan juntos", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }));
    const salio = valor(
      await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id], { disposition: { kind: "MESA", tableId: "mesa-10" } }), AHORA + 72 * MIN),
    );
    // La familia se queda sin nada pendiente: todo se fue a la mesa.
    assert.ok(salio.account.lines.every((l) => l.movedTo !== undefined), "lo de la familia se queda diciendo adónde fue");
    assert.equal(salio.account.status, "COBRADA", "el único niño ya salió y no debe nada aquí");

    const cuentas = valor(await local.app.cuentas.leer(ctxCajera, AHORA + 72 * MIN));
    const mesa = cuentas.cuentas.find((c) => c.kind === "MESA" && c.tableId === "mesa-10")!;
    assert.deepEqual(mesa.lines.map((l) => [l.kind, l.amount.minor, l.movedTo]), [
      ["PAQUETE", "500", undefined],
      ["EXCEDENTE", "150", undefined],
    ]);
    assert.deepEqual(mesa.sessionIds, [r.sessions[0]!.id]);
    assert.equal(mesa.status, "ABIERTA");

    // Otra familia que sale a la misma mesa se suma a la cuenta que ya tenía.
    const otraEntrada = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }));
    valor(await local.app.parque.salir(ctxMonitora, salida([otraEntrada.sessions[0]!.id], { disposition: { kind: "MESA", tableId: "mesa-10" } }), AHORA + 80 * MIN));
    const otraVez = valor(await local.app.cuentas.leer(ctxCajera, AHORA + 80 * MIN));
    const mismaMesa = otraVez.cuentas.find((c) => c.id === mesa.id)!;
    assert.equal(mismaMesa.lines.length, 4, "dos familias, paquete y excedente cada una");
    assert.equal(mismaMesa.sessionIds.length, 2);
    await vaciarSala();
  });

  test("cargar a una mesa fuera del plano no se finge", async () => {
    const r = await entrar(entrada([{}]));
    const mesa = await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id], { disposition: { kind: "MESA", tableId: "mesa-99" } }), AHORA);
    assert.equal(!mesa.ok && mesa.problemas?.[0]?.message, "MESA_FUERA_DEL_PLANO", JSON.stringify(mesa));
    await vaciarSala();
  });

  test("una pantalla no abre ni toca lo del parque por su cuenta", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }));
    const c = r.account;
    const cerrar = await local.app.cuentas.guardar(ctxMonitora, { cuenta: { ...c, closedSessionIds: c.sessionIds } }, AHORA);
    assert.equal(!cerrar.ok && cerrar.problemas?.[0]?.message, "ESTANCIAS_DESDE_LA_PANTALLA");
    const exceso = { id: `exc-${c.sessionIds[0]}`, concept: "Tiempo de más", kind: "EXCEDENTE", amount: usd("1"), paid: false, sessionId: c.sessionIds[0] };
    const barato = await local.app.cuentas.guardar(ctxMonitora, { cuenta: { ...c, lines: [...c.lines, exceso] } }, AHORA);
    assert.equal(!barato.ok && barato.problemas?.[0]?.message, "PARQUE_DESDE_LA_PANTALLA");
    const inventada = await local.app.cuentas.guardar(ctxMonitora, { cuenta: { ...c, id: randomUUID(), version: undefined, orderNumber: undefined } }, AHORA);
    assert.equal(!inventada.ok && inventada.problemas?.[0]?.message, "FAMILIA_DESDE_LA_PANTALLA");
    await vaciarSala();
  });
});

describe("la sala, los permisos y el aislamiento", () => {
  test("la sala es de quien trabaja con el parque o con sus cuentas, y trae la hora del servidor", async () => {
    await entrar(entrada([{}]));
    for (const ctx of [ctxMonitora, ctxCajera, ctxMesero]) {
      const s = valor(await local.app.parque.sala(ctx, AHORA + 5 * MIN));
      assert.equal(s.serverNow, new Date(AHORA + 5 * MIN).toISOString());
      assert.equal(s.policy.capacityLimit, 4);
      assert.equal(s.sessions.length, 1);
    }
    const cocina = await local.app.parque.sala(ctxCocina, AHORA);
    assert.equal(!cocina.ok && cocina.motivo, "NO_PERMITIDO");
    await vaciarSala();
  });

  test("Inicio cuenta los niños atendidos hoy y el mismo día de la semana pasada, hasta esta hora", async () => {
    const antes = valor(await local.app.parque.atendidos(ctxMonitora, AHORA + 2 * MIN));
    await entrar(entrada([{}, {}]), ctxMonitora, AHORA + MIN);
    await entrar(entrada([{}]), ctxMonitora, AHORA - 7 * 24 * 60 * MIN); // domingo pasado, a la misma hora
    await entrar(entrada([{}]), ctxMonitora, AHORA - 7 * 24 * 60 * MIN + 60 * MIN); // más tarde: aún no cuenta
    const r = valor(await local.app.parque.atendidos(ctxMonitora, AHORA + 2 * MIN));
    assert.equal(r.hoy - antes.hoy, 2);
    assert.equal(r.semanaPasada - antes.semanaPasada, 1);
    await vaciarSala(AHORA + 2 * MIN);
  });

  test("ni la cocina ni el mesero registran entradas o salidas", async () => {
    for (const ctx of [ctxCocina, ctxMesero]) {
      const r = await local.app.parque.entrar(ctx, entrada([{}]), AHORA);
      assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    }
  });

  test("otro local no ve ni saca a los niños de este", async () => {
    const r = await entrar(entrada([{}]));
    assert.deepEqual(valor(await otro.app.parque.sala(otro.sistema, AHORA)).sessions, []);
    const ajena = await otro.app.parque.salir(otro.sistema, salida([r.sessions[0]!.id]), AHORA);
    assert.equal(!ajena.ok && ajena.motivo, "NO_DISPONIBLE");
    assert.equal(valor(await otro.app.representantes.buscar(otro.sistema, { contacto: "0424-555-1234" })), null);
    await vaciarSala();
  });
});

describe("la recarga de tiempo (B4-3, F5-11)", () => {
  test("suma su tramo a la estancia y su precio a la cuenta; en prepago vuelve a la caja", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "PREPAGO" }));
    const s = r.sessions[0]!;
    const cmd = { idempotencyKey: randomUUID(), sessionId: s.id, packageId: "pkg-60" };
    const rec = valor(await local.app.parque.recargar(ctxMonitora, cmd, AHORA + 55 * MIN));
    assert.deepEqual(rec.session.duration, { kind: "fixed", minutes: 120 });
    assert.deepEqual(rec.session.recargas.map((x) => [x.minutes, x.price.minor]), [[60, "500"]]);
    assert.equal(rec.account.status, "POR_COBRAR");
    assert.deepEqual(rec.account.lines.map((l) => [l.kind, l.amount.minor]), [["PAQUETE", "500"], ["PAQUETE", "500"]]);
    // Un reintento no recarga dos veces.
    const otra = valor(await local.app.parque.recargar(ctxMonitora, cmd, AHORA + 56 * MIN));
    assert.equal(otra.account.version, rec.account.version);
    // Con la recarga, a los 125 min está en su gracia: sale sin tiempo de más, y lo contratado son $ 10,00.
    const fuera = valor(await local.app.parque.salir(ctxMonitora, salida([s.id]), AHORA + 125 * MIN));
    assert.equal(fuera.lines[0]!.overdue.minor, "0");
    assert.equal(fuera.lines[0]!.packagePrice.minor, "1000");
  });

  test("el tiempo abierto no se recarga, ni con un paquete de tiempo abierto; lo que ya salió, tampoco", async () => {
    const libre = await entrar(entrada([{ packageId: "libre" }], { paymentMode: "CUENTA_ABIERTA" }));
    const r1 = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: libre.sessions[0]!.id, packageId: "pkg-60" }, AHORA);
    assert.equal(!r1.ok && r1.problemas?.[0]?.message, "TIEMPO_ABIERTO");
    const fija = await entrar(entrada([{}]));
    const r2 = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: fija.sessions[0]!.id, packageId: "libre" }, AHORA);
    assert.equal(!r2.ok && r2.problemas?.[0]?.message, "PAQUETE_QUE_NO_SE_RECARGA");
    await vaciarSala();
    const r3 = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: fija.sessions[0]!.id, packageId: "pkg-60" }, AHORA);
    assert.equal(!r3.ok && r3.motivo, "CONFLICTO");
  });
});

describe("a quién se entrega el niño (B4-3, D9)", () => {
  test("la salida deja constancia de quién lo recogió", async () => {
    const r = await entrar(entrada([{}, {}]));
    valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + MIN));
    valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[1]!.id], { recogida: { kind: "OTRA_PERSONA", nombre: "Rosa Díaz (tía)" } }), AHORA + MIN));
    const filas = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.parkSession.findMany({ where: { accountId: r.account.id }, select: { id: true, pickedUpByGuardian: true, pickedUpByName: true, closureKind: true } }),
    );
    const de = (id: string) => filas.find((f) => f.id === id)!;
    assert.deepEqual([de(r.sessions[0]!.id).pickedUpByGuardian, de(r.sessions[0]!.id).pickedUpByName], [true, null]);
    assert.deepEqual([de(r.sessions[1]!.id).pickedUpByGuardian, de(r.sessions[1]!.id).pickedUpByName], [false, "Rosa Díaz (tía)"]);
    assert.ok(filas.every((f) => f.closureKind === "SALIDA"));
    const sinDecir = await local.app.parque.salir(ctxMonitora, { ...salida([r.sessions[0]!.id]), recogida: undefined }, AHORA);
    assert.equal(!sinDecir.ok && sinDecir.motivo, "INVALIDO");
  });
});

describe("las estancias huérfanas (B4-3, F5-13, H-19)", () => {
  const AYER = AHORA - 24 * 60 * MIN;

  test("una de ayer, o de más de 8 horas, sale aparte: no cuenta en el aforo ni se liquida por la salida", async () => {
    const deAyer = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }), ctxMonitora, AYER);
    const larga = await entrar(entrada([{}]), ctxMonitora, AHORA - 9 * 60 * MIN);
    const hoy = await entrar(entrada([{}]));
    const sala = valor(await local.app.parque.sala(ctxMonitora, AHORA + MIN));
    assert.deepEqual(sala.sessions.map((s) => s.id), [hoy.sessions[0]!.id]);
    assert.deepEqual(new Set(sala.huerfanas.map((s) => s.id)), new Set([deAyer.sessions[0]!.id, larga.sessions[0]!.id]));
    // El aforo (4) solo cuenta a quien está de verdad: caben tres más.
    await entrar(entrada([{}, {}, {}]), ctxMonitora, AHORA + 2 * MIN);
    const salir = await local.app.parque.salir(ctxMonitora, salida([deAyer.sessions[0]!.id]), AHORA + 3 * MIN);
    assert.equal(!salir.ok && salir.motivo, "CONFLICTO");
    const recargar = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: larga.sessions[0]!.id, packageId: "pkg-60" }, AHORA);
    assert.equal(!recargar.ok && recargar.motivo, "CONFLICTO");
  });

  test("la dirección la cierra con un motivo, sin tiempo de más; la monitora no puede, y una de hoy no se cierra así", async () => {
    const { huerfanas, sessions } = valor(await local.app.parque.sala(ctxMonitora, AHORA + 5 * MIN));
    const deAyer = huerfanas.find((h) => Date.parse(h.startedAt) < AHORA - 12 * 60 * MIN)!;
    const cmd = { idempotencyKey: randomUUID(), sessionId: deAyer.id, motivo: "Se fue ayer sin registrar la salida" };
    const monitora = await local.app.parque.cerrarHuerfana(ctxMonitora, cmd, AHORA + 5 * MIN);
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
    const deHoy = await local.app.parque.cerrarHuerfana(ctxSupervisor, { ...cmd, idempotencyKey: randomUUID(), sessionId: sessions[0]!.id }, AHORA + 5 * MIN);
    assert.equal(!deHoy.ok && deHoy.motivo, "CONFLICTO");
    const r = valor(await local.app.parque.cerrarHuerfana(ctxSupervisor, cmd, AHORA + 5 * MIN));
    // Lo contratado ($ 5,00) se sigue debiendo; más de 24 horas «dentro» no suman ni un bloque.
    assert.deepEqual(r.account.lines.map((l) => [l.kind, l.amount.minor]), [["PAQUETE", "500"]]);
    assert.equal(r.account.status, "POR_COBRAR");
    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.parkSession.findUniqueOrThrow({ where: { id: deAyer.id } }));
    assert.deepEqual([fila.closureKind, fila.closureReason, fila.pickedUpByGuardian], ["ADMINISTRATIVA", "Se fue ayer sin registrar la salida", null]);
    // El reintento devuelve lo mismo.
    assert.equal(valor(await local.app.parque.cerrarHuerfana(ctxSupervisor, cmd, AHORA + 6 * MIN)).account.version, r.account.version);
    await vaciarSala(AHORA + 6 * MIN);
  });
});
