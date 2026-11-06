import { describe, expect, it } from "vitest";
import { derivarClave } from "./cifrado";
import { abrirRespaldoCifrado, armarRespaldoCifrado, nombreRespaldo } from "./respaldo";

const clave = (p: string) => derivarClave(p, 1000);
const docs = [
  { nombre: "APK UCI-01 12.345.678-5.html", html: "<html>RUN 12.345.678-5 Pedro Rojas</html>" },
  { nombre: "APK UCI-02 9.876.543-3.html", html: "<html>otra hoja</html>" }
];

describe("respaldo mensual cifrado de las hojas APK", () => {
  it("ida y vuelta con la clave de la unidad", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const archivo = await armarRespaldoCifrado(k, docs, new Date(2026, 10, 30));
    expect(await abrirRespaldoCifrado(k, archivo)).toEqual(docs);
  });

  it("el archivo no deja ver el RUN, el nombre ni los nombres de archivo", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const archivo = await armarRespaldoCifrado(k, docs, new Date());
    expect(archivo).not.toMatch(/12\.345|Rojas|UCI-01|APK UCI|RUN/);
  });

  it("con otra contraseña no se abre", async () => {
    const archivo = await armarRespaldoCifrado(await clave("contraseña-de-la-unidad"), docs, new Date());
    await expect(abrirRespaldoCifrado(await clave("contraseña-equivocada"), archivo)).rejects.toThrow(/no se pudo descifrar/i);
  });

  it("un archivo cualquiera se rechaza con un mensaje claro", async () => {
    await expect(abrirRespaldoCifrado(await clave("contraseña-de-la-unidad"), "hola")).rejects.toThrow(/no es un respaldo/i);
  });

  it("el nombre del archivo lleva el año y el mes", () => {
    expect(nombreRespaldo(new Date(2026, 10, 30))).toBe("Respaldo APK 2026-11.upcres");
  });
});
