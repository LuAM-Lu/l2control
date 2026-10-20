"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Baby, CalendarHeart, CircleDollarSign, Hash, History, Keyboard, LoaderCircle, Receipt, Search, UserCheck, UserRound, X } from "lucide-react";
import { enmascararDocumento, type ClienteDeAquiDto, type ClienteEncontradoDto } from "@l2/contracts";
import { money, sum, toMajor } from "@l2/domain-money";
import { documentoLegible } from "@l2/domain-park";
import { addDays, calendarDay } from "@l2/domain-rates";
import { Marquesina, cn, formatMoneyVE, useMediaQuery, type Surface } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { CampoCedula } from "./CamposDelCliente.tsx";
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
 *
 * T-24 (M-40): con `cedula`, es **el campo único** «Cédula o RIF» del formulario: el campo es la cédula (con su letra y sus
 * puntos) y, al tocarlo, «Aquí ahora»; quien no la recuerda usa «Buscar por nombre o teléfono». «Aquí ahora» suma a los
 * que vinieron hoy y se ordena según la pantalla (`para`): en la mesa, primero el parque y el cumpleaños; en la caja, las
 * cuentas; seis como máximo.
 */

/** Lo elegido: el cliente del directorio y, si se eligió de «aquí ahora», por qué está aquí (y sus niños en la sala). */
export type ClienteElegido = ClienteEncontradoDto &
  Readonly<{ motivo?: ClienteDeAquiDto["motivo"]; detalle?: string; estancias?: readonly string[]; en?: string | null }>;

/** Dónde se usa el campo (T-24): ordena «Aquí ahora» por lo que más se busca ahí. */
export type ParaQue = "MESA" | "CAJA" | "PARQUE";
const PRIORIDAD: Readonly<Record<ParaQue, readonly ClienteDeAquiDto["motivo"][]>> = {
  MESA: ["SALA", "CUMPLEANOS", "CUENTA", "HOY"],
  CAJA: ["CUENTA", "SALA", "CUMPLEANOS", "HOY"],
  PARQUE: ["SALA", "HOY", "CUMPLEANOS", "CUENTA"],
};
/** Cuántos propone «Aquí ahora» (T-24): los demás, escribiendo. */
const AQUI_MAXIMO = 6;

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

const ICONO_DE_MOTIVO = { SALA: Baby, CUENTA: Receipt, CUMPLEANOS: CalendarHeart, HOY: History } as const;

export function CampoDelCliente({
  elegido,
  onElegir,
  onDeshacer,
  surface = "tablet",
  autoFocus = false,
  label,
  aqui = true,
  conDeuda = true,
  className,
  cedula,
  para = "MESA",
}: {
  /**
   * T-24: el campo único. Con esto, el campo es la cédula del formulario (lo escrito es su valor) y la búsqueda por nombre
   * o teléfono queda en un enlace.
   */
  cedula?: Readonly<{
    valor: string;
    onCambio: (v: string) => void;
    required?: boolean;
    error?: string | undefined;
    /** B6-22: la pista bajo el campo (con «Más rápido», cuándo se pide). */
    hint?: string | undefined;
    inputRef?: React.Ref<HTMLInputElement> | undefined;
  }>;
  /** Dónde se usa: ordena «Aquí ahora» (T-24). */
  para?: ParaQue;
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
  const { ajustes } = useSucursal();
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
  // T-24: con el campo único, buscar por nombre o teléfono es la otra cara del campo.
  const [porTexto, setPorTexto] = useState(false);
  const etiqueta = label ?? (cedula && !porTexto ? "Cédula o RIF" : cedula ? "Nombre o teléfono" : "Cédula, teléfono o nombre");
  const hora = (iso: string) => formatClock(Date.parse(iso), ajustes.formatoHora, ajustes.zonaHoraria);
  const entrada = useRef<HTMLInputElement | null>(null);
  const ahora = useMemo(() => Date.now(), [abierto]);

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
    const orden = PRIORIDAD[para];
    return (deAqui ?? [])
      .filter((a) => q === "" || sinAcentos(a.cliente.nombre).includes(q) || (a.cliente.cedula ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~"))
      .map((a, i) => ({ a, i }))
      .sort((x, y) => orden.indexOf(x.a.motivo) - orden.indexOf(y.a.motivo) || x.i - y.i)
      .slice(0, AQUI_MAXIMO)
      .map(({ a }) => ({ ...a.cliente, motivo: a.motivo, detalle: a.detalle, estancias: a.estancias, en: a.en }));
  }, [encontrados, buscado, deAqui, para]);

  useEffect(() => setActivo(0), [opciones]);

  function elegir(c: ClienteElegido) {
    onElegir(c);
    setTexto("");
    setAbierto(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLElement>, lista: readonly ClienteElegido[] = opciones) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, Math.max(0, lista.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && abierto && lista[activo]) {
      e.preventDefault();
      elegir(lista[activo]!);
    } else if (e.key === "Escape" && abierto) {
      e.preventDefault();
      setAbierto(false);
    }
  }

  /** La lista de clientes (lo encontrado o «Aquí ahora»), la misma en las dos caras del campo. */
  const lista = (items: readonly ClienteElegido[], conAqui: boolean, vacio: string | null) => (
    <ul
      id={listaId}
      role="listbox"
      aria-label="Clientes"
      data-privado=""
      className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-line bg-surface py-1 shadow-card"
    >
      {conAqui && items.length > 0 && <li className="px-3 pt-1 pb-0.5 text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">Aquí ahora</li>}
      {error && <li className="px-3 py-2 text-detalle text-state-crit">{error}</li>}
      {!error && items.length === 0 && vacio && <li className="px-3 py-2 text-detalle text-ink-3">{vacio}</li>}
      {items.map((c, i) => {
        const Icono = c.motivo ? ICONO_DE_MOTIVO[c.motivo] : UserRound;
        const vino = cuandoVino(c.vinoEl, ahora, ajustes.zonaHoraria);
        // Los que vinieron hoy (T-24): a qué hora salieron o pagaron.
        const detalle = c.detalle && c.motivo === "HOY" && c.en ? `${c.detalle} a las ${hora(c.en)}` : c.detalle;
        const partes = [cedulaEnmascarada(c.cedula), detalle ?? vino, c.ninos > 0 && !detalle ? `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}` : null].filter(Boolean);
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
                <Marquesina className="tnum text-nota text-ink-3" titulo={[detalle, vino, c.ninos > 0 ? `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}` : null].filter(Boolean).join(" · ")}>
                  {partes.join(" · ")}
                </Marquesina>
              </span>
              <Deuda deudas={c.deudas} />
            </button>
          </li>
        );
      })}
    </ul>
  );

  /** El enlace que cambia de cara: de la cédula a buscar por nombre o teléfono, y de vuelta. */
  const cambiarDeCara = (a: boolean) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setPorTexto(a);
        setTexto("");
        window.setTimeout(() => entrada.current?.focus(), 0);
      }}
      className={cn(
        "self-start rounded-[var(--radius-control)] px-1 text-detalle font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand",
        surface === "admin" ? "min-h-8" : "min-h-10",
      )}
    >
      {a ? "Buscar por nombre o teléfono" : "Escribir la cédula"}
    </button>
  );

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

  // T-24: la cara de la cédula. Lo escrito es la cédula del formulario; al tocarla, «Aquí ahora» (filtrado por las cifras
  // escritas). Con una cédula completa, el formulario reconoce al cliente y rellena lo demás.
  if (cedula && !porTexto) {
    const cifras = cedula.valor.replace(/\D/g, "");
    const sugeridas = cifras === "" ? opciones : opciones.filter((c) => (c.cedula ?? "").replace(/\D/g, "").startsWith(cifras));
    return (
      <div
        className={cn("relative flex flex-col gap-1", className)}
        onFocus={() => {
          cargarAqui();
          setAbierto(true);
        }}
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => alTeclear(e, sugeridas)}
      >
        <CampoCedula
          label={etiqueta}
          surface={surface}
          valor={cedula.valor}
          onCambio={cedula.onCambio}
          {...(cedula.required ? { required: true } : {})}
          {...(cedula.error ? { error: cedula.error } : {})}
          {...(cedula.hint ? { hint: cedula.hint } : {})}
          autoFocus={autoFocus}
          {...(cedula.inputRef ? { inputRef: cedula.inputRef } : {})}
        />
        {abierto && sugeridas.length > 0 && lista(sugeridas, true, null)}
        {cambiarDeCara(true)}
      </div>
    );
  }

  const numerico = tactil && !porNombre;
  const altura = surface === "pos" ? "min-h-14" : surface === "admin" ? "min-h-9" : "min-h-12";
  // B4-18: la letra de los campos (16 px o más en la tablet y la caja: así no se acerca la pantalla al escribir).
  const letra = surface === "pos" ? "text-lg" : surface === "admin" ? "text-cuerpo" : "text-base";
  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      <label htmlFor={`${id}-campo`} className="text-etiqueta font-semibold tracking-[0.06em] text-ink-2 uppercase">
        {etiqueta}
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
            autoCapitalize={numerico ? "off" : "words"}
            spellCheck={false}
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
            onKeyDown={(e) => alTeclear(e)}
            className={cn("min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3", letra)}
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
      {abierto && (opciones.length > 0 || error || (encontrados && encontrados.texto === buscado)) &&
        lista(opciones, buscado === "", cedula ? "Nadie con eso en el directorio: escribe su cédula." : "Nadie con eso en el directorio: escribe sus datos abajo.")}
      {cedula && cambiarDeCara(false)}
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
