import { toMajor } from "@l2/domain-money";
import { tallyShift } from "@l2/domain-cash";
import {
  InicioScreen,
  type Atencion,
  type PorMedio,
} from "../../../src/features/shell/InicioScreen";
import {
  DEMO_EXCEPCIONES,
  DEMO_SHIFT_MOVEMENTS,
  MEDIO_LABEL,
} from "../../../src/features/cash/shift-fixtures";
import { demoSnapshot } from "../../../src/features/park/fixtures";
import { toMonitorModel } from "../../../src/features/park/view-model";

/**
 * Inicio del back-office (F9-00).
 *
 * Las cifras del día **se calculan** del libro de movimientos con el mismo
 * dominio que usa el arqueo, y las atenciones salen del estado real del
 * parque. Lo único de ejemplo es la comparación con la semana pasada, que
 * necesita histórico — y la pantalla lo dice.
 */
export const dynamic = "force-dynamic";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function InicioPage() {
  const modelo = toMonitorModel(demoSnapshot(Date.now()));
  const tally = tallyShift(DEMO_SHIFT_MOVEMENTS);

  const vencidas = modelo.cards.filter((c) => c.status === "VENCIDA").length;
  const porVencer = modelo.cards.filter(
    (c) => c.status === "POR_VENCER" || c.status === "EN_GRACIA",
  ).length;

  const atenciones: Atencion[] = [];

  if (vencidas > 0) {
    atenciones.push({
      id: "vencidas",
      titulo: `${vencidas} ${vencidas === 1 ? "niño" : "niños"} con tiempo cumplido`,
      detalle: "Están en sala pasada su hora y todavía no se han liquidado.",
      gravedad: "crit",
      href: "/monitor",
      accion: "Ver la sala",
    });
  }
  if (porVencer > 0) {
    atenciones.push({
      id: "porvencer",
      titulo: `${porVencer} por vencer en los próximos minutos`,
      detalle: "Conviene avisar a los representantes antes de que entre el cobro por excedente.",
      gravedad: "warn",
      href: "/monitor",
      accion: "Ver la sala",
    });
  }
  if (!modelo.rateConfirmed) {
    atenciones.push({
      id: "tasa",
      titulo: "La tasa del día no está confirmada",
      detalle: "Sin tasa confirmada no se puede cobrar en bolívares.",
      gravedad: "crit",
      href: "/caja",
      accion: "Confirmar",
    });
  }

  // Solo los ingresos, no el fondo inicial ni las salidas: eso es «lo que
  // entró hoy», no el saldo de la gaveta.
  const porMedio: PorMedio[] = tally.byMethod
    .filter((m) => m.total.amount > 0n)
    .map((m) => ({
      medio: MEDIO_LABEL[m.methodCode] ?? m.methodCode,
      moneda: m.currency,
      total: toMajor(m.total),
      enGaveta: m.inDrawer,
    }));

  return (
    <InicioScreen
      atenciones={atenciones}
      porMedio={porMedio}
      ninosHoy={modelo.cards.length}
      ninosSemanaPasada={11}
      ventaHoy="94.17"
      ventaSemanaPasada="108.40"
      excepciones={DEMO_EXCEPCIONES}
      diaSemana={DIAS[new Date().getDay()] ?? "Hoy"}
    />
  );
}
