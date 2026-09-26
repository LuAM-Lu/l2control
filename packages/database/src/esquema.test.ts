/**
 * Reglas del esquema que se comprueban leyendo `schema.prisma`, sin base de datos.
 * Corren en `pnpm test`, así que también en el CI más barato.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const esquema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

/** Los modelos, con su cuerpo, sin comentarios. */
const modelos = [...esquema.replace(/\/\/.*$/gm, "").matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)].map(
  ([, nombre, cuerpo]) => ({ nombre: nombre!, cuerpo: cuerpo! }),
);

/** Los únicos modelos sin tenantId: el propio tenant. Añadir uno aquí es una decisión de ADR-002. */
const SIN_TENANT = new Set(["Tenant"]);

test("el esquema tiene modelos (el analizador de esta prueba no está roto)", () => {
  assert.ok(modelos.length >= 2, `solo encontré ${modelos.length} modelos`);
});

test("ningún campo es Float: el dinero es BigInt en unidades menores (I-01, F3-02)", () => {
  for (const { nombre, cuerpo } of modelos) {
    const flotantes = cuerpo.split("\n").filter((l) => /^\s*\w+\s+Float\b/.test(l));
    assert.deepEqual(flotantes, [], `${nombre} tiene campos Float`);
  }
});

test("todo modelo de negocio lleva tenantId (ADR-002)", () => {
  for (const { nombre, cuerpo } of modelos) {
    if (SIN_TENANT.has(nombre)) continue;
    assert.match(cuerpo, /^\s*tenantId\s+String\s.*@db\.Uuid/m, `${nombre} no tiene tenantId uuid`);
  }
});

test("tenantId es la primera columna de todo índice compuesto (ADR-002)", () => {
  for (const { nombre, cuerpo } of modelos) {
    if (SIN_TENANT.has(nombre)) continue;
    for (const [, campos] of cuerpo.matchAll(/@@(?:unique|index)\(\[([^\]]*)\]/g)) {
      const lista = campos!.split(",").map((c) => c.trim().replace(/\(.*$/, ""));
      if (lista.length > 1) assert.equal(lista[0], "tenantId", `${nombre}: @@[${campos}]`);
    }
  }
});
