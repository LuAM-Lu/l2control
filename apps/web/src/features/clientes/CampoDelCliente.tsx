"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Baby, CalendarHeart, CircleDollarSign, Hash, Keyboard, LoaderCircle, Receipt, Search, UserCheck, UserRound, X } from "lucide-react";
import { enmascararDocumento, type ClienteDeAquiDto, type ClienteEncontradoDto } from "@l2/contracts";
import { money, sum, toMajor } from "@l2/domain-money";
import { documentoLegible } from "@l2/domain-park";
import { addDays, calendarDay } from "@l2/domain-rates";
import { Marquesina, cn, formatMoneyVE, useMediaQuery, type Surface } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { clientesDeAqui, encontrarClientes } from "./clientes.acciones";

/**
 * El campo del cliente — T-23 (M-38, W-12). Una pieza para los formularios que piden a un cliente: un campo «Cédula,
 * teléfono o nombre».
 *
 *  · Antes de escribir propone a **quien está aquí**: las familias con niños en la sala, los clientes de las cuentas
 *    abiertas y el cumpleaños de hoy (los lee el servidor una vez, al entrar al campo).
 *  · Con **cifras** reconoce como siempre (la cédula, con o sin letra, o el teléfono completos); con **3 letras o más**,
 *    hasta 6 del directorio. Cada uno con su cédula enmascarada, cuándo vino, cuántos niños y «Debe» (rojo, icono y texto).
 *  · Al **elegir**, el formulario rellena lo que esté vacío (nada pisa lo escrito) y queda «Es …» con «No es esta
 *    persona» para deshacerlo.
 *  · En la **tablet y el teléfono**, el teclado numérico, con «Por nombre» para las letras; en la laptop, un solo campo.
 *
 * Lo buscado no va a ningún registro (el servidor cuenta cuántos, no qué) y la lista lleva `data-privado` (PLAN §7.6).
 */

/** Lo elegido: el cliente del directorio y, si se eligió de «aquí ahora», por qué está aquí (y sus niños en la sala). */
export type ClienteElegido = ClienteEncontradoDto & Readonly<{ motivo?: ClienteDeAquiDto["motivo"]; detalle?: string; estancias?: readonly string[] }>;

/** «V-12···678»: la cédula reconocible sin enseñarla entera, como en el recibo (§7.6). */
export function cedulaEnmascarada(cedula: string | null): string {
  if (!cedula) return "Sin cédula";
  return enmascararDocumento(documentoLegible(cedula) ?? cedula);
}

/** «vino hoy», «vino ayer», «vino el 5 oct.»: cuándo vino, en los días del local (su zona), para reconocerlo. */
export function cuandoVino(iso: string | null, ahora: number, zona: string): string | null {
  if (!iso) return null;
  const dia = calendarDay(iso, zona);
  const hoy = calendarDay(new Date(ahora).toISOString(), zona);
  if (dia >= hoy) return "vino hoy";
  if (dia === addDays(hoy, -1)) return "vino ayer";
  return `vino el ${new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(`${dia}T12:00:00.000Z`))}`;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const soloCifras = (s: string) => /^[\d\s.()+-]+$/.test(s.trim());
/** ¿Hay con qué buscar en el directorio? 3 letras, o una cédula o un teléfono enteros (6 cifras o más). */
const sePuedeBuscar = (s: string) => {
  const t = s.trim();
  if (soloCifras(t)) return t.replace(/\D/g, "").length >= 6;
  return /^[A-Za-z]-?\d{6,}/.test(t.replace(/[\s.]/g, "")) || t.length >= 3;
};

const ICONO_DE_MOTIVO = { SALA: Baby, CUENTA: Receipt, CUMPLEANOS: CalendarHeart } as const;

export function CampoDelCliente({
  elegido,
  onElegir,
  onDeshacer,
  surface = "tablet",
  autoFocus = false,
  label = "Cédula, teléfono o nombre",
  aqui = true,
  conDeuda = true,
  className,
}: {
  /** «Debe» en el elegido; `false` donde el formulario ya lo dice con su detalle (la entrada). */
  conDeuda?: boolean;
  /** El que se eligió (se enseña «Es …» con «No es esta persona»); `null` si ninguno. */
  elegido: ClienteElegido | null;
  onElegir: (c: ClienteElegido) => void;
  /** «No es esta persona»: el formulario quita lo que rellenó. */
  onDeshacer: () => void;
  surface?: Surface;
  autoFocus?: boolean;
  label?: string;
  /** Proponer a quien está aquí antes de escribir (la sala, las cuentas abiertas, el cumpleaños de hoy). */
  aqui?: boolean;
  className?: string;
}) {
  const id = useId();
  const listaId = `${id}-lista`;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [deAqui, setDeAqui] = useState<readonly ClienteDeAquiDto[] | null>(null);
  const [encontrados, setEncontrados] = useState<{ texto: string; clientes: readonly ClienteEncontradoDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [activo, setActivo] = useState(0);
  // En la tablet y el teléfono, el teclado numérico; «Por nombre», el de letras (T-23).
  const tactil = useMediaQuery("(pointer: coarse)");
  const [porNombre, setPorNombre] = useState(false);
  const entrada = useRef<HTMLInputElement | null>(null);
  const ahora = useMemo(() => Date.now(), [abierto]);
  const { ajustes } = useSucursal();

  // «Aquí ahora», una vez al entrar al campo.
  const cargarAqui = () => {
    if (!aqui || deAqui !== null) return;
    setDeAqui([]);
    clientesDeAqui()
      .then((r) => setDeAqui(r.ok ? r.valor.clientes : []))
      .catch(() => setDeAqui([]));
  };

  // El directorio, al escribir lo suficiente (con una espera corta para no buscar letra a letra).
  const buscado = texto.trim();
  useEffect(() => {
    if (!sePuedeBuscar(buscado)) {
      setEncontrados(null);
      setError(null);
      return;
    }
    let vivo = true;
    setCargando(true);
    const t = window.setTimeout(() => {
      encontrarClientes({ texto: buscado, limite: 6 })
        .then((r) => {
          if (!vivo) return;
          if (r.ok) {
            setEncontrados({ texto: buscado, clientes: r.valor });
            setError(null);
          } else setError(r.mensaje);
        })
        .catch(() => vivo && setError("Sin conexión con el servidor: no se pudo buscar."))
        .finally(() => vivo && setCargando(false));
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [buscado]);

  // Lo que se enseña: lo encontrado; si no hay nada escrito, quien está aquí; con algo escrito que no alcanza para
  // buscar, quien está aquí y coincide.
  const opciones: readonly ClienteElegido[] = useMemo(() => {
    if (encontrados && encontrados.texto === buscado) {
      const deAquiPorId = new Map((deAqui ?? []).map((a) => [a.cliente.clienteId, a]));
      return encontrados.clientes.map((c) => {
        const a = deAquiPorId.get(c.clienteId);
        return a ? { ...c, motivo: a.motivo, detalle: a.detalle, estancias: a.estancias } : c;
      });
    }
    const q = sinAcentos(buscado);
    return (deAqui ?? [])
      .filter((a) => q === "" || sinAcentos(a.cliente.nombre).includes(q) || (a.cliente.cedula ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~"))
      .slice(0, 8)
      .map((a) => ({ ...a.cliente, motivo: a.motivo, detalle: a.detalle, estancias: a.estancias }));
  }, [encontrados, buscado, deAqui]);

  useEffect(() => setActivo(0), [opciones]);

  function elegir(c: ClienteElegido) {
    onElegir(c);
    setTexto("");
    setAbierto(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, Math.max(0, opciones.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && abierto && opciones[activo]) {
      e.preventDefault();
      elegir(opciones[activo]!);
    } else if (e.key === "Escape" && abierto) {
      e.preventDefault();
      setAbierto(false);
    }
  }

  // Elegido: «Es …» con «No es esta persona».
  if (elegido) {
    return (
      <div className={cn("flex items-center gap-2 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-2", className)} data-privado="">
        <UserCheck className="size-(--icono-texto) shrink-0 text-state-ok" aria-hidden="true" />
        <Marquesina className="flex-1 text-cuerpo" titulo={`${elegido.nombre} · ${cedulaEnmascarada(elegido.cedula)}`}>
          <span className="font-semibold text-ink">{elegido.nombre}</span>
          <span className="tnum text-ink-2"> · {cedulaEnmascarada(elegido.cedula)}</span>
        </Marquesina>
        {conDeuda && <Deuda deudas={elegido.deudas} />}
        <button
          type="button"
          onClick={() => {
            onDeshacer();
            window.setTimeout(() => entrada.current?.focus(), 0);
          }}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-2 text-detalle font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
            surface === "admin" ? "min-h-8" : "min-h-12",
          )}
        >
          <X className="size-(--icono-texto)" aria-hidden="true" />
          No es esta persona
        </button>
      </div>
    );
  }

  const numerico = tactil && !porNombre;
  const altura = surface === "pos" ? "min-h-14" : surface === "admin" ? "min-h-9" : "min-h-12";
  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      <label htmlFor={`${id}-campo`} className="text-etiqueta font-semibold tracking-[0.06em] text-ink-2 uppercase">
        {label}
      </label>
      <div className="flex gap-1.5">
        <div className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 focus-within:border-brand", altura)}>
          {cargando ? (
            <LoaderCircle className="size-(--icono-texto) shrink-0 animate-spin text-ink-3" aria-hidden="true" />
          ) : (
            <Search className="size-(--icono-texto) shrink-0 text-ink-3" aria-hidden="true" />
          )}
          <input
            ref={entrada}
            id={`${id}-campo`}
            role="combobox"
            aria-expanded={abierto && opciones.length > 0}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={abierto && opciones[activo] ? `${listaId}-${activo}` : undefined}
            autoFocus={autoFocus}
            autoComplete="off"
            inputMode={numerico ? "numeric" : "text"}
            enterKeyHint="search"
            placeholder={numerico ? "Cédula o teléfono" : "Cédula, teléfono o nombre"}
            value={texto}
            data-privado=""
            onFocus={() => {
              cargarAqui();
              setAbierto(true);
            }}
            onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
            }}
            onKeyDown={alTeclear}
            className="min-w-0 flex-1 bg-transparent text-cuerpo text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        {tactil && (
          <button
            type="button"
            onClick={() => {
              setPorNombre((v) => !v);
              window.setTimeout(() => entrada.current?.focus(), 0);
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-detalle font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
              altura,
            )}
          >
            {porNombre ? <Hash className="size-(--icono-texto)" aria-hidden="true" /> : <Keyboard className="size-(--icono-texto)" aria-hidden="true" />}
            {porNombre ? "Por número" : "Por nombre"}
          </button>
        )}
      </div>
      {abierto && (opciones.length > 0 || error || (encontrados && encontrados.texto === buscado)) && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Clientes"
          data-privado=""
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-line bg-surface py-1 shadow-card"
        >
          {buscado === "" && opciones.length > 0 && <li className="px-3 pt-1 pb-0.5 text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">Aquí ahora</li>}
          {error && <li className="px-3 py-2 text-detalle text-state-crit">{error}</li>}
          {!error && opciones.length === 0 && <li className="px-3 py-2 text-detalle text-ink-3">Nadie con eso en el directorio: escribe sus datos abajo.</li>}
          {opciones.map((c, i) => {
            const Icono = c.motivo ? ICONO_DE_MOTIVO[c.motivo] : UserRound;
            const vino = cuandoVino(c.vinoEl, ahora, ajustes.zonaHoraria);
            const partes = [cedulaEnmascarada(c.cedula), c.detalle ?? vino, c.ninos > 0 && !c.detalle ? `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}` : null].filter(Boolean);
            return (
              <li key={c.clienteId} id={`${listaId}-${i}`} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(c)}
                  onMouseEnter={() => setActivo(i)}
                  className={cn("flex w-full items-center gap-2.5 px-3 text-left", surface === "admin" ? "min-h-10" : "min-h-12", i === activo ? "bg-surface-2" : "hover:bg-surface-2")}
                >
                  <Icono className={cn("size-(--icono-texto) shrink-0", c.motivo ? "text-brand" : "text-ink-3")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <Marquesina className="text-cuerpo font-semibold text-ink">{c.nombre}</Marquesina>
                    <Marquesina className="tnum text-nota text-ink-3" titulo={[c.detalle, vino, c.ninos > 0 ? `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}` : null].filter(Boolean).join(" · ")}>
                      {partes.join(" · ")}
                    </Marquesina>
                  </span>
                  <Deuda deudas={c.deudas} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** «Debe $ 12,50», en rojo con su icono (B3-11): se avisa, se cobra en la caja. */
export function Deuda({ deudas }: { deudas: ClienteEncontradoDto["deudas"] }) {
  if (deudas.length === 0) return null;
  const total = sum(deudas.map((d) => money(BigInt(d.monto.minor), "USD")), "USD");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-1.5 py-0.5 text-nota font-semibold text-state-crit">
      <CircleDollarSign className="size-(--icono-etiqueta)" aria-hidden="true" />
      <span className="tnum">Debe {formatMoneyVE(toMajor(total), "USD")}</span>
    </span>
  );
}
