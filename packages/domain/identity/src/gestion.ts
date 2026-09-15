/**
 * Gestión de las personas del equipo — F2-11, DEC-15, §7.3.
 *
 * Dar de alta, dar de baja, reingresar, cambiar el rol y reponer el PIN. Aquí
 * se decide **si se puede**, no se hace: guardar es del servidor, y registrar
 * quién lo hizo es auditoría (F2-07). Puro y sin reloj, como todo el paquete.
 *
 * LAS CINCO PUERTAS, Y POR QUÉ CADA UNA
 *
 * Una pantalla de usuarios es la llave del sistema entero: quien pueda cambiar
 * roles puede darse a sí mismo todo lo demás. Por eso se niega por defecto y
 * cada permiso se argumenta:
 *
 *  1. **Solo quien alcanza `usuarios.gestionar` en esa sucursal.** Es la matriz,
 *     no una lista de roles: una concesión de DEC-15 también abre la puerta.
 *  2. **Nadie se da de baja a sí mismo.** Te quedarías fuera del sistema con el
 *     que ibas a arreglarlo, y no es un error que se pueda deshacer desde dentro.
 *  3. **Nadie se cambia el rol a sí mismo.** Es la escalada de privilegios
 *     clásica; el cambio lo pide otra persona con poder para dárselo.
 *  4. **El local no se queda sin administración.** Dar de baja —o degradar— al
 *     último administrador activo deja un sistema que nadie puede gobernar.
 *  5. **Administrador solo lo nombra un administrador.** Aunque a alguien se le
 *     haya concedido gestionar usuarios por excepción, fabricar administradores
 *     queda reservado a quien ya lo es.
 *
 * Todo lo que no encaje en una regla escrita aquí se NIEGA (§7.3, fail-closed).
 */
import { can, type Actor, type Role } from "./permissions.ts";

/** Lo mínimo que hace falta saber de una persona para juzgar un cambio. */
export type PersonaDelEquipo = Readonly<{
  id: string;
  role: Role;
  active: boolean;
}>;

/**
 * Lo que se quiere hacer.
 *
 * `ALTA` no lleva `userId` porque la persona todavía no existe; las demás sí, y
 * el motivo va aparte: aquí se decide, no se registra.
 */
export type CambioDeEquipo =
  | Readonly<{ kind: "ALTA"; role: Role }>
  | Readonly<{ kind: "BAJA"; userId: string }>
  | Readonly<{ kind: "REINGRESO"; userId: string }>
  | Readonly<{ kind: "ROL"; userId: string; role: Role }>
  | Readonly<{ kind: "PIN"; userId: string }>;

export type Veredicto = Readonly<{ ok: true }> | Readonly<{ ok: false; motivo: string }>;

const NO = (motivo: string): Veredicto => ({ ok: false, motivo });
const SI: Veredicto = { ok: true };

/** Cuántas personas con rol de administración siguen activas. */
export function administradoresActivos(equipo: readonly PersonaDelEquipo[]): number {
  return equipo.filter((p) => p.active && p.role === "ADMIN").length;
}

/**
 * ¿Puede `autor` hacer este cambio sobre este equipo, en esta sucursal?
 *
 * Devuelve el motivo en castellano cuando no, porque esa frase es lo que ve
 * quien lo intentó: «no tienes permiso» sin decir cuál obliga a adivinar.
 */
export function revisarCambio({
  equipo,
  autor,
  cambio,
  branchId,
}: {
  equipo: readonly PersonaDelEquipo[];
  autor: Actor;
  cambio: CambioDeEquipo;
  branchId: string;
}): Veredicto {
  // 1 · la puerta de la matriz
  if (can(autor, "usuarios.gestionar", { branchId }) !== "PERMITIDO") {
    return NO("No tienes permiso para gestionar personas en esta sucursal.");
  }

  // 5 · administrador solo lo nombra un administrador
  const nombraAdmin =
    (cambio.kind === "ALTA" || cambio.kind === "ROL") && cambio.role === "ADMIN";
  if (nombraAdmin && autor.role !== "ADMIN") {
    return NO("Solo la administración puede nombrar a otro administrador.");
  }

  if (cambio.kind === "ALTA") return SI;

  const persona = equipo.find((p) => p.id === cambio.userId);
  if (!persona) return NO("Esa persona no está en el equipo.");

  // 2 y 3 · sobre uno mismo
  const esUnoMismo = persona.id === autor.id;
  if (esUnoMismo && cambio.kind === "BAJA") {
    return NO("No puedes darte de baja a ti misma: pide que lo haga otra persona.");
  }
  if (esUnoMismo && cambio.kind === "ROL") {
    return NO("No puedes cambiarte el rol a ti misma: pide que lo haga otra persona.");
  }

  switch (cambio.kind) {
    case "BAJA": {
      if (!persona.active) return NO("Esa persona ya está de baja.");
      // 4 · el local no se queda sin administración
      if (persona.role === "ADMIN" && administradoresActivos(equipo) <= 1) {
        return NO("Es la única administración activa: nombra a otra antes de darla de baja.");
      }
      return SI;
    }

    case "REINGRESO":
      return persona.active ? NO("Esa persona ya está activa.") : SI;

    case "ROL": {
      if (!persona.active) return NO("Dale de alta otra vez antes de cambiarle el rol.");
      if (persona.role === cambio.role) return NO("Ya tiene ese rol.");
      // 4 · degradar al último administrador es quedarse sin administración
      if (persona.role === "ADMIN" && administradoresActivos(equipo) <= 1) {
        return NO("Es la única administración activa: nombra a otra antes de cambiarle el rol.");
      }
      return SI;
    }

    case "PIN":
      // Reponer el PIN de alguien de baja no tiene sentido: no puede entrar.
      return persona.active ? SI : NO("Esa persona está de baja: no puede entrar con un PIN nuevo.");

    default:
      // Un cambio que esta función no conoce se niega, no se deja pasar.
      return NO("Ese cambio no está contemplado.");
  }
}
