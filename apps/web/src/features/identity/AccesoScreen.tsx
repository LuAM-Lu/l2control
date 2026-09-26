"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Lock,
  MonitorSmartphone,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { checkDevice, describeLockout, type Device, type LockoutState, type Role } from "@l2/domain-identity";
import { PUESTO_DE_ROL } from "./operador.ts";
import { entrar, solicitarRegistro } from "./acceso.acciones";
import { puestoDe } from "./visibilidad.ts";
import { esRutaDeEstacion, pedirPantallaCompleta } from "../shell/pantallaCompleta.ts";
import { useOperacion } from "../operacion/OperacionProvider.tsx";
import { Badge, Button, Initial, Input, NumericKeypad, cn } from "@l2/ui";

/**
 * Acceso por PIN atado a dispositivo — F2-03, ADR-013.
 *
 * ⚠️ LO QUE ESTA PANTALLA **NO** ES
 * El PIN, los intentos y el bloqueo los decide el SERVIDOR (B1-4, ADR-018):
 * esta pantalla envía el PIN y enseña lo que el servidor responde, con la
 * cuenta atrás del bloqueo. No hay contador en React que proteja nada, y no
 * se finge que lo haya.
 *
 * LO QUE SÍ IMPONE EL DISEÑO
 * El dispositivo es el PRIMER FACTOR. Se comprueba **antes** de mostrar
 * siquiera el teclado: desde un aparato desconocido no hay PIN que valga.
 */

export type Operador = Readonly<{
  id: string;
  nombre: string;
  rol: string;
  /** Rol de la matriz (§7.3): de él sale lo que esta persona puede ver. */
  role: Role;
}>;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}


const PIN_LENGTH = 4;

/**
 * Lo que dura el sello verde antes de abrir el puesto.
 *
 * No es decoración: sin él, acertar el PIN y fallarlo se parecen —en los dos
 * casos la pantalla se queda igual un instante— y el operador vuelve a pulsar.
 * 420 ms bastan para leer el acuse sin que estorbe a quien tiene cola delante.
 * Nada del estado depende de que termine: la navegación la dispara un
 * temporizador, no el final de una animación (§8.5).
 */
const MS_DEL_SELLO = 420;

const FORMATO_HORA = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const FORMATO_FECHA = new Intl.DateTimeFormat("es-VE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function AccesoScreen({
  device,
  operadores,
}: {
  /** `null` = equipo desconocido: la pantalla ofrece pedir su registro. */
  device: Device | null;
  operadores: readonly Operador[];
}) {
  const op = useOperacion();
  /**
   * A dónde entra: lo decide `puestoDe()` con el actor que devolvió el SERVIDOR al entrar
   * (N-02: una sola fuente, la misma que usan las guardias).
   */
  const [destino, setDestino] = useState<{ ruta: string; nombre: string } | null>(null);
  /** PIN temporal ya aceptado: ahora la persona elige el suyo, dos veces. */
  const [temporal, setTemporal] = useState<string | null>(null);
  const [primerNuevo, setPrimerNuevo] = useState<string | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [pin, setPin] = useState("");
  /** Lo último que dijo el servidor al rechazar un PIN, con su bloqueo si lo hay. */
  const [rechazo, setRechazo] = useState<{ mensaje: string; hasta: number | null; intentosRestantes: number | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [entrando, setEntrando] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  /**
   * Cuántas veces se ha errado, para reiniciar la sacudida.
   *
   * Sin este contador, el segundo PIN errado no se nota: la clase ya está
   * puesta y el navegador no vuelve a ejecutar la animación. Cambiar la `key`
   * del elemento lo monta de nuevo y la sacudida se repite, que es justo lo
   * que el error necesita.
   */
  const [sacudidas, setSacudidas] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Reloj de la pantalla de bloqueo. Se arranca en el cliente para no chocar
  // con la hora del servidor al hidratar. Es solo presentación: el instante
  // que cuenta para cobrar sigue viniendo del servidor (ADR-010).
  const [reloj, setReloj] = useState<number | null>(null);
  useEffect(() => {
    setReloj(Date.now());
    const id = setInterval(() => setReloj(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const hora = reloj === null ? null : FORMATO_HORA.format(reloj);
  const fecha = reloj === null ? null : FORMATO_FECHA.format(reloj);

  const revision = useMemo(() => checkDevice(device), [device]);
  const hasta = rechazo?.hasta ?? null;
  const bloqueo: LockoutState = {
    locked: hasta !== null && ahora < hasta,
    lockedUntil: hasta,
    attemptsRemaining: rechazo?.intentosRestantes ?? 0,
    secondsRemaining: hasta !== null && ahora < hasta ? Math.ceil((hasta - ahora) / 1000) : 0,
  };

  // Late el reloj solo mientras hay un bloqueo que contar hacia atrás.
  useEffect(() => {
    if (!bloqueo.locked) return;
    const id = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(id);
  }, [bloqueo.locked]);

  async function intentar() {
    if (bloqueo.locked || enviando || pin.length !== PIN_LENGTH || !operador) return;

    // Eligiendo PIN propio: primero se teclea, luego se repite.
    if (temporal !== null && primerNuevo === null) {
      setPrimerNuevo(pin);
      setPin("");
      setRechazo(null);
      return;
    }
    if (temporal !== null && primerNuevo !== pin) {
      setPrimerNuevo(null);
      setPin("");
      setRechazo({ mensaje: "Los dos PIN no coinciden. Escríbelo otra vez.", hasta: null, intentosRestantes: null });
      setSacudidas((n) => n + 1);
      return;
    }

    setEnviando(true);
    // El PIN va por POST en el cuerpo de la acción: nunca en la URL, en un log ni en el
    // estado que se persiste (§7.6). Lo comprueba el servidor con Argon2id.
    const r = await (temporal !== null ? entrar(operador.id, temporal, pin) : entrar(operador.id, pin)).catch(() => null);
    setEnviando(false);

    if (r?.ok) {
      // Entrar es IR al puesto de trabajo. El sello verde ocupa el lugar de una pantalla de
      // «bienvenido» y dura lo que tarda en leerse.
      const puesto = puestoDe(r.valor.actor);
      setDestino(puesto);
      setEntrando(true);
      setRechazo(null);
      // El panel en vivo enseña quién está en cada puesto (F9-08, D7).
      op.emitir({
        type: "sesion.iniciada",
        userName: operador.nombre,
        role: operador.rol,
        device: PUESTO_DE_ROL[operador.role],
      });
      if (esRutaDeEstacion(puesto.ruta)) pedirPantallaCompleta();
      window.setTimeout(() => router.push(puesto.ruta), MS_DEL_SELLO);
      return;
    }

    // PIN temporal correcto: antes de entrar, elige el suyo (alta o reposición).
    if (r && !r.ok && r.debeElegirPin) {
      if (temporal === null) setTemporal(pin);
      setPrimerNuevo(null);
      setPin("");
      setRechazo(temporal === null ? null : { mensaje: r.mensaje, hasta: null, intentosRestantes: null });
      return;
    }

    setRechazo({
      mensaje: r ? r.mensaje : "No se pudo comprobar el PIN: el servidor no respondió. Inténtalo de nuevo.",
      hasta: r?.bloqueo?.hasta ? Date.parse(r.bloqueo.hasta) : null,
      intentosRestantes: r?.bloqueo ? r.bloqueo.intentosRestantes : null,
    });
    setAhora(Date.now());
    setSacudidas((n) => n + 1);
    setPin("");
  }

  /* ------------------------------------- dispositivo no autorizado */

  if (!revision.ok && device === null) return <PedirRegistro />;

  if (!revision.ok) {
    return (
      <div className="grid flex-1 place-content-center bg-base px-6">
        <div className="max-w-md rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-8 text-center">
          <ShieldAlert size={36} className="mx-auto text-state-crit" aria-hidden="true" />
          <h1 className="font-display mt-4 text-2xl font-bold text-ink">
            Este dispositivo no puede entrar
          </h1>
          <p className="mt-3 text-sm text-ink-2">{revision.message}</p>
          <p className="mt-5 border-t border-state-crit/25 pt-4 text-[12.5px] text-ink-3">
            El dispositivo es el primer factor de acceso. Sin él, un PIN correcto tampoco sirve —
            así, un PIN visto por encima del hombro no abre nada desde otro aparato.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------ elegir persona */

  /**
   * Pantalla de bloqueo del dispositivo compartido.
   *
   * Antes era una tarjeta pequeña flotando en medio de una pantalla vacía.
   * Un equipo compartido pasa buena parte del día aquí, así que esta pantalla
   * hace el trabajo de una pantalla de bloqueo de verdad: la hora en grande,
   * qué dispositivo es y que está autorizado, y las personas del turno con
   * objetivos de toque grandes.
   */
  if (!operador) {
    return (
      <div className="grid flex-1 bg-base lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="flex flex-col justify-between gap-10 border-b border-line bg-surface/30 px-8 py-10 lg:border-r lg:border-b-0 lg:px-12 lg:py-14">
          <div className="flex items-center gap-3">
            <span className="font-display grid size-10 place-content-center rounded-[0.65rem] bg-brand text-base font-bold text-on-brand">
              L2
            </span>
            <span>
              <span className="font-display block font-bold text-ink">Abby Kingdom</span>
              <span className="block text-[12px] text-ink-3">Parque y restaurante</span>
            </span>
          </div>

          <div>
            <p className="tnum font-display text-[clamp(4rem,9vw,7rem)] leading-none font-bold tracking-tight text-ink">
              {hora ?? "--:--"}
            </p>
            <p className="mt-3 text-lg text-ink-2 first-letter:uppercase">{fecha ?? " "}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="ok" icon={<MonitorSmartphone size={13} aria-hidden="true" />}>
              {device!.label} · autorizado
            </Badge>
            {installPrompt && (
              <button
                type="button"
                onClick={async () => {
                  await installPrompt.prompt();
                  await installPrompt.userChoice;
                  setInstallPrompt(null);
                }}
                className="l2-solo-navegador flex min-h-[48px] items-center gap-2 rounded-full border border-line bg-surface px-4 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Download size={15} aria-hidden="true" />
                Instalar la app
              </button>
            )}
          </div>
        </section>

        <section className="flex flex-col justify-center px-6 py-10 lg:px-14">
          <div className="mx-auto w-full max-w-xl">
            <h1 className="font-display text-3xl font-bold text-ink">¿Quién entra?</h1>
            <p className="mt-1.5 text-[15px] text-ink-2">Toca tu nombre y escribe tu PIN.</p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {operadores.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setOperador(o)}
                    className={cn(
                      "group flex min-h-24 w-full cursor-pointer items-center gap-4 rounded-[var(--radius-card)]",
                      "border border-line bg-surface px-5 text-left shadow-card",
                      "transition-[transform,border-color,box-shadow] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
                      "hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    )}
                  >
                    <Initial name={o.nombre} tone="idle" className="size-12 text-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="font-display block truncate text-[17px] font-bold text-ink">
                        {o.nombre}
                      </span>
                      <span className="block text-[13px] text-ink-3">{o.rol}</span>
                    </span>
                    <ArrowRight
                      size={17}
                      aria-hidden="true"
                      className="shrink-0 text-ink-3 transition-[transform,color] duration-[var(--dur-rapida)] group-hover:translate-x-0.5 group-hover:text-brand"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    );
  }

  /* ------------------------------------------------------- el PIN */

  return (
    <div className="grid flex-1 place-content-center bg-base px-6 py-10">
      {/* La tarjeta entra desde abajo: el salto de «¿Quién entra?» al teclado
          es un paso adelante, y verlo llegar evita el corte seco. */}
      <div className="l2-entra w-full max-w-xs">
        <button
          type="button"
          disabled={entrando}
          onClick={() => {
            setOperador(null);
            setPin("");
            setTemporal(null);
            setPrimerNuevo(null);
            setRechazo(null);
          }}
          className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-ink-3 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Cambiar de persona
        </button>

        <div className="mb-6 flex items-center gap-3">
          <Initial name={operador.nombre} tone="idle" />
          <div className="min-w-0">
            <p className="font-display truncate font-bold text-ink">{operador.nombre}</p>
            <p className="text-[12px] text-ink-3">
              {temporal === null ? operador.rol : primerNuevo === null ? "Elige tu PIN nuevo" : "Repite tu PIN nuevo"}
            </p>
          </div>
        </div>

        {/* El PIN se muestra como puntos: se teclea de cara al público.

            Tres señales, ninguna sola: el punto REBOTA al entrar un dígito
            (la mano sabe que contó), la fila SE SACUDE al errar (una negación
            con la cabeza) y se pone VERDE al acertar. Debajo, siempre, el
            texto que dice lo mismo (§8.2). */}
        <div
          key={sacudidas}
          className={cn("mb-5 flex justify-center gap-3", rechazo !== null && "l2-sacudida")}
          aria-live="polite"
        >
          <span className="sr-only">
            {entrando ? "PIN correcto" : `${pin.length} de ${PIN_LENGTH} dígitos escritos`}
          </span>
          {Array.from({ length: PIN_LENGTH }, (_, i) => {
            const lleno = i < pin.length;
            return (
              <span
                // Al llenarse, el punto se monta de nuevo y por eso rebota.
                key={`${i}:${lleno}`}
                aria-hidden="true"
                className={cn(
                  "size-3.5 rounded-full transition-colors",
                  lleno && "l2-punto",
                  entrando ? "bg-state-ok" : lleno ? "bg-brand" : "bg-line",
                )}
              />
            );
          })}
        </div>

        {bloqueo.locked ? (
          <div className="l2-entra rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-5 text-center">
            <Lock size={24} className="mx-auto text-state-crit" aria-hidden="true" />
            <p className="mt-3 font-semibold text-ink">Demasiados intentos</p>
            <p className="tnum mt-1 text-sm text-state-crit">{describeLockout(bloqueo)}</p>
            <p className="mt-4 border-t border-state-crit/25 pt-3 text-[12px] text-ink-3">
              Cada intento fallido queda registrado en la auditoría, con la hora y el dispositivo.
            </p>
          </div>
        ) : entrando ? (
          /* PIN correcto. El teclado desaparece —ya no hay nada que teclear— y
             en su sitio queda el acuse: sello, a dónde se va y una barra que
             recorre mientras se abre. Que el teclado siga ahí, apagado, invita
             a volver a pulsar; y así es como se duplican las acciones. */
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-state-ok/40 bg-state-ok-bg/40 px-5 py-7 text-center">
            <span className="l2-sello grid size-12 place-content-center rounded-full bg-state-ok text-base">
              <Check size={26} className="text-on-brand" aria-hidden="true" strokeWidth={3} />
            </span>
            <p role="status" className="text-[13.5px] font-semibold text-ink">
              Adelante, {operador.nombre.split(" ")[0]}
            </p>
            <p className="text-[12.5px] text-ink-2">
              Abriendo {destino?.nombre ?? "tu puesto"}…
            </p>
            <span
              aria-hidden="true"
              className="mt-1 block h-0.5 w-32 overflow-hidden rounded-full bg-state-ok/20"
            >
              <span className="l2-recorre block h-full w-1/3 rounded-full bg-state-ok" />
            </span>
          </div>
        ) : (
          <>
            <NumericKeypad
              value={pin}
              onChange={setPin}
              maxLength={PIN_LENGTH}
              surface="pos"
              onSubmit={() => void intentar()}
              submitLabel="Entrar"
            />

            {enviando && (
              <p role="status" className="mt-4 text-center text-[12.5px] text-ink-3">
                Comprobando…
              </p>
            )}
            {rechazo && !enviando && (
              <p
                role="alert"
                className="mt-4 flex items-center justify-center gap-2 text-center text-[12.5px] text-state-warn"
              >
                <TriangleAlert size={14} aria-hidden="true" />
                {rechazo.intentosRestantes !== null && rechazo.intentosRestantes > 0
                  ? `PIN incorrecto · quedan ${rechazo.intentosRestantes} ${rechazo.intentosRestantes === 1 ? "intento" : "intentos"}`
                  : rechazo.mensaje}
              </p>
            )}
          </>
        )}

        <p className="mt-6 text-center text-[11.5px] text-ink-3">
          El PIN lo comprueba el servidor y nunca viaja en la URL ni aparece en un log. Cada intento
          queda registrado con la hora y el equipo.
        </p>
      </div>
    </div>
  );
}

/**
 * Un equipo que el servidor no conoce: pide su registro (F2-02). Queda PENDIENTE hasta que
 * administración lo apruebe en Panel → Personas → Dispositivos; hasta entonces, ningún PIN
 * sirve desde él.
 */
function PedirRegistro() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedir() {
    setEnviando(true);
    setError(null);
    const r = await solicitarRegistro(nombre).catch(() => null);
    setEnviando(false);
    if (!r) return setError("El servidor no respondió. Inténtalo de nuevo.");
    if (!r.ok) return setError(r.problemas?.[0]?.message ?? r.mensaje);
    router.refresh();
  }

  return (
    <div className="grid flex-1 place-content-center bg-base px-6">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-card">
        <MonitorSmartphone size={32} className="text-ink-2" aria-hidden="true" />
        <h1 className="font-display mt-4 text-2xl font-bold text-ink">Este equipo no está registrado</h1>
        <p className="mt-2 text-sm text-ink-2">
          El equipo es el primer factor de acceso: sin registrarlo, un PIN correcto tampoco sirve. Ponle
          un nombre que diga dónde está y pide el registro; administración lo aprueba desde el panel.
        </p>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void pedir();
          }}
        >
          <Input
            label="Nombre del equipo"
            surface="tablet"
            placeholder="Tablet taquilla"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={error ?? undefined}
            maxLength={40}
          />
          <Button type="submit" surface="tablet" variant="primary" disabled={enviando || nombre.trim().length < 2}>
            {enviando ? "Pidiendo…" : "Pedir registro"}
          </Button>
        </form>
      </div>
    </div>
  );
}
