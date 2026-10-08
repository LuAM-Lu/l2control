/**
 * El agente que se actualiza solo (T-8c): cuándo se cambia, la huella que no coincide, el ejecutable que no arranca, el
 * guion que hace el cambio y vuelve atrás, y lo que queda por contar. Con un servidor HTTP de prueba, sin el de verdad.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  anotarFallida,
  anotarResultado,
  archivosEn,
  consultar,
  debeCambiar,
  descargarYComprobar,
  esPosterior,
  guionDeCambio,
  notaPendiente,
  ordenDeCambio,
  tareaDeCambio,
  versionesFallidas,
} from "./actualizacion.ts";

const CREDENCIAL = "l2ag_prueba";
/** Lo que sirve el servidor de prueba: unos bytes que no son un ejecutable, y su huella. */
const BYTES = randomBytes(2048);
const HUELLA = createHash("sha256").update(BYTES).digest("hex");

let servidor: Server;
let web: string;
let carpeta: string;

before(async () => {
  carpeta = mkdtempSync(join(tmpdir(), "l2-agente-"));
  servidor = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${CREDENCIAL}`) return void res.writeHead(401).end();
    if (req.url === "/descargas/agente/version") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ version: "0.86.0", sha256: HUELLA, pedida: false }));
    if (req.url === "/descargas/agente/archivo") return void res.writeHead(200).end(BYTES);
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  web = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(() => {
  servidor.close();
  rmSync(carpeta, { recursive: true, force: true });
});

describe("cuándo se cambia", () => {
  test("solo a una versión posterior, y nunca en desarrollo", () => {
    assert.equal(esPosterior("0.86.0", "0.85.9"), true);
    assert.equal(esPosterior("0.85.10", "0.85.9"), true);
    assert.equal(esPosterior("1.0.0", "0.99.99"), true);
    assert.equal(esPosterior("0.85.0", "0.85.0"), false);
    assert.equal(esPosterior("0.84.0", "0.85.0"), false);
    assert.equal(esPosterior("desarrollo", "0.85.0"), false);
    const d = { version: "0.86.0", sha256: HUELLA, pedida: false };
    assert.equal(debeCambiar("0.85.0", d, []), true);
    assert.equal(debeCambiar("0.86.0", d, []), false);
    assert.equal(debeCambiar("desarrollo", d, []), false);
    // Un servidor que volvió atrás no arrastra al agente; pedido desde el panel, sí.
    assert.equal(debeCambiar("0.87.0", d, []), false);
    assert.equal(debeCambiar("0.87.0", { ...d, pedida: true }, []), true);
  });

  test("una versión que ya falló aquí no se vuelve a probar sola; pedida, sí", () => {
    const d = { version: "0.86.0", sha256: HUELLA, pedida: false };
    assert.equal(debeCambiar("0.85.0", d, ["0.86.0"]), false);
    assert.equal(debeCambiar("0.85.0", { ...d, pedida: true }, ["0.86.0"]), true);
  });
});

describe("lo que publica el servidor", () => {
  test("con la credencial dice la versión y su huella; sin ella, nada", async () => {
    assert.deepEqual(await consultar(web, CREDENCIAL), { version: "0.86.0", sha256: HUELLA, pedida: false });
    assert.equal(await consultar(web, "l2ag_otra"), null);
    assert.equal(await consultar("http://127.0.0.1:1", CREDENCIAL), null);
  });

  test("una descarga sin la huella publicada no se instala, y no queda nada en la carpeta", async () => {
    const a = archivosEn(carpeta, join(carpeta, "l2-impresion.exe"));
    const r = await descargarYComprobar({ web, credencial: CREDENCIAL, d: { version: "0.86.0", sha256: "0".repeat(64), pedida: false }, a });
    assert.equal(!r.ok && r.resultado, "HUELLA_EQUIVOCADA");
    assert.equal(existsSync(a.nuevo), false);
    assert.equal(existsSync(`${a.nuevo}.descarga`), false);
  });

  test("con la huella buena pero sin arrancar diciendo su versión, tampoco se instala", async () => {
    const a = archivosEn(carpeta, join(carpeta, "l2-impresion.exe"));
    const r = await descargarYComprobar({ web, credencial: CREDENCIAL, d: { version: "0.86.0", sha256: HUELLA, pedida: false }, a });
    assert.equal(!r.ok && r.resultado, "NO_ARRANCA");
    assert.equal(existsSync(a.nuevo), false);
  });
});

describe("el cambio y lo que queda por contar", () => {
  test("el guion espera al agente, cambia el ejecutable y, si el nuevo no queda vivo, vuelve el anterior", () => {
    const a = archivosEn("C:\\ProgramData\\L2 Control\\Impresion", "C:\\ProgramData\\L2 Control\\Impresion\\l2-impresion.exe");
    const g = guionDeCambio({ a, tarea: "L2 Control - Impresion", pid: 4321, de: "0.85.0", a_: "0.86.0" });
    assert.match(g, /Wait-Process -Id 4321/);
    assert.match(g, /\$tarea = 'L2 Control - Impresion'/);
    assert.match(g, /\$version = '0\.86\.0'; \$de = '0\.85\.0'/);
    assert.match(g, /Copy-Item -Path \$nuevo -Destination \$exe -Force/);
    assert.match(g, /\$x\.estable/);
    assert.match(g, /Copy-Item -Path \$anterior -Destination \$exe -Force/);
    assert.match(g, /Nota 'NO_ARRANCO'/);
    // Una comilla en una ruta no rompe el guion.
    const raro = archivosEn("C:\\L2 de O'Neil", "C:\\L2 de O'Neil\\l2-impresion.exe");
    assert.match(guionDeCambio({ a: raro, tarea: "t", pid: 1, de: "0.1.0", a_: "0.2.0" }), /'C:\\L2 de O''Neil\\l2-impresion\.exe'/);
  });

  test("el cambio corre en su propia tarea de Windows, con la cuenta del agente", () => {
    const a = archivosEn("C:\\ProgramData\\L2 Control\\Impresion", "C:\\ProgramData\\L2 Control\\Impresion\\l2-impresion.exe");
    const o = ordenDeCambio(a, "L2 Control - Impresion");
    assert.equal(tareaDeCambio("L2 Control - Impresion"), "L2 Control - Impresion (cambio)");
    assert.match(o, /Register-ScheduledTask -TaskName 'L2 Control - Impresion \(cambio\)'/);
    // La ruta del guion la arma la del sistema (en el CI, Linux): se compara con la que calcula el propio módulo.
    assert.ok(o.includes(`-File "${a.guion}"`), o);
    assert.match(o, /IsSystem\) \{ New-ScheduledTaskPrincipal -UserId 'SYSTEM'/);
    assert.match(o, /Start-ScheduledTask -TaskName 'L2 Control - Impresion \(cambio\)'$/);
  });

  test("la nota del cambio y las versiones fallidas se guardan hasta contarlas", () => {
    const a = archivosEn(carpeta, join(carpeta, "l2-impresion.exe"));
    assert.equal(notaPendiente(a), null);
    anotarResultado(a, { version: "0.86.0", de: "0.85.0", resultado: "NO_ARRANCO", detalle: "La 0.86.0 no arrancó: volvió la 0.85.0." });
    assert.deepEqual(notaPendiente(a), { version: "0.86.0", de: "0.85.0", resultado: "NO_ARRANCO", detalle: "La 0.86.0 no arrancó: volvió la 0.85.0." });
    anotarFallida(a, "0.86.0");
    anotarFallida(a, "0.86.0");
    assert.deepEqual(versionesFallidas(a), ["0.86.0"]);
  });
});
