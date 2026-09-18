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
import {
  anulacionRequiereConfirmacion,
  transicionar,
  type EstadoComanda,
  type Transicion,
} from "@l2/domain-orders";

/** Un evento antes de sellarlo: el id y el instante los pone quien lo emite. */
export type EventoSinSello = OperationEventDto extends infer E
  ? E extends OperationEventDto
    ? Omit<E, "id" | "at">
    : never
  : never;

export type EstadoMesa ="OCUPADA" | "PIDE_CUENTA" | "POR_LIMPIAR";
/** La máquina de estados de la comanda es del dominio (F6-08). */
export type EstadoPedido = EstadoComanda;

/** Nombre de la impresora de cocina en los eventos de ADR-015. */
export const IMPRESORA_COCINA = "Cocina";

export type Mesa = Readonly<{
  id: string;
  label: string;
  estado: EstadoMesa;
  /** Desde cuándo está en el estado actual. */
  desde: string;
  /** Cuándo se abrió: separa los pedidos de esta familia de los de la anterior. */
  abiertaEn: string;
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
  /** Si salió en papel. Con la impresora de cocina caída al enviarse, no (F6-09). */
  impreso: boolean;
  listoEn: string | null;
  /** Motivo, quién autorizó y si la cocina ya confirmó que la vio (FLUJOS C5). */
  anulacion: Readonly<{
    motivo: string;
    autorizo: string;
    en: string;
    /** Si la cocina ya la tenía en sus manos y tiene que confirmarla. */
    confirmar: boolean;
    vistaPor: string | null;
  }> | null;
  /** Quién y cuándo, en cada transición (F6-08). */
  historial: readonly Readonly<{ estado: EstadoPedido; en: string; por: string | null }>[];
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
  /**
   * Una transición de comanda, validada por el dominio. Un evento que pide un
   * salto imposible —un «aceptado» que llega después de «listo»— no hace
   * retroceder nada: se ignora (F6-08).
   */
  const pedido = (id: string, t: Transicion, por: string | undefined, extra?: (p: Pedido) => Partial<Pedido>): EstadoLocal => {
    const p = e.pedidos[id];
    if (!p) return base;
    const r = transicionar(p.estado, t);
    if (!r.ok) return base;
    const nuevo: Pedido = {
      ...p,
      ...extra?.(p),
      estado: r.estado,
      cambioEn: ev.at,
      historial: [...p.historial, { estado: r.estado, en: ev.at, por: por ?? null }],
    };
    return { ...base, pedidos: { ...e.pedidos, [id]: nuevo } };
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
        nombres: { ...e.nombres, [s.id]: s.kid.nickname ?? s.kid.name ?? s.wristbandCode },
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
            abiertaEn: ev.at,
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
            impreso: e.impresoras[IMPRESORA_COCINA]?.estado !== "FALLO",
            listoEn: null,
            anulacion: null,
            historial: [{ estado: "ENVIADO", en: ev.at, por: null }],
          },
        },
      };
    case "pedido.aceptado":
      return pedido(ev.orderId, "ACEPTAR", ev.by);
    case "pedido.listo":
      return pedido(ev.orderId, "MARCAR_LISTO", ev.by, () => ({ listoEn: ev.at }));
    case "pedido.entregado":
      return pedido(ev.orderId, "ENTREGAR", ev.by);
    case "pedido.anulado":
      return pedido(ev.orderId, "ANULAR", ev.authorizedBy, (p) => ({
        anulacion: {
          motivo: ev.reason,
          autorizo: ev.authorizedBy,
          en: ev.at,
          confirmar: anulacionRequiereConfirmacion(p.estado),
          vistaPor: null,
        },
      }));
    case "pedido.anulacion_vista": {
      const p = e.pedidos[ev.orderId];
      if (!p?.anulacion || p.anulacion.vistaPor) return base;
      return {
        ...base,
        pedidos: { ...e.pedidos, [p.id]: { ...p, anulacion: { ...p.anulacion, vistaPor: ev.by } } },
      };
    }

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
