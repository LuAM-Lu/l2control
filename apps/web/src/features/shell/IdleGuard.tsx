"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TimerReset } from "lucide-react";
import { computeIdle, type IdlePolicy, type IdleState } from "@l2/domain-identity";

/**
 * Bloqueo por inactividad de las estaciones — F2-12, DEC-17, §9.10.5.
 *
 * «Un puesto desatendido con la sesión de la cajera abierta es una anulación
 * esperando a ocurrir.» Pasado el plazo sin que nadie toque la pantalla, el
 * equipo vuelve al acceso por PIN. Antes avisa, con la cuenta atrás en
 * palabras: un bloqueo sin aviso a mitad de un cobro se siente como un fallo.
 *
 * Lo que cuenta como actividad es tocar, pulsar una tecla o desplazar. Mover
 * el ratón por encima NO: en un mostrador, alguien que pasa rozando el ratón
 * no está atendiendo el puesto.
 *
 * La regla —cuándo avisar, cuándo bloquear— es del dominio y está probada
 * allí. Aquí solo se escuchan los eventos y se pinta el aviso.
 */

/**
 * Política por superficie. El monitor de sala es una pantalla de pared que
 * se mira y no se toca: bloquearlo lo dejaría en negro delante de todos.
 */
const POR_SUPERFICIE: Readonly<Record<string, IdlePolicy>> = {
  "/monitor": { kind: "SIN_BLOQUEO" },
};

const EVENTOS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * `?inactividad=N` acorta el plazo a N segundos, para enseñarlo en una demo o
 * probarlo sin esperar tres minutos. Solo puede ACORTARLO: un parámetro en la
 * URL que alargara el bloqueo sería una forma trivial de desactivarlo.
 */
function conAjusteDeUrl(base: IdlePolicy): IdlePolicy {
  if (base.kind !== "BLOQUEO" || typeof window === "undefined") return base;
  const n = Number.parseInt(new URLSearchParams(window.location.search).get("inactividad") ?? "", 10);
  if (!Number.isFinite(n) || n <= 1 || n >= base.afterSeconds) return base;
  return { kind: "BLOQUEO", afterSeconds: n, warnSeconds: Math.min(base.warnSeconds, Math.floor(n / 2)) };
}

export function IdleGuard({ politica, usuario }: { politica: IdlePolicy; usuario: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const ultima = useRef(0);
  const [estado, setEstado] = useState<IdleState>({ state: "ACTIVO" });

  const efectiva = POR_SUPERFICIE[pathname] ?? politica;
  // Dependencias primitivas: un objeto nuevo en cada render reiniciaría el
  // contador sin que nadie hubiera tocado nada.
  const clave =
    efectiva.kind === "BLOQUEO"
      ? `${efectiva.afterSeconds}/${efectiva.warnSeconds}`
      : "sin-bloqueo";

  useEffect(() => {
    setEstado({ state: "ACTIVO" });
    if (pathname === "/acceso" || efectiva.kind === "SIN_BLOQUEO") return;

    const aplicada = conAjusteDeUrl(efectiva);
    ultima.current = Date.now();
    const tocar = () => {
      ultima.current = Date.now();
    };
    for (const e of EVENTOS) window.addEventListener(e, tocar, { passive: true });

    const id = window.setInterval(() => {
      const s = computeIdle(ultima.current, Date.now(), aplicada);
      setEstado((prev) =>
        prev.state === s.state &&
        (s.state !== "AVISO" || (prev.state === "AVISO" && prev.secondsToLock === s.secondsToLock))
          ? prev
          : s,
      );
      if (s.state === "BLOQUEADO") {
        window.clearInterval(id);
        router.replace("/acceso");
      }
    }, 1000);

    return () => {
      window.clearInterval(id);
      for (const e of EVENTOS) window.removeEventListener(e, tocar);
    };
    // `efectiva` se representa por `clave`; incluir el objeto reiniciaría el
    // contador en cada render.
  }, [pathname, clave, router]);

  if (estado.state !== "AVISO") return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="l2-entra fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-card)] border border-state-warn/50 bg-state-warn-bg px-4 py-3 shadow-lift sm:inset-x-6 sm:bottom-6"
    >
      <TimerReset size={20} className="shrink-0 text-state-warn" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[14px] text-ink">
        Sin actividad. La sesión de <strong>{usuario.split(" ")[0]}</strong> se bloquea en{" "}
        <span className="tnum font-semibold text-state-warn">{estado.secondsToLock} s</span>.
      </p>
      {/* Tocar en cualquier parte ya cuenta como actividad; el botón está para
          que quede claro qué hacer. */}
      <button
        type="button"
        className="min-h-11 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-state-warn/50 px-4 text-[13.5px] font-semibold text-ink transition-colors hover:bg-state-warn/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Seguir aquí
      </button>
    </div>
  );
}
