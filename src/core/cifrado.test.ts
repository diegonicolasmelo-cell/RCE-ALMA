import { describe, expect, it } from "vitest";
import { claveCorresponde, cifrarJson, crearVerificacion, derivarClave, descifrarJson } from "./cifrado";

// Pocas iteraciones: en las pruebas solo importa el comportamiento, no la lentitud.
const clave = (p: string) => derivarClave(p, 1000);

describe("cifrado de la identidad", () => {
  it("lo que se cifra se descifra igual, con la misma clave", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const dato = { nombre: "María Pérez Soto", rut: "12.345.678-5" };
    const bloque = await cifrarJson(k, dato);
    expect(await descifrarJson(k, bloque)).toEqual(dato);
  });

  it("el bloque no contiene el nombre ni el RUT en ninguna forma legible", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const bloque = await cifrarJson(k, { nombre: "María Pérez Soto", rut: "12.345.678-5" });
    expect(bloque.startsWith("v1.")).toBe(true);
    expect(bloque).not.toMatch(/Mar[ií]a|P[ée]rez|12\.?345|678/);
    expect(atob(bloque.split(".")[2] ?? "")).not.toContain("Mar");
  });

  it("otra contraseña no puede leerlo", async () => {
    const bloque = await cifrarJson(await clave("contraseña-de-la-unidad"), { nombre: "X" });
    await expect(descifrarJson(await clave("contraseña-equivocada"), bloque)).rejects.toThrow(/no se pudo descifrar/i);
  });

  it("si alguien altera el bloque, se detecta", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const [v, iv, datos] = (await cifrarJson(k, { nombre: "X" })).split(".");
    const rotos = (datos ?? "").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    await expect(descifrarJson(k, `${v}.${iv}.${rotos}`)).rejects.toThrow();
  });

  it("dos pacientes iguales no dan el mismo bloque (IV aleatorio)", async () => {
    const k = await clave("contraseña-de-la-unidad");
    expect(await cifrarJson(k, { nombre: "A" })).not.toBe(await cifrarJson(k, { nombre: "A" }));
  });

  it("el tamaño no delata el largo del nombre", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const corto = await cifrarJson(k, { nombre: "Ana", rut: "1-9" });
    const largo = await cifrarJson(k, { nombre: "María de los Ángeles Fernández de la Cruz y Soto", rut: "12.345.678-5" });
    expect(corto.length).toBe(largo.length);
  });

  it("exige una contraseña de al menos 8 caracteres", async () => {
    await expect(derivarClave("corta")).rejects.toThrow(/8 caracteres/);
  });

  it("la verificación distingue la contraseña correcta de una equivocada", async () => {
    const buena = await clave("contraseña-de-la-unidad");
    const verif = await crearVerificacion(buena);
    expect(await claveCorresponde(buena, verif)).toBe(true);
    expect(await claveCorresponde(await clave("contraseña-equivocada"), verif)).toBe(false);
  });

  it("un bloque con formato desconocido se rechaza con un mensaje claro", async () => {
    await expect(descifrarJson(await clave("contraseña-de-la-unidad"), "basura")).rejects.toThrow(/formato/);
  });
});
