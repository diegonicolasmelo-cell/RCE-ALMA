import { describe, expect, it } from "vitest";
import {
  asegurarPayloadSinIdentidad,
  contieneDatoIdentificable,
  serializarControlParaNube,
  serializarEpisodioParaNube
} from "./sanitizar";
import { unControl, unEpisodio } from "./fixtures";

/**
 * Frontera de minimizacion de datos.
 *
 * Apps Script y Sheets corren fuera del hospital y Apps Script NO puede leer la
 * IP del cliente: no hay allowlist por IP posible. Estos tests son la garantia
 * automatizada de que ningun dato identificable de paciente cruza esa frontera.
 */
describe("serializacion hacia la nube", () => {
  it("el episodio serializado no contiene llaves identificables", () => {
    const payload = serializarEpisodioParaNube(unEpisodio());
    expect(contieneDatoIdentificable(payload)).toEqual([]);
  });

  it("el control serializado no contiene llaves identificables", () => {
    const payload = serializarControlParaNube(unControl());
    expect(contieneDatoIdentificable(payload)).toEqual([]);
  });

  it("el episodio sube la cama, no una persona", () => {
    const payload = serializarEpisodioParaNube(unEpisodio({ cama: "UCI-07" }));
    expect(payload.cama).toBe("UCI-07");
    expect(Object.keys(payload)).not.toContain("nombre");
  });

  it("conserva la fisiologia completa: minimizar identidad no es perder datos clinicos", () => {
    const payload = serializarControlParaNube(unControl()) as Record<string, unknown>;
    expect(payload.fc).toBe(96);
    expect(payload.ventilacion).toMatchObject({ peep: 10, vtEspirado: 430, vtProgramado: 430 });
    expect(payload.infusiones).toMatchObject({ fentanilo: { dosis: 1.2, escalon: 2 } });
    expect(payload.kineResp).toMatchObject({ auscultacion: "Crépitos", cantidad: "MODERADA" });
  });

  it("marca el texto libre para revision: es el unico vector real de fuga", () => {
    const payload = serializarControlParaNube(unControl()) as Record<string, unknown>;
    expect(payload).toHaveProperty("textoLibreRevisado", false);
  });
});

describe("contieneDatoIdentificable", () => {
  it("detecta una llave prohibida en la raiz", () => {
    expect(contieneDatoIdentificable({ nombre: "Rojas, P." })).toEqual(["nombre"]);
  });

  it("detecta una llave prohibida anidada y devuelve su ruta", () => {
    const hallazgos = contieneDatoIdentificable({ paciente: { datos: { rut: "1-9" } } });
    expect(hallazgos).toEqual(["paciente.datos.rut"]);
  });

  it("detecta llaves prohibidas dentro de arreglos", () => {
    const hallazgos = contieneDatoIdentificable({ camas: [{ ficha: "123" }] });
    expect(hallazgos).toEqual(["camas[0].ficha"]);
  });

  it("es insensible a mayusculas", () => {
    expect(contieneDatoIdentificable({ RUT: "1-9" })).toEqual(["RUT"]);
  });

  it("permite rutAutor y rutTitular: identifican al profesional, no al paciente", () => {
    const payload = { rutAutor: "diego.melo@demo.upc", rutTitular: "diego.melo@demo.upc" };
    expect(contieneDatoIdentificable(payload)).toEqual([]);
  });
});

describe("asegurarPayloadSinIdentidad", () => {
  it("deja pasar un payload limpio", () => {
    const payload = serializarControlParaNube(unControl());
    expect(() => asegurarPayloadSinIdentidad(payload)).not.toThrow();
  });

  it("aborta la sincronia si se filtro un dato identificable", () => {
    // Es preferible perder una sincronia que filtrar un dato de paciente.
    const sucio = { ...serializarControlParaNube(unControl()), nombrePaciente: "Rojas, P." };
    expect(() => asegurarPayloadSinIdentidad(sucio)).toThrow(/datos identificables/);
  });

  it("el mensaje de error nombra la llave infractora para poder corregirla", () => {
    expect(() => asegurarPayloadSinIdentidad({ datos: { ficha: "99" } })).toThrow(/datos\.ficha/);
  });
});

