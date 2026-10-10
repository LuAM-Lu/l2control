/**
 * El vuelto: ¿alcanza la gaveta? — B3-19 (M-37, U-12).
 *
 * La caja propone cómo dar el vuelto (los dólares enteros en billetes y los centavos en bolívares) y avisa si en la
 * gaveta no hay bastante de esa moneda, según lo esperado del turno de este equipo: el fondo más lo que entró menos lo
 * que salió. Solo dice qué monedas no alcanzan, nunca cuánto hay: el arqueo es a ciegas (F4-05).
 */
import { AlcanzaLaGavetaSchema, problemasDe, type GavetaAlcanzaDto, type Resultado } from "@l2/contracts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { exigirPermiso } from "../identidad/actor.ts";
import { esperadoEnGaveta } from "./gaveta.ts";
import { turnoParaCobrar } from "./turnos.ts";

export interface CasosVuelto {
  /** Qué monedas de estas salidas no alcanzan en la gaveta del turno de este equipo (`AlcanzaLaGavetaSchema`). */
  alcanza(ctx: Contexto, entrada: unknown): Promise<Resultado<GavetaAlcanzaDto>>;
}

export function casosVuelto(base: Base): CasosVuelto {
  return {
    async alcanza(ctx, entrada) {
      const v = AlcanzaLaGavetaSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se pudo mirar la gaveta.", problemas: problemasDe(v.error) };
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<GavetaAlcanzaDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const turno = await turnoParaCobrar(tx, ctx);
        if ("ok" in turno) return turno;
        const hay = await esperadoEnGaveta(tx, turno.id);
        const sale = new Map<"USD" | "VES", bigint>();
        for (const s of v.data.salidas) {
          if (s.currency !== "USD" && s.currency !== "VES") continue;
          sale.set(s.currency, (sale.get(s.currency) ?? 0n) + BigInt(s.minor));
        }
        const faltan = [...sale].filter(([c, n]) => n > (hay.get(c)?.amount ?? 0n)).map(([c]) => c);
        return { ok: true, valor: { faltan } };
      });
    },
  };
}
