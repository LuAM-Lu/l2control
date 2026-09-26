/**
 * Criterio de F1-13 y §7.6: «una prueba verifica que un dato sensible NO aparece en el
 * log». Se escribe de verdad con el logger y se busca el dato en la salida cruda.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { conContexto, crearLogger } from "./logger.ts";
import { REDACTADO } from "./redaccion.ts";

/** Un logger que escribe en memoria; devuelve el texto crudo y las líneas ya parseadas. */
function capturar() {
  const trozos: string[] = [];
  const log = crearLogger({ servicio: "prueba", nivel: "trace", destino: { write: (t: string) => void trozos.push(t) } });
  const crudo = () => trozos.join("");
  const lineas = () => trozos.map((t) => JSON.parse(t) as Record<string, unknown>);
  return { log, crudo, lineas };
}

test("un PIN no aparece en el log", () => {
  const { log, crudo, lineas } = capturar();
  log.info({ usuario: "u-17", pin: "1970" }, "intento de acceso");
  assert.ok(!crudo().includes("1970"));
  assert.equal(lineas()[0]!.pin, REDACTADO);
  assert.equal(lineas()[0]!.usuario, "u-17", "lo que no es sensible sí se ve");
});

test("las referencias de pago no aparecen, por anidadas que estén", () => {
  const { log, crudo } = capturar();
  log.info(
    {
      cobro: {
        pagos: [
          { medio: "PAGO_MOVIL", datosDePago: { referencia: "009812345678", telefonoOrigen: "04141234567" } },
          { medio: "ZELLE", datosDePago: { titular: "Ana Pérez", correo: "ana@ejemplo.com" } },
          { medio: "USDT", datosDePago: { txId: "0x9f3ac0ffee", red: "TRON" } },
        ],
      },
    },
    "cobro confirmado",
  );
  for (const secreto of ["009812345678", "04141234567", "Ana Pérez", "ana@ejemplo.com", "0x9f3ac0ffee"]) {
    assert.ok(!crudo().includes(secreto), `se filtró ${secreto}`);
  }
  assert.ok(crudo().includes("TRON"), "la red no es un dato personal");
});

test("el contacto del representante no aparece (§7.6)", () => {
  const { log, crudo } = capturar();
  log.info({ representante: { nombre: "Familia Rojas", contacto: "0424-555-1234" } }, "entrada");
  assert.ok(!crudo().includes("555-1234"));
});

test("un teléfono escrito dentro del mensaje también se tapa", () => {
  const { log, crudo } = capturar();
  log.warn("no contesta el representante en el 0414-123 45 67 ni en +58 424 7654321");
  assert.ok(!crudo().includes("123 45 67"));
  assert.ok(!crudo().includes("7654321"));
});

test("la contraseña de una URL de conexión no aparece, ni en el error ni en su pila", () => {
  const { log, crudo, lineas } = capturar();
  const error = new Error("no conecta a postgresql://l2_app:super-secreta@10.0.0.5:5432/l2control");
  log.error({ err: error }, "la base no responde");
  assert.ok(!crudo().includes("super-secreta"));
  assert.ok(crudo().includes("l2_app"), "el usuario sí ayuda a diagnosticar");
  assert.ok(JSON.stringify(lineas()[0]!.err).includes("la base") === false);
});

test("tokens y cabeceras de autorización no aparecen", () => {
  const { log, crudo } = capturar();
  log.debug({ headers: { authorization: "Bearer eyJhbGciOi.abc.def", cookie: "sesion=xyz789" } }, "petición");
  log.debug("reintento con Bearer eyJhbGciOi.otro.token");
  assert.ok(!crudo().includes("eyJhbGciOi"));
  assert.ok(!crudo().includes("xyz789"));
});

test("el contexto de un hijo va en cada línea y también se redacta", () => {
  const { log, lineas, crudo } = capturar();
  const hijo = conContexto(log, { tenantId: "t-1", branchId: "b-1", userId: "u-1", businessDate: "2026-09-26" });
  const conSecreto = hijo.child({ pin: "4321" });
  conSecreto.info("abrió el turno");
  const [linea] = lineas();
  assert.equal(linea!.tenantId, "t-1");
  assert.equal(linea!.businessDate, "2026-09-26");
  assert.equal(linea!.servicio, "prueba");
  assert.ok(!crudo().includes("4321"));
});

test("el dinero en bigint no rompe el log", () => {
  const { log, lineas } = capturar();
  log.info({ total: { minor: 1500n, currency: "USD" } }, "total");
  assert.deepEqual(lineas()[0]!.total, { minor: "1500", currency: "USD" });
});

test("cada línea es JSON con nivel y hora", () => {
  const { log, lineas } = capturar();
  log.info("hola");
  const [linea] = lineas();
  assert.equal(linea!.level, "info");
  assert.match(String(linea!.time), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(linea!.msg, "hola");
});
