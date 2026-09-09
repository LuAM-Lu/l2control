import { AppShell } from "../src/features/shell/AppShell";

/**
 * Puerta de entrada: navegación por rol (F2-05).
 *
 * Sustituye al índice temporal de superficies. Lo que cada persona ve sale de
 * la matriz de permisos de §7.3, no de una lista por pantalla: así, añadir un
 * rol no obliga a recordar catorce sitios donde actualizarlo.
 */
export default function Home() {
  return <AppShell />;
}
