"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CircleCheck, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { Button, cn, leerCodigo } from "@l2/ui";
import { crearDecodificador, type Decodificador } from "./decodificador";

/**
 * La pulsera leída con la cámara del teléfono — B4-5, V-2.
 *
 * Es una vista en línea, no una capa: la pantalla la pone donde estaba la espera del lector, y la
 * lista de lo leído sigue a la vista debajo. Cada código va al bus del lector (`leerCodigo`), así
 * que pasa por la misma validación que una lectura de teclado, y la pantalla responde igual.
 *
 * El error se ve (§8.2): sin cámara, sin permiso o sin conexión segura, lo dice con qué hacer. La
 * cámara se apaga al cerrarla, al salir de la pantalla y si el teléfono se bloquea.
 */

/** Entre dos miradas a la cámara: bastante para leer al pasar, poco para no calentar el teléfono. */
const CADA_MS = 180;
/** El mismo código seguido no vuelve a entrar hasta pasado esto: la pulsera sigue delante un rato. */
const MISMO_CODIGO_MS = 3_000;

type Estado =
  | { kind: "ABRIENDO" }
  | { kind: "LEYENDO"; tipo: Decodificador["tipo"] }
  | { kind: "ERROR"; mensaje: string };

/** Por qué no hay cámara, dicho para quien opera. */
function explicar(e: unknown): string {
  const nombre = e instanceof DOMException ? e.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError")
    return "El teléfono no dio permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio.";
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") return "Este equipo no tiene una cámara que se pueda usar.";
  if (nombre === "NotReadableError") return "Otra aplicación está usando la cámara. Ciérrala y vuelve a intentarlo.";
  return "No se pudo abrir la cámara. Vuelve a intentarlo o usa el lector.";
}

export function BotonCamara({ activa, onCambiar, className }: { activa: boolean; onCambiar: (activa: boolean) => void; className?: string }) {
  return (
    <Button
      type="button"
      surface="tablet"
      variant={activa ? "primary" : "neutral"}
      aria-pressed={activa}
      className={cn("shrink-0", className)}
      onClick={() => onCambiar(!activa)}
    >
      <Camera size={18} aria-hidden="true" />
      {activa ? "Cámara abierta" : "Cámara"}
    </Button>
  );
}

export function LectorCamara({ onCerrar, className }: { onCerrar: () => void; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<Estado>({ kind: "ABRIENDO" });
  const [ultimo, setUltimo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let temporizador: number | null = null;
    const previo = { codigo: "", en: 0 };

    const apagar = () => {
      if (temporizador !== null) window.clearTimeout(temporizador);
      temporizador = null;
      flujo?.getTracks().forEach((t) => t.stop());
      flujo = null;
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setEstado({ kind: "ERROR", mensaje: "La cámara necesita una conexión segura (HTTPS), que llega con el servidor del local. Mientras tanto, usa el lector." });
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (vivo) setEstado({ kind: "ERROR", mensaje: explicar(e) });
        return;
      }
      if (!vivo || !video.current) {
        apagar();
        return;
      }
      video.current.srcObject = flujo;
      await video.current.play().catch(() => undefined);
      let decodificador: Decodificador;
      try {
        decodificador = await crearDecodificador();
      } catch {
        if (vivo) setEstado({ kind: "ERROR", mensaje: "Este navegador no sabe leer códigos con la cámara. Usa el lector." });
        apagar();
        return;
      }
      if (!vivo) return apagar();
      setEstado({ kind: "LEYENDO", tipo: decodificador.tipo });

      const mirar = async () => {
        if (!vivo || !video.current) return;
        const codigo = await decodificador.leer(video.current).catch(() => null);
        const ahora = Date.now();
        if (codigo && !(codigo === previo.codigo && ahora - previo.en < MISMO_CODIGO_MS)) {
          previo.codigo = codigo;
          previo.en = ahora;
          if (leerCodigo(codigo)) {
            setUltimo(codigo.trim().toUpperCase());
            navigator.vibrate?.(60);
          }
        } else if (codigo === previo.codigo) {
          previo.en = ahora;
        }
        if (vivo) temporizador = window.setTimeout(() => void mirar(), CADA_MS);
      };
      void mirar();
    })();

    // Con el teléfono bloqueado o en otra aplicación, la cámara se suelta y el aviso lo dice.
    const alOcultar = () => {
      if (document.visibilityState === "hidden") onCerrar();
    };
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      vivo = false;
      apagar();
      document.removeEventListener("visibilitychange", alOcultar);
    };
    // Se abre una vez por montaje; cerrar es desmontar.
  }, []);

  return (
    <section
      aria-label="Lector con la cámara"
      className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-base", className)}
    >
      <div className="relative min-h-0 flex-1">
        {/* El vídeo no lleva audio ni subtítulos: es la vista de la cámara. */}
        <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover" aria-hidden="true" />
        {estado.kind === "LEYENDO" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[42%] -translate-y-1/2 rounded-[var(--radius-card)] border-2 border-brand" />
        )}
        {estado.kind !== "LEYENDO" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface px-5 text-center">
            {estado.kind === "ABRIENDO" ? (
              <>
                <LoaderCircle size={22} className="animate-spin text-ink-2" aria-hidden="true" />
                <p className="text-[14px] text-ink-2">Abriendo la cámara…</p>
              </>
            ) : (
              <>
                <CameraOff size={22} className="text-state-crit" aria-hidden="true" />
                <p role="alert" className="text-[14px] font-medium text-state-crit">
                  {estado.mensaje}
                </p>
              </>
            )}
          </div>
        )}
        <Button
          type="button"
          surface="tablet"
          variant="neutral"
          aria-label="Cerrar la cámara"
          className="absolute top-2 right-2 bg-surface/90 px-0"
          onClick={onCerrar}
        >
          <X size={20} aria-hidden="true" />
        </Button>
      </div>
      <p role="status" className="flex min-h-10 items-center gap-2 border-t border-line bg-surface px-3 text-[13px]">
        {ultimo ? (
          <>
            <CircleCheck size={16} className="shrink-0 text-state-ok" aria-hidden="true" />
            <span className="text-ink">
              Leída <span className="tnum font-semibold">{ultimo}</span>
            </span>
          </>
        ) : estado.kind === "LEYENDO" ? (
          <>
            <Camera size={16} className="shrink-0 text-brand" aria-hidden="true" />
            <span className="text-ink-2">Apunta a la pulsera dentro del recuadro</span>
          </>
        ) : estado.kind === "ERROR" ? (
          <>
            <TriangleAlert size={16} className="shrink-0 text-state-crit" aria-hidden="true" />
            <span className="text-ink-2">Sin cámara: el lector sigue funcionando</span>
          </>
        ) : (
          <span className="text-ink-3">Pidiendo permiso a la cámara…</span>
        )}
        {estado.kind === "LEYENDO" && (
          <span className="ml-auto text-[11px] text-ink-3" data-lector={estado.tipo}>
            {estado.tipo === "NATIVO" ? "Lector del teléfono" : "Lector de respaldo"}
          </span>
        )}
      </p>
    </section>
  );
}
