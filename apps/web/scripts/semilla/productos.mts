/**
 * El catálogo de mostrador de desarrollo (B9-1): inventado, para que la caja local venda algo. Los
 * productos y precios reales los carga el cliente en Panel → Inventario → Productos (F0-04).
 * Producción nace sin productos (M-12).
 */
export const PRODUCTOS_DE_DESARROLLO = [
  { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", controlaStock: true, precioMinor: "100" },
  { nombre: "Malta", categoria: "Bebidas", taxCode: "GENERAL", controlaStock: true, precioMinor: "150" },
  { nombre: "Refresco lata", categoria: "Bebidas", taxCode: "GENERAL", controlaStock: true, precioMinor: "150" },
  { nombre: "Jugo natural", categoria: "Bebidas", taxCode: "GENERAL", controlaStock: false, precioMinor: "250" },
  { nombre: "Tostones de plátano", categoria: "Snacks", taxCode: "GENERAL", controlaStock: true, precioMinor: "120" },
  { nombre: "Papas fritas", categoria: "Snacks", taxCode: "GENERAL", controlaStock: false, precioMinor: "350" },
  { nombre: "Tequeños (ración)", categoria: "Snacks", taxCode: "GENERAL", controlaStock: false, precioMinor: "500" },
  { nombre: "Galletas", categoria: "Golosinas", taxCode: "GENERAL", controlaStock: true, precioMinor: "120" },
  { nombre: "Chocolate", categoria: "Golosinas", taxCode: "GENERAL", controlaStock: true, precioMinor: "150" },
  { nombre: "Gomitas", categoria: "Golosinas", taxCode: "GENERAL", controlaStock: true, precioMinor: "80" },
  { nombre: "Café americano", categoria: "Café", taxCode: "GENERAL", controlaStock: false, precioMinor: "100" },
  { nombre: "Café con leche", categoria: "Café", taxCode: "GENERAL", controlaStock: false, precioMinor: "150" },
] as const;
