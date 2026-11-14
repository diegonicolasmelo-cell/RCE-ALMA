import { describe, expect, it } from "vitest";
import { aplicarDictado, interpretarDictado, resolverDudas } from "./dictado";
import { crearBorradorNuevoControl } from "./borrador";
import { unEpisodio } from "./fixtures";

const ejemplo =
  "Frecuencia cardíaca 93, presión arterial 94 sobre 53, noradrenalina cero coma cero uno, Precedex cero coma cero dos, fentanilo tres coma seis, midazolam cero coma cero seis, volumen control, volumen corriente 360, PEEP ocho, frecuencia programada 22, tiempo inspiratorio uno, PEEP ocho, FiO₂ 35, saturación 94, frecuencia respiratoria del paciente 22.";

const mapa = (r: ReturnType<typeof interpretarDictado>) => Object.fromEntries(r.datos.map((d) => [d.campo, d.valor]));

describe("dictado por voz: el ejemplo de la especificación", () => {
  const r = interpretarDictado(ejemplo, "CPAP_PS", "TET");
  it("reconoce signos vitales y ventilación y cambia el modo a ACVC", () => {
    expect(mapa(r)).toEqual({ fc: "93", pas: "94", pad: "53", spo2: "94", modalidad: "ACVC", vtProgramado: "360", peep: "8", frProgramada: "22", ti: "1", fio2: "35", frTotal: "22" });
  });
  it("la PEEP dicha dos veces igual queda una sola, sin conflicto", () => {
    expect(r.datos.find((d) => d.campo === "peep")?.veces).toBe(2);
    expect(r.dudas).toEqual([]);
  });
  it("las infusiones se reconocen con su valor pero no se aplican", () => {
    expect(r.infusiones).toEqual([
      { nombre: "Noradrenalina", valor: "0,01" },
      { nombre: "Precedex", valor: "0,02" },
      { nombre: "Fentanilo", valor: "3,6" },
      { nombre: "Midazolam", valor: "0,06" }
    ]);
  });
  it("al aplicar solo cambia lo dictado; lo demás queda como estaba", () => {
    const b = crearBorradorNuevoControl(unEpisodio({ viaAereaActual: "TET" }), null, "k", []);
    const b2 = aplicarDictado({ ...b, s5q: "3" }, r.datos);
    expect(b2.fc).toBe("93");
    expect(b2.modalidad).toBe("ACVC");
    expect(b2.vent.fio2).toBe("35");
    expect(b2.vent.pPico).toBe(b.vent.pPico);
    expect(b2.s5q).toBe("3");
    expect(b2.infusiones).toEqual(b.infusiones);
  });
});

describe("dictado por voz: lo dudoso no se decide solo", () => {
  it("PEEP 8 y PEEP 10 es conflicto y hay que elegir", () => {
    const r = interpretarDictado("peep 8, peep 10", "ACVC", "TET");
    expect(r.datos.some((d) => d.campo === "peep")).toBe(false);
    expect(r.dudas[0]).toMatchObject({ tipo: "CONFLICTO" });
    expect(r.dudas[0]?.opciones.map((o) => o.etiqueta)).toEqual(["8", "10", "Descartar"]);
    expect(resolverDudas(r, { [r.dudas[0]!.id]: r.dudas[0]!.opciones[1]! })).toEqual([{ campo: "peep", valor: "10", veces: 1 }]);
  });
  it("«PIP 8» pregunta si es PEEP o presión pico: nunca la convierte sola", () => {
    const r = interpretarDictado("PIP 8", "ACVC", "TET");
    expect(r.datos).toEqual([]);
    expect(r.dudas[0]?.tipo).toBe("PIP");
    expect(r.dudas[0]?.opciones.map((o) => o.etiqueta)).toEqual(["PEEP", "P. pico", "Descartar"]);
  });
  it("si la opción cae en un dato ya dictado con otro valor, lo dice: «PEEP (reemplaza 8)»", () => {
    const r = interpretarDictado("peep 8, pip 24", "ACVC", "TET");
    expect(r.dudas[0]?.opciones.map((o) => o.etiqueta)).toEqual(["PEEP (reemplaza 8)", "P. pico", "Descartar"]);
  });
  it("«frecuencia 22» a secas pregunta si es la programada o la del paciente cuando el modo tiene las dos", () => {
    expect(interpretarDictado("frecuencia 22", "ACVC", "TET").dudas[0]?.tipo).toBe("FR");
    // En CPAP+PS solo existe la del paciente: no hay duda.
    expect(mapa(interpretarDictado("frecuencia respiratoria 22", "CPAP_PS", "TET"))).toEqual({ frTotal: "22" });
  });
  it("valores imposibles o invertidos quedan para revisar", () => {
    const r = interpretarDictado("fio2 350, saturación 104, presión arterial 50 sobre 90", "ACVC", "TET");
    expect(r.datos).toEqual([]);
    expect(r.dudas.map((d) => d.id).sort()).toEqual(["pa-invertida", "rango-fio2", "rango-spo2"]);
    expect(r.dudas.find((d) => d.id === "rango-fio2")?.opciones.map((o) => o.etiqueta)).toEqual(["Descartar"]);
  });
  it("lo que no existe en el modo del paciente no se aplica", () => {
    const r = interpretarDictado("flujo 40, peep 6, presión de soporte 10", "CPAP_PS", "TET");
    expect(mapa(r)).toEqual({ peep: "6", presion: "10" });
    expect(r.noAplica[0]).toMatch(/Flujo 40/);
  });
  it("un modo que no corresponde a la vía aérea no se aplica", () => {
    const r = interpretarDictado("cánula nasal de alto flujo, flujo 50", "ACVC", "TET");
    expect(r.datos.some((d) => d.campo === "modalidad")).toBe(false);
    expect(r.noAplica[0]).toMatch(/CNAF/);
  });
});

describe("dictado por voz: números", () => {
  it("palabras, decimales con coma o punto, presión «con» y escrita «/»", () => {
    expect(mapa(interpretarDictado("presión arterial ciento veinte con setenta y cinco", "ACVC", "TET"))).toEqual({ pas: "120", pad: "75" });
    expect(mapa(interpretarDictado("PA 118/64, sat 97 %", "ACVC", "TET"))).toEqual({ pas: "118", pad: "64", spo2: "97" });
    expect(mapa(interpretarDictado("tiempo inspiratorio uno coma dos, volumen corriente trescientos sesenta", "ACVC", "TET"))).toEqual({ vtProgramado: "360", ti: "1,2" });
    expect(mapa(interpretarDictado("ti 0.9", "ACVC", "TET"))).toEqual({ ti: "0,9" });
  });
  it("en CPAP+PS «volumen corriente» es el Vt espirado", () => {
    expect(mapa(interpretarDictado("volumen corriente 420", "CPAP_PS", "TET"))).toEqual({ vtEspirado: "420" });
  });
});
