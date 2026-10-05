/**
 * La carga desde papel en la base (B3-7, V-12, ADR-027): lo que la base impone aunque la aplicación se
 * equivoque. La ventana del corte, el avance de los estados, que un registro solo entre en una carga
 * abierta y dentro de su ventana, el solo-agregar y el aislamiento entre locales.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { abrirBase, type Base } from "./index.ts";
import { borrarTenantsDePrueba } from "./para-pruebas.ts";
import { errorDeBase, type MotivoDeBase } from "./errores.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const H = 3_600_000;
/** El instante en que se carga todo lo de este archivo. */
const AHORA = new Date("2026-10-05T18:00:00.000Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);

let app: Base;
const A = { tenant: randomUUID(), sucursal: randomUUID() };
const B = { tenant: randomUUID(), sucursal: randomUUID() };
let equipos = 0;

before(async () => {
  app = await abrirBase(URL_APP);
  for (const t of [A, B]) {
    await app.conTenant(t.tenant, async (tx) => {
      await tx.tenant.create({ data: { id: t.tenant, name: `prueba ${t.tenant}` } });
      await tx.branch.create({ data: { id: t.sucursal, tenantId: t.tenant, name: "Principal" } });
    });
  }
});

after(async () => {
  await borrarTenantsDePrueba(URL_APP, [A.tenant, B.tenant]);
  await app.cerrar();
});

const por = (motivo: MotivoDeBase) => (e: unknown) => {
  assert.equal(errorDeBase(e)?.motivo, motivo, String(e));
  return true;
};

type Local = { tenant: string; sucursal: string };

/** Un turno abierto con su persona, y una cuenta de la sucursal. */
async function turnoConCuenta(t: Local) {
  return app.conTenant(t.tenant, async (tx) => {
    const persona = await tx.staffUser.create({ data: { tenantId: t.tenant, fullName: "Marisol Prieto", role: "CAJERO" } });
    const equipo = await tx.device.create({
      data: { tenantId: t.tenant, branchId: t.sucursal, label: `Caja ${++equipos}`, status: "APROBADO", secretHash: randomUUID() },
    });
    const turno = await tx.cashShift.create({
      data: {
        tenantId: t.tenant,
        branchId: t.sucursal,
        deviceId: equipo.id,
        pointLabel: equipo.label,
        businessDate: new Date("2026-10-05T00:00:00.000Z"),
        status: "ABIERTO",
        openedAt: hace(4),
        openedBy: persona.id,
        openedByName: persona.fullName,
      },
    });
    const cuenta = await tx.account.create({
      data: { id: randomUUID(), tenantId: t.tenant, branchId: t.sucursal, kind: "MOSTRADOR", orderNumber: equipos, openedAt: hace(3), openedByName: "Marisol Prieto" },
    });
    return { turno, cuenta, persona };
  });
}

const abrir = (t: Local, turnoId: string, persona: { id: string }, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.paperLoad.create({
      data: {
        tenantId: t.tenant,
        branchId: t.sucursal,
        shiftId: turnoId,
        windowFrom: hace(3),
        windowTo: hace(1),
        status: "ABIERTA",
        operationKey: randomUUID(),
        openedAt: AHORA,
        openedBy: persona.id,
        openedByName: "Marisol Prieto",
        ...extra,
      } as never,
    }),
  );

const registro = (t: Local, loadId: string, accountId: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.paperLoadItem.create({
      data: {
        tenantId: t.tenant,
        loadId,
        kind: "COBRO",
        accountId,
        operationKey: randomUUID(),
        occurredAt: hace(2),
        loadedAt: AHORA,
        loadedByName: "Marisol Prieto",
        detail: { total: { minor: "500", currency: "USD" } },
        ...extra,
      } as never,
    }),
  );

const cerrar = (t: Local, id: string, persona: { id: string }, status: "CERRADA" | "DESCARTADA") =>
  app.conTenant(t.tenant, (tx) =>
    tx.paperLoad.update({ where: { id }, data: { status, closedAt: new Date(AHORA.getTime() + 60_000), closedBy: persona.id, closedByName: "Marisol Prieto" } }),
  );

const revisar = (t: Local, id: string, persona: { id: string }, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.paperLoad.update({
      where: { id },
      data: { status: "REVISADA", reviewedAt: new Date(AHORA.getTime() + 120_000), reviewedBy: persona.id, reviewedByName: "Luis Guerrero", ...extra },
    }),
  );

test("la ventana del corte empieza antes de terminar, dura a lo sumo un día y no termina en el futuro", async () => {
  const { turno, persona } = await turnoConCuenta(A);
  for (const [i, extra] of [
    { windowFrom: hace(1), windowTo: hace(2) }, // al revés
    { windowFrom: hace(1), windowTo: hace(1) }, // sin duración
    { windowFrom: hace(30), windowTo: hace(1) }, // más de un día
    { windowFrom: hace(3), windowTo: new Date(AHORA.getTime() + 1) }, // termina después de abrirse
  ].entries()) {
    await assert.rejects(abrir(A, turno.id, persona, extra), por("RESTRICCION"), String(i));
  }
  const ok = await abrir(A, turno.id, persona, { windowFrom: new Date(AHORA.getTime() - 24 * H), windowTo: AHORA });
  assert.equal(ok.status, "ABIERTA");
});

test("una carga nace abierta, con nota corta y con quien la abrió", async () => {
  const { turno, persona } = await turnoConCuenta(A);
  await assert.rejects(abrir(A, turno.id, persona, { status: "CERRADA", closedAt: AHORA, closedBy: persona.id, closedByName: "Marisol Prieto" }), por("RESTRICCION"));
  await assert.rejects(abrir(A, turno.id, persona, { note: "x".repeat(161) }), por("RESTRICCION"));
  await assert.rejects(abrir(A, turno.id, persona, { note: "  " }), por("RESTRICCION"));
  await assert.rejects(abrir(A, turno.id, persona, { openedByName: " " }), por("RESTRICCION"));
  await abrir(A, turno.id, persona, { note: "Se fue la luz" });
});

test("un turno, una carga abierta; la misma operación no abre dos", async () => {
  const { turno, persona } = await turnoConCuenta(A);
  const primera = await abrir(A, turno.id, persona);
  await assert.rejects(abrir(A, turno.id, persona), por("DUPLICADO"));
  // Cerrada la primera (con un registro), el turno admite otra.
  const t2 = await turnoConCuenta(A);
  const c2 = await abrir(A, t2.turno.id, t2.persona);
  await assert.rejects(abrir(A, t2.turno.id, t2.persona, { operationKey: c2.operationKey }), por("DUPLICADO"));
  assert.notEqual(primera.id, c2.id);
});

test("una carga avanza ABIERTA → CERRADA → REVISADA, y no hacia atrás ni de un salto", async () => {
  const { turno, cuenta, persona } = await turnoConCuenta(A);
  const c = await abrir(A, turno.id, persona);
  await registro(A, c.id, cuenta.id);

  // No se revisa lo que no se terminó de cargar.
  await assert.rejects(revisar(A, c.id, persona), por("SOLO_AGREGAR"));
  const cerrada = await cerrar(A, c.id, persona, "CERRADA");
  assert.equal(cerrada.status, "CERRADA");
  // Cerrada, ya no admite registros ni se descarta.
  await assert.rejects(registro(A, c.id, cuenta.id), por("RESTRICCION"));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoad.update({ where: { id: c.id }, data: { status: "ABIERTA", closedAt: null, closedBy: null, closedByName: null } })), por("SOLO_AGREGAR"));
  // La revisión coherente: quién y cuándo, y no antes de que se cerrara.
  await assert.rejects(revisar(A, c.id, persona, { reviewedAt: hace(5) }), por("RESTRICCION"));
  await assert.rejects(revisar(A, c.id, persona, { reviewedByName: null }), por("RESTRICCION"));
  await assert.rejects(revisar(A, c.id, persona, { reviewNote: "x".repeat(281) }), por("RESTRICCION"));
  const revisada = await revisar(A, c.id, persona, { reviewNote: "Cuadra con las hojas 1 y 2" });
  assert.equal(revisada.status, "REVISADA");
  // Revisada, nada más cambia.
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoad.update({ where: { id: c.id }, data: { reviewNote: "Otra cosa" } })), por("SOLO_AGREGAR"));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoad.update({ where: { id: c.id }, data: { status: "CERRADA" } })), por("SOLO_AGREGAR"));
});

test("sin registros no se cierra para revisar: se descarta; con registros no se descarta", async () => {
  const vacia = await turnoConCuenta(A);
  const c1 = await abrir(A, vacia.turno.id, vacia.persona);
  await assert.rejects(cerrar(A, c1.id, vacia.persona, "CERRADA"), por("RESTRICCION"));
  const descartada = await cerrar(A, c1.id, vacia.persona, "DESCARTADA");
  assert.equal(descartada.status, "DESCARTADA");
  // Una descartada es terminal.
  await assert.rejects(revisar(A, c1.id, vacia.persona), por("SOLO_AGREGAR"));

  const llena = await turnoConCuenta(A);
  const c2 = await abrir(A, llena.turno.id, llena.persona);
  await registro(A, c2.id, llena.cuenta.id);
  await assert.rejects(cerrar(A, c2.id, llena.persona, "DESCARTADA"), por("RESTRICCION"));
});

test("lo que la cajera declaró al abrir no se reescribe, y una carga no se borra", async () => {
  const { turno, persona } = await turnoConCuenta(A);
  const c = await abrir(A, turno.id, persona);
  for (const data of [{ windowFrom: hace(4) }, { windowTo: hace(2) }, { note: "Otra" }, { openedByName: "Otra persona" }, { openedAt: hace(1) }]) {
    await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoad.update({ where: { id: c.id }, data })), por("SOLO_AGREGAR"), JSON.stringify(data));
  }
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoad.delete({ where: { id: c.id } })), por("SOLO_AGREGAR"));
});

test("un registro solo entra en una carga abierta, dentro de su ventana y a una cuenta de su sucursal", async () => {
  const { turno, cuenta, persona } = await turnoConCuenta(A);
  const c = await abrir(A, turno.id, persona, { windowFrom: hace(3), windowTo: hace(1) });

  // Dentro de la ventana, con los dos extremos incluidos.
  await registro(A, c.id, cuenta.id, { occurredAt: hace(3) });
  await registro(A, c.id, cuenta.id, { occurredAt: hace(1) });
  await registro(A, c.id, cuenta.id, { kind: "ENTRADA", occurredAt: hace(2) });
  // Fuera de ella, de un lado y del otro.
  await assert.rejects(registro(A, c.id, cuenta.id, { occurredAt: new Date(hace(3).getTime() - 1) }), por("RESTRICCION"));
  await assert.rejects(registro(A, c.id, cuenta.id, { occurredAt: new Date(hace(1).getTime() + 1) }), por("RESTRICCION"));
  // Cargado antes de que ocurriera: no.
  await assert.rejects(registro(A, c.id, cuenta.id, { occurredAt: hace(2), loadedAt: hace(2.5) }), por("RESTRICCION"));
  // Con su forma.
  await assert.rejects(registro(A, c.id, cuenta.id, { kind: "REGALO" }), por("RESTRICCION"));
  await assert.rejects(registro(A, c.id, cuenta.id, { detail: [] }), por("RESTRICCION"));
  await assert.rejects(registro(A, c.id, cuenta.id, { loadedByName: "" }), por("RESTRICCION"));
});

test("un registro no cita una cuenta de otra sucursal ni de otro local", async () => {
  const { turno, persona } = await turnoConCuenta(A);
  const c = await abrir(A, turno.id, persona);
  const otraSucursal = randomUUID();
  const ajena = await app.conTenant(A.tenant, async (tx) => {
    await tx.branch.create({ data: { id: otraSucursal, tenantId: A.tenant, name: "Segunda" } });
    return tx.account.create({ data: { id: randomUUID(), tenantId: A.tenant, branchId: otraSucursal, kind: "MOSTRADOR", orderNumber: 1, openedAt: hace(3), openedByName: "Marisol Prieto" } });
  });
  await assert.rejects(registro(A, c.id, ajena.id), por("RESTRICCION"));

  // La cuenta de otro local ni se ve (RLS): el disparador la rechaza antes que la FK.
  const deB = await turnoConCuenta(B);
  await assert.rejects(registro(A, c.id, deB.cuenta.id), por("RESTRICCION"));
});

test("un registro es solo-agregar y su clave de operación no se repite", async () => {
  const { turno, cuenta, persona } = await turnoConCuenta(A);
  const c = await abrir(A, turno.id, persona);
  const clave = randomUUID();
  const r = await registro(A, c.id, cuenta.id, { operationKey: clave });
  await assert.rejects(registro(A, c.id, cuenta.id, { operationKey: clave }), por("DUPLICADO"));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoadItem.update({ where: { id: r.id }, data: { occurredAt: hace(1.5) } })), por("SOLO_AGREGAR"));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paperLoadItem.delete({ where: { id: r.id } })), por("SOLO_AGREGAR"));
});

test("el turno sellado ya no admite una carga nueva", async () => {
  const { turno, persona } = await turnoConCuenta(A);
  await app.conTenant(A.tenant, (tx) =>
    tx.cashShift.update({ where: { id: turno.id }, data: { status: "CERRADO_Z", closedAt: AHORA, closedBy: persona.id, closedByName: "Marisol Prieto" } }),
  );
  await assert.rejects(abrir(A, turno.id, persona), por("RESTRICCION"));
});

test("un local no ve las cargas de otro, ni abre una en su turno", async () => {
  const delA = await turnoConCuenta(A);
  const c = await abrir(A, delA.turno.id, delA.persona);
  await registro(A, c.id, delA.cuenta.id);

  const [cargasDeB, registrosDeB] = await app.conTenant(B.tenant, async (tx) => [await tx.paperLoad.findMany(), await tx.paperLoadItem.findMany()] as const);
  assert.deepEqual(cargasDeB, []);
  assert.deepEqual(registrosDeB, []);
  // Con la firma de B no se abre una carga en el turno de A: la FK compuesta lo impide.
  await assert.rejects(
    app.conTenant(B.tenant, (tx) =>
      tx.paperLoad.create({
        data: {
          tenantId: B.tenant,
          branchId: B.sucursal,
          shiftId: delA.turno.id,
          windowFrom: hace(3),
          windowTo: hace(1),
          status: "ABIERTA",
          operationKey: randomUUID(),
          openedAt: AHORA,
          openedBy: delA.persona.id,
          openedByName: "Intruso",
        } as never,
      }),
    ),
    por("REFERENCIA_INVALIDA"),
  );
});
