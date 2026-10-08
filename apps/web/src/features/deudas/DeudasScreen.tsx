"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CircleCheckBig, CircleX, Clock, HandCoins, Search, Undo2, Wallet } from "lucide-react";
import type { DeudaDto, DeudasDto, EstadoDeuda, Rechazo } from "@l2/contracts";
import { money, sum, toMajor } from "@l2/domain-money";
import { Button, Container, Dialog, Input, MoneyDisplay, Tabs, avisar, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { can } from "@l2/domain-identity";
import { cobrarDeuda, devolverDeuda, leerDeudas, perderDeuda } from "./deudas.acciones";

/**
 * Caja → Deudas — B3-11 (M-33). Lo que los clientes dejaron sin pagar: las pendientes, con su cliente (nombre, cédula y
 * teléfono, completos para quien cobra: M-33), lo que deben, de dónde, quién lo sentó, quién la marcó y quién lo
 * autorizó. «Cobrar» la pasa a la caja; «Devolver» la saca de la caja si al final no pagó; «Dar por perdida» es de
 * administración. Se relee sola cuando algo cambia (tema «cuentas»).
 */

type Pestana = "PENDIENTE" | "COBRADA" | "PERDIDA";
const cifras = (s: string) => s.replace(/\D/g, "");
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function DeudasScreen({ datos }: { datos: DeudasDto | null }) {
  const [deudas, setDeudas] = useState<readonly DeudaDto[] | null>(datos?.deudas ?? null);
  const [pestana, setPestana] = useState<Pestana>("PENDIENTE");
  const [busqueda, setBusqueda] = useState("");
  const [perdiendo, setPerdiendo] = useState<DeudaDto | null>(null);

  useAlCambiar(["cuentas"], () => {
    void leerDeudas()
      .then((r) => r.ok && setDeudas(r.valor.deudas))
      .catch(() => undefined);
  });
  const actualizar = (d: DeudaDto) => setDeudas((xs) => (xs ?? []).map((x) => (x.id === d.id ? d : x)));

  const q = sinAcentos(busqueda.trim());
  const visibles = useMemo(
    () =>
      (deudas ?? []).filter((d) => {
        if (q === "") return true;
        const n = cifras(q);
        return sinAcentos(d.cliente.nombre).includes(q) || (n.length >= 4 && [d.cliente.cedula, d.cliente.telefono].some((x) => cifras(x).includes(n))) || String(d.orden) === n;
      }),
    [deudas, q],
  );
  const de = (e: EstadoDeuda) => visibles.filter((d) => d.estado === e);
  const pendientes = (deudas ?? []).filter((d) => d.estado === "PENDIENTE");
  const total = sum(pendientes.map((d) => money(BigInt(d.monto.minor), "USD")), "USD");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="muro" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 apaisado:bajo:py-2">
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">Deudas de clientes</h1>
            <p className="mt-1 text-detalle text-ink-3">Lo que dejaron sin pagar quienes se fueron: se cobra cuando vuelvan.</p>
          </div>
          <p className="flex items-baseline gap-2 text-detalle text-ink-2">
            <span className="tnum font-semibold text-ink">{pendientes.length}</span> {pendientes.length === 1 ? "pendiente" : "pendientes"} ·
            <MoneyDisplay value={toMajor(total)} currency="USD" />
          </p>
        </Container>
      </header>

      <Container as="main" ancho="muro" className="flex min-h-0 flex-1 flex-col gap-3 py-4 apaisado:bajo:py-3">
        {deudas === null ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-detalle text-state-crit">
            No se pudieron leer las deudas: sin conexión con el servidor o sin permiso para verlas.
          </p>
        ) : (
          <>
            <div className="max-w-md">
              <Input
                label="Buscar"
                surface="tablet"
                type="search"
                leading={<Search className="size-(--icono-texto)" aria-hidden="true" />}
                placeholder="Nombre, cédula, teléfono o #orden"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                data-privado=""
              />
            </div>
            <Tabs
              etiqueta="Deudas"
              activa={pestana}
              onCambiar={(p) => setPestana(p as Pestana)}
              className="min-h-0 flex-1"
              pestanas={[
                { id: "PENDIENTE", etiqueta: "Pendientes", contador: de("PENDIENTE").length, contenido: <Lista deudas={de("PENDIENTE")} vacia="Nadie debe nada." onCambio={actualizar} onPerder={setPerdiendo} /> },
                { id: "COBRADA", etiqueta: "Cobradas", contenido: <Lista deudas={de("COBRADA")} vacia="Ninguna cobrada en los últimos 90 días." onCambio={actualizar} onPerder={setPerdiendo} /> },
                { id: "PERDIDA", etiqueta: "Perdidas", contenido: <Lista deudas={de("PERDIDA")} vacia="Ninguna perdida en los últimos 90 días." onCambio={actualizar} onPerder={setPerdiendo} /> },
              ]}
            />
          </>
        )}
      </Container>
      <PerderDeudaDialog
        deuda={perdiendo}
        onCerrar={() => setPerdiendo(null)}
        onHecha={(d) => {
          actualizar(d);
          setPerdiendo(null);
        }}
      />
    </div>
  );
}

const ESTADO: Readonly<Record<EstadoDeuda | "EN_CAJA", { texto: string; icono: typeof Clock; clase: string }>> = {
  PENDIENTE: { texto: "Pendiente", icono: Clock, clase: "bg-state-warn-bg text-state-warn" },
  EN_CAJA: { texto: "En la caja", icono: Wallet, clase: "bg-brand/15 text-brand" },
  COBRADA: { texto: "Cobrada", icono: CircleCheckBig, clase: "bg-state-ok-bg text-state-ok" },
  PERDIDA: { texto: "Perdida", icono: CircleX, clase: "bg-surface-2 text-ink-2" },
};

function Lista({
  deudas,
  vacia,
  onCambio,
  onPerder,
}: {
  deudas: readonly DeudaDto[];
  vacia: string;
  onCambio: (d: DeudaDto) => void;
  onPerder: (d: DeudaDto) => void;
}) {
  if (deudas.length === 0) return <p className="px-1 py-6 text-cuerpo text-ink-3">{vacia}</p>;
  return (
    <ul className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
      {deudas.map((d) => (
        <li key={d.id}>
          <TarjetaDeDeuda deuda={d} onCambio={onCambio} onPerder={onPerder} />
        </li>
      ))}
    </ul>
  );
}

function TarjetaDeDeuda({ deuda: d, onCambio, onPerder }: { deuda: DeudaDto; onCambio: (d: DeudaDto) => void; onPerder: (d: DeudaDto) => void }) {
  const reloj = useReloj();
  const router = useRouter();
  const { adoptar } = useCuentas();
  const actor = useActorEnSesion();
  const [enviando, setEnviando] = useState(false);
  const estado = d.estado === "PENDIENTE" && d.enCobro ? ESTADO.EN_CAJA : ESTADO[d.estado];
  const Icono = estado.icono;
  const puedePerder = actor ? can(actor, "cuenta.incobrable") !== "DENEGADO" : false;

  async function cobrar() {
    if (d.enCobro) {
      router.push(`/caja?cuenta=${d.enCobro}` as Route);
      return;
    }
    setEnviando(true);
    const r = await cobrarDeuda({ idempotencyKey: globalThis.crypto.randomUUID(), deudaId: d.id }).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la deuda no pasó a la caja." }),
    );
    setEnviando(false);
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    adoptar(r.valor);
    router.push(`/caja?cuenta=${r.valor.id}` as Route);
  }

  async function devolver() {
    setEnviando(true);
    const r = await devolverDeuda({ idempotencyKey: globalThis.crypto.randomUUID(), deudaId: d.id }).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: el cobro sigue en la caja." }),
    );
    setEnviando(false);
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    onCambio(r.valor);
    avisar.ok(`La deuda de ${d.cliente.nombre} vuelve a estar pendiente`, { detalle: "Su cobro salió de la caja." });
  }

  return (
    <article className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-tarjeta font-bold break-words text-ink">{d.cliente.nombre}</h2>
          <p data-privado="" className="tnum text-detalle text-ink-2">
            {d.cliente.cedula} · {d.cliente.telefono}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <MoneyDisplay value={toMajor(money(BigInt(d.monto.minor), "USD"))} currency="USD" size="lg" />
          <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-etiqueta font-semibold uppercase", estado.clase)}>
            <Icono className="size-(--icono-etiqueta)" aria-hidden="true" />
            {estado.texto}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-detalle">
        <dt className="text-ink-3">Consumió</dt>
        <dd className="tnum text-ink-2">
          #{String(d.orden).padStart(4, "0")} · {d.lugar}
        </dd>
        <dt className="text-ink-3">Se fue</dt>
        <dd className="text-ink-2">{reloj.diaYHora(Date.parse(d.marcadaEl))}</dd>
        <dt className="text-ink-3">Lo atendió</dt>
        <dd className="text-ink-2">{d.sentadoPor}</dd>
        <dt className="text-ink-3">Lo marcó</dt>
        <dd className="text-ink-2">
          {d.marcadaPor}
          {d.autorizadaPor && d.autorizadaPor !== d.marcadaPor ? ` · autorizó ${d.autorizadaPor}` : ""}
        </dd>
        {d.detalle && (
          <>
            <dt className="text-ink-3">Detalle</dt>
            <dd className="text-ink-2">{d.detalle}</dd>
          </>
        )}
        {d.desenlace && (
          <>
            <dt className="text-ink-3">{d.estado === "COBRADA" ? "Cobrada" : "Perdida"}</dt>
            <dd className="text-ink-2">
              {reloj.diaYHora(Date.parse(d.desenlace.el))} · {d.desenlace.por}
              {d.desenlace.autorizadoPor && d.desenlace.autorizadoPor !== d.desenlace.por ? ` · autorizó ${d.desenlace.autorizadoPor}` : ""}
              {d.desenlace.motivo ? ` · ${d.desenlace.motivo}` : ""}
            </dd>
          </>
        )}
      </dl>
      {d.estado === "PENDIENTE" && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button surface="tablet" variant="primary" onClick={() => void cobrar()} disabled={enviando}>
            <HandCoins size={17} aria-hidden="true" />
            {d.enCobro ? "Ir a la caja" : "Cobrar"}
          </Button>
          {d.enCobro && (
            <Button surface="tablet" variant="neutral" onClick={() => void devolver()} disabled={enviando}>
              <Undo2 size={17} aria-hidden="true" />
              Devolver a deudas
            </Button>
          )}
          {puedePerder && !d.enCobro && (
            <Button surface="tablet" variant="neutral" onClick={() => onPerder(d)} disabled={enviando}>
              <CircleX size={17} aria-hidden="true" />
              Dar por perdida
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** Dar una deuda por perdida: administración, con su PIN (la caja y supervisión, con el de administración) y un motivo. */
function PerderDeudaDialog({ deuda, onCerrar, onHecha }: { deuda: DeudaDto | null; onCerrar: () => void; onHecha: (d: DeudaDto) => void }) {
  const a = useAutorizacion("cuenta.incobrable", deuda !== null);
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  if ((deuda?.id ?? null) !== para) {
    setPara(deuda?.id ?? null);
    setMotivo("");
    setErrores({});
    setClave(globalThis.crypto.randomUUID());
  }
  if (!deuda) return null;

  async function confirmar() {
    if (!deuda || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (motivo.trim().length < 3) nuevos.motivo = "Escribe por qué no se va a cobrar";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    const r = await perderDeuda({ idempotencyKey: clave, deudaId: deuda.id, motivo: motivo.trim() }, a.autorizacion(motivo.trim())).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la deuda sigue pendiente." }),
    );
    setEnviando(false);
    if (r.ok) {
      avisar.ok(`La deuda de ${deuda.cliente.nombre} quedó como perdida`);
      onHecha(r.valor);
      return;
    }
    const e = erroresDeRechazo(r.mensaje);
    if (e.pin) a.borrarPin();
    setErrores(e as Record<string, string>);
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Dar por perdida"
      descripcion="La deuda deja de estar pendiente y no se le cobra al cliente. Queda anotada con el motivo y quién lo autorizó: nada se borra."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="danger" onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando}>
            {enviando ? "Anotando…" : "Dar por perdida"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3 rounded-[var(--radius-control)] border border-line p-3">
          <span className="min-w-0 font-semibold break-words text-ink">{deuda.cliente.nombre}</span>
          <MoneyDisplay value={toMajor(money(BigInt(deuda.monto.minor), "USD"))} currency="USD" />
        </div>
        <Input
          label="1 · Motivo (obligatorio)"
          surface="tablet"
          value={motivo}
          maxLength={280}
          placeholder="No volvió en tres meses"
          onChange={(e) => {
            setMotivo(e.target.value);
            setErrores((x) => ({ ...x, motivo: "" }));
          }}
          error={errores.motivo || undefined}
        />
        <CampoAutorizacion
          a={a}
          numero={2}
          denegado="Tu puesto no puede dar deudas por perdidas."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-detalle text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
