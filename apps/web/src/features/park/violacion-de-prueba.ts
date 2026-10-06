/**
 * Violación a propósito (T-2, B0-4): este archivo existe solo para ver el CI en rojo.
 * La rama `prueba/ci-en-rojo` no se fusiona.
 */
export function guardarSalaEnElNavegador(ninos: readonly string[]): void {
  window.localStorage.setItem("l2.sala", JSON.stringify(ninos));
}
