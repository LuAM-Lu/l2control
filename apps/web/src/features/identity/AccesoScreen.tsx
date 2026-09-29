"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Lock,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { checkDevice, describeLockout, type Device, type LockoutState, type Role } from "@l2/domain-identity";
import { aprobarEsteEquipo, entrar, renovarSolicitud, solicitarRegistro } from "./acceso.acciones";
import { puestoDe } from "./visibilidad.ts";
import { esRutaDeEstacion, pedirPantallaCompleta } from "../shell/pantallaCompleta.ts";
import { RotuloVersion } from "../shell/RotuloVersion.tsx";
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
  pendiente = null,
}: {
  /** `null` = equipo desconocido: la pantalla ofrece pedir su registro. */
  device: Device | null;
  operadores: readonly Operador[];
  /** Solo si el equipo espera aprobación: su código de emparejamiento y si la solicitud caducó (M-7). */
  pendiente?: { codigo: string; caducada: boolean } | null;
}) {
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
      // Quién está en cada puesto lo dice la sesión que acaba de abrir el servidor (F9-08, B5-1).
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

  // Sin registrar y pendiente son el MISMO componente: al registrarse, el servidor repinta el
  // acceso como pendiente, y así el formulario conserva lo que estaba haciendo (y su error).
  if (!revision.ok && (device === null || (device.status === "PENDIENTE" && pendiente))) {
    return <AltaDeEquipo nombreEquipo={device?.label ?? null} pendiente={device ? pendiente : null} />;
  }

  if (!revision.ok) {
    return (
      <PantallaAcceso
        estado={
          <Badge tone="crit" icon={<ShieldAlert size={13} aria-hidden="true" />}>
            {device?.label ?? "Este equipo"} · no autorizado
          </Badge>
        }
      >
        <div className="max-w-md rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-8">
          <ShieldAlert size={32} className="text-state-crit" aria-hidden="true" />
          <h1 className="font-display mt-4 text-2xl font-bold text-ink">Este equipo no puede entrar</h1>
          <p className="mt-3 text-sm text-ink-2">{revision.message}</p>
          <p className="mt-5 border-t border-state-crit/25 pt-4 text-[12.5px] text-ink-3">
            El equipo es el primer factor de acceso. Sin él, un PIN correcto tampoco sirve: un PIN visto por encima del
            hombro no abre nada desde otro aparato.
          </p>
        </div>
      </PantallaAcceso>
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
      <PantallaAcceso
        estado={
          <Badge tone="ok" icon={<MonitorSmartphone size={13} aria-hidden="true" />}>
            {device!.label} · autorizado
          </Badge>
        }
        extra={
          installPrompt && (
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
          )
        }
      >
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
                    <span className="font-display block truncate text-[17px] font-bold text-ink">{o.nombre}</span>
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
      </PantallaAcceso>
    );
  }

  /* ------------------------------------------------------- el PIN */

  return (
    <PantallaAcceso
      estado={
        <Badge tone="ok" icon={<MonitorSmartphone size={13} aria-hidden="true" />}>
          {device!.label} · autorizado
        </Badge>
      }
    >
      {/* La tarjeta entra desde abajo: el salto de «¿Quién entra?» al teclado
          es un paso adelante, y verlo llegar evita el corte seco. */}
      <div className="l2-entra mx-auto w-full max-w-xs">
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
    </PantallaAcceso>
  );
}

/**
 * La estructura de TODO el acceso (T-3): a la izquierda, la marca —el producto, el local, la hora
 * y el estado del equipo—; a la derecha, lo que hay que hacer. Un equipo compartido pasa buena
 * parte del día aquí: es su pantalla de bloqueo, y es lo primero que ve quien estrena un equipo.
 * En vertical (tablet o móvil) la marca se vuelve una franja arriba y la tarea queda debajo.
 */
function PantallaAcceso({ estado, extra, children }: { estado: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid flex-1 grid-rows-[auto_minmax(0,1fr)] bg-base lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      <PanelMarca estado={estado} extra={extra} />
      <section className="flex flex-col justify-center px-6 py-8 lg:px-14 lg:py-10">{children}</section>
    </div>
  );
}

function PanelMarca({ estado, extra }: { estado: ReactNode; extra?: ReactNode }) {
  // Reloj de la pantalla de bloqueo. Se arranca en el cliente para no chocar con la hora del
  // servidor al hidratar. Es solo presentación: el instante que cuenta para cobrar sigue viniendo
  // del servidor (ADR-010).
  const [reloj, setReloj] = useState<number | null>(null);
  useEffect(() => {
    setReloj(Date.now());
    const id = setInterval(() => setReloj(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const hora = reloj === null ? null : FORMATO_HORA.format(reloj);
  const fecha = reloj === null ? null : FORMATO_FECHA.format(reloj);

  return (
    <section
      aria-label="L2 Control"
      className="relative flex flex-col justify-between gap-6 overflow-hidden border-b border-line bg-surface/40 px-6 py-6 lg:gap-10 lg:border-r lg:border-b-0 lg:px-12 lg:py-14"
    >
      {/* Un halo del color de la marca, detrás de todo: da presencia sin competir con la hora. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 size-[28rem] rounded-full bg-brand/8 blur-3xl"
      />

      <div className="relative flex items-center gap-4">
        <span className="font-display grid size-14 shrink-0 place-content-center rounded-[0.9rem] bg-brand text-xl font-bold text-on-brand shadow-lift lg:size-16 lg:text-2xl">
          L2
        </span>
        <span className="min-w-0">
          <span className="font-display block text-2xl leading-tight font-bold tracking-tight text-ink lg:text-[2rem]">
            L2 Control
          </span>
          <span className="block text-[13px] text-ink-2 lg:text-[14px]">Abby Kingdom · Parque y restaurante</span>
        </span>
      </div>

      <div className="relative flex items-baseline gap-4 lg:block">
        <p className="tnum font-display text-5xl leading-none font-bold tracking-tight text-ink lg:text-[clamp(4rem,9vw,7rem)]">
          {hora ?? "--:--"}
        </p>
        <p className="text-[15px] text-ink-2 first-letter:uppercase lg:mt-3 lg:text-lg">{fecha ?? " "}</p>
      </div>

      <div className="relative flex flex-wrap items-center gap-3">
        {estado}
        {extra}
        <RotuloVersion className="basis-full" />
      </div>
    </section>
  );
}

/**
 * El alta de un equipo (F2-02, M-7, T-3): sin registrar, pide su registro; pendiente, enseña su
 * código de emparejamiento, que quien aprueba compara en Panel → Ajustes → Dispositivos. Nunca
 * enseña nombres de personas: el equipo aún no es de confianza.
 *
 * «Soy de administración» está desde la primera pantalla: quien estrena el primer equipo de un
 * local, o sustituye uno perdido, lo registra y lo aprueba de una vez con su contraseña y su código.
 * Son dos pasos del servidor (pedir y aprobar); si el segundo falla, el equipo queda pendiente, el
 * error se ve aquí y el siguiente intento solo aprueba.
 */
function AltaDeEquipo({
  nombreEquipo,
  pendiente,
}: {
  nombreEquipo: string | null;
  pendiente: { codigo: string; caducada: boolean } | null;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [comoAdmin, setComoAdmin] = useState(false);
  const [contrasena, setContrasena] = useState("");
  const [totp, setTotp] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAprobar, setErrorAprobar] = useState<string | null>(null);
  const registrado = nombreEquipo !== null;

  async function aprobar(): Promise<boolean> {
    const a = await aprobarEsteEquipo(contrasena, totp).catch(() => null);
    if (a?.ok) return true;
    // Se vacían los dos: una contraseña mala oculta tras los puntos haría fallar el siguiente
    // intento, y cada fallo acerca el bloqueo del equipo.
    setContrasena("");
    setTotp("");
    setErrorAprobar(!a ? "El servidor no respondió al aprobarlo. Inténtalo de nuevo." : a.mensaje);
    return false;
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    setErrorAprobar(null);
    if (!registrado) {
      const r = await solicitarRegistro(nombre).catch(() => null);
      if (!r || !r.ok) {
        setEnviando(false);
        return setError(!r ? "El servidor no respondió. Inténtalo de nuevo." : (r.problemas?.[0]?.message ?? r.mensaje));
      }
    }
    const listo = comoAdmin ? await aprobar() : true;
    setEnviando(false);
    if (listo) router.refresh();
  }

  async function renovar() {
    setEnviando(true);
    setError(null);
    const r = await renovarSolicitud().catch(() => null);
    setEnviando(false);
    if (!r) return setError("El servidor no respondió. Inténtalo de nuevo.");
    if (!r.ok) return setError(r.mensaje);
    router.refresh();
  }

  const credencialesListas = contrasena.length > 0 && totp.length === 6;
  const puedeEnviar = registrado ? comoAdmin && credencialesListas : nombre.trim().length >= 2 && (!comoAdmin || credencialesListas);

  const credenciales = comoAdmin && (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line bg-surface/60 p-3">
      <p className="text-[12.5px] text-ink-2">Con tu contraseña y el código de tu autenticador. Queda en la auditoría a tu nombre.</p>
      <Input
        label="Contraseña"
        surface="tablet"
        type="password"
        autoComplete="current-password"
        value={contrasena}
        onChange={(e) => setContrasena(e.target.value)}
      />
      <Input
        label="Código del autenticador"
        surface="tablet"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={totp}
        onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        error={errorAprobar ?? undefined}
      />
    </div>
  );

  const quienAprueba = (
    <div role="radiogroup" aria-label="Quién lo aprueba" className="grid grid-cols-2 gap-2">
      {(
        [
          [false, registrado ? "Lo aprueban" : "Pedir aprobación", "Desde el panel"],
          [true, "Soy de administración", "Lo apruebo ahora"],
        ] as const
      ).map(([valor, titulo, detalle]) => (
        <button
          key={titulo}
          type="button"
          role="radio"
          aria-checked={comoAdmin === valor}
          onClick={() => {
            setComoAdmin(valor);
            setErrorAprobar(null);
          }}
          className={cn(
            "flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 text-left",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            comoAdmin === valor ? "border-brand bg-brand/12 text-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
          )}
        >
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            {valor && <ShieldCheck size={14} aria-hidden="true" />}
            {titulo}
          </span>
          <span className="text-[12px] text-ink-3">{detalle}</span>
        </button>
      ))}
    </div>
  );

  return (
    <PantallaAcceso
      estado={
        <Badge tone="warn" icon={<MonitorSmartphone size={13} aria-hidden="true" />}>
          {registrado ? `${nombreEquipo} · esperando aprobación` : "Equipo sin registrar"}
        </Badge>
      }
    >
      <form
        className="mx-auto flex w-full max-w-md flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <h1 className="font-display text-3xl font-bold text-ink">
          {registrado ? "Este equipo espera su aprobación" : "Registrar este equipo"}
        </h1>
        <p className="text-[14.5px] text-ink-2">
          {registrado
            ? `«${nombreEquipo}» pidió su registro. Hasta que lo aprueben, ningún PIN sirve desde aquí: el equipo es el primer factor de acceso.`
            : "El equipo es el primer factor de acceso: sin registrarlo, un PIN correcto tampoco sirve. Ponle un nombre que diga dónde está."}
        </p>

        {registrado ? (
          <div className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 text-center">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Código de este equipo</p>
            <p className="tnum mt-1 font-mono text-3xl font-bold tracking-[0.18em] text-ink">{pendiente?.codigo}</p>
          </div>
        ) : (
          <Input
            label="Nombre del equipo"
            surface="tablet"
            placeholder="Tablet taquilla"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={error ?? undefined}
            maxLength={40}
          />
        )}

        {registrado && pendiente?.caducada ? (
          <>
            <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-state-warn-bg p-3 text-[13px] text-state-warn">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              La solicitud caducó: pasaron más de 24 horas sin aprobarla. Renuévala y pide que la aprueben.
            </p>
            {error && (
              <p role="alert" className="text-[13px] text-state-crit">
                {error}
              </p>
            )}
            <Button type="button" surface="tablet" variant="primary" onClick={renovar} disabled={enviando}>
              <RefreshCw size={16} aria-hidden="true" />
              {enviando ? "Renovando…" : "Renovar la solicitud"}
            </Button>
          </>
        ) : (
          <>
            {quienAprueba}
            {credenciales}
            {registrado && !comoAdmin ? (
              <Button type="button" surface="tablet" variant="ghost" onClick={() => router.refresh()}>
                <RefreshCw size={16} aria-hidden="true" />
                Ya lo aprobaron
              </Button>
            ) : (
              <Button type="submit" surface="tablet" variant="primary" disabled={enviando || !puedeEnviar}>
                {enviando ? "Comprobando…" : registrado ? "Aprobar este equipo" : comoAdmin ? "Registrar y aprobar" : "Pedir registro"}
              </Button>
            )}
            <p className="text-[12.5px] text-ink-3">
              {registrado
                ? "Desde un equipo ya aprobado: Panel → Ajustes → Dispositivos, comprobando que el código coincide."
                : "Después verás el código del equipo: quien lo apruebe lo compara en Panel → Ajustes → Dispositivos."}
            </p>
          </>
        )}
      </form>
    </PantallaAcceso>
  );
}
