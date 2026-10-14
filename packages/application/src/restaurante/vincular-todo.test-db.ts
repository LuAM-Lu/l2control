/**
 * Lo de cada niño va a su mesa, contra l2control_test — v0.131.1 (M-39, X-1, X-5 y X-14).
 *
 * Lo que fijan (lo que pasó el 13 de octubre con una familia de cuatro niños en prepago con medias): al vincular, las
 * medias van con su niño y la cuenta de la familia sale de la cola (no quedan dos cuentas); el «Más tiempo» de un niño
 * vinculado va a su mesa; anular la entrada de un niño vinculado anula lo suyo en la mesa y sus medias vuelven al
 * estante; y la caja quita de una mesa lo que le añadió y no salió a cocina (el reporte n.º 2).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, cedulaDePrueba, contextoDe, crearEquipo, crearPersona, planoDePrueba, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.now();
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let monitora: Contexto;
let mesero: Contexto;
let cajera: Contexto;
let admin: Contexto;
let adminId: string;
let medias: string;
let refresco: string;
let pulsera = 0;

const cuenta = async (id: string): Promise<FamilyAccountDto> => valor(await l.app.cuentas.leer(l.sistema)).cuentas.find((c) => c.id === id)!;
const existencia = async (id: string) => (await l.app.productos.leer(l.sistema)).productos.find((p) => p.id === id)!.existencia;
/** Una familia en prepago, cada niño con su par de medias; `cliente` es su representante, para sentarlo en su mesa. */
const familiaConMedias = async (ninos: number, ahora: number) => {
  const tel = `0414-${String(7_100_000 + ++pulsera)}`;
  const cliente = { nombre: "Prueba Yenua Akvini", cedula: cedulaDePrueba(tel), telefono: tel };
  const r = valor(
    await l.app.parque.entrar(
      monitora,
      {
        idempotencyKey: randomUUID(),
        paymentMode: "PREPAGO",
        entries: Array.from({ length: ninos }, () => ({ wristbandCode: `VT-${String(++pulsera).padStart(4, "0")}`, sinMedias: true, kid: {}, packageId: "pkg-30" })),
        guardian: { fullName: "Prueba Yenua Akvini", contactReference: tel },
        guardianDocument: cedulaDePrueba(tel),
      },
      ahora,
    ),
  );
  return { ...r, cliente };
};
const vincular = (sessionIds: string[], tableId: string, ahora: number) =>
  l.app.mesas.vincular(mesero, { idempotencyKey: randomUUID(), tableId, sessionIds }, ahora);

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba vincular todo");
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [
        { id: "pkg-30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: usd("300"), active: true },
        { id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true },
      ],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  const c: CatalogoDto = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Par de medias", categoria: "Parque", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "200" } }, AHORA - 30 * MIN),
  );
  medias = c.productos.find((p) => p.nombre === "Par de medias")!.id;
  const c2: CatalogoDto = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Bubble Valle", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "600", area: "SIN_PAPEL" } }, AHORA - 30 * MIN),
  );
  refresco = c2.productos.find((p) => p.nombre === "Bubble Valle")!.id;
  for (const productId of [medias, refresco]) {
    valor(
      await l.app.entradas.registrar(
        l.sistema,
        { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [{ productId, bultos: 1, unidadesPorBulto: 20, costo: { por: "BULTO", minor: "1000" } }] },
        AHORA - 29 * MIN,
      ),
    );
  }
  const v = await l.app.ajustes.leer(l.sistema);
  valor(await l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, productoMedias: medias } }));
  await planoDePrueba(l, 6);
  adminId = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "1970" });
  const eglee = await crearPersona(l, { nombre: "Eglee Bonito", role: "MONITOR_PARQUE", pin: "6284" });
  const emily = await crearPersona(l, { nombre: "Emily Escalona", role: "MESERO", pin: "5173" });
  const dietina = await crearPersona(l, { nombre: "Dietina Gonzalez", role: "CAJERO", pin: "7391" });
  admin = await contextoDe(l, await crearEquipo(l, "Oficina"), adminId, "1970");
  monitora = await contextoDe(l, await crearEquipo(l, "Teléfono"), eglee, "6284");
  mesero = await contextoDe(l, await crearEquipo(l, "Tablet"), emily, "5173");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), dietina, "7391");
  valor(await l.app.turnos.abrir(cajera, { fondos: [{ currency: "USD", amount: usd("2000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 20 * MIN));
});

after(async () => {
  await l.cerrar();
});

describe("lo de cada niño va a su mesa (v0.131.1)", () => {
  test("al vincular, las medias van con su niño y la familia sale de la cola: una sola cuenta", async () => {
    const r = await familiaConMedias(2, AHORA - 10 * MIN);
    assert.equal(r.account.status, "POR_COBRAR");
    assert.deepEqual(
      r.account.lines.filter((x) => x.productId === medias).map((x) => x.sessionId),
      r.sessions.map((s) => s.id),
      "el par nace con la estancia de su niño",
    );
    const mesa = await sentarDePrueba(l, mesero, "mesa-1", AHORA - 9 * MIN, { cliente: r.cliente });
    const v = valor(await vincular(r.sessions.map((s) => s.id), "mesa-1", AHORA - 8 * MIN));
    const familia = v.familias[0]!;
    assert.equal(familia.status, "ABIERTA", "sale de la cola de la caja");
    assert.equal(familia.lines.filter((x) => !x.movedTo && !x.paid).length, 0);
    assert.equal(v.mesa.id, mesa.id);
    assert.deepEqual(v.mesa.lines.map((x) => x.concept.split(" · ")[0]).sort(), ["Paquete 30 minutos", "Paquete 30 minutos", "Par de medias", "Par de medias"]);
  });

  test("el «Más tiempo» de un niño vinculado va a su mesa, no a la cuenta de su familia", async () => {
    const r = await familiaConMedias(1, AHORA - 7 * MIN);
    const mesa = await sentarDePrueba(l, mesero, "mesa-2", AHORA - 6 * MIN, { cliente: r.cliente });
    valor(await vincular([r.sessions[0]!.id], "mesa-2", AHORA - 5 * MIN));
    const recarga = valor(await l.app.parque.recargar(monitora, { idempotencyKey: randomUUID(), sessionId: r.sessions[0]!.id, packageId: "pkg-60" }, AHORA - 4 * MIN));
    assert.equal(recarga.account.id, mesa.id);
    assert.match(recarga.account.lines.at(-1)!.concept, /^Sube a 1 hora/);
    assert.equal(recarga.account.status, "ABIERTA", "la mesa sigue abierta: se cobra con ella");
    const familia = await cuenta(r.account.id);
    assert.equal(familia.lines.some((x) => x.concept.startsWith("Sube a")), false);
  });

  test("anular la entrada de un niño vinculado lo anula en su mesa, y sus medias vuelven al estante", async () => {
    const r = await familiaConMedias(2, AHORA - 7 * MIN);
    const mesa = await sentarDePrueba(l, mesero, "mesa-3", AHORA - 6 * MIN, { cliente: r.cliente });
    valor(await vincular(r.sessions.map((s) => s.id), "mesa-3", AHORA - 5 * MIN));
    const antes = await existencia(medias);
    const uno = r.sessions[0]!.id;
    valor(
      await l.app.parque.anularEntrada(admin, { idempotencyKey: randomUUID(), sessionId: uno, motivo: "Se pasó la pulsera equivocada" }, { autorizadorId: adminId, pin: "1970", motivo: "Pulsera equivocada" }, AHORA - 3 * MIN),
    );
    const m = await cuenta(mesa.id);
    const suyas = m.lines.filter((x) => x.sessionId === uno);
    assert.equal(suyas.length, 2);
    assert.ok(suyas.every((x) => x.anulacion !== undefined), "su paquete y sus medias, anulados en la mesa");
    assert.ok(m.lines.filter((x) => x.sessionId === r.sessions[1]!.id).every((x) => x.anulacion === undefined), "lo del hermano sigue");
    assert.equal(await existencia(medias), antes! + 1, "el par vuelve al estante");
  });

  test("anular la entrada de un niño sin vincular anula sus medias y vuelven al estante", async () => {
    const r = await familiaConMedias(1, AHORA - 2 * MIN);
    const antes = await existencia(medias);
    const { account } = valor(
      await l.app.parque.anularEntrada(admin, { idempotencyKey: randomUUID(), sessionId: r.sessions[0]!.id, motivo: "Entró por error" }, { autorizadorId: adminId, pin: "1970", motivo: "Por error" }, AHORA - MIN),
    );
    assert.equal(account.status, "SIN_CONSUMO");
    assert.ok(account.lines.every((x) => x.anulacion !== undefined));
    assert.equal(await existencia(medias), antes! + 1);
  });

  test("la caja quita de una mesa lo que le añadió y no salió a cocina (el reporte n.º 2)", async () => {
    const mesa = await sentarDePrueba(l, mesero, "mesa-4", AHORA - MIN);
    const antes = await existencia(refresco);
    const linea = (id: string) => ({ id, concept: "Bubble Valle", kind: "RESTAURANTE" as const, amount: usd("600"), paid: false, productId: refresco, taxCode: "GENERAL" as const });
    const dos = valor(await l.app.cuentas.guardar(cajera, { cuenta: { ...mesa, status: "POR_COBRAR", lines: [linea(randomUUID()), linea(randomUUID())] } }, AHORA));
    assert.equal(await existencia(refresco), antes! - 2);
    const uno = valor(await l.app.cuentas.guardar(cajera, { cuenta: { ...dos, lines: dos.lines.slice(0, 1) } }, AHORA + MIN));
    assert.equal(uno.lines.length, 1);
    assert.equal(await existencia(refresco), antes! - 1, "el que se quitó vuelve al estante");
  });
});

describe("vincular la familia entera (B6-20, M-39)", () => {
  test("una familia de cuatro niños con medias, en prepago sin cobrar, se vincula de una vez: una sola cuenta con todo", async () => {
    const r = await familiaConMedias(4, AHORA - 5 * MIN);
    assert.equal(r.account.status, "POR_COBRAR");
    await sentarDePrueba(l, mesero, "mesa-5", AHORA - 4 * MIN, { cliente: r.cliente });
    const v = valor(await vincular(r.sessions.map((x) => x.id), "mesa-5", AHORA - 3 * MIN));
    assert.equal(v.familias.length, 1);
    assert.equal(v.familias[0]!.status, "ABIERTA", "la familia sale de la cola");
    assert.equal(v.familias[0]!.lines.filter((x) => !x.movedTo && !x.paid).length, 0, "no le queda nada");
    assert.deepEqual(
      v.mesa.lines.map((x) => x.concept.split(" · ")[0]).sort(),
      [...Array(4).fill("Paquete 30 minutos"), ...Array(4).fill("Par de medias")].sort(),
    );
    assert.deepEqual([...v.mesa.sessionIds].sort(), r.sessions.map((x) => x.id).sort());
    const cola = valor(await l.app.cuentas.leer(cajera)).cuentas.filter((c) => c.status === "POR_COBRAR").map((c) => c.id);
    assert.ok(!cola.includes(r.account.id), "en la cola queda solo la mesa, cuando pida la cuenta");
  });

  test("a la mesa de otra familia pregunta; confirmado, vincula y queda en la auditoría", async () => {
    const r = await familiaConMedias(1, AHORA - 5 * MIN);
    const mesa = await sentarDePrueba(l, mesero, "mesa-6", AHORA - 4 * MIN, { nombre: "Prueba Real Parra" });
    const sin = await vincular([r.sessions[0]!.id], "mesa-6", AHORA - 3 * MIN);
    assert.equal(!sin.ok && sin.problemas?.[0]?.message, "OTRA_FAMILIA", JSON.stringify(sin));
    assert.equal(!sin.ok && sin.mensaje, "Este niño es de Prueba Yenua Akvini y la mesa 6 es de Prueba Real Parra: ¿vincular igual?");
    assert.equal((await cuenta(mesa.id)).sessionIds.length, 0, "sin confirmar, no se vinculó");

    const v = valor(await l.app.mesas.vincular(mesero, { idempotencyKey: randomUUID(), tableId: "mesa-6", sessionIds: [r.sessions[0]!.id], otraFamilia: true }, AHORA - 2 * MIN));
    assert.deepEqual(v.mesa.sessionIds, [r.sessions[0]!.id]);
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "account", entityId: mesa.id });
    const suyo = asientos.find((a) => a.action === "mesa.vincular");
    assert.deepEqual((suyo?.after as { otraFamilia?: unknown }).otraFamilia, { de: ["Prueba Yenua Akvini"], mesaDe: "Prueba Real Parra" });
  });
});
