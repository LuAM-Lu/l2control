import { toMajor } from "@l2/domain-money";
import { tallyShift } from "@l2/domain-cash";
import { InicioScreen, type PorMedio, type SaldoMoneda } from "../../../src/features/shell/InicioScreen";
import type { FilaPunto } from "../../../src/features/cash/PuntosDeCobro";
import { MEDIO_LABEL } from "../../../src/features/cash/turno";
import { DEMO_EXCEPCIONES, DEMO_SHIFT_MOVEMENTS } from "../../../src/demo/turno";
import { demoSnapshot } from "../../../src/demo/parque";
import { toMonitorModel } from "../../../src/features/park/view-model";

/**
 * Inicio del back-office (F9-00) y tablero en vivo del local (F9-08).
 *
 * Las cifras del día **se calculan** del libro de movimientos con el mismo
 * dominio que usa el arqueo. Lo único de ejemplo es la comparación con la
 * semana pasada, que necesita histórico — y la pantalla lo dice.
 *
 * Lo que pasa AHORA no se pasa por aquí: lo lee `EnVivo` de los eventos de la
 * operación, en el navegador. De aquí solo salen las reglas con las que se
 * juzga —política del parque, umbral de cocina, si hay turno y si hay tasa—,
 * que es exactamente lo que el servidor entregará el día que exista.
 *
 * TODO(F9-08/backend): política, umbral y estado del turno vendrán de la
 * configuración de la sucursal, por tiempo real (ADR-008).
 */
export const dynamic = "force-dynamic";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default function InicioPage() {
  const modelo = toMonitorModel(demoSnapshot(Date.now()));
  const tally = tallyShift(DEMO_SHIFT_MOVEMENTS);

  // «Lo que entró hoy» es LO COBRADO, no el movimiento neto del medio. Antes
  // se usaba el neto y el efectivo en dólares salía en 70,58: incluía los
  // 50,00 del fondo inicial y restaba la salida de caja. Lo cobrado fue 35,17.
  const porMedio: PorMedio[] = tally.byMethod
    .filter((m) => m.charged.amount > 0n)
    .map((m) => ({
      medio: MEDIO_LABEL[m.methodCode] ?? m.methodCode,
      moneda: m.currency,
      total: toMajor(m.charged),
      // Las unidades menores viajan como texto: la proporción de las barras se
      // calcula con enteros, sin pasar el dinero por un decimal (§5.1).
      minor: m.charged.amount.toString(),
      enGaveta: m.inDrawer,
    }));

  // Lo que debería haber físicamente en la gaveta, por moneda. El dólar
  // primero por ser la moneda funcional (ADR-004).
  const gaveta: SaldoMoneda[] = tally.drawer
    .map((d) => ({ moneda: d.currency, total: toMajor(d.expected) }))
    .sort((a, b) => (a.moneda === "USD" ? -1 : b.moneda === "USD" ? 1 : 0));

  const puntos: FilaPunto[] = tally.byPoint.map((p) => ({
    punto: p.point,
    moneda: p.currency,
    cobrado: toMajor(p.charged),
    efectivoNeto: toMajor(p.cashNet),
  }));

  const hoy = new Date();
  const tasa = modelo.rateConfirmed && modelo.rateValue ? modelo.rateValue.replace(".", ",") : null;

  return (
    <InicioScreen
      porMedio={porMedio}
      gaveta={gaveta}
      puntos={puntos}
      ninosHoy={modelo.cards.length}
      ninosSemanaPasada={11}
      ventaHoy="94.17"
      ventaSemanaPasada="108.40"
      excepciones={DEMO_EXCEPCIONES}
      fecha={`${hoy.getDate()} de ${MESES[hoy.getMonth()]}`}
      diaSemana={DIAS[hoy.getDay()] ?? "Hoy"}
      turnoDesde="2:00 pm"
      cajero="Marisol Prieto"
      tasa={tasa}
      umbral={{ avisoMin: 8, gritaMin: 15 }}
      enServicio
    />
  );
}
