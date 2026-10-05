"use client";

import { useRef, useState } from "react";
import type { CargaDePapelDto, Rechazo } from "@l2/contracts";
import { money, toMajor } from "@l2/domain-money";
import { Button, Dialog, Input, MoneyDisplay, avisar } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { RegistrosDePapel } from "./RegistrosDePapel.tsx";
import { revisarCarga } from "./papel.acciones";

/**
 * Supervisión revisa lo cargado contra el papel — B3-7, V-12, JORNADA §5.
 *
 * Con las hojas delante, compara registro a registro lo que la cajera cargó y lo da por bueno con su PIN
 * (nadie revisa por otro, y quien cargó no se revisa a sí misma: lo dice el servidor). Hasta que se revisa, el
 * turno no se sella ni la jornada se cierra. Si algo no cuadra con el papel, no se da por bueno: se corrige
 * (se anula el cobro, se cierra la estancia) y se vuelve a comparar.
 */

export function RevisionDePapel({ carga, onCerrar, onHecho }: { carga: CargaDePapelDto | null; onCerrar: () => void; onHecho: () => void }) {
  const reloj = useReloj();
  const a = useAutorizacion("papel.revisar", carga !== null, { propio: true });
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const clave = useRef("");

  // Cada carga abre el formulario limpio. Derivado en el render, sin efecto.
  if ((carga?.id ?? null) !== para) {
    setPara(carga?.id ?? null);
    setNota("");
    setErrores({});
    clave.current = crypto.randomUUID();
  }
  if (!carga) return null;

  const entradas = carga.registros.filter((r) => r.tipo === "ENTRADA").length;
  const salidas = carga.registros.filter((r) => r.tipo === "SALIDA").length;
  const cobros = carga.registros.filter((r) => r.tipo === "COBRO");
  const cobrado = cobros.reduce((s, r) => (r.tipo === "COBRO" ? s + BigInt(r.total.minor) : s), 0n);

  async function confirmar() {
    if (!carga || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    const r = await revisarCarga({ cargaId: carga.id, ...(nota.trim() ? { nota: nota.trim() } : {}) }, a.autorizacion(nota.trim() || "Revisada contra el papel")).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la carga sigue sin revisar." }),
    );
    setEnviando(false);
    if (r.ok) {
      avisar.ok("Carga revisada", { detalle: `${carga.registros.length} ${carga.registros.length === 1 ? "registro" : "registros"} de ${carga.abiertaPor}. Ya no frena el cierre.` });
      onHecho();
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
      titulo="Revisar lo cargado desde papel"
      descripcion={`${carga.punto} · cargó ${carga.abiertaPor}. Compáralo con las hojas.`}
      className="md:max-w-3xl"
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando || carga.estado !== "CERRADA"}>
            {enviando ? "Revisando…" : "Está bien: dar por revisada"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Corte</dt>
            <dd className="tnum text-ink">
              {reloj.diaYHora(Date.parse(carga.desde))} a {reloj.hora(Date.parse(carga.hasta))}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Registros</dt>
            <dd className="tnum text-ink">
              {entradas} {entradas === 1 ? "entrada" : "entradas"} · {salidas} {salidas === 1 ? "salida" : "salidas"} · {cobros.length} {cobros.length === 1 ? "cobro" : "cobros"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Cobrado</dt>
            <dd>
              <MoneyDisplay value={toMajor(money(cobrado, "USD"))} currency="USD" size="sm" />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Motivo</dt>
            <dd className="text-ink">{carga.nota ?? "Sin conexión"}</dd>
          </div>
        </dl>

        <RegistrosDePapel registros={carga.registros} className="max-h-[20vh] min-h-24 overflow-y-auto rounded-[var(--radius-control)] border border-line px-3" />

        <Input
          label="Nota de la revisión (opcional)"
          surface="tablet"
          value={nota}
          maxLength={280}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Cuadra con las hojas 1 y 2"
        />
        <CampoAutorizacion a={a} numero={1} denegado="Tu puesto no revisa lo cargado desde papel." errores={errores} deshabilitado={enviando} onConfirmar={() => void confirmar()} />
        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
