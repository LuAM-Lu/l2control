"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Maximize2 } from "lucide-react";
import { useOperador } from "../identity/operador.ts";
import { useAjustes } from "../identity/accesos.ts";
import { actorDe, puedeVerSeccion } from "../identity/visibilidad.ts";
import { Container, PageHeader, cn } from "@l2/ui";
import { buscarModulo, rutaSeccion } from "./navigation.ts";

/**
 * Página de un módulo del back-office — §9.10.3.
 *
 * Existe por una razón concreta: en el riel de la tablet el módulo es un
 * icono, y tocarlo tiene que llevar a algún sitio útil. Ese sitio es esta
 * página, que lista **qué hay dentro del módulo y qué no está todavía**.
 *
 * Las secciones sin construir se muestran, no se esconden. Esconderlas deja
 * al cliente sin ver el alcance del sistema; enseñarlas como si funcionaran
 * es peor. La tercera opción —decir qué harán, con qué tarea y qué falta
 * antes— es la única honesta.
 */
export function ModuloScreen({ moduloId }: { moduloId: string }) {
  // Llega el id, no el módulo: el módulo lleva su icono, que es una función,
  // y una función no cruza del servidor al cliente.
  const modulo = buscarModulo(moduloId)!;
  // Solo se llega con sesión: la guardia del panel ya lo comprobó.
  const operador = useOperador();
  const ajustes = useAjustes();
  const actor = operador ? actorDe(operador, ajustes) : null;
  const secciones = modulo.secciones.filter((s) => actor !== null && puedeVerSeccion(actor, modulo, s));
  const listas = secciones.filter((s) => s.href !== null);
  const pendientes = secciones.filter((s) => s.href === null);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: modulo.nombre }]}
        titulo={modulo.nombre}
        descripcion={modulo.resumen}
        meta={
          <span className="text-[12.5px] text-ink-3">
            {listas.length} {listas.length === 1 ? "pantalla lista" : "pantallas listas"}
            {pendientes.length > 0 && ` · ${pendientes.length} por construir`}
          </span>
        }
      />

      {listas.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            Disponible
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {listas.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href!}
                  className={cn(
                    "group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 no-underline shadow-card",
                    "transition-[transform,border-color,box-shadow] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
                    "hover:-translate-y-0.5 hover:border-brand/45 hover:shadow-lift",
                  )}
                >
                  <span className="font-display flex items-center gap-2 text-base font-bold text-ink">
                    {s.nombre}
                    <ArrowRight
                      size={15}
                      aria-hidden="true"
                      className="text-brand transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                    {s.proposito}
                  </span>
                  {s.abre === "estacion" && (
                    <span className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3">
                      <Maximize2 size={12} aria-hidden="true" />
                      Se abre a pantalla completa
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendientes.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            Por construir
          </h2>
          <ul className="flex flex-col gap-2.5">
            {pendientes.map((s) => (
              <li key={s.id}>
                <Link
                  href={rutaSeccion(modulo.id, s.id)}
                  className="flex items-start gap-3.5 rounded-[var(--radius-card)] border border-dashed border-line bg-surface/40 p-4 no-underline transition-colors hover:border-line-strong"
                >
                  <Clock3 size={17} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="font-display font-bold text-ink-2">{s.nombre}</span>
                      {s.tarea && (
                        <span className="font-mono text-[11px] text-ink-3">{s.tarea}</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-ink-3">
                      {s.proposito}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
