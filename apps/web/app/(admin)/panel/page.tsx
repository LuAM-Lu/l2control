import { InicioScreen } from "../../../src/features/shell/InicioScreen";
import { ninosAtendidos } from "../../../src/features/park/parque.servidor";
import { turnosAbiertos } from "../../../src/features/cash/turno.servidor";
import { resumenDelDia } from "../../../src/features/cash/cortes.servidor";

/**
 * Inicio del back-office (F9-00) y tablero en vivo del local (F9-08).
 *
 * Las cifras del día salen del servidor: el resumen del día del libro de pagos (B3-5: lo vendido,
 * lo cobrado por medio, los turnos con su arqueo y las excepciones) y los niños atendidos de las
 * estancias (B4-2). Lo que pasa AHORA lo lee `EnVivo` de los eventos de la operación.
 *
 * TODO(F9-08/backend): política y umbral de cocina vendrán de la configuración de la sucursal, por
 * tiempo real (ADR-008).
 */
export const dynamic = "force-dynamic";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function InicioPage() {
  const [atendidos, turnos, resumen] = await Promise.all([ninosAtendidos(), turnosAbiertos(), resumenDelDia()]);
  // Un turno que sigue abierto de un día anterior (un corte de luz, un equipo dañado) va delante:
  // lo cierra supervisión antes de nada (JORNADA §3).
  const deAntes = turnos
    .filter((t) => resumen && t.businessDate < resumen.dia)
    .map((turno) => ({ turno, diferenciaEnDolares: null, firma: null }));
  const hoy = new Date();

  return (
    <InicioScreen
      resumen={resumen ? { ...resumen, turnos: [...deAntes, ...resumen.turnos] } : null}
      ninosHoy={atendidos?.hoy ?? 0}
      // Sin estancias de hace una semana no hay con qué comparar: se dice, no se inventa un cero.
      ninosSemanaPasada={atendidos && atendidos.semanaPasada > 0 ? atendidos.semanaPasada : null}
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
