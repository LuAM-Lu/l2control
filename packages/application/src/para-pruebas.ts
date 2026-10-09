/**
 * Utilidades SOLO para las pruebas de integración (`*.test-db.ts`): un local de prueba con
 * personas y equipos reales en la base. No las importa el código de la aplicación.
 */
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, type KeyObject } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Role } from "@l2/domain-identity";
import { abrirBase, type Base } from "@l2/database";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { conectar, type Aplicacion, type Contexto, type OpcionesDeFirma, type OpcionesDeRegistro } from "./index.ts";

export interface LocalDePrueba {
  app: Aplicacion;
  base: Base;
  /** Contexto de sistema del local: tenant, sucursal principal y sin persona. */
  sistema: Contexto;
  /** Otra sucursal del mismo tenant. */
  otraSucursal: string;
  cerrar(): Promise<void>;
}

/** Clave de cifrado de las pruebas: fija y sin valor fuera de ellas. */
export const CLAVE_DE_PRUEBA = Buffer.alloc(32, 9).toString("base64");
/** La dirección pública de las pruebas: las llaves de `LlaveDePrueba` firman para ella. */
export const URL_DE_PRUEBA = "http://localhost:3000";

/** Una cédula de prueba estable para un teléfono (T-19): la misma familia trae siempre la misma. */
export const cedulaDePrueba = (telefono: string): string => `V-${telefono.replace(/\D/g, "").slice(-8)}`;

/** «Factura a» de prueba (T-19): la venta del mostrador se cobra a alguien con su cédula y su nombre. */
export const FACTURA_DE_PRUEBA = { kind: "IDENTIFICADO" as const, name: "Prueba Cliente del mostrador", document: "V-30999999" };

export async function abrirLocalDePrueba(url: string, nombre: string): Promise<LocalDePrueba> {
  const app = await conectar(url, { claveCifrado: CLAVE_DE_PRUEBA, urlPublica: URL_DE_PRUEBA });
  const base = await abrirBase(url);
  const tenantId = randomUUID();
  const sistema: Contexto = { tenantId, branchId: randomUUID(), sistema: true };
  const otraSucursal = randomUUID();
  await app.sucursal.asegurar(sistema, { tenant: nombre, sucursal: "Principal" });
  await base.conTenant(tenantId, (tx) => tx.branch.create({ data: { id: otraSucursal, tenantId, name: "Otra" } }));
  return {
    app,
    base,
    sistema,
    otraSucursal,
    async cerrar() {
      await borrarTenantsDePrueba(url, [tenantId]);
      await Promise.all([app.cerrar(), base.cerrar()]);
    },
  };
}

export async function crearPersona(
  local: LocalDePrueba,
  p: { nombre: string; role: Role; pin?: string | null; activa?: boolean; sucursales?: string[] },
): Promise<string> {
  const id = randomUUID();
  const { tenantId, branchId } = local.sistema;
  await local.base.conTenant(tenantId, async (tx) => {
    await tx.staffUser.create({
      data: {
        id,
        tenantId,
        fullName: p.nombre,
        role: p.role,
        active: p.activa ?? true,
        pinHash: p.pin === null ? null : await hash(p.pin ?? "2580"),
      },
    });
    for (const b of p.sucursales ?? [branchId]) {
      await tx.staffUserBranch.create({ data: { tenantId, userId: id, branchId: b } });
    }
  });
  return id;
}

let equiposDePrueba = 0;

/**
 * Un equipo registrado (y aprobado, salvo que se diga lo contrario). Devuelve su credencial. Cada uno
 * pide desde su propia dirección: el tope de solicitudes por red (M-7) es de las pruebas del alta.
 *
 * Uno aprobado queda además como punto de cobro (B3-9), como un equipo que ya cobraba al actualizar: abre su turno sin
 * pedir nada. Las pruebas del punto de cobro lo crean sin la marca (`puntoDeCobro = false`).
 */
export async function crearEquipo(local: LocalDePrueba, label: string, aprobar = true, puntoDeCobro = aprobar): Promise<string> {
  const n = ++equiposDePrueba;
  const r = await local.app.dispositivos.solicitar(local.sistema, label, `10.0.${n >> 8}.${n & 255}`);
  if (!r.ok) throw new Error(`No se pudo registrar el equipo: ${r.mensaje}`);
  if (aprobar) {
    const a = await local.app.dispositivos.ordenar(local.sistema, {
      kind: "APROBAR",
      deviceId: r.valor.credencial.split(".")[1],
      reason: "Aprobado en la preparación de la prueba",
    });
    if (!a.ok) throw new Error(`No se pudo aprobar el equipo: ${a.mensaje}`);
  }
  if (puntoDeCobro) {
    const p = await local.app.dispositivos.ordenar(local.sistema, {
      kind: "PUNTO_DE_COBRO",
      deviceId: r.valor.credencial.split(".")[1],
      puntoDeCobro: true,
      reason: "Punto de cobro en la preparación de la prueba",
    });
    if (!p.ok) throw new Error(`No se pudo marcar el punto de cobro: ${p.mensaje}`);
  }
  return r.valor.credencial;
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url");

/**
 * Un autenticador de software: lo que haría Windows Hello o el teléfono, pero dentro de la prueba.
 * Genera su par de claves (ES256), responde a un desafío de registro y firma los de acceso con el
 * formato exacto de WebAuthn, así que el servidor lo comprueba con el mismo código que una llave
 * de verdad. La clave privada no sale de aquí, como no sale del aparato.
 */
export class LlaveDePrueba {
  readonly id = b64(randomBytes(32));
  readonly #privada: KeyObject;
  readonly #cose: Uint8Array;
  #userHandle: string | null = null;
  /** El contador de firmas. Una llave copiada lo enseña retrocediendo. */
  contador = 0;
  /** El origen que el navegador declara al firmar. */
  readonly origen: string;

  constructor(origen: string = URL_DE_PRUEBA) {
    this.origen = origen;
    const par = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.#privada = par.privateKey;
    const jwk = par.publicKey.export({ format: "jwk" });
    // Clave pública en COSE: EC2 (1: 2), ES256 (3: -7), curva P-256 (-1: 1) y sus coordenadas.
    this.#cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]),
    );
  }

  #datos(rpId: string, registro: boolean): Buffer {
    const cuenta = Buffer.alloc(4);
    cuenta.writeUInt32BE(this.contador);
    // Presente (0x01) y verificada (0x04); al registrar lleva además la credencial (0x40).
    const cabecera = Buffer.concat([createHash("sha256").update(rpId).digest(), Buffer.from([registro ? 0x45 : 0x05]), cuenta]);
    if (!registro) return cabecera;
    const id = Buffer.from(this.id, "base64url");
    const largo = Buffer.alloc(2);
    largo.writeUInt16BE(id.length);
    return Buffer.concat([cabecera, Buffer.alloc(16), largo, id, this.#cose]);
  }

  #cliente(tipo: "webauthn.create" | "webauthn.get", desafio: string): Buffer {
    return Buffer.from(JSON.stringify({ type: tipo, challenge: desafio, origin: this.origen, crossOrigin: false }), "utf8");
  }

  /** La respuesta a un desafío de registro, como la entregaría `navigator.credentials.create()`. */
  registrar(opciones: OpcionesDeRegistro): Record<string, unknown> {
    this.#userHandle = opciones.user.id;
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, never>>([
        ["fmt", "none"],
        ["attStmt", new Map<string, never>()],
        ["authData", new Uint8Array(this.#datos(opciones.rp.id!, true))],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: b64(this.#cliente("webauthn.create", opciones.challenge)), attestationObject: b64(attestationObject), transports: ["internal"] },
    };
  }

  /** La firma de un desafío de acceso, como la entregaría `navigator.credentials.get()`. */
  firmar(opciones: OpcionesDeFirma): Record<string, unknown> {
    this.contador++;
    const datos = this.#datos(opciones.rpId!, false);
    const cliente = this.#cliente("webauthn.get", opciones.challenge);
    const firma = sign("sha256", Buffer.concat([datos, createHash("sha256").update(cliente).digest()]), this.#privada);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: b64(cliente), authenticatorData: b64(datos), signature: b64(firma), ...(this.#userHandle ? { userHandle: this.#userHandle } : {}) },
    };
  }
}

export interface CredencialesDePrueba {
  readonly llave: LlaveDePrueba;
  readonly contrasena: string;
  /** Los diez códigos de recuperación, en claro. */
  readonly codigos: readonly string[];
}

/**
 * Da contraseña, llave de acceso y códigos de recuperación a una persona por el camino real: un
 * enlace de alta que genera el sistema y que ella completa con su autenticador (ADR-020).
 */
export async function darCredenciales(
  local: LocalDePrueba,
  userId: string,
  contrasena = "contraseña-de-prueba",
  ahora = Date.now(),
): Promise<CredencialesDePrueba> {
  const e = await local.app.enlaces.crear(local.sistema, { userId, kind: "ALTA" }, ahora);
  if (!e.ok) throw new Error(e.mensaje);
  const enlace = e.valor.url.split("#")[1]!;
  const p = await local.app.enlaces.preparar({ enlace, datos: { contrasena }, ahora });
  if (!p.ok) throw new Error(p.mensaje);
  const llave = new LlaveDePrueba();
  const c = await local.app.enlaces.completar({
    enlace,
    datos: { desafioId: p.valor.desafioId, respuesta: llave.registrar(p.valor.opciones), etiqueta: "Llave de prueba" },
    ip: null,
    ahora,
  });
  if (!c.ok) throw new Error(c.mensaje);
  return { llave, contrasena, codigos: c.valor.codigos ?? [] };
}

/** Confirma identidad en una sesión abierta con la contraseña y la llave, como haría la pantalla. */
export async function elevarConLlave(local: Pick<LocalDePrueba, "app">, sesion: string, c: Pick<CredencialesDePrueba, "llave" | "contrasena">, ahora = Date.now()) {
  const d = await local.app.elevacion.desafio({ sesion, ahora });
  if (!d.ok) return d;
  return local.app.elevacion.elevar({
    sesion,
    contrasena: c.contrasena,
    factor: { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: c.llave.firmar(d.valor.opciones) },
    ip: null,
    ahora,
  });
}

/**
 * El contexto de una persona que entra con su PIN en `equipo` y confirma identidad con
 * contraseña y llave de acceso (F2-04), como haría la pantalla. Le da credenciales antes.
 */
export async function contextoElevado(
  local: LocalDePrueba,
  equipo: string,
  persona: { id: string; nombre: string; pin: string },
): Promise<Contexto> {
  const { contextoDeSesion } = await import("./identidad/sesiones.ts");
  const ahora = Date.now();
  const credenciales = await darCredenciales(local, persona.id, "contraseña-de-prueba", ahora);
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId: persona.id, pin: persona.pin, ip: null, ahora });
  if (!r.ok) throw new Error(r.mensaje);
  const e = await elevarConLlave(local, r.credencial, credenciales, ahora);
  if (!e.ok) throw new Error(e.mensaje);
  return contextoDeSesion((await local.app.sesiones.consultar(r.credencial, ahora))!, null);
}

/** El contexto de una persona que entra con su PIN (sin elevar). */
export async function contextoDe(local: LocalDePrueba, equipo: string, userId: string, pin: string): Promise<Contexto> {
  const { contextoDeSesion } = await import("./identidad/sesiones.ts");
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId, pin, ip: null, ahora: Date.now() });
  if (!r.ok) throw new Error(r.mensaje);
  return contextoDeSesion(r.sesion, null);
}

let ordenDePrueba = 0;

/**
 * Una cuenta registrada (B3-3), sin versiones: basta para que el libro de pagos la cite. Las pruebas
 * de las cuentas en sí las abren con `app.cuentas.guardar`.
 */
export async function crearCuenta(local: LocalDePrueba, kind: "FAMILIA" | "MESA" | "MOSTRADOR" = "MOSTRADOR"): Promise<string> {
  const id = randomUUID();
  const { tenantId, branchId } = local.sistema;
  await local.base.conTenant(tenantId, (tx) =>
    tx.account.create({
      data: { id, tenantId, branchId, kind, orderNumber: 10_000 + ++ordenDePrueba, openedAt: new Date(), openedByName: "Prueba del libro" },
    }),
  );
  return id;
}

/**
 * La cuenta de una familia, abierta como en el local: por la entrada del parque (B4-2), con un niño
 * en un paquete de 1 hora a $ 10,00. Publica ese tarifario si el local todavía no tiene uno.
 */
export async function familiaDePrueba(
  local: LocalDePrueba,
  ctx: Contexto,
  ahora: number,
  paymentMode: "PREPAGO" | "CUENTA_ABIERTA" = "CUENTA_ABIERTA",
): Promise<import("@l2/contracts").FamilyAccountDto> {
  if (!(await local.app.tarifario.leer(local.sistema))) {
    const r = await local.app.tarifario.publicar(local.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: { minor: "1000", currency: "USD" }, active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
    });
    if (!r.ok) throw new Error(r.mensaje);
  }
  const n = ++ordenDePrueba;
  const r = await local.app.parque.entrar(
    ctx,
    {
      idempotencyKey: randomUUID(),
      paymentMode,
      entries: [{ wristbandCode: `PRUEBA-${n}`, kid: {}, packageId: "pkg-60" }],
      guardian: { fullName: "Familia Pérez", contactReference: `0412-${String(2_000_000 + n)}` }, guardianDocument: cedulaDePrueba(`0412-${String(2_000_000 + n)}`),
    },
    ahora,
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.valor.account;
}

/**
 * Un cliente de prueba (B6-9): nombre, cédula y teléfono que no chocan con los de otro cliente de la misma corrida.
 */
export function clienteDePrueba(nombre?: string): { nombre: string; cedula: string; telefono: string } {
  const n = ++ordenDePrueba;
  return { nombre: nombre ?? `Prueba Cliente ${n}`, cedula: `V-${30_000_000 + n}`, telefono: `0414-${String(3_000_000 + n)}` };
}

/**
 * Sienta a un cliente de prueba en una mesa, o de pie sin `tableId` (B6-7, B6-9): desde B6-9 una mesa sin cuenta no
 * recibe pedidos, pulseras ni salidas del parque, así que las pruebas sientan primero, como en el local.
 */
export async function sentarDePrueba(
  local: LocalDePrueba,
  ctx: Contexto,
  tableId: string | undefined,
  ahora: number,
  extra: Readonly<{ nombre?: string; comensales?: number; vistas?: number }> = {},
): Promise<import("@l2/contracts").FamilyAccountDto> {
  const r = await local.app.mesas.abrir(
    ctx,
    {
      cuentaId: randomUUID(),
      ...(tableId ? { tableId } : {}),
      cliente: clienteDePrueba(extra.nombre),
      comensales: extra.comensales ?? 2,
      vistas: extra.vistas ?? 0,
    },
    ahora,
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.valor;
}

/**
 * Una impresora de recibos y comandas (de cocina y de barra, B6-10) encendida en el local (B5-2): sin ella, imprimir un recibo se
 * niega. Su dirección no existe: los trabajos esperan en la cola, que es lo que prueban estas pruebas.
 */
export async function impresoraDePrueba(local: LocalDePrueba, ip = "192.168.250.250"): Promise<string> {
  const r = await local.app.impresion.aplicar(local.sistema, {
    kind: "CREAR",
    datos: { nombre: "Caja de prueba", ip, puerto: 9100, ancho: 80, recibos: true, comandas: true, barra: true, enVlanDeHardware: true, ipFija: true },
  });
  if (!r.ok) throw new Error(r.mensaje);
  const id = r.valor.local.impresoras.find((i) => i.ip === ip)!.id;
  const a = await local.app.impresion.aplicar(local.sistema, { kind: "ACTIVAR", impresoraId: id, activa: true });
  if (!a.ok) throw new Error(a.mensaje);
  return id;
}

/**
 * Un plano del salón publicado (B6-1) con las mesas `mesa-1` a `mesa-N`, de 4 sillas: sin plano, una
 * cuenta de mesa no nace. Se escribe directo en la base, a nombre de una persona de prueba.
 */
export async function planoDePrueba(local: LocalDePrueba, mesas = 4): Promise<void> {
  const { tenantId, branchId } = local.sistema;
  const tables = Array.from({ length: mesas }, (_, i) => ({
    id: `mesa-${i + 1}`,
    label: String(i + 1),
    zone: "Salón",
    seats: 4,
    shape: "REDONDA",
    x: 100 + (i % 5) * 150,
    y: 100 + Math.floor(i / 5) * 150,
    width: 80,
    height: 80,
    rotation: 0,
  }));
  await local.base.conTenant(tenantId, async (tx) => {
    const r = await tx.floorPlanVersion.aggregate({ where: { branchId }, _max: { version: true } });
    await tx.floorPlanVersion.create({
      data: {
        tenantId,
        branchId,
        version: (r._max.version ?? 0) + 1,
        content: { width: 800, height: 100 + Math.ceil(mesas / 5) * 150, tables, fixtures: [] },
        publishedBy: randomUUID(),
        publishedByName: "Prueba del plano",
      },
    });
  });
}

/**
 * Un pedido del mesero registrado (B6-2), sin pasar por su caso de uso: basta para que una COMANDA de
 * las pruebas de la cola lo nombre (toda comanda lleva su pedido). Las pruebas de los pedidos en sí los
 * envían con `app.pedidos.enviar`.
 */
export async function pedidoDePrueba(local: LocalDePrueba): Promise<string> {
  const id = randomUUID();
  const accountId = await crearCuenta(local, "MESA");
  const { tenantId, branchId } = local.sistema;
  await local.base.conTenant(tenantId, (tx) =>
    tx.kitchenOrder.create({
      data: {
        id,
        tenantId,
        branchId,
        accountId,
        number: 10_000 + ++ordenDePrueba,
        tableId: "mesa-1",
        tableLabel: "1",
        items: [{ productId: randomUUID(), nombre: "Tequeños", cantidad: 2, nota: null }],
        createdAt: new Date(),
        createdByName: "Prueba de la cola",
      },
    }),
  );
  return id;
}
