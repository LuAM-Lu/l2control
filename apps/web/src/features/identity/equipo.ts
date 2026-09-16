/**
 * Aplicar un cambio al equipo — F2-11.
 *
 * El QUÉ pasa cuando se da de alta, de baja, se cambia un rol o se repone un
 * PIN. El SI SE PUEDE lo decide `revisarCambio` en `@l2/domain-identity`, y
 * la FORMA del comando, el contrato. Aquí solo se junta lo tres y se devuelve
 * el directorio nuevo.
 *
 * Funciones puras: entran la lista, el comando, el autor y el instante; sale
 * otra lista. Sin `Date.now()` y sin estado, para que el día que esto sea una
 * llamada al servidor lo único que cambie sea quién la ejecuta.
 *
 * **Nada se borra** (regla 5): una baja no saca a nadie del directorio, le
 * pone `active: false` y le añade su asiento en `changes`.
 */
import { UserSummarySchema, type UserCommand, type UserSummaryDto } from "@l2/contracts";
import { revisarCambio, type Actor, type PersonaDelEquipo } from "@l2/domain-identity";

export type Autor = Readonly<{ id: string; nombre: string }>;

export type Resultado =
  | Readonly<{ ok: true; usuarios: readonly UserSummaryDto[]; mensaje: string }>
  | Readonly<{ ok: false; motivo: string }>;

const aPersona = (u: UserSummaryDto): PersonaDelEquipo => ({
  id: u.id,
  role: u.role,
  active: u.active,
});

/**
 * Identificador de una persona nueva.
 *
 * Se deriva del nombre y del instante porque no hay servidor que lo asigne.
 * TODO(F2-11/backend): lo genera la base de datos, y esta función desaparece.
 */
function idDesde(nombre: string, ahora: number): string {
  const raiz = nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  // El instante entero, no sus últimas cifras: recortado a cuatro, el sufijo se
  // repetía cada 36⁴ ms (unos 28 minutos). Hallazgo de la obrera Gemini.
  return `u-${raiz || "persona"}-${ahora.toString(36)}`;
}

/**
 * Un resultado que no cumple el contrato se DEVUELVE como negativa, no se lanza.
 *
 * Quien llama es el clic de un botón, sin `try`: una excepción ahí deja la
 * pantalla igual y sin decir nada, que es el error invisible que prohíbe §8.6
 * (ya pasó con el cobro de una cuenta sin dividir). Hallazgo de la obrera Gemini.
 */
const SIN_CONTRATO = "El cambio no se pudo guardar: los datos resultantes no cumplen el contrato.";

export function aplicarComando({
  usuarios,
  comando,
  autor,
  actor,
  branchId,
  ahora,
}: {
  usuarios: readonly UserSummaryDto[];
  comando: UserCommand;
  autor: Autor;
  actor: Actor;
  branchId: string;
  ahora: number;
}): Resultado {
  const equipo = usuarios.map(aPersona);

  const cambio =
    comando.kind === "ALTA"
      ? ({ kind: "ALTA", role: comando.role } as const)
      : comando.kind === "ROL"
        ? ({ kind: "ROL", userId: comando.userId, role: comando.role } as const)
        : ({ kind: comando.kind, userId: comando.userId } as const);

  const veredicto = revisarCambio({ equipo, autor: actor, cambio, branchId });
  if (!veredicto.ok) return { ok: false, motivo: veredicto.motivo };

  // TODO(F2-11/backend): el autor y la hora los pone el servidor al registrar
  // el cambio; el comando no los lleva (ver el contrato).
  const rastro = {
    by: autor.id,
    byName: autor.nombre,
    reason: comando.reason,
    at: new Date(ahora).toISOString(),
  };

  if (comando.kind === "ALTA") {
    const r = UserSummarySchema.safeParse({
      id: idDesde(comando.fullName, ahora),
      fullName: comando.fullName,
      role: comando.role,
      branchIds: comando.branchIds,
      active: true,
      exceptions: [],
      changes: [{ kind: "ALTA", role: comando.role, ...rastro }],
    });
    if (!r.success) return { ok: false, motivo: SIN_CONTRATO };
    const nueva = r.data;
    return {
      ok: true,
      usuarios: [...usuarios, nueva],
      mensaje: `${nueva.fullName} entra al equipo.`,
    };
  }

  const previa = usuarios.find((u) => u.id === comando.userId);
  // `revisarCambio` ya lo comprobó; esto es el cinturón del tirante.
  if (!previa) return { ok: false, motivo: "Esa persona no está en el equipo." };

  const conCambio = (
    parche: Partial<UserSummaryDto>,
    asiento: UserSummaryDto["changes"][number],
    mensaje: string,
  ): Resultado => {
    const r = UserSummarySchema.safeParse({
      ...previa,
      ...parche,
      // Lo más reciente primero: es lo que se lee.
      changes: [asiento, ...previa.changes],
    });
    if (!r.success) return { ok: false, motivo: SIN_CONTRATO };
    const siguiente = r.data;
    return {
      ok: true,
      usuarios: usuarios.map((u) => (u.id === siguiente.id ? siguiente : u)),
      mensaje,
    };
  };

  const nombre = previa.fullName.split(" ")[0] ?? previa.fullName;

  switch (comando.kind) {
    case "BAJA":
      return conCambio(
        { active: false },
        { kind: "BAJA", ...rastro },
        `${previa.fullName} queda de baja. No se borra: su historia se conserva.`,
      );

    case "REINGRESO":
      return conCambio(
        { active: true },
        { kind: "REINGRESO", ...rastro },
        `${previa.fullName} vuelve al equipo.`,
      );

    case "ROL":
      return conCambio(
        { role: comando.role },
        { kind: "ROL", from: previa.role, to: comando.role, ...rastro },
        `${nombre} cambia de rol.`,
      );

    case "PIN":
      // El PIN no vive aquí: el servidor lo repone y la persona lo estrena en
      // su siguiente acceso. Lo único que queda en el directorio es el asiento.
      return conCambio(
        {},
        { kind: "PIN", ...rastro },
        `PIN repuesto: ${nombre} elegirá uno nuevo al entrar.`,
      );

    default:
      return { ok: false, motivo: "Ese cambio no está contemplado." };
  }
}
