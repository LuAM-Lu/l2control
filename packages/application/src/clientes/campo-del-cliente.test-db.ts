/**
 * El campo del cliente, contra l2control_test — T-23 (M-38, W-12).
 *
 * Lo que fijan: con 3 letras de su nombre el directorio propone hasta las que se pidan (6 en el campo), cada una con
 * cuándo vino y cuántos niños; «aquí ahora» son las familias de la sala (con sus estancias, para llevar su tiempo a la
 * mesa), los clientes de las cuentas abiertas (su mesa, de pie) y el cumpleaños de hoy, sin repetir a nadie; la ficha
 * por su id dice lo que debe (la entrada lo avisa); la factura a una empresa recuerda su razón social y su dirección
 * fiscal (solo si cambiaron, solo agregar), una cédula no; permisos y aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import {
  abrirLocalDePrueba,
  clienteDePrueba,
  contextoDe,
  contextoElevado,
  crearEquipo,
  crearPersona,
  FACTURA_DE_PRUEBA,
  familiaDePrueba,
  impresoraDePrueba,
  planoDePrueba,
  sentarDePrueba,
  type LocalDePrueba,
} from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Domingo 11 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-11T17:00:00.000Z");
const HOY = "2026-10-11";
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string };

let l: LocalDePrueba;
let otro: LocalDePrueba;
let mesero: Contexto;
let cajera: Contexto;
let monitora: Contexto;
let otroMesero: Contexto;
let supervisor: string;
let tequenos: string;
let agua: string;

const sentarDePie = (nombre: string, ahora: number) =>
  l.app.mesas.abrir(mesero, { cuentaId: randomUUID(), cliente: clienteDePrueba(nombre), comensales: 1, vistas: 0 }, ahora);
const empresas = () => l.base.conTenant(l.sistema.tenantId, (tx) => tx.invoiceCompany.findMany({ orderBy: { setAt: "asc" } }));

/** Un agua en la cola ($ 1,00 + IVA = $ 1,16), cobrada justa en efectivo a nombre de `cliente`. */
async function cobrarUnAgua(cliente: unknown, ahora: number): Promise<void> {
  const c: FamilyAccountDto = valor(
    await l.app.cuentas.guardar(
      cajera,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mostrador",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(ahora).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: agua, taxCode: "GENERAL" }],
        },
      },
      ahora,
    ),
  );
  valor(
    await l.app.cuentas.cobrar(
      cajera,
      {
        idempotencyKey: randomUUID(),
        accountId: c.id,
        version: c.version,
        lineIds: c.lines.map((x) => x.id),
        total: usd("116"),
        pagos: [{ method: "EFECTIVO_USD", amount: usd("116") }],
        destinoSobra: "VUELTO",
        cliente,
      },
      ahora,
    ),
  );
}

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba campo del cliente");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba campo del cliente B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const admin = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  const ctxAdmin = await contextoElevado(l, await crearEquipo(l, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  const jesus = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "MESERO", pin: "3175" });
  otroMesero = await contextoDe(otro, await crearEquipo(otro, "Salón"), jesus, "3175");

  await planoDePrueba(l, 6);
  await impresoraDePrueba(l);
  valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 60 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 60 * MIN));
  }
  const crear = async (nombre: string, categoria: string, tipo: string, precioMinor: string, extra: Record<string, unknown> = {}) =>
    valor(await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre, categoria, taxCode: "GENERAL", tipo, precioMinor, ...extra } }, AHORA - 60 * MIN)).productos.find(
      (p) => p.nombre === nombre,
    )!.id;
  tequenos = await crear("Tequeños", "Carta", "PREPARADO", "450");
  agua = await crear("Agua mineral", "Bebidas", "PREPARADO", "100", { area: "SIN_PAPEL" });
  const alquiler = await crear("Alquiler del salón", "Cumpleaños", "SERVICIO", "10000");
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("1000"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  valor(
    await l.app.eventos.publicarCatalogo(
      ctxAdmin,
      {
        sobre: null,
        catalogo: {
          anticipoBps: 5000,
          paquetes: [{ id: "basico", name: "Básico", price: usd("15000"), minInvitados: 10, maxInvitados: 20, incluye: [{ productId: alquiler, quantity: 1 }], active: true }],
        },
      },
      AHORA - 60 * MIN,
    ),
  );
  valor(await l.app.turnos.abrir(cajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 60 * MIN));
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("escribir su nombre (T-23)", () => {
  test("«mar» propone a las María, hasta las 6 que pide el campo, con su cédula y cuándo vinieron", async () => {
    for (let i = 1; i <= 7; i++) valor(await sentarDePie(`Prueba María Campo ${i}`, AHORA - i * MIN));
    const seis = valor(await l.app.clientes.encontrar(cajera, { texto: "mar", limite: 6 }));
    assert.equal(seis.length, 6);
    for (const c of seis) {
      assert.match(c.nombre, /mar/i);
      assert.match(c.cedula ?? "", /^V-\d+$/);
      assert.ok(c.vinoEl, `${c.nombre} vino hoy`);
      assert.equal(c.ninos, 0);
    }
    assert.equal(valor(await l.app.clientes.encontrar(cajera, { texto: "maría campo" })).length, 7, "sin límite, hasta 12");
    assert.equal(rechazo(await l.app.clientes.encontrar(cajera, { texto: "mar", limite: 13 })).motivo, "INVALIDO");
    // Cuándo vino: la última vez que se sentó.
    const tres = valor(await l.app.clientes.encontrar(cajera, { texto: "María Campo 3" }))[0]!;
    assert.equal(tres.vinoEl, new Date(AHORA - 3 * MIN).toISOString());
  });

  test("una familia del parque dice cuántos niños tiene y cuándo entró", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA - 40 * MIN);
    const e = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.parkSession.findFirstOrThrow({ where: { accountId: familia.id }, include: { guardian: true } }));
    const [g] = valor(await l.app.clientes.encontrar(monitora, { texto: e.guardian.contactReference }));
    assert.equal(g?.clienteId, e.guardianId);
    assert.equal(g?.ninos, 1);
    assert.equal(g?.vinoEl, new Date(AHORA - 40 * MIN).toISOString());
  });
});

describe("quién está aquí (T-23)", () => {
  let familia: FamilyAccountDto;
  let rosa: FamilyAccountDto;

  before(async () => {
    familia = await familiaDePrueba(l, monitora, AHORA - 20 * MIN);
    rosa = await sentarDePrueba(l, mesero, "mesa-1", AHORA - 15 * MIN, { nombre: "Prueba Rosa Mesa" });
    valor(
      await l.app.eventos.reservar(
        cajera,
        {
          idempotencyKey: randomUUID(),
          fecha: HOY,
          inicio: 15 * 60,
          fin: 18 * 60,
          paqueteId: "basico",
          invitados: 12,
          cumpleanero: "Sofía",
          edad: 6,
          guardian: { fullName: "Prueba Carmen Rivas", contactReference: "0414-5550123" },
        },
        AHORA - 10 * MIN,
      ),
    );
  });

  test("las familias de la sala con sus niños, los clientes de las cuentas abiertas con su mesa y el cumpleaños de hoy", async () => {
    const { clientes } = valor(await l.app.clientes.deAqui(mesero, AHORA));
    const deLaSala = clientes.find((a) => a.motivo === "SALA" && a.estancias.length > 0 && familia.sessionIds.every((s) => a.estancias.includes(s)));
    assert.ok(deLaSala, JSON.stringify(clientes));
    assert.equal(deLaSala.detalle, "1 niño en la sala");
    const enLaMesa = clientes.find((a) => a.cliente.clienteId === rosa.cliente?.clienteId);
    assert.equal(enLaMesa?.motivo, "CUENTA");
    assert.equal(enLaMesa?.detalle, "Mesa 1");
    assert.ok(clientes.some((a) => a.motivo === "CUENTA" && a.detalle === "De pie" && a.cliente.nombre.startsWith("Prueba María Campo")));
    const cumple = clientes.find((a) => a.motivo === "CUMPLEANOS");
    assert.equal(cumple?.cliente.nombre, "Prueba Carmen Rivas");
    assert.equal(cumple?.detalle, "Cumpleaños de Sofía");
    const ids = clientes.map((a) => a.cliente.clienteId);
    assert.equal(new Set(ids).size, ids.length, "nadie se repite");
    assert.ok(clientes.length <= 24);
  });

  test("sentada con el tiempo de sus niños, la familia sale por su mesa: sus niños no se ofrecen otra vez", async () => {
    const e = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.parkSession.findFirstOrThrow({ where: { accountId: familia.id }, include: { guardian: true } }));
    const mesa = valor(
      await l.app.mesas.abrir(
        mesero,
        { cuentaId: randomUUID(), tableId: "mesa-3", cliente: { nombre: e.guardian.fullName, cedula: e.guardian.document!, telefono: e.guardian.contactReference }, comensales: 3, vistas: 0 },
        AHORA - 5 * MIN,
      ),
    );
    assert.equal(mesa.cliente?.clienteId, e.guardianId);
    valor(await l.app.mesas.vincular(mesero, { idempotencyKey: randomUUID(), tableId: "mesa-3", sessionIds: familia.sessionIds }, AHORA - 4 * MIN));
    const suyo = valor(await l.app.clientes.deAqui(mesero, AHORA)).clientes.filter((a) => a.cliente.clienteId === e.guardianId);
    assert.deepEqual(
      suyo.map((a) => [a.motivo, a.detalle, a.estancias]),
      [["CUENTA", "Mesa 3", []]],
    );
  });

  test("lo de otro día no está aquí: la estancia olvidada está a revisar y la cuenta abierta la cierra la caja", async () => {
    assert.deepEqual(valor(await l.app.clientes.deAqui(mesero, AHORA + 2 * 24 * 60 * MIN)).clientes, []);
  });

  test("lo ve quien atiende (también la monitora); otro local no ve a nadie de aquí", async () => {
    assert.ok(valor(await l.app.clientes.deAqui(monitora, AHORA)).clientes.length > 0);
    assert.ok(valor(await l.app.clientes.deAqui(cajera, AHORA)).clientes.length > 0);
    assert.deepEqual(valor(await otro.app.clientes.deAqui(otroMesero, AHORA)).clientes, []);
  });
});

describe("la ficha por su id (T-23)", () => {
  test("la entrada lee lo que debe una familia por su ficha, para avisarlo", async () => {
    await sentarDePrueba(l, mesero, "mesa-2", AHORA - 30 * MIN, { nombre: "Prueba Deudora Campo" });
    const mesa = valor(await l.app.pedidos.enviar(mesero, { pedidoId: randomUUID(), tableId: "mesa-2", lineas: [{ productId: tequenos, cantidad: 2, precioMinor: "450" }] }, AHORA - 20 * MIN)).cuenta;
    valor(await l.app.deudas.marcar(cajera, { idempotencyKey: randomUUID(), accountId: mesa.id, version: mesa.version }, { autorizadorId: supervisor, pin: "5937", motivo: "Se fue con el local lleno" }, AHORA));
    const ficha = valor(await l.app.clientes.buscar(monitora, { clienteId: mesa.cliente!.clienteId }));
    assert.equal(ficha?.nombre, "Prueba Deudora Campo");
    assert.deepEqual(
      ficha?.deudas.map((d) => d.monto.minor),
      ["1044"],
    );
    assert.equal(valor(await otro.app.clientes.buscar(otroMesero, { clienteId: mesa.cliente!.clienteId })), null);
  });
});

describe("la empresa de la factura (T-23)", () => {
  const empresa = { kind: "IDENTIFICADO" as const, document: "J-40999888-1", name: "Prueba Inversiones Campo, C.A.", fiscalAddress: "Av. Principal de Prueba, Caracas" };

  test("cobrar a un RIF de empresa la recuerda, y la próxima vez se propone con su dirección", async () => {
    assert.equal(valor(await l.app.empresas.empresa(cajera, { documento: "J-40999888-1" })), null);
    await cobrarUnAgua(empresa, AHORA);
    assert.deepEqual(valor(await l.app.empresas.empresa(cajera, { documento: "j 40999888 1" })), { nombre: empresa.name, direccion: empresa.fiscalAddress });
    // La misma otra vez no añade nada; con otra dirección, sí, y esa es la que se propone.
    await cobrarUnAgua(empresa, AHORA + MIN);
    assert.equal((await empresas()).length, 1);
    await cobrarUnAgua({ ...empresa, fiscalAddress: "Calle Nueva de Prueba, Valencia" }, AHORA + 2 * MIN);
    assert.equal((await empresas()).length, 2);
    assert.equal(valor(await l.app.empresas.empresa(cajera, { documento: "J-40999888-1" }))?.direccion, "Calle Nueva de Prueba, Valencia");
  });

  test("una cédula es de una persona: no se anota aquí ni se propone", async () => {
    await cobrarUnAgua(FACTURA_DE_PRUEBA, AHORA + 3 * MIN);
    assert.ok((await empresas()).every((e) => e.documentKey.startsWith("J")));
    assert.equal(valor(await l.app.empresas.empresa(cajera, { documento: FACTURA_DE_PRUEBA.document })), null);
  });

  test("la lee quien factura; otro local no la ve; lo anotado no se corrige ni se borra", async () => {
    assert.equal(rechazo(await l.app.empresas.empresa(mesero, { documento: "J-40999888-1" })).motivo, "NO_PERMITIDO");
    assert.equal(valor(await otro.app.empresas.empresa(otro.sistema, { documento: "J-40999888-1" })), null);
    const [fila] = await empresas();
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.invoiceCompany.update({ where: { id: fila!.id }, data: { name: "Otra" } })));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.invoiceCompany.delete({ where: { id: fila!.id } })));
  });
});
