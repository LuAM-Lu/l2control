/**
 * Las alícuotas de trabajo para desarrollo (B2-2). **No son una afirmación sobre la normativa**:
 * las confirma el contador (DEC-1) y se cambian en Panel → Ajustes → Impuestos, sin
 * desplegar. Lo exento no va: es cero por definición.
 */
export const IMPUESTOS_DE_TRABAJO = [
  { impuesto: "IVA", code: "GENERAL", basisPoints: 1600 },
  { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800 },
  { impuesto: "IGTF", code: null, basisPoints: 300 },
] as const;
