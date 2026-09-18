/**
 * Cada evento contado en una frase — F1-19.
 *
 * El registro del simulador lo lee una persona, no un programa: «Cocina:
 * listo lo de la mesa 3» y no `pedido.listo m3-p1`. Se usa el estado ya
 * actualizado, que conserva los nombres aunque el niño haya salido.
 */
import type { OperationEventDto } from "@l2/contracts";
import type { EstadoLocal } from "./proyeccion.ts";

export function describir(ev: OperationEventDto, e: EstadoLocal): string {
  const mesa = (id: string) => `mesa ${e.etiquetasMesa[id] ?? "?"}`;
  const deMesa = (orderId: string) => {
    const p = e.pedidos[orderId];
    return p ? mesa(p.tableId) : "una mesa";
  };

  switch (ev.type) {
    case "estancia.abierta":
      return `Entra ${ev.session.kid.nickname ?? ev.session.kid.name ?? ev.session.wristbandCode} · ${ev.family}`;
    case "estancia.nombrada":
      return `${e.nombres[ev.sessionId] ?? "Un niño"} ahora se llama ${ev.nickname ?? ev.name}`;
    case "estancia.cerrada":
      return `Sale ${e.nombres[ev.sessionId] ?? "un niño"}`;
    case "mesa.abierta":
      return `Se ocupa la mesa ${ev.label} · ${ev.guests} personas`;
    case "mesa.vinculada":
      return `${ev.sessionIds.length === 1 ? "Un niño vinculado" : `${ev.sessionIds.length} niños vinculados`} a la ${mesa(ev.tableId)}`;
    case "mesa.pide_cuenta":
      return `La ${mesa(ev.tableId)} pide la cuenta`;
    case "mesa.por_limpiar":
      return `La ${mesa(ev.tableId)} queda por limpiar`;
    case "mesa.libre":
      return `La ${mesa(ev.tableId)} queda libre`;
    case "pedido.enviado":
      return `Pedido de la ${mesa(ev.tableId)}: ${ev.items.map((i) => `${i.quantity} ${i.name.toLowerCase()}`).join(", ")}`;
    case "pedido.aceptado":
      return `Cocina acepta lo de la ${deMesa(ev.orderId)}`;
    case "pedido.listo":
      return `Listo lo de la ${deMesa(ev.orderId)}`;
    case "pedido.entregado":
      return `Entregado a la ${deMesa(ev.orderId)}`;
    case "pedido.anulado":
      return `Anulado lo de la ${deMesa(ev.orderId)}: ${ev.reason}`;
    case "pedido.anulacion_vista":
      return `Cocina vio la anulación de la ${deMesa(ev.orderId)} · ${ev.by}`;
    case "impresora.fallo":
      return `Impresora de ${ev.printer.toLowerCase()}: ${ev.detail.toLowerCase()}`;
    case "impresora.recuperada":
      return `Impresora de ${ev.printer.toLowerCase()} de vuelta`;
    case "sesion.iniciada":
      return `${ev.userName.split(" ")[0]} entra en ${ev.device.toLowerCase()}`;
    case "sesion.cerrada":
      return `Se cierra la sesión de ${ev.device.toLowerCase()}`;
    default: {
      const nunca: never = ev;
      return nunca;
    }
  }
}
