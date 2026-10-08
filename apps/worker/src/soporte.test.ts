/** El aviso por correo de los reportes de problemas — T-11 (D-SOP): qué lleva y qué se anota. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto, ReporteParaAvisar } from "@l2/application";
import type { Logger } from "@l2/observability";
import { avisarPendientes, correoDe, type Correo } from "./soporte.ts";

const callado = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;
const ctx: Contexto = { tenantId: "t", branchId: "b", sistema: true };
const r = (extra: Partial<ReporteParaAvisar> = {}): ReporteParaAvisar => ({
  id: "r1",
  numero: 12,
  version: "0.72.0",
  ruta: "/caja",
  codigoError: null,
  iguales: 0,
  intentos: 0,
  ...extra,
});

test("el correo lleva el número, la versión, la pantalla y el enlace; nada de lo que contó la persona", () => {
  const c = correoDe(r({ codigoError: "sin-tasa", iguales: 2 }), "https://abby.example");
  assert.equal(c.asunto, "L2 Control · reporte n.º 12 · v0.72.0");
  assert.match(c.texto, /Versión: 0\.72\.0/);
  assert.match(c.texto, /Pantalla: \/caja/);
  assert.match(c.texto, /Error conocido: sin-tasa/);
  assert.match(c.texto, /Reportes con el mismo error: 3/);
  assert.match(c.texto, /https:\/\/abby\.example\/panel\/ajustes\/soporte/);
  assert.match(correoDe(r(), null).texto, /Panel → Ajustes → Soporte/);
});

test("lo que sale se anota enviado; lo que no, con el tipo del fallo y sin la respuesta del servidor", async () => {
  const anotados: [string, boolean, string | null][] = [];
  const app = {
    soporte: {
      porAvisar: async () => [r({ id: "bien" }), r({ id: "mal", numero: 13 })],
      anotarAviso: async (_c: Contexto, id: string, ok: boolean, detalle: string | null) => {
        anotados.push([id, ok, detalle]);
      },
    },
  } as unknown as Parameters<typeof avisarPendientes>[0];
  const enviados: Correo[] = [];
  const enviar = async (c: Correo) => {
    if (c.asunto.includes("n.º 13")) throw Object.assign(new Error("535 Auth failed for soporte@abby.example"), { code: "EAUTH" });
    enviados.push(c);
  };
  assert.equal(await avisarPendientes(app, ctx, enviar, null, callado), 2);
  assert.equal(enviados.length, 1);
  assert.deepEqual(anotados, [
    ["bien", true, null],
    ["mal", false, "No salió: Error EAUTH"],
  ]);
});
