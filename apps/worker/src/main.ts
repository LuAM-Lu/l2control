/**
 * El worker de L2 Control — B5-1, ADR-006 («un proceso worker separado para el servidor de tiempo
 * real, la cola de impresión y los trabajos programados») y ADR-025.
 *
 * Hace cinco cosas:
 *  1. el canal en vivo (Socket.io con adaptador Valkey, ADR-008), con la autorización en el apretón
 *     de manos y una sala por sucursal (`canal.ts`);
 *  2. la vuelta del outbox: lo que ocurre en la base llega a las pantallas en menos de 2 s
 *     (`outbox.ts`), y el latido que sostiene las sesiones con el canal abierto y echa a las que
 *     murieron;
 *  3. la consulta automática de la tasa del BCV, que antes vivía en el servidor web (`tasa.ts`);
 *  4. los agentes de impresión de la laptop de caja (`impresion.ts`, ADR-026): les avisa cuando hay
 *     trabajo, les da lo que reclaman, devuelve a la cola lo enviado que no respondió y echa a los
 *     que se retiraron desde el panel;
 *  5. el aviso por correo de cada reporte de problema al desarrollo (`soporte.ts`, T-11, D-SOP), si hay servidor de
 *     correo configurado.
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
import { crearCanalDeImpresion, type CanalDeImpresion } from "./impresion.ts";
import { enviarPorSmtp, programarAvisosDeSoporte, type AvisosDeSoporte } from "./soporte.ts";

/** Cada cuánto se confirma que las sesiones con el canal abierto siguen vivas. */
const LATIDO_MS = 60_000;
/** Cada cuánto se mira la cola de impresión: lo enviado sin respuesta y los agentes vivos (ADR-026). */
const COLA_MS = 15_000;

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

  let impresion: CanalDeImpresion | null = null;
  const http = createServer((req, res) => {
    // La vinculación de un agente de impresión (ADR-026): un POST con el código de un solo uso.
    if (impresion?.atenderHttp(req, res)) return;
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

  impresion = crearCanalDeImpresion({
    io: canal.io,
    casos: {
      abrirAgente: (c, v) => app.impresion.abrirAgente(e.L2_TENANT_ID, c, v, Date.now()),
      reclamar: (a) => app.impresion.reclamar(a, Date.now()),
      responder: (a, r) => app.impresion.responder(a, r, Date.now()),
      // Con la credencial va la dirección de la web (T-8c): de ella baja el agente sus versiones. En producción es la
      // misma que la del servidor; en desarrollo, la web y el worker van en puertos distintos.
      vincular: async (x) => {
        const r = await app.impresion.vincular(e.L2_TENANT_ID, x, Date.now());
        return r.ok && e.L2_URL_PUBLICA ? { ...r, valor: { ...r.valor, web: e.L2_URL_PUBLICA.replace(/\/$/, "") } } : r;
      },
      anotarActualizacion: (a, n) => app.impresion.anotarActualizacion(a, n, Date.now()),
      anotarImpresorasDeWindows: (a, l) => app.impresion.anotarImpresorasDeWindows(a, l, Date.now()),
    },
    alError: (err, contexto) => log.error({ err, contexto }, "error con un agente de impresión"),
  });
  const deImpresion = impresion;
  let mirandoCola = false;
  const mirarCola = async () => {
    if (mirandoCola) return;
    mirandoCola = true;
    try {
      // Lo enviado que no respondió vuelve a la cola: que lo tome el agente que siga vivo.
      if ((await app.impresion.barrer(e.L2_TENANT_ID, Date.now())) > 0) deImpresion.avisar("todas");
      const conectados = deImpresion.conectados().map((a) => a.agenteId);
      const vigentes = new Set(await app.impresion.latido(e.L2_TENANT_ID, conectados, Date.now()));
      const retirados = new Set(conectados.filter((id) => !vigentes.has(id)));
      if (retirados.size > 0) deImpresion.echar(retirados);
    } catch (err) {
      log.warn({ err }, "no se pudo mirar la cola de impresión");
    } finally {
      mirandoCola = false;
    }
  };
  const cola = setInterval(() => void mirarCola(), COLA_MS);

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

  // El aviso de los reportes de problemas (T-11, D-SOP): solo con servidor de correo y destinatario. Antes que el
  // outbox: su primera vuelta ya puede traer un reporte.
  const soporte: AvisosDeSoporte | null =
    e.L2_SMTP_URL && e.L2_CORREO_SOPORTE
      ? programarAvisosDeSoporte(app, { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID, sistema: true }, enviarPorSmtp(e.L2_SMTP_URL, e.L2_CORREO_DE, e.L2_CORREO_SOPORTE), e.L2_URL_PUBLICA ?? null, log)
      : null;

  const vuelta = await vigilarOutbox({
    app,
    tenantId: e.L2_TENANT_ID,
    log,
    contar(avisos) {
      canal.contar(avisos);
      // Algo entró en la cola de impresión (o cambió una impresora): que lo sepan los agentes.
      const deCola = avisos.filter((a) => a.temas.includes("impresion"));
      if (deCola.length > 0) deImpresion.avisar(deCola.some((a) => a.branchId === null) ? "todas" : deCola.map((a) => a.branchId!));
      // «Actualizar ahora» (T-8c): el agente de esa sucursal revisa ya la versión.
      const deAgente = avisos.filter((a) => a.temas.includes("agente"));
      if (deAgente.length > 0) deImpresion.revisarVersion(deAgente.some((a) => a.branchId === null) ? "todas" : deAgente.map((a) => a.branchId!));
      // Una salida, una revocación o una baja: quien la sufre deja el canal ya, no al minuto.
      if (avisos.some((a) => a.temas.includes("sesiones"))) void latir();
      // Entró un reporte de problema: su aviso sale ya (T-11).
      if (avisos.some((a) => a.temas.includes("soporte"))) soporte?.avisar();
    },
  });

  const pararTasa =
    e.L2_SINCRONIZAR_TASA === "si" ? programarSincronizacionDeTasa(app, { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID }, log) : () => undefined;

  await new Promise<void>((listo) => http.listen(e.L2_TIEMPO_REAL_PUERTO, listo));
  log.info(
    { version: VERSION, entorno: e.L2_ENTORNO, puerto: e.L2_TIEMPO_REAL_PUERTO, tenantId: e.L2_TENANT_ID, sincronizarTasa: e.L2_SINCRONIZAR_TASA, avisosDeSoporte: soporte !== null },
    "worker en marcha: canal en vivo, outbox, cola de impresión y trabajos programados",
  );

  let saliendo = false;
  const salir = async (senal: string) => {
    if (saliendo) return;
    saliendo = true;
    log.info({ senal }, "worker deteniéndose");
    clearInterval(latido);
    clearInterval(cola);
    pararTasa();
    soporte?.parar();
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
