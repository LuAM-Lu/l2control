"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LogOut, ShieldX } from "lucide-react";
import { Button } from "@l2/ui";
import { cerrarSesion, useOperador, type OperadorEnSesion } from "./operador.ts";
import { useAjustes } from "./accesos.ts";
import { actorDe, puestoDe } from "./visibilidad.ts";

/**
 * La guardia de cada pantalla — regla 4 de UX-MEJORAS §3: la dirección no es
 * una puerta.
 *
 * Tres casos, y ninguno enseña la pantalla pedida por debajo:
 *  · todavía no se sabe quién es (el primer pintado, antes de leer la sesión):
 *    no se pinta nada, para no destellar ni la pantalla ni el rechazo;
 *  · nadie entró en este equipo → a identificarse;
 *  · quien entró no tiene ese puesto → se dice qué pantalla es, se ofrece ir a
 *    su puesto o cambiar de usuario.
 *
 * ⚠ Experiencia de usuario, no seguridad. La puerta de verdad es del servidor.
 */

const noop = () => () => {};
function useHidratado(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function GuardiaAcceso({
  permitido,
  destino,
  children,
}: {
  /** Si la persona con sesión puede abrir esta pantalla. */
  permitido: (o: OperadorEnSesion) => boolean;
  /** Cómo se llama lo que se intentó abrir: «la caja», «Usuarios y permisos». */
  destino: string;
  children: React.ReactNode;
}) {
  const hidratado = useHidratado();
  const operador = useOperador();

  if (!hidratado) return <div className="flex-1" aria-busy="true" />;
  if (!operador) return <SinSesion destino={destino} />;
  if (!permitido(operador)) return <SinAcceso operador={operador} destino={destino} />;
  return <>{children}</>;
}

/** «a» + «el panel» se contrae en «al panel». */
function conPreposicion(destino: string): string {
  return destino.startsWith("el ") ? `al ${destino.slice(3)}` : `a ${destino}`;
}

function Marco({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-content-center px-6 py-12">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-content-center rounded-[var(--radius-card)] border border-line bg-surface text-ink-2">
          {icono}
        </span>
        {children}
      </div>
    </div>
  );
}

function SinSesion({ destino }: { destino: string }) {
  return (
    <Marco icono={<KeyRound size={24} aria-hidden="true" />}>
      <h1 className="font-display text-2xl font-bold text-ink">Nadie ha entrado en este equipo</h1>
      <p className="text-[15px] text-ink-2">
        Para abrir {destino}, identifícate con tu PIN. Así lo que hagas queda a tu nombre.
      </p>
      <Link
        href="/acceso"
        className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] bg-brand px-5 font-semibold text-on-brand no-underline transition-colors hover:bg-brand-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Ir al acceso
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </Marco>
  );
}

function SinAcceso({ operador, destino }: { operador: OperadorEnSesion; destino: string }) {
  const router = useRouter();
  const ajustes = useAjustes();
  const puesto = puestoDe(actorDe(operador, ajustes));
  return (
    <Marco icono={<ShieldX size={24} aria-hidden="true" className="text-state-warn" />}>
      <h1 className="font-display text-2xl font-bold text-ink">
        {operador.rol} no tiene acceso {conPreposicion(destino)}
      </h1>
      <p className="text-[15px] text-ink-2">
        La sesión es de <strong className="text-ink">{operador.nombre}</strong>. Si esta pantalla le toca a otra
        persona, que entre con su PIN. Si crees que deberías verla, lo concede la administración en Usuarios y
        permisos.
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        {puesto.ruta !== "/acceso" && (
          <Button variant="primary" className="flex-1" onClick={() => router.push(puesto.ruta)}>
            Ir {conPreposicion(puesto.nombre)}
          </Button>
        )}
        <Button
          variant="neutral"
          className="flex-1"
          onClick={() => {
            cerrarSesion();
            router.push("/acceso");
          }}
        >
          <LogOut size={16} aria-hidden="true" />
          Cambiar de usuario
        </Button>
      </div>
    </Marco>
  );
}
