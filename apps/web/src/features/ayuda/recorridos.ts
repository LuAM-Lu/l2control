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
    // B4-12 (M-34): la sala, la entrada y la salida son una pantalla; sus tres recorridos, uno.
    id: "parque",
    version: 1,
    ruta: "/monitor",
    pasos: [
      { objetivo: en("sala-cifras"), titulo: "La sala de un vistazo", texto: "Cuántos niños hay, a cuántos se les cumplió el tiempo y cuántos están por vencer." },
      {
        objetivo: en("sala-lector"),
        titulo: "Un solo lector",
        texto: "Pasa cualquier pulsera, sin tocar la pantalla: una nueva abre la entrada con ella; la de un niño en la sala, su ficha. Si el lector no responde, la cámara.",
      },
      { objetivo: en("parque-sin-pulsera"), titulo: "Niños sin pulsera", texto: "Un niño que no tolera la pulsera entra desde aquí, por su nombre. El sistema le da su propio código." },
      { objetivo: en("sala-buscar"), titulo: "Buscar a una familia", texto: "Por el nombre, la cédula o el teléfono del representante: qué niños suyos están en la sala." },
      {
        objetivo: en("sala-tarjetas"),
        titulo: "Cada niño, su tiempo",
        texto: "Verde en tiempo, amarillo por vencer, rojo cumplido. En su ficha: recargar, pausa por comida, nombre, mesa y la salida, la suya o la de toda la familia.",
      },
    ],
  },
  {
    id: "caja",
    // 2 (B3-9): la entrada desde la caja. 3 (B3-10): el buscador de la carta y el pie de la cuenta.
    version: 3,
    ruta: "/caja",
    pasos: [
      { objetivo: en("caja-cola"), titulo: "Lo que hay por cobrar", texto: "La cola va de la cuenta más antigua a la más nueva: parque, mesas, de pie y mostrador. Al pie, «Abiertas en el salón»: las mesas que no han pedido la cuenta; una se trae a la caja con un toque." },
      {
        objetivo: en("caja-entrada"),
        titulo: "Niños que llegan a la caja",
        texto: "«Entrada» (o pasar una pulsera nueva) registra a los niños con su paquete y su representante, y deja la cuenta lista para cobrar sin salir de aquí.",
      },
      {
        objetivo: en("caja-cuenta"),
        titulo: "La cuenta elegida",
        texto: "Lo que se cobra, línea a línea. En una venta de mostrador se añaden los productos de la carta: escribe en su buscador (tecla /) e Intro añade el primero.",
      },
      {
        objetivo: en("caja-pie"),
        titulo: "Factura, descuento y dividir",
        texto: "Cada botón dice cómo está: a quién sale la factura (tecla I), el descuento puesto y en cuántas partes se divide.",
      },
      { objetivo: en("caja-cobro"), titulo: "Medio, monto y cobrar", texto: "Elige el medio, escribe lo que entrega el cliente (se puede mezclar) y «Cobrar», con el monto a la vista. El recibo sale en la impresora de caja." },
    ],
  },
  {
    id: "mesas",
    // 2 (B6-9): sentar pide la cédula, el teléfono y el nombre del cliente.
    // 3 (T-23): sentar propone a quien está aquí y lleva el tiempo de sus niños a la mesa.
    // 4 (B6-17): en vertical, la mesa en un cajón; las comandas que no salieron, en una píldora.
    version: 4,
    ruta: "/mesas",
    pasos: [
      {
        objetivo: en("mesas-plano"),
        titulo: "El salón",
        texto: "Toca una mesa libre para sentar a un cliente: «Cédula o RIF» propone a quien está aquí (las familias de la sala, las cuentas abiertas) y un toque rellena sus datos y lleva el tiempo de sus niños a la mesa. Con «Más rápido» basta su nombre: la cédula se pide antes del segundo pedido. Una ocupada se toca para atenderla (en la tablet en vertical, sube en un cajón); el número en un círculo dice cuántas cuentas tiene.",
      },
      { objetivo: en("mesas-de-pie"), titulo: "Quien pide de pie", texto: "Para quien pide sin mesa: ábrele una cuenta con sus mismos datos." },
      { objetivo: en("mesas-detalle"), titulo: "La mesa elegida", texto: "Sus cuentas (una por familia si es compartida), sus pedidos y si la comanda salió. Desde aquí se toma el pedido y se pide la cuenta." },
    ],
  },
];

/** El recorrido de una ruta, si tiene. */
export function recorridoDe(ruta: string): RecorridoDePantalla | null {
  return RECORRIDOS.find((r) => ruta === r.ruta || ruta.startsWith(`${r.ruta}?`)) ?? null;
}
