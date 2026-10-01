/**
 * El plano del local que se publica — F6-01, F6-02 (I-05).
 *
 * La geometría (mesas dentro de las paredes, sin encimarse, números distintos en el salón) la valida
 * el contrato. Aquí va lo que necesita la versión anterior y el servicio en curso:
 *
 *  1. **Una mesa no desaparece** (regla 5): los pedidos y los cobros del pasado la nombran. Se retira.
 *  2. **Una mesa con su cuenta abierta no se retira**: la familia que está sentada en ella se quedaría
 *     sin mesa a la que llevar el plato ni cuenta que cobrar.
 *
 * Puro: sin reloj ni E/S. Las mesas ocupadas entran como argumento.
 */

export type MesaDelPlano = Readonly<{ id: string; label: string; retiredAt?: string | undefined }>;

export type ProblemaDePlano = Readonly<
  { problema: "MESA_DESAPARECE"; mesa: string } | { problema: "MESA_OCUPADA"; mesa: string }
>;

/**
 * ¿Se puede publicar `despues` sobre `antes`? `ocupadas`: las mesas con una cuenta abierta. `null`
 * si se puede; si no, la primera mesa que lo impide, con su número.
 */
export function cambioDePlanoProblem(
  antes: readonly MesaDelPlano[] | null,
  despues: readonly MesaDelPlano[],
  ocupadas: ReadonlySet<string>,
): ProblemaDePlano | null {
  const nuevas = new Map(despues.map((m) => [m.id, m]));
  for (const m of antes ?? []) {
    if (!nuevas.has(m.id)) return { problema: "MESA_DESAPARECE", mesa: m.label };
  }
  for (const m of despues) {
    if (m.retiredAt !== undefined && ocupadas.has(m.id)) return { problema: "MESA_OCUPADA", mesa: m.label };
  }
  return null;
}

/** Las mesas que se acaban de retirar en este cambio (la hora de retirarlas la pone el servidor). */
export function mesasRetiradas(antes: readonly MesaDelPlano[] | null, despues: readonly MesaDelPlano[]): string[] {
  const yaRetiradas = new Set((antes ?? []).filter((m) => m.retiredAt !== undefined).map((m) => m.id));
  return despues.filter((m) => m.retiredAt !== undefined && !yaRetiradas.has(m.id)).map((m) => m.id);
}
