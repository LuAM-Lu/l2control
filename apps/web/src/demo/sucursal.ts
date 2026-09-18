import { AjustesSucursalSchema, type AjustesSucursalDto } from "@l2/contracts";

/**
 * Datos inventados hasta F0-04.
 *
 * El residuo (maxRetenido) equivale a $0.05, valor que usaba la caja antes de 
 * moverlo a los ajustes de sucursal.
 */
export const AJUSTES_DEMO: AjustesSucursalDto = AjustesSucursalSchema.parse({
  branchId: "b1",
  nombre: "Abby Kingdom",
  rif: "J-40123456-7",
  direccionFiscal: "Calle Real, Caracas, Venezuela",
  monedaFuncional: "USD",
  formatoHora: "12h",
  horario: [
    { dia: "LUNES", kind: "ABIERTO", abre: "10:00", cierra: "20:00" },
    { dia: "MARTES", kind: "ABIERTO", abre: "10:00", cierra: "20:00" },
    { dia: "MIERCOLES", kind: "ABIERTO", abre: "10:00", cierra: "20:00" },
    { dia: "JUEVES", kind: "ABIERTO", abre: "10:00", cierra: "20:00" },
    { dia: "VIERNES", kind: "ABIERTO", abre: "10:00", cierra: "20:00" },
    { dia: "SABADO", kind: "ABIERTO", abre: "10:00", cierra: "20:00" },
    { dia: "DOMINGO", kind: "CERRADO" },
  ],
  maxRetenido: { minor: "5", currency: "USD" },
  servicio: { kind: "SIN_SERVICIO" },
});
