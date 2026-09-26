/**
 * El registro de auditoría (§7.4, F2-07) contra l2control_test.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { abrirBase, errorDeBase, type Base } from "@l2/database";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import { conectar, type Aplicacion, type Contexto } from "../index.ts";
import { auditar } from "./auditar.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let app: Aplicacion;
let base: Base;
const quien = { userId: randomUUID(), deviceId: randomUUID() };
const A: Contexto = { tenantId: randomUUID(), branchId: randomUUID(), quien, ip: "10.0.0.7" };
const B: Contexto = { tenantId: randomUUID(), branchId: randomUUID() };

const tarifario = (precio: string) => ({
  packages: [{ id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: { minor: precio, currency: "USD" }, active: true }],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
});

before(async () => {
  app = await conectar(URL_APP);
  base = await abrirBase(URL_APP);
  await app.sucursal.asegurar(A, { tenant: "Auditoría A", sucursal: "Principal" });
  await app.sucursal.asegurar(B, { tenant: "Auditoría B", sucursal: "Principal" });
});

after(async () => {
  await borrarTenantsDePrueba(URL_APP, [A.tenantId, B.tenantId]);
  await Promise.all([app.cerrar(), base.cerrar()]);
});

test("publicar el tarifario deja su asiento: quién, desde dónde, antes y después", async () => {
  await app.tarifario.publicar(A, tarifario("300"));
  const r = await app.tarifario.publicar(A, tarifario("350"));
  assert.ok(r.ok);
  const [ultimo] = await app.auditoria.listar(A, { entityType: "park_tariff_version" });
  assert.equal(ultimo?.action, "tarifario.publicar");
  assert.equal(ultimo?.outcome, "HECHO");
  assert.equal(ultimo?.actorId, quien.userId);
  assert.equal(ultimo?.deviceId, quien.deviceId);
  assert.equal(ultimo?.ip, "10.0.0.7");
  assert.equal(ultimo?.branchId, A.branchId);
  assert.equal(JSON.stringify(ultimo?.before).includes('"minor":"300"'), true);
  assert.equal(JSON.stringify(ultimo?.after).includes('"minor":"350"'), true);
});

test("si el asiento no entra, la publicación tampoco (misma transacción)", async () => {
  const antes = await app.tarifario.leer(A);
  // Una IP que la base no acepta hace fallar el asiento, que va dentro de la transacción.
  await assert.rejects(app.tarifario.publicar({ ...A, ip: "no-es-una-ip" }, tarifario("999")));
  assert.equal((await app.tarifario.leer(A))?.version, antes?.version);
});

test("un asiento no se edita ni se borra, ni siquiera el propio", async () => {
  for (const cambio of [
    base.conTenant(A.tenantId, (tx) => tx.auditEntry.updateMany({ where: {}, data: { reason: "arreglado" } })),
    base.conTenant(A.tenantId, (tx) => tx.auditEntry.deleteMany({})),
  ]) {
    await assert.rejects(cambio, (e: unknown) => errorDeBase(e)?.motivo === "SOLO_AGREGAR");
  }
});

test("la acción tiene forma de catálogo: no se cuela texto libre", async () => {
  await assert.rejects(
    base.conTenant(A.tenantId, (tx) =>
      auditar(tx, A, { action: "tarifario.publicar; DROP TABLE x" as "tarifario.publicar" }),
    ),
    (e: unknown) => errorDeBase(e)?.motivo === "RESTRICCION",
  );
});

test("lo sensible no llega al registro", async () => {
  await base.conTenant(A.tenantId, (tx) =>
    auditar(tx, A, {
      action: "usuario.pin",
      entityType: "staff_user",
      entityId: "u-prueba",
      before: { pin: "1970", nombre: "Marisol" },
      after: { pinHash: "$argon2id$...", representante: { telefono: "0414-1234567" } },
    }),
  );
  const [asiento] = await app.auditoria.listar(A, { entityId: "u-prueba" });
  const texto = JSON.stringify(asiento);
  assert.ok(!texto.includes("1970") && !texto.includes("argon2id") && !texto.includes("1234567"), texto);
  assert.ok(texto.includes("Marisol"));
});

test("cada tenant ve solo su registro", async () => {
  await app.tarifario.publicar(B, tarifario("500"));
  const deB = await app.auditoria.listar(B);
  assert.ok(deB.length >= 1);
  assert.ok(deB.every((a) => a.tenantId === B.tenantId));
  assert.ok((await app.auditoria.listar(A)).every((a) => a.tenantId === A.tenantId));
});
