/**
 * Una transacción tiene UNA conexión, y Prisma 7 le pide a la vez las relaciones hermanas de un `include`.
 * `abrirBase` las pone en fila: cada consulta responde lo suyo y `pg` no avisa de consultas solapadas (el
 * aviso que Next enseñaba como error en Inicio, y que en `pg` 9 será un fallo).
 *
 * Corre contra l2control_test con `pnpm --filter @l2/database test:db`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { abrirBase, type Base } from "./index.ts";

let app: Base;
const avisos: string[] = [];
const alAviso = (w: Error) => {
  if (/already executing a query/.test(w.message)) avisos.push(w.message);
};

before(async () => {
  app = await abrirBase(process.env.L2_DB_TEST_APP_URL);
  process.on("warning", alAviso);
});

after(async () => {
  process.off("warning", alAviso);
  await app.cerrar();
});

test("una lectura con tres relaciones hermanas (Prisma las pide a la vez): responde y pg no avisa", async () => {
  const filas = await app.conTenant(randomUUID(), (tx) =>
    tx.eventReservation.findMany({
      include: {
        guardian: { select: { id: true } },
        account: { select: { orderNumber: true } },
        day: { select: { accountId: true } },
      },
    }),
  );
  assert.deepEqual(filas, []);
  // El aviso de pg sale en el siguiente giro del bucle de eventos.
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(avisos, []);
});

test("una consulta que falla no traba la fila: la siguiente transacción responde", async () => {
  await assert.rejects(app.conTenant(randomUUID(), (tx) => tx.$queryRaw`SELECT 1 / 0`));
  const r = await app.conTenant(randomUUID(), (tx) => tx.$queryRaw<{ n: number }[]>`SELECT 7::int AS n`);
  assert.equal(r[0]?.n, 7);
});
