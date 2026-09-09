import { Wifi, WifiOff, ServerCrash, BatteryWarning } from "lucide-react";
import { Badge, type Tone } from "../primitives/Badge";

/**
 * Nivel 2 — patrón (§9.4). Muestra el nivel de degradación de ADR-003.
 *
 * §8.5: cuando el sistema está degradado, la interfaz lo dice CON PALABRAS
 * ("Sin internet: cobrando con la tasa de las 8:00"), no con un icono
 * ambiguo que el cajero tiene que interpretar.
 */
export type DegradationLevel = "N0" | "N1" | "N2" | "N3";

const LEVEL: Record<DegradationLevel, { tone: Tone; label: string; icon: typeof Wifi }> = {
  N0: { tone: "ok", label: "En línea", icon: Wifi },
  N1: { tone: "warn", label: "Sin internet · cobrando normal", icon: WifiOff },
  N2: { tone: "crit", label: "Servidor caído · solo consulta", icon: ServerCrash },
  N3: { tone: "crit", label: "Sin energía · procedimiento en papel", icon: BatteryWarning },
};

export function ConnectionBadge({ level, detail }: { level: DegradationLevel; detail?: string }) {
  const { tone, label, icon: Icon } = LEVEL[level];
  return (
    <Badge tone={tone} icon={<Icon size={13} aria-hidden="true" />}>
      {detail ? `${label} · ${detail}` : label}
    </Badge>
  );
}
