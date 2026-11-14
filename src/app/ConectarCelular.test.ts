import { describe, expect, it } from "vitest";
import { fragmentoDeConfig, problemaDelEnlace } from "./ConectarCelular";

describe("conectar el celular pegando el enlace", () => {
  const exec = encodeURIComponent("https://script.google.com/macros/s/AKfy/exec");
  it("saca el fragmento aunque venga con texto alrededor (como en WhatsApp)", () => {
    expect(fragmentoDeConfig(`Hola: https://x.github.io/RCE-ALMA/#config?u=${exec}&a=llave_1 gracias`)).toBe(`#config?u=${exec}&a=llave_1`);
  });
  it("acepta el «#» codificado y un punto o paréntesis pegado al final", () => {
    expect(fragmentoDeConfig(`https://x.github.io/RCE-ALMA/%23config?u=${exec}&a=llave_1.`)).toBe(`#config?u=${exec}&a=llave_1`);
    expect(fragmentoDeConfig(`(https://x.github.io/RCE-ALMA/#config?u=${exec}&a=llave_1)`)).toBe(`#config?u=${exec}&a=llave_1`);
  });
  it("dice qué está mal: enlace del PC, sin enlace o cortado", () => {
    expect(problemaDelEnlace("https://x.github.io/RCE-ALMA/#estacion?t=abc")).toMatch(/enlace del PC/);
    expect(problemaDelEnlace("hola")).toMatch(/no trae el enlace/);
    expect(problemaDelEnlace(`https://x.github.io/#config?u=${exec}`)).toMatch(/incompleto/);
  });
  it("sin la direccion del servidor o sin la llave, no sirve", () => {
    expect(fragmentoDeConfig("https://x.github.io/RCE-ALMA/")).toBeNull();
    expect(fragmentoDeConfig(`https://x.github.io/#config?u=${exec}`)).toBeNull();
  });
});
