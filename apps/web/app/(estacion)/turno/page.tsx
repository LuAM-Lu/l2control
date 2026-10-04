import { TurnoScreen } from "../../../src/features/cash/TurnoScreen";
import { turnoDelEquipo } from "../../../src/features/cash/turno.servidor";
import { comprobacionApertura, turnosAbiertosDeOtros, ultimoCorteZ, vistaDelTurno } from "../../../src/features/cash/cortes.servidor";
import { eventosDeHoy } from "../../../src/features/eventos/eventos.servidor";

/**
 * Turno de caja (M-13, B3-5): la apertura con su comprobación, el resumen del libro con las ventas
 * del turno, y el cierre con arqueo a ciegas y corte Z (F4-05 a F4-08), en una sola sección.
 *
 * `?turno=` abre el turno de otro equipo, para que supervisión lo cierre (la cajera se fue o el
 * equipo falló, JORNADA §5). El servidor decide si quien lo pide puede.
 */
export const dynamic = "force-dynamic";

export default async function TurnoPage({ searchParams }: { searchParams: Promise<{ turno?: string }> }) {
  const { turno: ajeno } = await searchParams;
  if (ajeno) {
    const vista = await vistaDelTurno(ajeno);
    return <TurnoScreen ajeno turno={vista?.ok ? vista.valor.turno : null} vista={vista} />;
  }
  const turno = await turnoDelEquipo();
  if (turno) return <TurnoScreen turno={turno} vista={await vistaDelTurno()} />;
  const [comprobacion, otrosAbiertos, ultimoZ, eventos] = await Promise.all([comprobacionApertura(), turnosAbiertosDeOtros(), ultimoCorteZ(), eventosDeHoy()]);
  return <TurnoScreen turno={null} vista={null} comprobacion={comprobacion} otrosAbiertos={otrosAbiertos} ultimoZ={ultimoZ} eventosHoy={eventos?.reservas ?? []} />;
}
