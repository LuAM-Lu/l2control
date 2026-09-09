"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Baby,
  Calculator,
  ChefHat,
  CreditCard,
  KeyRound,
  LayoutGrid,
  LogIn,
  LogOut,
  Package,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import {
  MATRIZ,
  SURFACE_ACTION,
  can,
  visibleSurfaces,
  type Action,
  type Actor,
  type Permission,
  type Role,
  type SurfaceId,
} from "@l2/domain-identity";
import { Badge, Initial, cn } from "@l2/ui";

/**
 * Cáscara de la aplicación: navegación por rol.
 *
 * NO ES EL PANEL EJECUTIVO (F9). Aquí no hay métricas y no hacen falta datos:
 * esto responde «¿quién soy, qué puedo abrir y qué puedo hacer?», que es la
 * pregunta que se puede contestar antes de tener backend.
 *
 * Lo que se ve sale de la MATRIZ de §7.3, no de listas sueltas por pantalla.
 * Que el acceso a una superficie derive de una ACCIÓN evita el error clásico:
 * añadir un rol y olvidar actualizar catorce listas repartidas por el código.
 */

const ROLES: { role: Role; label: string; persona: string }[] = [
  { role: "ADMIN", label: "Administrador", persona: "Abigail Karam" },
  { role: "SUPERVISOR", label: "Supervisor", persona: "Luis Guerrero" },
  { role: "CAJERO", label: "Cajero", persona: "Marisol Prieto" },
  { role: "MESERO", label: "Mesero", persona: "Jesús Camacho" },
  { role: "MONITOR_PARQUE", label: "Monitor de parque", persona: "Ana Rojas" },
  { role: "COCINA", label: "Cocina", persona: "Diego Salas" },
];

const ORDEN: SurfaceId[] = [
  "monitor",
  "entrada",
  "salida",
  "caja",
  "turno",
  "mesas",
  "kds",
  "inventario",
  "reportes",
  "usuarios",
  "camaras",
];

/**
 * Rutas construidas. Es una unión y no `string` porque `typedRoutes` de Next
 * comprueba que existan: escribir una ruta que no está deja de compilar, en
 * lugar de dar un 404 en producción.
 */
type Ruta = "/monitor" | "/entrada" | "/salida" | "/caja" | "/turno" | "/acceso";

type SurfaceInfo = {
  nombre: string;
  nota: string;
  icon: typeof Baby;
  href: Ruta | null;
  fase: string;
};

const SUPERFICIES: Record<SurfaceId, SurfaceInfo> = {
  monitor: {
    nombre: "Monitor de parque",
    nota: "Estancias en sala con cronómetro y aforo",
    icon: Baby,
    href: "/monitor",
    fase: "F5-08",
  },
  entrada: {
    nombre: "Entrada",
    nota: "Registro por escaneo y cobro del paquete",
    icon: LogIn,
    href: "/entrada",
    fase: "F5-02",
  },
  salida: {
    nombre: "Salida",
    nota: "Liquidación con desglose del excedente",
    icon: LogOut,
    href: "/salida",
    fase: "F5-14",
  },
  caja: {
    nombre: "Caja",
    nota: "Cobro mixto, IGTF y vuelto",
    icon: CreditCard,
    href: "/caja",
    fase: "F4-03",
  },
  turno: {
    nombre: "Turno de caja",
    nota: "Arqueo por denominaciones y cortes X/Z",
    icon: Calculator,
    href: "/turno",
    fase: "F4-05",
  },
  mesas: {
    nombre: "Mesas y comandas",
    nota: "Plano de mesas y toma de pedidos",
    icon: LayoutGrid,
    href: null,
    fase: "F6",
  },
  kds: {
    nombre: "Cocina (KDS)",
    nota: "Comandas por antigüedad",
    icon: ChefHat,
    href: null,
    fase: "F6-07",
  },
  inventario: {
    nombre: "Inventario",
    nota: "Insumos, recetas y mermas",
    icon: Package,
    href: null,
    fase: "F8",
  },
  reportes: {
    nombre: "Reportes",
    nota: "Panel ejecutivo y excepciones",
    icon: ShieldCheck,
    href: null,
    fase: "F9",
  },
  usuarios: {
    nombre: "Usuarios y dispositivos",
    nota: "Roles, PIN y aprobación de aparatos",
    icon: Users,
    href: "/acceso",
    fase: "F2-03",
  },
  camaras: {
    nombre: "Cámaras",
    nota: "Videovigilancia en la LAN",
    icon: Video,
    href: null,
    fase: "F12",
  },
};

/** Agrupación de acciones para leerlas por temas, no como una lista plana. */
const GRUPOS: { titulo: string; acciones: Action[] }[] = [
  {
    titulo: "Caja y turno",
    acciones: ["turno.abrir", "turno.corteX", "turno.corteZ", "documento.emitir"],
  },
  {
    titulo: "Dinero sensible",
    acciones: [
      "cuenta.descuento",
      "cuenta.cortesia",
      "documento.notaCredito",
      "documento.reimprimir",
      "tasa.confirmar",
    ],
  },
  {
    titulo: "Parque",
    acciones: [
      "parque.checkIn",
      "parque.checkOut",
      "parque.extenderSinCobro",
      "parque.vincularMesa",
      "parque.verContacto",
    ],
  },
  {
    titulo: "Restaurante",
    acciones: [
      "pedido.tomar",
      "pedido.enviarCocina",
      "pedido.anularEnProduccion",
      "kds.cambiarEstado",
      "mesa.reabrir",
    ],
  },
  {
    titulo: "Administración",
    acciones: [
      "catalogo.modificar",
      "inventario.ajustar",
      "reportes.verSucursal",
      "reportes.verTodas",
      "usuarios.gestionar",
      "camaras.ver",
    ],
  },
];

const ETIQUETA: Partial<Record<Action, string>> = {
  "turno.abrir": "Abrir y cerrar turno",
  "turno.corteX": "Corte X",
  "turno.corteZ": "Corte Z",
  "documento.emitir": "Emitir documento",
  "cuenta.descuento": "Aplicar descuento",
  "cuenta.cortesia": "Marcar cortesía",
  "documento.notaCredito": "Nota de crédito",
  "documento.reimprimir": "Reimprimir documento",
  "tasa.confirmar": "Confirmar tasa de cambio",
  "parque.checkIn": "Registrar entrada",
  "parque.checkOut": "Registrar salida",
  "parque.extenderSinCobro": "Extender tiempo sin cobro",
  "parque.vincularMesa": "Vincular pulsera a mesa",
  "parque.verContacto": "Ver contacto del representante",
  "pedido.tomar": "Tomar pedido",
  "pedido.enviarCocina": "Enviar a cocina",
  "pedido.anularEnProduccion": "Anular ítem en producción",
  "kds.cambiarEstado": "Cambiar estado en cocina",
  "mesa.reabrir": "Reabrir mesa cerrada",
  "catalogo.modificar": "Modificar precios y recetas",
  "inventario.ajustar": "Ajustar inventario",
  "reportes.verSucursal": "Ver reportes de la sucursal",
  "reportes.verTodas": "Ver reportes de todas",
  "usuarios.gestionar": "Gestionar usuarios y PIN",
  "camaras.ver": "Ver cámaras",
};

const MARCA: Record<Permission, { texto: string; clase: string }> = {
  PERMITIDO: { texto: "Sí", clase: "text-state-ok" },
  REQUIERE_AUTORIZACION: { texto: "Con autorización", clase: "text-state-warn" },
  DENEGADO: { texto: "No", clase: "text-ink-3" },
};

export function AppShell() {
  const [rolIdx, setRolIdx] = useState(2); // arranca en Cajero: el caso más común
  const activo = ROLES[rolIdx]!;

  const actor: Actor = {
    id: `u-${activo.role}`,
    role: activo.role,
    branchIds: ["b1"],
  };

  const visibles = visibleSurfaces(actor, ORDEN);
  const conAutorizacion = (Object.keys(MATRIZ) as Action[]).filter(
    (a) => can(actor, a) === "REQUIERE_AUTORIZACION",
  ).length;

  return (
    <div className="min-h-dvh bg-base">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <Initial name={activo.persona} tone="brand" />
            <div>
              <p className="font-display leading-tight font-bold text-ink">{activo.persona}</p>
              <p className="text-[12.5px] text-ink-3">
                {activo.label} · Abby Kingdom · Turno tarde
              </p>
            </div>
          </div>

          <Link
            href="/acceso"
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-[13px] text-ink-2 transition-colors hover:text-ink"
          >
            <KeyRound size={15} aria-hidden="true" />
            Cambiar de usuario
          </Link>
        </div>
      </header>

      {/* Selector de rol: herramienta de prototipo, marcada como tal para que
          nadie la confunda con una función del producto. */}
      <div className="border-b border-line bg-surface/50">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-brand uppercase">
            Prototipo · ver el sistema como cada rol
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rol">
            {ROLES.map((r, i) => (
              <button
                key={r.role}
                type="button"
                role="radio"
                aria-checked={i === rolIdx}
                onClick={() => setRolIdx(i)}
                className={cn(
                  "min-h-10 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  i === rolIdx
                    ? "border-brand bg-brand/12 font-semibold text-brand"
                    : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1400px] gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------------------------------------ superficies */}
        <section>
          <h1 className="font-display text-2xl font-bold text-ink">
            Lo que {activo.persona.split(" ")[0]} puede abrir
          </h1>
          <p className="mt-1.5 mb-5 text-sm text-ink-2">
            {visibles.length} de {ORDEN.length} superficies. Las que no aparecen no es que estén
            ocultas: el rol no tiene permiso para llegar a ellas.
          </p>

          <ul className="grid gap-3 sm:grid-cols-2">
            {visibles.map((s) => {
              const info = SUPERFICIES[s];
              const Icon = info.icon;
              const permiso = can(actor, SURFACE_ACTION[s]);
              const construida = info.href !== null;

              const contenido = (
                <div
                  className={cn(
                    "flex h-full items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors",
                    construida
                      ? "border-line bg-surface hover:border-brand/40 hover:bg-surface-2"
                      : "border-dashed border-line bg-surface/40",
                  )}
                >
                  <Icon
                    size={20}
                    className={cn("mt-0.5 shrink-0", construida ? "text-brand" : "text-ink-3")}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-display font-semibold",
                          construida ? "text-ink" : "text-ink-3",
                        )}
                      >
                        {info.nombre}
                      </span>
                      <span className="font-mono text-[10px] text-ink-3">{info.fase}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">{info.nota}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!construida && (
                        <span className="text-[11px] text-ink-3">pendiente de construir</span>
                      )}
                      {permiso === "REQUIERE_AUTORIZACION" && (
                        <Badge tone="warn">Requiere autorización</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );

              return (
                <li key={s}>
                  {construida ? (
                    <Link href={info.href!} className="block h-full">
                      {contenido}
                    </Link>
                  ) : (
                    contenido
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* -------------------------------------- lo que puede hacer */}
        <aside>
          <h2 className="font-display text-lg font-bold text-ink">Lo que puede hacer</h2>
          <p className="mt-1 mb-4 text-[12.5px] text-ink-2">
            Sale de la matriz de permisos, no de una lista por pantalla.
            {conAutorizacion > 0 && (
              <>
                {" "}
                <strong className="text-state-warn">{conAutorizacion}</strong> de sus acciones
                exigen motivo y un segundo par de ojos.
              </>
            )}
          </p>

          <div className="flex flex-col gap-4">
            {GRUPOS.map((g) => (
              <div key={g.titulo} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  {g.titulo}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {g.acciones.map((a) => {
                    const p = can(actor, a);
                    return (
                      <li key={a} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className={p === "DENEGADO" ? "text-ink-3 line-through" : "text-ink-2"}>
                          {ETIQUETA[a] ?? a}
                        </span>
                        <span className={cn("shrink-0 text-[12px] font-medium", MARCA[p].clase)}>
                          {MARCA[p].texto}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </main>

      <footer className="mx-auto w-full max-w-[1400px] px-6 pb-8">
        <p className="border-t border-line pt-4 text-xs text-ink-3">
          Esto es la navegación por rol, no el panel ejecutivo. El panel con cifras llega en F9,
          cuando existan datos reales que mostrar — hoy cualquier número aquí sería inventado.
        </p>
      </footer>
    </div>
  );
}
