"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Baby,
  ChevronDown,
  CreditCard,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { can, type Action, type Actor } from "@l2/domain-identity";
import { Initial, cn } from "@l2/ui";

/**
 * Barra lateral del back-office — §9.10.3.
 *
 * **Se recorta sola por permisos.** Cada módulo declara la ACCIÓN que lo abre,
 * no una lista de roles: así, añadir un rol nuevo no obliga a recordar catorce
 * sitios donde actualizarlo (§7.3).
 *
 * Y no la llevan las estaciones. El monitor de pared, el KDS y la caja van a
 * pantalla completa: una barra lateral les roba espacio y les da aire de
 * herramienta administrativa (§9.10.2).
 */

type Ruta = "/inicio" | "/monitor" | "/entrada" | "/salida" | "/caja" | "/turno";

type Modulo = {
  id: string;
  nombre: string;
  icon: LucideIcon;
  /** Acción que da acceso al módulo. Deny by default si no la tiene. */
  accion: Action;
  href: Ruta | null;
  hijos?: { nombre: string; href: Ruta | null; accion?: Action }[];
};

const MODULOS: Modulo[] = [
  { id: "inicio", nombre: "Inicio", icon: House, accion: "reportes.verSucursal", href: "/inicio" },
  {
    id: "parque",
    nombre: "Parque",
    icon: Baby,
    accion: "parque.checkIn",
    href: null,
    hijos: [
      { nombre: "Sala en vivo", href: "/monitor" },
      { nombre: "Entrada", href: "/entrada" },
      { nombre: "Salida", href: "/salida" },
      { nombre: "Tarifas y paquetes", href: null, accion: "catalogo.modificar" },
    ],
  },
  {
    id: "restaurante",
    nombre: "Restaurante",
    icon: LayoutGrid,
    accion: "pedido.tomar",
    href: null,
    hijos: [
      { nombre: "Mesas y zonas", href: null },
      { nombre: "Menú", href: null, accion: "catalogo.modificar" },
      { nombre: "Comandas del día", href: null },
    ],
  },
  {
    id: "caja",
    nombre: "Caja",
    icon: CreditCard,
    accion: "documento.emitir",
    href: null,
    hijos: [
      { nombre: "Cobrar", href: "/caja" },
      { nombre: "Turnos y cortes", href: "/turno" },
      { nombre: "Tasas de cambio", href: null, accion: "tasa.confirmar" },
    ],
  },
  {
    id: "inventario",
    nombre: "Inventario",
    icon: Package,
    accion: "inventario.ajustar",
    href: null,
    hijos: [
      { nombre: "Insumos", href: null },
      { nombre: "Recetas", href: null },
      { nombre: "Compras", href: null },
    ],
  },
  {
    id: "personas",
    nombre: "Personas",
    icon: Users,
    accion: "parque.verContacto",
    href: null,
    hijos: [
      { nombre: "Representantes y niños", href: null },
      { nombre: "Usuarios y permisos", href: null, accion: "usuarios.gestionar" },
      { nombre: "Dispositivos", href: "/acceso" as Ruta, accion: "usuarios.gestionar" },
    ],
  },
  {
    id: "configuracion",
    nombre: "Configuración",
    icon: Settings,
    accion: "catalogo.modificar",
    href: null,
    hijos: [
      { nombre: "Sucursal", href: null },
      { nombre: "Impuestos", href: null },
      { nombre: "Impresoras", href: null },
    ],
  },
];

export function AdminSidebar({
  actor,
  usuario,
  rol,
}: {
  actor: Actor;
  usuario: string;
  rol: string;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState<string | null>("parque");
  const [movilAbierto, setMovilAbierto] = useState(false);

  const visibles = MODULOS.filter((m) => can(actor, m.accion) !== "DENEGADO");

  const contenido = (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="font-display grid size-9 place-content-center rounded-[0.6rem] bg-brand text-[15px] font-bold text-on-brand">
          L2
        </span>
        <div className="min-w-0">
          <p className="font-display truncate leading-tight font-bold text-ink">Abby Kingdom</p>
          <p className="truncate text-[11.5px] text-ink-3">Sucursal única</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="flex flex-col gap-0.5">
          {visibles.map((m) => {
            const Icon = m.icon;
            const activo = m.href !== null && pathname === m.href;
            const hijosVisibles = (m.hijos ?? []).filter(
              (h) => !h.accion || can(actor, h.accion) !== "DENEGADO",
            );
            const desplegado = abierto === m.id;
            const algunHijoActivo = hijosVisibles.some((h) => h.href === pathname);

            return (
              <li key={m.id}>
                {m.href ? (
                  <Link
                    href={m.href}
                    onClick={() => setMovilAbierto(false)}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13.5px] no-underline transition-colors",
                      activo
                        ? "bg-brand/12 font-semibold text-brand"
                        : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {m.nombre}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-expanded={desplegado}
                    onClick={() => setAbierto(desplegado ? null : m.id)}
                    className={cn(
                      "flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13.5px] transition-colors",
                      algunHijoActivo
                        ? "font-semibold text-ink"
                        : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {m.nombre}
                    <ChevronDown
                      size={14}
                      className={cn(
                        "ml-auto text-ink-3 transition-transform",
                        desplegado && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                )}

                {desplegado && hijosVisibles.length > 0 && (
                  <ul className="mt-0.5 mb-1 ml-[1.85rem] flex flex-col gap-0.5 border-l border-line pl-3">
                    {hijosVisibles.map((h) => {
                      const hijoActivo = h.href === pathname;
                      const contenidoHijo = (
                        <span
                          className={cn(
                            "flex min-h-9 items-center rounded-[var(--radius-control)] px-2.5 text-[13px] transition-colors",
                            h.href === null
                              ? "text-ink-3"
                              : hijoActivo
                                ? "bg-brand/10 font-medium text-brand"
                                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          {h.nombre}
                          {h.href === null && (
                            <span className="ml-auto text-[10px] text-ink-3">pendiente</span>
                          )}
                        </span>
                      );
                      return (
                        <li key={h.nombre}>
                          {h.href ? (
                            <Link
                              href={h.href}
                              onClick={() => setMovilAbierto(false)}
                              className="block no-underline"
                            >
                              {contenidoHijo}
                            </Link>
                          ) : (
                            contenidoHijo
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-3 border-t border-line px-4 py-4">
        <Initial name={usuario} tone="idle" className="size-8 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{usuario}</p>
          <p className="truncate text-[11.5px] text-ink-3">{rol}</p>
        </div>
        <Link
          href="/acceso"
          aria-label="Salir"
          title="Salir"
          className="grid size-8 place-content-center rounded text-ink-3 transition-colors hover:text-ink"
        >
          <LogOut size={15} aria-hidden="true" />
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Barra fija en escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface/40 lg:flex">
        {contenido}
      </aside>

      {/* En móvil, panel deslizable: el dueño entra desde el teléfono (DEC-16). */}
      <button
        type="button"
        onClick={() => setMovilAbierto(true)}
        aria-label="Abrir menú"
        className="fixed bottom-5 left-5 z-30 grid size-12 cursor-pointer place-content-center rounded-full border border-line bg-surface text-ink shadow-lg lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {movilAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMovilAbierto(false)}
            className="absolute inset-0 cursor-default bg-black/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-base">
            <button
              type="button"
              onClick={() => setMovilAbierto(false)}
              aria-label="Cerrar menú"
              className="absolute top-4 right-4 grid size-8 cursor-pointer place-content-center rounded text-ink-3 hover:text-ink"
            >
              <X size={18} aria-hidden="true" />
            </button>
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
