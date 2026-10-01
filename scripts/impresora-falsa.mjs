/**
 * Una impresora térmica falsa, para probar la impresión sin la de verdad (B5-2, ADR-026).
 *
 *   pnpm impresora:falsa [puerto]      escucha en el 9100 (o el que digas), en todas las interfaces
 *
 * Guarda cada trabajo en `.impresora-falsa/` como bytes (`.bin`) y como el texto que saldría en el papel
 * (`.txt`, decodificado de la página 850). Contesta a la pregunta del papel según `.impresora-falsa/papel.txt`:
 * `ok` (por defecto), `sinpapel` o `pocopapel`; se cambia con el programa en marcha.
 *
 * En Ajustes → Impresoras se da de alta con la IP de este equipo en la red (`ipconfig`), no 127.0.0.1.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(raiz, ".impresora-falsa");
const __dirname = dir;
fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(path.join(dir, "papel.txt"))) fs.writeFileSync(path.join(dir, "papel.txt"), "ok");
const puerto = Number(process.argv[2] ?? 9100);
const CP850 = { 0xa0: "á", 0x82: "é", 0xa1: "í", 0xa2: "ó", 0xa3: "ú", 0xa4: "ñ", 0xa5: "Ñ", 0x81: "ü", 0x9a: "Ü", 0xb5: "Á", 0x90: "É", 0xd6: "Í", 0xe0: "Ó", 0xe9: "Ú", 0xa8: "¿", 0xad: "¡", 0xae: "«", 0xaf: "»", 0xfa: "·", 0x9e: "×" };
let n = 0;
function texto(b) {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0x10 && b[i + 1] === 0x04) { i += 2; continue; }
    if (c === 0x1b) { const k = b[i + 1]; i += k === 0x40 ? 1 : 2; if (k === 0x64) s += "\n[avance]"; continue; }
    if (c === 0x1d) { const k = b[i + 1]; if (k === 0x56) { s += "\n[corte]"; i += 3; } else i += 2; continue; }
    if (c === 0x0a) { s += "\n"; continue; }
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : (CP850[c] ?? `{${c.toString(16)}}`);
  }
  return s;
}
net
  .createServer((c) => {
    const trozos = [];
    const id = ++n;
    c.on("data", (d) => {
      trozos.push(d);
      if (d.includes(Buffer.from([0x10, 0x04, 0x04]))) {
        const modo = fs.existsSync(path.join(__dirname, "papel.txt")) ? fs.readFileSync(path.join(__dirname, "papel.txt"), "utf8").trim() : "ok";
        c.write(Buffer.from([modo === "sinpapel" ? 0x72 : modo === "pocopapel" ? 0x1e : 0x12]));
      }
    });
    c.on("end", () => {
      const b = Buffer.concat(trozos);
      const marca = `${new Date().toISOString().replace(/[:.]/g, "-")}-${String(id).padStart(3, "0")}`;
      fs.writeFileSync(path.join(dir, `${marca}.bin`), b);
      fs.writeFileSync(path.join(dir, `${marca}.txt`), texto(b));
      console.log(new Date().toISOString().slice(11, 19), `trabajo ${id}: ${b.length} bytes`);
      c.end();
    });
  })
  .listen(puerto, "0.0.0.0", () => console.log(`Impresora falsa en el puerto ${puerto}. Lo impreso queda en ${dir}`));
