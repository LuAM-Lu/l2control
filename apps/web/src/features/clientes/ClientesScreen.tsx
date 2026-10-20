"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Baby, Cake, Crown, HandCoins, IdCard, LayoutGrid, PersonStanding, Search, ShoppingBag, TriangleAlert, UserCog, UserMinus, UserPlus, Users } from "lucide-react";
import type { DescuentosDelLocalDto, FichaDelClienteDto, FiltroDeClientes, MovimientoDelClienteDto, PaginaDeClientesDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { money, toMajor } from "@l2/domain-money";
import { Button, CargarMas, ChipsDeFiltro, Confirmacion, Container, Dialog, EmptyState, Initial, Input, Marquesina, MoneyDisplay, PageHeader, Sheet, avisar, cn, formatMoneyVE, useMediaQuery } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { marcarFamiliaVip } from "../cash/descuentos.acciones";
import { textoAlcance, textoValor } from "../cash/descuentos.ts";
import { CampoCedula, CampoTelefono } from "./CamposDelCliente.tsx";
import { buscarClientes, corregirCliente, juntarClientes, leerFichaDelCliente, ninoDelCliente } from "./directorio.acciones";

/**
 * Clientes (T-25, M-40): el directorio de todos —las familias del parque y los clientes de mesa— en un solo lugar, en
 * lugar de «Representantes y niños». A la izquierda, el campo (nombre, cédula, teléfono o un niño), los filtros con su
 * cuenta y la lista de a 50; a la derecha (o en su hoja, en una pantalla estrecha), la ficha: sus datos, sus cifras, sus
 * niños, lo que hizo en el local y quién se le parece («Juntar»). Lo privado va con `data-privado`.
 */
export function ClientesScreen({ inicial, descuentos }: { inicial: PaginaDeClientesDto | null; descuentos: DescuentosDelLocalDto | null }) {
  const actor = useActorEnSesion();
  const reloj = useReloj();
  const ancha = useMediaQuery("(min-width: 64rem)");
  const conElevacion = useConElevacion();
  const [pagina, setPagina] = useState(inicial);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeClientes>("TODOS");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(inicial?.clientes[0]?.id ?? null);
  const [ficha, setFicha] = useState<FichaDelClienteDto | null>(null);
  const [errorFicha, setErrorFicha] = useState<string | null>(null);
  const [enHoja, setEnHoja] = useState(false);
  const vigente = useRef(0);
  const fichaVigente = useRef(0);

  const puedeJuntar = actor ? can(actor, "clientes.juntar") !== "DENEGADO" : false;
  const puedeMarcarVip = actor ? can(actor, "catalogo.modificar") !== "DENEGADO" : false;
  const reglasVip = (descuentos?.reglas ?? [])
    .filter((r) => r.tipo === "VIP" && r.retirada === null)
    .map((r) => ({ id: r.id, nombre: r.nombre, detalle: `${textoValor(r.valor)} sobre ${textoAlcance(r.alcance)}` }));

  /** Pide una página: la primera de una consulta nueva, o la siguiente (`juntar`). Una respuesta tardía no pisa la de ahora. */
  const pedir = useCallback(async (consulta: { texto: string; filtro: FiltroDeClientes }, desde: number, juntar: boolean) => {
    const n = ++vigente.current;
    setCargando(true);
    const r = await buscarClientes({ ...consulta, desde, cuantos: 50 }).catch(() => null);
    if (n !== vigente.current) return;
    setCargando(false);
    if (!r) return setError("Sin conexión con el servidor: la lista no se pudo traer.");
    if (!r.ok) return setError(r.mensaje);
    setError(null);
    setPagina((p) => (juntar && p ? { ...r.valor, clientes: [...p.clientes, ...r.valor.clientes.filter((x) => !p.clientes.some((y) => y.id === x.id))] } : r.valor));
  }, []);

  const leerFicha = useCallback(async (id: string) => {
    const n = ++fichaVigente.current;
    const r = await leerFichaDelCliente(id).catch(() => null);
    if (n !== fichaVigente.current) return;
    if (!r) return setErrorFicha("Sin conexión con el servidor: la ficha no se pudo traer.");
    if (!r.ok) return setErrorFicha(r.mensaje);
    setErrorFicha(null);
    setFicha(r.valor);
  }, []);

  useEffect(() => {
    if (seleccion) void leerFicha(seleccion);
    else setFicha(null);
  }, [seleccion, leerFicha]);

  // Lo escrito busca al dejar de teclear.
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = window.setTimeout(() => void pedir({ texto, filtro }, 0, false), 250);
    return () => window.clearTimeout(t);
  }, [texto, filtro, pedir]);

  // En vivo: otro equipo corrigió, juntó o registró una entrada.
  useAlCambiar(["clientes", "sala", "cuentas", "descuentos"], () => {
    void pedir({ texto, filtro }, 0, false);
    if (seleccion) void leerFicha(seleccion);
  });

  /** Lo que el servidor devolvió al cambiar algo: la ficha y su renglón en la lista. */
  const adoptar = (f: FichaDelClienteDto) => {
    setFicha(f);
    setSeleccion(f.id);
    setPagina(
      (p) =>
        p && {
          ...p,
          clientes: p.clientes.map((c) =>
            c.id === f.id ? { ...c, nombre: f.nombre, cedula: f.cedula, telefono: f.telefono, ninos: f.ninos.filter((n) => !n.retirado).length, vip: f.vip?.nombre ?? null } : c,
          ),
        },
    );
  };

  if (!actor) return null;
  if (!pagina) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="Clientes no está disponible"
        hint="Tu puesto no puede ver los clientes, o el servidor no respondió. Vuelve a cargar la página."
      />
    );
  }

  const chips: { id: FiltroDeClientes; nombre: string; cuenta: number }[] = [
    { id: "TODOS", nombre: "Todos", cuenta: pagina.porFiltro.TODOS },
    { id: "FAMILIAS", nombre: "Familias", cuenta: pagina.porFiltro.FAMILIAS },
    { id: "DE_MESA", nombre: "De mesa", cuenta: pagina.porFiltro.DE_MESA },
    { id: "CON_DEUDA", nombre: "Con deuda", cuenta: pagina.porFiltro.CON_DEUDA },
    { id: "VIP", nombre: "VIP", cuenta: pagina.porFiltro.VIP },
  ];

  const detalle = ficha ? (
    <FichaDelCliente
      ficha={ficha}
      reglasVip={reglasVip}
      puedeJuntar={puedeJuntar}
      puedeMarcarVip={puedeMarcarVip}
      onAdoptar={adoptar}
      onVer={(id) => setSeleccion(id)}
      onMarcarVip={async (reglaId) => {
        const r = await conElevacion(() => marcarFamiliaVip({ guardianId: ficha.id, reglaId })).catch(() => null);
        if (!r) return "Sin conexión con el servidor: la marca no se guardó.";
        if (!r.ok) return r.mensaje;
        void leerFicha(ficha.id);
        return null;
      }}
    />
  ) : errorFicha ? (
    <p role="alert" className="flex items-center gap-1.5 text-detalle text-state-crit">
      <TriangleAlert className="size-(--icono-texto)" aria-hidden="true" />
      {errorFicha}
    </p>
  ) : (
    <p className="text-detalle text-ink-3">{seleccion ? "Cargando su ficha…" : "Elige un cliente para ver su ficha."}</p>
  );

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Clientes" }]}
        titulo="Clientes"
        descripcion="Las familias del parque y los clientes de mesa, en un solo lugar: lo que hizo cada uno en el local, y sus datos y sus niños, corregidos aquí."
        meta={
          <span className="tnum text-detalle text-ink-3">
            {pagina.porFiltro.TODOS} {pagina.porFiltro.TODOS === 1 ? "cliente" : "clientes"} · {pagina.porFiltro.FAMILIAS} familias · {pagina.porFiltro.DE_MESA} de mesa
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section aria-label="Clientes" className="flex min-w-0 flex-col gap-2.5 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
          <Input
            label="Buscar cliente"
            surface="admin"
            placeholder="Nombre, cédula, teléfono o niño"
            leading={<Search className="size-(--icono-texto)" aria-hidden="true" />}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
          />
          {/* Los cinco a la vista, en dos renglones si hace falta: deslizarlos escondía «Con deuda» y «VIP». */}
          <ChipsDeFiltro chips={chips} elegido={filtro} onElegir={(id) => setFiltro(id as FiltroDeClientes)} etiqueta="Qué clientes" className="flex-wrap overflow-visible" />
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-detalle text-state-crit">
              <TriangleAlert className="size-(--icono-texto)" aria-hidden="true" />
              {error}
            </p>
          )}
          {pagina.clientes.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-detalle text-ink-3">
              {texto || filtro !== "TODOS" ? "Nadie con eso en Clientes." : "Todavía no hay clientes: los deja la entrada al parque y sentar en una mesa."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {pagina.clientes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={c.id === seleccion ? "true" : undefined}
                    onClick={() => {
                      setSeleccion(c.id);
                      setEnHoja(true);
                    }}
                    className={cn(
                      "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border px-2.5 py-2 text-left transition-colors duration-[var(--dur-rapida)]",
                      c.id === seleccion ? "border-brand bg-brand/12" : "border-transparent hover:bg-surface-2",
                    )}
                  >
                    <Initial name={c.nombre} tone="brand" className="size-9 shrink-0 text-sm" />
                    <span className="min-w-0 flex-1">
                      {/* Un nombre que no cabe no se corta (T-15): se desliza. */}
                      <Marquesina className="block text-cuerpo font-semibold text-ink">{c.nombre}</Marquesina>
                      <span className="tnum block text-nota text-ink-3">
                        <span data-privado>{c.cedula ? cedulaAMedias(c.cedula) : "sin cédula"}</span>
                        {c.ultimaVez && ` · ${DONDE[c.ultimaVez.donde]} · ${cuando(c.ultimaVez.en, reloj)}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {c.debe && (
                        <span className="tnum inline-flex items-center gap-1 rounded-full bg-state-crit-bg px-2 py-0.5 text-etiqueta font-semibold text-state-crit">
                          <HandCoins className="size-(--icono-etiqueta)" aria-hidden="true" />
                          Debe {formatoUsd(c.debe.minor)}
                        </span>
                      )}
                      {c.vip && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-etiqueta font-semibold text-ink">
                          <Crown className="size-(--icono-etiqueta)" aria-hidden="true" />
                          VIP
                        </span>
                      )}
                      {!c.cedula && !c.debe && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-state-warn-bg px-2 py-0.5 text-etiqueta font-semibold text-state-warn">
                          <IdCard className="size-(--icono-etiqueta)" aria-hidden="true" />
                          Sin cédula
                        </span>
                      )}
                      {c.ninos > 0 && !c.debe && c.cedula && (
                        <span className="tnum rounded-full bg-surface-2 px-2 py-0.5 text-etiqueta font-semibold text-ink-2">{c.ninos === 1 ? "1 niño" : `${c.ninos} niños`}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <CargarMas cargados={pagina.clientes.length} total={pagina.total} cargando={cargando} onCargarMas={() => void pedir({ texto, filtro }, pagina.clientes.length, true)} />
        </section>

        {ancha && <div className="min-w-0">{detalle}</div>}
      </div>

      {!ancha && (
        <Sheet abierto={enHoja && seleccion !== null} onCerrar={() => setEnHoja(false)} titulo={ficha?.nombre ?? "Cliente"} descripcion="Sus datos, sus niños y lo que hizo en el local.">
          {detalle}
        </Sheet>
      )}
    </Container>
  );
}

/** Dónde vino, en palabras. */
const DONDE: Readonly<Record<NonNullable<PaginaDeClientesDto["clientes"][number]["ultimaVez"]>["donde"], string>> = {
  PARQUE: "Parque",
  MESA: "Mesa",
  DE_PIE: "De pie",
  MOSTRADOR: "Mostrador",
  CUMPLEANOS: "Cumpleaños",
};

/** «hoy», «ayer» o la fecha corta: lo que se lee de un vistazo. */
function cuando(iso: string, reloj: ReturnType<typeof useReloj>): string {
  const t = Date.parse(iso);
  const hoy = reloj.diaNumerico(Date.now());
  if (reloj.diaNumerico(t) === hoy) return "hoy";
  if (reloj.diaNumerico(t + 86_400_000) === hoy) return "ayer";
  return reloj.dia(t);
}

/** La cédula a medias en la lista («V-12.3••.••8»): se reconoce sin enseñarla entera. */
function cedulaAMedias(cedula: string): string {
  const m = /^([A-Z])-?(\d+)$/.exec(cedula.replace(/\./g, ""));
  if (!m) return cedula;
  const [, letra, d] = m as unknown as [string, string, string];
  const conPuntos = d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let visto = 0;
  const total = d.length;
  const tapado = [...conPuntos].map((ch) => {
    if (ch === ".") return ch;
    visto++;
    return visto > 3 && visto < total ? "•" : ch;
  });
  return `${letra}-${tapado.join("")}`;
}

/** Un monto en dólares, como lo dice la caja. */
const formatoUsd = (minor: string) => formatMoneyVE(toMajor(money(BigInt(minor), "USD")), "USD");

/** El icono de cada cosa que hizo en el local. */
const ICONO: Readonly<Record<MovimientoDelClienteDto["que"], ReactNode>> = {
  PARQUE: <Baby className="size-(--icono-texto)" aria-hidden="true" />,
  MESA: <LayoutGrid className="size-(--icono-texto)" aria-hidden="true" />,
  DE_PIE: <PersonStanding className="size-(--icono-texto)" aria-hidden="true" />,
  MOSTRADOR: <ShoppingBag className="size-(--icono-texto)" aria-hidden="true" />,
  CUMPLEANOS: <Cake className="size-(--icono-texto)" aria-hidden="true" />,
  DEUDA: <HandCoins className="size-(--icono-texto)" aria-hidden="true" />,
};

const TARJETA = "rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card";
const BOTON_CHICO =
  "inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 text-detalle text-ink-2 transition-colors duration-[var(--dur-rapida)] hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-brand";

/** La ficha de un cliente: sus datos, sus cifras, sus niños, lo que hizo en el local y quién se le parece. */
function FichaDelCliente({
  ficha,
  reglasVip,
  puedeJuntar,
  puedeMarcarVip,
  onAdoptar,
  onVer,
  onMarcarVip,
}: {
  ficha: FichaDelClienteDto;
  reglasVip: readonly { id: string; nombre: string; detalle: string }[];
  puedeJuntar: boolean;
  puedeMarcarVip: boolean;
  onAdoptar: (f: FichaDelClienteDto) => void;
  onVer: (id: string) => void;
  onMarcarVip: (reglaId: string | null) => Promise<string | null>;
}) {
  const reloj = useReloj();
  const [editando, setEditando] = useState(false);
  const [nino, setNino] = useState<{ id: string | null; nombre: string; apodo: string } | null>(null);
  const [retirando, setRetirando] = useState<{ id: string; nombre: string } | null>(null);
  const [juntando, setJuntando] = useState<FichaDelClienteDto["parecidos"][number] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [marcandoVip, setMarcandoVip] = useState(false);
  const activos = ficha.ninos.filter((n) => !n.retirado);
  const retirados = ficha.ninos.filter((n) => n.retirado);
  const debe = BigInt(ficha.debe.minor);

  async function retirar() {
    if (!retirando) return;
    setOcupado(true);
    const r = await ninoDelCliente({ kind: "RETIRAR", clienteId: ficha.id, ninoId: retirando.id }).catch(() => null);
    setOcupado(false);
    if (!r) return avisar.error("Sin conexión con el servidor: no se retiró.");
    if (!r.ok) return avisar.error(r.mensaje);
    setRetirando(null);
    onAdoptar(r.valor);
    avisar.ok(`${retirando.nombre} retirado de la familia`, { detalle: "Sus visitas siguen en su historia; la entrada ya no lo ofrece." });
  }

  async function juntar() {
    if (!juntando) return;
    setOcupado(true);
    const r = await juntarClientes({ quedaId: ficha.id, seVaId: juntando.id }).catch(() => null);
    setOcupado(false);
    if (!r) return avisar.error("Sin conexión con el servidor: no se juntaron.");
    if (!r.ok) return avisar.error(r.mensaje);
    setJuntando(null);
    onAdoptar(r.valor);
    avisar.ok(`Juntados: queda ${r.valor.nombre}`, { detalle: `Los niños, la historia y lo que debía el de ${juntando.telefono} están ahora aquí.` });
  }

  return (
    <section aria-label={`Ficha de ${ficha.nombre}`} className="flex min-w-0 flex-col gap-3">
      <div className={TARJETA}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Initial name={ficha.nombre} tone="brand" className="size-12 shrink-0 text-lg" />
            <div className="min-w-0">
              <h2 className="font-display text-tarjeta font-bold text-ink">
                <Marquesina>{ficha.nombre}</Marquesina>
              </h2>
              <p className="tnum flex flex-wrap items-center gap-x-2 gap-y-0.5 text-detalle text-ink-3">
                <span data-privado>{ficha.cedula ?? "Sin cédula"}</span>
                <span aria-hidden="true">·</span>
                <span data-privado>{ficha.telefono}</span>
                <span aria-hidden="true">·</span>
                <span>cliente desde el {reloj.dia(Date.parse(ficha.desde))}</span>
              </p>
            </div>
          </div>
          <button type="button" className={BOTON_CHICO} onClick={() => setEditando(true)} aria-haspopup="dialog">
            <UserCog className="size-(--icono-texto)" aria-hidden="true" />
            Editar datos
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra etiqueta="Visitas" valor={<span className="tnum">{ficha.visitas}</span>} />
          <Cifra etiqueta="Gastado" valor={<MoneyDisplay value={toMajor(money(BigInt(ficha.gastado.minor), "USD"))} currency="USD" />} />
          <Cifra
            etiqueta="Debe"
            valor={
              debe > 0n ? (
                <span className="inline-flex items-center gap-1 text-state-crit">
                  <HandCoins className="size-(--icono-texto)" aria-hidden="true" />
                  <MoneyDisplay value={toMajor(money(debe, "USD"))} currency="USD" />
                </span>
              ) : (
                <MoneyDisplay value={toMajor(money(0n, "USD"))} currency="USD" />
              )
            }
          />
          <Cifra
            etiqueta="Descuento VIP"
            valor={
              puedeMarcarVip ? (
                <select
                  aria-label={`Descuento VIP de ${ficha.nombre}`}
                  disabled={marcandoVip || (reglasVip.length === 0 && !ficha.vip)}
                  value={ficha.vip?.reglaId ?? ""}
                  onChange={async (e) => {
                    const reglaId = e.target.value || null;
                    setMarcandoVip(true);
                    const err = await onMarcarVip(reglaId);
                    setMarcandoVip(false);
                    if (err) avisar.error(err);
                    else avisar.ok(reglaId ? "Marcado VIP" : "Marca VIP quitada");
                  }}
                  className="mt-0.5 min-h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2 text-detalle text-ink focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <option value="">{reglasVip.length === 0 && !ficha.vip ? "Crea un VIP en Ajustes" : "Ninguno"}</option>
                  {reglasVip.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-cuerpo">{ficha.vip?.nombre ?? "Ninguno"}</span>
              )
            }
          />
        </dl>
      </div>

      {/* Quizás la misma persona, que quedó dos veces. Juntar es de supervisión y administración. */}
      {ficha.parecidos.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-brand/40 bg-brand/8 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-detalle font-semibold text-ink">
            <Users className="size-(--icono-texto) shrink-0 text-brand" aria-hidden="true" />
            {ficha.parecidos.length === 1 ? "Parece la misma persona" : `Pueden ser la misma persona (${ficha.parecidos.length})`}
          </p>
          <ul className="mt-1 flex flex-col">
            {ficha.parecidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-brand/20 py-1.5 first:border-t-0">
                <p className="min-w-0 flex-1 text-detalle text-ink-2">
                  «{p.nombre}», con el teléfono <span data-privado>{p.telefono}</span>
                  {p.cedula ? (
                    <>
                      {" "}
                      y la cédula <span data-privado>{p.cedula}</span>
                    </>
                  ) : (
                    " y sin cédula"
                  )}
                  {p.ultimaVez ? `, vino el ${reloj.dia(Date.parse(p.ultimaVez))}` : ""}.
                </p>
                <button type="button" className={BOTON_CHICO} onClick={() => onVer(p.id)}>
                  Ver
                </button>
                {puedeJuntar && (
                  <button type="button" className={BOTON_CHICO} onClick={() => setJuntando(p)} aria-haspopup="dialog">
                    <Users className="size-(--icono-texto)" aria-hidden="true" />
                    Juntar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lado a lado solo con espacio: en el panel de 1366 px los nombres de los niños se partían. */}
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className={TARJETA}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-display text-subtitulo font-bold text-ink">Niños</h3>
            <button type="button" className={BOTON_CHICO} onClick={() => setNino({ id: null, nombre: "", apodo: "" })} aria-haspopup="dialog">
              <UserPlus className="size-(--icono-texto)" aria-hidden="true" />
              Agregar
            </button>
          </div>
          {activos.length === 0 ? (
            <p className="text-detalle text-ink-3">Sin niños en su familia.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activos.map((n) => (
                <li key={n.id} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line/50 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-cuerpo font-semibold text-ink">
                      {n.nombre}
                      {n.apodo && <span className="ml-1.5 font-normal text-ink-3">«{n.apodo}»</span>}
                    </span>
                    <span className="tnum text-nota text-ink-3">{n.visitas === 1 ? "1 visita" : `${n.visitas} visitas`}</span>
                  </span>
                  <button type="button" className={BOTON_CHICO} onClick={() => setNino({ id: n.id, nombre: n.nombre, apodo: n.apodo ?? "" })} aria-haspopup="dialog">
                    <UserCog className="size-(--icono-texto)" aria-hidden="true" />
                    Corregir
                  </button>
                  <button type="button" className={BOTON_CHICO} onClick={() => setRetirando({ id: n.id, nombre: n.nombre })} aria-haspopup="dialog" aria-label={`Retirar a ${n.nombre}`}>
                    <UserMinus className="size-(--icono-texto)" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {retirados.length > 0 && (
            <p className="mt-2 text-nota text-ink-3">
              Retirados: {retirados.map((n) => `${n.nombre} (${n.retirado!.por}, ${reloj.dia(Date.parse(n.retirado!.en))})`).join(" · ")}. Si vuelve a entrar, vuelve a su familia.
            </p>
          )}
        </div>

        <div className={TARJETA}>
          <h3 className="mb-2 font-display text-subtitulo font-bold text-ink">Lo que hizo en el local</h3>
          {ficha.historia.length === 0 ? (
            <p className="text-detalle text-ink-3">Todavía nada: sus visitas al parque, sus mesas y sus cumpleaños salen aquí.</p>
          ) : (
            <ul className="flex flex-col">
              {ficha.historia.map((h, i) => (
                <li key={`${h.en}-${i}`} className="grid grid-cols-[5.5rem_1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-line/50 py-1.5 last:border-b-0">
                  <span className="tnum text-nota text-ink-3">{cuandoConHora(h.en, reloj)}</span>
                  <span className="self-center text-ink-3">{ICONO[h.que]}</span>
                  <span className="min-w-0 text-detalle text-ink-2">
                    {h.detalle}
                  </span>
                  <span className={cn("tnum text-detalle", h.que === "DEUDA" ? "text-state-crit" : "text-ink")}>{h.monto ? formatoUsd(h.monto.minor) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
          {ficha.juntados.length > 0 && (
            <p className="mt-2 text-nota text-ink-3">
              Se juntó con: {ficha.juntados.map((j) => `«${j.nombre}» (${j.por}, ${reloj.dia(Date.parse(j.en))})`).join(" · ")}.
            </p>
          )}
        </div>
      </div>

      {editando && <EditarDatos ficha={ficha} onCerrar={() => setEditando(false)} onGuardado={(f) => (onAdoptar(f), setEditando(false))} />}
      {nino && <EditarNino clienteId={ficha.id} nino={nino} onCerrar={() => setNino(null)} onGuardado={(f) => (onAdoptar(f), setNino(null))} />}
      <Confirmacion
        abierto={retirando !== null}
        onCerrar={() => setRetirando(null)}
        titulo={`¿Retirar a ${retirando?.nombre ?? ""} de la familia?`}
        confirmar="Sí, retirar"
        onConfirmar={() => void retirar()}
        peligro
        ocupado={ocupado}
      >
        <p className="text-detalle text-ink-2">
          Un error, o ya no viene. Sus visitas siguen en su historia y la entrada deja de ofrecerlo. Si vuelve a entrar con su nombre, vuelve a la
          familia.
        </p>
      </Confirmacion>
      <Confirmacion
        abierto={juntando !== null}
        onCerrar={() => setJuntando(null)}
        titulo={juntando && juntando.nombre === ficha.nombre ? `¿Juntar los dos registros de «${ficha.nombre}»?` : `¿Juntar a «${juntando?.nombre ?? ""}» con «${ficha.nombre}»?`}
        confirmar="Sí, juntar"
        onConfirmar={() => void juntar()}
        ocupado={ocupado}
      >
        <p className="text-detalle text-ink-2">
          Queda este, el de <span className="font-semibold text-ink" data-privado>{ficha.telefono}</span>
          {ficha.cedula ? (
            <>
              {" "}
              (<span data-privado>{ficha.cedula}</span>)
            </>
          ) : null}
          . Pasan aquí los niños, la historia y lo que debe del de <span data-privado>{juntando?.telefono}</span>, y buscarlo por ese teléfono lleva aquí.
          {!ficha.cedula && juntando?.cedula ? " Su cédula pasa a este." : ""} No se deshace.
        </p>
      </Confirmacion>
    </section>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] border border-line/60 bg-base px-3 py-2">
      <dt className="text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">{etiqueta}</dt>
      <dd className="mt-0.5 font-display text-subtitulo font-bold text-ink">{valor}</dd>
    </div>
  );
}

/** La fecha de la historia: «hoy 2:31 pm», «ayer» o «12 oct». */
function cuandoConHora(iso: string, reloj: ReturnType<typeof useReloj>): string {
  const c = cuando(iso, reloj);
  return c === "hoy" ? `hoy ${reloj.hora(Date.parse(iso))}` : c;
}

/** Corregir el nombre, la cédula y el teléfono, con los mismos campos que la mesa y la caja (T-24). */
function EditarDatos({ ficha, onCerrar, onGuardado }: { ficha: FichaDelClienteDto; onCerrar: () => void; onGuardado: (f: FichaDelClienteDto) => void }) {
  const [nombre, setNombre] = useState(ficha.nombre);
  const [cedula, setCedula] = useState(ficha.cedula ?? "");
  const [telefono, setTelefono] = useState(ficha.telefono);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function guardar() {
    setEnviando(true);
    const r = await corregirCliente({ clienteId: ficha.id, nombre, cedula, telefono }).catch(() => null);
    setEnviando(false);
    if (!r) return setError("Sin conexión con el servidor: el cambio no se guardó.");
    if (!r.ok) return setError(r.mensaje);
    avisar.ok("Datos guardados");
    onGuardado(r.valor);
  }
  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={`Editar datos de ${ficha.nombre}`}
      descripcion="Queda en la auditoría. La cédula se anota o se corrige; no se quita."
      pie={
        <div className="flex justify-end gap-2">
          <Button surface="admin" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="admin" variant="primary" disabled={enviando} onClick={() => void guardar()}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <CampoCedula label="Cédula o RIF" surface="admin" valor={cedula} onCambio={setCedula} />
        <CampoTelefono surface="admin" valor={telefono} onCambio={setTelefono} />
        <Input label="Nombre y apellido" surface="admin" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoCapitalize="words" />
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-detalle text-state-crit">
            <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** Agregar un niño, o corregir su nombre y su apodo. */
function EditarNino({
  clienteId,
  nino,
  onCerrar,
  onGuardado,
}: {
  clienteId: string;
  nino: { id: string | null; nombre: string; apodo: string };
  onCerrar: () => void;
  onGuardado: (f: FichaDelClienteDto) => void;
}) {
  const [nombre, setNombre] = useState(nino.nombre);
  const [apodo, setApodo] = useState(nino.apodo);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function guardar() {
    setEnviando(true);
    const r = await ninoDelCliente(nino.id ? { kind: "CORREGIR", clienteId, ninoId: nino.id, nombre, apodo } : { kind: "AGREGAR", clienteId, nombre, apodo }).catch(() => null);
    setEnviando(false);
    if (!r) return setError("Sin conexión con el servidor: no se guardó.");
    if (!r.ok) return setError(r.mensaje);
    avisar.ok(nino.id ? "Niño corregido" : `${nombre.trim()} agregado a la familia`);
    onGuardado(r.valor);
  }
  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={nino.id ? `Corregir a ${nino.nombre}` : "Agregar un niño"}
      pie={
        <div className="flex justify-end gap-2">
          <Button surface="admin" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="admin" variant="primary" disabled={enviando || nombre.trim().length < 2} onClick={() => void guardar()}>
            {enviando ? "Guardando…" : nino.id ? "Guardar" : "Agregar"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <Input label="Nombre" surface="admin" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} autoCapitalize="words" autoFocus />
        <Input label="Apodo (opcional)" surface="admin" value={apodo} maxLength={30} onChange={(e) => setApodo(e.target.value)} />
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-detalle text-state-crit">
            <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
