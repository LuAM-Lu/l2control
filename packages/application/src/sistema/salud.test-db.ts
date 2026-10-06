/**
 * La comprobación de salud, contra l2control_test — T-8a, ADR-028.
 *
 * Responde con la base viva y niega sin lanzar lo que no puede comprobar: el despliegue la usa para
 * decidir si vuelve atrás. Corre con `pnpm test:db`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { abrirLocalDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

let l: LocalDePrueba;
before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba salud");
});
after(async () => {
  await l.cerrar();
});

test("con la base viva, el local está sano", async () => {
  assert.equal(await l.app.salud.comprobar(l.sistema.tenantId), true);
});

test("un local que no es un identificador no está sano, y no lanza", async () => {
  assert.equal(await l.app.salud.comprobar("no-es-un-uuid"), false);
});
