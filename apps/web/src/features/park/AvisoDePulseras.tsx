"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlarmClock, BellOff, TimerReset, X } from "lucide-react";
import type { AvisosDeSalaDto } from "@l2/contracts";
import { instantesDeAviso } from "@l2/domain-park";
import { Button, TAMANO_ICONO, cn } from "@l2/ui";
import { useOperador } from "../identity/operador.ts";
import { useAhoraDeLaSala, useSala } from "./SalaProvider.tsx";
import { toParkSession, toParkTerms } from "./mappers.ts";
import { avisosDeSalaDelEquipo } from "./parque.acciones";
import { SILENCIO_MS, prepararSonido, sonar, useSilencioHasta, useSonidoDeAvisos } from "./sonidoDeAvisos.ts";

/**
 * Aviso de pulseras por vencer (B4-15, M-34, S-10).
 *
 * En las pantallas del parque y en la caja: uno por niño al entrar en «por vencer» (el aviso del tarifario con que
 * entró) y otro al cumplirse su tiempo, con sonido y, en Android, vibración. Un toque lleva a su ficha. Funciona con la
 * app abierta: no es una notificación del sistema.
 *
 * Con el equipo bloqueado (DEC-17), la pantalla del PIN de un equipo aprobado sigue avisando, solo con la pulsera y los
 * minutos, sin nombres: lee lo suyo sin sesión al abrirse y al volver a verse. Un toque pide el PIN y lleva al niño.
 *
 * Cuándo avisa lo deciden los dos instantes de cada estancia (`instantesDeAviso`, del dominio), contra la hora del
 * servidor: no hay sondeo. Lo que ya pasó cuando se abre la pantalla no suena (la sala ya lo enseña en rojo); lo que
 * llega mientras está abierta, sí.
 */

type Item = Readonly<{ codigo: string; nombre: string | null; porVencer: number; vence: number }>;
type Aviso = Readonly<{ id: number; codigo: string; nombre: string | null; nivel: 1 | 2; minutos: number }>;

/** Dónde avisa: el parque (y sus enlaces de antes), la caja y la pantalla del PIN. */
const RUTAS = ["/monitor", "/entrada", "/salida", "/caja"];
const MAX_A_LA_VISTA = 4;

const nivelEn = (i: Item, ahora: number): 0 | 1 | 2 => (ahora >= i.vence ? 2 : ahora >= i.porVencer ? 1 : 0);

export function AvisoDePulseras() {
  const pathname = usePathname();
  const router = useRouter();
  const operador = useOperador();
  const { sala } = useSala();
  const ahoraSala = useAhoraDeLaSala(1000);
  const [sonido] = useSonidoDeAvisos();
  const [silencioHasta, silenciar] = useSilencioHasta();
  // Sin sesión (el PIN tras el bloqueo, o una sesión que se cerró en otro sitio): lo del equipo, sin nombres.
  const sinSesion = pathname === "/acceso" || operador === null;
  const activo = pathname === "/acceso" || RUTAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  useEffect(() => prepararSonido(), []);

  // La pantalla del PIN: lo del equipo, sin sesión, al abrirse y al volver a verse.
  const [delEquipo, setDelEquipo] = useState<{ dto: AvisosDeSalaDto; desfase: number } | null>(null);
  useEffect(() => {
    if (!sinSesion || !activo) return;
    let vivo = true;
    const leer = () =>
      void avisosDeSalaDelEquipo()
        .then((r) => {
          if (vivo && r.ok) setDelEquipo({ dto: r.valor, desfase: Date.parse(r.valor.serverNow) - Date.now() });
        })
        .catch(() => undefined);
    leer();
    const alVolver = () => {
      if (document.visibilityState === "visible") leer();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sinSesion, activo]);

  // La hora: con sesión, la de la sala; en el PIN, la del equipo corregida con la del servidor.
  const [ahoraLocal, setAhoraLocal] = useState(0);
  useEffect(() => {
    if (!sinSesion || !delEquipo) return;
    const latir = () => setAhoraLocal(Date.now() + delEquipo.desfase);
    latir();
    const id = window.setInterval(latir, 1000);
    return () => window.clearInterval(id);
  }, [sinSesion, delEquipo]);
  const ahora = sinSesion ? ahoraLocal : ahoraSala;

  const items = useMemo((): Item[] => {
    if (sinSesion) {
      return (delEquipo?.dto.pulseras ?? []).map((p) => ({ codigo: p.codigo, nombre: null, porVencer: Date.parse(p.porVencer), vence: Date.parse(p.vence) }));
    }
    if (!sala) return [];
    return sala.sessions.flatMap((dto) => {
      const s = toParkSession(dto);
      const a = instantesDeAviso(s, toParkTerms(dto.terms));
      return a ? [{ codigo: s.wristbandCode, nombre: s.childNickname ?? s.childName ?? null, porVencer: a.porVencer, vence: a.vence }] : [];
    });
  }, [sinSesion, delEquipo, sala]);

  // Lo ya avisado de cada pulsera: no se repite al bloquearse ni al cambiar de pantalla.
  const avisado = useRef(new Map<string, 0 | 1 | 2>());
  const iniciado = useRef(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(0);
  useEffect(() => {
    if (!activo || ahora <= 0) return;
    // La primera vez, lo que ya pasó no suena: la sala lo enseña.
    if (!iniciado.current) {
      if (items.length === 0) return;
      for (const i of items) avisado.current.set(i.codigo, nivelEn(i, ahora));
      iniciado.current = true;
      return;
    }
    const nuevos: Aviso[] = [];
    for (const i of items) {
      const nivel = nivelEn(i, ahora);
      if (nivel > (avisado.current.get(i.codigo) ?? 0)) {
        avisado.current.set(i.codigo, nivel);
        nuevos.push({ id: ++siguiente.current, codigo: i.codigo, nombre: i.nombre, nivel: nivel as 1 | 2, minutos: Math.max(0, Math.ceil((i.vence - ahora) / 60_000)) });
      }
    }
    if (nuevos.length === 0) return;
    setAvisos((a) => [...nuevos.reverse(), ...a].slice(0, MAX_A_LA_VISTA));
    if (sonido && Date.now() >= silencioHasta) sonar(nuevos.some((n) => n.nivel === 2));
  }, [activo, ahora, items, sonido, silencioHasta]);

  // Lo que ya salió de la sala no sigue avisando.
  useEffect(() => {
    const codigos = new Set(items.map((i) => i.codigo));
    setAvisos((a) => (a.some((x) => !codigos.has(x.codigo)) && items.length > 0 ? a.filter((x) => codigos.has(x.codigo)) : a));
  }, [items]);

  if (!activo || avisos.length === 0) return null;

  const callado = Date.now() < silencioHasta;
  const ir = (a: Aviso) => {
    setAvisos((l) => l.filter((x) => x.id !== a.id));
    // Bloqueado: el PIN primero; después, el niño. Una navegación entera: el acceso arranca limpio con la pulsera pedida.
    if (sinSesion) window.location.assign(`/acceso?pulsera=${encodeURIComponent(a.codigo)}`);
    else router.push(`/monitor?pulsera=${encodeURIComponent(a.codigo)}`);
  };

  return (
    <section
      aria-label="Avisos de pulseras"
      className={cn(
        "pointer-events-none fixed inset-x-3 z-50 flex flex-col gap-2 sm:w-[26rem]",
        // En el PIN, abajo a la izquierda, bajo el reloj: el teclado queda libre. En el puesto, arriba a la derecha.
        pathname === "/acceso" ? "top-3 items-start sm:top-auto sm:right-auto sm:bottom-24 sm:left-6" : "top-[76px] items-end sm:left-auto",
      )}
    >
      {avisos.map((a) => {
        const urgente = a.nivel === 2;
        const quien = sinSesion || !a.nombre ? `Pulsera ${a.codigo}` : `${a.nombre} · ${a.codigo}`;
        return (
          <div
            key={a.id}
            role="alert"
            className={cn(
              "l2-entra pointer-events-auto flex w-full items-center gap-2 rounded-[var(--radius-card)] border px-3 py-2 shadow-lift",
              urgente ? "border-state-crit/60 bg-state-crit-bg" : "border-state-warn/60 bg-state-warn-bg",
            )}
          >
            <button type="button" onClick={() => ir(a)} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
              {urgente ? (
                <AlarmClock size={TAMANO_ICONO.tablet} className="shrink-0 text-state-crit" aria-hidden="true" />
              ) : (
                <TimerReset size={TAMANO_ICONO.tablet} className="shrink-0 text-state-warn" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block text-cuerpo font-semibold text-ink">{urgente ? "Se cumplió su tiempo" : `Por vencer: quedan ${a.minutos} min`}</span>
                <span className="tnum block text-detalle break-words text-ink-2">
                  {quien} · {sinSesion ? "toca para entrar y verlo" : "toca para ver su ficha"}
                </span>
              </span>
            </button>
            {!callado && (
              <Button variant="ghost" surface="tablet" aria-label={`Silenciar los avisos de este equipo ${SILENCIO_MS / 60_000} minutos`} onClick={() => silenciar(Date.now() + SILENCIO_MS)}>
                <BellOff size={TAMANO_ICONO.texto} aria-hidden="true" />
              </Button>
            )}
            <Button variant="ghost" surface="tablet" aria-label="Cerrar el aviso" onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))}>
              <X size={TAMANO_ICONO.texto} aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </section>
  );
}
