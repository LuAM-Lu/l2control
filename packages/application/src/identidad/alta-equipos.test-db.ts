/**
 * El alta de equipos con buenas prácticas (M-7) contra l2control_test: código de emparejamiento,
 * aprobar desde el propio equipo con credenciales de administración, caducidad y renovación de la
 * solicitud, y tope de solicitudes por dirección.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LlaveDePrueba, abrirLocalDePrueba, crearPersona, darCredenciales, type CredencialesDePrueba, type LocalDePrueba } from "../para-pruebas.ts";
import { leerCredencial } from "./credenciales.ts";
import { SOLICITUDES_POR_HORA, SOLICITUD_EQUIPO_MS } from "./plazos.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
const credenciales: Record<string, CredencialesDePrueba> = {};
const CONTRASENA_ADMIN = "contraseña-de-la-dueña";
const CONTRASENA_SUPERVISOR = "contraseña-del-supervisor";

const llaveDe = (nombre: string) => credenciales[nombre]!.llave;

/** Un equipo que pide registro desde su pantalla, con una dirección propia para no tocar el tope. */
async function pedir(label: string, ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {
  const r = await local.app.dispositivos.solicitar(local.sistema, label, ip);
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor.credencial;
}
const idDe = (credencial: string) => leerCredencial(credencial)!.id;
/** Aprobar el equipo desde él mismo: pide el desafío y lo firma con esa llave, como haría la pantalla. */
async function aprobar(
  credencial: string,
  contrasena: string,
  llave: LlaveDePrueba,
  ahora = Date.now(),
): ReturnType<LocalDePrueba["app"]["elevacion"]["aprobarEquipo"]> {
  const d = await local.app.elevacion.desafioDeEquipo({ dispositivo: credencial, ahora });
  if (!d.ok) return d;
  return local.app.elevacion.aprobarEquipo({
    dispositivo: credencial,
    contrasena,
    factor: { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: llave.firmar(d.valor.opciones) },
    ip: "10.9.9.9",
    ahora,
  });
}
const aprobarConCodigo = (credencial: string, contrasena: string, codigo: string, ahora = Date.now()) =>
  local.app.elevacion.aprobarEquipo({ dispositivo: credencial, contrasena, factor: { tipo: "CODIGO", codigo }, ip: "10.9.9.9", ahora });

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Alta de equipos");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN" });
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR" });
  credenciales["Abigail Karam"] = await darCredenciales(local, admin, CONTRASENA_ADMIN);
  credenciales["Luis Guerrero"] = await darCredenciales(local, supervisor, CONTRASENA_SUPERVISOR);
});

after(() => local.cerrar());

describe("el código de emparejamiento", () => {
  test("el equipo y la lista de aprobación enseñan el mismo, y no cambia", async () => {
    const cred = await pedir("Tablet taquilla");
    const e = await local.app.dispositivos.identificar(cred);
    assert.equal(e.estado, "PENDIENTE");
    assert.match(e.codigo, /^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
    const otraVez = await local.app.dispositivos.identificar(cred);
    assert.ok(otraVez.estado === "PENDIENTE" && otraVez.codigo === e.codigo);
    const lista = await local.app.dispositivos.listar(local.sistema);
    assert.ok(lista.ok);
    const enLista = lista.valor.devices.find((d) => d.id === e.id);
    assert.equal(enLista?.pairingCode, e.codigo);
    assert.ok(enLista?.requestExpiresAt, "una solicitud pendiente dice hasta cuándo vale");
  });

  test("dos equipos con nombres parecidos no comparten código", async () => {
    const a = await local.app.dispositivos.identificar(await pedir("Caja 1"));
    const b = await local.app.dispositivos.identificar(await pedir("Caja 1 bis"));
    assert.ok(a.estado === "PENDIENTE" && b.estado === "PENDIENTE");
    assert.notEqual(a.codigo, b.codigo);
  });
});

describe("aprobar desde el propio equipo con credenciales de administración", () => {
  test("con la contraseña y la llave de la administración queda aprobado, a su nombre", async () => {
    const cred = await pedir("PC oficina");
    const r = await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Abigail Karam"));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.aprobadoPor, "Abigail Karam");
    assert.equal((await local.app.dispositivos.identificar(cred)).estado, "APROBADO");
    const lista = await local.app.dispositivos.listar(local.sistema);
    assert.ok(lista.ok);
    const cambio = lista.valor.devices.find((d) => d.id === idDe(cred))?.changes[0];
    assert.equal(cambio?.kind, "APROBADO");
    assert.equal(cambio?.byName, "Abigail Karam");
    assert.match(cambio?.reason ?? "", /propio equipo/);
  });

  test("un equipo ya aprobado no se vuelve a aprobar", async () => {
    const cred = await pedir("PC oficina 2");
    assert.ok((await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Abigail Karam"))).ok);
    const r = await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Abigail Karam"));
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });

  test("las credenciales buenas de quien no gestiona personas no aprueban", async () => {
    const cred = await pedir("Tablet supervisión");
    const r = await aprobar(cred, CONTRASENA_SUPERVISOR, llaveDe("Luis Guerrero"));
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    assert.equal((await local.app.dispositivos.identificar(cred)).estado, "PENDIENTE");
  });

  test("la firma hecha para otro equipo no sirve aunque la contraseña sea buena", async () => {
    const cred = await pedir("Tablet cocina");
    const otro = await pedir("Tablet de otro");
    const ahora = Date.now();
    const d = await local.app.elevacion.desafioDeEquipo({ dispositivo: otro, ahora });
    assert.ok(d.ok);
    const factor = { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: llaveDe("Abigail Karam").firmar(d.valor.opciones) };
    const r = await local.app.elevacion.aprobarEquipo({ dispositivo: cred, contrasena: CONTRASENA_ADMIN, factor, ip: null, ahora });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    // Y el desafío ya se gastó: tampoco vale para el equipo que lo pidió.
    const r2 = await local.app.elevacion.aprobarEquipo({ dispositivo: otro, contrasena: CONTRASENA_ADMIN, factor, ip: null, ahora });
    assert.equal(r2.ok ? "ok" : r2.motivo, "NO_PERMITIDO");
  });

  test("la llave dice de quién es: con la contraseña de otra persona no aprueba", async () => {
    const cred = await pedir("Tablet prestada");
    const r = await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Luis Guerrero"));
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    assert.equal((await local.app.dispositivos.identificar(cred)).estado, "PENDIENTE");
  });

  test("sin la llave a mano, un código de recuperación aprueba una vez y queda en la auditoría", async () => {
    const codigo = credenciales["Abigail Karam"]!.codigos[0]!;
    const cred = await pedir("PC de repuesto");
    // Se acepta como se copia de un papel: en minúsculas y sin guion.
    const r = await aprobarConCodigo(cred, CONTRASENA_ADMIN, codigo.toLowerCase().replace("-", " "));
    assert.ok(r.ok, JSON.stringify(r));
    const asientos = await local.app.auditoria.listar(local.sistema, { limite: 500 });
    assert.ok(asientos.some((a) => a.action === "usuario.codigo_recuperacion"));
    assert.ok(!JSON.stringify(asientos).includes(codigo), "el código no sale en la auditoría");
    const otra = await aprobarConCodigo(await pedir("PC de repuesto 2"), CONTRASENA_ADMIN, codigo);
    assert.equal(otra.ok ? "ok" : otra.motivo, "NO_PERMITIDO", "un código vale una sola vez");
  });

  test("una contraseña mal tecleada no gasta el código de recuperación", async () => {
    const codigo = credenciales["Luis Guerrero"]!.codigos[0]!;
    const cred = await pedir("PC con dedos torpes");
    assert.equal((await aprobarConCodigo(cred, "no-es-la-contraseña", codigo)).ok, false);
    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.recoveryCode.count({ where: { usedAt: null, retiredAt: null, user: { fullName: "Luis Guerrero" } } }));
    assert.equal(fila, 10);
  });

  test("tras 3 fallos el EQUIPO se bloquea: ni las credenciales buenas entran mientras dura", async () => {
    const cred = await pedir("Tablet sospechosa");
    for (let i = 0; i < 3; i++) {
      // Una llave que nadie registró: el fallo es del equipo, no de ninguna persona.
      const r = await aprobar(cred, `adivinanza-${i}-larga`, new LlaveDePrueba());
      assert.equal(r.ok, false);
    }
    const bloqueado = await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Abigail Karam"));
    assert.equal(bloqueado.ok, false);
    if (!bloqueado.ok) assert.equal(bloqueado.bloqueo?.bloqueado, true);
    assert.equal((await local.app.dispositivos.identificar(cred)).estado, "PENDIENTE");
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "device", entityId: idDe(cred) });
    assert.ok(asientos.filter((a) => a.action === "dispositivo.aprobar" && a.outcome === "NEGADO").length >= 4);
  });

  test("sin credencial de equipo, o con una inventada, no hay nada que aprobar", async () => {
    for (const d of [undefined, `${local.sistema.tenantId}.${randomUUID()}.${"x".repeat(43)}`]) {
      const r = await aprobar(d as string, CONTRASENA_ADMIN, llaveDe("Abigail Karam"));
      assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    }
  });
});

describe("la solicitud caduca a las 24 h y se renueva desde el equipo", () => {
  let cred: string;

  before(async () => {
    cred = await pedir("Tablet vieja");
    // Pidió su registro hace un día y un rato.
    await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.device.update({ where: { id: idDe(cred) }, data: { requestedAt: new Date(Date.now() - SOLICITUD_EQUIPO_MS - 60_000) } }),
    );
  });

  test("el equipo sabe que su solicitud caducó", async () => {
    const e = await local.app.dispositivos.identificar(cred);
    assert.ok(e.estado === "PENDIENTE" && e.caducada);
  });

  test("caducada no se aprueba: ni desde el panel ni desde el propio equipo", async () => {
    const panel = await local.app.dispositivos.ordenar(local.sistema, { kind: "APROBAR", deviceId: idDe(cred), reason: "Aprobación de prueba en el panel" });
    assert.equal(panel.ok ? "ok" : panel.motivo, "INVALIDO");
    const propio = await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Abigail Karam"));
    assert.equal(propio.ok ? "ok" : propio.motivo, "INVALIDO");
  });

  test("renovarla la deja otra vez aprobable, y queda en su historia", async () => {
    const r = await local.app.dispositivos.renovar(cred, "10.2.2.2");
    assert.ok(r.ok, JSON.stringify(r));
    const e = await local.app.dispositivos.identificar(cred);
    assert.ok(e.estado === "PENDIENTE" && !e.caducada);
    const lista = await local.app.dispositivos.listar(local.sistema);
    assert.ok(lista.ok);
    assert.equal(lista.valor.devices.find((d) => d.id === idDe(cred))?.changes[0]?.kind, "RENOVADO");
    assert.ok((await aprobar(cred, CONTRASENA_ADMIN, llaveDe("Abigail Karam"))).ok);
  });

  test("una solicitud vigente no se renueva: no es un botón para alargarla", async () => {
    const otra = await pedir("Tablet nueva");
    const r = await local.app.dispositivos.renovar(otra, "10.2.2.3");
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });
});

describe("el tope de solicitudes", () => {
  test(`una misma dirección pide como mucho ${SOLICITUDES_POR_HORA} registros por hora`, async () => {
    const ip = "10.77.77.77";
    // Las pruebas de arriba dejaron equipos esperando; aquí se mide el tope por dirección, no el de pendientes.
    await local.base.conTenant(local.sistema.tenantId, (tx) => tx.device.updateMany({ where: { status: "PENDIENTE" }, data: { status: "REVOCADO" } }));
    for (let i = 0; i < SOLICITUDES_POR_HORA; i++) await pedir(`Equipo en serie ${i}`, ip);
    const r = await local.app.dispositivos.solicitar(local.sistema, "Uno de más", ip);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    // Desde otra dirección se sigue pudiendo.
    assert.ok((await local.app.dispositivos.solicitar(local.sistema, "Uno de otra red", "10.78.0.1")).ok);
  });
});
