/**
 * Clientes contra l2control_test — T-25 (M-40). Corre con `pnpm test:db`.
 *
 * El criterio: el cliente de una mesa y la familia del parque se encuentran en la misma lista y se corrigen en un solo
 * lugar. Y sus niños se agregan, corrigen y retiran; la misma persona que quedó dos veces se junta.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import {
  abrirLocalDePrueba,
  cedulaDePrueba,
  contextoDe,
  crearEquipo,
  crearPersona,
  familiaDePrueba,
  planoDePrueba,
  sentarDePrueba,
  type LocalDePrueba,
} from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-20T18:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxCajera: Contexto;
let ctxSupervisora: Contexto;
let ctxMesero: Contexto;

const valor = <T>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  if (!r.ok) throw new Error(r.mensaje);
  return r.valor;
};

/** Un representante como lo dejaría la entrada o el salón: su nombre, su teléfono y, si se da, su cédula. */
async function representante(nombre: string, telefono: string, cedula: string | null = null): Promise<string> {
  const g = await local.base.conTenant(local.sistema.tenantId, (tx) =>
    tx.guardian.create({
      data: {
        tenantId: local.sistema.tenantId,
        fullName: nombre,
        contactReference: telefono,
        contactKey: telefono.replace(/\D/g, ""),
        ...(cedula ? { document: cedula, documentKey: cedula.replace(/\W/g, "").toUpperCase() } : {}),
        createdAt: new Date(AHORA - 60 * MIN),
      },
    }),
  );
  return g.id;
}

async function nino(guardianId: string, nombre: string): Promise<string> {
  const k = await local.base.conTenant(local.sistema.tenantId, (tx) =>
    tx.kid.create({ data: { tenantId: local.sistema.tenantId, guardianId, name: nombre, createdAt: new Date(AHORA - 60 * MIN) } }),
  );
  return k.id;
}

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Clientes");
  await planoDePrueba(local, 4);
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const supervisora = await crearPersona(local, { nombre: "Luisa Guerrero", role: "SUPERVISOR", pin: "5937" });
  const mesero = await crearPersona(local, { nombre: "Emily Rojas", role: "MESERO", pin: "2468" });
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxSupervisora = await contextoDe(local, await crearEquipo(local, "Oficina"), supervisora, "5937");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Tablet", true, false), mesero, "2468");
});

after(async () => {
  await local.cerrar();
});

describe("Clientes (T-25)", () => {
  test("lo ven la caja y supervisión; el mesero no (completa los datos al sentar)", async () => {
    assert.ok((await local.app.directorio.pagina(ctxCajera, {})).ok);
    assert.ok((await local.app.directorio.pagina(ctxSupervisora, {})).ok);
    const mesero = await local.app.directorio.pagina(ctxMesero, {});
    assert.equal(!mesero.ok && mesero.motivo, "NO_PERMITIDO");
  });

  test("el cliente de una mesa y la familia del parque, en la misma lista y corregidos en un solo lugar", async () => {
    const familia = await familiaDePrueba(local, ctxCajera, AHORA);
    const deLaFamilia = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.parkSession.findFirstOrThrow({ where: { accountId: familia.id }, select: { guardianId: true } }));
    const telefono = "0414-5551425";
    const mesa = await sentarDePrueba(local, ctxMesero, "mesa-1", AHORA + MIN, { cliente: { nombre: "Prueba T25 Mesa", cedula: cedulaDePrueba(telefono), telefono } });
    const deLaMesa = mesa.cliente!.clienteId!;

    const todos = valor(await local.app.directorio.pagina(ctxCajera, { filtro: "TODOS" }));
    const ids = todos.clientes.map((c) => c.id);
    assert.ok(ids.includes(deLaFamilia.guardianId) && ids.includes(deLaMesa), "los dos en la misma lista");
    assert.equal(todos.clientes[0]!.id, deLaMesa, "el más reciente primero");
    assert.equal(todos.clientes[0]!.ultimaVez?.donde, "MESA");
    const familias = valor(await local.app.directorio.pagina(ctxCajera, { filtro: "FAMILIAS" })).clientes.map((c) => c.id);
    assert.ok(familias.includes(deLaFamilia.guardianId) && !familias.includes(deLaMesa));
    const deMesa = valor(await local.app.directorio.pagina(ctxCajera, { filtro: "DE_MESA" })).clientes.map((c) => c.id);
    assert.ok(deMesa.includes(deLaMesa) && !deMesa.includes(deLaFamilia.guardianId));
    // Lo buscado: por el nombre o por las cifras del teléfono.
    assert.deepEqual(valor(await local.app.directorio.pagina(ctxCajera, { texto: "t25 mesa" })).clientes.map((c) => c.id), [deLaMesa]);
    assert.deepEqual(valor(await local.app.directorio.pagina(ctxCajera, { texto: "5551425" })).clientes.map((c) => c.id), [deLaMesa]);

    const ficha = valor(await local.app.directorio.ficha(ctxCajera, deLaMesa));
    assert.equal(ficha.historia[0]?.que, "MESA");
    assert.equal(ficha.visitas, 1);
    const fichaFamilia = valor(await local.app.directorio.ficha(ctxCajera, deLaFamilia.guardianId));
    assert.equal(fichaFamilia.historia[0]?.que, "PARQUE");

    // Se corrige aquí, y la mesa lo ve igual: es el mismo directorio.
    const corregida = valor(await local.app.directorio.corregir(ctxCajera, { clienteId: deLaMesa, nombre: "Prueba T25 Mesa Corregida", cedula: ficha.cedula, telefono }));
    assert.equal(corregida.nombre, "Prueba T25 Mesa Corregida");
    const encontrado = valor(await local.app.clientes.buscar(ctxCajera, { telefono }));
    assert.equal(encontrado?.nombre, "Prueba T25 Mesa Corregida");
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "cliente.corregir", entityId: deLaMesa } }));
    assert.deepEqual((asiento?.after as { cambio: string[] }).cambio, ["NOMBRE"]);

    // La cédula no se quita; y la de otro, tampoco se pone: si es la misma persona, se juntan.
    const sinCedula = await local.app.directorio.corregir(ctxCajera, { clienteId: deLaMesa, nombre: "Prueba T25 Mesa Corregida", cedula: "", telefono });
    assert.equal(!sinCedula.ok && sinCedula.problemas?.[0]?.message, "CEDULA_NO_SE_QUITA");
    const ajena = await local.app.directorio.corregir(ctxCajera, { clienteId: deLaMesa, nombre: "Prueba T25 Mesa Corregida", cedula: fichaFamilia.cedula, telefono });
    assert.equal(!ajena.ok && ajena.problemas?.[0]?.message, "CEDULA_DE_OTRO");
  });

  test("sus niños: agregar, corregir y retirar; el retirado no se ofrece en la entrada, y el que está en la sala no se retira", async () => {
    const telefono = "0412-5550101";
    const g = await representante("Prueba T25 Familia", telefono, "V-30555101");
    const ficha = valor(await local.app.directorio.nino(ctxCajera, { kind: "AGREGAR", clienteId: g, nombre: "Prueba Sofía" }));
    const sofia = ficha.ninos.find((n) => n.nombre === "Prueba Sofía")!;
    const otra = await local.app.directorio.nino(ctxCajera, { kind: "AGREGAR", clienteId: g, nombre: "prueba sofia" });
    assert.equal(!otra.ok && otra.problemas?.[0]?.message, "YA_ESTA");
    const corregida = valor(await local.app.directorio.nino(ctxCajera, { kind: "CORREGIR", clienteId: g, ninoId: sofia.id, nombre: "Prueba Sofía", apodo: "Sofi" }));
    assert.equal(corregida.ninos.find((n) => n.id === sofia.id)?.apodo, "Sofi");
    const retirada = valor(await local.app.directorio.nino(ctxCajera, { kind: "RETIRAR", clienteId: g, ninoId: sofia.id }));
    assert.equal(retirada.ninos.find((n) => n.id === sofia.id)?.retirado?.por, "Marisol Prieto");
    const enLaEntrada = valor(await local.app.representantes.buscar(ctxCajera, { contacto: telefono }));
    assert.deepEqual(enLaEntrada?.kids, [], "la entrada no lo ofrece");

    // Con un niño en la sala: su salida lo nombra.
    await familiaDePrueba(local, ctxCajera, AHORA);
    const r = await local.app.parque.entrar(
      ctxCajera,
      { idempotencyKey: randomUUID(), paymentMode: "CUENTA_ABIERTA", entries: [{ wristbandCode: "PRUEBA-T25-1", kid: { name: "Prueba Mateo" }, packageId: "pkg-60" }], guardianId: g },
      AHORA + 2 * MIN,
    );
    assert.ok(r.ok, JSON.stringify(r));
    const mateo = valor(await local.app.directorio.ficha(ctxCajera, g)).ninos.find((n) => n.nombre === "Prueba Mateo")!;
    const enSala = await local.app.directorio.nino(ctxCajera, { kind: "RETIRAR", clienteId: g, ninoId: mateo.id });
    assert.match(!enSala.ok ? enSala.mensaje : "", /está en la sala/);
  });

  test("juntar a la misma persona: niños, cédula, historia y búsqueda pasan a la que queda; es de supervisión", async () => {
    const queda = await representante("Prueba T25 Repetida", "0424-5550202");
    const seVa = await representante("Prueba T25 Repetida", "0424-5550303", "V-30555303");
    await nino(queda, "Prueba Ana");
    await nino(seVa, "Prueba Luis");
    const ficha = valor(await local.app.directorio.ficha(ctxCajera, queda));
    assert.deepEqual(ficha.parecidos.map((p) => p.id), [seVa], "se parecen: el mismo nombre");

    const caja = await local.app.directorio.juntar(ctxCajera, { quedaId: queda, seVaId: seVa });
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
    const junta = valor(await local.app.directorio.juntar(ctxSupervisora, { quedaId: queda, seVaId: seVa }, AHORA));
    assert.deepEqual(junta.ninos.map((n) => n.nombre).sort(), ["Prueba Ana", "Prueba Luis"]);
    assert.equal(junta.cedula, "V-30555303", "la cédula pasa a la que queda");
    assert.deepEqual(junta.juntados.map((j) => j.por), ["Luisa Guerrero"]);
    assert.deepEqual(junta.parecidos, []);

    // La que se fue no sale en la lista; buscarla por su teléfono o su ficha lleva a la que queda.
    const lista = valor(await local.app.directorio.pagina(ctxCajera, { texto: "t25 repetida" })).clientes.map((c) => c.id);
    assert.deepEqual(lista, [queda]);
    assert.equal(valor(await local.app.clientes.buscar(ctxCajera, { telefono: "0424-5550303" }))?.clienteId, queda);
    assert.equal(valor(await local.app.directorio.ficha(ctxCajera, seVa)).id, queda);
    // Ya no se junta otra vez ni se corrige: está en la otra.
    const otraVez = await local.app.directorio.juntar(ctxSupervisora, { quedaId: queda, seVaId: seVa });
    assert.match(!otraVez.ok ? otraVez.mensaje : "", /se juntó con Prueba T25 Repetida/);

    // Con dos cédulas distintas no son la misma persona.
    const a = await representante("Prueba T25 Otra", "0414-5550404", "V-30555404");
    const b = await representante("Prueba T25 Otra", "0414-5550505", "V-30555505");
    const distintas = await local.app.directorio.juntar(ctxSupervisora, { quedaId: a, seVaId: b });
    assert.match(!distintas.ok ? distintas.mensaje : "", /cédulas distintas/);
    // El registro de juntar es de solo agregar.
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.guardianMerge.deleteMany({})));
  });
});
