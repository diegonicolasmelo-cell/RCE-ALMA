import { describe, expect, it } from "vitest";
import { CRITERIOS_PVE, accesoPve, bloquesPostExtub, contrastarControlesPve, checklistDelTurno, criteriosAptos, estadoFlujoPve, puedeIniciarPve, registrosPve } from "./pve";
import { turnoDe } from "./turnos";
import type { EventoClinico, LecturasPve } from "./tipos";

const t = (h: number, m = 0, d = 4) => new Date(2026, 10, d, h, m);
const base = (ahora: Date, id: string) => ({
  id,
  episodioId: "ep-1",
  hora: `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`,
  registradoEn: ahora.toISOString(),
  rutAutor: "x",
  comentario: ""
});
const LECT: LecturasPve = { fc: 80, pas: 120, pad: 70, fr: 18, spo2: 96, gcs: 15, volMinuto: 7, trabajoResp: "", secreciones: "" };
const SI = Array(8).fill(true) as boolean[];

const checklist = (ahora: Date, criterios: boolean[] = SI): EventoClinico => ({
  ...base(ahora, "chk" + ahora.getTime()), tipo: "EVALUACION_PVE", criterios, apto: criteriosAptos(criterios), datos: "", extubacionFueraProtocolo: false
});
const inicio = (ahora: Date): EventoClinico[] => [
  { ...base(ahora, "ini" + ahora.getTime()), tipo: "INICIO_PVE", duracionMin: 30 },
  { ...base(ahora, "ci" + ahora.getTime()), tipo: "CONTROL_PVE", fase: "INICIAL", lecturas: LECT }
];
const extub = (ahora: Date): EventoClinico => ({ ...base(ahora, "ex" + ahora.getTime()), tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF" });

describe("checklist de PVE (8 criterios)", () => {
  it("son los 8 criterios de la hoja, con los textos del papel", () => {
    expect(CRITERIOS_PVE).toHaveLength(8);
    expect(CRITERIOS_PVE[0]).toBe("Resolución del cuadro");
    expect(CRITERIOS_PVE[7]).toBe("Hb ≥ 7");
  });

  it("apto solo si los 8 cumplen", () => {
    expect(criteriosAptos(SI)).toBe(true);
    expect(criteriosAptos([...SI.slice(0, 7), false])).toBe(false);
    expect(criteriosAptos(SI.slice(0, 7))).toBe(false);
  });

  it("sin checklist no se puede iniciar; con checklist no apto tampoco", () => {
    expect(puedeIniciarPve([], t(10))).toBe(false);
    expect(puedeIniciarPve([checklist(t(9), [true, true, false, true, true, true, true, true])], t(10))).toBe(false);
    expect(estadoFlujoPve([checklist(t(9), [false, ...SI.slice(1)])], t(10)).fase).toBe("NO_APTO");
  });

  it("con checklist apto se puede iniciar", () => {
    expect(puedeIniciarPve([checklist(t(9))], t(10))).toBe(true);
    expect(estadoFlujoPve([checklist(t(9))], t(10)).fase).toBe("APTO");
  });

  it("el checklist vale solo para su turno: el siguiente evalúa de nuevo", () => {
    const evs = [checklist(t(9))];
    expect(checklistDelTurno(evs, turnoDe(t(15)).clave)).not.toBeNull();
    expect(puedeIniciarPve(evs, t(21))).toBe(false);
    expect(estadoFlujoPve(evs, t(21)).fase).toBe("SIN_CHECKLIST");
  });

  it("si hay varios en el turno, vale el último", () => {
    const evs = [checklist(t(9), [false, ...SI.slice(1)]), checklist(t(11))];
    expect(estadoFlujoPve(evs, t(12)).fase).toBe("APTO");
  });
});

describe("PVE en curso: control inicial, cronómetro y 30 min", () => {
  it("el cronómetro parte con el control inicial", () => {
    const evs = [checklist(t(9)), ...inicio(t(10))];
    const e = estadoFlujoPve(evs, t(10, 12));
    expect(e.fase).toBe("EN_CURSO");
    expect(e.controlInicial).toBe(true);
    expect(e.control30).toBe(false);
    expect(e.pve.minutosTranscurridos).toBe(12);
    expect(e.pve.completa).toBe(false);
  });

  it("registra el control de los 30 min y la PVE queda cumplida", () => {
    const evs = [checklist(t(9)), ...inicio(t(10)), { ...base(t(10, 31), "c30"), tipo: "CONTROL_PVE", fase: "30MIN", lecturas: LECT } as EventoClinico];
    const e = estadoFlujoPve(evs, t(10, 32));
    expect(e.control30).toBe(true);
    expect(e.pve.completa).toBe(true);
  });

  it("no se puede iniciar otra PVE mientras hay una en curso", () => {
    expect(puedeIniciarPve([checklist(t(9)), ...inicio(t(10))], t(10, 5))).toBe(false);
  });

  it("al terminar queda 'terminada'", () => {
    const evs = [checklist(t(9)), ...inicio(t(10)), { ...base(t(10, 35), "fin"), tipo: "FIN_PVE", exitosa: false } as EventoClinico];
    expect(estadoFlujoPve(evs, t(10, 40)).fase).toBe("TERMINADA");
  });
});

describe("post extubación: 0, 30, 60, 120 min y 48 h", () => {
  const evs = [checklist(t(9)), ...inicio(t(10)), { ...base(t(10, 35), "fin"), tipo: "FIN_PVE", exitosa: true } as EventoClinico, extub(t(11))];

  it("tras extubar la fase es post extubación con las cinco horas calculadas", () => {
    const e = estadoFlujoPve(evs, t(11, 10));
    expect(e.fase).toBe("POST_EXTUBACION");
    const m = e.bloque!.momentos;
    expect(m.map((x) => x.id)).toEqual(["EXTUB", "30MIN", "60MIN", "120MIN", "48H"]);
    expect(m.map((x) => x.minutosFaltantes)).toEqual([-10, 20, 50, 110, 48 * 60 - 10]);
    expect(m.every((x) => !x.registrado)).toBe(true);
  });

  it("marca lo ya registrado", () => {
    const re = { ...base(t(11, 31), "r30"), tipo: "REEVAL_POST_EXTUB", momento: "30MIN", fc: 85, pam: 80, gcs: 15, fr: 20, fio2: 35, spo2: 95, trabajoResp: "", manejoSecreciones: "" } as EventoClinico;
    const m = bloquesPostExtub([...evs, re], t(11, 40))[0]!.momentos;
    expect(m.find((x) => x.id === "30MIN")!.registrado).toBe(true);
    expect(m.find((x) => x.id === "60MIN")!.registrado).toBe(false);
  });

  it("la falla post extubación queda en el bloque", () => {
    const falla = { ...base(t(13), "f"), tipo: "FALLA_POST_EXTUB", falla: true, hipotesis: "Fatiga muscular", observaciones: "" } as EventoClinico;
    expect(bloquesPostExtub([...evs, falla], t(13, 5))[0]!.falla?.hipotesis).toBe("Fatiga muscular");
  });

  it("una reintubación cierra el bloque", () => {
    const re = { ...base(t(12), "rt"), tipo: "REINTUBACION", via: "TET", calibre: "8.0", fijacionCm: "22" } as EventoClinico;
    const b = bloquesPostExtub([...evs, re], t(12, 5));
    expect(b[0]!.reintubado).toBe(true);
    expect(estadoFlujoPve([...evs, re], t(12, 5)).bloque).toBeNull();
  });

  it("dos extubaciones forman dos bloques independientes", () => {
    const re = { ...base(t(12), "rt"), tipo: "REINTUBACION", via: "TET", calibre: "8.0", fijacionCm: "22" } as EventoClinico;
    expect(bloquesPostExtub([...evs, re, extub(t(18))], t(18, 5))).toHaveLength(2);
  });
});

describe("hoja de registro de PVE", () => {
  it("agrupa cada PVE con su control inicial, 30 min y fin", () => {
    const evs = [
      checklist(t(9)), ...inicio(t(10)),
      { ...base(t(10, 31), "c30"), tipo: "CONTROL_PVE", fase: "30MIN", lecturas: LECT } as EventoClinico,
      { ...base(t(10, 35), "fin"), tipo: "FIN_PVE", exitosa: false } as EventoClinico,
      ...inicio(t(15, 0, 5))
    ];
    const r = registrosPve(evs);
    expect(r).toHaveLength(2);
    expect(r[0]!.inicio?.lecturas.fc).toBe(80);
    expect(r[0]!.treintaMin).not.toBeNull();
    expect(r[0]!.fin?.exitosa).toBe(false);
    expect(r[1]!.treintaMin).toBeNull();
    expect(r[1]!.numero).toBe(2);
  });
});

describe("entrada directa a la PVE desde la tarjeta de la cama", () => {
  it("un ventilado en CPAP/PS sin checklist: 'Evaluar PVE diaria'", () => {
    expect(accesoPve("TET", "CPAP_PS", [], t(9))).toEqual({ texto: "Evaluar PVE diaria", destacado: false });
  });

  it("en modalidad controlada queda a mano sin destacar; con vía aérea natural y nada pendiente no se ofrece", () => {
    expect(accesoPve("TET", "ACVC", [], t(9))).toEqual({ texto: "PVE", destacado: false });
    expect(accesoPve("TQT", null, [], t(9))).toEqual({ texto: "PVE", destacado: false });
    expect(accesoPve("NATURAL", "CPAP_PS", [], t(9))).toBeNull();
  });

  it("apto: 'Iniciar PVE'; no apto: lo dice; en curso: 'Continuar PVE'", () => {
    expect(accesoPve("TET", "CPAP_PS", [checklist(t(9))], t(9, 10))).toEqual({ texto: "Iniciar PVE", destacado: true });
    const no = SI.map((x, i) => (i === 0 ? false : x));
    expect(accesoPve("TET", "CPAP_PS", [checklist(t(9), no)], t(9, 10))?.texto).toMatch(/no apto/);
    expect(accesoPve("TET", "ACVC", [checklist(t(9)), ...inicio(t(10))], t(10, 5))).toEqual({ texto: "Continuar PVE", destacado: true });
  });

  it("extubado: avisa cuando toca un control post extubación, aunque ya tenga vía aérea natural", () => {
    const fin: EventoClinico = { ...base(t(10, 40), "fin"), tipo: "FIN_PVE", exitosa: true };
    const evs = [checklist(t(9)), ...inicio(t(10)), fin, extub(t(11))];
    expect(accesoPve("NATURAL", null, evs, t(11, 31))).toEqual({ texto: "Post extubación: registrar", destacado: true });
  });
});

describe("contraste del control de inicio con el de término", () => {
  it("pone lado a lado cada dato de la hoja con su diferencia", () => {
    const fin: LecturasPve = { ...LECT, fc: 96, fr: 26, pas: 135, spo2: 93, volMinuto: 7, trabajoResp: "Aumentado", secreciones: "Escasas" };
    const f = contrastarControlesPve({ ...LECT, trabajoResp: "Sin aumento", secreciones: "Escasas" }, fin);
    expect(f.map((x) => x.etiqueta)).toEqual(["Frec. cardiaca", "Frec. respiratoria", "Presión arterial", "SpO₂", "GCS", "Volumen minuto", "Trabajo respiratorio", "Secreciones bronquiales"]);
    expect(f[0]).toMatchObject({ inicio: "80", termino: "96", diferencia: "+16" });
    expect(f[2]).toMatchObject({ inicio: "120/70", termino: "135/70", diferencia: "+15" });
    expect(f[3]).toMatchObject({ diferencia: "-3" });
    expect(f[5]).toMatchObject({ diferencia: "=" });
    expect(f[6]).toMatchObject({ inicio: "Sin aumento", termino: "Aumentado", diferencia: null });
  });

  it("sin control de término, el inicio queda solo", () => {
    const f = contrastarControlesPve(LECT, null);
    expect(f[0]).toMatchObject({ inicio: "80", termino: "—", diferencia: null });
  });
});

describe("eventos guardados en el mismo instante", () => {
  it("el control inicial se reconoce aunque llegue antes que el inicio con la misma hora", () => {
    const [ini, ctl] = inicio(t(10));
    const r = registrosPve([checklist(t(9)), ctl!, ini!]).at(-1);
    expect(r?.inicio?.fase).toBe("INICIAL");
  });
});
