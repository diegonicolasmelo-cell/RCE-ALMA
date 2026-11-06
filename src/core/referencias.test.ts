import { describe, expect, it } from "vitest";
import { derivarClave } from "./cifrado";
import { ID_VERIFICACION, cifrarIdentidad, crearReferenciaVerificacion, descifrarIdentidad, referenciaCorresponde, soloEpisodios } from "./referencias";
import { asegurarPayloadSinIdentidad, contieneDatoIdentificable } from "./sanitizar";

const clave = (p: string) => derivarClave(p, 1000);
const identidad = { episodioId: "ep-1", nombre: "Rojas, Pedro", rut: "12345678-5", ficha: null };

describe("referencias cifradas (identidad en la nube)", () => {
  it("ida y vuelta: con la clave se recupera nombre y RUT", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const ref = await cifrarIdentidad(k, identidad, new Date("2026-11-04T12:00:00Z"));
    expect(await descifrarIdentidad(k, ref)).toEqual(identidad);
  });

  it("lo que sale a la nube es un bloque ilegible con llaves neutras: ni nombre ni RUT ni encabezados que los delaten", async () => {
    const k = await clave("contraseña-de-la-unidad");
    const ref = await cifrarIdentidad(k, identidad, new Date());
    expect(Object.keys(ref).sort()).toEqual(["dato", "episodioId", "registradoEn"]);
    const texto = JSON.stringify(ref);
    expect(texto).not.toMatch(/Rojas|Pedro|12345678|nombre|rut/i);
    expect(contieneDatoIdentificable(ref)).toEqual([]);
    expect(() => asegurarPayloadSinIdentidad(ref)).not.toThrow();
  });

  it("sin la clave correcta no se puede leer", async () => {
    const ref = await cifrarIdentidad(await clave("contraseña-de-la-unidad"), identidad, new Date());
    expect(await descifrarIdentidad(await clave("otra-contraseña-cualquiera"), ref)).toBeNull();
  });

  it("la fila de verificación detecta la contraseña equivocada y no cuenta como paciente", async () => {
    const buena = await clave("contraseña-de-la-unidad");
    const v = await crearReferenciaVerificacion(buena, new Date());
    expect(v.episodioId).toBe(ID_VERIFICACION);
    expect(await referenciaCorresponde(buena, v)).toBe(true);
    expect(await referenciaCorresponde(await clave("contraseña-equivocada"), v)).toBe(false);
    const p = await cifrarIdentidad(buena, identidad, new Date());
    expect(soloEpisodios([v, p])).toEqual([p]);
  });
});
