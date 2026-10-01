/**
 * Cómo se dicen los descuentos en pantalla y en el recibo (B3-6). Lo comparten Ajustes → Descuentos,
 * el directorio de familias, la caja, el recibo y las excepciones: en ninguno se enseña
 * `CLIENTE_FRECUENTE` ni «1000 puntos básicos» a una persona.
 */
import type { AlcanceDescuentoDto, DescuentoAplicadoDto, MotivoDescuento, OrigenDescuento, ValorDescuentoDto } from "@l2/contracts";
import { money, toMajor } from "@l2/domain-money";
import { percentFromBasisPoints } from "@l2/domain-tax";
import { formatMoneyVE } from "@l2/ui";

export const TEXTO_ORIGEN: Readonly<Record<OrigenDescuento, string>> = {
  MEDIO: "Por medio de pago",
  VIP: "Familia VIP",
  MANUAL: "Manual",
  ADMIN: "De administración",
};

export const MOTIVOS_DESCUENTO: readonly { id: MotivoDescuento; texto: string }[] = [
  { id: "CLIENTE_FRECUENTE", texto: "Cliente frecuente" },
  { id: "COMPENSACION", texto: "Compensación" },
  { id: "PROMOCION", texto: "Promoción" },
  { id: "OTRO", texto: "Otro" },
];

/** «10 %» o «$ 2,00». */
export function textoValor(v: ValorDescuentoDto): string {
  return v.tipo === "PORCENTAJE" ? `${percentFromBasisPoints(v.basisPoints)} %` : formatMoneyVE(toMajor(money(BigInt(v.monto.minor), "USD")), "USD");
}

/** «toda la cuenta», «el parque», «Bebidas y Snacks». */
export function textoAlcance(a: AlcanceDescuentoDto): string {
  switch (a.tipo) {
    case "CUENTA":
      return "toda la cuenta";
    case "PARQUE":
      return "el parque";
    case "RESTAURANTE":
      return "el restaurante";
    case "CATEGORIAS":
      return a.categorias.length === 1 ? a.categorias[0]! : `${a.categorias.slice(0, -1).join(", ")} y ${a.categorias.at(-1)}`;
  }
}

/** «Pago con Zelle · 10 % sobre toda la cuenta»: lo que se lee en el ticket y en el recibo. */
export function etiquetaDescuento(d: Pick<DescuentoAplicadoDto, "nombre" | "valor" | "alcance">): string {
  return `${d.nombre} · ${textoValor(d.valor)}${d.alcance.tipo === "CUENTA" ? "" : ` sobre ${textoAlcance(d.alcance)}`}`;
}
