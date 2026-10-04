"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Cake, CalendarCheck, CalendarDays, CircleCheck, Clock, Hourglass, Info, Plus, Users, XCircle } from "lucide-react";
import {
  ReservarEventoCommandSchema,
  type AgendaEventosDto,
  type CatalogoEventosPublicadoDto,
  type EstadoReserva,
  type RepresentanteEncontradoDto,
  type ReservaEventoDto,
  type Resultado,
} from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { money, toMajor, type Money } from "@l2/domain-money";
import { anticipoDe, contactKey } from "@l2/domain-park";
import { percentFromBasisPoints } from "@l2/domain-tax";
import { Badge, Button, Cifra, Confirmacion, Container, EmptyState, FiltroSegmentado, Input, MoneyDisplay, PageHeader, Resumen, Sheet, Tabs, avisar, cn } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { buscarRepresentante } from "../park/parque.acciones";
import { cancelarReserva, reservarEvento } from "./eventos.acciones";
import { ESTADO, fechaCorta, fechaLarga, horaDelDia, horario } from "./formato.ts";

/**
 * Parque → Eventos: la agenda de cumpleaños (B10-1, V-10). Arriba, el resumen (hoy, anticipos por
 * cobrar, confirmadas); debajo, los próximos tres meses agrupados por día y las canceladas, en
 * pestañas. «Nueva reserva» abre una hoja: día, horario, paquete, invitados, cumpleañero y la familia
 * por su teléfono, como en la entrada. Al reservar, el anticipo queda en la cola de la caja; con él
 * cobrado la reserva está confirmada. Una reserva con el anticipo sin cobrar se cancela desde aquí;
 * con el anticipo cobrado, devolverlo es anular su cobro en la caja (DEC-24).
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const ICONO_ESTADO: Readonly<Record<EstadoReserva, typeof Clock>> = { ANTICIPO_POR_COBRAR: Hourglass, CONFIRMADA: CircleCheck, CANCELADA: XCircle };
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;
const enDolares = (m: { minor: string }) => money(BigInt(m.minor), "USD");

type Filtro = "TODAS" | "ANTICIPO_POR_COBRAR" | "CONFIRMADA";

/** Las horas que se ofrecen para un evento: de las 6:00 am a las 11:30 pm, cada media hora. */
const HORAS: readonly number[] = Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30);

export function EventosScreen({ catalogo, agenda }: { catalogo: CatalogoEventosPublicadoDto; agenda: Resultado<AgendaEventosDto> }) {
  const router = useRouter();
  const actor = useActorEnSesion();
  const puedeReservar = actor ? can(actor, "evento.reservar") === "PERMITIDO" : false;
  const puedeCobrar = actor ? can(actor, "documento.emitir") !== "DENEGADO" : false;
  const { formatoHora } = useSucursal().ajustes;
  // La agenda cambia al reservar, al cancelar y al cobrar o anular un anticipo en la caja.
  useAlCambiar(["eventos", "cuentas"], () => router.refresh());

  const [vista, setVista] = useState<"proximas" | "canceladas">("proximas");
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [creando, setCreando] = useState(false);
  const [cancelando, setCancelando] = useState<ReservaEventoDto | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!agenda.ok) {
    return (
      <Container ancho="panel" className="py-8">
        <EmptyState icon={<CalendarDays size={20} />} title="No se pudo leer la agenda" hint={agenda.mensaje} />
      </Container>
    );
  }
  const { hoy, reservas } = agenda.valor;
  const enPie = reservas.filter((r) => r.estado !== "CANCELADA");
  const canceladas = reservas.filter((r) => r.estado === "CANCELADA");
  const deHoy = enPie.filter((r) => r.fecha === hoy);
  const porCobrar = enPie.filter((r) => r.estado === "ANTICIPO_POR_COBRAR");
  const confirmadas = enPie.filter((r) => r.estado === "CONFIRMADA");
  const filtradas = filtro === "TODAS" ? enPie : enPie.filter((r) => r.estado === filtro);
  const aLaVenta = (catalogo.catalogo?.paquetes ?? []).filter((p) => p.active);

  const cancelar = async (r: ReservaEventoDto) => {
    setEnviando(true);
    try {
      const res = await cancelarReserva({ idempotencyKey: crypto.randomUUID(), reservaId: r.id });
      if (res.ok) {
        avisar.ok(`Reserva cancelada: cumpleaños de ${r.cumpleanero}. Su cuenta ${orden(r.cuenta.orderNumber)} salió de la caja.`);
        router.refresh();
      } else avisar.error(res.mensaje);
    } catch {
      avisar.error("No se pudo hablar con el servidor. La reserva sigue en pie.");
    } finally {
      setEnviando(false);
      setCancelando(null);
    }
  };

  const fila = (r: ReservaEventoDto) => {
    const Icono = ICONO_ESTADO[r.estado];
    const estado = ESTADO[r.estado];
    return (
      <li key={r.id} className={cn("flex flex-col gap-2 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between", r.estado === "CANCELADA" && "text-ink-3")}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-semibold text-ink">
            <span className="tnum text-ink-2">{horario(r.inicio, r.fin, formatoHora)}</span>
            <span>
              Cumpleaños de {r.cumpleanero}
              {r.edad !== null && <span className="font-normal text-ink-2"> · {r.edad} años</span>}
            </span>
            <Badge tone={estado.tono} icon={<Icono size={12} aria-hidden="true" />}>
              {estado.texto}
            </Badge>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-2">
            <span>{r.paquete.name}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} aria-hidden="true" />
              <span className="tnum">{r.invitados}</span> invitados
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{r.representante.fullName}</span>
            <span aria-hidden="true">·</span>
            <span className="tnum">Cuenta {orden(r.cuenta.orderNumber)}</span>
          </p>
          <p className="tnum text-[12px] text-ink-3">
            Anticipo {percentFromBasisPoints(r.anticipoBps)} % <MoneyDisplay value={toMajor(enDolares(r.anticipo))} currency="USD" size="sm" tone="muted" /> · saldo el día{" "}
            <MoneyDisplay value={toMajor(enDolares(r.saldo))} currency="USD" size="sm" tone="muted" /> · sin IVA
            {r.cancelada ? ` · cancelada por ${r.cancelada.por}` : ` · reservada por ${r.reservadaPor}`}
          </p>
        </div>
        {r.estado === "ANTICIPO_POR_COBRAR" && (
          <div className="flex shrink-0 gap-2 self-start lg:self-auto">
            {puedeCobrar && (
              <Link
                href={"/caja" as Route}
                className="inline-flex min-h-8 items-center rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
              >
                Cobrar en caja
              </Link>
            )}
            {puedeReservar && (
              <Button type="button" variant="ghost" surface="admin" className="gap-1.5" onClick={() => setCancelando(r)}>
                <XCircle size={14} className="text-state-crit" aria-hidden="true" />
                Cancelar
              </Button>
            )}
          </div>
        )}
      </li>
    );
  };

  /** Las reservas agrupadas por día, con el día como cabecera. */
  const porDia = (lista: readonly ReservaEventoDto[]) => {
    const dias = [...new Set(lista.map((r) => r.fecha))];
    return dias.map((dia) => (
      <li key={dia}>
        <h3 className="sticky top-0 z-[1] border-b border-line bg-surface-2 px-4 py-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-ink-2 uppercase">
          {dia === hoy ? `Hoy · ${fechaLarga(dia)}` : fechaLarga(dia)}
        </h3>
        <ul className="divide-y divide-line">{lista.filter((r) => r.fecha === dia).map(fila)}</ul>
      </li>
    ));
  };

  const lista = (items: readonly ReservaEventoDto[], vacio: { title: string; hint: string }, conFiltro: boolean) => (
    <div className="flex min-h-0 flex-col gap-3 md:h-full">
      {conFiltro && (
        <div className="shrink-0">
          <FiltroSegmentado
            etiqueta="Estado de la reserva"
            valor={filtro}
            onCambiar={setFiltro}
            opciones={[
              { id: "TODAS", nombre: "Todas", cuenta: enPie.length },
              { id: "ANTICIPO_POR_COBRAR", nombre: "Anticipo por cobrar", cuenta: porCobrar.length },
              { id: "CONFIRMADA", nombre: "Confirmadas", cuenta: confirmadas.length },
            ]}
          />
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={<Cake size={20} />} title={vacio.title} hint={vacio.hint} />
      ) : (
        <ul className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:overflow-y-auto">{porDia(items)}</ul>
      )}
      <p className="flex shrink-0 items-start gap-1.5 text-[12.5px] text-ink-3">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        El anticipo se cobra en la caja con su IVA. Con él cobrado, la reserva no se cancela aquí: devolverlo es anular su cobro en la caja.
      </p>
    </div>
  );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Parque", href: "/panel/parque" }, { texto: "Eventos" }]}
        titulo="Cumpleaños"
        descripcion="La agenda de los próximos tres meses. Al reservar, el anticipo del paquete queda en la caja; el saldo se cobra el día del evento."
        acciones={
          puedeReservar ? (
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setCreando(true)} disabled={aLaVenta.length === 0}>
              <Plus size={15} aria-hidden="true" /> Nueva reserva
            </Button>
          ) : undefined
        }
      />

      {aLaVenta.length === 0 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[13px] text-state-warn">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            No hay paquetes de cumpleaños a la venta: sin ellos no se reserva. Los carga administración en{" "}
            <Link href={"/panel/ajustes/cumpleanos" as Route} className="font-semibold underline underline-offset-2">
              Ajustes → Cumpleaños
            </Link>
            .
          </span>
        </p>
      )}

      <Resumen etiqueta="Resumen de los cumpleaños">
        <Cifra
          etiqueta="Hoy"
          icono={<Cake aria-hidden="true" />}
          valor={String(deHoy.length)}
          pie={deHoy.length > 0 ? `El primero a las ${horario(deHoy[0]!.inicio, deHoy[0]!.fin, formatoHora).split(" – ")[0]}` : "Ningún cumpleaños hoy"}
          onClick={() => {
            setVista("proximas");
            setFiltro("TODAS");
          }}
        />
        <Cifra
          etiqueta="Anticipo por cobrar"
          icono={<Hourglass aria-hidden="true" />}
          tono={porCobrar.length > 0 ? "warn" : "idle"}
          valor={String(porCobrar.length)}
          pie={porCobrar.length > 0 ? "En la cola de la caja" : "Todos los anticipos cobrados"}
          activo={vista === "proximas" && filtro === "ANTICIPO_POR_COBRAR"}
          onClick={() => {
            setVista("proximas");
            setFiltro("ANTICIPO_POR_COBRAR");
          }}
        />
        <Cifra
          etiqueta="Confirmadas"
          icono={<CalendarCheck aria-hidden="true" />}
          tono={confirmadas.length > 0 ? "ok" : "idle"}
          valor={String(confirmadas.length)}
          pie={confirmadas.length > 0 ? `La próxima: ${fechaCorta(confirmadas[0]!.fecha)}` : "Ninguna con el anticipo cobrado"}
          activo={vista === "proximas" && filtro === "CONFIRMADA"}
          onClick={() => {
            setVista("proximas");
            setFiltro("CONFIRMADA");
          }}
        />
        <Cifra
          etiqueta="Paquetes"
          icono={<CalendarDays aria-hidden="true" />}
          valor={String(aLaVenta.length)}
          pie={catalogo.catalogo ? `Anticipo del ${percentFromBasisPoints(catalogo.catalogo.anticipoBps)} %` : "Sin cargar"}
        />
      </Resumen>

      <Tabs
        etiqueta="Reservas"
        surface="admin"
        className="mt-4 min-h-0 flex-1"
        activa={vista}
        onCambiar={(id) => setVista(id as "proximas" | "canceladas")}
        pestanas={[
          {
            id: "proximas",
            etiqueta: "Próximas",
            contador: enPie.length,
            contenido: lista(filtradas, enPie.length === 0 ? { title: "Ningún cumpleaños reservado", hint: puedeReservar ? "Pulsa «Nueva reserva» cuando una familia lo pida." : "Las reservas se hacen en la caja." } : { title: "Ninguna en este estado", hint: "Cambia el filtro para ver las demás." }, true),
          },
          { id: "canceladas", etiqueta: "Canceladas", contador: canceladas.length, contenido: lista(canceladas, { title: "Ninguna cancelada", hint: "Las que se cancelen se quedan aquí, con quién lo hizo." }, false) },
        ]}
      />

      {creando && (
        <NuevaReserva
          catalogo={catalogo}
          hoy={hoy}
          onCerrar={() => setCreando(false)}
          onHecha={(r) => {
            setCreando(false);
            avisar.ok(
              `Reserva hecha: cumpleaños de ${r.cumpleanero}, el ${fechaLarga(r.fecha)}. El anticipo está en la caja con la cuenta ${orden(r.cuenta.orderNumber)}.`,
            );
            router.refresh();
          }}
        />
      )}

      <Confirmacion
        abierto={cancelando !== null}
        onCerrar={() => setCancelando(null)}
        titulo={`¿Cancelar el cumpleaños de ${cancelando?.cumpleanero ?? ""}?`}
        confirmar={enviando ? "Cancelando…" : "Sí, cancelar"}
        peligro
        ocupado={enviando}
        onConfirmar={() => cancelando && void cancelar(cancelando)}
      >
        <p>
          Su anticipo no se ha cobrado: la cuenta {cancelando ? orden(cancelando.cuenta.orderNumber) : ""} sale de la caja y el horario queda libre. La reserva no se borra:
          queda en «Canceladas» con tu nombre.
        </p>
      </Confirmacion>
    </Container>
  );
}

/** La hoja de la reserva nueva. Vive aparte para que sus campos nazcan vacíos cada vez que se abre. */
function NuevaReserva({
  catalogo,
  hoy,
  onCerrar,
  onHecha,
}: {
  catalogo: CatalogoEventosPublicadoDto;
  hoy: string;
  onCerrar: () => void;
  onHecha: (r: ReservaEventoDto) => void;
}) {
  const paquetes = (catalogo.catalogo?.paquetes ?? []).filter((p) => p.active);
  const anticipoBps = catalogo.catalogo?.anticipoBps ?? 5000;
  const [clave] = useState(() => crypto.randomUUID());
  const [fecha, setFecha] = useState(hoy);
  const [inicio, setInicio] = useState(15 * 60);
  const [fin, setFin] = useState(18 * 60);
  const { formatoHora } = useSucursal().ajustes;
  const [paqueteId, setPaqueteId] = useState(paquetes[0]?.id ?? "");
  const [invitados, setInvitados] = useState("");
  const [cumpleanero, setCumpleanero] = useState("");
  const [edad, setEdad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  // La familia se busca por su teléfono entero, como en la entrada (F5-03).
  const llave = contactKey(telefono);
  const buscable = llave !== null && llave.length >= 7;
  const [busqueda, setBusqueda] = useState<{ llave: string; familia: RepresentanteEncontradoDto | null } | null>(null);
  useEffect(() => {
    if (!buscable || busqueda?.llave === llave) return;
    const id = window.setTimeout(() => {
      void buscarRepresentante({ contacto: telefono })
        .then((r) => {
          if (r.ok) setBusqueda({ llave: llave!, familia: r.valor });
        })
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(id);
  }, [buscable, llave, telefono, busqueda?.llave]);
  const buscada = buscable && busqueda?.llave === llave ? busqueda : null;
  const encontrado = buscada?.familia ?? null;

  const paquete = paquetes.find((p) => p.id === paqueteId) ?? null;
  const cuentas = useMemo(() => {
    if (!paquete) return null;
    const precio = money(BigInt(paquete.price.minor), "USD");
    // El mismo cálculo que hará el servidor (dominio del parque): aquí solo se anticipa.
    return { precio, ...anticipoDe(precio, anticipoBps) };
  }, [paquete, anticipoBps]);

  const limpiar = (k: string) => setErrores((e) => ({ ...e, [k]: "" }));

  const reservar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = {
      idempotencyKey: clave,
      fecha,
      inicio,
      fin,
      paqueteId,
      invitados: Number(invitados) || 0,
      cumpleanero: cumpleanero.trim(),
      ...(edad.trim() ? { edad: Number(edad) } : {}),
      ...(encontrado ? { guardianId: encontrado.id } : { guardian: { fullName: nombre.trim(), contactReference: telefono.trim() } }),
    };
    const v = ReservarEventoCommandSchema.safeParse(cmd);
    const nuevos: Record<string, string> = {};
    if (!v.success) for (const p of v.error.issues) nuevos[p.path[0] === "guardian" ? (p.path[1] === "contactReference" ? "telefono" : "nombre") : String(p.path[0])] ??= p.message;
    if (paquete && cmd.invitados > 0 && (cmd.invitados < paquete.minInvitados || cmd.invitados > paquete.maxInvitados)) {
      nuevos.invitados = `Entre ${paquete.minInvitados} y ${paquete.maxInvitados} con este paquete`;
    }
    if (!buscable) nuevos.telefono = "El teléfono de la familia, con todos sus números";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    try {
      const r = await reservarEvento(cmd);
      if (r.ok) onHecha(r.valor);
      else if (r.problemas?.length) setErrores(Object.fromEntries(r.problemas.map((p) => [String(p.path[0]), r.mensaje])));
      else avisar.error(r.mensaje);
    } catch {
      avisar.error("No se pudo hablar con el servidor. La reserva no se hizo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Nueva reserva"
      descripcion={`Al reservar, el anticipo (${percentFromBasisPoints(anticipoBps)} % del paquete) queda en la caja para cobrarlo con su IVA. El saldo, el día del evento.`}
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form="nueva-reserva" variant="primary" surface="admin" className="flex-1" disabled={enviando}>
            {enviando ? "Reservando…" : "Reservar y pasar el anticipo a caja"}
          </Button>
        </div>
      }
    >
      <form id="nueva-reserva" onSubmit={reservar} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <label htmlFor="reserva-fecha" className={ETIQUETA}>
              Día
            </label>
            <input
              id="reserva-fecha"
              type="date"
              min={hoy}
              className={cn(CAMPO, "tnum", errores.fecha && "border-state-crit")}
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                limpiar("fecha");
              }}
            />
          </div>
          {(
            [
              ["inicio", "Desde", inicio, setInicio],
              ["fin", "Hasta", fin, setFin],
            ] as const
          ).map(([id, etiqueta, valor, poner]) => (
            <div key={id} className="flex flex-col gap-1.5">
              <label htmlFor={`reserva-${id}`} className={ETIQUETA}>
                {etiqueta}
              </label>
              <select
                id={`reserva-${id}`}
                className={cn(CAMPO, "tnum", errores[id] && "border-state-crit")}
                value={valor}
                onChange={(e) => {
                  poner(Number(e.target.value));
                  limpiar(id);
                }}
              >
                {HORAS.map((m) => (
                  <option key={m} value={m}>
                    {horaDelDia(m, formatoHora)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {(errores.fecha || errores.inicio || errores.fin) && <p className="text-[12px] font-medium text-state-crit">{errores.fecha || errores.inicio || errores.fin}</p>}

        <div className="flex flex-col gap-1.5">
          <span className={ETIQUETA}>Paquete</span>
          <div role="radiogroup" aria-label="Paquete" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {paquetes.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={paqueteId === p.id}
                onClick={() => {
                  setPaqueteId(p.id);
                  limpiar("paqueteId");
                  limpiar("invitados");
                }}
                className={cn(
                  "flex min-h-12 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-left",
                  paqueteId === p.id ? "border-brand bg-brand/12 text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-2 text-[13.5px] font-semibold">
                  {p.name}
                  <MoneyDisplay value={toMajor(enDolares(p.price))} currency="USD" size="sm" />
                </span>
                <span className="tnum text-[12px] text-ink-3">
                  {p.minInvitados} a {p.maxInvitados} invitados
                  {p.incluye.length > 0 ? ` · ${p.incluye.map((x) => (x.quantity > 1 ? `${x.quantity} × ${x.name}` : x.name)).join(", ")}` : ""}
                </span>
              </button>
            ))}
          </div>
          {errores.paqueteId && <p className="text-[12px] font-medium text-state-crit">{errores.paqueteId}</p>}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.8fr)] gap-2">
          <Input
            surface="admin"
            label="Invitados"
            inputMode="numeric"
            autoComplete="off"
            placeholder={paquete ? `${paquete.minInvitados}–${paquete.maxInvitados}` : ""}
            value={invitados}
            error={errores.invitados || undefined}
            onChange={(e) => {
              setInvitados(e.target.value.replace(/\D/g, ""));
              limpiar("invitados");
            }}
          />
          <Input
            surface="admin"
            label="Cumpleañero"
            autoComplete="off"
            maxLength={60}
            placeholder="Sofía"
            value={cumpleanero}
            error={errores.cumpleanero || undefined}
            onChange={(e) => {
              setCumpleanero(e.target.value);
              limpiar("cumpleanero");
            }}
          />
          <Input
            surface="admin"
            label="Cumple"
            inputMode="numeric"
            autoComplete="off"
            placeholder="6"
            value={edad}
            error={errores.edad || undefined}
            onChange={(e) => {
              setEdad(e.target.value.replace(/\D/g, "").slice(0, 2));
              limpiar("edad");
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            surface="admin"
            label="Teléfono de la familia"
            inputMode="tel"
            autoComplete="off"
            placeholder="0414-1234567"
            value={telefono}
            error={errores.telefono || undefined}
            hint={encontrado ? "Ya vino: es de esta familia" : buscada ? "No la tenemos: escribe su nombre" : "Si ya vino, aparece sola"}
            onChange={(e) => {
              setTelefono(e.target.value);
              limpiar("telefono");
            }}
          />
          {encontrado ? (
            <div className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Representante</span>
              <p className="flex min-h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-[14px] font-semibold text-ink">{encontrado.fullName}</p>
            </div>
          ) : (
            <Input
              surface="admin"
              label="Nombre del representante"
              autoComplete="off"
              maxLength={80}
              value={nombre}
              error={errores.nombre || undefined}
              onChange={(e) => {
                setNombre(e.target.value);
                limpiar("nombre");
              }}
            />
          )}
        </div>

        {cuentas && (
          <dl className="tnum grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line text-[12.5px]">
            {(
              [
                ["Paquete", cuentas.precio],
                [`Anticipo ${percentFromBasisPoints(anticipoBps)} %`, cuentas.anticipo],
                ["Saldo el día", cuentas.saldo],
              ] as const satisfies readonly (readonly [string, Money])[]
            ).map(([t, m]) => (
              <div key={t} className="flex flex-col gap-0.5 bg-surface px-3 py-2">
                <dt className="text-ink-3">{t}</dt>
                <dd className="font-semibold text-ink">
                  <MoneyDisplay value={toMajor(m)} currency="USD" size="sm" />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-[12px] text-ink-3">Importes sin IVA: la caja lo suma al cobrar.</p>
      </form>
    </Sheet>
  );
}
