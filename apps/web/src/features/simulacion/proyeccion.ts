/**
 * El estado del local, reconstruido a partir de los eventos — F1-19.
 *
 * Una función pura: `estado + evento → estado`. Es lo que hará la caché de
 * cada pantalla cuando los eventos lleguen del servidor (§9: «el socket
 * actualiza la caché, no un store paralelo»). Por ser pura, cualquier pestaña
 * puede reconstruir el local entero repitiendo los mismos eventos, y así se
 * sincronizan las ventanas del simulador.
 *
 * Los eventos repetidos o fuera de orden no rompen nada: una estancia que ya
 * está no se duplica (I-04), una mesa abierta no se abre dos veces (I-05) y un
 * cambio sobre un pedido que no existe se ignora.
 */
import type { OperationEventDto, OrderItemDto, ParkSessionDto } from "@l2/contracts";

export type EstadoMesa = "OCUPADA" | "PIDE_CUENTA" | "POR_LIMPIAR";
export type EstadoPedido = "ENVIADO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "ANULADO";

export type Mesa = Readonly<{
  id: string;
  label: string;
  estado: EstadoMesa;
  desde: string;
  comensales: number;
  sesiones: readonly string[];
}>;

export type Pedido = Readonly<{
  id: string;
  tableId: string;
  estado: EstadoPedido;
  items: readonly OrderItemDto[];
  enviadoEn: string;
  cambioEn: string;
}>;

export type Impresora = Readonly<{ estado: "OK" | "FALLO"; detalle: string | null; desde: string }>;
export type Conectado = Readonly<{ userName: string; role: string; device: string; desde: string }>;

export type EstadoLocal = Readonly<{
  /** Niños en sala ahora. */
  sesiones: readonly ParkSessionDto[];
  /** Representante de cada estancia abierta. */
  familias: Readonly<Record<string, string>>;
  mesas: Readonly<Record<string, Mesa>>;
  pedidos: Readonly<Record<string, Pedido>>;
  impresoras: Readonly<Record<string, Impresora>>;
  /** Una sesión por dispositivo. */
  conectados: Readonly<Record<string, Conectado>>;
  /** Nombres que sobreviven a la salida, para contar lo que pasó. */
  nombres: Readonly<Record<string, string>>;
  etiquetasMesa: Readonly<Record<string, string>>;
  /** Los últimos eventos, del más nuevo al más viejo. */
  registro: readonly OperationEventDto[];
}>;

export const ESTADO_VACIO: EstadoLocal = {
  sesiones: [],
  familias: {},
  mesas: {},
  pedidos: {},
  impresoras: {},
  conectados: {},
  nombres: {},
  etiquetasMesa: {},
  registro: [],
};

const MAX_REGISTRO = 40;

function sin<T>(r: Readonly<Record<string, T>>, clave: string): Record<string, T> {
  const copia = { ...r };
  delete copia[clave];
  return copia;
}

export function aplicar(e: EstadoLocal, ev: OperationEventDto): EstadoLocal {
  const registro = [ev, ...e.registro].slice(0, MAX_REGISTRO);
  const base = { ...e, registro };

  const mesa = (id: string, cambio: Partial<Mesa>): EstadoLocal => {
    const m = e.mesas[id];
    return m ? { ...base, mesas: { ...e.mesas, [id]: { ...m, ...cambio } } } : base;
  };
  const pedido = (id: string, estado: EstadoPedido): EstadoLocal => {
    const p = e.pedidos[id];
    return p ? { ...base, pedidos: { ...e.pedidos, [id]: { ...p, estado, cambioEn: ev.at } } } : base;
  };

  switch (ev.type) {
    case "estancia.abierta": {
      const s = ev.session;
      // I-04: una pulsera, una estancia activa. Un evento repetido no duplica.
      if (e.sesiones.some((x) => x.id === s.id || x.wristbandCode === s.wristbandCode)) return base;
      return {
        ...base,
        sesiones: [...e.sesiones, s],
        familias: { ...e.familias, [s.id]: ev.family },
        nombres: { ...e.nombres, [s.id]: s.kid.nickname ?? s.kid.name },
      };
    }
    case "estancia.cerrada":
      return {
        ...base,
        sesiones: e.sesiones.filter((s) => s.id !== ev.sessionId),
        familias: sin(e.familias, ev.sessionId),
      };

    case "mesa.abierta":
      if (e.mesas[ev.tableId]) return base; // I-05
      return {
        ...base,
        mesas: {
          ...e.mesas,
          [ev.tableId]: {
            id: ev.tableId,
            label: ev.label,
            estado: "OCUPADA",
            desde: ev.at,
            comensales: ev.guests,
            sesiones: [],
          },
        },
        etiquetasMesa: { ...e.etiquetasMesa, [ev.tableId]: ev.label },
      };
    case "mesa.vinculada": {
      const m = e.mesas[ev.tableId];
      return m ? mesa(ev.tableId, { sesiones: [...new Set([...m.sesiones, ...ev.sessionIds])] }) : base;
    }
    case "mesa.pide_cuenta":
      return mesa(ev.tableId, { estado: "PIDE_CUENTA", desde: ev.at });
    case "mesa.por_limpiar":
      return mesa(ev.tableId, { estado: "POR_LIMPIAR", desde: ev.at });
    case "mesa.libre":
      return { ...base, mesas: sin(e.mesas, ev.tableId) };

    case "pedido.enviado":
      if (e.pedidos[ev.orderId]) return base;
      return {
        ...base,
        pedidos: {
          ...e.pedidos,
          [ev.orderId]: {
            id: ev.orderId,
            tableId: ev.tableId,
            estado: "ENVIADO",
            items: ev.items,
            enviadoEn: ev.at,
            cambioEn: ev.at,
          },
        },
      };
    case "pedido.aceptado":
      return pedido(ev.orderId, "EN_PREPARACION");
    case "pedido.listo":
      return pedido(ev.orderId, "LISTO");
    case "pedido.entregado":
      return pedido(ev.orderId, "ENTREGADO");
    case "pedido.anulado":
      return pedido(ev.orderId, "ANULADO");

    case "impresora.fallo":
      return {
        ...base,
        impresoras: { ...e.impresoras, [ev.printer]: { estado: "FALLO", detalle: ev.detail, desde: ev.at } },
      };
    case "impresora.recuperada":
      return {
        ...base,
        impresoras: { ...e.impresoras, [ev.printer]: { estado: "OK", detalle: null, desde: ev.at } },
      };

    case "sesion.iniciada":
      return {
        ...base,
        conectados: {
          ...e.conectados,
          [ev.device]: { userName: ev.userName, role: ev.role, device: ev.device, desde: ev.at },
        },
      };
    case "sesion.cerrada":
      return { ...base, conectados: sin(e.conectados, ev.device) };

    default: {
      // Si el contrato gana un tipo y aquí no se trata, deja de compilar.
      const nunca: never = ev;
      return nunca;
    }
  }
}

/** Reconstruye el local desde cero: lo que hace una pestaña que llega tarde. */
export function reconstruir(eventos: readonly OperationEventDto[]): EstadoLocal {
  return eventos.reduce(aplicar, ESTADO_VACIO);
}
