/**
 * El directorio por páginas, contra l2control_test — T-22 (M-38, W-11).
 *
 * Lo que fijan: el servidor trae de a 50 con cuántas hay, de la visita más reciente a la más vieja; lo buscado compara
 * el nombre (sin acentos), el de los niños y las cifras del teléfono o la cédula; la letra es la inicial sin acento, con
 * la Ñ en su sitio; una página más allá del final viene vacía con su total; cada consulta se audita sin lo buscado;
 * permisos y aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, familiaDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-11T17:00:00.000Z");
const MIN = 60_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let monitora: Contexto;
let cajera: Contexto;
let otraMonitora: Contexto;
let conVisita: string;

/** Una familia del directorio, sin visitas: su nombre, su teléfono y, si se da, un niño. */
async function familia(nombre: string, telefono: string, nino?: string): Promise<string> {
  return l.base.conTenant(l.sistema.tenantId, async (tx) => {
    const id = randomUUID();
    await tx.guardian.create({
      data: { id, tenantId: l.sistema.tenantId, fullName: nombre, contactReference: telefono, contactKey: telefono.replace(/\D/g, ""), createdAt: new Date(AHORA - 60 * MIN) },
    });
    if (nino) await tx.kid.create({ data: { id: randomUUID(), tenantId: l.sistema.tenantId, guardianId: id, name: nino, createdAt: new Date(AHORA - 60 * MIN) } });
    return id;
  });
}

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba directorio");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba directorio B");
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  const rosa = await crearPersona(otro, { nombre: "Rosa Mata", role: "MONITOR_PARQUE", pin: "6284" });
  otraMonitora = await contextoDe(otro, await crearEquipo(otro, "Entrada"), rosa, "6284");
  for (let i = 0; i < 117; i++) await familia(`Prueba Familia ${String(i).padStart(3, "0")}`, `0414-77${String(10000 + i)}`);
  await familia("Ángela Prueba", "0412-5550001", "Valentina");
  await familia("Ñañez Prueba", "0412-5550002");
  // Una que vino: va primero.
  const f = await familiaDePrueba(l, monitora, AHORA - 30 * MIN);
  conVisita = (await l.base.conTenant(l.sistema.tenantId, (tx) => tx.parkSession.findFirstOrThrow({ where: { accountId: f.id } }))).guardianId;
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("el directorio por páginas (T-22)", () => {
  test("de a 50, con cuántas hay: primero la que vino, después por nombre", async () => {
    const p1 = valor(await l.app.representantes.pagina(monitora, {}));
    assert.equal(p1.representantes.length, 50);
    assert.equal(p1.total, 120);
    assert.equal(p1.familias, 120);
    assert.equal(p1.representantes[0]!.id, conVisita);
    assert.ok(p1.representantes[0]!.visitas > 0);
    assert.equal(p1.representantes[1]!.fullName, "Ángela Prueba");
    const p3 = valor(await l.app.representantes.pagina(monitora, { desde: 100 }));
    assert.equal(p3.representantes.length, 20);
    const ids = new Set([...p1.representantes, ...p3.representantes].map((r) => r.id));
    assert.equal(ids.size, 70, "las páginas no se repiten");
    const fuera = valor(await l.app.representantes.pagina(monitora, { desde: 500 }));
    assert.deepEqual([fuera.representantes.length, fuera.total], [0, 120]);
  });

  test("lo buscado: el nombre sin acentos, el de sus niños y las cifras del teléfono", async () => {
    assert.deepEqual(valor(await l.app.representantes.pagina(monitora, { texto: "angela" })).representantes.map((r) => r.fullName), ["Ángela Prueba"]);
    assert.deepEqual(valor(await l.app.representantes.pagina(monitora, { texto: "VALENT" })).representantes.map((r) => r.fullName), ["Ángela Prueba"]);
    const porTelefono = valor(await l.app.representantes.pagina(monitora, { texto: "7710011" }));
    assert.deepEqual(porTelefono.representantes.map((r) => r.fullName), ["Prueba Familia 011"]);
    assert.equal(valor(await l.app.representantes.pagina(monitora, { texto: "Familia 0" })).total, 100);
  });

  test("la letra: la inicial sin acento, y la Ñ en su sitio; las letras con alguien, para el índice", async () => {
    const a = valor(await l.app.representantes.pagina(monitora, { letra: "A" }));
    assert.deepEqual(a.representantes.map((r) => r.fullName), ["Ángela Prueba"]);
    assert.deepEqual(valor(await l.app.representantes.pagina(monitora, { letra: "Ñ" })).representantes.map((r) => r.fullName), ["Ñañez Prueba"]);
    assert.ok(["A", "F", "P", "Ñ"].every((x) => a.letras.includes(x)), JSON.stringify(a.letras));
    assert.equal(rechazo(await l.app.representantes.pagina(monitora, { letra: "a" })).motivo, "INVALIDO");
  });

  test("cada consulta se audita: cuántas, no qué se buscó", async () => {
    valor(await l.app.representantes.pagina(monitora, { texto: "Ñañez" }));
    const a = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { action: "representante.consultar" }, orderBy: { occurredAt: "desc" } }));
    assert.ok(!JSON.stringify(a).toLowerCase().includes("ñañez"));
  });

  test("la caja no ve los contactos; otro local no ve este directorio", async () => {
    assert.equal(rechazo(await l.app.representantes.pagina(cajera, {})).motivo, "NO_PERMITIDO");
    assert.equal(valor(await otro.app.representantes.pagina(otraMonitora, { texto: "Ángela" })).total, 0);
  });
});

function rechazo(r: { ok: boolean }) {
  return r as { ok: false; motivo: string };
}
