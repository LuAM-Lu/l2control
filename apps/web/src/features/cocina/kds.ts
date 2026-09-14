/**
 * Lo que ve la cocina, calculado del estado del local — F6-07.
 *
 * Funciones puras: el instante entra como argumento (ADR-010). La pantalla
 * solo pinta lo que sale de aquí.
 */
import { nivelEspera, type NivelEspera, type UmbralEspera } from "@l2/domain-orders";
import type { EstadoLocal, Pedido } from "../simulacion/proyeccion.ts";

export type Comanda = Readonly<{
  pedido: Pedido;
  mesa: string;
  /** Desde que se envió, en ms. Lo que espera la mesa, no lo que lleva la cocina. */
  esperaMs: number;
  nivel: NivelEspera;
}>;

export type VistaCocina = Readonly<{
  /** Anuladas que la cocina ya tenía en sus manos y todavía no confirmó. Van primero. */
  anulaciones: readonly Comanda[];
  /** En cola y en preparación, de la más antigua a la más nueva. */
  comandas: readonly Comanda[];
  /** Listas esperando al mesero, de la que más lleva lista a la que menos. */
  listas: readonly (Comanda & { listaMs: number })[];
  enCola: number;
  enPreparacion: number;
  /** La comanda viva que más espera, o `null` si no hay ninguna. */
  masAntigua: Comanda | null;
  sinTicket: number;
}>;

export function vistaCocina(estado: EstadoLocal, ahora: number, umbral: UmbralEspera): VistaCocina {
  const comanda = (p: Pedido): Comanda => {
    const esperaMs = ahora > 0 ? Math.max(0, ahora - Date.parse(p.enviadoEn)) : 0;
    return {
      pedido: p,
      mesa: estado.etiquetasMesa[p.tableId] ?? "?",
      esperaMs,
      nivel: nivelEspera(esperaMs, umbral),
    };
  };
  const porAntiguedad = (a: Pedido, b: Pedido) => Date.parse(a.enviadoEn) - Date.parse(b.enviadoEn);
  const todos = Object.values(estado.pedidos);

  const vivas = todos
    .filter((p) => p.estado === "ENVIADO" || p.estado === "EN_PREPARACION")
    .sort(porAntiguedad)
    .map(comanda);

  const anulaciones = todos
    .filter((p) => p.estado === "ANULADO" && p.anulacion?.confirmar && !p.anulacion.vistaPor)
    .sort((a, b) => Date.parse(a.anulacion!.en) - Date.parse(b.anulacion!.en))
    .map(comanda);

  const listas = todos
    .filter((p) => p.estado === "LISTO")
    .sort((a, b) => Date.parse(a.listoEn ?? a.cambioEn) - Date.parse(b.listoEn ?? b.cambioEn))
    .map((p) => ({ ...comanda(p), listaMs: ahora > 0 ? Math.max(0, ahora - Date.parse(p.listoEn ?? p.cambioEn)) : 0 }));

  return {
    anulaciones,
    comandas: vivas,
    listas,
    enCola: vivas.filter((c) => c.pedido.estado === "ENVIADO").length,
    enPreparacion: vivas.filter((c) => c.pedido.estado === "EN_PREPARACION").length,
    masAntigua: vivas[0] ?? null,
    sinTicket: vivas.filter((c) => !c.pedido.impreso).length,
  };
}

/** «12:05» o «1:02:05»: lo que se lee en un cronómetro de cocina. */
export function cronometro(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}
