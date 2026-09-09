import { SystemMap } from "../src/features/shell/SystemMap";
import { demoSnapshot } from "../src/features/park/fixtures";
import { toMonitorModel } from "../src/features/park/view-model";

/**
 * Mapa del sistema: la pieza para mostrar y entender L2 Control.
 *
 * El estado de la franja superior **no es inventado**: sale del mismo
 * snapshot y del mismo dominio que alimenta el monitor, así que lo que dice
 * «con tiempo cumplido» es lo que el monitor mostrará al abrirlo.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  const modelo = toMonitorModel(demoSnapshot(Date.now()));

  return (
    <SystemMap
      estado={{
        turnoAbierto: "14:00",
        ninosEnSala: modelo.cards.length,
        aforo: modelo.capacityLimit,
        conTiempoCumplido: modelo.cards.filter((c) => c.status === "VENCIDA").length,
        porVencer: modelo.cards.filter(
          (c) => c.status === "POR_VENCER" || c.status === "EN_GRACIA",
        ).length,
        tasa: modelo.rateConfirmed ? modelo.rateValue : null,
        tasaHora: modelo.rateCapturedAt ?? "—",
      }}
    />
  );
}
