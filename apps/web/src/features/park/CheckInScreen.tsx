"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Cake,
  CircleCheckBig,
  HandHeart,
  Phone,
  ScanLine,
  Ticket,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  CheckInCommandSchema,
  GuardianSchema,
  type PaymentMode,
  type RepresentanteEncontradoDto,
  type ReservaEventoDto,
  WristbandCodeSchema,
} from "@l2/contracts";
import {
  Badge,
  Button,
  Container,
  Initial,
  EmptyState,
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
import { buscarRepresentante, consultarPulsera, registrarEntrada } from "./parque.acciones";
import { entrarInvitados } from "../eventos/eventos.acciones";
import { horario } from "../eventos/formato.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { BotonCamara, LectorCamara } from "../lector/LectorCamara";
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
  /** La pulsera leída; vacío en un niño sin pulsera (B4-8), cuyo código lo pone el servidor. */
  wristbandCode: string;
  /** Un niño que no tolera la pulsera (B4-8, P-1): entra sin ella y su nombre es obligatorio. */
  sinPulsera: boolean;
  packageId: string;
  /** Opcional (DEC-28): vacío, el niño entra solo con su pulsera. Sin pulsera, obligatorio. */
  nombre: string;
};

/** Un nombre como lo lee una persona: sin mayúsculas, acentos ni espacios de más. */
const claveDeNombre = (n: string) =>
  n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");

const NUEVO_UID = () => globalThis.crypto.randomUUID();

/** Dígitos que hacen falta para buscar a una familia: un teléfono entero, no un pedazo. */
const DIGITOS_PARA_BUSCAR = 7;

export function CheckInScreen({
  cumpleanos = [],
}: {
  /** Los cumpleaños de hoy que reciben invitados (B10-2): la entrada los ofrece además de la visita normal. */
  cumpleanos?: readonly ReservaEventoDto[];
} = {}) {
  const { sala, adoptar: adoptarEstancias } = useSala();
  const activeSessions = sala?.sessions.length ?? 0;
  /**
   * Códigos con una estancia ya activa. Las pulseras son desechables (§6.6),
   * así que esto no impide «reutilizar» nada: impide escanear dos veces la
   * misma pulsera que ya está puesta a un niño en sala (I-04). El servidor lo vuelve a mirar.
   */
  const occupiedWristbands = useMemo(() => sala?.sessions.map((s) => s.wristbandCode) ?? [], [sala]);
  const { tarifario, publicado } = useTarifario();
  const paquetesActivos = useMemo(
    () => tarifario.packages.filter((p) => p.active),
    [tarifario.packages],
  );
  const defaultPackageId =
    paquetesActivos.find((p) => p.id === "pkg-60")?.id ??
    paquetesActivos[0]?.id ??
    "";
  const capacityLimit = tarifario.policy.capacityLimit;
  const { formatoHora } = useSucursal().ajustes;
  /** A qué entra esta tanda (B10-2): una visita normal (`null`) o un cumpleaños de hoy, por su reserva. */
  const [reservaId, setReservaId] = useState<string | null>(null);
  const cumple = cumpleanos.find((r) => r.id === reservaId) ?? null;
  /** Cuántos invitados del cumpleaños elegido pueden entrar todavía: los reservados menos los que entraron. */
  const quedan = cumple ? Math.max(0, cumple.invitados - (cumple.dia?.entraron ?? 0)) : null;

  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  // DEC-21: cómo paga esta familia. Se elige en cada entrada.
  const [modo, setModo] = useState<PaymentMode>("PREPAGO");
  const router = useRouter();
  const { adoptar: adoptarCuenta } = useCuentas();
  const [enviando, setEnviando] = useState(false);
  /**
   * En el teléfono (B4-5) la entrada va en dos pasos: las pulseras y luego la familia. En tablet y
   * escritorio se ven los dos a la vez y esto no cambia nada.
   */
  const [pasoMovil, setPasoMovil] = useState<"PULSERAS" | "FAMILIA">("PULSERAS");
  /** La cámara del teléfono como lector (V-2). */
  const [camara, setCamara] = useState(false);
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
        { uid, wristbandCode: limpio, sinPulsera: false, packageId: defaultPackageId, nombre: "" },
      ]);
      setAviso(null);
      setPasoMovil("PULSERAS");
      // V-1: el servidor dice ya si la pulsera se usó en otra visita o no es de la serie; la fila
      // se quita en vez de descubrirlo al registrar. Sin respuesta, lo comprueba la entrada.
      void consultarPulsera({ codigo: limpio })
        .then((r) => {
          if (!r.ok || r.valor.estado === "LIBRE") return;
          setEntradas((prev) => prev.filter((x) => x.uid !== uid));
          setAviso(r.valor.mensaje);
        })
        .catch(() => undefined);
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

  /**
   * Un niño que no tolera la pulsera (B4-8, P-1): entra sin ella. Se le reconoce por su nombre, que se pide en el
   * acto; el código (SP-…) lo pone el servidor al registrar.
   */
  function anadirSinPulsera() {
    if (activeSessions + entradas.length >= capacityLimit) {
      setAviso(`Aforo completo (${capacityLimit}). No se puede registrar a nadie más`);
      return;
    }
    const uid = NUEVO_UID();
    setEntradas((prev) => [...prev, { uid, wristbandCode: "", sinPulsera: true, packageId: defaultPackageId, nombre: "" }]);
    setAviso(null);
    setPasoMovil("PULSERAS");
    queueMicrotask(() => document.getElementById(`nombre-${uid}`)?.focus());
  }

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
        ...(e.sinPulsera ? { sinPulsera: true as const } : { wristbandCode: e.wristbandCode }),
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
    // La sala y la caja lo ven al momento en este equipo; los demás, por el canal en vivo (B5-1).
    adoptarEstancias(sessions);
    adoptarCuenta(cuenta);

    setEntradas([]);
    setTelefono("");
    setNombreNuevo("");
    setBusqueda(null);
    setAviso(null);
    setPasoMovil("PULSERAS");

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

  const puedeEnviarInvitados = cumple !== null && entradas.length > 0 && entradas.length <= (quedan ?? 0) && !capacidad.isFull && !enviando;

  /** Los invitados de un cumpleaños (B10-2): solo sus pulseras, a la cuenta del día; sin paquete ni cobro. */
  async function registrarInvitados() {
    if (!cumple) return;
    clave.current ??= NUEVO_UID();
    setEnviando(true);
    const r = await entrarInvitados({ idempotencyKey: clave.current, reservaId: cumple.id, pulseras: entradas.map((e) => e.wristbandCode) }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setAviso("Sin conexión con el servidor: los invitados no entraron. Vuelve a intentarlo.");
      return;
    }
    clave.current = null;
    if (!r.ok) {
      setAviso(r.mensaje);
      return;
    }
    adoptarEstancias(r.valor.sessions);
    adoptarCuenta(r.valor.account);
    setEntradas([]);
    setAviso(null);
    setPasoMovil("PULSERAS");
    const n = r.valor.sessions.length;
    avisar.ok(`${n === 1 ? "Entró 1 invitado" : `Entraron ${n} invitados`} al cumpleaños de ${cumple.cumpleanero}`, {
      detalle: "Sin cobro: lo paga el paquete del cumpleaños.",
    });
    // La cuenta de invitados que entraron la vuelve a leer la página.
    router.refresh();
  }

  /* ------------------------------------------------------------ pintado */

  // Un local recién instalado no tiene tarifas (T-4): la entrada lo dice en vez de ofrecer una
  // lista de paquetes vacía. El servidor tampoco dejaría entrar a nadie sin tarifario.
  if (!publicado) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center p-6">
        <EmptyState
          icon={<TriangleAlert size={28} className="text-state-warn" aria-hidden="true" />}
          title="Todavía no hay tarifas del parque"
          hint="Sin tarifas publicadas no se puede registrar una entrada. Administración las publica en Panel → Ajustes → Tarifas y paquetes."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container
          ancho="operacion"
          className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4 max-md:py-2 bajo:py-2"
        >
          {/* En el teléfono el título lo dice la pestaña: queda para el lector de pantalla. */}
          <div className="max-md:sr-only">
            <div>
              <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
                Entrada al parque
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3 bajo:hidden">
                Pasa las pulseras por el lector para empezar
              </p>
            </div>
          </div>

          <div className="flex items-end gap-7 max-md:w-full max-md:justify-between">
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
        className="grid min-h-0 flex-1 gap-5 py-4 max-md:grid-rows-[minmax(0,1fr)] max-md:py-3 md:grid-rows-[minmax(0,1fr)_auto] apaisado:grid-cols-[minmax(0,1fr)_360px] apaisado:grid-rows-[minmax(0,1fr)] bajo:py-3"
      >
        {/* ------------------------------------------------------ niños */}
        <section className={cn("flex min-h-0 min-w-0 flex-col gap-4 max-md:gap-3", pasoMovil === "FAMILIA" && "max-md:hidden")}>
          <div className="flex shrink-0 items-stretch gap-2">
            <ScannerField
              onScan={handleScan}
              validate={validarPulsera}
              placeholder="Pasa la pulsera por el lector…"
              className="min-w-0 flex-1"
            />
            <BotonCamara activa={camara} onCambiar={setCamara} />
            {/* B4-8 (P-1): un niño que no tolera la pulsera entra sin ella, por su nombre. No en un cumpleaños: sus
                invitados entran con la pulsera de la reserva. */}
            {!cumple && (
              <Button surface="tablet" variant="neutral" className="shrink-0 gap-1.5" onClick={anadirSinPulsera} aria-label="Añadir un niño sin pulsera">
                <HandHeart size={18} aria-hidden="true" />
                <span className="max-sm:hidden">Sin pulsera</span>
              </Button>
            )}
          </div>

          {camara && <LectorCamara onCerrar={() => setCamara(false)} className="h-[36dvh] max-h-80 shrink-0 md:h-64" />}

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
              camara ? null : <ScanPrompt
                className="max-md:py-6 max-md:[&_ol]:hidden"
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

                      {e.sinPulsera ? (
                        <Badge tone="brand" icon={<HandHeart size={14} aria-hidden="true" />} className="text-[14px] px-3 py-1.5">
                          Sin pulsera
                        </Badge>
                      ) : (
                        <Badge tone="idle" className="text-[15px] px-3 py-1.5">
                          <span className="tnum font-mono">
                            {e.wristbandCode}
                          </span>
                        </Badge>
                      )}

                      {/* En el teléfono el paquete va en su renglón, en 2×2: en la fila, cuatro no caben. Un
                          invitado de cumpleaños no elige paquete: lo cubre el del evento (B10-2). */}
                      {cumple ? (
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">Invitado · Cumpleaños de {cumple.cumpleanero}</span>
                      ) : (
                      <div className="min-w-[200px] flex-1 max-md:order-last max-md:basis-full">
                        <PackagePicker
                          packages={paquetesActivos}
                          selectedId={e.packageId}
                          onSelect={(id) =>
                            actualizar(e.uid, { packageId: id })
                          }
                          compact
                        />
                      </div>
                      )}

                      <button
                        type="button"
                        onClick={() => quitar(e.uid)}
                        aria-label={e.sinPulsera ? `Quitar al niño sin pulsera ${e.nombre}` : `Quitar la pulsera ${e.wristbandCode}`}
                        className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit max-md:ml-auto"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                    {/* DEC-28: el nombre es opcional. Si la familia ya vino, sus niños se proponen. Los invitados
                        de un cumpleaños no son de la familia que reservó: se nombran después, desde la sala. */}
                    {!cumple && <input
                      id={`nombre-${e.uid}`}
                      aria-label={e.sinPulsera ? "Nombre del niño sin pulsera (obligatorio)" : `Nombre del niño de la pulsera ${e.wristbandCode} (opcional)`}
                      aria-required={e.sinPulsera}
                      value={e.nombre}
                      onChange={(ev) => actualizar(e.uid, { nombre: ev.target.value })}
                      placeholder={
                        e.sinPulsera
                          ? "Nombre del niño (obligatorio: sin pulsera se le reconoce por él)"
                          : encontrado && encontrado.kids.length > 0
                            ? `Nombre (opcional): ${encontrado.kids.map((k) => k.nickname ?? k.name).join(", ")}`
                            : "Nombre del niño (opcional)"
                      }
                      list={encontrado && encontrado.kids.length > 0 ? "ninos-de-la-familia" : undefined}
                      autoComplete="off"
                      maxLength={60}
                      className="mt-3 min-h-12 w-full rounded-[var(--radius-control)] border border-line bg-base px-3 text-[14px] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand"
                    />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* En el teléfono, el paso siguiente: la familia. */}
          <Button
            surface="tablet"
            variant="primary"
            className="w-full shrink-0 md:hidden"
            disabled={entradas.length === 0}
            onClick={() => setPasoMovil("FAMILIA")}
          >
            {entradas.length === 0
              ? "Pasa la primera pulsera"
              : `Continuar con ${entradas.length} ${entradas.length === 1 ? "niño" : "niños"}`}
            {entradas.length > 0 && <ArrowRight size={18} aria-hidden="true" />}
          </Button>
        </section>

        {/* ---------------------------------------------- representante */}
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 max-md:p-4 apaisado:max-h-full apaisado:self-start bajo:gap-3 bajo:p-4",
            pasoMovil === "PULSERAS" && "max-md:hidden",
          )}
        >
          {/* En el teléfono: volver a las pulseras, con cuántas van. Fuera de lo que desplaza: con el
              teclado abierto sigue a la vista. */}
          <Button surface="tablet" variant="ghost" className="-mx-2 -mt-2 mb-2 shrink-0 self-start md:hidden" onClick={() => setPasoMovil("PULSERAS")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Pulseras ({entradas.length})
          </Button>
          <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1 bajo:gap-3">
            <div className="flex flex-col gap-4 bajo:gap-3">
              {aviso && (
                <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn md:hidden">
                  <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                  {aviso}
                </p>
              )}
              {cumpleanos.length > 0 && (
                <fieldset className="flex flex-col">
                  <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Entran a</legend>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[null, ...cumpleanos].map((r) => (
                      <button
                        key={r?.id ?? "visita"}
                        type="button"
                        aria-pressed={reservaId === (r?.id ?? null)}
                        onClick={() => {
                          setReservaId(r?.id ?? null);
                          setAviso(null);
                        }}
                        className={cn(
                          "flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                          reservaId === (r?.id ?? null) ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:text-ink",
                        )}
                      >
                        {r ? <Cake size={16} className="shrink-0 text-brand" aria-hidden="true" /> : <Ticket size={16} className="shrink-0" aria-hidden="true" />}
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{r ? `Cumpleaños de ${r.cumpleanero}` : "Visita"}</span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {r
                              ? `${horario(r.inicio, r.fin, formatoHora)} · entraron ${r.dia?.entraron ?? 0} de ${r.invitados}`
                              : "Con su paquete y su representante"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {cumple ? (
                <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line bg-base px-3 py-2.5 text-[13px]">
                  <p className="font-semibold text-ink">Cumpleaños de {cumple.cumpleanero}</p>
                  <p className="text-ink-2">
                    {cumple.paquete.name} · representante: {cumple.representante.fullName}
                  </p>
                  <p className={cn("tnum", quedan === 0 ? "font-semibold text-state-warn" : "text-ink-2")}>
                    {quedan === 0
                      ? "Ya entraron todos los invitados reservados: quien llegue entra como visita normal."
                      : `Pueden entrar ${quedan} ${quedan === 1 ? "invitado" : "invitados"} más.`}
                  </p>
                </div>
              ) : (
              <>
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
              </>
              )}
            </div>
          </div>

          {/* Lo que se decide justo antes de pulsar el botón va pegado al
              botón, y fuera de lo que desplaza: en una tablet de 600 px de
              alto, «cómo paga» se quedaba medio tapado abajo. */}
          {cumple ? (
            <div className="mt-4 flex shrink-0 flex-col gap-2 border-t border-line pt-4 bajo:mt-3">
              <p className="text-[12px] text-ink-3">Sin cobro: lo paga el paquete del cumpleaños. Cuentan en el aforo.</p>
              <Button surface="pos" variant="primary" disabled={!puedeEnviarInvitados} onClick={() => void registrarInvitados()} className="w-full">
                {enviando ? "Registrando…" : entradas.length > 0 ? `Registrar ${entradas.length} ${entradas.length === 1 ? "invitado" : "invitados"}` : "Registrar invitados"}
              </Button>
              {!puedeEnviarInvitados && !enviando && entradas.length > 0 && (
                <p className="text-center text-[12px] text-ink-3">
                  {capacidad.isFull ? "Aforo completo" : `Caben ${quedan} ${quedan === 1 ? "invitado" : "invitados"} más: quita las pulseras que sobran`}
                </p>
              )}
            </div>
          ) : (
          <div className="mt-4 flex shrink-0 flex-col gap-4 border-t border-line pt-4 bajo:mt-3 bajo:gap-3">
            {/* DEC-21: la familia elige cómo paga. Define a dónde lleva el botón. M-18 (B4-6): lo pagado al
                entrar no se devuelve si sale antes; en cuenta abierta se cobra por lo que usó. */}
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
                      "Si sale antes, no se devuelve",
                    ],
                    ["CUENTA_ABIERTA", "Cuenta abierta", "Al salir, por lo que usó"],
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
                        ? "border-brand bg-brand/20 text-ink"
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
          )}
        </aside>
      </Container>
    </div>
  );
}
