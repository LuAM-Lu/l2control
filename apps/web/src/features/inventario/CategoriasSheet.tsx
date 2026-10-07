"use client";

import { useState } from "react";
import { Check, GitMerge, Pencil, Plus, Tags, X } from "lucide-react";
import type { CatalogoDto, CategoriaCommand, CategoriaDto } from "@l2/contracts";
import { CATEGORY_MAX_LENGTH, categoryProblem } from "@l2/domain-inventory";
import { Button, Confirmacion, Input, Sheet, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { aplicarCategoria } from "./productos.acciones";

/**
 * Inventario → Productos → Categorías (T-10, M-24). La lista del local: las pestañas de la caja y el
 * filtro de Productos. Nace con unas de arranque; se crea, se renombra (y con ella sus productos), se
 * une a otra (sus productos pasan a esa) y se retira la que está vacía. Cada cambio es del catálogo:
 * confirma identidad, y quién puede y si vale lo decide el servidor.
 */
export function CategoriasSheet({
  abierto,
  onCerrar,
  catalogo,
  onCambio,
}: {
  abierto: boolean;
  onCerrar: () => void;
  catalogo: CatalogoDto;
  onCambio: (c: CatalogoDto) => void;
}) {
  const conElevacion = useConElevacion();
  const [nueva, setNueva] = useState("");
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [renombrando, setRenombrando] = useState<{ id: string; nombre: string; error: string | null } | null>(null);
  const [uniendo, setUniendo] = useState<{ origen: CategoriaDto; en: string } | null>(null);
  const lista = catalogo.categorias;

  async function aplicar(cmd: CategoriaCommand, que: string): Promise<string | null> {
    setOcupado(que);
    try {
      const r = await conElevacion(() => aplicarCategoria(cmd));
      if (r.ok) {
        onCambio(r.valor);
        return null;
      }
      return r.mensaje;
    } catch {
      return "El servidor no respondió. No se guardó nada.";
    } finally {
      setOcupado(null);
    }
  }

  async function crear() {
    const problema = categoryProblem(nueva);
    if (problema) return setErrorNueva(problema === "CORTA" ? "Escribe la categoría" : `Hasta ${CATEGORY_MAX_LENGTH} caracteres`);
    const error = await aplicar({ kind: "CREAR", nombre: nueva }, "crear");
    if (error) return setErrorNueva(error);
    avisar.ok(`«${nueva.trim()}» está en la lista`);
    setNueva("");
  }

  async function renombrar() {
    if (!renombrando) return;
    const error = await aplicar({ kind: "RENOMBRAR", id: renombrando.id, nombre: renombrando.nombre }, `renombrar-${renombrando.id}`);
    if (error) return setRenombrando({ ...renombrando, error });
    avisar.ok("Categoría renombrada", { detalle: "Sus productos ya la llevan con el nombre nuevo." });
    setRenombrando(null);
  }

  async function unir() {
    if (!uniendo) return;
    const destino = lista.find((c) => c.id === uniendo.en);
    const error = await aplicar({ kind: "UNIR", id: uniendo.origen.id, en: uniendo.en }, `unir-${uniendo.origen.id}`);
    setUniendo(null);
    if (error) return avisar.error(error);
    avisar.ok(`«${uniendo.origen.nombre}» se unió a «${destino?.nombre ?? "la otra"}»`);
  }

  async function retirar(c: CategoriaDto) {
    const error = await aplicar({ kind: "RETIRAR", id: c.id }, `retirar-${c.id}`);
    if (error) return avisar.error(error);
    avisar.ok(`«${c.nombre}» ya no está en la lista`);
  }

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Categorías"
      descripcion="Las pestañas de la caja y el filtro de Productos. Renombrar o unir una cambia la categoría de sus productos."
    >
      <div className="flex flex-col gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado) void crear();
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="Nueva categoría"
              surface="admin"
              autoComplete="off"
              maxLength={CATEGORY_MAX_LENGTH}
              placeholder="Combos"
              value={nueva}
              error={errorNueva ?? undefined}
              onChange={(e) => {
                setNueva(e.target.value);
                setErrorNueva(null);
              }}
            />
          </div>
          <Button type="submit" variant="neutral" surface="admin" className="gap-1.5" disabled={ocupado !== null || nueva.trim().length === 0}>
            <Plus size={15} aria-hidden="true" />
            {ocupado === "crear" ? "Añadiendo…" : "Añadir"}
          </Button>
        </form>

        {lista.length === 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line px-4 py-6 text-[13px] text-ink-2">
            <Tags size={16} aria-hidden="true" />
            Todavía no hay categorías. Añade la primera arriba.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {lista.map((c) => {
              const editando = renombrando?.id === c.id;
              const otras = lista.filter((x) => x.id !== c.id);
              return (
                <li key={c.id} className="flex flex-col gap-2 px-3 py-2.5">
                  {editando ? (
                    <form
                      className="flex items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!ocupado) void renombrar();
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <Input
                          label={`Nuevo nombre de «${c.nombre}»`}
                          surface="admin"
                          autoComplete="off"
                          autoFocus
                          maxLength={CATEGORY_MAX_LENGTH}
                          value={renombrando.nombre}
                          error={renombrando.error ?? undefined}
                          onChange={(e) => setRenombrando({ id: c.id, nombre: e.target.value, error: null })}
                        />
                      </div>
                      <Button type="submit" variant="primary" surface="admin" aria-label="Guardar el nombre" disabled={ocupado !== null || renombrando.nombre.trim().length < 2}>
                        <Check size={15} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" surface="admin" aria-label="Cancelar" onClick={() => setRenombrando(null)}>
                        <X size={15} aria-hidden="true" />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{c.nombre}</span>
                      <span className={cn("tnum shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium", c.productos > 0 ? "bg-surface-2 text-ink-2" : "text-ink-3")}>
                        {c.productos === 0 ? "sin productos" : c.productos === 1 ? "1 producto" : `${c.productos} productos`}
                      </span>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          surface="admin"
                          className="px-2"
                          aria-label={`Renombrar «${c.nombre}»`}
                          title="Renombrar"
                          disabled={ocupado !== null}
                          onClick={() => setRenombrando({ id: c.id, nombre: c.nombre, error: null })}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </Button>
                        {otras.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            surface="admin"
                            className="px-2"
                            aria-label={`Unir «${c.nombre}» a otra`}
                            title="Unir a otra"
                            disabled={ocupado !== null}
                            onClick={() => setUniendo({ origen: c, en: otras[0]!.id })}
                          >
                            <GitMerge size={14} aria-hidden="true" />
                          </Button>
                        )}
                        {c.productos === 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            surface="admin"
                            className="px-2"
                            aria-label={`Retirar «${c.nombre}»`}
                            title="Retirar (no tiene productos)"
                            disabled={ocupado !== null}
                            onClick={() => void retirar(c)}
                          >
                            <X size={14} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Confirmacion
        abierto={uniendo !== null}
        onCerrar={() => setUniendo(null)}
        titulo={uniendo ? `Unir «${uniendo.origen.nombre}» a otra categoría` : "Unir"}
        confirmar="Sí, unirlas"
        onConfirmar={() => void unir()}
        ocupado={ocupado !== null}
      >
        {uniendo && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Se une a</span>
              <select
                className="min-h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                value={uniendo.en}
                onChange={(e) => setUniendo({ ...uniendo, en: e.target.value })}
              >
                {lista
                  .filter((x) => x.id !== uniendo.origen.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <p className="text-[13px] text-ink-2">
              {uniendo.origen.productos === 0
                ? `«${uniendo.origen.nombre}» no tiene productos: sale de la lista.`
                : `${uniendo.origen.productos === 1 ? "Su producto pasa" : `Sus ${uniendo.origen.productos} productos pasan`} a esa categoría y «${uniendo.origen.nombre}» sale de la lista.`}
            </p>
          </div>
        )}
      </Confirmacion>
    </Sheet>
  );
}
