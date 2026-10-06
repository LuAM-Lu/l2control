"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { CheckoutCommandSchema, type CargaDePapelDto, type EstanciaDto } from "@l2/contracts";
import { Button, Input, Sheet, avisar, cn, formatMoneyVE } from "@l2/ui";
import { money, toMajor } from "@l2/domain-money";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { registrarSalida } from "../park/parque.acciones";
import { useSala } from "../park/SalaProvider.tsx";
import { nombreDeEstancia } from "../park/view-model.ts";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { CampoHoraReal, useHoraReal } from "./CampoHoraReal.tsx";

/**
 * Una salida anotada en el formulario — B3-7, V-12.
 *
 * Es la salida de siempre (`parque.salir`): se elige a los niños de UNA familia y se liquida su tiempo con
 * la hora que anotaron, no con la de ahora. Los niños que quedaron en sala del papel (y los que el sistema
 * ya da por olvidados, que lo son solo desde ahora) se eligen aquí. Si pasó de su tiempo, la cuenta queda por
 * cobrar con lo de más, y ese cobro también se carga desde el papel.
 */

type Familia = { accountId: string; nombre: string; ninos: EstanciaDto[] };

export function SalidaDePapel({ carga, abierto, onCerrar }: { carga: CargaDePapelDto; abierto: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const reloj = useReloj();
  const { sala, quitar } = useSala();
  const { adoptar: adoptarCuenta } = useCuentas();
  const hora = useHoraReal(carga);

  const [familiaId, setFamiliaId] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [otra, setOtra] = useState(false);
  const [quien, setQuien] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef<string | null>(null);

  // Los niños que siguen en sala, por familia (una salida es de una sola).
  const familias = useMemo<Familia[]>(() => {
    const porCuenta = new Map<string, Familia>();
    for (const s of [...(sala?.sessions ?? []), ...(sala?.huerfanas ?? [])]) {
      const f = porCuenta.get(s.accountId) ?? { accountId: s.accountId, nombre: s.guardianName, ninos: [] };
      f.ninos.push(s);
      porCuenta.set(s.accountId, f);
    }
    return [...porCuenta.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [sala]);
  const familia = familias.find((f) => f.accountId === familiaId) ?? null;

  function elegirFamilia(f: Familia) {
    setFamiliaId(f.accountId);
    setMarcados(new Set(f.ninos.map((n) => n.id)));
    setError(null);
  }
  const alternar = (id: string) =>
    setMarcados((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });

  async function cargar() {
    if (enviando) return;
    setError(null);
    if (!hora.iso) {
      setError(hora.error ?? "Escribe la hora real de salida que se anotó en el formulario.");
      return;
    }
    if (!familia || marcados.size === 0) {
      setError("Elige la familia y a los niños que salieron.");
      return;
    }
    clave.current ??= globalThis.crypto.randomUUID();
    const v = CheckoutCommandSchema.safeParse({
      idempotencyKey: clave.current,
      sessionIds: [...marcados],
      disposition: { kind: "CAJA" },
      recogida: otra ? { kind: "OTRA_PERSONA", nombre: quien } : { kind: "REPRESENTANTE" },
    });
    if (!v.success) {
      setError(v.error.issues[0]?.message ?? "Faltan datos por completar.");
      return;
    }
    setEnviando(true);
    const r = await registrarSalida(v.data, { cargaId: carga.id, ocurrioEn: hora.iso }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: la salida no se cargó. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      clave.current = null;
      setError(r.mensaje);
      return;
    }
    quitar([...marcados]);
    adoptarCuenta(r.valor.account);
    const deMas = r.valor.lines.reduce((a, l) => a + BigInt(l.overdue.minor), 0n);
    avisar.ok(`Salida cargada: ${familia.nombre}`, {
      detalle: deMas > 0n ? `Con tiempo de más: ${formatMoneyVE(toMajor(money(deMas, "USD")), "USD")}. Se cobra desde el papel.` : "Sin tiempo de más.",
    });
    setFamiliaId(null);
    setMarcados(new Set());
    setOtra(false);
    setQuien("");
    setError(null);
    hora.limpiar();
    clave.current = null;
    router.refresh();
  }

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar una salida del papel"
      descripcion="Los niños de una familia que salieron, con la hora que anotaron en el formulario."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void cargar()} disabled={enviando}>
            {enviando ? "Cargando…" : "Cargar la salida"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <CampoHoraReal hora={hora} label="Hora de salida anotada" hint="La que escribieron en el formulario, no la de ahora." />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Familia</legend>
          {familias.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No hay niños en sala: carga primero su entrada.</p>
          ) : (
            <div role="radiogroup" aria-label="Familia que sale" className="flex flex-col gap-1.5">
              {familias.map((f) => (
                <button
                  key={f.accountId}
                  type="button"
                  role="radio"
                  aria-checked={familiaId === f.accountId}
                  onClick={() => elegirFamilia(f)}
                  className={cn(
                    "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 py-1.5 text-left transition-colors",
                    familiaId === f.accountId ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:text-ink",
                  )}
                >
                  <span className="text-[13.5px] font-semibold">{f.nombre}</span>
                  <span className="tnum text-[12px] text-ink-3">
                    {f.ninos.map((n) => `${nombreDeEstancia(n)} (desde ${reloj.hora(Date.parse(n.startedAt))})`).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </fieldset>

        {familia && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Quiénes salieron</legend>
            {familia.ninos.map((n) => (
              <label key={n.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 text-[13.5px] text-ink">
                <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={marcados.has(n.id)} onChange={() => alternar(n.id)} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{nombreDeEstancia(n)}</span>
                  <span className="text-ink-3"> · {n.wristbandCode}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Quién los recogió</legend>
          <div role="radiogroup" aria-label="Quién recoge" className="grid grid-cols-2 gap-1.5">
            {(
              [
                [false, "Su representante"],
                [true, "Otra persona"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={texto}
                type="button"
                role="radio"
                aria-checked={otra === valor}
                onClick={() => setOtra(valor)}
                className={cn(
                  "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors",
                  otra === valor ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {texto}
              </button>
            ))}
          </div>
          {otra && <Input label="Nombre de quien los recogió" surface="tablet" autoComplete="off" value={quien} onChange={(e) => setQuien(e.target.value)} />}
        </fieldset>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
