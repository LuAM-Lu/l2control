/**
 * El worker de L2 Control — B5-1, ADR-006 («un proceso worker separado para el servidor de tiempo
 * real, la cola de impresión y los trabajos programados») y ADR-025.
 *
 * Hoy hace tres cosas:
 *  1. el canal en vivo (Socket.io con adaptador Valkey, ADR-008), con la autorización en el apretón
 *     de manos y una sala por sucursal (`canal.ts`);
 *  2. la vuelta del outbox: lo que ocurre en la base llega a las pantallas en menos de 2 s
 *     (`outbox.ts`), y el latido que sostiene las sesiones con el canal abierto y echa a las que
 *     murieron;
 *  3. la consulta automática de la tasa del BCV, que antes vivía en el servidor web (`tasa.ts`).
 *
 * Si algo de lo imprescindible falla al arrancar (entorno, base, Valkey), no arranca: mejor que
 * arrancar a medias (fail-closed, §10.3). Si se cae, la operación sigue: la web escribe sin él, y
 * los eventos esperan en el outbox a que vuelva.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { conectar } from "@l2/application";
import { crearLogger } from "@l2/observability";
import { entorno } from "./entorno.ts";
import { crearCanal } from "./canal.ts";
import { almacenValkey } from "./operacion.ts";
import { vigilarOutbox } from "./outbox.ts";
import { programarSincronizacionDeTasa } from "./tasa.ts";

/** Cada cuánto se confirma que las sesiones con el canal abierto siguen vivas. */
const LATIDO_MS = 60_000;

const VERSION = (JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string }).version;

async function arrancar() {
  const e = entorno();
  const log = crearLogger({ servicio: "worker", nivel: e.L2_LOG_LEVEL });
  const app = await conectar(e.L2_DB_APP_URL, { claveCifrado: e.L2_CLAVE_CIFRADO });

  // Valkey: una conexión publica (y guarda el bus), la otra solo escucha, como pide el adaptador.
  const pub = new Redis(e.L2_VALKEY_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  const sub = pub.duplicate();
  for (const c of [pub, sub]) c.on("error", (err) => log.warn({ err }, "Valkey no responde"));
  await Promise.all([pub.connect(), sub.connect()]);

  const http = createServer((req, res) => {
    // Para el proxy y la supervisión: si esto no responde, el canal tampoco.
    if (req.url === "/salud") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, version: VERSION }));
      return;
    }
    res.writeHead(404).end();
  });

  const canal = crearCanal({
    http,
    tenantId: e.L2_TENANT_ID,
    abrir: (ticket) => app.tiempoReal.abrir(ticket, e.L2_TENANT_ID, Date.now()),
    almacen: almacenValkey(pub),
    adaptador: createAdapter(pub, sub, { key: "l2:socket.io" }),
    alError: (err, contexto) => log.error({ err, contexto }, "error en el canal en vivo"),
  });

  let latiendo = false;
  const latir = async () => {
    if (latiendo) return;
    latiendo = true;
    try {
      const abiertas = canal.sesiones();
      const vivas = await app.tiempoReal.latido(e.L2_TENANT_ID, abiertas, Date.now());
      const muertas = new Set(abiertas.filter((s) => !vivas.has(s)));
      if (muertas.size > 0) {
        canal.echar(muertas);
        log.info({ sesiones: muertas.size }, "canal cerrado a sesiones que ya no están vivas");
      }
    } catch (err) {
      log.warn({ err }, "no se pudo comprobar las sesiones del canal");
    } finally {
      latiendo = false;
    }
  };
  const latido = setInterval(() => void latir(), LATIDO_MS);

  const vuelta = await vigilarOutbox({
    app,
    tenantId: e.L2_TENANT_ID,
    log,
    contar(avisos) {
      canal.contar(avisos);
      // Una salida, una revocación o una baja: quien la sufre deja el canal ya, no al minuto.
      if (avisos.some((a) => a.temas.includes("sesiones"))) void latir();
    },
  });

  const pararTasa =
    e.L2_SINCRONIZAR_TASA === "si" ? programarSincronizacionDeTasa(app, { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID }, log) : () => undefined;

  await new Promise<void>((listo) => http.listen(e.L2_TIEMPO_REAL_PUERTO, listo));
  log.info(
    { version: VERSION, entorno: e.L2_ENTORNO, puerto: e.L2_TIEMPO_REAL_PUERTO, tenantId: e.L2_TENANT_ID, sincronizarTasa: e.L2_SINCRONIZAR_TASA },
    "worker en marcha: canal en vivo, outbox y trabajos programados",
  );

  let saliendo = false;
  const salir = async (senal: string) => {
    if (saliendo) return;
    saliendo = true;
    log.info({ senal }, "worker deteniéndose");
    clearInterval(latido);
    pararTasa();
    await vuelta.parar();
    await canal.cerrar();
    pub.disconnect();
    sub.disconnect();
    await app.cerrar();
    process.exit(0);
  };
  process.on("SIGINT", () => void salir("SIGINT"));
  process.on("SIGTERM", () => void salir("SIGTERM"));
}

arrancar().catch((err: unknown) => {
  // El entorno inválido ya dice qué falta sin enseñar valores (EntornoInvalido).
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
