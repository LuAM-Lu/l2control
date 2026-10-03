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
 * está no se duplica (I-04) y una mesa abierta no se abre dos veces (I-05).
 *
 * Los pedidos y su comanda dejaron el bus con B6-2 (son del servidor, ADR-022), y la impresora con
 * B5-2 (la vigila la cola). Vincular pulseras dejó el bus con B6-3 (mueve dinero, es del servidor):
 * quién está en cada mesa lo dice la cuenta de la mesa (`FamilyAccountDto.sessionIds`), no un evento.
 * Quedan el abrir, pedir la cuenta, poner por limpiar y liberar una mesa.
 */
import type { OperationEventDto, ParkSessionDto } from "@l2/contracts";

/** Un evento antes de sellarlo: el id y el instante los pone quien lo emite. */
export type EventoSinSello = OperationEventDto extends infer E
  ? E extends OperationEventDto
    ? Omit<E, "id" | "at">
    : never
  : never;

export type EstadoMesa = "OCUPADA" | "PIDE_CUENTA" | "POR_LIMPIAR";

export type Mesa = Readonly<{
  id: string;
  label: string;
  estado: EstadoMesa;
  /** Desde cuándo está en el estado actual. */
  desde: string;
  /** Cuándo se abrió: separa los pedidos de esta familia de los de la anterior. */
  abiertaEn: string;
  comensales: number;
}>;

export type Conectado = Readonly<{ userName: string; role: string; device: string; desde: string }>;

export type EstadoLocal = Readonly<{
  /** Niños en sala ahora. */
  sesiones: readonly ParkSessionDto[];
  /** Representante de cada estancia abierta. */
  familias: Readonly<Record<string, string>>;
  mesas: Readonly<Record<string, Mesa>>;
  /** Quién está en cada puesto: lo pone `OperacionProvider` desde las sesiones del servidor (B5-1). */
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
    case "estancia.nombrada": {
      const s = e.sesiones.find((x) => x.id === ev.sessionId);
      if (!s) return base; // Si ya salió o llegó fuera de orden, se ignora.
      const kid = { ...s.kid, name: ev.name, ...(ev.nickname ? { nickname: ev.nickname } : {}) };
      return {
        ...base,
        sesiones: e.sesiones.map((x) => (x.id === ev.sessionId ? { ...x, kid } : x)),
        nombres: { ...e.nombres, [ev.sessionId]: ev.nickname ?? ev.name },
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
          },
        },
        etiquetasMesa: { ...e.etiquetasMesa, [ev.tableId]: ev.label },
      };
    case "mesa.pide_cuenta":
      return mesa(ev.tableId, { estado: "PIDE_CUENTA", desde: ev.at });
    case "mesa.por_limpiar":
      return mesa(ev.tableId, { estado: "POR_LIMPIAR", desde: ev.at });
    case "mesa.libre":
      return { ...base, mesas: sin(e.mesas, ev.tableId) };

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
