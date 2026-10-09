/**
 * Anular una entrada registrada por error, contra l2control_test — B4-10 (M-27, P-7).
 *
 * Lo que fijan: administración la anula confirmando con su PIN; supervisión necesita el PIN de administración; la
 * monitora no puede; la estancia queda cerrada como ANULADA con su motivo y fuera de la sala; su paquete deja de
 * cobrarse (con su importe) y la cuenta queda sin consumo; la pulsera vuelve a servir; el reintento no anula dos
 * veces. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { EstanciaDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba, cedulaDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Domingo 27 de septiembre de 2026, 10:00 am en Caracas. */
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let admin: Contexto;
let supervision: Contexto;
let monitora: Contexto;
let adminId: string;
let telefono = 0;

const pin = (autorizadorId: string, p: string) => ({ autorizadorId, pin: p, motivo: "Entrada por error" });
async function entra(code: string): Promise<EstanciaDto> {
  const r = valor(
    await l.app.parque.entrar(
      monitora,
      {
        idempotencyKey: randomUUID(),
        paymentMode: "CUENTA_ABIERTA",
        entries: [{ wristbandCode: code, kid: {}, packageId: "pkg-60" }],
        guardian: { fullName: "Familia Anular", contactReference: `0424-${String(5_000_000 + ++telefono)}` }, guardianDocument: cedulaDePrueba(`0424-${String(5_000_000 + ++telefono)}`),
      },
      AHORA,
    ),
  );
  return r.sessions[0]!;
}
const anular = (ctx: Contexto, sessionId: string, autorizacion?: unknown, idempotencyKey = randomUUID()) =>
  l.app.parque.anularEntrada(ctx, { idempotencyKey, sessionId, motivo: "Se pasó la pulsera equivocada" }, autorizacion, AHORA + 5 * MIN);

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba anular entrada");
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  adminId = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "1970" });
  const luis = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  admin = await contextoDe(l, await crearEquipo(l, "Oficina"), adminId, "1970");
  supervision = await contextoDe(l, await crearEquipo(l, "Supervisión"), luis, "5937");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
});

after(async () => {
  await l.cerrar();
});

describe("anular una entrada registrada por error", () => {
  test("administración la anula con su PIN: fuera de la sala, sin cobro y la cuenta sin consumo", async () => {
    const s = await entra("AK-7001");
    const { account } = valor(await anular(admin, s.id, pin(adminId, "1970")));
    assert.equal(account.status, "SIN_CONSUMO");
    const linea = account.lines.find((x) => x.sessionId === s.id)!;
    assert.equal((linea.anulacion as { motivo: string }).motivo, "ENTRADA_POR_ERROR");
    assert.equal(linea.amount.minor, "500", "se queda con su importe");
    const fila = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.parkSession.findUniqueOrThrow({ where: { id: s.id } }));
    assert.equal(fila.status, "CERRADA");
    assert.equal(fila.closureKind, "ANULADA");
    assert.equal(fila.closureReason, "Se pasó la pulsera equivocada");
    const sala = valor(await l.app.parque.sala(monitora, AHORA + 6 * MIN));
    assert.equal(sala.sessions.some((x) => x.id === s.id), false);
  });

  test("su pulsera vuelve a servir", async () => {
    const otra = await entra("AK-7001");
    assert.equal(otra.wristbandCode, "AK-7001");
    assert.equal(valor(await l.app.parque.pulsera(monitora, { codigo: "AK-7001" })).estado, "ACTIVA");
  });

  test("supervisión necesita el PIN de administración; la monitora no puede", async () => {
    const s = await entra("AK-7002");
    const sin = await anular(supervision, s.id);
    assert.equal(sin.ok, false);
    valor(await anular(supervision, s.id, pin(adminId, "1970")));
    const s2 = await entra("AK-7003");
    const m = await anular(monitora, s2.id, pin(adminId, "1970"));
    assert.equal(!m.ok && m.motivo, "NO_PERMITIDO");
  });

  test("el reintento con la misma clave no anula dos veces; una estancia ya cerrada no se anula", async () => {
    const s = await entra("AK-7004");
    const clave = randomUUID();
    valor(await anular(admin, s.id, pin(adminId, "1970"), clave));
    valor(await anular(admin, s.id, pin(adminId, "1970"), clave));
    const otra = await anular(admin, s.id, pin(adminId, "1970"));
    assert.equal(!otra.ok && otra.motivo, "CONFLICTO");
    const versiones = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.accountVersion.count({ where: { cause: "ANULAR_ENTRADA", operationKey: clave } }));
    assert.equal(versiones, 1);
  });
});
