"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleSlash, Download, FlaskConical, HardDrive, Pin, PinOff, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CopiaDeRespaldoDto, EstadoDeRespaldosDto, NivelDeRespaldos, Resultado } from "@l2/contracts";
import { Button, Confirmacion, Container, Dialog, Input, PageHeader, TAMANO_ICONO, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { PcDelLocal } from "./PcDelLocal.tsx";
import { fijarRespaldo, soltarRespaldo } from "./respaldos.acciones";

/**
 * Ajustes → Sistema · Respaldos (B7-4, M-26; con control, B7-6, M-29). Cada noche el servidor hace un respaldo
 * cifrado de la base y una PC del local lo baja, comprueba su huella y lo guarda en la carpeta que se eligió (mejor
 * fuera del local). Aquí se ve si el de anoche se hizo, si ya salió del servidor con su huella comprobada, el
 * ensayo semanal de restauración (ÍNTEGRO, o qué falló) y los fijados, que nada borra. Fijar y soltar piden
 * confirmar la identidad; lo demás lo hacen el servidor (`infra/produccion/respaldar.sh`) y la PC del local.
 */

const NIVEL: Readonly<Record<NivelDeRespaldos, { tono: "ok" | "warn" | "crit"; icono: typeof CheckCircle2 }>> = {
  AL_DIA: { tono: "ok", icono: CheckCircle2 },
  SIN_ENSAYO: { tono: "warn", icono: TriangleAlert },
  SIN_BAJAR: { tono: "warn", icono: TriangleAlert },
  SIN_RESPALDOS: { tono: "warn", icono: TriangleAlert },
  NO_INTEGRO: { tono: "crit", icono: ShieldAlert },
  ATRASADO: { tono: "crit", icono: ShieldAlert },
  FALLIDO: { tono: "crit", icono: AlertTriangle },
};

const numero = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 });
/** «412 KB», «1,2 MB». */
function tamano(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1_048_576) return `${numero.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${numero.format(bytes / 1_048_576)} MB`;
}

/** «hace 5 h», «hace 2 días». */
function hace(iso: string, ahora: number): string {
  const h = Math.max(0, Math.floor((ahora - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "hace menos de una hora";
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

export function RespaldosScreen({ estado: r, servidor }: { estado: Resultado<EstadoDeRespaldosDto>; servidor: string }) {
  const router = useRouter();
  const { ajustes } = useSucursal();
  const reloj = useReloj();
  const conElevacion = useConElevacion();
  // Lo que escribe el servidor (el respaldo de la noche, su ensayo) y la PC (su bajada) llega en vivo.
  useAlCambiar(["sistema"], () => router.refresh());
  const [fijando, setFijando] = useState<CopiaDeRespaldoDto | null>(null);
  const [soltando, setSoltando] = useState<CopiaDeRespaldoDto | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!r.ok) {
    return (
      <Container ancho="panel" className="py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {r.mensaje}
        </p>
      </Container>
    );
  }
  const e = r.valor;
  const ahora = Date.now();
  const n = NIVEL[e.nivel];
  const Icono = n.icono;
  const enServidor = e.copias.filter((c) => c.estado === "HECHO" && !c.retiradoEn).length;
  // Los fijados que no salen entre los últimos intentos se enseñan aparte (no se pierden de vista).
  const fijadosViejos = e.fijados.filter((f) => !e.copias.some((c) => c.id === f.id));

  async function fijar() {
    if (!fijando) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await conElevacion(() => fijarRespaldo({ id: fijando.id, nombre }));
      if (!res.ok) return setError(res.motivo === "INVALIDO" && res.problemas?.[0] ? res.problemas[0].message : res.mensaje);
      avisar.ok(`Fijado como «${nombre.trim()}»`, { detalle: "Ni el servidor ni la escalera de la PC lo borrarán. La PC lo guarda además en «fijados»." });
      setFijando(null);
      router.refresh();
    } catch {
      setError("El servidor no respondió. No se fijó nada.");
    } finally {
      setOcupado(false);
    }
  }

  async function soltar() {
    if (!soltando) return;
    setOcupado(true);
    try {
      const res = await conElevacion(() => soltarRespaldo({ id: soltando.id }));
      if (!res.ok) return avisar.error(res.mensaje);
      avisar.ok("Soltado: vuelve a la retención de siempre", { detalle: "La copia que la PC guardó en «fijados» se queda ahí." });
      router.refresh();
    } catch {
      avisar.error("El servidor no respondió. Sigue fijado.");
    } finally {
      setOcupado(false);
      setSoltando(null);
    }
  }

  const abrirFijar = (c: CopiaDeRespaldoDto) => {
    setNombre("");
    setError(null);
    setFijando(c);
  };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Respaldos" }]}
        titulo="Respaldos"
        descripcion="Cada noche el servidor guarda un respaldo de la base, cifrado con la clave del local, y una PC del local lo baja. Sin esa clave, que no está en el servidor, nadie lo puede abrir."
      />

      <p
        role={n.tono === "ok" ? "status" : "alert"}
        className={cn(
          "mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border px-4 py-3 text-cuerpo font-medium",
          n.tono === "ok" && "border-state-ok/40 bg-state-ok-bg text-state-ok",
          n.tono === "warn" && "border-state-warn/40 bg-state-warn-bg text-state-warn",
          n.tono === "crit" && "border-state-crit/40 bg-state-crit-bg text-state-crit",
        )}
      >
        <Icono size={TAMANO_ICONO.admin} className="mt-px shrink-0" aria-hidden="true" />
        {e.aviso}
      </p>

      <section aria-label="Resumen" className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:grid-cols-4">
        <Cifra
          titulo="Último respaldo"
          valor={e.ultimo ? reloj.diaYHora(Date.parse(e.ultimo.hechoEn)) : "Ninguno"}
          detalle={e.ultimo ? `${hace(e.ultimo.hechoEn, ahora)} · ${tamano(e.ultimo.bytes)}` : "El servidor todavía no hace respaldos"}
        />
        <Cifra
          titulo="Fuera del servidor"
          valor={e.ultimoBajado ? reloj.diaYHora(Date.parse(e.ultimoBajado.hechoEn)) : "Ninguno"}
          detalle={e.ultimoBajado?.bajadoEn ? `Huella comprobada por la PC ${hace(e.ultimoBajado.bajadoEn, ahora)}` : "La PC del local no ha bajado ninguno"}
        />
        <Cifra
          titulo="Ensayo de restauración"
          valor={e.ensayo ? (e.ensayo.integro ? "ÍNTEGRO" : "NO ÍNTEGRO") : "Ninguno"}
          tono={e.ensayo ? (e.ensayo.integro ? "ok" : "crit") : undefined}
          detalle={
            e.ensayo
              ? `${reloj.diaYHora(Date.parse(e.ensayo.en))}${e.ensayo.segundos !== null ? ` · ${e.ensayo.segundos} s` : ""}${e.ensayo.integro ? "" : ` · ${e.ensayo.detalle ?? "sin motivo"}`}`
              : "El servidor lo ensaya solo una vez por semana"
          }
        />
        <Cifra titulo="En el servidor" valor={`${enServidor} ${enServidor === 1 ? "respaldo" : "respaldos"}`} detalle={`Las últimas noches${e.fijados.length > 0 ? ` y ${e.fijados.length} fijado${e.fijados.length === 1 ? "" : "s"}` : ""}; la PC guarda los de meses`} />
      </section>

      <PcDelLocal pc={e.pc} servidor={servidor} />

      <section aria-labelledby="copias" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
        <h2 id="copias" className="mb-2 font-display text-seccion font-bold text-ink">
          Las últimas noches
        </h2>
        {e.copias.length === 0 ? (
          <p className="py-3 text-detalle text-ink-2">Todavía no hay ninguno. Se instalan en el servidor una vez y desde entonces se hacen solos cada noche.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {e.copias.map((c) => (
              <Fila key={c.id} copia={c} onFijar={() => abrirFijar(c)} onSoltar={() => setSoltando(c)} />
            ))}
          </ul>
        )}
        {fijadosViejos.length > 0 && (
          <>
            <h3 className="mt-4 mb-1 font-display text-subtitulo font-bold text-ink">Fijados más viejos</h3>
            <ul className="flex flex-col divide-y divide-line">
              {fijadosViejos.map((c) => (
                <Fila key={c.id} copia={c} onFijar={() => abrirFijar(c)} onSoltar={() => setSoltando(c)} />
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="mt-3 text-nota text-ink-3">
        Cada semana el servidor restaura el volcado de esa noche, antes de cifrarlo, en una base de usar y tirar y comprueba su huella. Para abrir un
        respaldo cifrado hacen falta su clave privada y la clave de cifrado del sistema, guardadas fuera del servidor.
      </p>

      <Dialog
        abierto={fijando !== null}
        onCerrar={() => setFijando(null)}
        titulo="Fijar este respaldo"
        descripcion={fijando ? `El de ${reloj.diaYHora(Date.parse(fijando.hechoEn))}. Fijado, ni el servidor ni la escalera de la PC lo borran: la PC lo guarda además en su carpeta «fijados».` : ""}
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setFijando(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" disabled={ocupado || nombre.trim().length < 2} onClick={() => void fijar()}>
              <Pin size={TAMANO_ICONO.admin} aria-hidden="true" />
              {ocupado ? "Fijando…" : "Fijar"}
            </Button>
          </div>
        }
      >
        <Input
          label="Nombre"
          surface="admin"
          placeholder="Antes de producción"
          value={nombre}
          maxLength={40}
          onChange={(ev) => setNombre(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && nombre.trim().length >= 2) void fijar();
          }}
          error={error ?? undefined}
          hint="Para reconocerlo: por qué se guarda."
        />
      </Dialog>

      <Confirmacion
        abierto={soltando !== null}
        onCerrar={() => setSoltando(null)}
        titulo={`Soltar «${soltando?.fijado?.nombre ?? ""}»`}
        confirmar="Sí, soltar"
        onConfirmar={() => void soltar()}
        ocupado={ocupado}
      >
        Vuelve a la retención de siempre: el servidor lo quitará cuando pase de las últimas noches. La copia que la PC guardó en «fijados» se queda ahí.
      </Confirmacion>
    </Container>
  );
}

function Cifra({ titulo, valor, detalle, tono, className }: { titulo: string; valor: string; detalle: string; tono?: "ok" | "crit" | undefined; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 bg-surface px-4 py-3", className)}>
      <span className="flex items-center gap-1 text-etiqueta font-semibold text-ink-2 uppercase">
        {tono === "ok" && <ShieldCheck size={TAMANO_ICONO.etiqueta} className="text-state-ok" aria-hidden="true" />}
        {tono === "crit" && <ShieldAlert size={TAMANO_ICONO.etiqueta} className="text-state-crit" aria-hidden="true" />}
        {titulo}
      </span>
      <span className={cn("tnum truncate font-display text-[19px] leading-tight font-bold", tono === "ok" ? "text-state-ok" : tono === "crit" ? "text-state-crit" : "text-ink")}>{valor}</span>
      <span className="text-nota text-ink-3">
        {detalle}
      </span>
    </div>
  );
}

function Fila({ copia: c, onFijar, onSoltar }: { copia: CopiaDeRespaldoDto; onFijar: () => void; onSoltar: () => void }) {
  const reloj = useReloj();
  const fallido = c.estado === "FALLIDO";
  return (
    <li className="flex flex-col gap-1 py-2 lg:flex-row lg:items-center lg:gap-3">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        {fallido ? (
          <AlertTriangle size={TAMANO_ICONO.texto} className="shrink-0 text-state-crit" aria-hidden="true" />
        ) : c.bajadoEn ? (
          <Download size={TAMANO_ICONO.texto} className="shrink-0 text-state-ok" aria-hidden="true" />
        ) : (
          <HardDrive size={TAMANO_ICONO.texto} className="shrink-0 text-ink-3" aria-hidden="true" />
        )}
        <span className="tnum text-cuerpo font-semibold text-ink">{reloj.diaYHora(Date.parse(c.hechoEn))}</span>
        {!fallido && <span className="tnum text-nota text-ink-3">{tamano(c.bytes)}</span>}
        {c.fijado && (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-etiqueta font-semibold tracking-normal text-brand" title={`Fijado por ${c.fijado.por}`}>
            <Pin size={TAMANO_ICONO.etiqueta} aria-hidden="true" />
            {c.fijado.nombre}
          </span>
        )}
        {c.ensayo && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-etiqueta font-semibold tracking-normal",
              c.ensayo.integro ? "border-state-ok/30 bg-state-ok-bg text-state-ok" : "border-state-crit/40 bg-state-crit-bg text-state-crit",
            )}
            title={c.ensayo.detalle ?? undefined}
          >
            <FlaskConical size={TAMANO_ICONO.etiqueta} aria-hidden="true" />
            {c.ensayo.integro ? "Ensayo íntegro" : "Ensayo NO íntegro"}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 lg:ml-auto lg:justify-end">
        <span className={cn("min-w-0 text-nota lg:text-right", fallido ? "font-semibold text-state-crit" : c.bajadoEn ? "text-state-ok" : "text-ink-2")}>
          {fallido ? (
            `Falló: ${c.detalle ?? "sin motivo"}`
          ) : c.bajadoEn ? (
            `En la PC del local desde ${reloj.diaYHora(Date.parse(c.bajadoEn))} · huella comprobada`
          ) : c.retiradoEn ? (
            <span className="inline-flex items-center gap-1 text-ink-3">
              <CircleSlash size={TAMANO_ICONO.etiqueta} aria-hidden="true" />
              Ya no está en el servidor y no se bajó
            </span>
          ) : (
            "Solo en el servidor, sin bajar"
          )}
        </span>
        {!fallido &&
          (c.fijado ? (
            <Button type="button" variant="ghost" surface="admin" className="gap-1" onClick={onSoltar}>
              <PinOff size={TAMANO_ICONO.texto} aria-hidden="true" />
              Soltar
            </Button>
          ) : (
            !c.retiradoEn && (
              <Button type="button" variant="ghost" surface="admin" className="gap-1" onClick={onFijar}>
                <Pin size={TAMANO_ICONO.texto} aria-hidden="true" />
                Fijar
              </Button>
            )
          ))}
      </span>
    </li>
  );
}
