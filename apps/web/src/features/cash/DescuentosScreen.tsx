"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, CalendarClock, Crown, Hand, Info, Percent, Plus, Smartphone, Trash2 } from "lucide-react";
import {
  CrearReglaDescuentoCommandSchema,
  type CatalogoDto,
  type DescuentosDelLocalDto,
  type ReglaDescuentoDto,
  type TipoReglaDescuento,
} from "@l2/contracts";
import { calendarDay } from "@l2/domain-rates";
import { basisPointsFromPercent, percentFromBasisPoints } from "@l2/domain-tax";
import { can } from "@l2/domain-identity";
import { Badge, Button, Cifra, Confirmacion, Container, Dialog, EmptyState, FiltroSegmentado, Input, PageHeader, Resumen, Sheet, Tabs, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useMedios } from "./MediosProvider.tsx";
import { importeTecleado } from "./importe.ts";
import { crearReglaDescuento, retirarReglaDescuento } from "./descuentos.acciones";
import { textoAlcance, textoValor } from "./descuentos.ts";

/**
 * Ajustes → Descuentos (B3-6, V-9, D-DESC; patrón de Ajustes, M-17 y T-7). Administración crea las
 * reglas que la caja ofrece: por medio de pago (la caja lo propone y pide la 🔐 de supervisión), VIP (se
 * asigna a familias en el directorio) y manuales (con motivo y 🔐; supervisión hasta su tope). Una regla
 * no se edita: se retira y se crea otra, y lo cobrado con ella sigue diciendo cuál fue. Arriba, el
 * resumen; debajo, las vigentes y las retiradas en pestañas; el alta en una hoja lateral y retirar pide
 * confirmarlo. Crear, retirar y cambiar el tope piden confirmar identidad.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const TIPOS: readonly { id: TipoReglaDescuento; nombre: string; pista: string; icon: typeof Hand }[] = [
  { id: "MEDIO", nombre: "Por medio de pago", pista: "Si toda la cuenta se paga por ese medio. Lo autoriza supervisión con su PIN.", icon: Smartphone },
  { id: "VIP", nombre: "VIP", pista: "Para las familias que marques en el directorio. No pide PIN: la marca lo ampara.", icon: Crown },
  { id: "MANUAL", nombre: "Manual", pista: "La caja lo aplica con motivo y el PIN de supervisión (hasta su tope).", icon: Hand },
];
const NOMBRE_TIPO: Readonly<Record<TipoReglaDescuento, string>> = { MEDIO: "Por medio de pago", VIP: "VIP", MANUAL: "Manual" };

type Alcance = "CUENTA" | "PARQUE" | "RESTAURANTE" | "CATEGORIAS";
const ALCANCES: readonly { id: Alcance; nombre: string }[] = [
  { id: "CUENTA", nombre: "Toda la cuenta" },
  { id: "PARQUE", nombre: "El parque" },
  { id: "RESTAURANTE", nombre: "El restaurante" },
  { id: "CATEGORIAS", nombre: "Categorías" },
];

/** «1 oct» o «1 oct 2026»: fecha de calendario, se pinta en UTC. */
const CORTO = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: "UTC" });
const fechaCorta = (dia: string) => CORTO.format(Date.parse(`${dia}T12:00:00.000Z`));
const vigencia = (r: ReglaDescuentoDto) => (r.hasta ? `del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}` : `desde el ${fechaCorta(r.desde)}`);

export function DescuentosScreen({ descuentos, catalogo }: { descuentos: DescuentosDelLocalDto | null; catalogo: CatalogoDto | null }) {
  const router = useRouter();
  const conElevacion = useConElevacion();
  const actor = useActorEnSesion();
  const puede = actor ? can(actor, "catalogo.modificar") !== "DENEGADO" : false;
  const ahora = useAhoraLocal();
  const sucursal = useSucursal();
  const hoy = ahora === 0 ? null : calendarDay(new Date(ahora).toISOString(), sucursal.ajustes.zonaHoraria);
  const { config: medios } = useMedios();
  const categorias = useMemo(
    () => [...new Set((catalogo?.productos ?? []).map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "es")),
    [catalogo],
  );

  const [tipo, setTipo] = useState<TipoReglaDescuento>("MANUAL");
  const [nombre, setNombre] = useState("");
  const [enPorcentaje, setEnPorcentaje] = useState(true);
  const [cantidad, setCantidad] = useState("");
  const [alcance, setAlcance] = useState<Alcance>("CUENTA");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [medio, setMedio] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [retirando, setRetirando] = useState<ReglaDescuentoDto | null>(null);
  const [tope, setTope] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [vista, setVista] = useState<"vigentes" | "retirados">("vigentes");
  const [filtro, setFiltro] = useState<"TODOS" | TipoReglaDescuento>("TODOS");

  if (!descuentos) {
    return (
      <Container ancho="panel" className="py-8">
        <EmptyState icon={<BadgePercent size={20} />} title="No se pudieron leer los descuentos" hint="Vuelve a entrar o recarga la página." />
      </Container>
    );
  }

  const vigentes = descuentos.reglas.filter((r) => r.retirada === null);
  const retiradas = descuentos.reglas.filter((r) => r.retirada !== null);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = enPorcentaje
      ? (() => {
          const bps = basisPointsFromPercent(cantidad);
          return bps ? { tipo: "PORCENTAJE" as const, basisPoints: bps } : null;
        })()
      : (() => {
          const m = importeTecleado(cantidad, "USD");
          return m && m.amount > 0n ? { tipo: "MONTO" as const, monto: { minor: String(m.amount), currency: "USD" as const } } : null;
        })();
    const cmd = {
      nombre: nombre.trim(),
      tipo,
      valor,
      alcance: alcance === "CATEGORIAS" ? { tipo: alcance, categorias: elegidas } : { tipo: alcance },
      ...(tipo === "MEDIO" && medio ? { medio } : {}),
      desde: desde || hoy || "",
      ...(hasta ? { hasta } : {}),
    };
    const v = CrearReglaDescuentoCommandSchema.safeParse(cmd);
    const nuevos: Record<string, string> = {};
    if (!valor) nuevos.valor = enPorcentaje ? "Un porcentaje entre 0,01 y 100" : "Un monto mayor que cero";
    if (!v.success) for (const p of v.error.issues) nuevos[String(p.path[0])] ??= p.message;
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    try {
      const r = await conElevacion(() => crearReglaDescuento(cmd));
      if (r.ok) {
        avisar.ok(`Descuento creado: ${r.valor.nombre}`);
        setNombre("");
        setCantidad("");
        setElegidas([]);
        setHasta("");
        setDesde("");
        setCreando(false);
        router.refresh();
      } else if (r.problemas?.length) {
        setErrores(Object.fromEntries(r.problemas.map((p) => [String(p.path[0]), r.mensaje])));
      } else {
        avisar.error(r.mensaje);
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. El descuento no se creó.");
    } finally {
      setEnviando(false);
    }
  };

  const retirar = async (r: ReglaDescuentoDto) => {
    setEnviando(true);
    try {
      const res = await conElevacion(() => retirarReglaDescuento({ reglaId: r.id }));
      if (res.ok) {
        avisar.ok(`Descuento retirado: ${r.nombre}`);
        router.refresh();
      } else avisar.error(res.mensaje);
    } catch {
      avisar.error("No se pudo hablar con el servidor. El descuento sigue vigente.");
    } finally {
      setEnviando(false);
      setRetirando(null);
    }
  };

  const guardarTope = async () => {
    const bps = tope === null ? null : basisPointsFromPercent(tope);
    if (bps === null) {
      setErrores((e) => ({ ...e, tope: "Un porcentaje entre 0 y 100" }));
      return;
    }
    setEnviando(true);
    try {
      const r = await sucursal.publicar({ ...sucursal.ajustes, topeDescuentoSupervision: bps });
      if (r.ok) {
        avisar.ok(`Tope de supervisión: ${percentFromBasisPoints(bps)} %`);
        setTope(null);
        router.refresh();
      } else avisar.error(r.mensaje);
    } catch {
      avisar.error("No se pudo hablar con el servidor. El tope no cambió.");
    } finally {
      setEnviando(false);
    }
  };

  const limpiar = (k: string) => setErrores((e) => ({ ...e, [k]: "" }));
  const mediosDelLocal = (medios?.medios ?? []).filter((m) => m.activo);

  const programados = vigentes.filter((r) => hoy !== null && r.desde > hoy);
  const vip = vigentes.filter((r) => r.tipo === "VIP");
  const familiasVip = vip.reduce((n, r) => n + r.familias, 0);
  const deTipo = (lista: readonly ReglaDescuentoDto[]) => (filtro === "TODOS" ? lista : lista.filter((r) => r.tipo === filtro));
  const opciones = (lista: readonly ReglaDescuentoDto[]) => [
    { id: "TODOS" as const, nombre: "Todos", cuenta: lista.length },
    ...TIPOS.map((t) => ({ id: t.id, nombre: t.nombre, cuenta: lista.filter((r) => r.tipo === t.id).length })),
  ];
  const nombreMedio = (code: string) => (medios?.medios ?? []).find((m) => m.code === code)?.label ?? code;

  const fila = (r: ReglaDescuentoDto, retirada: boolean) => {
    const futura = hoy !== null && r.desde > hoy;
    const vencida = hoy !== null && r.hasta !== null && r.hasta < hoy;
    return (
      <li key={r.id} className={cn("flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between", retirada && "text-ink-3")}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
            {r.nombre}
            <span className="tnum text-brand">{textoValor(r.valor)}</span>
            <Badge tone="idle">{NOMBRE_TIPO[r.tipo]}</Badge>
            {!retirada && futura && <Badge tone="warn">Empieza el {fechaCorta(r.desde)}</Badge>}
            {!retirada && vencida && <Badge tone="warn">Venció</Badge>}
          </p>
          <p className="truncate text-[12.5px] text-ink-2">
            Sobre {textoAlcance(r.alcance)}
            {r.medio ? ` · pagando todo con ${nombreMedio(r.medio)}` : ""}
            {r.tipo === "VIP" ? ` · ${r.familias} ${r.familias === 1 ? "familia" : "familias"}` : ""}
            <span className="text-ink-3">
              {" "}
              · {vigencia(r)} · creado por {r.creada.por}
              {retirada && r.retirada ? ` · retirado por ${r.retirada.por}` : ""}
            </span>
          </p>
        </div>
        {!retirada && puede && (
          <Button type="button" variant="ghost" surface="admin" className="shrink-0 gap-1.5 self-start sm:self-auto" onClick={() => setRetirando(r)}>
            <Trash2 size={14} className="text-state-crit" aria-hidden="true" />
            Retirar
          </Button>
        )}
      </li>
    );
  };

  const lista = (reglas: readonly ReglaDescuentoDto[], retiradas: boolean) => (
    <div className="flex min-h-0 flex-col gap-3 md:h-full">
      <div className="shrink-0">
        <FiltroSegmentado etiqueta="Tipo de descuento" valor={filtro} onCambiar={setFiltro} opciones={opciones(reglas)} />
      </div>
      {deTipo(reglas).length === 0 ? (
        <EmptyState
          icon={<BadgePercent size={20} />}
          title={reglas.length === 0 ? (retiradas ? "Ningún descuento retirado" : "Todavía no hay descuentos") : "Ninguno de este tipo"}
          hint={reglas.length === 0 && !retiradas ? "La caja no ofrece ninguno hasta que crees el primero." : "Cambia el tipo para ver los demás."}
        />
      ) : (
        <ul className="flex min-h-0 flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:overflow-y-auto">
          {deTipo(reglas).map((r) => fila(r, retiradas))}
        </ul>
      )}
      <p className="flex shrink-0 items-start gap-1.5 text-[12.5px] text-ink-3">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        Retirar no borra: lo cobrado con un descuento sigue diciendo cuál fue. Para cambiar uno, retíralo y crea otro.
      </p>
    </div>
  );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Descuentos" }]}
        titulo="Descuentos"
        descripcion="Lo que la caja puede descontar, siempre antes del IVA y uno por cuenta: propone el mayor y quien autoriza puede elegir otro. La administración aplica además el que quiera, con su PIN y un motivo escrito."
        acciones={
          puede ? (
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setCreando(true)}>
              <Plus size={15} aria-hidden="true" /> Nuevo descuento
            </Button>
          ) : undefined
        }
      />

      <Resumen etiqueta="Resumen de los descuentos">
        <Cifra
          etiqueta="Vigentes"
          icono={<BadgePercent aria-hidden="true" />}
          valor={String(vigentes.length - programados.length)}
          pie={vigentes.length - programados.length > 0 ? "La caja los ofrece hoy" : "La caja no ofrece ninguno hoy"}
          activo={vista === "vigentes"}
          onClick={() => setVista("vigentes")}
        />
        <Cifra
          etiqueta="Programados"
          icono={<CalendarClock aria-hidden="true" />}
          valor={String(programados.length)}
          pie={programados.length > 0 ? `El próximo empieza el ${fechaCorta([...programados].sort((a, b) => a.desde.localeCompare(b.desde))[0]!.desde)}` : "Ninguno por empezar"}
          onClick={() => setVista("vigentes")}
        />
        <Cifra
          etiqueta="Familias VIP"
          icono={<Crown aria-hidden="true" />}
          valor={String(familiasVip)}
          pie={vip.length > 0 ? `En ${vip.length} ${vip.length === 1 ? "descuento VIP" : "descuentos VIP"} · se marcan en el directorio` : "Sin descuento VIP vigente"}
          onClick={() => {
            setVista("vigentes");
            setFiltro("VIP");
          }}
        />
        <Cifra
          etiqueta="Tope de supervisión"
          icono={<Percent aria-hidden="true" />}
          valor={`${percentFromBasisPoints(descuentos.topeSupervision)} %`}
          pie={puede ? "Por encima, autoriza administración · tocar para cambiarlo" : "Por encima, autoriza administración"}
          {...(puede ? { onClick: () => setTope(percentFromBasisPoints(descuentos.topeSupervision)) } : {})}
        />
      </Resumen>

      <Tabs
        etiqueta="Descuentos"
        surface="admin"
        className="mt-4 min-h-0 flex-1"
        activa={vista}
        onCambiar={(id) => {
          setVista(id as "vigentes" | "retirados");
          setFiltro("TODOS");
        }}
        pestanas={[
          { id: "vigentes", etiqueta: "Vigentes", contador: vigentes.length, contenido: lista(vigentes, false) },
          { id: "retirados", etiqueta: "Retirados", contador: retiradas.length, contenido: lista(retiradas, true) },
        ]}
      />

      <Sheet
        abierto={creando}
        onCerrar={() => setCreando(false)}
        titulo="Nuevo descuento"
        descripcion="Se aplica antes del IVA y uno por cuenta. No se edita: para cambiarlo, se retira y se crea otro."
        pie={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="nuevo-descuento" variant="primary" surface="admin" className="flex-1" disabled={enviando}>
              {enviando ? "Guardando…" : "Crear descuento"}
            </Button>
          </div>
        }
      >
            <form id="nuevo-descuento" onSubmit={crear} className="flex flex-col gap-3">
              <div role="radiogroup" aria-label="Tipo de descuento" className="grid grid-cols-3 gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t.id}
                    onClick={() => setTipo(t.id)}
                    className={cn(
                      "flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border px-1 text-center text-[12px] leading-tight",
                      tipo === t.id ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                    )}
                  >
                    <t.icon size={14} aria-hidden="true" />
                    {t.nombre}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-ink-3">{TIPOS.find((t) => t.id === tipo)!.pista}</p>

              <Input
                surface="admin"
                label="Nombre"
                placeholder={tipo === "MEDIO" ? "Pago con Zelle" : tipo === "VIP" ? "VIP Oro" : "Cliente frecuente"}
                autoComplete="off"
                maxLength={40}
                value={nombre}
                error={errores.nombre || undefined}
                onChange={(e) => {
                  setNombre(e.target.value);
                  limpiar("nombre");
                }}
              />

              {tipo === "MEDIO" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="descuento-medio" className={ETIQUETA}>
                    Medio de pago
                  </label>
                  <select
                    id="descuento-medio"
                    className={cn(CAMPO, errores.medio && "border-state-crit")}
                    value={medio}
                    onChange={(e) => {
                      setMedio(e.target.value);
                      limpiar("medio");
                    }}
                  >
                    <option value="">Elige el medio…</option>
                    {mediosDelLocal.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {errores.medio && <p className="text-[12px] font-medium text-state-crit">{errores.medio}</p>}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Cuánto</span>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-1.5">
                  <div role="radiogroup" aria-label="Porcentaje o monto" className="flex">
                    {[true, false].map((pct) => (
                      <button
                        key={String(pct)}
                        type="button"
                        role="radio"
                        aria-checked={enPorcentaje === pct}
                        onClick={() => setEnPorcentaje(pct)}
                        className={cn(
                          "min-h-10 w-10 cursor-pointer border text-[14px] font-bold first:rounded-l-[var(--radius-control)] last:rounded-r-[var(--radius-control)]",
                          enPorcentaje === pct ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-3 hover:text-ink",
                        )}
                      >
                        {pct ? "%" : "$"}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label={enPorcentaje ? "Porcentaje" : "Monto en dólares"}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={enPorcentaje ? "10" : "2,00"}
                    className={cn(CAMPO, "tnum", errores.valor && "border-state-crit")}
                    value={cantidad}
                    onChange={(e) => {
                      setCantidad(e.target.value);
                      limpiar("valor");
                    }}
                  />
                </div>
                {errores.valor && <p className="text-[12px] font-medium text-state-crit">{errores.valor}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Sobre qué</span>
                <div role="radiogroup" aria-label="Sobre qué se descuenta" className="grid grid-cols-2 gap-1.5">
                  {ALCANCES.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={alcance === a.id}
                      onClick={() => {
                        setAlcance(a.id);
                        limpiar("alcance");
                      }}
                      className={cn(
                        "min-h-9 cursor-pointer rounded-[var(--radius-control)] border px-2 text-[12.5px]",
                        alcance === a.id ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                      )}
                    >
                      {a.nombre}
                    </button>
                  ))}
                </div>
                {alcance === "CATEGORIAS" && (
                  <div role="group" aria-label="Categorías" className="flex flex-wrap gap-1.5 pt-1">
                    {categorias.length === 0 ? (
                      <p className="text-[12px] text-ink-3">El catálogo todavía no tiene categorías.</p>
                    ) : (
                      categorias.map((c) => {
                        const on = elegidas.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              setElegidas((x) => (on ? x.filter((y) => y !== c) : [...x, c]));
                              limpiar("alcance");
                            }}
                            className={cn(
                              "min-h-8 cursor-pointer rounded-full border px-3 text-[12px]",
                              on ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                            )}
                          >
                            {c}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                {errores.alcance && <p className="text-[12px] font-medium text-state-crit">{errores.alcance}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="descuento-desde" className={ETIQUETA}>
                    Desde
                  </label>
                  <input
                    id="descuento-desde"
                    type="date"
                    min={hoy ?? undefined}
                    className={cn(CAMPO, "tnum", errores.desde && "border-state-crit")}
                    value={desde || hoy || ""}
                    onChange={(e) => {
                      setDesde(e.target.value);
                      limpiar("desde");
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="descuento-hasta" className={ETIQUETA}>
                    Hasta (opcional)
                  </label>
                  <input
                    id="descuento-hasta"
                    type="date"
                    min={desde || hoy || undefined}
                    className={cn(CAMPO, "tnum", errores.hasta && "border-state-crit")}
                    value={hasta}
                    onChange={(e) => {
                      setHasta(e.target.value);
                      limpiar("hasta");
                    }}
                  />
                </div>
              </div>
              {(errores.desde || errores.hasta) && <p className="text-[12px] font-medium text-state-crit">{errores.desde || errores.hasta}</p>}

            </form>
      </Sheet>

      <Dialog
        abierto={tope !== null}
        onCerrar={() => setTope(null)}
        titulo="Tope de supervisión"
        descripcion="Un descuento manual que pase de este porcentaje de la cuenta lo autoriza la administración, que no tiene tope."
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setTope(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" surface="admin" onClick={() => void guardarTope()} disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        }
      >
        <Input
          surface="admin"
          label="Tope (%)"
          inputMode="decimal"
          value={tope ?? ""}
          error={errores.tope || undefined}
          onChange={(e) => {
            setTope(e.target.value);
            limpiar("tope");
          }}
        />
      </Dialog>

      <Confirmacion
        abierto={retirando !== null}
        onCerrar={() => setRetirando(null)}
        titulo={`¿Retirar «${retirando?.nombre ?? ""}»?`}
        confirmar={enviando ? "Retirando…" : "Sí, retirar"}
        peligro
        ocupado={enviando}
        onConfirmar={() => retirando && void retirar(retirando)}
      >
        <p>La caja deja de ofrecerlo desde ahora. No se borra: lo cobrado con él sigue diciendo cuál fue.</p>
      </Confirmacion>
    </Container>
  );
}
