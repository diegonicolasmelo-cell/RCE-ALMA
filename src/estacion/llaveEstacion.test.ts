import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { crearLlave, huellaDe } from "./llaveEstacion";

describe("llave de estación creada en el PC", () => {
  it("es larga y al azar: dos llaves nunca son iguales", () => {
    const a = crearLlave();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(crearLlave()).not.toBe(a);
  });
  it("su huella es el SHA-256 en hexadecimal, igual al que calcula Codigo.gs", async () => {
    const llave = crearLlave();
    expect(await huellaDe(llave)).toBe(createHash("sha256").update(llave, "utf8").digest("hex"));
  });
});
