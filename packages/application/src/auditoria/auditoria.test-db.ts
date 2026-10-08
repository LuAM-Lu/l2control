/**
 * El registro de auditoría (§7.4, F2-07) contra l2control_test.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { errorDeBase, type Base } from "@l2/database";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import type { Aplicacion, Contexto } from "../index.ts";
import { abrirLocalDePrueba, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { auditar } from "./auditar.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let app: Aplicacion;
let base: Base;
let quien: { userId: string; deviceId: string };
let A: Contexto;
const B: Contexto = { tenantId: randomUUID(), branchId: randomUUID(), sistema: true };

const tarifario = (precio: string) => ({
  packages: [{ id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: { minor: precio, currency: "USD" }, active: true }],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
});

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Auditoría A");
  ({ app, base } = local);
  // Una administradora de verdad, en un equipo aprobado: el asiento tiene que nombrarla.
  const userId = await crearPersona(local, { nombre: "Abigail Prueba", role: "ADMIN" });
  const deviceId = (await crearEquipo(local, "Tablet auditoría")).split(".")[1]!;
  quien = { userId, deviceId };
  // Sesión ya elevada (F2-04): aquí se prueba el asiento, no la elevación (eso, en identidad).
  A = {
    tenantId: local.sistema.tenantId,
    branchId: local.sistema.branchId,
    quien,
    ip: "10.0.0.7",
    elevadaHasta: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  await app.sucursal.asegurar(B, { tenant: "Auditoría B", sucursal: "Principal" });
});

after(async () => {
  await borrarTenantsDePrueba(URL_APP, [B.tenantId]);
  await local.cerrar();
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
  // Solo lo que se redacta: los identificadores son aleatorios y un UUID puede contener «1970» por azar.
  const texto = JSON.stringify({ before: asiento?.before, after: asiento?.after });
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
