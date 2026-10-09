/**
 * Los respaldos contra l2control_test — B7-4, M-26.
 *
 * Los respaldos los escribe el guion del servidor; aquí se escriben como él. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { CopiaDeRespaldoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { clasificar, type PcDeRespaldos } from "./respaldos.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const H = 3_600_000;
const AHORA = Date.parse("2026-10-08T12:00:00.000Z");
const HUELLA = "a".repeat(64);

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinConfirmar: Contexto;
let ctxCajera: Contexto;

/** Lo que haría `respaldar.sh` una noche. */
const respaldo = (hace: number, extra: { estado?: "HECHO" | "FALLIDO"; sha256?: string } = {}) => {
  const hecho = new Date(AHORA - hace);
  const fallido = extra.estado === "FALLIDO";
  const archivo = `l2control-${hecho.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z.l2r`;
  return local.base.conTenant(local.sistema.tenantId, (tx) =>
    tx.backupCopy.create({
      data: {
        tenantId: local.sistema.tenantId,
        madeAt: hecho,
        state: fallido ? "FALLIDO" : "HECHO",
        file: fallido ? null : archivo,
        bytes: fallido ? null : 412_000n,
        sha256: fallido ? null : (extra.sha256 ?? HUELLA),
        version: "0.59.0",
        detail: fallido ? "pg_dump no pudo conectarse" : null,
      },
    }),
  );
};

const copia = (horas: number, o: Partial<CopiaDeRespaldoDto> = {}): CopiaDeRespaldoDto => ({
  id: crypto.randomUUID(),
  hechoEn: new Date(AHORA - horas * H).toISOString(),
  estado: "HECHO",
  archivo: "l2control-20261008T070000Z.l2r",
  bytes: 1,
  sha256: HUELLA,
  version: null,
  detalle: null,
  bajadoEn: null,
  retiradoEn: null,
  fijado: null,
  ensayo: null,
  ...o,
});

const entrar = (credencial: string) => local.app.respaldos.entrarPc(local.sistema, credencial, "190.202.10.4", AHORA);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Respaldos");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinConfirmar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(async () => {
  await local.cerrar();
});

describe("cómo están", () => {
  test("de lo peor a lo mejor: sin ninguno, fallido, atrasado, sin PC o sin bajar, al día", () => {
    assert.equal(clasificar([], true, AHORA).nivel, "SIN_RESPALDOS");
    assert.equal(clasificar([copia(2, { estado: "FALLIDO", archivo: null, sha256: null, detalle: "sin espacio" }), copia(26)], true, AHORA).nivel, "FALLIDO");
    assert.equal(clasificar([copia(27)], true, AHORA).nivel, "ATRASADO");
    assert.match(clasificar([copia(5)], false, AHORA).aviso, /Ninguna PC/);
    // El primero tiene medio día para salir del servidor.
    assert.equal(clasificar([copia(5)], true, AHORA).nivel, "AL_DIA");
    assert.equal(clasificar([copia(13)], true, AHORA).nivel, "SIN_BAJAR");
    // Bajado hace poco: al día aunque el de anoche todavía no haya salido.
    assert.equal(clasificar([copia(5), copia(29, { bajadoEn: new Date(AHORA - 25 * H).toISOString() })], true, AHORA).nivel, "AL_DIA");
    // El último que salió es de hace más de día y medio: la única copia reciente está en el servidor.
    assert.equal(clasificar([copia(5), copia(29), copia(53, { bajadoEn: new Date(AHORA - 50 * H).toISOString() })], true, AHORA).nivel, "SIN_BAJAR");
  });
});

describe("la PC del local", () => {
  let pc: PcDeRespaldos;
  let primera: string;

  test("sin respaldos, el panel lo dice; es de administración", async () => {
    const e = await local.app.respaldos.estado(ctxAdminSinConfirmar, AHORA);
    assert.ok(e.ok);
    assert.equal(e.valor.nivel, "SIN_RESPALDOS");
    assert.equal(e.valor.pc, null);
    const caja = await local.app.respaldos.estado(ctxCajera, AHORA);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
  });

  test("prepararla pide confirmar la identidad; la credencial se da una vez y solo se guarda su huella", async () => {
    const sin = await local.app.respaldos.prepararPc(ctxAdminSinConfirmar, { nombre: "PC de administración" }, AHORA);
    assert.equal(!sin.ok && sin.motivo, "ELEVACION_REQUERIDA");
    const caja = await local.app.respaldos.prepararPc(ctxCajera, { nombre: "PC de caja" }, AHORA);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");

    const r = await local.app.respaldos.prepararPc(ctxAdmin, { nombre: "PC de administración" }, AHORA);
    assert.ok(r.ok);
    primera = r.valor.credencial;
    assert.match(primera, /^[0-9a-f]{64}$/);
    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupReceiver.findUniqueOrThrow({ where: { id: r.valor.pc.id } }));
    assert.notEqual(fila.secretSha256, primera);

    assert.equal(await entrar("f".repeat(64)), null);
    assert.equal(await entrar("no es una credencial"), null);
    pc = (await entrar(primera))!;
    assert.equal(pc.nombre, "PC de administración");
    const e = await local.app.respaldos.estado(ctxAdmin, AHORA);
    assert.ok(e.ok);
    assert.equal(e.valor.pc?.ultimaConexion, new Date(AHORA).toISOString());
  });

  test("ve lo que sigue en el servidor y confirma con la huella", async () => {
    const vieja = await respaldo(30 * H);
    const nueva = await respaldo(5 * H, { sha256: "b".repeat(64) });
    await respaldo(2 * H, { estado: "FALLIDO" });

    const i = await local.app.respaldos.indice(pc);
    assert.deepEqual(i.copias.map((c) => c.archivo).sort(), [vieja.file, nueva.file].sort());
    assert.equal((await local.app.respaldos.copia(pc, nueva.file!))?.sha256, "b".repeat(64));
    assert.equal(await local.app.respaldos.copia(pc, "l2control-20200101T000000Z.l2r"), null);

    // Con la huella equivocada no cuenta como copia fuera del servidor.
    const mala = await local.app.respaldos.acusar(pc, { archivo: nueva.file, sha256: HUELLA }, AHORA);
    assert.equal(!mala.ok && mala.motivo, "CONFLICTO");
    const bien = await local.app.respaldos.acusar(pc, { archivo: nueva.file, sha256: "b".repeat(64) }, AHORA);
    assert.deepEqual(bien, { ok: true, valor: { yaEstaba: false } });
    const otraVez = await local.app.respaldos.acusar(pc, { archivo: nueva.file, sha256: "b".repeat(64) }, AHORA);
    assert.deepEqual(otraVez, { ok: true, valor: { yaEstaba: true } });

    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupCopy.findUniqueOrThrow({ where: { id: nueva.id } }));
    assert.deepEqual([fila.downloadedFrom, fila.downloadedBy], ["190.202.10.4", pc.id]);
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "respaldo.bajar", entityId: nueva.id } }));
    assert.ok(asiento);

    // El último intento falló: el panel lo dice antes que nada, y enseña el último hecho y el último bajado.
    const e = await local.app.respaldos.estado(ctxAdmin, AHORA);
    assert.ok(e.ok);
    assert.equal(e.valor.nivel, "FALLIDO");
    assert.match(e.valor.aviso, /pg_dump no pudo conectarse/);
    assert.deepEqual([e.valor.ultimo?.id, e.valor.ultimoBajado?.id], [nueva.id, nueva.id]);
  });

  test("preparar otra retira la anterior; retirarla la deja sin entrar", async () => {
    const otra = await local.app.respaldos.prepararPc(ctxAdmin, { nombre: "Laptop de caja" }, AHORA);
    assert.ok(otra.ok);
    assert.equal(await entrar(primera), null);
    assert.equal((await entrar(otra.valor.credencial))?.nombre, "Laptop de caja");

    const r = await local.app.respaldos.retirarPc(ctxAdmin, { id: otra.valor.pc.id }, AHORA);
    assert.ok(r.ok);
    assert.equal(r.valor.pc, null);
    assert.equal(await entrar(otra.valor.credencial), null);
    const otraVez = await local.app.respaldos.retirarPc(ctxAdmin, { id: otra.valor.pc.id }, AHORA);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
  });

  test("la aplicación solo anota la bajada: no cambia ni borra un respaldo", async () => {
    const r = await respaldo(1 * H);
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupCopy.update({ where: { id: r.id }, data: { sha256: "c".repeat(64) } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupCopy.delete({ where: { id: r.id } })));
    // Y la base no deja uno hecho sin su huella.
    await assert.rejects(
      local.base.conTenant(local.sistema.tenantId, (tx) =>
        tx.backupCopy.create({ data: { tenantId: local.sistema.tenantId, state: "HECHO", file: "l2control-20261008T010000Z.l2r", bytes: 1n } }),
      ),
    );
  });
});

describe("con control (B7-6)", () => {
  /** Lo que haría `respaldar.sh` al ensayar una noche. */
  const ensayo = (copyId: string, horas: number, intact: boolean, detail: string | null = null) =>
    local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.backupRehearsal.create({ data: { tenantId: local.sistema.tenantId, copyId, at: new Date(AHORA - horas * H), intact, seconds: 9, detail } }),
    );

  test("el ensayo semanal: íntegro al día; uno que falló es lo primero; sin ensayo en una semana, se avisa", () => {
    const e = (horas: number, integro: boolean) => ({ integro, en: new Date(AHORA - horas * H).toISOString(), detalle: integro ? null : "la huella no coincide" });
    const bajada = { bajadoEn: new Date(AHORA - 4 * H).toISOString() };
    assert.match(clasificar([copia(5, bajada)], true, AHORA, e(5, true)).aviso, /ÍNTEGRO/);
    const roto = clasificar([copia(5, bajada)], true, AHORA, e(5, false));
    assert.deepEqual([roto.nivel, /la huella no coincide/.test(roto.aviso)], ["NO_INTEGRO", true]);
    assert.equal(clasificar([copia(5, bajada)], true, AHORA, e(9 * 24, true)).nivel, "SIN_ENSAYO");
    // Sin ningún ensayo: con respaldos de hace más de una semana, se avisa; con los primeros, todavía no.
    assert.equal(clasificar([copia(5, bajada), copia(9 * 24)], true, AHORA).nivel, "SIN_ENSAYO");
    assert.equal(clasificar([copia(5, bajada)], true, AHORA).nivel, "AL_DIA");
    // Lo que no se hizo pesa más que el ensayo.
    assert.equal(clasificar([copia(27)], true, AHORA, e(5, false)).nivel, "ATRASADO");
  });

  test("la PC dice dónde guarda y su programa; el panel lo enseña", async () => {
    const r = await local.app.respaldos.prepararPc(ctxAdmin, { nombre: "PC de administración" }, AHORA);
    assert.ok(r.ok);
    await local.app.respaldos.entrarPc(local.sistema, r.valor.credencial, "190.202.10.4", AHORA, { programa: 2, carpeta: "E:\L2 Control - Respaldos", tipoDeCarpeta: "EXTERNO" });
    // Una conexión que no dice nada no borra lo que dijo antes.
    await local.app.respaldos.entrarPc(local.sistema, r.valor.credencial, "190.202.10.4", AHORA + 1000, null);
    const e = await local.app.respaldos.estado(ctxAdmin, AHORA);
    assert.ok(e.ok);
    assert.deepEqual([e.valor.pc?.carpeta, e.valor.pc?.tipoDeCarpeta, e.valor.pc?.programa], ["E:\L2 Control - Respaldos", "EXTERNO", 2]);
  });

  test("fijar uno con su nombre: la PC lo ve en el índice, el panel lo enseña y no se fija dos veces", async () => {
    const r = await local.app.respaldos.prepararPc(ctxAdmin, { nombre: "PC de administración" }, AHORA);
    assert.ok(r.ok);
    const pc = (await entrar(r.valor.credencial))!;
    const copiaFijada = await respaldo(6 * H);
    const sin = await local.app.respaldos.fijar(ctxAdminSinConfirmar, { id: copiaFijada.id, nombre: "antes de producción" }, AHORA);
    assert.equal(!sin.ok && sin.motivo, "ELEVACION_REQUERIDA");
    const caja = await local.app.respaldos.fijar(ctxCajera, { id: copiaFijada.id, nombre: "antes de producción" }, AHORA);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");

    const f = await local.app.respaldos.fijar(ctxAdmin, { id: copiaFijada.id, nombre: "antes de producción" }, AHORA);
    assert.ok(f.ok);
    assert.deepEqual(f.valor.fijados.map((c) => [c.id, c.fijado?.nombre, c.fijado?.por]), [[copiaFijada.id, "antes de producción", "Abigail Karam"]]);
    const i = await local.app.respaldos.indice(pc);
    assert.equal(i.copias.find((c) => c.archivo === copiaFijada.file)?.fijado, "antes de producción");
    const otraVez = await local.app.respaldos.fijar(ctxAdmin, { id: copiaFijada.id, nombre: "otro nombre" }, AHORA);
    assert.match(!otraVez.ok ? otraVez.mensaje : "", /ya está fijado como «antes de producción»/);
    assert.ok(await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "respaldo.fijar", entityId: copiaFijada.id } })));

    // Soltarlo lo devuelve a la retención de siempre; el fijado queda con quién y cuándo, sin borrarse.
    const s = await local.app.respaldos.soltar(ctxAdmin, { id: copiaFijada.id }, AHORA + 1000);
    assert.ok(s.ok);
    assert.deepEqual(s.valor.fijados, []);
    assert.equal((await local.app.respaldos.indice(pc)).copias.find((c) => c.archivo === copiaFijada.file)?.fijado, null);
    const s2 = await local.app.respaldos.soltar(ctxAdmin, { id: copiaFijada.id }, AHORA + 2000);
    assert.equal(!s2.ok && s2.motivo, "CONFLICTO");
    const pines = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupPin.findMany({ where: { copyId: copiaFijada.id } }));
    assert.deepEqual(pines.map((p) => p.releasedByName), ["Abigail Karam"]);
  });

  test("lo que ya no está en el servidor no se fija; un fijado no se borra ni se rebautiza", async () => {
    // Uno que la retención del servidor ya quitó (lo marca respaldar.sh): ya no se puede proteger desde aquí.
    const quitado = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.backupCopy.create({
        data: { tenantId: local.sistema.tenantId, madeAt: new Date(AHORA - 200 * H), state: "HECHO", file: "l2control-20260930T071500Z.l2r", bytes: 1n, sha256: HUELLA, removedAt: new Date(AHORA - 30 * H) },
      }),
    );
    const r = await local.app.respaldos.fijar(ctxAdmin, { id: quitado.id, nombre: "tarde" }, AHORA);
    assert.match(!r.ok ? r.mensaje : "", /ya no está en el servidor/);
    const otro = await respaldo(3 * H);
    assert.ok((await local.app.respaldos.fijar(ctxAdmin, { id: otro.id, nombre: "cierre de octubre" }, AHORA)).ok);
    const pin = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupPin.findFirstOrThrow({ where: { copyId: otro.id } }));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupPin.update({ where: { id: pin.id }, data: { name: "otro" } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupPin.delete({ where: { id: pin.id } })));
  });

  test("el último ensayo llega al panel; uno que no salió íntegro es lo primero que se ve", async () => {
    const r = await respaldo(0.5 * H);
    await ensayo(r.id, 0.4, true, "62 tablas, 1.204 filas, 18 asientos");
    const bien = await local.app.respaldos.estado(ctxAdmin, AHORA);
    assert.ok(bien.ok);
    assert.deepEqual([bien.valor.ensayo?.integro, bien.valor.ensayo?.archivo], [true, r.file]);
    assert.equal(bien.valor.copias.find((c) => c.id === r.id)?.ensayo?.integro, true);
    await ensayo(r.id, 0.2, false, "pg_restore: la tabla payment no se pudo crear");
    const mal = await local.app.respaldos.estado(ctxAdmin, AHORA);
    assert.ok(mal.ok);
    assert.equal(mal.valor.nivel, "NO_INTEGRO");
    assert.match(mal.valor.aviso, /payment no se pudo crear/);
    // Un ensayo no se cambia.
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupRehearsal.updateMany({ where: { copyId: r.id }, data: { intact: true } })));
  });
});

describe("respaldar ahora (B7-8)", () => {
  test("administración con la identidad confirmada lo pide; uno a la vez, y el panel lo enseña pedido", async () => {
    const r = await local.app.respaldos.pedirAhora(ctxAdmin, AHORA);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.pedido?.estado, "PEDIDO");
    assert.equal(r.valor.pedido?.por, "Abigail Karam");
    // Otra vez (un doble toque, u otra persona): se queda el mismo.
    const otra = await local.app.respaldos.pedirAhora(ctxAdmin, AHORA + 1000);
    assert.ok(otra.ok);
    assert.equal(otra.valor.pedido?.pedidoEn, r.valor.pedido?.pedidoEn);
    assert.equal(await local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupRequest.count()), 1);
    const leido = await local.app.respaldos.estado(ctxAdmin, AHORA + 2000);
    assert.ok(leido.ok && leido.valor.pedido?.estado === "PEDIDO");
  });

  test("sin confirmar la identidad, o desde la caja, no se pide", async () => {
    const sin = await local.app.respaldos.pedirAhora(ctxAdminSinConfirmar, AHORA);
    assert.equal(!sin.ok && sin.motivo, "ELEVACION_REQUERIDA");
    const caja = await local.app.respaldos.pedirAhora(ctxCajera, AHORA);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
  });

  test("la web solo pide: el resultado lo escribe el servidor, y la base no deja uno hecho sin su respaldo", async () => {
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupRequest.updateMany({ data: { state: "HECHO" } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.backupRequest.deleteMany({})));
    await assert.rejects(
      local.base.conTenant(local.sistema.tenantId, (tx) =>
        tx.backupRequest.create({ data: { tenantId: local.sistema.tenantId, state: "HECHO", requestedByName: "Abigail Karam", startedAt: new Date(AHORA), finishedAt: new Date(AHORA) } }),
      ),
    );
  });
});
