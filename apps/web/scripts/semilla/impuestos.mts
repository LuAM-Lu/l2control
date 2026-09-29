/**
 * Las alícuotas de trabajo para desarrollo (B2-2). **No son una afirmación sobre la normativa**:
 * las confirma el contador (DEC-1) y se cambian en Panel → Ajustes → Impuestos, sin
 * desplegar. Lo exento no va: es cero por definición.
 */
export const IMPUESTOS_DE_TRABAJO = [
  { impuesto: "IVA", code: "GENERAL", basisPoints: 1600 },
  // El IVA reducido no se usa en el local (v0.30.1) y el IGTF no se cobra por ahora (V-13): al 0 %,
  // con el motor listo para cuando vuelva.
  { impuesto: "IGTF", code: null, basisPoints: 0 },
] as const;
