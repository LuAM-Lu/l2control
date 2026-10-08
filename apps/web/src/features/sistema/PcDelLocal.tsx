"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Copy, HardDrive, Laptop, Monitor, TriangleAlert } from "lucide-react";
import { VERSION_DEL_PROGRAMA_DE_RESPALDOS, type PcDeRespaldosDto, type PcPreparadaDto, type TipoDeCarpeta } from "@l2/contracts";
import { Button, Confirmacion, Dialog, Input, TAMANO_ICONO, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { prepararPcDeRespaldos, retirarPcDeRespaldos } from "./respaldos.acciones";

/**
 * La PC del local que baja los respaldos (B7-4, M-26): prepararla, cambiarla o retirarla, con la identidad
 * confirmada. Al prepararla se elige la carpeta (B7-6: mejor un disco externo o una carpeta en la nube, para que una
 * copia quede fuera del local) y se enseña una sola vez su credencial y la orden para pegar en esa PC; el programa
 * (`/descargas/l2-respaldos.ps1`) deja una tarea programada que los baja cada mañana. La tarjeta dice dónde guarda,
 * como lo dijo la PC, y si su programa es de una versión anterior.
 */

/** Dónde guardar, con la carpeta que se propone (se puede cambiar). */
const CARPETAS: readonly { tipo: TipoDeCarpeta; titulo: string; detalle: string; ruta: string; Icono: typeof HardDrive }[] = [
  { tipo: "EXTERNO", titulo: "Un disco externo", detalle: "Conectado a esa PC; mejor si se guarda fuera del local", ruta: "E:\\L2 Control - Respaldos", Icono: HardDrive },
  { tipo: "NUBE", titulo: "Una carpeta en la nube", detalle: "OneDrive o Google Drive en esa PC: la copia sale sola del local", ruta: "$env:OneDrive\\L2 Control - Respaldos", Icono: Cloud },
  { tipo: "EN_LA_PC", titulo: "Documentos de esa PC", detalle: "Lo más simple, pero si esa PC se pierde, se pierden con ella", ruta: "", Icono: Monitor },
];
const TIPO: Readonly<Record<TipoDeCarpeta, string>> = { EXTERNO: "en otro disco", NUBE: "en una carpeta en la nube", EN_LA_PC: "en la misma PC" };
export function PcDelLocal({ pc, servidor }: { pc: PcDeRespaldosDto | null; servidor: string }) {
  const router = useRouter();
  const reloj = useReloj();
  const conElevacion = useConElevacion();
  const [preparando, setPreparando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [preparada, setPreparada] = useState<PcPreparadaDto | null>(null);
  const [retirando, setRetirando] = useState(false);
  const [tipo, setTipo] = useState<TipoDeCarpeta>("EXTERNO");
  const [ruta, setRuta] = useState(CARPETAS[0]!.ruta);
  // Lo que va a la orden: sin comillas (cerrarían la de PowerShell); vacía, Documentos.
  const carpeta = tipo === "EN_LA_PC" ? "" : ruta.trim().replace(/"/g, "");
  const carpetaValida = tipo === "EN_LA_PC" || /^([A-Za-z]:\\|\\\\|\$env:)/.test(carpeta);

  async function preparar() {
    setOcupado(true);
    setError(null);
    try {
      const r = await conElevacion(() => prepararPcDeRespaldos({ nombre }));
      if (!r.ok) {
        setError(r.motivo === "INVALIDO" && r.problemas?.[0] ? r.problemas[0].message : r.mensaje);
        return;
      }
      setPreparando(false);
      setPreparada(r.valor);
    } catch {
      setError("El servidor no respondió. No se preparó nada.");
    } finally {
      setOcupado(false);
    }
  }

  async function retirar() {
    if (!pc) return;
    setOcupado(true);
    try {
      const r = await conElevacion(() => retirarPcDeRespaldos({ id: pc.id }));
      if (!r.ok) return avisar.error(r.mensaje);
      avisar.ok(`«${pc.nombre}» ya no baja los respaldos`);
      router.refresh();
    } catch {
      avisar.error("El servidor no respondió. Sigue igual.");
    } finally {
      setOcupado(false);
      setRetirando(false);
    }
  }

  function cerrarPreparada() {
    setPreparada(null);
    router.refresh();
  }

  // Para pegar en PowerShell tal cual: baja el programa y lo corre sin cambiar la política de la PC. La carpeta va
  // entre comillas dobles: así «$env:OneDrive» se resuelve en esa PC.
  const orden =
    `[Net.ServicePointManager]::SecurityProtocol='Tls12'; ` +
    `iwr ${servidor}/descargas/l2-respaldos.ps1 -OutFile $env:TEMP\\l2-respaldos.ps1 -UseBasicParsing; ` +
    `powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\\l2-respaldos.ps1 -Instalar -Servidor ${servidor}` +
    (carpeta ? ` -Carpeta "${carpeta}"` : "");
  const viejo = pc?.programa !== null && pc?.programa !== undefined && pc.programa < VERSION_DEL_PROGRAMA_DE_RESPALDOS;

  return (
    <section aria-labelledby="pc" className="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <Laptop size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="pc" className="font-display text-base font-bold text-ink">
            {pc ? pc.nombre : "La PC del local"}
          </h2>
          {pc ? (
            <p className="tnum text-[12.5px] text-ink-2">
              Preparada el {reloj.dia(Date.parse(pc.preparadaEn))} por {pc.preparadaPor} ·{" "}
              {pc.ultimaConexion ? `se conectó por última vez el ${reloj.diaYHora(Date.parse(pc.ultimaConexion))}` : "todavía no se ha conectado"}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-2">Ninguna PC del local baja los respaldos: hasta que haya una, la única copia está en el servidor.</p>
          )}
          {pc?.carpeta && (
            <p className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-nota", pc.tipoDeCarpeta === "EN_LA_PC" ? "text-state-warn" : "text-ink-2")}>
              {pc.tipoDeCarpeta === "EN_LA_PC" && <TriangleAlert size={TAMANO_ICONO.etiqueta} aria-hidden="true" />}
              Guarda {pc.tipoDeCarpeta ? TIPO[pc.tipoDeCarpeta] : ""} en <code className="font-mono break-all text-ink">{pc.carpeta}</code>
              {pc.tipoDeCarpeta === "EN_LA_PC" && <span>· un disco externo o una carpeta en la nube dejaría una copia fuera del local (regla 3-2-1).</span>}
            </p>
          )}
          {viejo && (
            <p className="mt-1 flex items-center gap-1.5 text-nota text-state-warn">
              <TriangleAlert size={TAMANO_ICONO.etiqueta} aria-hidden="true" />
              Su programa es de una versión anterior y no guarda los fijados aparte: prepárala otra vez.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={pc ? "neutral" : "primary"}
            surface="admin"
            disabled={ocupado}
            onClick={() => {
              setNombre("");
              setError(null);
              setPreparando(true);
            }}
          >
            {pc ? "Cambiar de PC" : "Preparar una PC del local"}
          </Button>
          {pc && (
            <Button type="button" variant="ghost" surface="admin" disabled={ocupado} onClick={() => setRetirando(true)}>
              Retirar
            </Button>
          )}
        </div>
      </div>

      <Dialog
        abierto={preparando}
        onCerrar={() => setPreparando(false)}
        titulo={pc ? "Cambiar la PC de los respaldos" : "Preparar una PC del local"}
        descripcion={
          pc
            ? `«${pc.nombre}» dejará de bajarlos en cuanto prepares la nueva.`
            : "Una PC del local que esté encendida casi todos los días, con Windows. No hace falta ser administrador en ella."
        }
        className="sm:max-w-xl"
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setPreparando(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" surface="admin" disabled={ocupado || nombre.trim().length < 2 || !carpetaValida} onClick={() => void preparar()}>
              {ocupado ? "Preparando…" : "Preparar"}
            </Button>
          </div>
        }
      >
        <Input
          label="Nombre de la PC"
          surface="admin"
          placeholder="PC de administración"
          value={nombre}
          maxLength={60}
          onChange={(ev) => setNombre(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && nombre.trim().length >= 2 && carpetaValida) void preparar();
          }}
          error={error ?? undefined}
          hint="Para reconocerla aquí: cuándo se conectó y qué bajó."
        />
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="mb-1 text-etiqueta font-semibold text-ink-2 uppercase">Dónde guarda los respaldos</legend>
          {CARPETAS.map((c) => (
            <label
              key={c.tipo}
              className={cn(
                "flex min-h-8 cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2",
                tipo === c.tipo ? "border-brand bg-brand/5" : "border-line hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="carpeta"
                className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
                checked={tipo === c.tipo}
                onChange={() => {
                  setTipo(c.tipo);
                  setRuta(c.ruta);
                }}
              />
              <c.Icono size={TAMANO_ICONO.admin} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-cuerpo font-semibold text-ink">{c.titulo}</span>
                <span className="block text-nota text-ink-2">{c.detalle}</span>
              </span>
            </label>
          ))}
          {tipo !== "EN_LA_PC" && (
            <Input
              label="Carpeta en esa PC"
              surface="admin"
              className="font-mono"
              value={ruta}
              maxLength={200}
              onChange={(ev) => setRuta(ev.target.value)}
              error={carpetaValida ? undefined : "Una ruta de Windows: E:\\…, \\\\servidor\\… o $env:OneDrive\\…"}
              hint={tipo === "EXTERNO" ? "La letra del disco en esa PC (E:, F:…). Si no está conectado al preparar, la orden lo dice." : "Con Google Drive para escritorio, por ejemplo G:\\Mi unidad\\L2 Control - Respaldos."}
            />
          )}
        </fieldset>
      </Dialog>

      <Dialog
        abierto={preparada !== null}
        onCerrar={cerrarPreparada}
        titulo={`Prepara «${preparada?.pc.nombre ?? ""}»`}
        descripcion="Hazlo ahora: la credencial se enseña solo esta vez. Si se pierde, se prepara la PC otra vez."
        pie={
          <div className="flex justify-end">
            <Button type="button" variant="primary" surface="admin" onClick={cerrarPreparada}>
              Listo
            </Button>
          </div>
        }
      >
        <ol className="flex flex-col gap-3 text-[13px] text-ink-2">
          <li>
            <span className="font-semibold text-ink">1.</span> En esa PC, abre <span className="font-semibold text-ink">PowerShell</span> (menú Inicio, escribe
            «PowerShell») y pega esta orden:
            <Copiable texto={orden} />
          </li>
          <li>
            <span className="font-semibold text-ink">2.</span> Cuando la pida, pega esta credencial (no se ve al pegarla):
            <Copiable texto={preparada?.credencial ?? ""} />
          </li>
          <li>
            <span className="font-semibold text-ink">3.</span> Al terminar dice «Pasada hecha» y deja una tarea que los baja cada mañana. Aquí verás cuándo se
            conectó y dónde guarda{carpeta ? ` (${carpeta})` : " (en Documentos)"}.
          </li>
        </ol>
      </Dialog>

      <Confirmacion
        abierto={retirando}
        onCerrar={() => setRetirando(false)}
        titulo={`Retirar «${pc?.nombre ?? ""}»`}
        confirmar="Sí, retirar"
        peligro
        onConfirmar={() => void retirar()}
        ocupado={ocupado}
      >
        Su credencial deja de valer y no baja más respaldos. Los que ya bajó siguen en esa PC.
      </Confirmacion>
    </section>
  );
}

function Copiable({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <span className="mt-1.5 flex items-start gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 p-2">
      <code className="min-w-0 flex-1 font-mono text-[12px] break-all text-ink select-all">{texto}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(texto).then(
            () => setCopiado(true),
            () => avisar.error("No se pudo copiar: selecciónalo y cópialo a mano."),
          );
        }}
        className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-2 text-[12px] font-medium text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Copy size={13} aria-hidden="true" />
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
