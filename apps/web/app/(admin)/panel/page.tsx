import { toMajor } from "@l2/domain-money";
import { money } from "@l2/domain-money";
import { openingMovements, tallyShift } from "@l2/domain-cash";
import { InicioScreen, type PorMedio, type SaldoMoneda } from "../../../src/features/shell/InicioScreen";
import type { FilaPunto } from "../../../src/features/cash/PuntosDeCobro";
import { MEDIO_LABEL } from "../../../src/features/cash/turno";
import { DEMO_EXCEPCIONES, DEMO_SHIFT_MOVEMENTS } from "../../../src/demo/turno";
import { ninosAtendidos } from "../../../src/features/park/parque.servidor";
import { turnosAbiertos } from "../../../src/features/cash/turno.servidor";

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

export default async function InicioPage() {
  // Los niños atendidos, de las estancias de la base (B4-2), contra el mismo día de la semana pasada.
  const atendidos = await ninosAtendidos();
  // Los turnos abiertos (B3-1): su fondo está en la gaveta. Lo cobrado sale del libro con B3-5.
  const turnos = await turnosAbiertos();
  const fondos = openingMovements(turnos.flatMap((t) => t.fondos.map((f) => money(BigInt(f.amount.minor), f.amount.currency))));
  const tally = tallyShift([...fondos, ...DEMO_SHIFT_MOVEMENTS]);

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

  // El punto de cobro es el equipo del turno desde B3-1: el desglose por taquilla y mostrador se
  // retiró del dominio (B3-5). Inicio pasa a leer el resumen del día del servidor en B3-5.
  const puntos: FilaPunto[] = [];

  const hoy = new Date();

  return (
    <InicioScreen
      porMedio={porMedio}
      gaveta={gaveta}
      puntos={puntos}
      ninosHoy={atendidos?.hoy ?? 0}
      // Sin estancias de hace una semana no hay con qué comparar: se dice, no se inventa un cero.
      ninosSemanaPasada={atendidos && atendidos.semanaPasada > 0 ? atendidos.semanaPasada : null}
      ventaHoy={null}
      ventaSemanaPasada={null}
      excepciones={DEMO_EXCEPCIONES}
      fecha={`${hoy.getDate()} de ${MESES[hoy.getMonth()]}`}
      diaSemana={DIAS[hoy.getDay()] ?? "Hoy"}
      turnos={turnos.map((t) => ({ abiertoEn: t.abiertoEn, abiertoPor: t.abiertoPor.name, punto: t.punto }))}
      umbral={{ avisoMin: 8, gritaMin: 15 }}
      // Quién está en cada puesto viaja todavía por el bus entre pestañas de UN navegador (B5-1):
      // con el turno abierto en otro equipo, «Sin nadie en caja» sería una alarma falsa.
      enServicio={false}
    />
  );
}
