import { ParkMonitor } from "../../../src/features/park/ParkMonitor";
import { eventosDeHoy } from "../../../src/features/eventos/eventos.servidor";
import { RECIBEN_INVITADOS } from "../../../src/features/eventos/formato";
import { RefrescarAlCambiar } from "../../../src/features/operacion/RefrescarAlCambiar";
import { catalogoDelLocal } from "../../../src/features/inventario/productos.servidor";

/**
 * Parque (F5-08, B4-12): la sala, la entrada y la salida en una pantalla, con un solo lector.
 *
 * La sala es del servidor (B4-2): el layout la lee con su hora (`serverNow`, ADR-010) y `SalaProvider` la vuelve a leer
 * con cada cambio. El cliente solo interpola entre lecturas; nunca decide cuánto tiempo queda. Para la entrada, los
 * cumpleaños de hoy (sus invitados entran sin paquete, B10-2) y el catálogo (las medias, B4-9). `?entrada=1` abre la
 * entrada y `?salida=<pulsera>` la salida de ese niño: son los enlaces de antes (`/entrada`, `/salida`).
 */
export const dynamic = "force-dynamic";

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ entrada?: string; salida?: string }> }) {
  const { entrada, salida } = await searchParams;
  const eventos = await eventosDeHoy();
  const catalogo = await catalogoDelLocal();
  return (
    <>
      <RefrescarAlCambiar temas={["eventos", "catalogo"]} />
      <ParkMonitor
        catalogo={catalogo}
        // Los que reciben invitados y no han terminado: uno que ya acabó no se ofrece.
        cumpleanos={(eventos?.reservas ?? []).filter((r) => RECIBEN_INVITADOS.includes(r.estado) && r.fin > eventos!.ahora)}
        abrir={{ entrada: entrada === "1", salida: salida ?? null }}
      />
    </>
  );
}
