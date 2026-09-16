"use client";

import { useState } from "react";
import { Plus, Redo2, Undo2, Save, TriangleAlert, ChevronDown, ChevronRight, Edit2, ArchiveRestore, ArchiveX, Ban } from "lucide-react";
import { MenuSchema, type MenuDto, type MenuItemDto } from "@l2/contracts";
import { fromMajor, toMajor, money } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, avisar, cn, Dialog, Sheet, Badge, MoneyDisplay } from "@l2/ui";
import { useCarta } from "./CartaProvider";

/**
 * Carta y precios — F6-03, en Panel → Restaurante.
 *
 * Escrito por la obrera Gemini y revisado por la maestra (orquesta, 2026-09-16).
 *
 * Mismo trato que el plano (V4): se edita un BORRADOR y el salón solo ve la
 * carta cuando se publica. Cambiar un precio a mitad de servicio en la tablet
 * del mesero, plato a plato, es como se cobran dos precios en la misma mesa.
 *
 * Retirar un plato no lo borra (regla 5): lo marca con `retiredAt`. Las cuentas
 * y los recibos de ayer lo nombran por su id, y tienen que poder decir qué era.
 * Lo que decide si la carta es válida —precios, nombres repetidos, al menos un
 * plato en venta— es el contrato (`MenuSchema`); aquí solo se enseña su motivo.
 */

type Borrador = MenuDto;

export function EditorCarta() {
  const { carta: publicado, publicar } = useCarta();
  const [historial, setHistorial] = useState<Borrador[]>([publicado]);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<readonly string[]>([]);
  const [retiradosAbiertos, setRetiradosAbiertos] = useState(false);
  const [editando, setEditando] = useState<MenuItemDto | "nuevo" | null>(null);
  const [platoARetirar, setPlatoARetirar] = useState<MenuItemDto | null>(null);

  const borrador = historial[paso]!;
  const sucio = JSON.stringify(borrador) !== JSON.stringify(publicado);

  const enVenta = borrador.filter((i) => !i.retiredAt);
  const retirados = borrador.filter((i) => i.retiredAt);

  const categorias = [...new Set(enVenta.map((i) => i.category))];

  function cambiar(siguiente: Borrador) {
    setHistorial((h) => [...h.slice(0, paso + 1), siguiente]);
    setPaso((p) => p + 1);
    setErrores([]);
  }

  function alPublicar() {
    const r = MenuSchema.safeParse(borrador);
    if (!r.success) {
      setErrores([r.error.issues[0]?.message ?? "Error de validación"]);
      return;
    }
    publicar(r.data);
    setHistorial([r.data]);
    setPaso(0);
    setErrores([]);
    avisar.ok("Carta publicada", { detalle: "El salón ya ve los nuevos precios y platos." });
  }

  function descartar() {
    setHistorial([publicado]);
    setPaso(0);
    setErrores([]);
  }

  function retirar(plato: MenuItemDto) {
    cambiar(borrador.map((p) => (p.id === plato.id ? { ...p, retiredAt: new Date().toISOString() } : p)));
    setPlatoARetirar(null);
  }

  function devolver(plato: MenuItemDto) {
    const sinFecha = { ...plato };
    delete (sinFecha as { retiredAt?: string }).retiredAt;
    cambiar(borrador.map((p) => (p.id === plato.id ? sinFecha : p)));
  }

  function agotarReponer(plato: MenuItemDto) {
    cambiar(borrador.map((p) => (p.id === plato.id ? { ...p, available: !p.available } : p)));
  }

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Restaurante", href: "/panel/restaurante" },
          { texto: "Carta y precios" },
        ]}
        titulo="Carta y precios"
        descripcion="Lo que cambies aquí es un borrador: el salón lo verá cuando publiques."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Button surface="admin" variant="ghost" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
              <Undo2 size={15} aria-hidden="true" />
              Deshacer
            </Button>
            <Button
              surface="admin"
              variant="ghost"
              onClick={() => setPaso((p) => Math.min(historial.length - 1, p + 1))}
              disabled={paso >= historial.length - 1}
            >
              <Redo2 size={15} aria-hidden="true" />
              Rehacer
            </Button>
            <Button surface="admin" variant="neutral" onClick={() => setEditando("nuevo")}>
              <Plus size={15} aria-hidden="true" />
              Añadir plato
            </Button>
            <Button surface="admin" variant="ghost" onClick={descartar} disabled={!sucio}>
              Descartar cambios
            </Button>
            <Button surface="admin" variant="primary" onClick={alPublicar} disabled={!sucio}>
              <Save size={15} aria-hidden="true" />
              Publicar
            </Button>
          </div>
        }
      />

      {errores.length > 0 && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {errores[0]}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {categorias.length === 0 ? (
          <p className="text-[13px] text-ink-3">La carta está vacía. Añade un plato para empezar.</p>
        ) : (
          categorias.map((cat) => {
            const platosCat = enVenta.filter((p) => p.category === cat);
            return (
              <section key={cat} aria-label={`Categoría ${cat}`}>
                <h2 className="font-display mb-3 text-lg font-bold text-ink">{cat}</h2>
                {platosCat.length === 0 ? (
                  <p className="text-[13px] text-ink-3">No hay platos en esta categoría.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {platosCat.map((plato) => (
                      <li
                        key={plato.id}
                        className={cn(
                          "flex min-h-12 flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2",
                          !plato.available && "opacity-75"
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className={cn("truncate text-[14px] font-semibold", plato.available ? "text-ink" : "text-ink-2")}>
                            {plato.name}
                          </span>
                          {!plato.available && (
                            <Badge tone="warn" icon={<Ban size={12} aria-hidden="true" />}>
                              Agotado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-6">
                          <span className="tnum text-[14px] text-ink-2">
                            <MoneyDisplay value={toMajor(money(BigInt(plato.price.minor), plato.price.currency))} currency="USD" size="md" />
                          </span>
                          <div className="flex items-center gap-2">
                            <Button surface="admin" variant="ghost" onClick={() => setEditando(plato)} aria-label={`Editar ${plato.name}`}>
                              <Edit2 size={15} aria-hidden="true" />
                              Editar
                            </Button>
                            <Button surface="admin" variant="ghost" onClick={() => agotarReponer(plato)}>
                              {plato.available ? "Agotar" : "Reponer"}
                            </Button>
                            {/* Retirar no es peligroso —no borra nada—: rojo en el texto,
                                no un botón relleno en cada fila. */}
                            <Button
                              surface="admin"
                              variant="ghost"
                              className="text-state-crit hover:text-state-crit"
                              onClick={() => setPlatoARetirar(plato)}
                              aria-label={`Retirar ${plato.name}`}
                            >
                              <ArchiveX size={15} aria-hidden="true" />
                              Retirar
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}

        <section aria-label="Platos retirados" className="mt-8 border-t border-line pt-6">
          <button
            type="button"
            onClick={() => setRetiradosAbiertos((a) => !a)}
            className="flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 text-[14px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {retiradosAbiertos ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Platos retirados ({retirados.length})
          </button>

          {retiradosAbiertos && (
            <div className="mt-4">
              {retirados.length === 0 ? (
                <p className="text-[13px] text-ink-3">No hay platos retirados.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {retirados.map((plato) => (
                    <li
                      key={plato.id}
                      className="flex min-h-12 flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border border-dashed border-line bg-surface-2 px-4 py-2 opacity-70"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="truncate text-[14px] text-ink-2">{plato.name}</span>
                        <span className="text-[12px] text-ink-3">({plato.category})</span>
                      </div>
                      <Button surface="admin" variant="neutral" onClick={() => devolver(plato)}>
                        <ArchiveRestore size={15} aria-hidden="true" />
                        Volver a la carta
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog
        abierto={platoARetirar !== null}
        onCerrar={() => setPlatoARetirar(null)}
        titulo="¿Retirar de la carta?"
        descripcion="El plato dejará de ofrecerse, pero se conservará para las cuentas y recibos anteriores. Podrás volver a ponerlo en la carta más adelante."
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button surface="tablet" variant="neutral" onClick={() => setPlatoARetirar(null)}>
              Cancelar
            </Button>
            <Button surface="tablet" variant="danger" onClick={() => platoARetirar && retirar(platoARetirar)}>
              Sí, retirar
            </Button>
          </div>
        }
      >
        <p className="text-[14px] font-semibold text-ink">{platoARetirar?.name}</p>
      </Dialog>

      {/* La hoja se monta al abrirse, con su propia key: así sus campos nacen del
          plato que se edita. (La versión de la obrera los rellenaba con una
          propiedad `onAbierto` que la hoja no tiene, y abría vacía al editar.) */}
      {editando !== null && (
      <SheetEditarPlato
        key={editando === "nuevo" ? "nuevo" : editando.id}
        onCerrar={() => setEditando(null)}
        plato={editando === "nuevo" ? null : editando}
        categorias={categorias}
        onGuardar={(nuevo) => {
          if (editando === "nuevo") {
            cambiar([...borrador, nuevo]);
          } else {
            cambiar(borrador.map((p) => (p.id === nuevo.id ? nuevo : p)));
          }
          setEditando(null);
        }}
        borrador={borrador}
      />
      )}
    </Container>
  );
}

function SheetEditarPlato({
  onCerrar,
  plato,
  categorias,
  onGuardar,
  borrador,
}: {
  onCerrar: () => void;
  plato: MenuItemDto | null;
  categorias: string[];
  onGuardar: (p: MenuItemDto) => void;
  borrador: MenuDto;
}) {
  const [nombre, setNombre] = useState(plato?.name ?? "");
  const [categoria, setCategoria] = useState(plato?.category ?? categorias[0] ?? "");
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [modoCategoria, setModoCategoria] = useState<"lista" | "nueva">(
    plato || categorias.length > 0 ? "lista" : "nueva",
  );
  // Precio en texto, como lo escribe una persona. Al guardar se acepta la coma.
  const [precioTexto, setPrecioTexto] = useState(
    plato ? toMajor(money(BigInt(plato.price.minor), plato.price.currency)) : "",
  );
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null);

  function procesarId(texto: string) {
    const base =
      texto
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "plato";
    const sello = Date.now().toString(36);
    // Un contador, no otra lectura del reloj: en el mismo milisegundo
    // `Date.now()` devuelve lo mismo y el bucle no terminaría nunca.
    let id = `${base}-${sello}`;
    for (let n = 2; borrador.some((p) => p.id === id); n += 1) id = `${base}-${sello}-${n}`;
    return id;
  }

  function guardar() {
    let catFinal = modoCategoria === "nueva" ? nuevaCategoria.trim() : categoria;
    if (!catFinal) catFinal = "Sin categoría";

    let precio;
    try {
      const limpio = precioTexto.trim().replace(/,/g, ".");
      precio = fromMajor(limpio, "USD");
      if (precio.amount <= 0n) {
        setErrorPrecio("El precio debe ser mayor que cero.");
        return;
      }
    } catch {
      setErrorPrecio("Escribe el precio en dólares, por ejemplo 8,50.");
      return;
    }
    setErrorPrecio(null);

    const dto: MenuItemDto = {
      id: plato?.id ?? procesarId(nombre),
      name: nombre.trim(),
      category: catFinal,
      price: { minor: precio.amount.toString(), currency: "USD" },
      available: plato ? plato.available : true,
      ...(plato?.retiredAt ? { retiredAt: plato.retiredAt } : {}),
    };

    onGuardar(dto);
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={plato ? "Editar plato" : "Añadir plato"}
      descripcion="Ajusta el nombre, la categoría y el precio del plato."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="tablet" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" disabled={!nombre.trim() || (modoCategoria === "nueva" && !nuevaCategoria.trim()) || !precioTexto.trim()} onClick={guardar}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Input label="Nombre del plato" surface="admin" value={nombre} onChange={(e) => setNombre(e.target.value)} />

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Categoría</p>
          {modoCategoria === "lista" && categorias.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoria(c)}
                    className={cn(
                      "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                      c === categoria
                        ? "border-brand bg-brand font-semibold text-on-brand"
                        : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <Button surface="admin" variant="ghost" className="w-fit text-[12px]" onClick={() => setModoCategoria("nueva")}>
                <Plus size={13} aria-hidden="true" />
                Crear nueva categoría
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                label="Nueva categoría"
                surface="admin"
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
              />
              {categorias.length > 0 && (
                <Button surface="admin" variant="ghost" className="w-fit text-[12px]" onClick={() => setModoCategoria("lista")}>
                  Volver a las existentes
                </Button>
              )}
            </div>
          )}
        </div>

        {/* El error va junto al campo, con el `error` del propio Input (§8.7). */}
        <Input
          label="Precio (USD)"
          surface="admin"
          type="text"
          inputMode="decimal"
          value={precioTexto}
          error={errorPrecio ?? undefined}
          onChange={(e) => {
            setPrecioTexto(e.target.value);
            setErrorPrecio(null);
          }}
        />
      </div>
    </Sheet>
  );
}
