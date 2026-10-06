/**
 * Las llaves de acceso (WebAuthn) y los códigos de recuperación — ADR-020.
 *
 * El segundo factor de administración. Una llave vive en el equipo o en el teléfono de la persona
 * (Windows Hello, el bloqueo de pantalla de Android o de iPhone) y aquí solo se guarda su clave
 * PÚBLICA: un volcado de la base no sirve para confirmar identidad. Está atada al dominio del
 * sistema, así que una página falsa no puede pedirla, y cada firma responde a un desafío de un
 * solo uso: no hay un código que se pueda dictar ni repetir.
 *
 * Las firmas las comprueba SimpleWebAuthn (sin criptografía casera). Este archivo guarda el
 * desafío de cada ceremonia, lo gasta al responderlo (acierte o no) y lleva las llaves y los
 * códigos de cada persona. Todo recibe el `tx` de quien lo llama: la llave y lo que autoriza se
 * confirman juntos o ninguno.
 *
 * Los diez códigos de recuperación son la puerta para quien perdió sus llaves: de un solo uso, se
 * enseñan una vez y aquí queda su SHA-256 (son aleatorios de 50 bits, y cada fallo cuenta para el
 * bloqueo creciente de la persona).
 */
import { randomInt } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Prisma, Transaccion } from "@l2/database";
import { huella } from "./credenciales.ts";

/** Para qué se pide una firma. El desafío de una ceremonia no sirve para otra. */
export type Proposito = "INSTALACION" | "ALTA" | "LLAVE" | "ELEVAR" | "APROBAR_EQUIPO";

/** Lo que dura un desafío: lo justo para poner la huella o acercar el teléfono. */
export const DESAFIO_MS = 5 * 60_000;
export const CODIGOS_DE_RECUPERACION = 10;
const NOMBRE_DEL_SISTEMA = "L2 Control";

/** Dónde vive el sistema para el navegador: una llave solo firma para este origen. */
export interface OrigenWeb {
  /** `https://l2.ejemplo.com`, sin barra final. */
  readonly origen: string;
  /** El dominio al que quedan atadas las llaves (`l2.ejemplo.com`, `localhost`). */
  readonly rpId: string;
}

/** Lee la dirección pública del sistema. Cualquier cosa que no sea un origen http(s) es `null`. */
export function leerOrigenWeb(url: string | undefined | null): OrigenWeb | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { origen: u.origin, rpId: u.hostname };
  } catch {
    return null;
  }
}

export type OpcionesDeRegistro = PublicKeyCredentialCreationOptionsJSON;
export type OpcionesDeFirma = PublicKeyCredentialRequestOptionsJSON;

/** Un desafío recién creado: su id viaja con la respuesta para encontrarlo sin creer al navegador. */
export interface Desafio<O> {
  readonly desafioId: string;
  readonly opciones: O;
}

async function guardarDesafio(
  tx: Transaccion,
  p: { tenantId: string; proposito: Proposito; desafio: string; userId?: string | null; deviceId?: string | null; payload?: Prisma.InputJsonObject; ahora: number },
): Promise<string> {
  const fila = await tx.authChallenge.create({
    data: {
      tenantId: p.tenantId,
      purpose: p.proposito,
      challenge: p.desafio,
      userId: p.userId ?? null,
      deviceId: p.deviceId ?? null,
      ...(p.payload ? { payload: p.payload } : {}),
      createdAt: new Date(p.ahora),
      expiresAt: new Date(p.ahora + DESAFIO_MS),
    },
    select: { id: true },
  });
  return fila.id;
}

export interface DesafioGuardado {
  readonly desafio: string;
  readonly userId: string | null;
  readonly deviceId: string | null;
  readonly payload: Prisma.JsonValue | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gasta un desafío: lo devuelve si existe, es de ese propósito, no caducó y nadie lo usó; y lo
 * marca usado en el acto, acierte o no la respuesta. Un desafío no se responde dos veces.
 */
export async function tomarDesafio(
  tx: Transaccion,
  p: { desafioId: unknown; proposito: Proposito; ahora: number },
): Promise<DesafioGuardado | null> {
  if (typeof p.desafioId !== "string" || !UUID.test(p.desafioId)) return null;
  const gastados = await tx.authChallenge.updateMany({
    where: { id: p.desafioId, purpose: p.proposito, usedAt: null, expiresAt: { gt: new Date(p.ahora) } },
    data: { usedAt: new Date(p.ahora) },
  });
  if (gastados.count !== 1) return null;
  const fila = await tx.authChallenge.findUnique({ where: { id: p.desafioId } });
  return fila ? { desafio: fila.challenge, userId: fila.userId, deviceId: fila.deviceId, payload: fila.payload } : null;
}

/**
 * El desafío para REGISTRAR una llave. Se pide que la llave se pueda descubrir sola (sin que el
 * servidor diga de quién es): así, al aprobar un equipo, la llave identifica a su dueña y la
 * pantalla nunca tiene que revelar si una contraseña existe.
 */
export async function desafioDeRegistro(
  tx: Transaccion,
  web: OrigenWeb,
  p: {
    tenantId: string;
    proposito: Extract<Proposito, "INSTALACION" | "ALTA" | "LLAVE">;
    userId: string;
    nombre: string;
    /** `false` en la instalación: la persona todavía no existe y no puede tener llaves. */
    excluirLasSuyas?: boolean;
    payload?: Prisma.InputJsonObject;
    ahora: number;
  },
): Promise<Desafio<OpcionesDeRegistro>> {
  const suyas =
    p.excluirLasSuyas === false
      ? []
      : await tx.passkey.findMany({ where: { userId: p.userId, retiredAt: null }, select: { credentialId: true } });
  const opciones = await generateRegistrationOptions({
    rpName: NOMBRE_DEL_SISTEMA,
    rpID: web.rpId,
    userName: p.nombre,
    userDisplayName: p.nombre,
    userID: new TextEncoder().encode(p.userId),
    attestationType: "none",
    excludeCredentials: suyas.map((l) => ({ id: l.credentialId })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    timeout: DESAFIO_MS,
  });
  const desafioId = await guardarDesafio(tx, {
    tenantId: p.tenantId,
    proposito: p.proposito,
    desafio: opciones.challenge,
    userId: p.userId,
    ...(p.payload ? { payload: p.payload } : {}),
    ahora: p.ahora,
  });
  return { desafioId, opciones };
}

/** Lo que se guarda de una llave recién registrada. */
export interface LlaveNueva {
  readonly credentialId: string;
  readonly publicKey: Uint8Array;
  readonly counter: number;
  readonly transports: string[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Comprueba la respuesta del navegador a un desafío de registro. `null` = no vale. */
export async function verificarRegistro(web: OrigenWeb, desafio: string, respuesta: unknown): Promise<LlaveNueva | null> {
  if (!esObjeto(respuesta) || !esObjeto(respuesta.response)) return null;
  try {
    const r = await verifyRegistrationResponse({
      response: respuesta as unknown as RegistrationResponseJSON,
      expectedChallenge: desafio,
      expectedOrigin: web.origen,
      expectedRPID: web.rpId,
      requireUserVerification: false,
    });
    if (!r.verified) return null;
    const c = r.registrationInfo.credential;
    return { credentialId: c.id, publicKey: c.publicKey, counter: c.counter, transports: [...(c.transports ?? [])] };
  } catch {
    // Una respuesta mal formada o con otra firma lanza: para quien la envió es lo mismo que «no vale».
    return null;
  }
}

/** Guarda una llave verificada a nombre de una persona. */
export async function guardarLlave(
  tx: Transaccion,
  p: { tenantId: string; userId: string; llave: LlaveNueva; etiqueta: string; ahora: number },
): Promise<string> {
  const fila = await tx.passkey.create({
    data: {
      tenantId: p.tenantId,
      userId: p.userId,
      credentialId: p.llave.credentialId,
      publicKey: Buffer.from(p.llave.publicKey),
      counter: BigInt(p.llave.counter),
      transports: p.llave.transports,
      label: p.etiqueta,
      createdAt: new Date(p.ahora),
    },
    select: { id: true },
  });
  return fila.id;
}

/**
 * El desafío para FIRMAR con una llave. Con `userId`, solo valen las de esa persona (elevar una
 * sesión ya abierta); sin él, la llave que responda dirá de quién es (aprobar un equipo).
 */
export async function desafioDeFirma(
  tx: Transaccion,
  web: OrigenWeb,
  p: { tenantId: string; proposito: Extract<Proposito, "ELEVAR" | "APROBAR_EQUIPO">; userId?: string | null; deviceId?: string | null; ahora: number },
): Promise<Desafio<OpcionesDeFirma>> {
  const suyas = p.userId
    ? await tx.passkey.findMany({ where: { userId: p.userId, retiredAt: null }, select: { credentialId: true, transports: true } })
    : [];
  const opciones = await generateAuthenticationOptions({
    rpID: web.rpId,
    allowCredentials: suyas.map((l) => ({ id: l.credentialId, transports: l.transports as AuthenticatorTransport[] })),
    userVerification: "preferred",
    timeout: DESAFIO_MS,
  });
  const desafioId = await guardarDesafio(tx, {
    tenantId: p.tenantId,
    proposito: p.proposito,
    desafio: opciones.challenge,
    userId: p.userId ?? null,
    deviceId: p.deviceId ?? null,
    ahora: p.ahora,
  });
  return { desafioId, opciones };
}

type AuthenticatorTransport = NonNullable<NonNullable<Parameters<typeof generateAuthenticationOptions>[0]["allowCredentials"]>[number]["transports"]>[number];

/** El segundo factor que presenta quien confirma identidad: una firma de su llave o un código. */
export type SegundoFactor =
  | Readonly<{ tipo: "LLAVE"; desafioId: unknown; respuesta: unknown }>
  | Readonly<{ tipo: "CODIGO"; codigo: string }>;

/** Lee lo que mandó la pantalla. Lo que no tenga una de las dos formas es `null`. */
export function leerSegundoFactor(v: unknown): SegundoFactor | null {
  if (!esObjeto(v)) return null;
  if (v.tipo === "LLAVE" && typeof v.desafioId === "string" && esObjeto(v.respuesta)) {
    return { tipo: "LLAVE", desafioId: v.desafioId, respuesta: v.respuesta };
  }
  if (v.tipo === "CODIGO" && typeof v.codigo === "string" && normalizarCodigo(v.codigo) !== null) {
    return { tipo: "CODIGO", codigo: v.codigo };
  }
  return null;
}

/** De quién es el factor presentado, y cómo dejar constancia de que se usó. */
export interface FactorReconocido {
  readonly userId: string;
  readonly tipo: SegundoFactor["tipo"];
  /** Se llama solo si TODO lo demás también vale (la contraseña): gasta el código o anota el uso de la llave. */
  consumir(): Promise<void>;
}

/**
 * Comprueba un segundo factor. Devuelve de quién es, o `null` si no vale. Con `userId`, tiene que
 * ser de esa persona. El desafío de una llave se gasta aquí, valga o no la firma; un código solo
 * se gasta al `consumir()`, para que una contraseña mal tecleada no le cueste uno de sus diez.
 */
export async function reconocerFactor(
  tx: Transaccion,
  web: OrigenWeb,
  p: { factor: SegundoFactor; proposito: Extract<Proposito, "ELEVAR" | "APROBAR_EQUIPO">; userId?: string | null; deviceId?: string | null; ahora: number },
): Promise<FactorReconocido | null> {
  if (p.factor.tipo === "CODIGO") {
    const codigo = normalizarCodigo(p.factor.codigo);
    if (codigo === null) return null;
    const fila = await tx.recoveryCode.findUnique({ where: { codeHash: huella(codigo) } });
    if (!fila || fila.usedAt || fila.retiredAt) return null;
    if (p.userId && fila.userId !== p.userId) return null;
    return {
      userId: fila.userId,
      tipo: "CODIGO",
      async consumir() {
        // `updateMany` con la condición: si dos peticiones lo presentan a la vez, solo una lo gasta.
        const r = await tx.recoveryCode.updateMany({ where: { id: fila.id, usedAt: null, retiredAt: null }, data: { usedAt: new Date(p.ahora) } });
        if (r.count !== 1) throw new Error("El código de recuperación ya se había usado.");
      },
    };
  }

  const d = await tomarDesafio(tx, { desafioId: p.factor.desafioId, proposito: p.proposito, ahora: p.ahora });
  if (!d) return null;
  // El desafío se pidió para una persona o un equipo concretos: no vale para otros.
  if ((d.userId ?? null) !== (p.userId ?? null) || (d.deviceId ?? null) !== (p.deviceId ?? null)) return null;
  const respuesta = p.factor.respuesta;
  if (!esObjeto(respuesta) || typeof respuesta.id !== "string" || !esObjeto(respuesta.response)) return null;
  const llave = await tx.passkey.findUnique({ where: { credentialId: respuesta.id } });
  if (!llave || llave.retiredAt) return null;
  if (p.userId && llave.userId !== p.userId) return null;
  let contador: number;
  try {
    const r = await verifyAuthenticationResponse({
      response: respuesta as unknown as AuthenticationResponseJSON,
      expectedChallenge: d.desafio,
      expectedOrigin: web.origen,
      expectedRPID: web.rpId,
      credential: {
        id: llave.credentialId,
        publicKey: new Uint8Array(llave.publicKey),
        counter: Number(llave.counter),
        transports: llave.transports as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });
    if (!r.verified) return null;
    contador = r.authenticationInfo.newCounter;
  } catch {
    // Firma de otra llave, contador que retrocede (posible copia) o respuesta mal formada.
    return null;
  }
  return {
    userId: llave.userId,
    tipo: "LLAVE",
    async consumir() {
      await tx.passkey.update({ where: { id: llave.id }, data: { counter: BigInt(contador), lastUsedAt: new Date(p.ahora) } });
    },
  };
}

/** Sin 0/O ni 1/I: se copian de un papel sin dudar. 32 símbolos, 5 bits cada uno. */
const SIMBOLOS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LARGO_DEL_CODIGO = 10;

/** `K7F2Q-X9B3M`: diez símbolos (50 bits), en dos grupos para leerlos. */
export function nuevoCodigo(): string {
  let t = "";
  for (let i = 0; i < LARGO_DEL_CODIGO; i++) t += SIMBOLOS[randomInt(0, SIMBOLOS.length)];
  return `${t.slice(0, 5)}-${t.slice(5)}`;
}

/** El código como se guarda su huella: sin guion ni espacios y en mayúsculas. `null` si no tiene la forma. */
export function normalizarCodigo(texto: string): string | null {
  const t = texto.replace(/[\s-]/g, "").toUpperCase();
  if (t.length !== LARGO_DEL_CODIGO) return null;
  for (const c of t) if (!SIMBOLOS.includes(c)) return null;
  return t;
}

/**
 * Da a una persona un juego nuevo de códigos de recuperación y retira los que le quedaran.
 * Devuelve los diez EN CLARO: es la única vez que existen fuera de un papel.
 */
export async function reponerCodigos(tx: Transaccion, p: { tenantId: string; userId: string; ahora: number }): Promise<string[]> {
  await tx.recoveryCode.updateMany({ where: { userId: p.userId, usedAt: null, retiredAt: null }, data: { retiredAt: new Date(p.ahora) } });
  const codigos = Array.from({ length: CODIGOS_DE_RECUPERACION }, nuevoCodigo);
  await tx.recoveryCode.createMany({
    data: codigos.map((c) => ({ tenantId: p.tenantId, userId: p.userId, codeHash: huella(normalizarCodigo(c)!), createdAt: new Date(p.ahora) })),
  });
  return codigos;
}

/** Retira todas las llaves vigentes de una persona (al reponer sus credenciales). No las borra. */
export async function retirarLlaves(tx: Transaccion, p: { userId: string; ahora: number }): Promise<number> {
  const r = await tx.passkey.updateMany({ where: { userId: p.userId, retiredAt: null }, data: { retiredAt: new Date(p.ahora) } });
  return r.count;
}
