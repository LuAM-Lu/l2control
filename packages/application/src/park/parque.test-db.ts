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
import { chargeableLines } from "@l2/domain-cash";
import { contactKey } from "@l2/domain-park";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, planoDePrueba, sentarDePrueba, type LocalDePrueba, cedulaDePrueba } from "../para-pruebas.ts";

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
  // La cédula va con la familia nueva; la conocida ya la tiene (T-19).
  ...("guardianId" in extra ? {} : { guardianDocument: cedulaDePrueba(`0412-${String(1_000_000 + pulsera)}`) }),
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
  // Una mesa sin cuenta no recibe la salida del parque ni pulseras (B6-9): sus familias se sientan primero.
  for (const mesa of ["mesa-10", "mesa-11"]) await sentarDePrueba(local, ctxMesero, mesa, AHORA - 60 * MIN);
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
    const primera = await entrar(entrada([{}], { guardian: { fullName: "José Díaz", contactReference: "0424-555.12.34" }, guardianDocument: cedulaDePrueba("0424-555.12.34") }));
    const encontrada = valor(await local.app.representantes.buscar(ctxMonitora, { contacto: "+58 424 5551234" }));
    assert.equal(encontrada?.fullName, "José Díaz");
    assert.equal(encontrada?.id, primera.sessions[0]!.guardianId);
    // Entrar otra vez con su id no crea otra familia; darla por nueva con su teléfono, tampoco.
    await entrar(entrada([{}], { guardian: undefined, guardianId: encontrada!.id }));
    const repetida = await entrar(entrada([{}], { guardian: { fullName: "Jose Diaz", contactReference: "04245551234" }, guardianDocument: cedulaDePrueba("04245551234") }));
    assert.equal(repetida.sessions[0]!.guardianId, encontrada!.id);
    assert.equal(valor(await local.app.representantes.buscar(ctxMonitora, { contacto: "0424-555-9999" })), null);
    await vaciarSala();
  });

  test("un niño se nombra desde la sala y queda en el directorio de su familia (DEC-28)", async () => {
    const r = await entrar(entrada([{}], { guardian: { fullName: "Carmen Silva", contactReference: "0414-777-0001" }, guardianDocument: cedulaDePrueba("0414-777-0001") }));
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
    // PLAN §7.6: cada consulta de los contactos queda en la auditoría, con cuántos y no cuáles.
    const consultas = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.auditEntry.findMany({ where: { action: "representante.consultar", actorId: ctxMonitora.quien!.userId! }, orderBy: { occurredAt: "asc" } }),
    );
    assert.equal(consultas.length, 1);
    assert.deepEqual(consultas[0]!.after, { representantes: d.representantes.length });
  });
});

describe("la cédula del representante (T-19)", () => {
  const motivoDe = (r: { ok: boolean; problemas?: readonly { message: string }[] | undefined }) => (r.ok ? "OK" : r.problemas?.[0]?.message);

  test("sin cédula no entra una familia nueva; con ella, entra y queda anotada", async () => {
    const sin = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardian: { fullName: "Rosa Mena", contactReference: "0416-300.00.01" }, guardianDocument: undefined }), AHORA);
    assert.equal(motivoDe(sin), "FALTA_LA_CEDULA");
    const con = await entrar(entrada([{}], { guardian: { fullName: "Rosa Mena", contactReference: "0416-300.00.01" }, guardianDocument: "v 18.300.001" }));
    const porCedula = valor(await local.app.representantes.buscar(ctxMonitora, { documento: "V-18300001" }));
    assert.equal(porCedula?.id, con.sessions[0]!.guardianId);
    assert.equal(porCedula?.tieneCedula, true);
    await vaciarSala();
  });

  test("la familia que vuelve se reconoce por su cédula, aunque traiga otro teléfono", async () => {
    const r = await entrar(entrada([{}], { guardian: { fullName: "Rosa Mena", contactReference: "0424-999.00.01" }, guardianDocument: "V18300001" }));
    const rosa = valor(await local.app.representantes.buscar(ctxMonitora, { documento: "v-18.300.001" }));
    assert.equal(r.sessions[0]!.guardianId, rosa!.id);
    await vaciarSala();
  });

  test("al representante de antes, sin cédula, se le pide y se le anota con su asiento", async () => {
    // Uno de antes de T-19: entró sin cédula (se crea como entonces, directo en la base).
    const id = await local.base.conTenant(local.sistema.tenantId, async (tx) => {
      const g = await tx.guardian.create({
        data: { tenantId: local.sistema.tenantId, fullName: "Pablo Antes", contactReference: "0412-300.00.09", contactKey: contactKey("0412-300.00.09")!, createdAt: new Date(AHORA - 86_400_000) },
        select: { id: true },
      });
      return g.id;
    });
    const encontrado = valor(await local.app.representantes.buscar(ctxMonitora, { contacto: "04123000009" }));
    assert.equal(encontrado?.tieneCedula, false);
    const sin = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardian: undefined, guardianId: id, guardianDocument: undefined }), AHORA);
    assert.equal(motivoDe(sin), "FALTA_LA_CEDULA");
    await entrar(entrada([{}], { guardian: undefined, guardianId: id, guardianDocument: "V-18300009" }));
    assert.equal(valor(await local.app.representantes.buscar(ctxMonitora, { documento: "V18300009" }))?.id, id);
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action: "cliente.completar", entityId: id } }));
    assert.equal(asientos.length, 1);
    assert.ok(!JSON.stringify(asientos[0]!.after).includes("18300009"), "la cédula no va al asiento");
    // Ya con ella, vuelve a entrar sin escribirla.
    await entrar(entrada([{}], { guardian: undefined, guardianId: id, guardianDocument: undefined }), ctxMonitora, AHORA + MIN);
    await vaciarSala(AHORA + MIN);
  });

  test("una cédula que no es la suya, o que es de otro, no entra: se dice por qué", async () => {
    const rosa = valor(await local.app.representantes.buscar(ctxMonitora, { documento: "V-18300001" }))!;
    const otra = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardian: undefined, guardianId: rosa.id, guardianDocument: "V-18300002" }), AHORA);
    assert.equal(motivoDe(otra), "OTRA_CEDULA");
    const nuevo = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardian: { fullName: "Luis Nuevo", contactReference: "0414-300.00.03" }, guardianDocument: "V-18300003" }), AHORA);
    assert.ok(nuevo.ok);
    // Un representante de antes, sin cédula, no se queda con la de otra persona.
    const antes = await local.base.conTenant(local.sistema.tenantId, async (tx) => {
      return (await tx.guardian.create({ data: { tenantId: local.sistema.tenantId, fullName: "Ana Antes", contactReference: "0412-300.00.08", contactKey: contactKey("0412-300.00.08")!, createdAt: new Date(AHORA - 86_400_000) }, select: { id: true } })).id;
    });
    const deOtro = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardian: undefined, guardianId: antes, guardianDocument: "V-18300003" }), AHORA);
    assert.equal(motivoDe(deOtro), "CEDULA_DE_OTRO");
    const rara = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardianDocument: "12" }), AHORA);
    assert.equal(rara.ok, false);
    await vaciarSala();
  });
});

describe("sumar a la familia (B4-12)", () => {
  const motivoDe = (r: { ok: boolean; problemas?: readonly { message: string }[] | undefined }) => (r.ok ? "OK" : r.problemas?.[0]?.message);

  test("el niño que llega después entra en la cuenta de su familia, con su propio tiempo, y salen juntos", async () => {
    const primera = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA", guardian: { fullName: "Inés Suma", contactReference: "0414-400.00.01" }, guardianDocument: "V-18400001" }));
    const g = primera.sessions[0]!.guardianId;
    const despues = await entrar(entrada([{}], { guardian: undefined, guardianId: g, sumarA: primera.account.id }), ctxMonitora, AHORA + 20 * MIN);
    assert.equal(despues.account.id, primera.account.id);
    assert.equal(despues.account.orderNumber, primera.account.orderNumber);
    assert.equal(despues.account.sessionIds.length, 2);
    assert.equal(despues.account.status, "ABIERTA");
    assert.equal(Date.parse(despues.sessions[0]!.startedAt), AHORA + 20 * MIN);
    assert.equal(despues.sessions.length, 1, "la respuesta trae solo a los que entraron ahora");
    // Salen juntos: una salida de la familia.
    const s = valor(await local.app.parque.salir(ctxMonitora, salida(despues.account.sessionIds), AHORA + 50 * MIN));
    assert.equal(s.lines.length, 2);
    await vaciarSala(AHORA + 50 * MIN);
  });

  test("en prepago, lo nuevo va a la caja como una recarga", async () => {
    const primera = await entrar(entrada([{}], { guardian: { fullName: "Inés Prepago", contactReference: "0414-400.00.02" }, guardianDocument: "V-18400002" }));
    const despues = await entrar(entrada([{}], { guardian: undefined, guardianId: primera.sessions[0]!.guardianId, sumarA: primera.account.id }), ctxMonitora, AHORA + MIN);
    assert.equal(despues.account.status, "POR_COBRAR");
    assert.equal(despues.account.pendingSince, primera.account.pendingSince);
    assert.equal(chargeableLines(despues.account).length, 2);
    await vaciarSala(AHORA + MIN);
  });

  test("no se suma a la cuenta de otro representante, ni a la de una familia que ya salió", async () => {
    const de = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA", guardian: { fullName: "Inés Otra", contactReference: "0414-400.00.03" }, guardianDocument: "V-18400003" }));
    const ajena = await local.app.parque.entrar(ctxMonitora, entrada([{}], { sumarA: de.account.id }), AHORA);
    assert.equal(motivoDe(ajena), "NO_SE_SUMA");
    valor(await local.app.parque.salir(ctxMonitora, salida(de.account.sessionIds), AHORA + MIN));
    const tarde = await local.app.parque.entrar(ctxMonitora, entrada([{}], { guardian: undefined, guardianId: de.sessions[0]!.guardianId, sumarA: de.account.id }), AHORA + 2 * MIN);
    assert.equal(motivoDe(tarde), "NO_SE_SUMA");
    await vaciarSala(AHORA + 2 * MIN);
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

  test("el tiempo de más lo mide el servidor con la tarifa de la entrada, aunque el tarifario cambie (B4-17)", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "CUENTA_ABIERTA" }));
    // Después de la entrada, las 2 horas pasan a costar $ 15: a esta familia no le toca.
    valor(
      await local.app.tarifario.publicar(local.sistema, {
        ...TARIFARIO,
        packages: TARIFARIO.packages.map((p) => (p.id === "pkg-120" ? { ...p, price: usd("1500") } : p)),
      }),
    );
    // 72 min con 1 hora ($ 5): un bloque, con tope en lo que falta para 2 horas a $ 8 de su tarifa: $ 3.
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 72 * MIN));
    assert.equal(s.lines[0]!.billableOverdueMinutes, 7);
    assert.equal(s.lines[0]!.penaltyBlocks, 1);
    assert.equal(s.lines[0]!.overdue.minor, "300");
    assert.equal(s.lines[0]!.total.minor, "800");
    assert.equal(s.account.status, "POR_COBRAR"); // el último salió: a la caja
    assert.deepEqual(s.account.lines.map((l) => [l.kind, l.amount.minor]), [["PAQUETE", "500"], ["EXCEDENTE", "300"]]);
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
      ["EXCEDENTE", "300", undefined],
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

describe("salir antes de tiempo (B4-6, M-18)", () => {
  // Con «30 minutos» a la venta: es el que cubre una salida temprana. Cuenta el tarifario con que entró.
  const CON_30 = { ...TARIFARIO, packages: TARIFARIO.packages.map((p) => (p.id === "pkg-30" ? { ...p, active: true } : p)) };
  before(async () => {
    valor(await local.app.tarifario.publicar(local.sistema, CON_30));
  });
  after(async () => {
    valor(await local.app.tarifario.publicar(local.sistema, TARIFARIO));
  });
  /** Lo que la caja cobra de una cuenta: lo mismo que el servidor (`chargeableLines`). */
  const seDebe = (c: Parameters<typeof chargeableLines>[0]) => chargeableLines(c).map((l) => l.amount.minor);

  test("cuenta abierta: 1 hora y sale a los 25 min, se cobran 30 minutos; lo contratado queda marcado, no se borra", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-60" }], { paymentMode: "CUENTA_ABIERTA" }));
    const id = r.sessions[0]!.id;
    // La estancia trae los paquetes del tarifario con que entró.
    assert.deepEqual(r.sessions[0]!.porUso.map((p) => p.name), ["1 hora", "2 horas", "Pase libre", "30 minutos"]);
    const cmd = salida([id]);
    const s = valor(await local.app.parque.salir(ctxMonitora, cmd, AHORA + 25 * MIN));
    const l = s.lines[0]!;
    assert.deepEqual(l.porUso, { paquete: "30 minutos", precio: usd("300") });
    assert.equal(l.consumedMinutes, 25);
    assert.equal(l.packagePrice.minor, "500", "el desglose dice lo elegido");
    assert.equal(l.overdue.minor, "0");
    assert.equal(l.total.minor, "300");

    assert.equal(s.account.status, "POR_COBRAR");
    const [elegido, cobrado] = s.account.lines;
    assert.equal(elegido!.amount.minor, "500", "se queda con su importe");
    assert.deepEqual(elegido!.porUso, { cambiadaPor: `uso-${id}`, minutos: 25 });
    assert.deepEqual([cobrado!.id, cobrado!.kind, cobrado!.amount.minor, cobrado!.sessionId, cobrado!.porUso], [`uso-${id}`, "PAQUETE", "300", id, undefined]);
    assert.match(cobrado!.concept, /^Paquete 30 minutos por uso \(25 min\)/);
    assert.deepEqual(seDebe(s.account), ["300"]);

    // La caja la ve igual, y un reintento devuelve la misma salida y no ajusta dos veces.
    const enCaja = valor(await local.app.cuentas.leer(ctxCajera, AHORA + 26 * MIN)).cuentas.find((c) => c.id === s.account.id)!;
    assert.deepEqual(seDebe(enCaja), ["300"]);
    const otraVez = valor(await local.app.parque.salir(ctxMonitora, cmd, AHORA + 40 * MIN));
    assert.deepEqual(otraVez.lines, s.lines);
    assert.equal(otraVez.account.version, s.account.version);
  });

  test("el pase libre también se cobra por uso: a los 50 min, 1 hora", async () => {
    const r = await entrar(entrada([{ packageId: "libre" }], { paymentMode: "CUENTA_ABIERTA" }));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 50 * MIN));
    assert.deepEqual(s.lines[0]!.porUso, { paquete: "1 hora", precio: usd("500") });
    assert.equal(s.lines[0]!.packagePrice.minor, "1200");
    assert.deepEqual(seDebe(s.account), ["500"]);
  });

  test("dentro de la gracia cubre el paquete corto: a los 33 min, 30 minutos", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-120" }], { paymentMode: "CUENTA_ABIERTA" }));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 33 * MIN));
    assert.equal(s.lines[0]!.porUso?.paquete, "30 minutos");
    assert.deepEqual(seDebe(s.account), ["300"]);
  });

  test("prepago no se devuelve: sale a los 25 min y la cuenta queda como estaba", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-60" }]));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 25 * MIN));
    assert.equal(s.lines[0]!.porUso, null);
    assert.equal(s.lines[0]!.total.minor, "500");
    assert.deepEqual(s.account.lines.map((l) => [l.kind, l.amount.minor, l.porUso]), [["PAQUETE", "500", undefined]]);
    assert.deepEqual(seDebe(s.account), ["500"]);
  });

  test("si se pasó de lo elegido, se cobra como siempre: el paquete y el tiempo de más", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-60" }], { paymentMode: "CUENTA_ABIERTA" }));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([r.sessions[0]!.id]), AHORA + 72 * MIN));
    assert.equal(s.lines[0]!.porUso, null);
    assert.equal(s.lines[0]!.total.minor, "800");
    assert.ok(s.account.lines.every((l) => l.porUso === undefined));
    assert.deepEqual(seDebe(s.account), ["500", "300"]);
  });

  test("el paquete y lo que subió se cambian juntos: sube a 2 horas y sale a los 40 min, se cobra 1 hora (B4-17)", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-60" }], { paymentMode: "CUENTA_ABIERTA" }));
    const id = r.sessions[0]!.id;
    valor(await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: id, packageId: "pkg-120" }, AHORA + 20 * MIN));
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([id]), AHORA + 40 * MIN));
    assert.deepEqual(s.lines[0]!.porUso, { paquete: "1 hora", precio: usd("500") });
    assert.equal(s.lines[0]!.packagePrice.minor, "800");
    assert.equal(s.lines[0]!.total.minor, "500");
    assert.deepEqual(
      s.account.lines.map((l) => [l.amount.minor, l.porUso?.cambiadaPor ?? null]),
      [
        ["500", `uso-${id}`],
        ["300", `uso-${id}`],
        ["500", null],
      ],
    );
    assert.deepEqual(seDebe(s.account), ["500"]);
  });

  test("vinculado a una mesa: el ajuste se hace en la cuenta de la mesa", async () => {
    const r = await entrar(entrada([{ packageId: "pkg-60" }], { paymentMode: "CUENTA_ABIERTA" }));
    const id = r.sessions[0]!.id;
    const { mesa } = valor(await local.app.mesas.vincular(ctxMesero, { idempotencyKey: randomUUID(), tableId: "mesa-11", sessionIds: [id] }, AHORA + 5 * MIN));
    const cmd = salida([id]);
    const s = valor(await local.app.parque.salir(ctxMonitora, cmd, AHORA + 25 * MIN));
    assert.deepEqual(s.lines[0]!.porUso, { paquete: "30 minutos", precio: usd("300") });
    // La familia no tiene nada que ajustar: su paquete se fue a la mesa.
    assert.ok(s.account.lines.every((l) => l.porUso === undefined && l.id !== `uso-${id}`));
    assert.deepEqual(seDebe(s.account), []);

    const enMesa = valor(await local.app.cuentas.leer(ctxCajera, AHORA + 26 * MIN)).cuentas.find((c) => c.id === mesa.id)!;
    assert.deepEqual(
      enMesa.lines.map((l) => [l.amount.minor, l.sessionId, l.porUso?.cambiadaPor ?? null]),
      [
        ["500", id, `uso-${id}`],
        ["300", id, null],
      ],
    );
    assert.deepEqual(seDebe(enMesa), ["300"]);
    assert.equal(enMesa.status, "ABIERTA", "la mesa sigue: la cobra la caja con lo demás");
    const version = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.accountVersion.findFirst({ where: { accountId: mesa.id }, orderBy: { version: "desc" } }));
    assert.equal(version!.cause, "SALIDA");

    // El reintento devuelve el mismo desglose, aunque el ajuste esté en la mesa.
    const otraVez = valor(await local.app.parque.salir(ctxMonitora, cmd, AHORA + 40 * MIN));
    assert.deepEqual(otraVez.lines, s.lines);
  });
});

describe("la pulsera vinculada sale a su mesa (B4-14)", () => {
  test("aunque la salida diga caja, lo que debe, con su tiempo de más, va a la cuenta de su mesa", async () => {
    await vaciarSala(AHORA);
    const r = await entrar(entrada([{ packageId: "pkg-60" }]));
    const id = r.sessions[0]!.id;
    const { mesa } = valor(await local.app.mesas.vincular(ctxMesero, { idempotencyKey: randomUUID(), tableId: "mesa-10", sessionIds: [id] }, AHORA + 5 * MIN));
    // 80 minutos con un paquete de 60: un bloque de más, después de la gracia.
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([id]), AHORA + 80 * MIN));
    assert.equal(s.lines[0]!.penaltyBlocks, 1);
    assert.deepEqual(chargeableLines(s.account).map((l) => l.amount.minor), [], "la familia no debe nada: todo está en la mesa");
    const enMesa = valor(await local.app.cuentas.leer(ctxCajera, AHORA + 81 * MIN)).cuentas.find((c) => c.id === mesa.id)!;
    assert.ok(enMesa.lines.some((l) => l.sessionId === id && l.amount.minor === "300"), "el tiempo de más está en la mesa");
  });

  test("vinculados con sueltos, o hacia otra mesa, no salen juntos: se dice por qué", async () => {
    await vaciarSala(AHORA + 90 * MIN);
    const r = await entrar(entrada([{}, {}]), ctxMonitora, AHORA + 90 * MIN);
    const [a, b] = r.sessions.map((x) => x.id) as [string, string];
    valor(await local.app.mesas.vincular(ctxMesero, { idempotencyKey: randomUUID(), tableId: "mesa-10", sessionIds: [a] }, AHORA + 91 * MIN));
    const mezcla = await local.app.parque.salir(ctxMonitora, salida([a, b]), AHORA + 100 * MIN);
    assert.equal(mezcla.ok, false);
    assert.match((mezcla as { mensaje: string }).mensaje, /por separado/);
    const otra = await local.app.parque.salir(ctxMonitora, salida([a], { disposition: { kind: "MESA", tableId: "mesa-11" } }), AHORA + 100 * MIN);
    assert.equal(otra.ok, false);
    assert.match((otra as { mensaje: string }).mensaje, /vinculada a la mesa/);
    // Por separado, cada una a lo suyo.
    valor(await local.app.parque.salir(ctxMonitora, salida([a]), AHORA + 100 * MIN));
    valor(await local.app.parque.salir(ctxMonitora, salida([b]), AHORA + 100 * MIN));
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
  test("subir de paquete: suma lo que falta y paga la diferencia; en prepago vuelve a la caja (B4-17)", async () => {
    const r = await entrar(entrada([{}], { paymentMode: "PREPAGO" }));
    const s = r.sessions[0]!;
    // De 1 hora ($ 5) a 2 horas ($ 8): 60 min más y $ 3, no otra hora de $ 5.
    const cmd = { idempotencyKey: randomUUID(), sessionId: s.id, packageId: "pkg-120" };
    const rec = valor(await local.app.parque.recargar(ctxMonitora, cmd, AHORA + 55 * MIN));
    assert.deepEqual(rec.session.duration, { kind: "fixed", minutes: 120 });
    assert.deepEqual(rec.session.recargas.map((x) => [x.minutes, x.price.minor]), [[60, "300"]]);
    assert.equal(rec.account.status, "POR_COBRAR");
    assert.deepEqual(rec.account.lines.map((l) => [l.kind, l.amount.minor]), [["PAQUETE", "500"], ["PAQUETE", "300"]]);
    // A un paquete igual o menor no se sube.
    const igual = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: s.id, packageId: "pkg-60" }, AHORA + 56 * MIN);
    assert.equal(!igual.ok && igual.problemas?.[0]?.message, "PAQUETE_NO_ES_MAYOR");
    // Un reintento no recarga dos veces.
    const otra = valor(await local.app.parque.recargar(ctxMonitora, cmd, AHORA + 56 * MIN));
    assert.equal(otra.account.version, rec.account.version);
    // Con las 2 horas, a los 125 min está en su gracia: sale sin tiempo de más, y lo contratado son $ 8,00.
    const fuera = valor(await local.app.parque.salir(ctxMonitora, salida([s.id]), AHORA + 125 * MIN));
    assert.equal(fuera.lines[0]!.overdue.minor, "0");
    assert.equal(fuera.lines[0]!.packagePrice.minor, "800");
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

describe("los avisos de pulseras por vencer en la pantalla del PIN (B4-15)", () => {
  const equipo = (estado: "APROBADO" | "PENDIENTE") =>
    ({ estado, id: randomUUID(), tenantId: local.sistema.tenantId, branchId: local.sistema.branchId, label: "Parque", codigo: "0000", caducada: false }) as const;

  test("un equipo aprobado ve cada pulsera con sus dos instantes, sin nombres; uno pendiente, nada", async () => {
    const codigo = nuevaPulsera();
    const libre = nuevaPulsera();
    await entrar(entrada([{ code: codigo, kid: { name: "Valentina Rojas" } }, { code: libre, packageId: "libre" }]));
    const r = valor(await local.app.parque.avisosDelEquipo(equipo("APROBADO"), AHORA + MIN));
    const suya = r.pulseras.find((p) => p.codigo === codigo)!;
    // 1 hora con aviso de 10 min: por vencer a los 50 y vence a los 60.
    assert.equal(suya.porVencer, new Date(AHORA + 50 * MIN).toISOString());
    assert.equal(suya.vence, new Date(AHORA + 60 * MIN).toISOString());
    assert.equal(r.pulseras.some((p) => p.codigo === libre), false, "el pase libre no vence");
    assert.doesNotMatch(JSON.stringify(r), /Valentina|María|Pérez|0412/);
    const pendiente = await local.app.parque.avisosDelEquipo(equipo("PENDIENTE"), AHORA + MIN);
    assert.equal(!pendiente.ok && pendiente.motivo, "NO_PERMITIDO");
    const desconocido = await local.app.parque.avisosDelEquipo({ estado: "DESCONOCIDO" }, AHORA + MIN);
    assert.equal(desconocido.ok, false);
    await vaciarSala(AHORA + 2 * MIN);
  });
});

describe("el tiempo abierto (B4-17, M-37)", () => {
  test("entra sin paquete ni línea, solo en cuenta abierta; al salir se cobra lo que vale su tiempo con la tarifa", async () => {
    await vaciarSala(AHORA);
    // En prepago no: el tiempo abierto se paga al salir.
    const prepago = await local.app.parque.entrar(ctxMonitora, entrada([{ packageId: "tiempo-abierto" }]), AHORA);
    assert.equal(!prepago.ok && prepago.problemas?.[0]?.message, "TIEMPO_ABIERTO_EN_PREPAGO");
    const r = await entrar(entrada([{ packageId: "tiempo-abierto" }], { paymentMode: "CUENTA_ABIERTA" }));
    const id = r.sessions[0]!.id;
    assert.deepEqual([r.sessions[0]!.duration, r.sessions[0]!.packageName], [{ kind: "openEnded" }, "Tiempo abierto"], "sin límite");
    assert.deepEqual(r.account.lines, [], "nada en la cuenta hasta que salga: ninguna mesa se cobra con él en $ 0");
    // Más tiempo no aplica: ya es abierto.
    const mas = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: id, packageId: "pkg-120" }, AHORA + 10 * MIN);
    assert.equal(!mas.ok && mas.problemas?.[0]?.message, "TIEMPO_ABIERTO");
    // 80 min con la tarifa de la prueba (1 h $ 5, 2 h $ 8, pase libre $ 12; los 30 min no se venden): 2 horas, $ 8.
    const s = valor(await local.app.parque.salir(ctxMonitora, salida([id]), AHORA + 80 * MIN));
    assert.deepEqual([s.lines[0]!.tiempoAbierto, s.lines[0]!.porUso, s.lines[0]!.total.minor], [true, { paquete: "2 horas", precio: usd("800") }, "800"]);
    assert.equal(s.account.status, "POR_COBRAR");
    assert.deepEqual(
      s.account.lines.map((l) => [l.id, l.kind, l.amount.minor]),
      [[`abierto-${id}`, "PAQUETE", "800"]],
    );
    assert.match(s.account.lines[0]!.concept, /^Tiempo abierto 80 min: 2 horas · /);
  });
});
