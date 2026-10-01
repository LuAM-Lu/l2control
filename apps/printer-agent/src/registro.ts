/**
 * Lo que va diciendo el agente. En consola, a la vista; instalado como tarea de Windows no hay consola,
 * así que también va a `agente.log`, junto a su configuración. El archivo no crece sin fin: pasado
 * 1 MB se guarda como `agente.log.1` (el anterior se pierde) y se empieza otro.
 *
 * Nunca se escribe la credencial ni el código de vinculación.
 */
import { appendFileSync, existsSync, renameSync, statSync } from "node:fs";

export type Registro = Readonly<{ info: (m: string) => void; error: (m: string) => void }>;

const TOPE_BYTES = 1_000_000;

const hora = () => {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
};

export function crearRegistro(o: { archivo?: string | null; consola?: boolean } = {}): Registro {
  const consola = o.consola ?? true;
  const escribir = (nivel: "info" | "error", m: string) => {
    const linea = `${hora()}  ${nivel === "error" ? "! " : ""}${m}`;
    if (consola) (nivel === "error" ? console.error : console.log)(linea);
    if (!o.archivo) return;
    try {
      if (existsSync(o.archivo) && statSync(o.archivo).size > TOPE_BYTES) renameSync(o.archivo, `${o.archivo}.1`);
      appendFileSync(o.archivo, `${linea}\n`, "utf8");
    } catch {
      // Sin poder escribir el registro, el agente sigue imprimiendo: no es motivo para pararse.
    }
  };
  return { info: (m) => escribir("info", m), error: (m) => escribir("error", m) };
}
