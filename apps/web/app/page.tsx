import Link from "next/link";
import { ArrowRight, Baby, ChefHat, CreditCard, LayoutDashboard, LogIn, LogOut, Calculator, KeyRound } from "lucide-react";

/** Índice temporal de superficies. Se reemplaza por el login en F2. */
const SURFACES = [
  {
    href: "/acceso" as const,
    name: "Acceso por PIN",
    phase: "F2-03",
    ready: true,
    icon: KeyRound,
    note: "El dispositivo es el primer factor; el PIN, el segundo. Con bloqueo creciente.",
  },
  {
    href: "/monitor" as const,
    name: "Monitor de parque",
    phase: "F5-08",
    ready: true,
    icon: Baby,
    note: "Tarjetas de estancia con cronómetro del servidor, aforo y lectura de pulsera.",
  },
  {
    href: "/entrada" as const,
    name: "Entrada al parque",
    phase: "F5-02",
    ready: true,
    icon: LogIn,
    note: "Registro por escaneo, búsqueda de representante y cobro del paquete.",
  },
  {
    href: "/salida" as const,
    name: "Salida del parque",
    phase: "F5-14",
    ready: true,
    icon: LogOut,
    note: "Liquidación con desglose del excedente; cobro en taquilla o cargo a una mesa.",
  },
  {
    href: "/caja" as const,
    name: "Caja",
    phase: "F4-03",
    ready: true,
    icon: CreditCard,
    note: "Cobro mixto multimoneda, IGTF sobre divisas y vuelto con sus tres destinos.",
  },
  {
    href: "/turno" as const,
    name: "Turno de caja",
    phase: "F4-05/07",
    ready: true,
    icon: Calculator,
    note: "Arqueo por denominaciones, cortes X y Z, y reporte de excepciones.",
  },
  {
    href: "/monitor" as const,
    name: "Cocina (KDS)",
    phase: "F6-07",
    ready: false,
    icon: ChefHat,
    note: "Comandas por antigüedad, objetivos táctiles de 64 px.",
  },
  {
    href: "/monitor" as const,
    name: "Administración",
    phase: "F9",
    ready: false,
    icon: LayoutDashboard,
    note: "Panel ejecutivo, inventario y auditoría.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header>
        <p className="mb-3 font-mono text-xs tracking-widest text-brand uppercase">
          Fase 1 · cimientos
        </p>
        <h1 className="font-display text-4xl font-bold text-ink">L2 Control</h1>
        <p className="mt-3 max-w-prose text-ink-2">
          Monorepo activo con tokens de diseño, biblioteca de componentes y dominio puro. La primera
          superficie operativa es el monitor de parque, según la prioridad acordada.
        </p>
      </header>

      <div className="grid gap-3">
        {SURFACES.map((s) => {
          const Icon = s.icon;
          const card = (
            <div
              className={`flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 ${
                s.ready ? "transition-colors hover:bg-surface-2" : "opacity-55"
              }`}
            >
              <Icon size={22} className="shrink-0 text-ink-3" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-display font-semibold text-ink">{s.name}</span>
                  <span className="font-mono text-[11px] text-ink-3">{s.phase}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-2">{s.note}</p>
              </div>
              {s.ready ? (
                <ArrowRight size={18} className="shrink-0 text-brand" aria-hidden="true" />
              ) : (
                <span className="shrink-0 text-xs text-ink-3">pendiente</span>
              )}
            </div>
          );

          return s.ready ? (
            <Link key={s.name} href={s.href} className="rounded-[var(--radius-card)]">
              {card}
            </Link>
          ) : (
            <div key={s.name}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
