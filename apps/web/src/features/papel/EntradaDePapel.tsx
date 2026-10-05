"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert, X } from "lucide-react";
import {
  CheckInCommandSchema,
  GuardianSchema,
  WristbandCodeSchema,
  type CargaDePapelDto,
  type PaymentMode,
  type RepresentanteEncontradoDto,
} from "@l2/contracts";
import { contactKey } from "@l2/domain-park";
import { Button, Input, Sheet, avisar, cn } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { buscarRepresentante, registrarEntrada } from "../park/parque.acciones";
import { PackagePicker } from "../park/PackagePicker";
import { useSala } from "../park/SalaProvider.tsx";
import { useTarifario } from "../park/TarifarioProvider";
import { CampoHoraReal, useHoraReal } from "./CampoHoraReal.tsx";

/**
 * Una entrada anotada en el formulario — B3-7, V-12.
 *
 * Es la entrada de siempre (`parque.entrar`): la familia, sus niños con su pulsera y el paquete. Lo que
 * cambia es la hora, que es la que se anotó en el papel. Un niño que ya salió se carga igual: la entrada
 * aquí, y su salida en «Registrar una salida». El aforo no se cuenta: lo anotado ya ocurrió.
 */

const DIGITOS_PARA_BUSCAR = 7;
const MAX_NINOS = 10;
type Fila = { uid: string; pulsera: string; nombre: string };
const nueva = (): Fila => ({ uid: globalThis.crypto.randomUUID(), pulsera: "", nombre: "" });

const claveDeNombre = (n: string) => n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");

export function EntradaDePapel({ carga, abierto, onCerrar }: { carga: CargaDePapelDto; abierto: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const { tarifario } = useTarifario();
  const { adoptar: adoptarEstancias } = useSala();
  const { adoptar: adoptarCuenta } = useCuentas();
  const paquetes = useMemo(() => tarifario.packages.filter((p) => p.active), [tarifario.packages]);
  const hora = useHoraReal(carga);

  const [paqueteId, setPaqueteId] = useState("");
  const [modo, setModo] = useState<PaymentMode>("PREPAGO");
  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [filas, setFilas] = useState<Fila[]>([nueva()]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La clave de este intento: un reintento tras un corte no registra dos veces (I-11). */
  const clave = useRef<string | null>(null);

  // El paquete más común (1 hora) viene elegido, como en la entrada.
  const elegido = paqueteId || (paquetes.find((p) => p.id === "pkg-60") ?? paquetes[0])?.id || "";

  // La familia se busca por su teléfono, entero, como en la entrada (F5-03).
  const llave = contactKey(telefono);
  const buscable = llave !== null && llave.length >= DIGITOS_PARA_BUSCAR;
  const [busqueda, setBusqueda] = useState<{ llave: string; familia: RepresentanteEncontradoDto | null } | null>(null);
  useEffect(() => {
    if (!buscable || busqueda?.llave === llave) return;
    const id = window.setTimeout(() => {
      void buscarRepresentante({ contacto: telefono })
        .then((r) => r.ok && setBusqueda({ llave: llave!, familia: r.valor }))
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(id);
  }, [buscable, llave, telefono, busqueda?.llave]);
  const buscada = buscable && busqueda?.llave === llave ? busqueda : null;
  const encontrada = buscada?.familia ?? null;
  const esNueva = buscada !== null && !encontrada;

  const cambiar = (uid: string, parche: Partial<Fila>) => setFilas((f) => f.map((x) => (x.uid === uid ? { ...x, ...parche } : x)));

  function ninoDe(nombre: string): { id: string } | { name: string } | Record<string, never> {
    const limpio = nombre.trim();
    if (!limpio) return {};
    const conocido = encontrada?.kids.find((k) => claveDeNombre(k.name) === claveDeNombre(limpio) || (k.nickname && claveDeNombre(k.nickname) === claveDeNombre(limpio)));
    return conocido ? { id: conocido.id } : { name: limpio };
  }

  function limpiar() {
    setFilas([nueva()]);
    setTelefono("");
    setNombreNuevo("");
    setBusqueda(null);
    setError(null);
    hora.limpiar();
    clave.current = null;
  }

  async function cargar() {
    if (enviando) return;
    setError(null);
    if (!hora.iso) {
      setError(hora.error ?? "Escribe la hora real que se anotó en el formulario.");
      return;
    }
    if (!encontrada && !esNueva) {
      setError("Escribe el teléfono completo de la familia: así se sabe si ya vino.");
      return;
    }
    clave.current ??= globalThis.crypto.randomUUID();
    const comando = {
      idempotencyKey: clave.current,
      paymentMode: modo,
      entries: filas.map((f) => ({ wristbandCode: f.pulsera, kid: ninoDe(f.nombre), packageId: elegido })),
      ...(encontrada ? { guardianId: encontrada.id } : { guardian: { fullName: nombreNuevo.trim(), contactReference: telefono.trim() } }),
    };
    const v = CheckInCommandSchema.safeParse(comando);
    if (!v.success) {
      setError(v.error.issues[0]?.message ?? "Faltan datos por completar.");
      return;
    }
    setEnviando(true);
    const r = await registrarEntrada(v.data, { cargaId: carga.id, ocurrioEn: hora.iso }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: la entrada no se cargó. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      clave.current = null;
      setError(r.mensaje);
      return;
    }
    adoptarEstancias(r.valor.sessions);
    adoptarCuenta(r.valor.account);
    const n = r.valor.sessions.length;
    avisar.ok(`Entrada cargada: ${r.valor.account.family}`, { detalle: `${n} ${n === 1 ? "niño" : "niños"}, a la hora que dice el formulario.` });
    limpiar();
    router.refresh();
  }

  const pulseraValida = (c: string) => WristbandCodeSchema.safeParse(c).success;
  const telefonoValido = GuardianSchema.shape.contactReference.safeParse(telefono).success;

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar una entrada del papel"
      descripcion="La familia, sus niños con su pulsera y el paquete, con la hora que anotaron en el formulario."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void cargar()} disabled={enviando}>
            {enviando ? "Cargando…" : "Cargar la entrada"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <CampoHoraReal hora={hora} label="Hora de entrada anotada" hint="La que escribieron en el formulario, no la de ahora." />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Familia</legend>
          <Input
            label="Teléfono del representante"
            surface="tablet"
            inputMode="tel"
            autoComplete="off"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            error={telefono !== "" && !telefonoValido ? "Contacto demasiado corto" : undefined}
            hint={encontrada ? `Ya vino: ${encontrada.fullName}.` : esNueva ? "No ha venido antes: escribe su nombre." : "Con el teléfono entero se reconoce a la familia."}
          />
          {esNueva && <Input label="Nombre del representante" surface="tablet" autoComplete="off" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Niños y pulseras</legend>
          {filas.map((f, i) => (
            <div key={f.uid} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
              <Input
                label={i === 0 ? "Pulsera" : `Pulsera ${i + 1}`}
                surface="tablet"
                autoComplete="off"
                autoCapitalize="characters"
                value={f.pulsera}
                onChange={(e) => cambiar(f.uid, { pulsera: e.target.value.toUpperCase() })}
                error={f.pulsera !== "" && !pulseraValida(f.pulsera) ? "Código no válido" : undefined}
              />
              <Input label="Nombre (opcional)" surface="tablet" autoComplete="off" value={f.nombre} onChange={(e) => cambiar(f.uid, { nombre: e.target.value })} />
              <button
                type="button"
                aria-label={`Quitar al niño ${i + 1}`}
                disabled={filas.length === 1}
                onClick={() => setFilas((x) => x.filter((y) => y.uid !== f.uid))}
                className="mt-6 flex size-12 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-line text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {filas.length < MAX_NINOS && (
            <Button surface="tablet" variant="neutral" className="gap-1.5 self-start" onClick={() => setFilas((x) => [...x, nueva()])}>
              <Plus size={15} aria-hidden="true" />
              Otro niño
            </Button>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Paquete</legend>
          {paquetes.length === 0 ? (
            <p className="text-[12.5px] text-state-crit">No hay tarifario publicado: la entrada no se puede cargar.</p>
          ) : (
            <PackagePicker packages={paquetes} selectedId={elegido} onSelect={setPaqueteId} compact />
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Cómo paga</legend>
          <div role="radiogroup" aria-label="Cómo paga la familia" className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["PREPAGO", "Paga al entrar"],
                ["CUENTA_ABIERTA", "Cuenta abierta"],
              ] as const
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={modo === id}
                onClick={() => setModo(id)}
                className={cn(
                  "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors",
                  modo === id ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {texto}
              </button>
            ))}
          </div>
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
