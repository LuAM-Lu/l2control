import { InicioScreen } from "../../../src/features/shell/InicioScreen";
import { ninosAtendidos } from "../../../src/features/park/parque.servidor";
import { turnosAbiertos } from "../../../src/features/cash/turno.servidor";
import { resumenDelDia } from "../../../src/features/cash/cortes.servidor";
import { RefrescarAlCambiar } from "../../../src/features/operacion/RefrescarAlCambiar";
import { catalogoDelLocal } from "../../../src/features/inventario/productos.servidor";
import { stockAlerts } from "@l2/domain-inventory";
import { eventosDeHoy } from "../../../src/features/eventos/eventos.servidor";
import { puestaAPuntoDelLocal } from "../../../src/features/identity/identidad.servidor";

/**
 * Inicio del back-office (F9-00) y tablero en vivo del local (F9-08).
 *
 * Las cifras del día salen del servidor: el resumen del día del libro de pagos (B3-5: lo vendido,
 * lo cobrado por medio, los turnos con su arqueo y las excepciones) y los niños atendidos de las
 * estancias (B4-2). Lo que pasa AHORA lo lee `EnVivo` de los eventos de la operación. Todo se
 * actualiza solo por el canal en vivo (B5-1).
 *
 * Las comandas que no salieron en papel las trae el proveedor de pedidos (B6-2).
 */
export const dynamic = "force-dynamic";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function InicioPage() {
  const [atendidos, turnos, resumen, catalogo, eventos, puesta] = await Promise.all([
    ninosAtendidos(),
    turnosAbiertos(),
    resumenDelDia(),
    catalogoDelLocal(),
    eventosDeHoy(),
    // La Puesta a punto (JORNADA §2, T-4) solo la recibe quien gestiona personas; a los demás, nada.
    puestaAPuntoDelLocal(),
  ]);
  // B9-5: lo que hay que reponer. Solo si algún producto a la venta lleva existencia.
  const contables = catalogo.productos.filter((p) => p.activo && p.controlaStock);
  const inventario = contables.length > 0 ? stockAlerts(contables) : null;
  // Un turno que sigue abierto de un día anterior (un corte de luz, un equipo dañado) va delante:
  // lo cierra supervisión antes de nada (JORNADA §3).
  const deAntes = turnos
    .filter((t) => resumen && t.businessDate < resumen.dia)
    .map((turno) => ({ turno, diferenciaEnDolares: null, firma: null }));
  const hoy = new Date();

  return (
    <>
    {/* Los niños atendidos y el día salen de la sala y de las cuentas: al cambiar, se vuelven a leer. */}
    <RefrescarAlCambiar temas={["sala", "cuentas", "eventos"]} />
    <InicioScreen
      resumen={resumen ? { ...resumen, turnos: [...deAntes, ...resumen.turnos] } : null}
      ninosHoy={atendidos?.hoy ?? 0}
      // Sin estancias de hace una semana no hay con qué comparar: se dice, no se inventa un cero.
      ninosSemanaPasada={atendidos && atendidos.semanaPasada > 0 ? atendidos.semanaPasada : null}
      fecha={`${hoy.getDate()} de ${MESES[hoy.getMonth()]}`}
      diaSemana={DIAS[hoy.getDay()] ?? "Hoy"}
      turnos={turnos.map((t) => ({ abiertoEn: t.abiertoEn, abiertoPor: t.abiertoPor.name, punto: t.punto }))}
      // Quién está en cada puesto sale de las sesiones de la base (B5-1): con un turno abierto, un
      // puesto sin nadie es noticia.
      enServicio={turnos.length > 0}
      inventario={inventario}
      eventosHoy={eventos?.reservas ?? []}
      puestaAPunto={puesta.ok ? puesta.valor : null}
    />
    </>
  );
}
