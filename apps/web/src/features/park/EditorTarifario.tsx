"use client";

import { useState } from "react";
import { Plus, Redo2, Undo2, Save, TriangleAlert, ChevronDown, ChevronRight, Edit2, ArchiveRestore, ArchiveX } from "lucide-react";
import { TarifarioSchema, type ParkPolicyDto, type PricePackageDto, type TarifarioDto } from "@l2/contracts";
import { fromMajor, toMajor } from "@l2/domain-money";
import { computeOverdueBreakdown, computeSessionView, epochMs, fixed, type ParkSession } from "@l2/domain-park";
import { Button, Container, Dialog, Input, MoneyDisplay, PageHeader, Sheet, avisar, cn, formatMoneyVE } from "@l2/ui";
import { toMoney, toParkPolicy } from "./mappers.ts";
import { useTarifario } from "./TarifarioProvider";

/**
 * Editor de Tarifas y paquetes — F5-04, F5-06, en Panel → Parque.
 *
 * Mismo trato que la carta: se edita un BORRADOR y el parque solo ve el
 * tarifario cuando se publica.
 * Retirar un paquete no lo borra: lo marca con `active: false`.
 */

type Borrador = TarifarioDto;

/** «30 min», «1 h», «1 h 30 min» o «Tiempo libre». */
function duracionLegible(d: PricePackageDto["duration"]): string {
  if (d.kind === "openEnded") return "Tiempo libre";
  const h = Math.floor(d.minutes / 60);
  const m = d.minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function EditorTarifario() {
  const { tarifario: publicado, publicar } = useTarifario();
  const [historial, setHistorial] = useState<Borrador[]>([publicado]);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<readonly string[]>([]);
  const [retiradosAbiertos, setRetiradosAbiertos] = useState(false);
  const [editando, setEditando] = useState<PricePackageDto | "nuevo" | null>(null);
  const [paqueteARetirar, setPaqueteARetirar] = useState<PricePackageDto | null>(null);

  const borrador = historial[paso]!;
  const sucio = JSON.stringify(borrador) !== JSON.stringify(publicado);

  const enVenta = borrador.packages.filter((p) => p.active);
  const retirados = borrador.packages.filter((p) => !p.active);

  function cambiar(siguiente: Borrador) {
    setHistorial((h) => [...h.slice(0, paso + 1), siguiente]);
    setPaso((p) => p + 1);
    setErrores([]);
  }

  function alPublicar() {
    const r = TarifarioSchema.safeParse(borrador);
    if (!r.success) {
      setErrores([r.error.issues[0]?.message ?? "Error de validación"]);
      return;
    }
    publicar(r.data);
    setHistorial([r.data]);
    setPaso(0);
    setErrores([]);
    avisar.ok("Tarifario publicado", { detalle: "La entrada ya usa los nuevos paquetes y reglas." });
  }

  function descartar() {
    setHistorial([publicado]);
    setPaso(0);
    setErrores([]);
  }

  function retirar(paquete: PricePackageDto) {
    cambiar({
      ...borrador,
      packages: borrador.packages.map((p) => (p.id === paquete.id ? { ...p, active: false } : p)),
    });
    setPaqueteARetirar(null);
  }

  function devolver(paquete: PricePackageDto) {
    cambiar({
      ...borrador,
      packages: borrador.packages.map((p) => (p.id === paquete.id ? { ...p, active: true } : p)),
    });
  }

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Parque", href: "/panel/parque" },
          { texto: "Tarifas y paquetes" },
        ]}
        titulo="Tarifas y paquetes"
        descripcion="Lo que cambies aquí es un borrador: la entrada lo verá cuando publiques."
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
              Añadir paquete
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
        <section aria-label="Paquetes">
          <h2 className="font-display mb-3 text-lg font-bold text-ink">Paquetes</h2>
          {enVenta.length === 0 ? (
            <p className="text-[13px] text-ink-3">No hay paquetes a la venta. Añade uno para empezar.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {enVenta.map((paquete) => {
                const duracion = duracionLegible(paquete.duration);
                const modo = paquete.mode === "PREPAGO" ? "Se paga al entrar" : "Se paga al salir";

                return (
                  <li
                    key={paquete.id}
                    className="flex min-h-12 flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="truncate text-[14px] font-semibold text-ink">{paquete.name}</span>
                      <span className="text-[13px] text-ink-2">• {duracion}</span>
                      <span className="text-[13px] text-ink-3">• {modo}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <MoneyDisplay value={toMajor(toMoney(paquete.price))} currency={paquete.price.currency} size="md" />
                      <div className="flex items-center gap-2">
                        <Button surface="admin" variant="ghost" onClick={() => setEditando(paquete)} aria-label={`Editar ${paquete.name}`}>
                          <Edit2 size={15} aria-hidden="true" />
                          Editar
                        </Button>
                        <Button
                          surface="admin"
                          variant="ghost"
                          className="text-state-crit hover:text-state-crit"
                          onClick={() => setPaqueteARetirar(paquete)}
                          aria-label={`Retirar ${paquete.name}`}
                        >
                          <ArchiveX size={15} aria-hidden="true" />
                          Retirar
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Paquetes retirados" className="border-t border-line pt-6">
          <button
            type="button"
            aria-expanded={retiradosAbiertos}
            onClick={() => setRetiradosAbiertos((a) => !a)}
            className="flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 text-[14px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {retiradosAbiertos ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            Paquetes retirados ({retirados.length})
          </button>

          {retiradosAbiertos && (
            <div className="mt-4">
              {retirados.length === 0 ? (
                <p className="text-[13px] text-ink-3">No hay paquetes retirados.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {retirados.map((paquete) => (
                    <li
                      key={paquete.id}
                      className="flex min-h-12 flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border border-dashed border-line bg-surface-2 px-4 py-2 opacity-70"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="truncate text-[14px] text-ink-2">{paquete.name}</span>
                        <span className="text-[12px] text-ink-3">
                          ({duracionLegible(paquete.duration)})
                        </span>
                      </div>
                      <Button surface="admin" variant="neutral" onClick={() => devolver(paquete)}>
                        <ArchiveRestore size={15} aria-hidden="true" />
                        Volver a la venta
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section aria-label="Reglas del parque" className="border-t border-line pt-6">
          <h2 className="font-display mb-4 text-lg font-bold text-ink">Reglas del parque</h2>
          <EditorReglas
            key={JSON.stringify(borrador.policy)}
            policy={borrador.policy}
            onChange={(nuevaPolicy) => cambiar({ ...borrador, policy: nuevaPolicy })}
          />
        </section>
      </div>

      <Dialog
        abierto={paqueteARetirar !== null}
        onCerrar={() => setPaqueteARetirar(null)}
        titulo="¿Retirar de la venta?"
        descripcion="El paquete dejará de ofrecerse, pero se conservará para las estancias anteriores. Podrás volver a ponerlo a la venta más adelante."
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button surface="tablet" variant="neutral" onClick={() => setPaqueteARetirar(null)}>
              Cancelar
            </Button>
            <Button surface="tablet" variant="danger" onClick={() => paqueteARetirar && retirar(paqueteARetirar)}>
              Sí, retirar
            </Button>
          </div>
        }
      >
        <p className="text-[14px] font-semibold text-ink">{paqueteARetirar?.name}</p>
      </Dialog>

      {editando !== null && (
        <SheetEditarPaquete
          key={editando === "nuevo" ? "nuevo" : editando.id}
          onCerrar={() => setEditando(null)}
          paquete={editando === "nuevo" ? null : editando}
          onGuardar={(nuevo) => {
            if (editando === "nuevo") {
              cambiar({ ...borrador, packages: [...borrador.packages, nuevo] });
            } else {
              cambiar({
                ...borrador,
                packages: borrador.packages.map((p) => (p.id === nuevo.id ? nuevo : p)),
              });
            }
            setEditando(null);
          }}
          borrador={borrador}
        />
      )}
    </Container>
  );
}

type CampoRegla = "gracia" | "bloque" | "precio" | "aviso" | "aforo";
type TextosReglas = Record<CampoRegla, string>;

const ENTERO = /^\d+$/;

function textosDe(p: ParkPolicyDto): TextosReglas {
  return {
    gracia: String(p.graceMinutes),
    bloque: String(p.penaltyBlockMinutes),
    precio: toMajor(toMoney(p.penaltyPricePerBlock)),
    aviso: String(p.warnBeforeMinutes),
    aforo: String(p.capacityLimit),
  };
}

/** El precio tecleado (admite coma decimal), o `null` si no es un monto. */
function precioDe(texto: string) {
  try {
    return fromMajor(texto.trim().replace(",", "."), "USD");
  } catch {
    return null;
  }
}

function erroresDe(t: TextosReglas): Partial<Record<CampoRegla, string>> {
  const e: Partial<Record<CampoRegla, string>> = {};
  if (!ENTERO.test(t.gracia.trim())) e.gracia = "Minutos enteros, 0 o más";
  if (!ENTERO.test(t.bloque.trim()) || Number(t.bloque) <= 0) e.bloque = "Minutos enteros, mayor que 0";
  const precio = precioDe(t.precio);
  if (!precio || precio.amount < 0n) e.precio = "Escribe el precio en dólares, por ejemplo 1,50";
  if (!ENTERO.test(t.aviso.trim())) e.aviso = "Minutos enteros, 0 o más";
  if (!ENTERO.test(t.aforo.trim()) || Number(t.aforo) <= 0) e.aforo = "Niños, mayor que 0";
  return e;
}

/** Solo se llama con textos sin errores. */
function politicaDe(t: TextosReglas): ParkPolicyDto {
  return {
    graceMinutes: Number(t.gracia),
    penaltyBlockMinutes: Number(t.bloque),
    penaltyPricePerBlock: { minor: String(precioDe(t.precio)!.amount), currency: "USD" },
    warnBeforeMinutes: Number(t.aviso),
    capacityLimit: Number(t.aforo),
  };
}

/**
 * El excedente de ejemplo lo calcula el dominio, no la pantalla (§9.7): una
 * estancia de 60 minutos que se pasa `minutosDeMas`.
 */
function ejemploExcedente(p: ParkPolicyDto, minutosDeMas: number) {
  const politica = toParkPolicy(p);
  const estancia: ParkSession = {
    id: "ejemplo",
    childName: "Ejemplo",
    wristbandCode: "EJEMPLO",
    mode: "PREPAGO",
    duration: fixed(60),
    startedAt: epochMs(0),
  };
  const vista = computeSessionView(estancia, politica, epochMs((60 + minutosDeMas) * 60_000));
  return computeOverdueBreakdown(vista, politica);
}

/**
 * Las reglas del parque, en el borrador.
 *
 * Se teclea texto y el error sale junto al campo mientras se escribe; el
 * borrador cambia al SALIR del campo, y solo si todo es válido: un paso de
 * deshacer por campo, no uno por tecla. Quien la usa la monta con `key` de la
 * política, así que deshacer, rehacer o descartar la vuelven a leer.
 */
function EditorReglas({
  policy,
  onChange,
}: {
  policy: ParkPolicyDto;
  onChange: (p: ParkPolicyDto) => void;
}) {
  const [textos, setTextos] = useState<TextosReglas>(() => textosDe(policy));
  const errores = erroresDe(textos);
  const valida = Object.keys(errores).length === 0;

  function escribir(campo: CampoRegla, valor: string) {
    setTextos((t) => ({ ...t, [campo]: valor }));
  }

  function confirmar() {
    if (!valida) return;
    const nueva = politicaDe(textos);
    if (JSON.stringify(nueva) !== JSON.stringify(policy)) onChange(nueva);
  }

  const minutosEjemplo = 20;
  const ejemplo = ejemploExcedente(policy, minutosEjemplo);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          label="Minutos de gracia"
          surface="admin"
          inputMode="numeric"
          value={textos.gracia}
          error={errores.gracia}
          hint="0 es «sin gracia»: se cobra desde el primer minuto de más"
          onChange={(e) => escribir("gracia", e.target.value)}
          onBlur={confirmar}
        />
        <Input
          label="Bloque de excedente (min)"
          surface="admin"
          inputMode="numeric"
          value={textos.bloque}
          error={errores.bloque}
          hint="Se cobra cada bloque iniciado"
          onChange={(e) => escribir("bloque", e.target.value)}
          onBlur={confirmar}
        />
        <Input
          label="Precio por bloque (USD)"
          surface="admin"
          inputMode="decimal"
          value={textos.precio}
          error={errores.precio}
          onChange={(e) => escribir("precio", e.target.value)}
          onBlur={confirmar}
        />
        <Input
          label="Aviso antes de vencer (min)"
          surface="admin"
          inputMode="numeric"
          value={textos.aviso}
          error={errores.aviso}
          hint="Cuándo la tarjeta del monitor pasa a «por vencer»"
          onChange={(e) => escribir("aviso", e.target.value)}
          onBlur={confirmar}
        />
        <Input
          label="Aforo (niños)"
          surface="admin"
          inputMode="numeric"
          value={textos.aforo}
          error={errores.aforo}
          onChange={(e) => escribir("aforo", e.target.value)}
          onBlur={confirmar}
        />
      </div>

      <p className="rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 py-3 text-[14px] text-ink-2">
        <strong className="text-ink">Ejemplo:</strong> con estas reglas, un niño que se pasa {minutosEjemplo} minutos
        paga{" "}
        <span className="tnum">
          {ejemplo.blocks} {ejemplo.blocks === 1 ? "bloque" : "bloques"}
        </span>
        : <strong className="tnum text-ink">{formatMoneyVE(toMajor(ejemplo.charge), "USD")}</strong>
      </p>
    </div>
  );
}

function SheetEditarPaquete({
  onCerrar,
  paquete,
  onGuardar,
  borrador,
}: {
  onCerrar: () => void;
  paquete: PricePackageDto | null;
  onGuardar: (p: PricePackageDto) => void;
  borrador: TarifarioDto;
}) {
  const [nombre, setNombre] = useState(paquete?.name ?? "");
  const [tipo, setTipo] = useState<"fijo" | "libre">(paquete?.duration.kind === "fixed" ? "fijo" : paquete?.duration.kind === "openEnded" ? "libre" : "fijo");
  const [minutosTexto, setMinutosTexto] = useState(paquete?.duration.kind === "fixed" ? paquete.duration.minutes.toString() : "60");
  const [precioTexto, setPrecioTexto] = useState(
    paquete ? toMajor(toMoney(paquete.price)) : ""
  );

  const [errorMinutos, setErrorMinutos] = useState<string | null>(null);
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null);

  function procesarId(texto: string) {
    const base =
      texto
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "pkg";
    const sello = Date.now().toString(36);
    let id = `${base}-${sello}`;
    for (let n = 2; borrador.packages.some((p) => p.id === id); n += 1) id = `${base}-${sello}-${n}`;
    return id;
  }

  function guardar() {
    let minutos = 0;
    if (tipo === "fijo") {
      minutos = parseInt(minutosTexto, 10);
      if (isNaN(minutos) || minutos <= 0) {
        setErrorMinutos("Debe ser mayor que 0");
        return;
      }
    }
    setErrorMinutos(null);

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

    const dto: PricePackageDto = {
      id: paquete?.id ?? procesarId(nombre),
      name: nombre.trim(),
      mode: tipo === "fijo" ? "PREPAGO" : "POSTPAGO",
      duration: tipo === "fijo" ? { kind: "fixed", minutes: minutos } : { kind: "openEnded" },
      price: { minor: precio.amount.toString(), currency: "USD" },
      active: paquete ? paquete.active : true,
    };

    onGuardar(dto);
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={paquete ? "Editar paquete" : "Añadir paquete"}
      descripcion="Ajusta el nombre, la duración y el precio del paquete."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="tablet" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" disabled={!nombre.trim() || !precioTexto.trim()} onClick={guardar}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Input label="Nombre del paquete" surface="admin" value={nombre} onChange={(e) => setNombre(e.target.value)} />

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Tipo de tiempo</p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={tipo === "fijo"}
              onClick={() => setTipo("fijo")}
              className={cn(
                "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                tipo === "fijo"
                  ? "border-brand bg-brand font-semibold text-on-brand"
                  : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              )}
            >
              Tiempo fijo
            </button>
            <button
              type="button"
              aria-pressed={tipo === "libre"}
              onClick={() => setTipo("libre")}
              className={cn(
                "min-h-8 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                tipo === "libre"
                  ? "border-brand bg-brand font-semibold text-on-brand"
                  : "border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              )}
            >
              Tiempo libre
            </button>
          </div>
        </div>

        {tipo === "fijo" && (
          <Input
            label="Minutos"
            surface="admin"
            type="number"
            min="1"
            value={minutosTexto}
            error={errorMinutos ?? undefined}
            onChange={(e) => {
              setMinutosTexto(e.target.value);
              setErrorMinutos(null);
            }}
          />
        )}

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
