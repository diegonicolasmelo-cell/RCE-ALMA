import { describe, expect, it } from "vitest";
import { aplicarDictado, interpretarDictado, resolverDudas } from "./dictado";
import { crearBorradorNuevoControl, iniciarInfusion } from "./borrador";
import { unControl, unEpisodio } from "./fixtures";

const ejemplo =
  "Frecuencia cardíaca 93, presión arterial 94 sobre 53, noradrenalina cero coma cero uno, Precedex cero coma cero dos, fentanilo tres coma seis, midazolam cero coma cero seis, volumen control, volumen corriente 360, PEEP ocho, frecuencia programada 22, tiempo inspiratorio uno, PEEP ocho, FiO₂ 35, saturación 94, frecuencia respiratoria del paciente 22.";

const mapa = (r: ReturnType<typeof interpretarDictado>) => Object.fromEntries(r.datos.map((d) => [d.campo, d.valor]));
const borrador = (via: "TET" | "NATURAL" = "TET") => crearBorradorNuevoControl(unEpisodio({ viaAereaActual: via }), null, "k", []);

describe("dictado por voz: el ejemplo de la especificación", () => {
  const b = borrador();
  const r = interpretarDictado(ejemplo, "CPAP_PS", "TET", { b });
  it("reconoce signos vitales, infusiones y ventilación, y cambia el modo a ACVC", () => {
    expect(mapa(r)).toEqual({
      fc: "93", pas: "94", pad: "53", spo2: "94", modalidad: "ACVC", vtProgramado: "360", peep: "8", frProgramada: "22", ti: "1", fio2: "35", frTotal: "22",
      "inf:noradrenalina": "0,01", "inf:dexmedetomidina": "0,02", "inf:fentanilo": "3,6", "inf:midazolam": "0,06"
    });
  });
  it("la PEEP dicha dos veces igual queda una sola, sin preguntas", () => {
    expect(r.datos.find((d) => d.campo === "peep")?.veces).toBe(2);
    expect(r.dudas).toEqual([]);
  });
  it("al aplicar se escriben las casillas y se inician las infusiones con su dosis; lo no dictado no se toca", () => {
    const b2 = aplicarDictado({ ...b, s5q: "3" }, r.datos);
    expect(b2.fc).toBe("93");
    expect(b2.modalidad).toBe("ACVC");
    expect(b2.vent.fio2).toBe("35");
    expect(b2.vent.pPico).toBe(b.vent.pPico);
    expect(b2.s5q).toBe("3");
    expect(b2.infusiones.noradrenalina).toMatchObject({ activa: true, dosis: "0,01" });
    expect(b2.infusiones.fentanilo).toMatchObject({ activa: true, dosis: "3,6" });
    expect(b2.infusiones.propofol.activa).toBe(false);
  });
});

describe("dictado por voz: reglas de la unidad", () => {
  it("«PIP» es PEEP", () => {
    expect(mapa(interpretarDictado("PIP 8", "ACVC", "TET"))).toEqual({ peep: "8" });
  });
  it("«frecuencia» a secas es la FR total", () => {
    expect(mapa(interpretarDictado("frecuencia 22", "ACVC", "TET"))).toEqual({ frTotal: "22" });
    expect(mapa(interpretarDictado("frecuencia respiratoria 18", "CPAP_PS", "TET"))).toEqual({ frTotal: "18" });
    expect(mapa(interpretarDictado("frecuencia cardiaca 80", "ACVC", "TET"))).toEqual({ fc: "80" });
  });
  it("PEEP 8 y PEEP 10 es conflicto y hay que elegir", () => {
    const r = interpretarDictado("peep 8, peep 10", "ACVC", "TET");
    expect(r.datos.some((d) => d.campo === "peep")).toBe(false);
    expect(r.dudas[0]?.opciones.map((o) => o.etiqueta)).toEqual(["8", "10", "Descartar"]);
    expect(resolverDudas(r, { [r.dudas[0]!.id]: r.dudas[0]!.opciones[1]! })).toEqual([{ campo: "peep", valor: "10", veces: 1 }]);
  });
  it("los valores imposibles o invertidos no se aplican y quedan anotados", () => {
    const r = interpretarDictado("fio2 350, saturación 104, presión arterial 50 sobre 90, frecuencia cardiaca 80", "ACVC", "TET");
    expect(mapa(r)).toEqual({ fc: "80" });
    expect(r.dudas).toEqual([]);
    expect(r.noAplica.join(" | ")).toMatch(/FiO₂ 350: fuera de rango.*SpO₂ 104: fuera de rango.*Presión 50\/90/);
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

describe("dictado por voz: «igual» y «sin cambios»", () => {
  const anterior = unControl({ fc: 88, pas: 120, pad: 70, sas: 3, glasgow: { ocular: 3, verbal: 1, motora: 5 } });
  it("repite el valor del control anterior, también en infusiones y Glasgow", () => {
    const b = iniciarInfusion(borrador(), "fentanilo");
    const ant = { ...anterior, infusiones: { fentanilo: { dosis: 1.2, escalon: null } } } as typeof anterior;
    const r = interpretarDictado("frecuencia cardiaca igual, presión sin cambios, PEEP igual, fentanilo igual, glasgow igual, SAS se mantiene", "ACVC", "TET", { b, anterior: ant });
    expect(mapa(r)).toMatchObject({ fc: "88", pas: "120", pad: "70", "inf:fentanilo": "1,2", gcsO: "3", gcsM: "5", sas: "3" });
    expect(r.datos.find((d) => d.campo === "fc")?.igual).toBe(true);
  });
  it("sin control anterior, «igual» no se aplica", () => {
    const r = interpretarDictado("PEEP igual", "ACVC", "TET");
    expect(r.datos).toEqual([]);
    expect(r.noAplica[0]).toMatch(/no hay valor anterior/);
  });
});

describe("dictado por voz: infusiones, SAS y Glasgow", () => {
  it("dosis, escalón y suspensión", () => {
    const b = iniciarInfusion(borrador(), "midazolam");
    const r = interpretarDictado("noradrenalina 0,08, fentanilo escalón 2, midazolam suspendido", "ACVC", "TET", { b });
    expect(r.datos.find((d) => d.campo === "inf:noradrenalina")?.valor).toBe("0,08");
    expect(Number(r.datos.find((d) => d.campo === "inf:fentanilo")?.valor.replace(",", "."))).toBeGreaterThan(0);
    expect(r.datos.find((d) => d.campo === "inf:midazolam")?.valor).toBe("suspender");
    const b2 = aplicarDictado(b, r.datos);
    expect(b2.infusiones.midazolam.activa).toBe(false);
  });
  it("SAS solo con sedación en curso (o dictada en el mismo control)", () => {
    expect(interpretarDictado("SAS 3", "ACVC", "TET", { b: borrador() }).noAplica[0]).toMatch(/sin sedación/);
    expect(mapa(interpretarDictado("fentanilo 1, SAS 3", "ACVC", "TET", { b: borrador() }))).toMatchObject({ sas: "3" });
    expect(mapa(interpretarDictado("SAS tres", "ACVC", "TET", { b: iniciarInfusion(borrador(), "propofol") }))).toEqual({ sas: "3" });
  });
  it("Glasgow: «4 5 6», con tubo «3 T 5» o «3 5», por componente, y el total solo no se aplica", () => {
    expect(mapa(interpretarDictado("glasgow 4 5 6", "O2_NARICERA", "NATURAL"))).toEqual({ gcsO: "4", gcsV: "5", gcsM: "6" });
    expect(mapa(interpretarDictado("glasgow cuatro cinco seis", "O2_NARICERA", "NATURAL"))).toEqual({ gcsO: "4", gcsV: "5", gcsM: "6" });
    expect(mapa(interpretarDictado("glasgow 3 T 5", "ACVC", "TET"))).toEqual({ gcsO: "3", gcsM: "5" });
    expect(mapa(interpretarDictado("glasgow 3 5", "ACVC", "TET"))).toEqual({ gcsO: "3", gcsM: "5" });
    expect(mapa(interpretarDictado("ocular 2, motor 4", "ACVC", "TET"))).toEqual({ gcsO: "2", gcsM: "4" });
    const r = interpretarDictado("glasgow 15", "O2_NARICERA", "NATURAL");
    expect(r.datos).toEqual([]);
    expect(r.noAplica[0]).toMatch(/dicta ocular, verbal y motor/);
    const b2 = aplicarDictado(borrador("NATURAL"), interpretarDictado("glasgow 4 5 6", "O2_NARICERA", "NATURAL").datos);
    expect(b2.glasgow).toEqual({ ocular: 4, verbal: 5, motora: 6 });
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

describe("dictado por voz: Glasgow en orden, infusiones sin cambios y modos según la vía", () => {
  it("Glasgow siempre ocular, verbal, motor; con tubo el verbal es T (si dicen 1 es el del tubo)", () => {
    expect(mapa(interpretarDictado("glasgow uno ocular, tubo y cuatro", "ACVC", "TET"))).toEqual({ gcsO: "1", gcsM: "4" });
    expect(mapa(interpretarDictado("glasgow 2 1 4, glasgow 7", "ACVC", "TET"))).toEqual({ gcsO: "2", gcsM: "4" });
    expect(mapa(interpretarDictado("glasgow 7, 2 1 4", "O2_NARICERA", "NATURAL"))).toEqual({ gcsO: "2", gcsV: "1", gcsM: "4" });
    expect(mapa(interpretarDictado("glasgow uno uno tres", "O2_NARICERA", "NATURAL"))).toEqual({ gcsO: "1", gcsV: "1", gcsM: "3" });
    expect(mapa(interpretarDictado("uno ocular, cuatro motor", "ACVC", "TET"))).toEqual({ gcsO: "1", gcsM: "4" });
    // Sin tubo hacen falta los tres.
    expect(interpretarDictado("glasgow 3 5", "O2_NARICERA", "NATURAL").datos).toEqual([]);
  });
  it("«infusiones sin cambios» repite todas las que están en curso; también una por una o «mismo escalón»", () => {
    let b = iniciarInfusion(borrador(), "fentanilo");
    b = iniciarInfusion(b, "noradrenalina");
    b = { ...b, infusiones: { ...b.infusiones, noradrenalina: { ...b.infusiones.noradrenalina, dosis: "0,05" } } };
    expect(mapa(interpretarDictado("drogas activas sin cambios", "ACVC", "TET", { b }))).toEqual({ "inf:fentanilo": b.infusiones.fentanilo.dosis.replace(".", ","), "inf:noradrenalina": "0,05" });
    expect(mapa(interpretarDictado("midazolam... no, fentanilo mismo escalón", "ACVC", "TET", { b }))).toEqual({ "inf:fentanilo": b.infusiones.fentanilo.dosis.replace(".", ",") });
    expect(mapa(interpretarDictado("medazolam 0,04", "ACVC", "TET", { b }))).toEqual({ "inf:midazolam": "0,04" });
  });
  it("modos: ACVC, ACPC, CPAP con tubo es CPAP+PS; con vía natural es VNI CPAP; CNAF por TQT", () => {
    const modo = (t: string, actual: Parameters<typeof interpretarDictado>[1], via: Parameters<typeof interpretarDictado>[2]) => interpretarDictado(t, actual, via).datos.find((d) => d.campo === "modalidad")?.valor;
    expect(modo("acbc", "CPAP_PS", "TET")).toBe("ACVC");
    expect(modo("a c p c", "ACVC", "TET")).toBe("PCV");
    expect(modo("cpap", "ACVC", "TET")).toBe("CPAP_PS");
    expect(modo("cpap más presión de soporte", "ACVC", "TQT")).toBe("CPAP_PS");
    expect(modo("cpap", "O2_NARICERA", "NATURAL")).toBe("VNI_CPAP");
    expect(modo("cenaf", "O2_NARICERA", "NATURAL")).toBe("CNAF");
    expect(modo("cnaf", "ACVC", "TQT")).toBe("CNAF_TQT");
    expect(modo("mascarilla multivent", "CNAF", "NATURAL")).toBe("O2_VENTURI");
    expect(modo("naricera", "CNAF", "NATURAL")).toBe("O2_NARICERA");
    expect(modo("bni st", "CNAF", "NATURAL")).toBe("VNI_ST");
    expect(modo("avaps", "ACVC", "TQT")).toBe("AVAPS");
    // «VNI» a secas con vía natural pregunta CPAP o S/T.
    expect(interpretarDictado("bni", "CNAF", "NATURAL").dudas[0]?.tipo).toBe("MODO");
    // «CPAP 8» con vía natural es la presión de la interfaz.
    expect(mapa(interpretarDictado("cpap 8", "O2_NARICERA", "NATURAL"))).toEqual({ modalidad: "VNI_CPAP", peep: "8" });
    expect(interpretarDictado("aire ambiental", "CNAF", "NATURAL").noAplica[0]).toMatch(/Aire ambiente/);
  });
});
