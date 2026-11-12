import { describe, expect, it } from "vitest";
import { fragmentoDeConfig } from "./ConectarCelular";

describe("conectar el celular pegando el enlace", () => {
  const exec = encodeURIComponent("https://script.google.com/macros/s/AKfy/exec");
  it("saca el fragmento aunque venga con texto alrededor (como en WhatsApp)", () => {
    expect(fragmentoDeConfig(`Hola: https://x.github.io/RCE-ALMA/#config?u=${exec}&a=llave_1 gracias`)).toBe(`#config?u=${exec}&a=llave_1`);
  });
  it("sin la direccion del servidor o sin la llave, no sirve", () => {
    expect(fragmentoDeConfig("https://x.github.io/RCE-ALMA/")).toBeNull();
    expect(fragmentoDeConfig(`https://x.github.io/#config?u=${exec}`)).toBeNull();
  });
});
