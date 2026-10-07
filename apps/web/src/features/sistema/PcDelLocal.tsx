"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Laptop } from "lucide-react";
import type { PcDeRespaldosDto, PcPreparadaDto } from "@l2/contracts";
import { Button, Confirmacion, Dialog, Input, avisar } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { prepararPcDeRespaldos, retirarPcDeRespaldos } from "./respaldos.acciones";

/**
 * La PC del local que baja los respaldos (B7-4, M-26): prepararla, cambiarla o retirarla, con la identidad
 * confirmada. Al prepararla se enseña una sola vez su credencial y la orden para pegar en esa PC; el programa
 * (`/descargas/l2-respaldos.ps1`) deja una tarea programada que los baja cada mañana.
 */
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

  // Para pegar en PowerShell tal cual: baja el programa y lo corre sin cambiar la política de la PC.
  const orden =
    `[Net.ServicePointManager]::SecurityProtocol='Tls12'; ` +
    `iwr ${servidor}/descargas/l2-respaldos.ps1 -OutFile $env:TEMP\\l2-respaldos.ps1 -UseBasicParsing; ` +
    `powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\\l2-respaldos.ps1 -Instalar -Servidor ${servidor}`;

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
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setPreparando(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" surface="admin" disabled={ocupado || nombre.trim().length < 2} onClick={() => void preparar()}>
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
            if (ev.key === "Enter" && nombre.trim().length >= 2) void preparar();
          }}
          error={error ?? undefined}
          hint="Para reconocerla aquí: cuándo se conectó y qué bajó."
        />
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
            conectó.
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
