/**
 * Lo que cuesta quedarse más (B4-22, M-41): el tope sano del tiempo de más.
 *
 * Pasada la gracia, el tiempo de más va por bloques del paquete más chico y sin tope; antes, «Más tiempo» sube de paquete
 * pagando solo la diferencia. Esto dice las dos cosas para que la monitora se las ofrezca a la familia antes de que se
 * pase: el aviso de por vencer y la ficha del niño las enseñan. Las cuentas son del dominio (§9.7); aquí solo se dicen.
 */
import type { MonitorSnapshotDto, PricePackageDto } from "@l2/contracts";
import { money, toMajor } from "@l2/domain-money";
import { bloqueDelTiempoDeMas, fixed, openEnded, primeraSubida, type PaqueteDeUso } from "@l2/domain-park";
import { formatMoneyVE } from "@l2/ui";
import { contratadoDeEstancia, tarifaDeEstancia } from "./settlement.ts";

export type Quedarse = Readonly<{
  /** «a 1 hora, $ 2,00 más»; `null` si ya tiene el paquete más largo de tiempo fijo. */
  subir: string | null;
  /** «$ 3,00 cada 30 min»; `null` si su regla es con tope (la de antes de B4-22) o su tarifa no tiene paquetes fijos. */
  pasarse: string | null;
}>;

/** Un importe o unos minutos que no se parten en dos renglones (en el teléfono, «$» quedaba solo al final de uno). */
const junto = (s: string) => s.replace(/ /g, " ");
const usd = (m: Parameters<typeof toMajor>[0]) => junto(formatMoneyVE(toMajor(m), "USD"));

/** Lo que cuesta quedarse más para una estancia de tiempo fijo; `null` si es de tiempo abierto (no vence). */
export function quedarseMas(estancia: MonitorSnapshotDto["sessions"][number], aLaVenta: readonly PricePackageDto[]): Quedarse | null {
  if (estancia.duration.kind !== "fixed") return null;
  const paquetes: PaqueteDeUso[] = aLaVenta
    .filter((p) => p.active)
    .map((p) => ({ name: p.name, duration: p.duration.kind === "fixed" ? fixed(p.duration.minutes) : openEnded, price: money(BigInt(p.price.minor), p.price.currency) }));
  const sube = primeraSubida({ minutos: estancia.duration.minutes, contratado: contratadoDeEstancia(estancia) }, paquetes);
  const bloque = estancia.terms.tiempoDeMas === "POR_BLOQUES" ? bloqueDelTiempoDeMas(tarifaDeEstancia(estancia), "USD") : null;
  return {
    subir: sube ? `a ${sube.paquete}, ${usd(sube.diferencia)} más` : null,
    pasarse: bloque ? `${usd(bloque.precio)} cada ${junto(`${bloque.minutos} min`)}` : null,
  };
}

/** La frase entera: «Si se queda: a 1 hora, $ 2,00 más. Si se pasa sin subir: $ 3,00 cada 30 min.» */
export function fraseParaQuedarse(q: Quedarse): string | null {
  const partes = [q.subir ? `Si se queda: ${q.subir}.` : null, q.pasarse ? `Si se pasa${q.subir ? " sin subir" : ""}: ${q.pasarse}.` : null];
  const frase = partes.filter(Boolean).join(" ");
  return frase || null;
}
