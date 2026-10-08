"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, MinusCircle, PlusCircle, Sprout, TriangleAlert } from "lucide-react";
import {
  ParteDeSemillaSchema,
  PARTES_CON_ELEMENTOS,
  SemillaSchema,
  elementosDeSemilla,
  recortarSemilla,
  type FueraDeSemilla,
  type InformeDeSemillaDto,
  type ParteConElementos,
  type ParteDeSemilla,
  type SemillaDto,
} from "@l2/contracts";
import { nameKey } from "@l2/domain-inventory";
import { Button, Container, PageHeader, Sheet, TAMANO_ICONO, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useReloj, useSucursal } from "./SucursalProvider.tsx";
import { cargarSemilla, exportarSemilla } from "./semilla.acciones";

/**
 * Ajustes → Semilla del local (B7-2, M-24; con casillas, B7-7, M-29). Lo tedioso de teclear viaja en un
 * archivo: se descarga de un local y se carga en otro, que solo AÑADE lo que le falta. Es el camino de la
 * corrida limpia de producción: base nueva y la semilla, sin sacar partes de un respaldo.
 *
 * Al descargar, la semilla se enseña antes con casillas (cada parte y cada elemento de sus listas; lo que se
 * llama «Prueba…» sale desmarcado) y el archivo lleva solo lo marcado. Al cargar, el servidor revisa qué entra
 * y la pantalla enseña lo mismo con sus casillas antes de cargar. El recorte lo hace `recortarSemilla` (el
 * mismo contrato que revalida el servidor); qué entra y qué ya está, el servidor.
 */

const NOMBRE: Readonly<Record<ParteDeSemilla, string>> = {
  AJUSTES: "Ajustes de la sucursal",
  IMPUESTOS: "Impuestos",
  MEDIOS: "Medios de pago",
  TARIFARIO: "Tarifas y paquetes",
  CATEGORIAS: "Categorías",
  PRODUCTOS: "Carta y productos",
  DESCUENTOS: "Descuentos",
  PLANO: "Plano del local",
  CUMPLEANOS: "Paquetes de cumpleaños",
  IMPRESORAS: "Impresoras",
};

const ESTADO = {
  CARGA: { texto: "Entra", icono: PlusCircle, clase: "text-state-ok" },
  YA_ESTA: { texto: "Ya está", icono: CheckCircle2, clase: "text-ink-2" },
  NO_TRAE: { texto: "No la trae", icono: MinusCircle, clase: "text-ink-3" },
} as const;

/** «Abby Kingdom» → «abby-kingdom», para el nombre del archivo. */
const enArchivo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "local";

/** Lo de prueba no va a producción: sale desmarcado. */
const esDePrueba = (nombre: string) => nameKey(nombre).startsWith("prueba");
const conElementos = (p: ParteDeSemilla): p is ParteConElementos => (PARTES_CON_ELEMENTOS as readonly ParteDeSemilla[]).includes(p);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una parte en la lista de casillas: si se puede marcar, qué dice y sus elementos. */
type Fila = Readonly<{ parte: ParteDeSemilla; disponible: boolean; detalle: string; elementos: readonly string[]; avisos: readonly string[]; estado: keyof typeof ESTADO | null }>;

/** Lo que se deja fuera: partes enteras y elementos desmarcados. */
type Seleccion = Readonly<{ partes: ReadonlySet<ParteDeSemilla>; elementos: ReadonlyMap<ParteConElementos, ReadonlySet<string>> }>;

/** De entrada, todo marcado salvo lo que se llama «Prueba…». */
function seleccionInicial(filas: readonly Fila[]): Seleccion {
  const elementos = new Map<ParteConElementos, Set<string>>();
  for (const f of filas) if (conElementos(f.parte)) elementos.set(f.parte, new Set(f.elementos.filter(esDePrueba)));
  return { partes: new Set(), elementos };
}

function fueraDe(s: Seleccion, filas: readonly Fila[]): FueraDeSemilla {
  return {
    // Solo lo desmarcado: lo que ya está viaja igual (el servidor lo vuelve a ver «ya está» y no escribe nada).
    partes: filas.filter((f) => f.disponible && s.partes.has(f.parte)).map((f) => f.parte),
    elementos: Object.fromEntries([...s.elementos].map(([p, quitados]) => [p, [...quitados]])),
  };
}

/** Cuántos elementos (o partes enteras) van con la selección. */
function cuantosVan(s: Seleccion, filas: readonly Fila[]): number {
  return filas
    .filter((f) => f.disponible && !s.partes.has(f.parte))
    .reduce((n, f) => n + (conElementos(f.parte) ? f.elementos.filter((e) => !s.elementos.get(f.parte as ParteConElementos)?.has(e)).length : 1), 0);
}

/** Lo que lleva una semilla descargada, parte por parte, para elegirlo antes de bajar el archivo. */
function filasDeSemilla(s: SemillaDto): Fila[] {
  const e = elementosDeSemilla(s);
  const mesas = s.plano?.tables.filter((t) => !t.retiredAt).length ?? 0;
  const describir: Readonly<Record<ParteDeSemilla, string>> = {
    AJUSTES: s.ajustes ? `«${s.ajustes.nombre}», ${s.ajustes.preciosConIva ? "precios con el IVA incluido" : "IVA aparte"}` : "Este local no publicó sus ajustes",
    IMPUESTOS: e.IMPUESTOS.length > 0 ? e.IMPUESTOS.join(", ") : "Sin impuestos programados",
    MEDIOS: s.medios ? `${plural(s.medios.medios.filter((m) => m.activo).length, "medio encendido", "medios encendidos")} de ${s.medios.medios.length}, con los datos que el cliente ve para pagar` : "Sin medios",
    TARIFARIO: s.tarifario ? `${plural(s.tarifario.packages.length, "paquete", "paquetes")}, aforo de ${s.tarifario.policy.capacityLimit}` : "Sin tarifas publicadas",
    CATEGORIAS: plural(e.CATEGORIAS.length, "categoría", "categorías"),
    PRODUCTOS: `${plural(e.PRODUCTOS.length, "producto", "productos")} a la venta, con su precio de hoy y sin existencias`,
    DESCUENTOS: e.DESCUENTOS.length > 0 ? `${plural(e.DESCUENTOS.length, "regla vigente", "reglas vigentes")}; las familias VIP no viajan` : "Sin descuentos vigentes",
    PLANO: s.plano ? plural(mesas, "mesa", "mesas") : "Sin plano",
    CUMPLEANOS: s.cumpleanos ? `${plural(e.CUMPLEANOS.length, "paquete", "paquetes")}, anticipo del ${s.cumpleanos.anticipoBps / 100} %` : "Sin paquetes de cumpleaños",
    IMPRESORAS: e.IMPRESORAS.length > 0 ? `${plural(e.IMPRESORAS.length, "impresora", "impresoras")}; en el otro local entran apagadas` : "Sin impresoras",
  };
  return ParteDeSemillaSchema.options.map((parte) => {
    const elementos = conElementos(parte) ? e[parte] : [];
    const disponible = parte === "AJUSTES" ? s.ajustes !== null : parte === "TARIFARIO" ? s.tarifario !== null : parte === "PLANO" ? s.plano !== null : elementos.length > 0;
    return { parte, disponible, detalle: describir[parte], elementos, avisos: [], estado: null };
  });
}

export function SemillaScreen() {
  const conElevacion = useConElevacion();
  const reloj = useReloj();
  const { ajustes } = useSucursal();
  const archivo = useRef<HTMLInputElement>(null);
  const [preparando, setPreparando] = useState(false);
  /** La semilla de este local, enseñada con sus casillas antes de bajarla. */
  const [preparada, setPreparada] = useState<SemillaDto | null>(null);
  const [semilla, setSemilla] = useState<{ nombre: string; contenido: unknown } | null>(null);
  const [informe, setInforme] = useState<InformeDeSemillaDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"revisar" | "cargar" | null>(null);

  const filasDeCarga = useMemo<Fila[]>(
    () =>
      informe?.partes.map((p) => ({
        parte: p.parte,
        disponible: p.estado === "CARGA" && !informe.cargada,
        detalle: p.detalle,
        elementos: p.elementos,
        avisos: p.avisos,
        estado: p.estado,
      })) ?? [],
    [informe],
  );
  const [seleccionDeCarga, setSeleccionDeCarga] = useState<Seleccion>(() => seleccionInicial([]));

  async function preparar() {
    setPreparando(true);
    try {
      const r = await conElevacion(() => exportarSemilla());
      if (!r.ok) return avisar.error(r.mensaje);
      setPreparada(r.valor);
    } catch {
      avisar.error("El servidor no respondió. No se preparó nada.");
    } finally {
      setPreparando(false);
    }
  }

  function descargar(s: SemillaDto) {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `semilla-${enArchivo(s.local)}-${s.exportadaEn.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    avisar.ok("Semilla descargada", { detalle: `${plural(s.productos.length, "producto", "productos")}, ${plural(s.categorias.length, "categoría", "categorías")}.` });
    setPreparada(null);
  }

  async function enviar(contenido: unknown, cargar: boolean) {
    setOcupado(cargar ? "cargar" : "revisar");
    setError(null);
    try {
      const r = await conElevacion(() => cargarSemilla({ semilla: contenido, cargar }));
      if (!r.ok) {
        setInforme(null);
        return setError(r.mensaje);
      }
      setInforme(r.valor);
      if (!cargar) {
        setSeleccionDeCarga(
          seleccionInicial(r.valor.partes.map((p) => ({ parte: p.parte, disponible: p.estado === "CARGA", detalle: p.detalle, elementos: p.elementos, avisos: p.avisos, estado: p.estado }))),
        );
      }
      if (r.valor.cargada) avisar.ok("Semilla cargada", { detalle: "Lo marcado que faltaba ya está en este local." });
    } catch {
      setError("El servidor no respondió. No se cargó nada: vuelve a intentarlo.");
    } finally {
      setOcupado(null);
    }
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    setInforme(null);
    setError(null);
    let contenido: unknown;
    try {
      contenido = JSON.parse(await f.text());
    } catch {
      setSemilla(null);
      return setError(`«${f.name}» no es una semilla: no se puede leer.`);
    }
    setSemilla({ nombre: f.name, contenido });
    await enviar(contenido, false);
  }

  /** Carga solo lo marcado: la semilla recortada es otra semilla, que el servidor revalida. */
  function cargarLoMarcado() {
    if (!semilla) return;
    const s = SemillaSchema.safeParse(semilla.contenido);
    if (!s.success) return setError("Esa semilla no se puede recortar: vuelve a elegir el archivo.");
    void enviar(recortarSemilla(s.data, fueraDe(seleccionDeCarga, filasDeCarga)), true);
  }

  const vanEnLaCarga = cuantosVan(seleccionDeCarga, filasDeCarga);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Semilla del local" }]}
        titulo="Semilla del local"
        descripcion="Lo que se tarda en teclear, en un archivo: se descarga de un local y se carga en otro, que solo añade lo que le falta. Es el camino para arrancar producción en una base limpia."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="semilla-descargar" className="flex flex-col gap-3 self-start rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <h2 id="semilla-descargar" className="flex items-center gap-2 font-display text-seccion font-bold text-ink">
            <Download size={TAMANO_ICONO.admin} aria-hidden="true" />
            Descargar la de este local
          </h2>
          <p className="text-detalle text-ink-2">
            Lleva los ajustes, los impuestos, los medios de pago con sus datos, las tarifas y paquetes, las categorías y la carta con
            sus precios, los descuentos, el plano, los cumpleaños y las impresoras. Antes de bajarla eliges qué va: lo de prueba sale
            desmarcado.
          </p>
          <p className="text-nota text-ink-3">Nunca lleva personas, PIN, llaves, equipos ni existencias: se dan de alta (o se cuentan) en cada local.</p>
          <Button type="button" variant="primary" surface="admin" className="mt-1 gap-1.5 self-start" disabled={preparando} onClick={() => void preparar()}>
            <Download size={TAMANO_ICONO.admin} aria-hidden="true" />
            {preparando ? "Preparando…" : "Preparar semilla"}
          </Button>
        </section>

        <section aria-labelledby="semilla-cargar" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <h2 id="semilla-cargar" className="flex items-center gap-2 font-display text-seccion font-bold text-ink">
            <Sprout size={TAMANO_ICONO.admin} aria-hidden="true" />
            Cargar una semilla
          </h2>
          <p className="text-detalle text-ink-2">
            Elige el archivo: primero se revisa qué entra y qué ya está, y eliges con las casillas qué cargar. Solo se añade lo que
            falta; lo que este local ya tiene no se toca.
          </p>
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Archivo de la semilla"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={informe ? "neutral" : "primary"} surface="admin" className="gap-1.5" disabled={ocupado !== null} onClick={() => archivo.current?.click()}>
              <FileUp size={TAMANO_ICONO.admin} aria-hidden="true" />
              {ocupado === "revisar" ? "Revisando…" : semilla ? "Elegir otro archivo" : "Elegir archivo"}
            </Button>
            {semilla && <span className="min-w-0 truncate text-nota text-ink-3">{semilla.nombre}</span>}
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-detalle text-state-crit">
              <TriangleAlert size={TAMANO_ICONO.texto} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {informe && (
            <div className="flex flex-col gap-3">
              <p className="tnum text-nota text-ink-2">
                De <strong className="text-ink">{informe.local}</strong>, descargada el {reloj.diaConAnio(Date.parse(informe.exportadaEn))} a las{" "}
                {reloj.hora(Date.parse(informe.exportadaEn))}.
              </p>
              {informe.cargada && (
                <p role="status" className="flex items-center gap-2 rounded-[var(--radius-control)] bg-state-ok-bg p-3 text-detalle font-medium text-state-ok">
                  <CheckCircle2 size={TAMANO_ICONO.texto} className="shrink-0" aria-hidden="true" />
                  Cargada. Lo que dice «Entró» ya está en este local.
                </p>
              )}
              <Casillas filas={filasDeCarga} seleccion={seleccionDeCarga} onCambiar={setSeleccionDeCarga} cargada={informe.cargada} />
              {!informe.cargada && (
                <Button type="button" variant="primary" surface="admin" className="gap-1.5 self-start" disabled={vanEnLaCarga === 0 || ocupado !== null || !semilla} onClick={cargarLoMarcado}>
                  <Sprout size={TAMANO_ICONO.admin} aria-hidden="true" />
                  {ocupado === "cargar" ? "Cargando…" : vanEnLaCarga > 0 ? `Cargar lo marcado · ${vanEnLaCarga}` : "Nada que cargar"}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      {preparada && <PrevioDeDescarga semilla={preparada} onCerrar={() => setPreparada(null)} onDescargar={descargar} />}
    </Container>
  );
}

/** La semilla de este local con sus casillas, antes de bajar el archivo (B7-7). */
function PrevioDeDescarga({ semilla, onCerrar, onDescargar }: { semilla: SemillaDto; onCerrar: () => void; onDescargar: (s: SemillaDto) => void }) {
  const filas = useMemo(() => filasDeSemilla(semilla), [semilla]);
  const [seleccion, setSeleccion] = useState<Seleccion>(() => seleccionInicial(filas));
  const van = cuantosVan(seleccion, filas);
  const deprueba = filas.reduce((n, f) => n + f.elementos.filter(esDePrueba).length, 0);
  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      className="md:w-[min(48rem,100vw)]"
      titulo="Lo que lleva la semilla"
      descripcion={`De ${semilla.local}. Desmarca lo que no deba ir${deprueba > 0 ? `: ${plural(deprueba, "elemento de prueba sale desmarcado", "elementos de prueba salen desmarcados")}` : ""}.`}
      pie={
        <div className="flex w-full flex-wrap items-center gap-3">
          <span className="tnum text-detalle text-ink-2">{plural(van, "elemento marcado", "elementos marcados")}</span>
          <Button type="button" variant="primary" surface="admin" className="ml-auto gap-1.5" disabled={van === 0} onClick={() => onDescargar(recortarSemilla(semilla, fueraDe(seleccion, filas)))}>
            <Download size={TAMANO_ICONO.admin} aria-hidden="true" />
            Descargar lo marcado
          </Button>
        </div>
      }
    >
      <Casillas filas={filas} seleccion={seleccion} onCambiar={setSeleccion} cargada={false} />
    </Sheet>
  );
}

/**
 * Las partes de una semilla con sus casillas: la de la parte entera y, en una lista, la de cada elemento. Lo que no
 * se puede marcar (no la trae, ya está) se enseña sin casilla, con su estado.
 */
function Casillas({ filas, seleccion, onCambiar, cargada }: { filas: readonly Fila[]; seleccion: Seleccion; onCambiar: (s: Seleccion) => void; cargada: boolean }) {
  const partes = (p: ParteDeSemilla, dentro: boolean) => {
    const nuevas = new Set(seleccion.partes);
    if (dentro) nuevas.delete(p);
    else nuevas.add(p);
    onCambiar({ ...seleccion, partes: nuevas });
  };
  const elementos = (p: ParteConElementos, quitados: Set<string>) => {
    const nuevos = new Map(seleccion.elementos);
    nuevos.set(p, quitados);
    onCambiar({ ...seleccion, elementos: nuevos });
  };
  return (
    <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
      {filas.map((f) => {
        const marcada = f.disponible && !seleccion.partes.has(f.parte);
        const quitados = conElementos(f.parte) ? (seleccion.elementos.get(f.parte) ?? new Set<string>()) : new Set<string>();
        const e = f.estado ? ESTADO[f.estado] : null;
        const Icono = e?.icono;
        const marcados = f.elementos.filter((x) => !quitados.has(x)).length;
        return (
          <li key={f.parte} className={cn("flex flex-col gap-1.5 px-3 py-2.5", !f.disponible && !cargada && "opacity-75")}>
            <div className="flex flex-wrap items-center gap-2">
              {f.disponible ? (
                <label className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input type="checkbox" className="size-4 shrink-0 accent-[var(--color-brand)]" checked={marcada} onChange={(ev) => partes(f.parte, ev.target.checked)} />
                  <span className="text-cuerpo font-semibold text-ink">{NOMBRE[f.parte]}</span>
                  {f.elementos.length > 0 && <span className="tnum text-nota text-ink-3">{marcada ? `${marcados} de ${f.elementos.length}` : "fuera"}</span>}
                </label>
              ) : (
                <span className="flex min-h-8 min-w-0 flex-1 items-center pl-6.5 text-cuerpo font-semibold text-ink">{NOMBRE[f.parte]}</span>
              )}
              {e && Icono && (
                <span className={cn("flex shrink-0 items-center gap-1 text-nota font-semibold", e.clase)}>
                  <Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
                  {cargada && f.estado === "CARGA" ? "Entró" : e.texto}
                </span>
              )}
              {!e && !f.disponible && <span className="shrink-0 text-nota text-ink-3">No hay</span>}
            </div>
            <p className="pl-6.5 text-nota text-ink-2">{f.detalle}</p>
            {f.avisos.map((a) => (
              <p key={a} className="flex items-start gap-1.5 pl-6.5 text-nota text-state-warn">
                <TriangleAlert size={TAMANO_ICONO.etiqueta} className="mt-0.5 shrink-0" aria-hidden="true" />
                {a}
              </p>
            ))}
            {f.disponible && conElementos(f.parte) && f.elementos.length > 0 && (
              <div className="ml-6.5 flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-3 text-nota">
                  <button type="button" disabled={!marcada} className="min-h-8 cursor-pointer text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50" onClick={() => elementos(f.parte as ParteConElementos, new Set())}>
                    Marcar todos
                  </button>
                  <button type="button" disabled={!marcada} className="min-h-8 cursor-pointer text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50" onClick={() => elementos(f.parte as ParteConElementos, new Set(f.elementos))}>
                    Desmarcar todos
                  </button>
                </div>
                <ul className={cn("grid gap-x-4 sm:grid-cols-2", f.elementos.length > 12 && "max-h-56 overflow-y-auto rounded-[var(--radius-control)] border border-line px-2 py-1")}>
                  {f.elementos.map((x) => (
                    <li key={x}>
                      <label className={cn("flex min-h-8 cursor-pointer items-center gap-2 text-detalle", marcada ? "text-ink" : "text-ink-3")}>
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-[var(--color-brand)]"
                          disabled={!marcada}
                          checked={marcada && !quitados.has(x)}
                          onChange={(ev) => {
                            const nuevos = new Set(quitados);
                            if (ev.target.checked) nuevos.delete(x);
                            else nuevos.add(x);
                            elementos(f.parte as ParteConElementos, nuevos);
                          }}
                        />
                        <span className={cn("min-w-0 break-words", esDePrueba(x) && "text-ink-3")}>{x}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
