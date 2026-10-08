"use client";

import { createContext, useContext, useEffect, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { can } from "@l2/domain-identity";
import { Container, PageHeader, cn } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { buscarModulo, buscarSeccion, rutaModulo, rutaPestana } from "./navigation.ts";

/**
 * Una sección con pestañas (T-18, M-29): lo que eran secciones hermanas vive junto, bajo un solo nombre. Personas y
 * equipos (usuarios, roles y dispositivos), Tasas con sus feriados, Sistema (versión, respaldos y semilla) y la carta
 * dentro de Productos. Arriba, las migas, el nombre de la sección y sus pestañas; debajo, la pantalla de la pestaña,
 * que conserva su descripción y sus acciones (`EncabezadoDePagina`).
 *
 * La pestaña va en la dirección (`?pestana=…`): se enlaza, se recarga y vuelve atrás como cualquier página, y el
 * servidor lee solo lo de la pestaña abierta. Cada pestaña se ve con su permiso; si la pedida no alcanza, se va a la
 * primera que sí.
 */

const EnMarco = createContext(false);

export function MarcoDeSeccion({ modulo, seccion, actual, children }: { modulo: string; seccion: string; actual: string; children: ReactNode }) {
  const m = buscarModulo(modulo);
  const s = m ? buscarSeccion(m, seccion) : undefined;
  const actor = useActorEnSesion();
  const { ajustes } = useSucursal();
  const router = useRouter();
  const visibles = (s?.pestanas ?? []).filter((p) => !p.accion || (actor !== null && can(actor, p.accion) !== "DENEGADO"));
  const destino = visibles.some((p) => p.id === actual) ? null : (visibles[0]?.id ?? null);
  useEffect(() => {
    if (destino) router.replace(rutaPestana(modulo, seccion, destino));
  }, [destino, modulo, seccion, router]);
  if (!m || !s) return <>{children}</>;

  return (
    <>
      <Container ancho="panel" className="shrink-0 pt-8">
        <PageHeader migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: m.nombre, href: rutaModulo(m.id) }, { texto: s.nombre }]} titulo={s.nombre} className="mb-4" />
        <nav aria-label={`Pestañas de ${s.nombre}`} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-1 [scrollbar-width:none]">
          {visibles.map((p) => {
            const elegida = p.id === actual;
            return (
              <Link
                key={p.id}
                href={rutaPestana(modulo, seccion, p.id)}
                aria-current={elegida ? "page" : undefined}
                className={cn(
                  "flex min-h-8 shrink-0 items-center rounded-[var(--radius-control)] px-3 text-detalle whitespace-nowrap no-underline transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  elegida ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
                )}
              >
                {p.nombre}
              </Link>
            );
          })}
        </nav>
      </Container>
      {/* La pantalla de la pestaña trae su propio margen arriba: dentro del marco, más corto. Y llena el alto que queda,
          como fuera de él (Productos y la carta desplazan por dentro). */}
      <div className="flex min-h-0 flex-1 flex-col [&>*:first-child]:pt-5">
        <EnMarco.Provider value>{children}</EnMarco.Provider>
      </div>
    </>
  );
}

/**
 * La cabecera de una pantalla del panel. Sola, es la de siempre (`PageHeader`). Dentro de una sección con pestañas,
 * las migas y el nombre ya los pone el marco: queda la descripción de la pestaña y sus acciones.
 */
export function EncabezadoDePagina(props: ComponentProps<typeof PageHeader>) {
  const enMarco = useContext(EnMarco);
  if (!enMarco) return <PageHeader {...props} />;
  const { titulo, descripcion, acciones, meta, className } = props;
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <h2 className="sr-only">{titulo}</h2>
        {descripcion && <p className="max-w-[62ch] text-subtitulo text-ink-2">{descripcion}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-3">{meta}</div>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </header>
  );
}
