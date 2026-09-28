"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleCheckBig,
  Phone,
  ScanLine,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  CheckInCommandSchema,
  GuardianSchema,
  type PaymentMode,
  type RepresentanteEncontradoDto,
  WristbandCodeSchema,
} from "@l2/contracts";
import {
  Badge,
  Button,
  Container,
  Initial,
  Input,
  MoneyDisplay,
  ScannerField,
  ScanPrompt,
  StatTile,
  cn,
  avisar,
  formatMoneyVE,
} from "@l2/ui";
import { sum, toMajor, zero } from "@l2/domain-money";
import { computeCapacity, contactKey } from "@l2/domain-park";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { buscarRepresentante, registrarEntrada } from "./parque.acciones";
import { useSala } from "./SalaProvider.tsx";
import { PackagePicker } from "./PackagePicker";
import { toMoney } from "./mappers.ts";
import { useTarifario } from "./TarifarioProvider";
import { useActorEnSesion } from "../identity/sesion.ts";
import { puedeAbrirRuta } from "../identity/visibilidad.ts";

/**
 * Registro de entrada al parque — F5-02, F5-03, F5-04.
 *
 * Su criterio de aceptación es medible: **dos niños en menos de 90 segundos**,
 * cronómetro en mano y sobre hardware real. Todo el diseño sale de ahí:
 *
 *  · Se escanea primero y lo demás sigue. La pulsera crea la fila; no hay un
 *    botón «añadir niño» que haya que buscar.
 *  · El foco salta solo al teléfono tras la primera pulsera (si está vacío).
 *  · El paquete viene preseleccionado con el más común, y se cambia en un
 *    toque sobre un botón grande, no en un desplegable.
 *  · Al representante se le busca por teléfono; si ya vino, no se vuelve a
 *    teclear nada. El nombre de cada niño es **opcional** (DEC-28): se puede
 *    poner aquí mismo si hay tiempo, y si la familia ya vino se proponen sus
 *    niños conocidos; si no, se pone después desde la sala.
 *  · Una sola pantalla. Ningún diálogo, ninguna navegación intermedia.
 *
 * Desde B4-2 registra en el servidor: él abre las estancias con su hora, pone el precio del tarifario
 * vigente, comprueba el aforo y las pulseras con lo que hay de verdad en sala y abre la cuenta de la
 * familia. Lo que esta pantalla calcula (total, aforo) es un anticipo para quien atiende.
 */

type Entrada = {
  uid: string;
  wristbandCode: string;
  packageId: string;
  /** Opcional (DEC-28): vacío, el niño entra solo con su pulsera. */
  nombre: string;
};

/** Un nombre como lo lee una persona: sin mayúsculas, acentos ni espacios de más. */
const claveDeNombre = (n: string) =>
  n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");

const NUEVO_UID = () => globalThis.crypto.randomUUID();

/** Dígitos que hacen falta para buscar a una familia: un teléfono entero, no un pedazo. */
const DIGITOS_PARA_BUSCAR = 7;

export function CheckInScreen() {
  const { sala, adoptar: adoptarEstancias } = useSala();
  const activeSessions = sala?.sessions.length ?? 0;
  /**
   * Códigos con una estancia ya activa. Las pulseras son desechables (§6.6),
   * así que esto no impide «reutilizar» nada: impide escanear dos veces la
   * misma pulsera que ya está puesta a un niño en sala (I-04). El servidor lo vuelve a mirar.
   */
  const occupiedWristbands = useMemo(() => sala?.sessions.map((s) => s.wristbandCode) ?? [], [sala]);
  const { tarifario } = useTarifario();
  const paquetesActivos = useMemo(
    () => tarifario.packages.filter((p) => p.active),
    [tarifario.packages],
  );
  const defaultPackageId =
    paquetesActivos.find((p) => p.id === "pkg-60")?.id ??
    paquetesActivos[0]?.id ??
    "";
  const capacityLimit = tarifario.policy.capacityLimit;

  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  // DEC-21: cómo paga esta familia. Se elige en cada entrada.
  const [modo, setModo] = useState<PaymentMode>("PREPAGO");
  const router = useRouter();
  const { adoptar: adoptarCuenta } = useCuentas();
  const [enviando, setEnviando] = useState(false);
  /** La clave de este intento: un reintento tras un corte no registra dos veces (I-11). */
  const clave = useRef<string | null>(null);

  const actor = useActorEnSesion();
  const puedeCobrar = actor !== null && puedeAbrirRuta(actor, "/caja");

  const phoneRef = useRef<HTMLInputElement>(null);

  const capacidad = computeCapacity(
    activeSessions + entradas.length,
    capacityLimit,
  );

  /* ----------------------------------------------------- representante */

  // F5-03: se busca por teléfono, que es lo que el representante recuerda. Lo busca el servidor
  // con el número entero: nadie recorre el directorio tecleando pedazos.
  const llave = contactKey(telefono);
  const buscable = llave !== null && llave.length >= DIGITOS_PARA_BUSCAR;
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
  const esNuevo = buscada !== null && !encontrado;

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
        // I-04: un código no puede tener dos estancias activas a la vez.
        setAviso(`La pulsera ${limpio} ya está activa en sala`);
        return;
      }
      if (entradas.some((e) => e.wristbandCode === limpio)) {
        setAviso(`La pulsera ${limpio} ya está en esta lista`);
        return;
      }
      if (activeSessions + entradas.length >= capacityLimit) {
        // F5-03b: el aforo avisa ANTES de permitir un check-in más.
        setAviso(
          `Aforo completo (${capacityLimit}). No se puede registrar a nadie más`,
        );
        return;
      }

      const uid = NUEVO_UID();
      setEntradas((prev) => [
        ...prev,
        { uid, wristbandCode: limpio, packageId: defaultPackageId, nombre: "" },
      ]);
      setAviso(null);
      // El foco salta solo al teléfono tras la primera pulsera si está vacío.
      if (entradas.length === 0 && !telefono) {
        queueMicrotask(() => {
          phoneRef.current?.focus();
        });
      }
    },
    [
      entradas,
      occupiedWristbands,
      activeSessions,
      capacityLimit,
      defaultPackageId,
      telefono,
    ],
  );

  const validarPulsera = useCallback(
    (code: string) => WristbandCodeSchema.safeParse(code).success,
    [],
  );

  const actualizar = (uid: string, patch: Partial<Entrada>) =>
    setEntradas((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, ...patch } : e)),
    );

  const quitar = (uid: string) =>
    setEntradas((prev) => prev.filter((e) => e.uid !== uid));

  /* -------------------------------------------------------------- total */

  const total = useMemo(() => {
    const precios = entradas.map((e) => {
      const p = tarifario.packages.find((x) => x.id === e.packageId);
      return p ? toMoney(p.price) : zero("USD");
    });
    return sum(precios, "USD");
  }, [entradas, tarifario.packages]);

  /* ------------------------------------------------------------- envío */

  const faltaRepresentante = !encontrado && (!esNuevo || nombreNuevo.trim().length < 2);
  const telefonoValido =
    GuardianSchema.shape.contactReference.safeParse(telefono).success;
  const puedeEnviar =
    entradas.length > 0 &&
    telefonoValido &&
    !faltaRepresentante &&
    !capacidad.isFull &&
    !enviando;

  /**
   * El niño de una fila: uno que la familia ya tiene en el directorio (por su nombre), uno nuevo con
   * el nombre escrito, o ninguno todavía (DEC-28).
   */
  function ninoDe(nombre: string): { id: string } | { name: string } | Record<string, never> {
    const limpio = nombre.trim();
    if (!limpio) return {};
    const conocido = encontrado?.kids.find(
      (k) => claveDeNombre(k.name) === claveDeNombre(limpio) || (k.nickname && claveDeNombre(k.nickname) === claveDeNombre(limpio)),
    );
    return conocido ? { id: conocido.id } : { name: limpio };
  }

  async function registrar() {
    clave.current ??= NUEVO_UID();
    // El mismo contrato que validará el servidor. Si algo no cuadra, se ve
    // aquí y no en un 400 sin explicación (ADR-017).
    const comando = {
      idempotencyKey: clave.current,
      paymentMode: modo,
      entries: entradas.map((e) => ({
        wristbandCode: e.wristbandCode,
        kid: ninoDe(e.nombre),
        packageId: e.packageId,
      })),
      ...(encontrado
        ? { guardianId: encontrado.id }
        : {
            guardian: {
              fullName: nombreNuevo.trim(),
              contactReference: telefono.trim(),
            },
          }),
    };

    const resultado = CheckInCommandSchema.safeParse(comando);
    if (!resultado.success) {
      setAviso(
        resultado.error.issues[0]?.message ?? "Faltan datos por completar",
      );
      return;
    }

    setEnviando(true);
    const r = await registrarEntrada(resultado.data).catch(() => null);
    setEnviando(false);
    if (!r) {
      // La clave se guarda: al reintentar, si el servidor ya la registró, devuelve la misma.
      setAviso("Sin conexión con el servidor: la entrada no se registró. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      clave.current = null;
      setAviso(r.mensaje);
      return;
    }

    clave.current = null;
    const { account: cuenta, sessions } = r.valor;
    // La sala y la caja lo ven al momento en este equipo; los demás, con su sondeo.
    adoptarEstancias(sessions);
    adoptarCuenta(cuenta);

    setEntradas([]);
    setTelefono("");
    setNombreNuevo("");
    setBusqueda(null);
    setAviso(null);

    const n = sessions.length;
    if (modo === "PREPAGO") {
      // Prepago: el paquete se cobra ya. La caja recibe la cuenta y, al
      // cobrar, devuelve aquí para la siguiente familia (§9.10.9).
      if (puedeCobrar) {
        router.push(`/caja?cuenta=${cuenta.id}&volver=/entrada` as Route);
      } else {
        const totalConFormato = formatMoneyVE(toMajor(total), total.currency);
        avisar.ok(`Cuenta enviada a caja: ${cuenta.family}`, {
          detalle: `${n} ${n === 1 ? "niño" : "niños"} · ${totalConFormato}. Se cobra en la caja.`,
        });
      }
      return;
    }
    avisar.ok(`Cuenta abierta para ${cuenta.family}`, {
      detalle: `${n} ${n === 1 ? "niño" : "niños"}. Se cobra todo junto al salir.`,
      accion: {
        texto: "Ver en la sala",
        alPulsar: () => router.push("/monitor"),
      },
    });
  }

  /* ------------------------------------------------------------ pintado */

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container
          ancho="operacion"
          className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4 bajo:py-2"
        >
          <div>
            <div>
              <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
                Entrada al parque
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3 bajo:hidden">
                Pasa las pulseras por el lector para empezar
              </p>
            </div>
          </div>

          <div className="flex items-end gap-7">
            <StatTile
              label="Aforo"
              value={capacidad.active}
              suffix={`/ ${capacityLimit}`}
              tone={
                capacidad.isFull
                  ? "crit"
                  : capacidad.remaining <= 3
                    ? "warn"
                    : "idle"
              }
              urgent={capacidad.isFull}
            />
            <StatTile
              label="En esta entrada"
              value={entradas.length}
              tone="brand"
            />
          </div>
        </Container>
      </header>

      <Container
        as="main"
        ancho="operacion"
        className="grid flex-1 gap-5 py-4 md:min-h-0 md:grid-rows-[minmax(0,1fr)_auto] apaisado:grid-cols-[minmax(0,1fr)_360px] apaisado:grid-rows-[minmax(0,1fr)] bajo:py-3"
      >
        {/* ------------------------------------------------------ niños */}
        <section className="flex min-h-0 min-w-0 flex-col gap-4">
          <div className="shrink-0">
            <ScannerField
              onScan={handleScan}
              validate={validarPulsera}
              placeholder="Pasa la pulsera por el lector…"
            />
          </div>

          {aviso && (
            <p
              role="alert"
              className="flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-3 text-[13px] text-state-warn"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {aviso}
            </p>
          )}

          <div className="-m-1 flex-1 min-h-0 overflow-y-auto p-1">
            {entradas.length === 0 ? (
              <ScanPrompt
                icon={<ScanLine size={40} aria-hidden="true" />}
                titulo="Pasa la primera pulsera"
                detalle="El lector la reconoce sin tocar la pantalla. Cada pulsera crea una fila; el nombre del niño es opcional: se puede poner aquí o después, desde la sala."
                pasos={[
                  "Pasa las pulseras",
                  "Elige el paquete",
                  "Teléfono del representante",
                  puedeCobrar ? "Registra y cobra" : "Registra y envía a caja",
                ]}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {encontrado && encontrado.kids.length > 0 && (
                  <datalist id="ninos-de-la-familia">
                    {encontrado.kids.map((k) => (
                      <option key={k.id} value={k.name} />
                    ))}
                  </datalist>
                )}
                {entradas.map((e, i) => (
                  <li
                    key={e.uid}
                    className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Initial name={String(i + 1)} tone="brand" />

                      <Badge tone="idle" className="text-[15px] px-3 py-1.5">
                        <span className="tnum font-mono">
                          {e.wristbandCode}
                        </span>
                      </Badge>

                      <div className="min-w-[200px] flex-1">
                        <PackagePicker
                          packages={paquetesActivos}
                          selectedId={e.packageId}
                          onSelect={(id) =>
                            actualizar(e.uid, { packageId: id })
                          }
                          compact
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => quitar(e.uid)}
                        aria-label={`Quitar la pulsera ${e.wristbandCode}`}
                        className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                    {/* DEC-28: el nombre es opcional. Si la familia ya vino, sus niños se proponen. */}
                    <input
                      aria-label={`Nombre del niño de la pulsera ${e.wristbandCode} (opcional)`}
                      value={e.nombre}
                      onChange={(ev) => actualizar(e.uid, { nombre: ev.target.value })}
                      placeholder={encontrado && encontrado.kids.length > 0 ? `Nombre (opcional): ${encontrado.kids.map((k) => k.nickname ?? k.name).join(", ")}` : "Nombre del niño (opcional)"}
                      list={encontrado && encontrado.kids.length > 0 ? "ninos-de-la-familia" : undefined}
                      autoComplete="off"
                      maxLength={60}
                      className="mt-3 min-h-12 w-full rounded-[var(--radius-control)] border border-line bg-base px-3 text-[14px] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---------------------------------------------- representante */}
        <aside className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 apaisado:max-h-full apaisado:self-start bajo:gap-3 bajo:p-4">
          <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1 bajo:gap-3">
            <div className="flex flex-col gap-4 bajo:gap-3">
              <h2 className="font-display text-lg font-bold text-ink">
                Representante
              </h2>

              <Input
                label="Teléfono"
                value={telefono}
                onChange={(ev) => setTelefono(ev.target.value)}
                placeholder="0412-1234567"
                inputMode="tel"
                autoComplete="off"
                ref={phoneRef}
                leading={<Phone size={16} aria-hidden="true" />}
                hint="A quién llamamos si pasa algo. Si ya vino, aparece solo"
              />

              {encontrado && (
                <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-2.5">
                  <CircleCheckBig
                    size={16}
                    className="shrink-0 text-state-ok"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {encontrado.fullName}
                    </p>
                    <p className="text-[12px] text-ink-2">
                      Ya registrado · no hay que teclear nada
                    </p>
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
            </div>
          </div>

          {/* Lo que se decide justo antes de pulsar el botón va pegado al
              botón, y fuera de lo que desplaza: en una tablet de 600 px de
              alto, «cómo paga» se quedaba medio tapado abajo. */}
          <div className="mt-4 flex shrink-0 flex-col gap-4 border-t border-line pt-4 bajo:mt-3 bajo:gap-3">
            {/* DEC-21: la familia elige cómo paga. Define a dónde lleva el botón. */}
            <fieldset className="flex flex-col">
              <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
                Cómo paga
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    [
                      "PREPAGO",
                      "Pagar ahora",
                      "Al salir, solo el tiempo de más",
                    ],
                    ["CUENTA_ABIERTA", "Cuenta abierta", "Todo junto al salir"],
                  ] as const
                ).map(([valor, nombre, detalle]) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={modo === valor}
                    title={detalle}
                    onClick={() => setModo(valor)}
                    className={cn(
                      "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 py-2 text-left",
                      "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      modo === valor
                        ? "border-brand bg-brand/12 text-ink"
                        : "border-line bg-base text-ink-2 hover:text-ink",
                    )}
                  >
                    <span className="text-[13px] font-semibold">{nombre}</span>
                    {/* En pantalla baja el detalle sobra: sigue en el `title`. */}
                    <span className="text-[11px] leading-snug text-ink-3 bajo:hidden">
                      {detalle}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-4 md:max-lg:portrait:flex-row md:max-lg:portrait:items-center md:max-lg:portrait:gap-4 bajo:gap-3">
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
                    Paquetes
                  </span>
                  <MoneyDisplay
                    value={toMajor(total)}
                    currency={total.currency}
                    size="lg"
                  />
                </div>
                <p className="mt-1 text-[12px] text-ink-3">
                  {entradas.length === 0
                    ? "Sin niños en la entrada"
                    : `${entradas.length} ${entradas.length === 1 ? "niño" : "niños"}`}
                </p>
              </div>

              <div className="flex flex-col gap-2 md:max-lg:portrait:w-1/2 md:max-lg:portrait:shrink-0">
                <Button
                  surface="pos"
                  variant="primary"
                  disabled={!puedeEnviar}
                  onClick={() => void registrar()}
                  className="w-full"
                >
                  {enviando
                    ? "Registrando…"
                    : modo === "PREPAGO"
                    ? puedeCobrar
                      ? "Registrar y cobrar"
                      : "Registrar y enviar a caja"
                    : "Registrar y abrir cuenta"}
                </Button>

                {/* §8.7: el motivo por el que un botón está deshabilitado se dice,
                  no se deja adivinar. */}
                {!puedeEnviar && !enviando && entradas.length > 0 && (
                  <p className="text-center text-[12px] text-ink-3">
                    {capacidad.isFull
                      ? "Aforo completo"
                      : !telefonoValido
                        ? "Falta el teléfono del representante"
                        : !buscable
                          ? "Escribe el teléfono completo"
                          : !buscada
                            ? "Buscando a la familia…"
                            : "Falta el nombre del representante"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </Container>
    </div>
  );
}
