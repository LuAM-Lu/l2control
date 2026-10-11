"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOperador } from "../identity/operador.ts";
import { useActorEnSesion } from "../identity/sesion.ts";
import { modulosVisibles, puedeVerInicio } from "../identity/visibilidad.ts";
import { INICIO, rutaModulo } from "./navigation.ts";

/**
 * El riel del panel en la caja — T-21 (M-38, W-7).
 *
 * En escritorio (1440 px o más), a la izquierda de la caja, un riel fino con los módulos del panel: Inicio, Parque,
 * Restaurante, Inventario, Reportes y Ajustes, a un clic sin buscar el camino. Por debajo de 1440 no está: la laptop
 * de 1366 necesita el ancho para la cola y el cobro, y «Panel» en la barra lleva a Inicio. Solo lo ve quien puede abrir
 * el panel, y solo los módulos de su rol.
 */
const CAJA = ["/caja", "/turno", "/papel", "/deudas", "/personal"];
const DEL_RIEL = new Set(["parque", "restaurante", "inventario", "reportes", "ajustes"]);

export function RielDelPanel() {
  const pathname = usePathname();
  const operador = useOperador();
  const actor = useActorEnSesion();
  const enCaja = CAJA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (!enCaja || !operador || !actor || !puedeVerInicio(actor)) return null;
  const destinos = [
    { id: INICIO.id, nombre: INICIO.nombre, icon: INICIO.icon, href: INICIO.href },
    ...modulosVisibles(actor)
      .filter((m) => DEL_RIEL.has(m.id))
      .map((m) => ({ id: m.id, nombre: m.nombre, icon: m.icon, href: rutaModulo(m.id) })),
  ];
  return (
    <nav aria-label="Módulos del panel" className="hidden w-24 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface/40 py-2 min-[1440px]:flex">
      {destinos.map((d) => {
        const Icono = d.icon;
        return (
          <Link
            key={d.id}
            href={d.href}
            title={`${d.nombre}: abre el panel`}
            className="flex w-[5.5rem] flex-col items-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-ink-2 no-underline transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Icono className="size-(--icono-tablet)" aria-hidden="true" />
            <span className="text-nota leading-tight font-medium whitespace-nowrap">{d.nombre}</span>
          </Link>
        );
      })}
    </nav>
  );
}
