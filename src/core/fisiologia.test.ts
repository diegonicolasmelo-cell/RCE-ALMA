import { describe, expect, it } from "vitest";
import {
  bandaProteccion,
  calcularDerivados,
  calcularGlasgow,
  calcularPam,
  calcularPbw,
  calcularPpc,
  indiceRox,
  indiceTobin,
  mlPorKg,
  opcionesVolumenObjetivo,
  relacionIE,
  semaforoPcf,
  volumenMinuto,
  volumenObjetivoMl
} from "./fisiologia";
import { OBJETIVOS_VT_ML_KG } from "./catalogos";
import { unControl, unaVentilacion } from "./fixtures";

describe("peso ideal (Devine)", () => {
  it("hombre de 172 cm", () => expect(calcularPbw(172, "M")).toBe(67.8));
  it("mujer de 162 cm usa la base femenina", () => expect(calcularPbw(162, "F")).toBe(54.2));
  it("una talla mal tipeada no produce un ml/kg absurdo (piso de 30 kg)", () => {
    expect(calcularPbw(20, "M")).toBe(30);
  });
});

/** El ejemplo de la unidad: hombre de 180 cm, peso ideal 75 kg. */
describe("guía de protección pulmonar", () => {
  const pbw = calcularPbw(180, "M");

  it("180 cm da un peso ideal de 75.1 kg", () => expect(pbw).toBe(75.1));

  it("6, 7 y 8 ml/kg son 450, 525 y 600 ml", () => {
    expect(volumenObjetivoMl(pbw, 6)).toBe(450);
    expect(volumenObjetivoMl(pbw, 7)).toBe(525);
    expect(volumenObjetivoMl(pbw, 8)).toBe(600);
  });

  it("ofrece las tres opciones que muestra la franja del teclado", () => {
    expect(opcionesVolumenObjetivo(pbw, OBJETIVOS_VT_ML_KG)).toEqual([
      { mlKg: 6, ml: 450 },
      { mlKg: 7, ml: 525 },
      { mlKg: 8, ml: 600 }
    ]);
  });

  it("600 ml son 8.0 ml/kg de peso ideal", () => expect(mlPorKg(600, pbw)).toBe(8));

  it("menor a 6 es ultraprotector; de 6 a 8 protector; mayor a 8 sobre la meta", () => {
    expect(bandaProteccion(5.9)).toBe("ULTRAPROTECTOR");
    expect(bandaProteccion(6)).toBe("PROTECTOR");
    expect(bandaProteccion(8)).toBe("PROTECTOR");
    expect(bandaProteccion(8.1)).toBe("SOBRE_META");
    expect(bandaProteccion(null)).toBeNull();
  });

  it("sin volumen no hay ml/kg", () => expect(mlPorKg(null, pbw)).toBeNull());
});

describe("presiones", () => {
  it("PAM = PAD + (PAS-PAD)/3", () => expect(calcularPam(120, 60)).toBe(80));
  it("falta un componente o PA incoherente → null", () => {
    expect(calcularPam(null, 60)).toBeNull();
    expect(calcularPam(60, 90)).toBeNull();
  });
  it("PPC solo con neuromonitoreo", () => {
    expect(calcularPpc(90, 19)).toBe(71);
    expect(calcularPpc(90, null)).toBeNull();
  });
});

describe("volumen minuto: volumen ESPIRADO por la frecuencia TOTAL", () => {
  it("590 ml a 20 rpm son 11.8 L/min", () => expect(volumenMinuto(590, 20)).toBe(11.8));
  it("sin alguno de los dos no se calcula", () => {
    expect(volumenMinuto(null, 20)).toBeNull();
    expect(volumenMinuto(590, null)).toBeNull();
  });
});

describe("relación I:E resultante", () => {
  it("TI 1 s a 20 rpm (ciclo de 3 s) → 1:2", () => expect(relacionIE(1, 20)).toBe("1:2"));
  it("TI 1.2 s a 22 rpm → 1:1.3", () => expect(relacionIE(1.2, 22)).toBe("1:1.3"));
  it("un TI mayor que el ciclo no produce una relación absurda", () => expect(relacionIE(4, 20)).toBeNull());
  it("falta un dato → null", () => {
    expect(relacionIE(null, 20)).toBeNull();
    expect(relacionIE(1, null)).toBeNull();
  });
});

describe("Tobin: SOLO modalidades espontáneas", () => {
  it("se calcula en CPAP+PS", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, frTotal: 18, vtEspirado: 460 }) });
    expect(calcularDerivados(c, 67.8).tobin).toBe(39);
  });

  it("NO se calcula en ACVC ni PCV aunque haya datos (no es correcto en controladas)", () => {
    for (const modalidad of ["ACVC", "PCV"] as const) {
      const c = unControl({ ventilacion: unaVentilacion({ modalidad, frTotal: 20, vtEspirado: 430 }) });
      expect(calcularDerivados(c, 67.8).tobin).toBeNull();
    }
  });

  it("la función pura sigue siendo FR / Vt en litros", () => expect(indiceTobin(20, 430)).toBe(47));
});

describe("ROX: solo CNAF", () => {
  it("(SpO2/FiO2)/FR", () => expect(indiceRox(94, 40, 24)).toBe(9.79));

  it("se calcula en CNAF y no en ventilación invasiva", () => {
    const cnaf = unControl({
      spo2: 94,
      ventilacion: unaVentilacion({ modalidad: "CNAF", fio2: 40, frTotal: 24, flujo: 50, vtEspirado: null, peep: null })
    });
    expect(calcularDerivados(cnaf, 67.8).rox).toBe(9.79);
    expect(calcularDerivados(unControl(), 67.8).rox).toBeNull();
  });

  it("en CNAF no hay volumen minuto ni banda de protección pulmonar", () => {
    const cnaf = unControl({ ventilacion: unaVentilacion({ modalidad: "CNAF", vtEspirado: null }) });
    const d = calcularDerivados(cnaf, 67.8);
    expect(d.volumenMinuto).toBeNull();
    expect(d.bandaGuia).toBeNull();
  });
});

describe("mecánica y derivados por modalidad", () => {
  const pbw = 67.8;

  it("ACVC sincrónico: ΔP, compliance con el volumen ESPIRADO, ml/kg", () => {
    const d = calcularDerivados(unControl(), pbw);
    expect(d.drivingPressure).toBe(10);
    expect(d.compliance).toBe(43);
    expect(d.vtEspiradoPorKg).toBe(6.3);
    expect(d.relacionIE).toBe("1:2");
  });

  it("la compliance usa el espirado, no el programado", () => {
    const c = unControl({ ventilacion: unaVentilacion({ vtProgramado: 600, vtEspirado: 500, pPlateau: 20, peep: 10 }) });
    expect(calcularDerivados(c, pbw).compliance).toBe(50);
  });

  it("con auto-PEEP se resta la PEEP total: Ppl 20, PEEP 5 + auto-PEEP 1 = 6, ΔP 14", () => {
    const c = unControl({ ventilacion: unaVentilacion({ vtEspirado: 420, pPlateau: 20, peep: 5, autoPeep: 1 }) });
    const d = calcularDerivados(c, pbw);
    expect(d.peepTotal).toBe(6);
    expect(d.drivingPressure).toBe(14);
    expect(d.compliance).toBe(30);
    const sinAuto = calcularDerivados(unControl({ ventilacion: unaVentilacion({ vtEspirado: 420, pPlateau: 20, peep: 5, autoPeep: null }) }), pbw);
    expect(sinAuto.peepTotal).toBe(5);
    expect(sinAuto.drivingPressure).toBe(15);
  });

  it("la guía de titulación es el programado en ACVC y el espirado en PCV", () => {
    const acvc = unControl({ ventilacion: unaVentilacion({ vtProgramado: 540, vtEspirado: 500 }) });
    expect(calcularDerivados(acvc, 67.8).mlKgGuia).toBe(8);
    const pcv = unControl({ ventilacion: unaVentilacion({ modalidad: "PCV", vtProgramado: null, presion: 15, vtEspirado: 500 }) });
    expect(calcularDerivados(pcv, 67.8).mlKgGuia).toBe(7.4);
  });

  it("ACVC: avisa posible fuga si programado y espirado difieren más de 10 %", () => {
    const fuga = unControl({ ventilacion: unaVentilacion({ vtProgramado: 600, vtEspirado: 500 }) });
    const ok = unControl({ ventilacion: unaVentilacion({ vtProgramado: 600, vtEspirado: 560 }) });
    expect(calcularDerivados(fuga, pbw).posibleFuga).toBe(true);
    expect(calcularDerivados(ok, pbw).posibleFuga).toBe(false);
  });

  it("sin plateau no hay mecánica estática", () => {
    const c = unControl({ ventilacion: unaVentilacion({ pPlateau: null }) });
    const d = calcularDerivados(c, pbw);
    expect(d.drivingPressure).toBeNull();
    expect(d.compliance).toBeNull();
  });

  it("CPAP+PS no calcula ΔP ni compliance", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, pPlateau: 18 }) });
    const d = calcularDerivados(c, pbw);
    expect(d.drivingPressure).toBeNull();
    expect(d.relacionIE).toBeNull();
  });
});

describe("Glasgow condicionado por vía aérea", () => {
  it("con vía artificial: verbal NT, total sobre 11T", () => {
    const g = calcularGlasgow({ ocular: 3, verbal: 1, motora: 5 }, "TET");
    expect(g.verbal).toBe("NT");
    expect(g.completo).toBe("9T/11T (O3 V:NT M5)");
  });
  it("ignora un verbal alto registrado en un paciente intubado", () => {
    expect(calcularGlasgow({ ocular: 3, verbal: 5, motora: 5 }, "TQT").total).toBe(9);
  });
  it("con vía natural: total sobre 15", () => {
    expect(calcularGlasgow({ ocular: 4, verbal: 5, motora: 6 }, "NATURAL").completo).toBe("15/15 (O4 V5 M6)");
  });
});

describe("flujo pico de tos", () => {
  it("clasifica según el corte institucional", () => {
    expect(semaforoPcf(null)).toBe("SIN_DATO");
    expect(semaforoPcf(40)).toBe("INSUFICIENTE");
    expect(semaforoPcf(57)).toBe("LIMITE");
    expect(semaforoPcf(70)).toBe("OPTIMO");
  });
});

describe("PCV: ΔP con presión pico si el ventilador no permite medir plateau", () => {
  const pbw = 67.8;
  const pcv = (over: Parameters<typeof unaVentilacion>[0]) =>
    unControl({ ventilacion: unaVentilacion({ modalidad: "PCV", vtProgramado: null, presion: 15, peep: 8, vtEspirado: 450, ...over }) });

  it("con plateau medido usa el plateau", () => {
    const d = calcularDerivados(pcv({ pPlateau: 20, pPico: 24 }), pbw);
    expect(d.drivingPressure).toBe(12);
    expect(d.origenDriving).toBe("PLATEAU");
  });

  it("sin plateau usa la presión pico y lo declara", () => {
    const d = calcularDerivados(pcv({ pPlateau: null, pPico: 24 }), pbw);
    expect(d.drivingPressure).toBe(16);
    expect(d.origenDriving).toBe("PICO");
    expect(d.compliance).toBe(28.1);
  });

  it("sin plateau ni pico no hay ΔP", () => {
    expect(calcularDerivados(pcv({ pPlateau: null, pPico: null }), pbw).drivingPressure).toBeNull();
  });

  it("la asincronía sigue invalidando aunque se use la presión pico", () => {
    const d = calcularDerivados(pcv({ pPlateau: null, pPico: 24, asincronico: true }), pbw);
    expect(d.drivingPressure).toBeNull();
    expect(d.leyendaMecanica).toContain("asincronía");
  });

  it("en ACVC la presión pico NO sustituye al plateau", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "ACVC", pPlateau: null, pPico: 25 }) });
    expect(calcularDerivados(c, pbw).drivingPressure).toBeNull();
  });
});

describe("volumen minuto: se anota el ESPIRADO que muestra el ventilador (no se calcula)", () => {
  it("vale lo que se escribió", () => {
    const c = unControl({ ventilacion: unaVentilacion({ volMinuto: 9.1 }) });
    expect(calcularDerivados(c, 67.8).volumenMinuto).toBe(9.1);
  });

  it("sin dato no se inventa uno a partir del Vt y la FR", () => {
    const c = unControl({ ventilacion: unaVentilacion({ volMinuto: null, vtEspirado: 590, frTotal: 20 }) });
    expect(calcularDerivados(c, 67.8).volumenMinuto).toBeNull();
  });

  it("en CNAF no hay volumen minuto aunque quede un valor escrito", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "CNAF", volMinuto: 9.1 }) });
    expect(calcularDerivados(c, 67.8).volumenMinuto).toBeNull();
  });
});

describe("neuromonitoreo y Glasgow bajo sedación", () => {
  it("el PPC sale de la PAM del mismo control y la PIC", () => {
    const c = unControl({ pas: 120, pad: 60, neuro: { etco2: 35, pic: 15, dveAlturaCmH2O: 15, dveAbierta: true } });
    expect(calcularDerivados(c, 67.8).ppc).toBe(65);
  });

  it("sin neuromonitoreo no hay PPC", () => {
    expect(calcularDerivados(unControl(), 67.8).ppc).toBeNull();
  });

  it("el Glasgow con sedación en curso se avisa como bajo sedación", () => {
    const c = unControl({ glasgow: { ocular: 3, verbal: 1, motora: 5 } });
    const d = calcularDerivados(c, 67.8);
    expect(d.glasgow?.completo).toBe("9T/11T (O3 V:NT M5)");
    expect(d.glasgowBajoSedacion).toBe(true);
  });

  it("sin sedación no se avisa", () => {
    const c = unControl({ infusiones: {}, sas: null, vigilia: "VIGIL_ALERTA", glasgow: { ocular: 4, verbal: 1, motora: 6 } });
    expect(calcularDerivados(c, 67.8).glasgowBajoSedacion).toBe(false);
  });
});
