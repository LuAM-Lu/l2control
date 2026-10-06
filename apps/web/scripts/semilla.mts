/**
 * `pnpm db:semilla` — deja la base de DESARROLLO lista para abrir la app: el local (tenant y
 * sucursal de L2_TENANT_ID / L2_BRANCH_ID), su equipo con PIN y, si no tiene, el tarifario de
 * ejemplo como versión 1, los impuestos de trabajo, los datos de cobro inventados y un catálogo de
 * mostrador de ejemplo. Idempotente:
 * correrlo otra vez no cambia nada.
 *
 * Los datos son inventados (scripts/semilla). Los reales llegan con F0-04 y B7-2. El equipo
 * nuevo desde el que se abra la app pide su registro en el acceso; se aprueba con
 * `pnpm equipos aprobar "<nombre>"` (la consola del servidor).
 *
 * La administración de desarrollo no tiene contraseña fija (ADR-020): mientras no tenga
 * credenciales, la semilla imprime su enlace de alta, que se abre en el navegador para poner la
 * contraseña y registrar la llave de acceso.
 */
import { existsSync } from "node:fs";
import { conectar, type Contexto } from "@l2/application";
import { calendarDay } from "@l2/domain-rates";
import { TARIFARIO_DESARROLLO } from "./semilla/tarifario.mts";
import { ADMIN_DESARROLLO, EQUIPO_DESARROLLO } from "./semilla/equipo.mts";
import { IMPUESTOS_DE_TRABAJO } from "./semilla/impuestos.mts";
import { MEDIOS_DE_DESARROLLO } from "./semilla/medios.mts";
import { PRODUCTOS_DE_DESARROLLO } from "./semilla/productos.mts";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const { L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID, L2_ENTORNO, L2_CLAVE_CIFRADO, L2_URL_PUBLICA } = process.env;
if (!L2_DB_APP_URL || !L2_TENANT_ID || !L2_BRANCH_ID) {
  console.error("Faltan L2_DB_APP_URL, L2_TENANT_ID o L2_BRANCH_ID (copia .env.example a .env).");
  process.exit(1);
}
if (L2_ENTORNO !== "desarrollo") {
  console.error(`La semilla de ejemplo solo corre en desarrollo, no en «${L2_ENTORNO ?? "sin L2_ENTORNO"}».`);
  process.exit(1);
}

const app = await conectar(L2_DB_APP_URL, { claveCifrado: L2_CLAVE_CIFRADO, urlPublica: L2_URL_PUBLICA });
try {
  const ctx: Contexto = { tenantId: L2_TENANT_ID, branchId: L2_BRANCH_ID, sistema: true };
  const { creada } = await app.sucursal.asegurar(ctx, { tenant: "Abby Kingdom", sucursal: "Principal" });
  console.log(creada ? "✓ Local creado: Abby Kingdom · Principal" : "· El local ya existía");

  let adminId: string | null = null;
  for (const persona of EQUIPO_DESARROLLO) {
    const r = await app.equipo.asegurar(ctx, persona);
    if (!r.ok) throw new Error(`${persona.nombre}: ${r.mensaje}`);
    if (persona.nombre === ADMIN_DESARROLLO) adminId = r.id;
    console.log(r.creada ? `✓ ${persona.nombre} (${persona.role})` : `· ${persona.nombre} ya existía`);
  }

  if (await app.tarifario.leer(ctx)) {
    console.log("· Ya hay tarifario publicado: no se toca");
  } else {
    const r = await app.tarifario.publicar(ctx, TARIFARIO_DESARROLLO);
    if (!r.ok) throw new Error(`El tarifario de ejemplo no pasó el contrato: ${r.mensaje}`);
    console.log(`✓ Tarifario de ejemplo publicado (versión ${r.valor.version})`);
  }
  if ((await app.impuestos.leer(ctx)).vigencias.length > 0) {
    console.log("· Ya hay impuestos programados: no se tocan");
  } else {
    // Rigen desde este instante: «hoy» en el local, con la zona de sus ajustes (B4-4).
    const hoy = calendarDay(new Date().toISOString(), (await app.ajustes.leer(ctx)).ajustes.zonaHoraria);
    for (const i of IMPUESTOS_DE_TRABAJO) {
      const r = await app.impuestos.programar(ctx, { ...i, dia: hoy });
      if (!r.ok) throw new Error(`${i.impuesto} ${i.code ?? ""}: ${r.mensaje}`);
    }
    console.log("✓ Impuestos de trabajo: IVA 16 % y 8 %, IGTF 3 % (a confirmar con el contador)");
  }
  const medios = await app.medios.leer(ctx);
  if (!medios.ok) throw new Error(`Medios de pago: ${medios.mensaje}`);
  if (medios.valor.pagoMovil || medios.valor.terminales.length > 0) {
    console.log("· Ya hay datos de cobro: no se tocan");
  } else {
    for (const cambio of MEDIOS_DE_DESARROLLO) {
      const r = await app.medios.aplicar(ctx, cambio);
      if (!r.ok) throw new Error(`Medios de pago (${cambio.kind}): ${r.mensaje}`);
    }
    console.log("✓ Datos de cobro inventados: Pago Móvil, Zelle y dos terminales, encendidos");
  }
  if ((await app.productos.leer(ctx)).productos.length > 0) {
    console.log("· Ya hay productos: no se tocan");
  } else {
    for (const producto of PRODUCTOS_DE_DESARROLLO) {
      const r = await app.productos.aplicar(ctx, { kind: "CREAR", producto });
      if (!r.ok) throw new Error(`${producto.nombre}: ${r.mensaje}`);
    }
    console.log(`✓ Catálogo de mostrador de ejemplo: ${PRODUCTOS_DE_DESARROLLO.length} productos`);
  }
  console.log("\nEl PIN de todo el equipo de desarrollo es 1970.");

  // La administración confirma identidad con su contraseña y su llave de acceso (ADR-020), que
  // pone ella misma con un enlace de alta. Con credenciales ya puestas no se le repone nada.
  const credenciales = await app.enlaces.resumen(ctx);
  if (!credenciales.ok) throw new Error(`Credenciales de ${ADMIN_DESARROLLO}: ${credenciales.mensaje}`);
  // Una contraseña sin llave no confirma nada (la base de quien ya sembraba con TOTP): también recibe enlace.
  const suyas = credenciales.valor.find((c) => c.userId === adminId);
  if (suyas?.tieneContrasena && suyas.llaves.length > 0) {
    console.log(`${ADMIN_DESARROLLO} ya tiene contraseña y llave de acceso (se reponen con \`pnpm credenciales "${ADMIN_DESARROLLO}"\`).`);
  } else if (adminId) {
    const enlace = await app.enlaces.crear(ctx, { userId: adminId, kind: "ALTA" }, Date.now());
    if (!enlace.ok) throw new Error(`Enlace de alta de ${ADMIN_DESARROLLO}: ${enlace.mensaje}`);
    console.log(`Para confirmar identidad, ${ADMIN_DESARROLLO} pone su contraseña y su llave de acceso con este enlace (24 h, un solo uso):`);
    console.log(`  ${enlace.valor.url}`);
  }
} finally {
  await app.cerrar();
}
