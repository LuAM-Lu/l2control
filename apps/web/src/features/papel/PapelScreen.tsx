"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, FileText, HandCoins, Lock, Printer, TriangleAlert, Wallet } from "lucide-react";
import type { CargaDePapelDto, CargasDePapelDto, Problema, Rechazo } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Badge, Button, Confirmacion, Container, Input, Tabs, avisar } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { EntradaDePapel } from "./EntradaDePapel.tsx";
import { PorRevisar } from "./PorRevisar.tsx";
import { EstadoDeCarga, RegistrosDePapel } from "./RegistrosDePapel.tsx";
import { SalidaDePapel } from "./SalidaDePapel.tsx";
import { abrirCarga, terminarCarga } from "./papel.acciones";
import { aIso, aTexto } from "./hora.ts";

/**
 * La carga de lo anotado en papel — B3-7, V-12, ADR-027, JORNADA §4 y §7.
 *
 * Si caen los dos enlaces se trabaja en formularios (se imprimen desde aquí). Al volver, la cajera abre una
 * carga en su turno diciendo cuánto duró el corte, carga lo anotado —entradas, salidas y cobros, cada uno con la
 * hora real del papel— y la termina. Supervisión la revisa contra las hojas, con su PIN, antes del Z.
 *
 * Todo lo que se enseña sale del servidor; la pantalla no decide nada de lo que se acepta.
 */
export function PapelScreen({ datos }: { datos: CargasDePapelDto | null }) {
  const router = useRouter();
  const actor = useActorEnSesion();
  const puedeRevisar = actor ? can(actor, "papel.revisar") !== "DENEGADO" : false;
  const [pestana, setPestana] = useState("mia");
  // En vivo (B5-1): otra caja carga, o supervisión revisa, y esta pantalla se vuelve a leer sola.
  useAlCambiar(["papel", "turno"], () => router.refresh());

  const porRevisar = datos?.cargas.filter((c) => c.estado === "CERRADA" || c.estado === "ABIERTA") ?? [];
  const mia = (
    <MiCarga datos={datos} onCambio={() => router.refresh()} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="muro" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 apaisado:bajo:py-2">
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">Carga desde papel</h1>
            <p className="mt-1 text-[13px] text-ink-3">Si caen internet y luz se anota en formularios; al volver, se carga aquí y supervisión lo revisa.</p>
          </div>
          <Link
            href={"/formularios-papel" as Route}
            target="_blank"
            className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13.5px] font-semibold text-ink hover:border-line-strong"
          >
            <Printer size={16} aria-hidden="true" />
            Imprimir los formularios
          </Link>
        </Container>
      </header>

      <Container as="main" ancho="muro" className="flex min-h-0 flex-1 flex-col gap-4 py-4 apaisado:bajo:py-3">
        {datos === null ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
            No se pudo leer la carga desde papel: sin conexión con el servidor o sin permiso para verla.
          </p>
        ) : puedeRevisar ? (
          <Tabs
            etiqueta="Carga desde papel"
            activa={pestana}
            onCambiar={setPestana}
            className="min-h-0 flex-1"
            pestanas={[
              { id: "mia", etiqueta: "Mi carga", contenido: mia },
              {
                id: "revisar",
                etiqueta: "Por revisar",
                contador: porRevisar.length,
                contenido: <PorRevisar cargas={porRevisar} onHecho={() => router.refresh()} />,
              },
            ]}
          />
        ) : (
          mia
        )}
      </Container>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── mi carga */

function MiCarga({ datos, onCambio }: { datos: CargasDePapelDto | null; onCambio: () => void }) {
  if (!datos) return null;
  if (!datos.turnoId || !datos.turnoAbiertoEn) {
    return (
      <section className="flex max-w-xl flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <Wallet size={17} className="text-ink-2" aria-hidden="true" />
          Primero, el turno
        </h2>
        <p className="text-[13.5px] text-ink-2">Lo anotado en papel se carga en el turno de esta caja. Ábrelo y vuelve: sin turno no se carga.</p>
        <Link href={"/turno" as Route} className="inline-flex min-h-12 w-fit items-center rounded-[var(--radius-control)] bg-brand px-4 font-semibold text-on-brand">
          Abrir el turno
        </Link>
      </section>
    );
  }
  const delTurno = datos.cargas.filter((c) => c.turnoId === datos.turnoId);
  const abierta = delTurno.find((c) => c.estado === "ABIERTA") ?? null;
  const anteriores = delTurno.filter((c) => c.estado !== "ABIERTA");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {abierta ? <CargaAbierta carga={abierta} onCambio={onCambio} /> : <AbrirCarga datos={datos} onCambio={onCambio} />}
      {anteriores.length > 0 && <Anteriores cargas={anteriores} />}
    </div>
  );
}

/** Los problemas de un rechazo que son de un campo, para decirlos junto a él. */
const delCampo = (problemas: readonly Problema[] | undefined, campo: string) => problemas?.find((p) => p.path[0] === campo) !== undefined;

function AbrirCarga({ datos, onCambio }: { datos: CargasDePapelDto; onCambio: () => void }) {
  const reloj = useReloj();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ mensaje: string; campo: "desde" | "hasta" | null } | null>(null);
  /** La clave del intento: un doble toque o un reintento abre una sola carga (I-11). */
  const clave = useRef<string | null>(null);
  const ahora = Date.parse(datos.ahora);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const d = aIso(desde, reloj.zona);
    const h = aIso(hasta, reloj.zona);
    if (!d || !h) {
      setError({ mensaje: "Escribe cuándo empezó y cuándo terminó el corte.", campo: !d ? "desde" : "hasta" });
      return;
    }
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    const r = await abrirCarga({ idempotencyKey: clave.current, desde: d, hasta: h, ...(nota.trim() ? { nota: nota.trim() } : {}) }).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la carga no se abrió." }),
    );
    setEnviando(false);
    if (r.ok) {
      clave.current = null;
      avisar.ok("Carga abierta", { detalle: "Ahora carga las entradas, las salidas y los cobros del papel." });
      onCambio();
      return;
    }
    if (r.motivo !== "NO_DISPONIBLE") clave.current = null;
    setError({ mensaje: r.mensaje, campo: delCampo(r.problemas, "hasta") ? "hasta" : delCampo(r.problemas, "desde") ? "desde" : null });
  }

  return (
    <form onSubmit={abrir} className="flex w-full max-w-xl flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/20 text-brand">
          <FileText size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Abrir una carga</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Di cuánto duró el corte. Cada hora que cargues desde el papel tiene que caer dentro de él, y el servidor guarda además cuándo lo cargaste.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="El corte empezó"
          surface="tablet"
          type="datetime-local"
          value={desde}
          max={aTexto(ahora, reloj.zona)}
          error={error?.campo === "desde" ? error.mensaje : undefined}
          onChange={(e) => {
            setDesde(e.target.value);
            setError(null);
          }}
        />
        <Input
          label="El corte terminó"
          surface="tablet"
          type="datetime-local"
          value={hasta}
          max={aTexto(ahora, reloj.zona)}
          error={error?.campo === "hasta" ? error.mensaje : undefined}
          onChange={(e) => {
            setHasta(e.target.value);
            setError(null);
          }}
        />
      </div>
      <Input label="Qué pasó (opcional)" surface="tablet" value={nota} maxLength={160} placeholder="Se fue la luz" onChange={(e) => setNota(e.target.value)} />
      {error && error.campo === null && (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error.mensaje}
        </p>
      )}
      <Button type="submit" surface="pos" variant="primary" className="w-full text-base" disabled={enviando}>
        {enviando ? "Abriendo…" : "Abrir la carga"}
      </Button>
      <p className="text-[12px] text-ink-3">Un corte de más de 24 horas se carga en dos. La carga queda a tu nombre, en este turno.</p>
    </form>
  );
}

function CargaAbierta({ carga, onCambio }: { carga: CargaDePapelDto; onCambio: () => void }) {
  const reloj = useReloj();
  const [entrada, setEntrada] = useState(false);
  const [salida, setSalida] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function terminar() {
    setEnviando(true);
    const r = await terminarCarga({ cargaId: carga.id }).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la carga sigue abierta." }),
    );
    setEnviando(false);
    setTerminando(false);
    if (r.ok) {
      avisar.ok(r.valor.estado === "DESCARTADA" ? "Carga descartada: no se cargó nada" : "Carga terminada: supervisión la revisa antes del Z", {
        detalle: r.valor.estado === "DESCARTADA" ? undefined : `${r.valor.registros.length} ${r.valor.registros.length === 1 ? "registro" : "registros"} esperan su revisión.`,
      });
      onCambio();
    } else avisar.error(r.mensaje);
  }

  return (
    <div className="grid min-h-0 gap-4 apaisado:grid-cols-[clamp(300px,28vw,380px)_minmax(0,1fr)]">
      <section aria-label="La carga abierta" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card apaisado:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-bold text-ink">Carga abierta</h2>
          <EstadoDeCarga estado={carga.estado} />
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-[13px]">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Corte</dt>
            <dd className="tnum text-ink">
              {reloj.diaYHora(Date.parse(carga.desde))} a {reloj.diaYHora(Date.parse(carga.hasta))}
            </dd>
          </div>
          {carga.nota && (
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Qué pasó</dt>
              <dd className="text-ink">{carga.nota}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-col gap-2">
          <Button surface="pos" variant="primary" className="w-full justify-start gap-2" onClick={() => setEntrada(true)}>
            <ArrowDownToLine size={17} aria-hidden="true" />
            Registrar una entrada
          </Button>
          <Button surface="pos" variant="neutral" className="w-full justify-start gap-2" onClick={() => setSalida(true)}>
            <ArrowUpFromLine size={17} aria-hidden="true" />
            Registrar una salida
          </Button>
          <Link
            href={`/caja?papel=${carga.id}` as Route}
            className="inline-flex min-h-14 w-full items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-lg font-semibold text-ink hover:border-line-strong"
          >
            <HandCoins size={17} aria-hidden="true" />
            Cobrar lo anotado
          </Link>
          <Button surface="pos" variant="neutral" className="mt-1 w-full justify-start gap-2" onClick={() => setTerminando(true)}>
            <Lock size={17} aria-hidden="true" />
            Terminé de cargar
          </Button>
        </div>
        <p className="text-[12px] text-ink-3">
          Cada registro lleva la hora real del formulario. Cuando termines, supervisión revisa lo cargado contra las hojas antes del Z.
        </p>
      </section>

      <section aria-label="Lo cargado" className="flex min-h-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
        <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-display text-[15px] font-bold text-ink">Lo cargado</h2>
          <Badge tone="idle">
            {carga.registros.length} {carga.registros.length === 1 ? "registro" : "registros"}
          </Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
          <RegistrosDePapel registros={carga.registros} className="py-1" />
        </div>
      </section>

      <EntradaDePapel carga={carga} abierto={entrada} onCerrar={() => setEntrada(false)} />
      <SalidaDePapel carga={carga} abierto={salida} onCerrar={() => setSalida(false)} />
      <Confirmacion
        abierto={terminando}
        onCerrar={() => setTerminando(false)}
        titulo="¿Terminaste de cargar?"
        confirmar="Sí, terminé"
        onConfirmar={() => void terminar()}
        ocupado={enviando}
      >
        {carga.registros.length === 0
          ? "No cargaste nada: la carga se descarta."
          : "Ya no se podrá añadir nada a esta carga. Supervisión la revisa contra las hojas, y hasta entonces el turno no se sella."}
      </Confirmacion>
    </div>
  );
}

/** Las cargas ya terminadas de este turno, con su estado y lo que traían. */
function Anteriores({ cargas }: { cargas: readonly CargaDePapelDto[] }) {
  const reloj = useReloj();
  return (
    <section aria-label="Cargas anteriores de este turno" className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Cargas anteriores de este turno</h2>
      {cargas.map((c) => (
        <div key={c.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tnum text-[13px] text-ink-2">
              Corte de {reloj.diaYHora(Date.parse(c.desde))} a {reloj.hora(Date.parse(c.hasta))} · {c.registros.length} {c.registros.length === 1 ? "registro" : "registros"}
              {c.revisadaPor ? ` · revisó ${c.revisadaPor}` : ""}
            </p>
            <EstadoDeCarga estado={c.estado} />
          </div>
          {c.registros.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2 hover:text-ink">Ver lo que traía</summary>
              <RegistrosDePapel registros={c.registros} className="mt-1" />
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
