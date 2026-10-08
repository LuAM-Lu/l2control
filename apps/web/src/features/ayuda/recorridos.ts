/**
 * Los recorridos guiados de cada pantalla de operación — T-12 (M-27, P-4).
 *
 * Cada paso señala un elemento con `data-recorrido="…"` en su pantalla. Un recorrido se enseña solo la primera vez
 * que una persona abre la pantalla (lo guarda el servidor, por persona) y a petición desde la ayuda. Si un recorrido
 * cambia de forma que valga la pena volver a enseñarlo, sube su `version`. Un paso cuyo elemento no está en pantalla
 * (otro rol, el teléfono) se salta solo.
 */
import type { PasoDeRecorrido } from "@l2/ui";

export type RecorridoDePantalla = Readonly<{ id: string; version: number; ruta: string; pasos: readonly PasoDeRecorrido[] }>;

const en = (nombre: string) => `[data-recorrido="${nombre}"]`;

export const RECORRIDOS: readonly RecorridoDePantalla[] = [
  {
    id: "entrada",
    version: 1,
    ruta: "/entrada",
    pasos: [
      { objetivo: en("entrada-lector"), titulo: "Empieza por la pulsera", texto: "Pasa la pulsera de cada niño por el lector, sin tocar la pantalla. Si el lector no responde, usa la cámara." },
      { objetivo: en("entrada-sin-pulsera"), titulo: "Niños sin pulsera", texto: "Un niño que no tolera la pulsera entra desde aquí, por su nombre. El sistema le da su propio código." },
      { objetivo: en("entrada-representante"), titulo: "Quién los trae", texto: "El teléfono del representante: si ya vino, aparece solo con sus niños y no hay que teclear nada más." },
      { objetivo: en("entrada-registrar"), titulo: "Cómo paga y registrar", texto: "Ahora (prepago) o todo al salir (cuenta abierta). Al registrar, el tiempo de cada niño empieza a correr." },
    ],
  },
  {
    id: "sala",
    version: 1,
    ruta: "/monitor",
    pasos: [
      { objetivo: en("sala-cifras"), titulo: "La sala de un vistazo", texto: "Cuántos niños hay, a cuántos se les cumplió el tiempo y cuántos están por vencer." },
      { objetivo: en("sala-lector"), titulo: "Abrir la ficha de un niño", texto: "Pasa su pulsera por el lector, o tócalo en la lista." },
      { objetivo: en("sala-tarjetas"), titulo: "Cada niño, su tiempo", texto: "Verde en tiempo, amarillo por vencer, rojo cumplido. En su ficha: recargar, pausa por comida, nombre y mesa." },
    ],
  },
  {
    id: "salida",
    version: 1,
    ruta: "/salida",
    pasos: [
      { objetivo: en("salida-lector"), titulo: "Pasa la pulsera de quien se va", texto: "Si se va la familia entera, pasa todas seguidas: se liquidan juntas y se cobra una sola vez." },
      { objetivo: en("salida-registrar"), titulo: "Quién lo recoge y dónde se paga", texto: "Marca quién recoge al niño y elige si se paga en caja o se carga a la mesa de su familia." },
    ],
  },
  {
    id: "caja",
    version: 1,
    ruta: "/caja",
    pasos: [
      { objetivo: en("caja-cola"), titulo: "Lo que hay por cobrar", texto: "La cola va de la cuenta más antigua a la más nueva: parque, mesas, de pie y mostrador." },
      { objetivo: en("caja-cuenta"), titulo: "La cuenta elegida", texto: "Lo que se cobra, línea a línea. En una venta de mostrador se añaden los productos de la carta." },
      { objetivo: en("caja-cobro"), titulo: "Medio, monto y cobrar", texto: "Elige el medio, escribe lo que entrega el cliente (se puede mezclar) y cobra. El recibo sale en la impresora de caja." },
    ],
  },
  {
    id: "mesas",
    version: 1,
    ruta: "/mesas",
    pasos: [
      { objetivo: en("mesas-plano"), titulo: "El salón", texto: "Toca una mesa libre para sentar a una familia, o una ocupada para atenderla. El número en un círculo dice cuántas cuentas tiene." },
      { objetivo: en("mesas-de-pie"), titulo: "Quien pide de pie", texto: "Para quien pide sin mesa: ábrele una cuenta con un nombre o una seña." },
      { objetivo: en("mesas-detalle"), titulo: "La mesa elegida", texto: "Sus cuentas (una por familia si es compartida), sus pedidos y si la comanda salió. Desde aquí se toma el pedido y se pide la cuenta." },
    ],
  },
];

/** El recorrido de una ruta, si tiene. */
export function recorridoDe(ruta: string): RecorridoDePantalla | null {
  return RECORRIDOS.find((r) => ruta === r.ruta || ruta.startsWith(`${r.ruta}?`)) ?? null;
}
