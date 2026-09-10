import Link from "next/link";
import { ArrowLeft, Hammer, Link2, ListChecks } from "lucide-react";
import { Container, PageHeader } from "@l2/ui";
import { rutaModulo, type Modulo, type Seccion } from "./navigation.ts";

/**
 * Pantalla de una sección todavía no construida — §8.6.
 *
 * §8.6 pide estados de carga, vacío y error **visibles**. Esto es el cuarto
 * caso: la pantalla que aún no existe. Un enlace muerto en el menú es la peor
 * versión —el usuario no sabe si falló él, el sistema o la conexión—, y
 * esconder la sección deja al cliente sin ver el alcance.
 *
 * Así que se dice, con las tres cosas que alguien querría saber: qué va a
 * hacer, qué tarea del plan la construye, y qué falta antes. Nada de «próxima-
 * mente» ni ilustraciones de relleno.
 */
export function SeccionPendienteScreen({
  modulo,
  seccion,
}: {
  modulo: Modulo;
  seccion: Seccion;
}) {
  const disponibles = modulo.secciones.filter((s) => s.href !== null);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: modulo.nombre, href: rutaModulo(modulo.id) },
          { texto: seccion.nombre },
        ]}
        titulo={seccion.nombre}
        descripcion={seccion.proposito}
      />

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <p className="flex items-center gap-2.5 text-[13px] font-semibold text-ink">
          <Hammer size={16} className="text-state-warn" aria-hidden="true" />
          Esta pantalla todavía no está construida
        </p>

        <dl className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-[13.5px]">
          {seccion.tarea && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="flex items-center gap-2 text-ink-3">
                <ListChecks size={14} aria-hidden="true" />
                Tarea del plan
              </dt>
              <dd className="font-mono text-ink">{seccion.tarea}</dd>
            </div>
          )}
          {seccion.necesita && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="flex items-center gap-2 shrink-0 text-ink-3">
                <Link2 size={14} aria-hidden="true" />
                Qué hace falta antes
              </dt>
              <dd className="min-w-0 flex-1 text-ink-2">{seccion.necesita}</dd>
            </div>
          )}
        </dl>
      </div>

      {disponibles.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            Mientras tanto, en {modulo.nombre}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {disponibles.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href!}
                  className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-line bg-surface px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
                >
                  {s.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href={rutaModulo(modulo.id)}
        className="mt-8 inline-flex min-h-11 items-center gap-2 text-[13.5px] text-ink-3 no-underline transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a {modulo.nombre}
      </Link>
    </Container>
  );
}
