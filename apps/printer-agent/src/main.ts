#!/usr/bin/env node
/**
 * El agente de impresión de L2 Control — ADR-026.
 *
 *   l2-impresion vincular <servidor> <código>   cambia el código de Ajustes → Impresoras por la credencial
 *   l2-impresion                                 se conecta y atiende la cola (déjalo corriendo)
 *   l2-impresion probar <ip> [puerto] [ancho]    imprime una prueba sin servidor (para instalar la impresora)
 *
 * La credencial se guarda en `agente.json`, en la carpeta del usuario (`L2_AGENTE_CONFIG` la cambia). Es
 * una llave: quien la tenga imprime en el local. Retirar el agente desde el panel la invalida.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { escpos, type Ancho } from "@l2/domain-printing";
import { crearAgente } from "./agente.ts";
import { imprimir } from "./imprimir.ts";

const CONFIG = process.env.L2_AGENTE_CONFIG ?? join(homedir(), ".l2-impresion", "agente.json");

type Config = { servidor: string; credencial: string; nombre: string };

const hora = () => new Date().toLocaleTimeString("es-VE", { hour12: true });
const registro = {
  info: (m: string) => console.log(`${hora()}  ${m}`),
  error: (m: string) => console.error(`${hora()}  ! ${m}`),
};

async function vincular(servidor: string, codigo: string) {
  const r = await fetch(`${servidor.replace(/\/$/, "")}/impresion/vincular`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  const cuerpo = (await r.json().catch(() => null)) as { ok?: boolean; mensaje?: string; valor?: { nombre: string; credencial: string } } | null;
  if (!cuerpo?.ok || !cuerpo.valor) throw new Error(cuerpo?.mensaje ?? `El servidor respondió ${r.status}.`);
  mkdirSync(dirname(CONFIG), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify({ servidor, credencial: cuerpo.valor.credencial, nombre: cuerpo.valor.nombre } satisfies Config, null, 2), { mode: 0o600 });
  registro.info(`Vinculado como «${cuerpo.valor.nombre}». Ahora arranca el agente sin argumentos.`);
}

async function probar(ip: string, puerto: number, ancho: Ancho) {
  const doc = {
    renglones: [
      { tipo: "TEXTO", texto: "L2 Control", alinear: "CENTRO", negrita: true, grande: true },
      { tipo: "TEXTO", texto: "Prueba del agente", alinear: "CENTRO" },
      { tipo: "LINEA" },
      { tipo: "PAR", izq: "Impresora", der: `${ip}:${puerto}` },
      { tipo: "PAR", izq: "Papel", der: `${ancho} mm` },
      { tipo: "TEXTO", texto: "Ññ áéíóú ¿? ¡!" },
    ],
  } as const;
  const r = await imprimir({ ip, puerto }, escpos(doc, ancho));
  if (r.ok) registro.info(`Prueba impresa en ${ip}:${puerto}${r.aviso ? ` (${r.aviso})` : ""}.`);
  else throw new Error(r.error);
}

function iniciar() {
  if (!existsSync(CONFIG)) throw new Error(`No hay credencial en ${CONFIG}: primero «l2-impresion vincular <servidor> <código>».`);
  const c = JSON.parse(readFileSync(CONFIG, "utf8")) as Config;
  registro.info(`Agente «${c.nombre}» hacia ${c.servidor}.`);
  const agente = crearAgente({ servidor: c.servidor, credencial: c.credencial, imprimir: (d, b) => imprimir(d, b), registro });
  const salir = () => {
    agente.parar();
    process.exit(0);
  };
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
}

const [orden, ...args] = process.argv.slice(2);
try {
  if (orden === "vincular" && args[0] && args[1]) await vincular(args[0], args[1]);
  else if (orden === "probar" && args[0]) await probar(args[0], Number(args[1] ?? 9100), (Number(args[2] ?? 80) === 58 ? 58 : 80) as Ancho);
  else if (orden === undefined || orden === "iniciar") iniciar();
  else {
    console.log("Uso: l2-impresion [vincular <servidor> <código> | probar <ip> [puerto] [ancho] | iniciar]");
    process.exit(2);
  }
} catch (e) {
  registro.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
