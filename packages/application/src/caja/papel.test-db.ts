/**
 * La carga de lo anotado en papel en el servidor, contra l2control_test — B3-7, V-12, ADR-027, JORNADA §4 y §7.
 *
 * La línea de tiempo es la de un corte: entre las 8:00 y las 9:30 am (12:00 a 13:30 UTC) no hubo sistema y se
 * anotó en formularios; el turno se abre a las 10:00 am (14:00 UTC) y a las 10:10 la cajera carga. Todo lo de
 * la preparación (tasa, impuestos, precios) es de antes del corte, como en el local. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CargaDePapelDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const HOY = "2026-09-27";
const MIN = 60_000;
/** Preparación del local: la tasa, los impuestos y los precios son de antes del corte. */
const T_PREP = Date.parse("2026-09-27T04:30:00.000Z");
/** La tasa del día se trae a las 4:00 am en Caracas (8:00 UTC): antes de eso, nadie la conoce. */
const T_TASA = Date.parse("2026-09-27T08:00:00.000Z");
/** El turno se abre cuando el sistema vuelve (10:00 am en Caracas). */
const T_TURNO = Date.parse("2026-09-27T14:00:00.000Z");
/** Y la cajera carga diez minutos después. */
const T_CARGA = T_TURNO + 10 * MIN;
const CORTE = { desde: "2026-09-27T12:00:00.000Z", hasta: "2026-09-27T13:30:00.000Z" };
const a = (hhmm: string) => `2026-09-27T${hhmm}:00.000Z`;

const PIN = { admin: "4826", supervisor: "5937", supervisor2: "1953", cajera: "7391", cajera2: "2846", monitora: "6284" } as const;
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const ves = (minor: string) => ({ minor, currency: "VES" as const });
const FONDO = { fondos: [{ currency: "USD", amount: usd("2000") }, { currency: "VES", amount: ves("150000") }] };

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = <T,>(r: { ok: true; valor: T } | { ok: false; motivo: string; mensaje: string; problemas?: readonly { message: string }[] }) => {
  assert.equal(r.ok, false, "se esperaba un rechazo");
  return r as { ok: false; motivo: string; mensaje: string; problemas?: readonly { message: string }[] };
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let tasa: string;
let agua: string;
let refresco: string;
let cajera: string;
let supervisor: string;
let supervisor2: string;
let ctxSupervisor: Contexto;
let ctxSupervisor2: Contexto;
let ctxMonitora: Contexto;
let ctxAdmin: Contexto;

/** Una caja nueva con su turno abierto a las 10:00 am. */
async function caja(nombre: string, persona = cajera, pin: string = PIN.cajera) {
  const ctx = await contextoDe(l, await crearEquipo(l, nombre), persona, pin);
  const turno = valor(await l.app.turnos.abrir(ctx, FONDO, undefined, T_TURNO));
  return { ctx, turno };
}

/** Abre una carga con la ventana del corte y la devuelve. */
const abrirCarga = async (ctx: Contexto, extra: Record<string, unknown> = {}) =>
  valor(await l.app.papel.abrir(ctx, { idempotencyKey: randomUUID(), ...CORTE, nota: "Se fue la luz", ...extra }, T_CARGA));

const papel = (c: CargaDePapelDto, ocurrioEn: string) => ({ cargaId: c.id, ocurrioEn });
const pinDe = (autorizadorId: string, pin: string, motivo = "Revisé contra el papel") => ({ autorizadorId, pin, motivo });

let pulsera = 0;
/** La entrada de una familia, con un niño en el paquete de 1 hora, como la anotó el formulario. */
const entrada = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  paymentMode: "PREPAGO",
  entries: [{ wristbandCode: `PAP-${++pulsera}`, kid: { name: "Valentina" }, packageId: "pkg-60" }],
  guardian: { fullName: "Familia Rojas", contactReference: `0412-${String(5_550_000 + pulsera)}` },
  ...extra,
});
const entrar = (ctx: Contexto, c: CargaDePapelDto, ocurrioEn: string, cmd = entrada()) => l.app.papel.entrar(ctx, cmd, papel(c, ocurrioEn), T_CARGA);

/** El cobro en efectivo en dólares de una cuenta por cobrar: $ 10,00 de paquete + 16 % de IVA + 3 % de IGTF. */
const cobroEnEfectivo = (cuenta: { id: string; version?: number | undefined; lines: { id: string }[] }, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  accountId: cuenta.id,
  version: cuenta.version,
  lineIds: cuenta.lines.map((x) => x.id),
  total: usd("1196"),
  pagos: [{ method: "EFECTIVO_USD", amount: usd("1200") }],
  destinoSobra: "VUELTO",
  ...extra,
});

const asientosDe = (action: string) => l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action }, orderBy: { occurredAt: "asc" } }));

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Papel");
  otro = await abrirLocalDePrueba(URL_APP, "Papel de otro");
  await impresoraDePrueba(l);
  const admin = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: PIN.admin });
  supervisor = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: PIN.supervisor });
  supervisor2 = await crearPersona(l, { nombre: "Rosa Mata", role: "SUPERVISOR", pin: PIN.supervisor2 });
  cajera = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: PIN.cajera });
  const monitora = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: PIN.monitora });
  ctxAdmin = await contextoDe(l, await crearEquipo(l, "Oficina"), admin, PIN.admin);
  ctxSupervisor = await contextoDe(l, await crearEquipo(l, "Supervisión"), supervisor, PIN.supervisor);
  ctxSupervisor2 = await contextoDe(l, await crearEquipo(l, "Supervisión 2"), supervisor2, PIN.supervisor2);
  ctxMonitora = await contextoDe(l, await crearEquipo(l, "Entrada"), monitora, PIN.monitora);

  tasa = valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, T_TASA)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 300, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, T_PREP));
  }
  const catalogo = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100" } }, T_PREP),
  );
  agua = catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id;
  // Un refresco que sí lleva existencia (ADR-023), con veinte unidades de partida: lo vendido en papel baja del estante.
  const conRefresco = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Refresco", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "200" } }, T_PREP),
  );
  refresco = conRefresco.productos.find((p) => p.nombre === "Refresco")!.id;
  valor(
    await l.app.entradas.registrar(l.sistema, { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: refresco, bultos: 20, unidadesPorBulto: 1, costo: { por: "BULTO", minor: "50" } }] }, T_PREP),
  );
  // Un aforo de 2: lo anotado en papel ya ocurrió y no se le cuenta; lo vivo, sí.
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("1000"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 2 },
    }),
  );
});

after(async () => {
  await Promise.all([l.cerrar(), otro.cerrar()]);
});

describe("abrir la carga con la ventana del corte", () => {
  test("se abre en el turno del equipo, con quién y cuándo; sale en la auditoría", async () => {
    const { ctx, turno } = await caja("Caja que abre");
    const c = await abrirCarga(ctx);
    assert.equal(c.estado, "ABIERTA");
    assert.equal(c.turnoId, turno.id);
    assert.equal(c.punto, "Caja que abre");
    assert.equal(c.abiertaPor, "Marisol Prieto");
    assert.equal(c.abiertaEn, new Date(T_CARGA).toISOString());
    assert.equal(c.desde, CORTE.desde);
    assert.equal(c.hasta, CORTE.hasta);
    assert.equal(c.nota, "Se fue la luz");
    assert.deepEqual(c.registros, []);
    const [asiento] = (await asientosDe("papel.abrir")).filter((x) => x.entityId === c.id);
    assert.equal(asiento?.reason, "Se fue la luz");
    assert.deepEqual(asiento?.after, { turno: turno.id, punto: "Caja que abre", desde: CORTE.desde, hasta: CORTE.hasta });
  });

  test("sin turno abierto no se carga, y la monitora no abre cargas", async () => {
    const ctx = await contextoDe(l, await crearEquipo(l, "Caja sin turno"), cajera, PIN.cajera);
    const sin = rechazo(await l.app.papel.abrir(ctx, { idempotencyKey: randomUUID(), ...CORTE }, T_CARGA));
    assert.equal(sin.motivo, "NO_DISPONIBLE");
    const mon = rechazo(await l.app.papel.abrir(ctxMonitora, { idempotencyKey: randomUUID(), ...CORTE }, T_CARGA));
    assert.equal(mon.motivo, "NO_PERMITIDO");
  });

  test("la ventana: al revés, en el futuro, de más de un día o de antes del turno, no", async () => {
    const { ctx } = await caja("Caja de ventanas");
    const intento = async (desde: string, hasta: string) => rechazo(await l.app.papel.abrir(ctx, { idempotencyKey: randomUUID(), desde, hasta }, T_CARGA));
    assert.equal((await intento(a("13:00"), a("12:00"))).motivo, "INVALIDO");
    const futuro = await intento(a("13:00"), a("14:11"));
    assert.equal(futuro.motivo, "INVALIDO");
    assert.equal(futuro.problemas?.[0]?.message, "EN_EL_FUTURO");
    const larga = await intento("2026-09-26T12:00:00.000Z", a("13:00"));
    assert.equal(larga.problemas?.[0]?.message, "DEMASIADO_LARGA");
    // Un corte de 20 horas que acabó a media mañana, pero empezó antes del día anterior al turno.
    const antes = await intento("2026-09-25T20:00:00.000Z", "2026-09-26T13:00:00.000Z");
    assert.equal(antes.problemas?.[0]?.message, "ANTES_DEL_TURNO");
    // Y las ventanas buenas pasan, aunque empiecen antes de abrirse el turno: sin sistema no se pudo abrir.
    valor(await l.app.papel.abrir(ctx, { idempotencyKey: randomUUID(), ...CORTE }, T_CARGA));
  });

  test("un turno, una carga abierta; un doble clic devuelve la misma", async () => {
    const { ctx } = await caja("Caja de una sola carga");
    const llave = randomUUID();
    const c = valor(await l.app.papel.abrir(ctx, { idempotencyKey: llave, ...CORTE }, T_CARGA));
    assert.deepEqual(valor(await l.app.papel.abrir(ctx, { idempotencyKey: llave, ...CORTE }, T_CARGA + 5000)), c);
    const otra = rechazo(await l.app.papel.abrir(ctx, { idempotencyKey: randomUUID(), ...CORTE }, T_CARGA));
    assert.equal(otra.motivo, "CONFLICTO");
    // La clave de una carga ajena no sirve a quien no la abrió.
    const ajena = rechazo(await l.app.papel.abrir(ctxSupervisor, { idempotencyKey: llave, ...CORTE }, T_CARGA));
    assert.notEqual(ajena.motivo, undefined);
  });

  test("el navegador no dice el turno, la persona ni cuándo se abrió (ADR-017)", async () => {
    const { ctx, turno } = await caja("Caja que no manda");
    for (const extra of [{ turnoId: turno.id }, { abiertaPor: "Otra persona" }, { abiertaEn: a("13:59") }, { estado: "REVISADA" }]) {
      const r = rechazo(await l.app.papel.abrir(ctx, { idempotencyKey: randomUUID(), ...CORTE, ...extra }, T_CARGA));
      assert.equal(r.motivo, "INVALIDO", JSON.stringify(extra));
    }
  });
});

describe("una entrada anotada en el papel", () => {
  test("la estancia nace con la hora real; se guarda cuándo se cargó; y no se cuenta el aforo", async () => {
    const { ctx } = await caja("Caja de entradas");
    const c = await abrirCarga(ctx);

    // Tres familias anotadas, con un aforo de 2: lo anotado ya ocurrió.
    const hechas = [];
    for (const hora of ["12:20", "12:25", "12:30"]) hechas.push(valor(await entrar(ctx, c, a(hora))));
    const primera = hechas[0]!;
    assert.equal(primera.sessions[0]!.startedAt, a("12:20"));
    assert.equal(primera.account.openedAt, a("12:20"));
    assert.equal(primera.account.status, "POR_COBRAR");
    assert.equal(primera.account.pendingSince, a("12:20"));

    const relee = valor(await l.app.papel.leer(ctx, T_CARGA)).cargas.find((x) => x.id === c.id)!;
    assert.equal(relee.registros.length, 3);
    const r = relee.registros[0]!;
    assert.equal(r.tipo, "ENTRADA");
    assert.equal(r.ocurrioEn, a("12:20"));
    assert.equal(r.cargadoEn, new Date(T_CARGA).toISOString());
    assert.equal(r.cargadoPor, "Marisol Prieto");
    assert.equal(r.familia, "Familia Rojas");
    assert.equal(r.orden, primera.account.orderNumber);
    assert.ok(r.tipo === "ENTRADA" && r.modo === "PREPAGO" && r.ninos[0]!.nombre === "Valentina" && r.total.minor === "1000");

    // En vivo, con la sala llena de lo anotado, sí hay aforo.
    const viva = rechazo(await l.app.parque.entrar(ctx, entrada(), T_CARGA));
    assert.equal(viva.motivo, "CONFLICTO");
    assert.match(viva.mensaje, /Aforo/);
  });

  test("la entrada queda en la auditoría con la hora real y cuándo se cargó", async () => {
    const { ctx } = await caja("Caja que audita");
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:40")));
    const [asiento] = (await asientosDe("parque.entrada")).filter((x) => x.entityId === e.account.id);
    assert.deepEqual((asiento!.after as { desdePapel: unknown }).desdePapel, { cargaId: c.id, ocurrioEn: a("12:40"), cargadoEn: new Date(T_CARGA).toISOString() });
  });

  test("la hora tiene que caer dentro del corte y no ser posterior a la carga", async () => {
    const { ctx } = await caja("Caja de horas");
    const c = await abrirCarga(ctx);
    const antes = rechazo(await entrar(ctx, c, a("11:59")));
    assert.equal(antes.motivo, "INVALIDO");
    assert.equal(antes.problemas?.[0]?.message, "ANTES_DE_LA_VENTANA");
    const despues = rechazo(await entrar(ctx, c, a("13:31")));
    assert.equal(despues.problemas?.[0]?.message, "DESPUES_DE_LA_VENTANA");
    // Los dos extremos valen.
    valor(await entrar(ctx, c, a("12:00")));
    valor(await entrar(ctx, c, a("13:30")));
    // Una hora del futuro no vale ni dentro de una ventana que la cubra: se carga después de que pasó.
    const { ctx: ctx2 } = await caja("Caja de horas 2");
    const c2 = await abrirCarga(ctx2);
    const futuro = rechazo(await l.app.papel.entrar(ctx2, entrada(), papel(c2, a("13:00")), Date.parse(a("12:30"))));
    assert.equal(futuro.problemas?.[0]?.message, "EN_EL_FUTURO");
    // Nada de lo rechazado dejó rastro.
    assert.equal(valor(await l.app.papel.leer(ctx2, T_CARGA)).cargas.find((x) => x.id === c2.id)!.registros.length, 0);
  });

  test("sin carga, con una cerrada o con la de otro turno, no se carga", async () => {
    const { ctx } = await caja("Caja con su carga");
    const { ctx: ctxOtra } = await caja("Caja de al lado", cajera, PIN.cajera);
    const c = await abrirCarga(ctx);
    const inventada = rechazo(await l.app.papel.entrar(ctx, entrada(), { cargaId: randomUUID(), ocurrioEn: a("12:20") }, T_CARGA));
    assert.equal(inventada.motivo, "NO_DISPONIBLE");
    const deOtro = rechazo(await entrar(ctxOtra, c, a("12:20")));
    assert.equal(deOtro.motivo, "CONFLICTO");
    valor(await entrar(ctx, c, a("12:20")));
    valor(await l.app.papel.terminar(ctx, { cargaId: c.id }, T_CARGA + MIN));
    const cerrada = rechazo(await entrar(ctx, c, a("12:21")));
    assert.equal(cerrada.motivo, "CONFLICTO");
    assert.match(cerrada.mensaje, /ya está/);
  });

  test("las demás reglas siguen: una pulsera en sala no se repite", async () => {
    const { ctx } = await caja("Caja de pulseras");
    const c = await abrirCarga(ctx);
    const cmd = entrada();
    valor(await entrar(ctx, c, a("12:20"), cmd));
    const repetida = rechazo(await entrar(ctx, c, a("12:25"), entrada({ entries: cmd.entries })));
    assert.equal(repetida.problemas?.[0]?.message, "PULSERA_ACTIVA");
  });

  test("la monitora no carga: el papel lo carga la caja", async () => {
    const { ctx } = await caja("Caja de la que la monitora no es");
    const c = await abrirCarga(ctx);
    const r = rechazo(await entrar(ctxMonitora, c, a("12:20")));
    // Puede registrar entradas, pero la carga es de otro turno y de otro equipo.
    assert.equal(r.motivo, "CONFLICTO");
  });

  test("un reintento con la misma clave devuelve lo mismo y no repite el registro", async () => {
    const { ctx } = await caja("Caja de reintentos");
    const c = await abrirCarga(ctx);
    const cmd = entrada();
    const una = valor(await entrar(ctx, c, a("12:20"), cmd));
    const dos = valor(await entrar(ctx, c, a("12:20"), cmd));
    assert.equal(dos.account.id, una.account.id);
    assert.equal(valor(await l.app.papel.leer(ctx, T_CARGA)).cargas.find((x) => x.id === c.id)!.registros.length, 1);
  });

  test("el navegador solo declara la carga y la hora (ADR-017)", async () => {
    const { ctx } = await caja("Caja que declara");
    const c = await abrirCarga(ctx);
    for (const mala of [{ ...papel(c, a("12:20")), turnoId: randomUUID() }, { cargaId: c.id }, { ...papel(c, "12:20") }, { ...papel(c, a("12:20")), cargadoEn: a("12:19") }]) {
      const r = rechazo(await l.app.papel.entrar(ctx, entrada(), mala, T_CARGA));
      assert.equal(r.motivo, "INVALIDO", JSON.stringify(mala));
    }
  });
});

describe("una salida anotada en el papel", () => {
  test("se liquida con las horas del formulario: a tiempo no hay tiempo de más; pasada, sí", async () => {
    const { ctx } = await caja("Caja de salidas");
    const c = await abrirCarga(ctx);
    const aTiempo = valor(await entrar(ctx, c, a("12:00")));
    const tarde = valor(await entrar(ctx, c, a("12:00")));

    const salidaA = valor(
      await l.app.papel.salir(ctx, { idempotencyKey: randomUUID(), sessionIds: [aTiempo.sessions[0]!.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, papel(c, a("12:50")), T_CARGA),
    );
    assert.equal(salidaA.lines[0]!.endedAt, a("12:50"));
    assert.equal(salidaA.lines[0]!.consumedMinutes, 50);
    assert.equal(salidaA.lines[0]!.overdue.minor, "0");

    // 12:00 a 13:20 son 80 minutos: pasa de la hora y de la gracia, y cobra bloques de 15 min.
    const salidaB = valor(
      await l.app.papel.salir(ctx, { idempotencyKey: randomUUID(), sessionIds: [tarde.sessions[0]!.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, papel(c, a("13:20")), T_CARGA),
    );
    assert.equal(salidaB.lines[0]!.consumedMinutes, 80);
    assert.notEqual(salidaB.lines[0]!.overdue.minor, "0");

    const relee = valor(await l.app.papel.leer(ctx, T_CARGA)).cargas.find((x) => x.id === c.id)!;
    assert.deepEqual(relee.registros.map((r) => [r.tipo, r.ocurrioEn]), [["ENTRADA", a("12:00")], ["ENTRADA", a("12:00")], ["SALIDA", a("12:50")], ["SALIDA", a("13:20")]]);
    const salida = relee.registros.find((r) => r.tipo === "SALIDA" && r.ocurrioEn === a("13:20"));
    assert.ok(salida?.tipo === "SALIDA" && salida.excedente.minor === salidaB.lines[0]!.overdue.minor);
  });

  test("una salida fuera del corte no se carga", async () => {
    const { ctx } = await caja("Caja de salidas fuera");
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:00")));
    const r = rechazo(
      await l.app.papel.salir(ctx, { idempotencyKey: randomUUID(), sessionIds: [e.sessions[0]!.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, papel(c, a("13:45")), T_CARGA),
    );
    assert.equal(r.problemas?.[0]?.message, "DESPUES_DE_LA_VENTANA");
    // La estancia sigue en sala: nada se cerró.
    const sala = valor(await l.app.parque.sala(ctx, T_CARGA));
    assert.ok(sala.sessions.some((s) => s.id === e.sessions[0]!.id));
  });
});

describe("un cobro anotado en el papel", () => {
  test("el libro, la venta y la cuenta llevan la hora real; la venta dice que viene del papel", async () => {
    const { ctx, turno } = await caja("Caja de cobros");
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:20")));
    const cobro = cobroEnEfectivo(e.account);
    const r = valor(await l.app.papel.cobrar(ctx, cobro, papel(c, a("12:25")), T_CARGA));

    // El niño sigue en sala: la cuenta se cierra con su salida, pero lo cobrado ya está pagado.
    assert.ok(r.cuenta.lines.every((x) => x.paid));
    assert.equal(r.venta.closedAt, a("12:25"));
    assert.deepEqual(r.venta.desdePapel, { cargaId: c.id, ocurrioEn: a("12:25"), cargadoEn: new Date(T_CARGA).toISOString() });
    assert.equal(r.venta.total.minor, "1196");
    // Cae en el turno donde se carga, con su día de negocio.
    assert.equal(r.venta.businessDate, turno.businessDate);
    // El asiento del libro también dice cuándo ocurrió.
    const asientos = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.payment.findMany({ where: { operationKey: cobro.idempotencyKey } }));
    assert.ok(asientos.length >= 1);
    for (const p of asientos) assert.equal(p.recordedAt.toISOString(), a("12:25"));
    assert.equal(asientos[0]!.shiftId, turno.id);

    const relee = valor(await l.app.papel.leer(ctx, T_CARGA)).cargas.find((x) => x.id === c.id)!;
    const reg = relee.registros.find((x) => x.tipo === "COBRO")!;
    assert.ok(reg.tipo === "COBRO" && reg.total.minor === "1196" && reg.pagos[0]!.medio.length > 0 && reg.ocurrioEn === a("12:25"));
    // Quedó en la auditoría con la marca.
    const [asiento] = (await asientosDe("cuenta.cobrar")).filter((x) => x.entityId === e.account.id);
    assert.equal((asiento!.after as { desdePapel: { ocurrioEn: string } }).desdePapel.ocurrioEn, a("12:25"));
  });

  test("lo cobrado en vivo no dice nada del papel, y el turno lo cuenta aparte", async () => {
    const { ctx } = await caja("Caja sin papel");
    const cuenta = {
      id: randomUUID(),
      kind: "MOSTRADOR",
      family: "Mostrador",
      mode: "PREPAGO",
      status: "POR_COBRAR",
      openedAt: new Date(T_CARGA).toISOString(),
      sessionIds: [],
      closedSessionIds: [],
      lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: agua, taxCode: "GENERAL" }],
    };
    const guardada = valor(await l.app.cuentas.guardar(ctx, { cuenta }, T_CARGA));
    const r = valor(
      await l.app.cuentas.cobrar(
        ctx,
        { idempotencyKey: randomUUID(), accountId: guardada.id, version: guardada.version, lineIds: guardada.lines.map((x) => x.id), total: usd("122"), pagos: [{ method: "EFECTIVO_USD", amount: usd("200") }], destinoSobra: "VUELTO" },
        T_CARGA,
      ),
    );
    assert.equal(r.venta.desdePapel, undefined);
    assert.equal(r.venta.closedAt, new Date(T_CARGA).toISOString());
    assert.equal(valor(await l.app.cortes.vista(ctx, undefined, T_CARGA)).ventas.desdePapel, 0);
  });

  test("en bolívares se cita la tasa de la hora real: la vigente entonces, no la de ahora", async () => {
    const { ctx } = await caja("Caja de bolívares");
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:20")));
    // $ 10,00 + 16 % de IVA = $ 11,60: a 855,6625 son Bs. 9.925,69 (se entregan 9.930,00 y sobran 4,31).
    const cobro = {
      idempotencyKey: randomUUID(),
      accountId: e.account.id,
      version: e.account.version,
      lineIds: e.account.lines.map((x) => x.id),
      total: usd("1160"),
      pagos: [{ method: "EFECTIVO_VES", amount: ves("993000") }],
      rateId: tasa,
      destinoSobra: "RESIDUO",
    };
    const r = valor(await l.app.papel.cobrar(ctx, cobro, papel(c, a("12:30")), T_CARGA));
    assert.equal(r.venta.tasa?.id, tasa);
    assert.equal(r.venta.closedAt, a("12:30"));
  });

  test("sin la tasa que regía a esa hora no se cobra en bolívares (fail-closed)", async () => {
    const { ctx } = await caja("Caja sin tasa a esa hora");
    const c = await abrirCarga(ctx, { desde: "2026-09-27T05:00:00.000Z", hasta: "2026-09-27T07:00:00.000Z" });
    // La tasa se capturó a las 8:00 UTC: a las 6:00 UTC (2:00 am en Caracas) nadie la conocía todavía, pero el IVA sí.
    const e = valor(await entrar(ctx, c, a("06:00")));
    const cobro = {
      idempotencyKey: randomUUID(),
      accountId: e.account.id,
      version: e.account.version,
      lineIds: e.account.lines.map((x) => x.id),
      total: usd("1160"),
      pagos: [{ method: "EFECTIVO_VES", amount: ves("993000") }],
      rateId: tasa,
      destinoSobra: "RESIDUO",
    };
    const r = rechazo(await l.app.papel.cobrar(ctx, cobro, papel(c, a("06:30")), T_CARGA));
    assert.equal(r.motivo, "CONFLICTO");
    // Y en dólares sí se cobra.
    valor(await l.app.papel.cobrar(ctx, cobroEnEfectivo(e.account), papel(c, a("06:30")), T_CARGA));
  });

  test("un reintento del mismo cobro devuelve lo mismo y no lo repite", async () => {
    const { ctx } = await caja("Caja de cobros repetidos");
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:20")));
    const cobro = cobroEnEfectivo(e.account);
    const una = valor(await l.app.papel.cobrar(ctx, cobro, papel(c, a("12:25")), T_CARGA));
    const dos = valor(await l.app.papel.cobrar(ctx, cobro, papel(c, a("12:25")), T_CARGA));
    assert.equal(dos.venta.id, una.venta.id);
    assert.equal(valor(await l.app.papel.leer(ctx, T_CARGA)).cargas.find((x) => x.id === c.id)!.registros.filter((r) => r.tipo === "COBRO").length, 1);
  });

  test("una venta de mostrador anotada: la cuenta nace y se cobra a la hora real, y baja del estante entonces", async () => {
    const { ctx } = await caja("Caja de mostrador");
    const c = await abrirCarga(ctx);
    const cuenta = {
      id: randomUUID(),
      kind: "MOSTRADOR",
      family: "Mostrador",
      mode: "PREPAGO",
      status: "POR_COBRAR",
      openedAt: a("12:40"),
      sessionIds: [],
      closedSessionIds: [],
      lines: [{ id: randomUUID(), concept: "Refresco", kind: "RESTAURANTE", amount: usd("200"), paid: false, productId: refresco, taxCode: "GENERAL" }],
    };
    const guardada = valor(await l.app.papel.guardar(ctx, { cuenta }, papel(c, a("12:40")), T_CARGA));
    assert.equal(guardada.openedAt, a("12:40"));
    assert.equal(guardada.pendingSince, a("12:40"));
    const r = valor(
      await l.app.papel.cobrar(
        ctx,
        { idempotencyKey: randomUUID(), accountId: guardada.id, version: guardada.version, lineIds: guardada.lines.map((x) => x.id), total: usd("241"), pagos: [{ method: "EFECTIVO_USD", amount: usd("300") }], destinoSobra: "VUELTO" },
        papel(c, a("12:40")),
        T_CARGA,
      ),
    );
    assert.equal(r.venta.closedAt, a("12:40"));
    assert.equal(r.venta.desdePapel?.cargaId, c.id);
    // La existencia bajó a la hora real de la venta, no a la de la carga.
    const movimientos = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.stockMovement.findMany({ where: { accountId: guardada.id } }));
    assert.deepEqual(movimientos.map((m) => [m.productId, m.at.toISOString()]), [[refresco, a("12:40")]]);
  });

  test("desde papel solo nacen ventas de mostrador: una familia o una mesa ya existen en el sistema", async () => {
    const { ctx } = await caja("Caja que no inventa familias");
    const c = await abrirCarga(ctx);
    const f = {
      id: randomUUID(),
      kind: "FAMILIA",
      family: "Familia inventada",
      mode: "CUENTA_ABIERTA",
      status: "ABIERTA",
      openedAt: a("12:40"),
      sessionIds: [],
      closedSessionIds: [],
      lines: [],
    };
    const r = rechazo(await l.app.papel.guardar(ctx, { cuenta: f }, papel(c, a("12:40")), T_CARGA));
    assert.equal(r.motivo, "INVALIDO");
  });
});

describe("terminar, revisar y el Z", () => {
  /** El conteo exacto de la gaveta, como lo diría el libro: el arqueo cuadra y firma la cajera. */
  async function contarExacto(ctx: Contexto, turnoId: string) {
    const x = valor(await l.app.cortes.corteX(ctxSupervisor, { turnoId }, T_CARGA + 30 * MIN));
    const esperado = (moneda: string) => BigInt(x.gaveta!.find((g) => g.currency === moneda)!.esperado.minor);
    const billetes = (minor: bigint, currency: "USD" | "VES") => [
      { denominacion: { minor: "100", currency }, cantidad: Number(minor / 100n) },
      { denominacion: { minor: "1", currency }, cantidad: Number(minor % 100n) },
    ];
    return valor(
      await l.app.cortes.arquear(
        ctx,
        { turnoId, conteos: [{ currency: "USD", billetes: billetes(esperado("USD"), "USD") }, { currency: "VES", billetes: billetes(esperado("VES"), "VES") }] },
        T_CARGA + 31 * MIN,
      ),
    );
  }
  const corteZ = (turnoId: string, arqueoId: string, extra: Record<string, unknown> = {}) => ({
    idempotencyKey: randomUUID(),
    turnoId,
    arqueoId,
    cierre: "RELEVO",
    quedaEnGaveta: [usd("2000"), ves("150000")],
    ...extra,
  });
  /** Una carga con una entrada y su cobro, a la espera de revisión. */
  async function cargaCerrada(nombre: string) {
    const { ctx, turno } = await caja(nombre);
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:20")));
    valor(await l.app.papel.cobrar(ctx, cobroEnEfectivo(e.account), papel(c, a("12:25")), T_CARGA));
    const cerrada = valor(await l.app.papel.terminar(ctx, { cargaId: c.id }, T_CARGA + 5 * MIN));
    return { ctx, turno, c: cerrada };
  }

  test("terminar la deja a la espera de revisión; una vacía se descarta", async () => {
    const { c } = await cargaCerrada("Caja que termina");
    assert.equal(c.estado, "CERRADA");
    assert.equal(c.terminadaPor, "Marisol Prieto");
    assert.equal(c.terminadaEn, new Date(T_CARGA + 5 * MIN).toISOString());
    assert.equal(c.revisadaPor, null);

    const { ctx } = await caja("Caja que descarta");
    const vacia = await abrirCarga(ctx);
    const d = valor(await l.app.papel.terminar(ctx, { cargaId: vacia.id }, T_CARGA + MIN));
    assert.equal(d.estado, "DESCARTADA");
    // Una descartada no queda pendiente ni se revisa.
    const p = valor(await l.app.cortes.pendientes(ctx, undefined, T_CARGA));
    assert.ok(!p.papel.some((x) => x.id === vacia.id));
    const yaEsta = rechazo(await l.app.papel.revisar(ctxSupervisor, { cargaId: vacia.id }, pinDe(supervisor, PIN.supervisor), T_CARGA + 10 * MIN));
    assert.equal(yaEsta.motivo, "CONFLICTO");
    // Y no se termina dos veces.
    assert.equal(rechazo(await l.app.papel.terminar(ctx, { cargaId: vacia.id }, T_CARGA + 2 * MIN)).motivo, "CONFLICTO");
  });

  test("terminar es de la caja del turno: otro equipo no la cierra", async () => {
    const { ctx } = await caja("Caja con carga a medias");
    const c = await abrirCarga(ctx);
    const r = rechazo(await l.app.papel.terminar(ctxSupervisor, { cargaId: c.id }, T_CARGA));
    assert.equal(r.motivo, "CONFLICTO");
  });

  test("sin revisar, el turno no se sella: ni el Z de un relevo; con la revisión, sí", async () => {
    const { ctx, turno, c } = await cargaCerrada("Caja del Z");
    const arqueo = await contarExacto(ctx, turno.id);
    const sinRevisar = rechazo(await l.app.cortes.corteZ(ctx, corteZ(turno.id, arqueo.id), pinDe(cajera, PIN.cajera, "Cierro"), T_CARGA + 40 * MIN));
    assert.equal(sinRevisar.motivo, "CONFLICTO");
    assert.match(sinRevisar.mensaje, /carga desde papel sin revisar/);
    // Los pendientes de la jornada la listan, con su turno y cuántos registros trae.
    const p = valor(await l.app.cortes.pendientes(ctxSupervisor, turno.id, T_CARGA + 40 * MIN));
    const pendiente = p.papel.find((x) => x.id === c.id)!;
    assert.deepEqual([pendiente.estado, pendiente.punto, pendiente.registros, pendiente.abiertaPor], ["CERRADA", "Caja del Z", 2, "Marisol Prieto"]);

    const revisada = valor(await l.app.papel.revisar(ctxSupervisor, { cargaId: c.id, nota: "Cuadra con las hojas 1 y 2" }, pinDe(supervisor, PIN.supervisor), T_CARGA + 41 * MIN));
    assert.equal(revisada.estado, "REVISADA");
    assert.equal(revisada.revisadaPor, "Luis Guerrero");
    assert.equal(revisada.notaDeRevision, "Cuadra con las hojas 1 y 2");

    const z = valor(await l.app.cortes.corteZ(ctx, corteZ(turno.id, arqueo.id), pinDe(cajera, PIN.cajera, "Cierro"), T_CARGA + 42 * MIN));
    assert.equal(z.turno.estado, "CERRADO_Z");
    // El corte dice cuántas ventas vinieron del papel y deja la excepción, ya revisada.
    assert.equal(z.ventas.desdePapel, 1);
    const excepcion = z.excepciones.find((e) => e.tipo === "PAPEL")!;
    assert.equal(excepcion.usuario, "Marisol Prieto");
    assert.equal(excepcion.autorizadoPor, "Luis Guerrero");
    assert.match(excepcion.detalle, /2 registros/);
    assert.match(excepcion.motivo, /Revisada/);
    assert.deepEqual(excepcion.importe, usd("1196"));
  });

  test("una carga abierta tampoco deja sellar, y la jornada no se cierra con cargas de otro turno", async () => {
    const { ctx, turno } = await caja("Caja de la carga abierta");
    const c = await abrirCarga(ctx);
    valor(await entrar(ctx, c, a("12:20")));
    const arqueo = await contarExacto(ctx, turno.id);
    const r = rechazo(await l.app.cortes.corteZ(ctx, corteZ(turno.id, arqueo.id), pinDe(cajera, PIN.cajera, "Cierro"), T_CARGA + 40 * MIN));
    assert.equal(r.motivo, "CONFLICTO");
    // Desde otra caja, que cierra la jornada, la carga abierta de esta es un pendiente.
    const { ctx: ctxUltima, turno: turnoUltima } = await caja("Caja que cierra la jornada", cajera, PIN.cajera);
    const p = valor(await l.app.cortes.pendientes(ctxUltima, turnoUltima.id, T_CARGA));
    assert.ok(p.papel.some((x) => x.id === c.id && x.estado === "ABIERTA"));
  });

  test("revisar: la caja no revisa, quien cargó tampoco, el PIN tiene que ser el propio y bueno", async () => {
    const { ctx, c } = await cargaCerrada("Caja que se revisa");
    const cajeraRevisa = rechazo(await l.app.papel.revisar(ctx, { cargaId: c.id }, pinDe(cajera, PIN.cajera), T_CARGA + 10 * MIN));
    assert.equal(cajeraRevisa.motivo, "NO_PERMITIDO");
    const monitora = rechazo(await l.app.papel.revisar(ctxMonitora, { cargaId: c.id }, pinDe(supervisor, PIN.supervisor), T_CARGA + 10 * MIN));
    assert.equal(monitora.motivo, "NO_PERMITIDO");
    // El PIN de otra persona no vale, y uno malo tampoco.
    const ajeno = rechazo(await l.app.papel.revisar(ctxSupervisor, { cargaId: c.id }, pinDe(supervisor2, PIN.supervisor2), T_CARGA + 10 * MIN));
    assert.equal(ajeno.motivo, "NO_PERMITIDO");
    const malo = rechazo(await l.app.papel.revisar(ctxSupervisor, { cargaId: c.id }, pinDe(supervisor, "0000"), T_CARGA + 10 * MIN));
    assert.equal(malo.motivo, "NO_PERMITIDO");
    const sinPin = rechazo(await l.app.papel.revisar(ctxSupervisor, { cargaId: c.id }, undefined, T_CARGA + 10 * MIN));
    assert.equal(sinPin.motivo, "NO_PERMITIDO");
    // Nada cambió.
    assert.equal(valor(await l.app.papel.leer(ctxSupervisor, T_CARGA + 11 * MIN)).cargas.find((x) => x.id === c.id)!.estado, "CERRADA");
    // Una carga que todavía se está cargando no se revisa.
    const { ctx: ctxAbierta } = await caja("Caja que sigue cargando");
    const abierta = await abrirCarga(ctxAbierta);
    valor(await entrar(ctxAbierta, abierta, a("12:20")));
    const temprano = rechazo(await l.app.papel.revisar(ctxSupervisor, { cargaId: abierta.id }, pinDe(supervisor, PIN.supervisor), T_CARGA + 10 * MIN));
    assert.equal(temprano.motivo, "CONFLICTO");
  });

  test("quien cargó no revisa su propia carga, aunque sea de supervisión", async () => {
    // Una supervisora que carga el papel de su propio turno.
    const ctx = ctxSupervisor2;
    valor(await l.app.turnos.abrir(ctx, FONDO, undefined, T_TURNO));
    const c = await abrirCarga(ctx);
    valor(await entrar(ctx, c, a("12:20")));
    valor(await l.app.papel.terminar(ctx, { cargaId: c.id }, T_CARGA + MIN));
    const propia = rechazo(await l.app.papel.revisar(ctx, { cargaId: c.id }, pinDe(supervisor2, PIN.supervisor2), T_CARGA + 2 * MIN));
    assert.equal(propia.motivo, "NO_PERMITIDO");
    assert.match(propia.mensaje, /Quien cargó/);
    // La revisa otra persona de supervisión; administración también puede.
    const hecha = valor(await l.app.papel.revisar(ctxAdmin, { cargaId: c.id }, pinDe((await l.base.conTenant(l.sistema.tenantId, (tx) => tx.staffUser.findFirstOrThrow({ where: { fullName: "Abigail Karam" } }))).id, PIN.admin), T_CARGA + 3 * MIN));
    assert.equal(hecha.revisadaPor, "Abigail Karam");
  });

  test("dos revisiones: la segunda se entera de que ya está revisada", async () => {
    const { c } = await cargaCerrada("Caja de dos revisiones");
    valor(await l.app.papel.revisar(ctxSupervisor, { cargaId: c.id }, pinDe(supervisor, PIN.supervisor), T_CARGA + 10 * MIN));
    const otra = rechazo(await l.app.papel.revisar(ctxSupervisor2, { cargaId: c.id }, pinDe(supervisor2, PIN.supervisor2), T_CARGA + 11 * MIN));
    assert.equal(otra.motivo, "CONFLICTO");
    assert.match(otra.mensaje, /revisada/);
  });

  test("la revisión y la apertura quedan en la auditoría, con quién autorizó", async () => {
    const { c } = await cargaCerrada("Caja de la auditoría");
    valor(await l.app.papel.revisar(ctxSupervisor, { cargaId: c.id, nota: "Todo en orden" }, pinDe(supervisor, PIN.supervisor), T_CARGA + 10 * MIN));
    const [cerrar] = (await asientosDe("papel.cerrar")).filter((x) => x.entityId === c.id);
    assert.deepEqual(cerrar!.after, { estado: "CERRADA", registros: 2 });
    const [revisar] = (await asientosDe("papel.revisar")).filter((x) => x.entityId === c.id);
    assert.equal(revisar!.authorizedBy, supervisor);
    assert.equal(revisar!.reason, "Todo en orden");
    assert.deepEqual(revisar!.after, { registros: 2, cargadaPor: "Marisol Prieto" });
  });
});

describe("qué ve cada quien y el resumen del día", () => {
  test("la cajera ve las de su turno; supervisión, las que esperan en la sucursal; la monitora, nada", async () => {
    const { ctx } = await caja("Caja que lee");
    const c = await abrirCarga(ctx);
    const suyas = valor(await l.app.papel.leer(ctx, T_CARGA));
    assert.ok(suyas.cargas.some((x) => x.id === c.id));
    assert.ok(suyas.turnoId);
    assert.equal(suyas.ahora, new Date(T_CARGA).toISOString());
    // Una caja sin turno no ve la de otra...
    const sinTurno = await contextoDe(l, await crearEquipo(l, "Caja que mira"), cajera, PIN.cajera);
    assert.ok(!valor(await l.app.papel.leer(sinTurno, T_CARGA)).cargas.some((x) => x.id === c.id));
    assert.equal(valor(await l.app.papel.leer(sinTurno, T_CARGA)).turnoId, null);
    // ...supervisión sí: está abierta y sin revisar.
    assert.ok(valor(await l.app.papel.leer(ctxSupervisor, T_CARGA)).cargas.some((x) => x.id === c.id));
    assert.equal(rechazo(await l.app.papel.leer(ctxMonitora, T_CARGA)).motivo, "NO_PERMITIDO");
  });

  test("Inicio cuenta lo que espera revisión y lo cargado desde papel", async () => {
    const antes = valor(await l.app.cortes.resumenDelDia(ctxSupervisor, T_CARGA + 20 * MIN));
    const { ctx } = await caja("Caja del resumen");
    const c = await abrirCarga(ctx);
    const e = valor(await entrar(ctx, c, a("12:20")));
    valor(await l.app.papel.cobrar(ctx, cobroEnEfectivo(e.account), papel(c, a("12:25")), T_CARGA));
    const despues = valor(await l.app.cortes.resumenDelDia(ctxSupervisor, T_CARGA + 20 * MIN));
    assert.equal(despues.papelPorRevisar, antes.papelPorRevisar + 1);
    assert.equal(despues.ventas.desdePapel, antes.ventas.desdePapel + 1);
    assert.ok(despues.excepciones.some((x) => x.tipo === "PAPEL" && x.usuario === "Marisol Prieto"));
    // La vista del turno de la cajera distingue lo cargado.
    const vista = valor(await l.app.cortes.vista(ctx, undefined, T_CARGA + 20 * MIN));
    assert.equal(vista.ventas.desdePapel, 1);
    assert.ok(vista.excepciones.some((x) => x.tipo === "PAPEL" && x.autorizadoPor === null));
  });

  test("las ventas del turno traen la marca y salen en el orden de la hora real", async () => {
    const { ctx } = await caja("Caja de las ventas");
    const c = await abrirCarga(ctx);
    const e1 = valor(await entrar(ctx, c, a("12:10")));
    const e2 = valor(await entrar(ctx, c, a("12:20")));
    // Se carga primero el de las 12:40 y después el de las 12:30: en la lista mandan las horas reales.
    valor(await l.app.papel.cobrar(ctx, cobroEnEfectivo(e1.account), papel(c, a("12:40")), T_CARGA));
    valor(await l.app.papel.cobrar(ctx, cobroEnEfectivo(e2.account), papel(c, a("12:30")), T_CARGA));
    const ventas = valor(await l.app.ventas.delTurno(ctx)).ventas;
    assert.deepEqual(ventas.map((v) => v.closedAt), [a("12:40"), a("12:30")]);
    assert.ok(ventas.every((v) => v.desdePapel?.cargaId === c.id));
  });
});

describe("el aislamiento", () => {
  test("otro local no ve las cargas de este ni puede revisarlas, y sus equipos no cargan en ellas", async () => {
    const { ctx } = await caja("Caja del aislamiento");
    const c = await abrirCarga(ctx);
    valor(await entrar(ctx, c, a("12:20")));
    valor(await l.app.papel.terminar(ctx, { cargaId: c.id }, T_CARGA + MIN));
    const admin2 = await crearPersona(otro, { nombre: "Admin de otro", role: "ADMIN", pin: "4826" });
    const ctxOtro = await contextoDe(otro, await crearEquipo(otro, "Oficina de otro"), admin2, "4826");
    assert.ok(!valor(await otro.app.papel.leer(ctxOtro, T_CARGA)).cargas.some((x) => x.id === c.id));
    const r = rechazo(await otro.app.papel.revisar(ctxOtro, { cargaId: c.id }, pinDe(admin2, "4826"), T_CARGA + 5 * MIN));
    assert.equal(r.motivo, "NO_DISPONIBLE");
    const t = valor(await otro.app.turnos.abrir(ctxOtro, FONDO, undefined, T_TURNO));
    assert.ok(t.id);
    const e = rechazo(await otro.app.papel.entrar(ctxOtro, entrada(), papel(c, a("12:20")), T_CARGA));
    assert.equal(e.motivo, "NO_DISPONIBLE");
  });
});
