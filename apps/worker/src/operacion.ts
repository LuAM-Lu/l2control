/**
 * El bus de la operación del restaurante, por el servidor — B5-1 (antes, `BroadcastChannel` de un
 * solo navegador). Provisional hasta que las mesas y los pedidos sean de la base (Etapa 6).
 *
 * Un evento que manda una pantalla es una entrada no confiable (ADR-017): se revalida contra el
 * contrato, solo se aceptan los tipos del restaurante (lo demás ya lo sabe el servidor), el instante
 * lo pone el worker y cada conexión tiene un tope de eventos por ventana (ADR-008). Lo aceptado se
 * guarda por sucursal en Valkey (los últimos, un día), para que un equipo que llega tarde o se
 * reconecta se ponga al día. Nada de esto va al almacenamiento del navegador.
 */
import { EventoDelNavegadorSchema, OperationEventSchema, type OperationEventDto } from "@l2/contracts";
import type { DatosDelTicket } from "@l2/application";

/** Cuántos eventos guarda cada sucursal para ponerse al día, y cuánto tiempo. */
export const EVENTOS_GUARDADOS = 500;
export const VIDA_DEL_BUS_S = 24 * 60 * 60;
/** Tope por conexión: una pantalla normal manda uno cada tanto; un bucle, cientos. */
export const TOPE_EVENTOS = 30;
export const VENTANA_MS = 10_000;

export type RespuestaDelBus = Readonly<{ ok: true; evento: OperationEventDto }> | Readonly<{ ok: false; motivo: string }>;

/** Dónde se guarda el bus de cada sucursal: Valkey en el worker, memoria en las pruebas. */
export interface AlmacenDelBus {
  guardar(clave: string, evento: OperationEventDto): Promise<void>;
  /** Del más viejo al más nuevo. */
  leer(clave: string): Promise<unknown[]>;
}

export const claveDelBus = (s: Pick<DatosDelTicket, "tenantId" | "branchId">) => `l2:operacion:${s.tenantId}:${s.branchId}`;

export interface Limitador {
  /** Si entra otro evento ahora; si entra, lo cuenta. */
  cabe(ahora: number): boolean;
}

function limitador(): Limitador {
  let desde = 0;
  let cuantos = 0;
  return {
    cabe(ahora) {
      if (ahora - desde >= VENTANA_MS) {
        desde = ahora;
        cuantos = 0;
      }
      cuantos++;
      return cuantos <= TOPE_EVENTOS;
    },
  };
}

export function crearRelevo(o: { almacen: AlmacenDelBus; ahora: () => number }) {
  return {
    limitador,
    async recibir(sesion: DatosDelTicket, crudo: unknown, limite: Limitador): Promise<RespuestaDelBus> {
      const ahora = o.ahora();
      if (!limite.cabe(ahora)) return { ok: false, motivo: "Demasiados eventos seguidos: espera unos segundos." };
      // El instante lo pone el servidor, no la pantalla (ADR-010): se sustituye antes de validar.
      const sellado = typeof crudo === "object" && crudo !== null ? { ...crudo, at: new Date(ahora).toISOString() } : crudo;
      const r = EventoDelNavegadorSchema.safeParse(sellado);
      if (!r.success) return { ok: false, motivo: r.error.issues[0]?.message ?? "El evento no cumple el contrato" };
      await o.almacen.guardar(claveDelBus(sesion), r.data);
      return { ok: true, evento: r.data };
    },
    /** Lo guardado de la sucursal, revalidado: lo que ya no cumple el contrato no se entrega. */
    async alDia(sesion: DatosDelTicket): Promise<OperationEventDto[]> {
      return (await o.almacen.leer(claveDelBus(sesion))).flatMap((e) => {
        const r = OperationEventSchema.safeParse(e);
        return r.success ? [r.data] : [];
      });
    },
  };
}

/** El almacén de Valkey: una lista por sucursal, recortada y con caducidad. */
export function almacenValkey(cliente: {
  multi(): { rpush(k: string, v: string): unknown; ltrim(k: string, a: number, b: number): unknown; expire(k: string, s: number): unknown; exec(): Promise<unknown> };
  lrange(k: string, a: number, b: number): Promise<string[]>;
}): AlmacenDelBus {
  return {
    async guardar(clave, evento) {
      const m = cliente.multi();
      m.rpush(clave, JSON.stringify(evento));
      m.ltrim(clave, -EVENTOS_GUARDADOS, -1);
      m.expire(clave, VIDA_DEL_BUS_S);
      await m.exec();
    },
    async leer(clave) {
      return (await cliente.lrange(clave, 0, -1)).flatMap((t) => {
        try {
          return [JSON.parse(t) as unknown];
        } catch {
          return [];
        }
      });
    },
  };
}

/** El almacén en memoria, para las pruebas. */
export function almacenEnMemoria(): AlmacenDelBus {
  const listas = new Map<string, unknown[]>();
  return {
    async guardar(clave, evento) {
      listas.set(clave, [...(listas.get(clave) ?? []), evento].slice(-EVENTOS_GUARDADOS));
    },
    async leer(clave) {
      return listas.get(clave) ?? [];
    },
  };
}
