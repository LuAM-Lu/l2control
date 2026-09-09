import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Cabecera de una página del back-office: migas, título, descripción y
 * acciones. Existe porque cada pantalla se estaba inventando la suya, y eso
 * es exactamente lo que hace que un producto se sienta desordenado — no la
 * falta de adornos, sino que dos páginas parecidas no se parezcan.
 *
 * Las migas **no son decoración**: en un back-office con módulos anidados son
 * la única forma de saber dónde estás y de subir un nivel. Un producto sin
 * ellas obliga a usar el botón del navegador, que es rendirse.
 */

export type Miga = { texto: string; href?: string };

export function PageHeader({
  migas,
  titulo,
  descripcion,
  acciones,
  meta,
  className,
}: {
  migas?: readonly Miga[];
  titulo: string;
  descripcion?: string;
  /** Botones a la derecha del título. */
  acciones?: ReactNode;
  /** Datos de contexto bajo el título: estado, hora, quién. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      {migas && migas.length > 0 && (
        <nav aria-label="Ruta de navegación" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            {migas.map((m, i) => {
              const ultima = i === migas.length - 1;
              return (
                <li key={`${m.texto}-${i}`} className="flex items-center gap-1.5">
                  {m.href && !ultima ? (
                    <a
                      href={m.href}
                      className="rounded text-ink-3 no-underline transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      {m.texto}
                    </a>
                  ) : (
                    <span className={ultima ? "text-ink-2" : "text-ink-3"}>{m.texto}</span>
                  )}
                  {!ultima && (
                    <span className="text-ink-3/60" aria-hidden="true">
                      /
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] leading-tight font-bold tracking-[-0.025em] text-ink">
            {titulo}
          </h1>
          {descripcion && (
            <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
              {descripcion}
            </p>
          )}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-3">{meta}</div>}
        </div>

        {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </div>
    </header>
  );
}
