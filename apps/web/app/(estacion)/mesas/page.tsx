import { MesasScreen } from "../../../src/features/mesas/MesasScreen";
import { catalogoDelLocal } from "../../../src/features/inventario/productos.servidor";

/**
 * Estación del mesero: plano de mesas y pedidos (F6-01…F6-05, DEC-22).
 *
 * El plano llega con el layout y la carta es el catálogo, leído aquí en el servidor (B6-1); cuando
 * cambia (tema `catalogo`), el canal en vivo repinta la página. El estado de cada mesa y los pedidos
 * viajan por el bus del local hasta B6-2 y B6-3.
 */
export default async function MesasPage() {
  return <MesasScreen catalogo={await catalogoDelLocal()} />;
}
