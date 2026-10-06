/**
 * Pruebas del contrato de credenciales e instalación (ADR-020).
 *
 * Lo que se comprueba: que el servidor no acepta campos de más (nadie cuela un `userId` o un rol
 * en la instalación), que el PIN son cuatro dígitos y que la respuesta de una llave pasa entera,
 * sin que el contrato le quite nada de lo que la firma cubre.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CompletarAltaSchema,
  CompletarInstalacionSchema,
  EnlaceDeAltaCommandSchema,
  PrepararInstalacionSchema,
  PuestaAPuntoSchema,
} from "./index.ts";

const instalacion = {
  codigo: "K7F2Q-X9B3M",
  local: "Abby Kingdom",
  sucursal: "Principal",
  nombre: "Abigail Karam",
  contrasena: "parque de niños 2026",
  pin: "4826",
};
const DESAFIO = "0199a0c0-0000-7000-8000-00000000d001";

describe("instalación inicial", () => {
  test("acepta lo que pide la pantalla y recorta los espacios", () => {
    const r = PrepararInstalacionSchema.parse({ ...instalacion, local: "  Abby Kingdom  " });
    assert.equal(r.local, "Abby Kingdom");
  });

  test("no admite campos de más: nadie se nombra administrador de otra forma", () => {
    assert.equal(PrepararInstalacionSchema.safeParse({ ...instalacion, role: "ADMIN" }).success, false);
    assert.equal(PrepararInstalacionSchema.safeParse({ ...instalacion, tenantId: "x" }).success, false);
  });

  test("el PIN son cuatro dígitos, ni más ni letras", () => {
    for (const pin of ["482", "48260", "48a6", ""]) {
      assert.equal(PrepararInstalacionSchema.safeParse({ ...instalacion, pin }).success, false, pin);
    }
  });

  test("la respuesta de la llave pasa entera y el equipo necesita nombre", () => {
    const respuesta = { id: "abc", rawId: "abc", type: "public-key", response: { clientDataJSON: "x", attestationObject: "y" }, extra: 1 };
    const ok = CompletarInstalacionSchema.parse({ codigo: "K7F2QX9B3M", desafioId: DESAFIO, respuesta, etiqueta: "PC de la oficina", equipo: "PC de la oficina" });
    assert.deepEqual(ok.respuesta, respuesta);
    assert.equal(CompletarInstalacionSchema.safeParse({ codigo: "K7F2QX9B3M", desafioId: DESAFIO, respuesta, etiqueta: "PC", equipo: "x" }).success, false);
    assert.equal(CompletarInstalacionSchema.safeParse({ codigo: "K7F2QX9B3M", desafioId: "no-es-uuid", respuesta, etiqueta: "PC", equipo: "PC" }).success, false);
  });
});

describe("enlaces de alta", () => {
  test("solo hay dos tipos de enlace", () => {
    assert.equal(EnlaceDeAltaCommandSchema.safeParse({ userId: "u1", kind: "ALTA" }).success, true);
    assert.equal(EnlaceDeAltaCommandSchema.safeParse({ userId: "u1", kind: "LLAVE" }).success, true);
    assert.equal(EnlaceDeAltaCommandSchema.safeParse({ userId: "u1", kind: "ADMIN" }).success, false);
  });

  test("una llave se registra con un nombre para reconocerla", () => {
    const respuesta = { id: "abc", response: {} };
    assert.equal(CompletarAltaSchema.safeParse({ desafioId: DESAFIO, respuesta, etiqueta: "Teléfono" }).success, true);
    assert.equal(CompletarAltaSchema.safeParse({ desafioId: DESAFIO, respuesta, etiqueta: " " }).success, false);
  });
});

describe("puesta a punto", () => {
  test("un punto dice qué bloquea, o que no bloquea nada", () => {
    const r = PuestaAPuntoSchema.safeParse({
      puntos: [
        { id: "tarifas", hecho: false, bloquea: "La entrada", detalle: "Falta publicar las tarifas del parque" },
        { id: "feriados", hecho: true, bloquea: null, detalle: "12 feriados cargados" },
      ],
      pendientesQueBloquean: 1,
    });
    assert.equal(r.success, true);
    assert.equal(PuestaAPuntoSchema.safeParse({ puntos: [{ id: "otra", hecho: true, bloquea: null, detalle: "x" }], pendientesQueBloquean: 0 }).success, false);
  });
});
