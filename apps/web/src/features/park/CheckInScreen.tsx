"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleCheckBig,
  Phone,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  CheckInCommandSchema,
  WristbandCodeSchema,
  type GuardianDto,
  type PricePackageDto,
} from "@l2/contracts";
import { Badge, Button, Initial, Input, MoneyDisplay, ScannerField, StatTile } from "@l2/ui";
import { sum, toMajor, zero } from "@l2/domain-money";
import { computeCapacity } from "@l2/domain-park";
import { PackagePicker } from "./PackagePicker";
import { toMoney } from "./mappers.ts";

/**
 * Registro de entrada al parque — F5-02, F5-03, F5-04.
 *
 * Su criterio de aceptación es medible: **dos niños en menos de 90 segundos**,
 * cronómetro en mano y sobre hardware real. Todo el diseño sale de ahí:
 *
 *  · Se escanea primero y lo demás sigue. La pulsera crea la fila; no hay un
 *    botón «añadir niño» que haya que buscar.
 *  · El foco salta solo al nombre del niño recién escaneado.
 *  · El paquete viene preseleccionado con el más común, y se cambia en un
 *    toque sobre un botón grande, no en un desplegable.
 *  · Al representante se le busca por teléfono; si ya vino, no se vuelve a
 *    teclear nada.
 *  · Una sola pantalla. Ningún diálogo, ninguna navegación intermedia.
 */

type Entrada = {
  uid: string;
  wristbandCode: string;
  name: string;
  nickname: string;
  packageId: string;
};

const NUEVO_UID = () => globalThis.crypto.randomUUID();

export function CheckInScreen({
  packages,
  guardians,
  activeSessions,
  capacityLimit,
  occupiedWristbands,
}: {
  packages: readonly PricePackageDto[];
  guardians: readonly (GuardianDto & { id: string })[];
  activeSessions: number;
  capacityLimit: number;
  /** Pulseras ya activas en sala: no pueden reutilizarse (invariante I-04). */
  occupiedWristbands: readonly string[];
}) {
  const defaultPackageId = packages.find((p) => p.id === "pkg-60")?.id ?? packages[0]?.id ?? "";

  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [enviado, setEnviado] = useState<{ ninos: number; total: string } | null>(null);

  const nameRefs = useRef(new Map<string, HTMLInputElement | null>());

  const capacidad = computeCapacity(activeSessions + entradas.length, capacityLimit);

  /* ----------------------------------------------------- representante */

  // F5-03: se busca por teléfono, que es lo que el representante recuerda.
  const encontrado = useMemo(() => {
    const limpio = telefono.replace(/\D/g, "");
    if (limpio.length < 4) return null;
    return (
      guardians.find((g) => g.contactReference.replace(/\D/g, "").includes(limpio)) ?? null
    );
  }, [telefono, guardians]);

  const esNuevo = telefono.replace(/\D/g, "").length >= 4 && !encontrado;

  /* ------------------------------------------------------------ escaneo */

  const handleScan = useCallback(
    (code: string) => {
      const parsed = WristbandCodeSchema.safeParse(code);
      if (!parsed.success) {
        setAviso(`Código no reconocido: ${code}`);
        return;
      }
      const limpio = parsed.data;

      if (occupiedWristbands.includes(limpio)) {
        // I-04: una pulsera no puede tener dos estancias activas.
        setAviso(`La pulsera ${limpio} ya está activa en sala`);
        return;
      }
      if (entradas.some((e) => e.wristbandCode === limpio)) {
        setAviso(`La pulsera ${limpio} ya está en esta lista`);
        return;
      }
      if (activeSessions + entradas.length >= capacityLimit) {
        // F5-03b: el aforo avisa ANTES de permitir un check-in más.
        setAviso(`Aforo completo (${capacityLimit}). No se puede registrar a nadie más`);
        return;
      }

      const uid = NUEVO_UID();
      setEntradas((prev) => [
        ...prev,
        { uid, wristbandCode: limpio, name: "", nickname: "", packageId: defaultPackageId },
      ]);
      setAviso(null);
      // El foco salta solo: el operador escanea y escribe, sin tocar nada.
      queueMicrotask(() => nameRefs.current.get(uid)?.focus());
    },
    [entradas, occupiedWristbands, activeSessions, capacityLimit, defaultPackageId],
  );

  const validarPulsera = useCallback(
    (code: string) => WristbandCodeSchema.safeParse(code).success,
    [],
  );

  const actualizar = (uid: string, patch: Partial<Entrada>) =>
    setEntradas((prev) => prev.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));

  const quitar = (uid: string) => setEntradas((prev) => prev.filter((e) => e.uid !== uid));

  /* -------------------------------------------------------------- total */

  const total = useMemo(() => {
    const precios = entradas.map((e) => {
      const p = packages.find((x) => x.id === e.packageId);
      return p ? toMoney(p.price) : zero("USD");
    });
    return sum(precios, "USD");
  }, [entradas, packages]);

  /* ------------------------------------------------------------- envío */

  const faltanNombres = entradas.some((e) => e.name.trim().length < 2);
  const faltaRepresentante = !encontrado && nombreNuevo.trim().length < 2;
  const puedeEnviar =
    entradas.length > 0 && !faltanNombres && !faltaRepresentante && !capacidad.isFull;

  function registrar() {
    // El mismo contrato que validará el servidor. Si algo no cuadra, se ve
    // aquí y no en un 400 sin explicación (ADR-017).
    const comando = {
      idempotencyKey: NUEVO_UID(),
      entries: entradas.map((e) => ({
        wristbandCode: e.wristbandCode,
        kid: {
          name: e.name.trim(),
          ...(e.nickname.trim() ? { nickname: e.nickname.trim() } : {}),
        },
        packageId: e.packageId,
      })),
      ...(encontrado
        ? { guardianId: encontrado.id }
        : { guardian: { fullName: nombreNuevo.trim(), contactReference: telefono.trim() } }),
    };

    const resultado = CheckInCommandSchema.safeParse(comando);
    if (!resultado.success) {
      setAviso(resultado.error.issues[0]?.message ?? "Faltan datos por completar");
      return;
    }

    // TODO(F5-02/backend): aquí irá la llamada real. La forma del comando ya
    // es la definitiva, así que ese cambio no toca esta pantalla (§11.4).
    setEnviado({ ninos: entradas.length, total: toMajor(total) });
    setEntradas([]);
    setTelefono("");
    setNombreNuevo("");
    setAviso(null);
  }

  /* ------------------------------------------------------------ pintado */

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="sticky top-0 z-10 border-b border-line bg-base/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-x-8 gap-y-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/monitor"
              aria-label="Volver al monitor"
              className="grid size-10 place-content-center rounded-[var(--radius-control)] border border-line text-ink-2 transition-colors hover:text-ink"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <div>
              <h1 className="font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink">
                Entrada al parque
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3">
                Pasa las pulseras por el lector para empezar
              </p>
            </div>
          </div>

          <div className="flex items-end gap-7">
            <StatTile
              label="Aforo"
              value={capacidad.active}
              suffix={`/ ${capacityLimit}`}
              tone={capacidad.isFull ? "crit" : capacidad.remaining <= 3 ? "warn" : "idle"}
              urgent={capacidad.isFull}
            />
            <StatTile label="En esta entrada" value={entradas.length} tone="brand" />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ------------------------------------------------------ niños */}
        <section className="flex flex-col gap-4">
          <ScannerField
            onScan={handleScan}
            validate={validarPulsera}
            placeholder="Pasa la pulsera por el lector…"
          />

          {aviso && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-3 text-[13px] text-state-warn"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {aviso}
            </p>
          )}

          {entradas.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-16 text-center">
              <UserRound size={30} className="mx-auto text-ink-3" aria-hidden="true" />
              <p className="font-display mt-3 text-lg font-semibold text-ink">
                Ningún niño en esta entrada
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                Cada pulsera que pases crea una fila. No hace falta tocar la pantalla para
                empezar.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {entradas.map((e, i) => (
                <li
                  key={e.uid}
                  className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <div className="flex items-start gap-3">
                    <Initial name={e.name || String(i + 1)} tone="brand" />

                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <Input
                        label="Nombre del niño"
                        value={e.name}
                        onChange={(ev) => actualizar(e.uid, { name: ev.target.value })}
                        ref={(el: HTMLInputElement | null) => {
                          nameRefs.current.set(e.uid, el);
                        }}
                        placeholder="Nombre y apellido"
                        autoComplete="off"
                        {...(e.name.trim().length > 0 && e.name.trim().length < 2
                          ? { error: "Demasiado corto" }
                          : {})}
                      />
                      <Input
                        label="Apodo (opcional)"
                        value={e.nickname}
                        onChange={(ev) => actualizar(e.uid, { nickname: ev.target.value })}
                        placeholder="Cómo lo llaman"
                        autoComplete="off"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => quitar(e.uid)}
                      aria-label={`Quitar la pulsera ${e.wristbandCode}`}
                      className="grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                    <Badge tone="idle">
                      <span className="tnum font-mono">{e.wristbandCode}</span>
                    </Badge>
                    <div className="min-w-[280px] flex-1">
                      <PackagePicker
                        packages={packages}
                        selectedId={e.packageId}
                        onSelect={(id) => actualizar(e.uid, { packageId: id })}
                        compact
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------- representante */}
        <aside className="flex h-fit flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:sticky lg:top-28">
          <h2 className="font-display text-lg font-bold text-ink">Representante</h2>

          <Input
            label="Teléfono"
            value={telefono}
            onChange={(ev) => setTelefono(ev.target.value)}
            placeholder="0412-1234567"
            inputMode="tel"
            autoComplete="off"
            leading={<Phone size={16} aria-hidden="true" />}
            hint="Si ya vino antes, aparecerá solo"
          />

          {encontrado && (
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-2.5">
              <CircleCheckBig size={16} className="shrink-0 text-state-ok" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{encontrado.fullName}</p>
                <p className="text-[12px] text-ink-2">Ya registrado · no hay que teclear nada</p>
              </div>
            </div>
          )}

          {esNuevo && (
            <Input
              label="Nombre del representante"
              value={nombreNuevo}
              onChange={(ev) => setNombreNuevo(ev.target.value)}
              placeholder="Nombre y apellido"
              autoComplete="off"
              hint="No lo tenemos registrado todavía"
            />
          )}

          <div className="mt-1 border-t border-line pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
                Total a cobrar
              </span>
              <MoneyDisplay value={toMajor(total)} currency={total.currency} size="lg" />
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              {entradas.length === 0
                ? "Sin niños en la entrada"
                : `${entradas.length} ${entradas.length === 1 ? "niño" : "niños"}`}
            </p>
          </div>

          <Button
            surface="pos"
            variant="primary"
            disabled={!puedeEnviar}
            onClick={registrar}
            className="w-full"
          >
            Registrar y cobrar
          </Button>

          {/* §8.7: el motivo por el que un botón está deshabilitado se dice,
              no se deja adivinar. */}
          {!puedeEnviar && entradas.length > 0 && (
            <p className="text-center text-[12px] text-ink-3">
              {capacidad.isFull
                ? "Aforo completo"
                : faltanNombres
                  ? "Falta el nombre de algún niño"
                  : "Falta el representante"}
            </p>
          )}

          {enviado && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-3"
            >
              <CircleCheckBig size={16} className="mt-0.5 shrink-0 text-state-ok" aria-hidden="true" />
              <p className="text-[13px] text-ink">
                {enviado.ninos} {enviado.ninos === 1 ? "niño registrado" : "niños registrados"} por
                USD {enviado.total}.{" "}
                <Link href="/monitor" className="underline">
                  Ver en el monitor
                </Link>
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
