/**
 * A quién se emite la factura — DEC-23 (D14 de UX-MEJORAS).
 *
 * Por defecto, **Consumidor final**: en un parque con cola nadie debería
 * teclear una cédula para un jugo. Cuando el cliente la pide a su nombre o al
 * de su empresa, se identifica con cédula o RIF y nombre o razón social.
 *
 * Unión discriminada: una factura «identificada» sin documento no se puede
 * expresar. Los requisitos fiscales exactos (domicilio fiscal para
 * contribuyentes, formato de la máquina fiscal) los confirma el contador
 * (DEC-1): por eso la dirección fiscal es opcional aquí y no se inventa.
 */
import { z } from "zod";
import { DocumentoVeSchema } from "./pagos.ts";

export const ClienteFacturaSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CONSUMIDOR_FINAL") }),
  z.object({
    kind: z.literal("IDENTIFICADO"),
    /** Cédula (V-, E-) o RIF (J-, G-, P-). */
    document: DocumentoVeSchema,
    /** Nombre de la persona o razón social de la empresa. */
    name: z.string().trim().min(2, "Escribe el nombre o la razón social").max(120),
    fiscalAddress: z.string().trim().max(200).optional(),
  }),
]);
export type ClienteFacturaDto = z.infer<typeof ClienteFacturaSchema>;

export const CONSUMIDOR_FINAL: ClienteFacturaDto = Object.freeze({ kind: "CONSUMIDOR_FINAL" });
