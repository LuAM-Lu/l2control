"use client";

import { useState } from "react";
import { List } from "lucide-react";
import { nameKey } from "@l2/domain-inventory";
import { cn } from "@l2/ui";

const NUEVA = "__nueva__";

/**
 * La categoría de un producto, de una lista que se despliega — B9-11 (M-34, S-3).
 *
 * En el local, la categoría se escribía en un campo con sugerencias que no se veían: cada quien la tecleaba a su manera.
 * Aquí se elige de las categorías del local; «Escribir una nueva…» abre el campo para una que no está, y el botón de al
 * lado vuelve a la lista. Lo pegado o escrito que no está en la lista se ve escrito, como nueva.
 */
export function CampoCategoria({
  valor,
  onCambio,
  categorias,
  etiqueta,
  className,
}: {
  valor: string;
  onCambio: (v: string) => void;
  categorias: readonly string[];
  /** El nombre accesible del campo («Categoría de la fila 3»). */
  etiqueta: string;
  className?: string;
}) {
  const conocida = categorias.find((c) => nameKey(c) === nameKey(valor)) ?? null;
  const [escribiendo, setEscribiendo] = useState(false);
  const aMano = escribiendo || (valor.trim() !== "" && conocida === null);

  if (aMano) {
    return (
      <span className="flex min-w-0 gap-1">
        <input
          aria-label={`${etiqueta} (nueva)`}
          className={cn(className, "min-w-0 flex-1")}
          autoComplete="off"
          placeholder="Categoría nueva"
          value={valor}
          maxLength={24}
          autoFocus={escribiendo}
          onChange={(e) => onCambio(e.target.value)}
        />
        <button
          type="button"
          aria-label="Elegir de la lista de categorías"
          title="Elegir de la lista"
          onClick={() => {
            setEscribiendo(false);
            onCambio("");
          }}
          className="grid min-h-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] border border-line px-2 text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          <List size={14} aria-hidden="true" />
        </button>
      </span>
    );
  }
  return (
    <select
      aria-label={etiqueta}
      className={cn(className, "cursor-pointer")}
      value={conocida ?? ""}
      onChange={(e) => {
        if (e.target.value === NUEVA) {
          setEscribiendo(true);
          onCambio("");
          return;
        }
        onCambio(e.target.value);
      }}
    >
      <option value="" disabled>
        Elige…
      </option>
      {categorias.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NUEVA}>Escribir una nueva…</option>
    </select>
  );
}
