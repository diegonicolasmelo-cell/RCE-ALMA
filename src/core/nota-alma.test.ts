import { describe, expect, it } from "vitest";
import { camposAlma, claseModoAlma, componerNotaAlma } from "./nota-alma";
import { coma, diaDeEstadia, minusculaInicial, oracion } from "./texto-evolucion";
import type { EntradaNota } from "./nota-alma";
import { calcularPbw } from "./fisiologia";
import { unControl, unEpisodio, unEvento, unaVentilacion } from "./fixtures";
import type { EventoClinico } from "./tipos";

const AHORA = new Date(2026, 10, 4, 20, 0);

function entrada(over: Partial<EntradaNota> = {}): EntradaNota {
  return { episodio: unEpisodio(), controles: [unControl()], eventos: [], apk: [], modo: "TURNO_COMPLETO", ahora: AHORA, ...over };
}
const nota = (over: Partial<EntradaNota> = {}) => componerNotaAlma(entrada(over));

describe("texto en la prosa del RCE: forma", () => {
  it("sin encabezado, sin firma, sin nombre y sin «--» ni «no consignado»", () => {
    for (const modo of ["TURNO_COMPLETO", "ULTIMA_ATENCION"] as const) {
      const n = nota({ modo, controles: [unControl({ spo2: null, fc: null })] });
      expect(n).not.toMatch(/KINESIOLOG|Klgo\.|Profesional|--|no consignado|Soto/);
    }
  });

  it("el día del ingreso es el día 1 de estadía", () => {
    expect(diaDeEstadia(new Date(2026, 10, 10, 15).toISOString(), new Date(2026, 10, 16, 9))).toBe(7);
    expect(diaDeEstadia(new Date(2026, 10, 16, 1).toISOString(), new Date(2026, 10, 16, 9))).toBe(1);
  });

  it("abre con el día de estadía, el diagnóstico y la fase clínica escrita", () => {
    const n = nota({ episodio: unEpisodio({ ingresadoEn: "2026-11-01T15:00:00.000Z", faseClinica: "En proceso de weaning" }), diagnostico: "Neumonía grave" });
    expect(n.split("\n")[0]).toMatch(/^Paciente en día \d+ de estadía en UCI\. Dx: neumonía grave\.$/);
    expect(n.split("\n")[1]).toBe("En proceso de weaning.");
    expect(nota()).not.toContain("En proceso");
  });

  it("coma decimal y siglas intactas", () => {
    expect(coma(13.71)).toBe("13,7");
    expect(minusculaInicial("VNI con máscara")).toBe("VNI con máscara");
    expect(minusculaInicial("Neumonía")).toBe("neumonía");
    expect(oracion("hola. ")).toBe("Hola.");
  });

  it("sin controles lo dice en vez de armar un texto vacío", () => {
    expect(nota({ controles: [] })).toBe("Sin controles registrados.");
  });
});

describe("conciencia y hemodinamia", () => {
  it("sedoanalgesia con dosis y SAS; sin sedantes, la vigilia", () => {
    expect(nota({ modo: "ULTIMA_ATENCION" })).toContain("Sedoanalgesia con fentanilo 1,2 mcg/kg/h, SAS 3.");
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ infusiones: {}, sas: null, vigilia: "SOMNOLIENTO" })] })).toContain("Sin sedoanalgesia, somnoliento.");
  });

  it("GCS con tubo en T (verbal 1T) y sin tubo sobre 15; bajo sedación lo dice", () => {
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ glasgow: { ocular: 3, verbal: 1, motora: 5 } })] })).toContain("GCS 9T (O:3, V:1T, M:5) bajo sedación");
    const natural = unControl({ viaAerea: "NATURAL", infusiones: {}, sas: null, vigilia: "VIGIL_ALERTA", glasgow: { ocular: 4, verbal: 5, motora: 6 } });
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [natural] })).toContain("GCS 15/15 (O:4, V:5, M:6).");
  });

  it("HDN s/DVA, o c/DVA con las drogas; y la PAM calculada", () => {
    expect(nota({ modo: "ULTIMA_ATENCION" })).toContain("HDN s/DVA. FC 96 lpm, PA 112/62 mmHg (PAM 79 mmHg).");
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ infusiones: { noradrenalina: { dosis: 0.08, escalon: null }, vasopresina: { dosis: 0.02, escalon: null } } })] });
    expect(n).toContain("HDN c/DVA: noradrenalina 0,08 mcg/kg/min y vasopresina 0,02 UI/min.");
  });

  it("el resumen dice qué droga se suspendió en el turno", () => {
    const c1 = unControl({ id: "a", infusiones: { noradrenalina: { dosis: 0.05, escalon: null } } });
    const c2 = unControl({ id: "b", registradoEn: "2026-11-04T15:10:00.000Z", hora: "12:10", infusiones: {} });
    expect(nota({ controles: [c1, c2] })).toContain("HDN s/DVA al cierre; se suspende noradrenalina durante el turno.");
  });

  it("neuromonitoreo con el PPC calculado y la DVE expandida", () => {
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ neuro: { etco2: 35, pic: 15, dveAlturaCmH2O: 12, dveAbierta: false } })] });
    expect(n).toContain("Neuromonitoreo: PIC 15 mmHg (PPC 64 mmHg), EtCO₂ 35 mmHg, derivación ventricular externa (DVE) a 12 cmH₂O, cerrada.");
  });
});

describe("soporte y parámetros por modalidad", () => {
  it("ACVC: VAA, Vt programado con ml/kg, FR programada/total, VM, mecánica; sin Tobin", () => {
    const n = nota({ modo: "ULTIMA_ATENCION" });
    expect(n).toContain("VAA mediante TOT N° 8,0 a 22 cm de arcada dental, en VMI modo ACVC");
    expect(n).toContain("Vt programado 430 ml (6,3 ml/kg PI)");
    expect(n).toContain("FR 18/20 rpm");
    expect(n).toContain("VM 8,6 L/min");
    expect(n).toContain("P plateau 20 cmH₂O, DP 10 cmH₂O, Cest 43 ml/cmH₂O");
    expect(n).not.toContain("Tobin");
  });

  it("CPAP+PS: PS e índice de Tobin, sin mecánica estática", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, frProgramada: null, vtProgramado: null, flujo: null, ti: null, frTotal: 18, vtEspirado: 460, pPlateau: null, compliance: null }) });
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [c] });
    expect(n).toContain("PS 7 cmH₂O");
    expect(n).toContain("índice de Tobin 39");
    expect(n).not.toContain("DP ");
  });

  it("CNAF: ventila espontáneo, flujo e índice ROX, sin volúmenes", () => {
    const c = unControl({ viaAerea: "NATURAL", spo2: 94, ventilacion: unaVentilacion({ modalidad: "CNAF", fio2: 40, frTotal: 24, flujo: 50, temperatura: 37, vtProgramado: null, vtEspirado: null, peep: null }) });
    const n = nota({ modo: "ULTIMA_ATENCION", episodio: unEpisodio({ viaAereaActual: "NATURAL" }), controles: [c] });
    expect(n).toContain("Ventila espontáneo con apoyo de CNAF. Parámetros: flujo 50 L/min, T° 37 °C, FiO₂ 40%, FR 24 rpm, SpO₂ 94%, índice ROX 9,8.");
    expect(n).not.toContain("Vt espirado");
  });

  it("candado de mecánica: con asincronía no hay DP ni Cest, y lo dice", () => {
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ ventilacion: unaVentilacion({ asincronico: true }) })] });
    expect(n).not.toMatch(/DP \d|Cest|P plateau/);
    expect(n).toContain("mecánica estática no valorable por asincronía");
    expect(n).toContain("Vt espirado 430 ml");
  });

  it("PCV sin plateau: la DP declara que usa la presión pico", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "PCV", vtProgramado: null, flujo: null, presion: 15, peep: 8, pPlateau: null, pPico: 24, vtEspirado: 450 }) });
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [c] });
    expect(n).toContain("P control 15 cmH₂O");
    expect(n).toContain("DP 16 cmH₂O (con P pico)");
    expect(n).not.toContain("P plateau");
  });
});

describe("eventos: antes → evento → queda con", () => {
  const ev = <T extends EventoClinico["tipo"]>(tipo: T, iso: string, hora: string, resto: Record<string, unknown> = {}): EventoClinico =>
    unEvento({ tipo, registradoEn: iso, hora, ...resto } as never);

  it("PVE superada y extubación se cuentan juntas, con lo que queda después", () => {
    const c1 = unControl({ id: "c1", registradoEn: "2026-11-04T12:10:00.000Z", hora: "09:10", ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 8, frProgramada: null, vtProgramado: null, flujo: null, ti: null, peep: 6, fio2: 35, frTotal: 18, vtEspirado: 480, pPlateau: null, compliance: null }) });
    const extub = ev("EXTUBACION_PROGRAMADA", "2026-11-04T13:40:00.000Z", "10:40", { id: "x1", dispositivo: "CNAF" });
    const c2 = unControl({ id: "c2", registradoEn: "2026-11-04T14:00:00.000Z", hora: "11:00", eventoId: "x1", viaAerea: "NATURAL", spo2: 95, infusiones: {}, sas: null, vigilia: "VIGIL_ALERTA", glasgow: { ocular: 4, verbal: 5, motora: 6 },
      ventilacion: unaVentilacion({ modalidad: "CNAF", flujo: 40, temperatura: 37, fio2: 40, frTotal: 22, vtProgramado: null, vtEspirado: null, peep: null }) });
    const evs = [ev("INICIO_PVE", "2026-11-04T12:45:00.000Z", "09:45", { duracionMin: 30 }), ev("FIN_PVE", "2026-11-04T13:15:00.000Z", "10:15", { exitosa: true }), extub];
    const n = nota({ episodio: unEpisodio({ viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null }), controles: [c1, c2], eventos: evs });
    expect(n).toContain("Se realiza PVE según protocolo (30 min) a las 09:45 hrs con resultado superado, progresando a extubación programada a las 10:40 hrs.");
    expect(n).toContain("Queda con CNAF 40 L/min, T° 37 °C, FiO₂ 40%, FR 22 rpm, SpO₂ 95%, GCS 15/15 (O:4, V:5, M:6).");
    expect(n).toContain("en VMI modo CPAP+PS");
  });

  it("autoextubación y extubación accidental, con lo que pasó", () => {
    expect(nota({ eventos: [ev("AUTOEXTUBACION", "2026-11-04T13:00:00.000Z", "15:40", { dispositivo: "CNAF", comentario: "Tracciona TET durante aseo." })] })).toContain("Paciente se autoextuba a las 15:40 hrs. Tracciona TET durante aseo.");
    expect(nota({ eventos: [ev("AUTOEXTUBACION", "2026-11-04T13:00:00.000Z", "15:40", { dispositivo: "CNAF", accidental: true })] })).toContain("Extubación accidental a las 15:40 hrs.");
  });

  it("un ajuste de tubo no es intubación; los procedimientos se narran y los filtros no", () => {
    const n = nota({ eventos: [
      ev("AJUSTE_TUBO", "2026-11-04T13:00:00.000Z", "11:00", { fijacionCm: "23", motivo: "CONTROL_RADIOLOGICO" }),
      ev("ASISTENCIA_FBC", "2026-11-04T13:05:00.000Z", "11:05"),
      ev("TOMA_CULTIVO", "2026-11-04T13:06:00.000Z", "11:06", { muestra: "Aspirado traqueal" }),
      ev("CAMBIO_HMEF", "2026-11-04T13:10:00.000Z", "11:10")
    ] });
    expect(n).toContain("Se ajusta la fijación del TOT a 23 cm de arcada dental (control radiológico).");
    expect(n).not.toMatch(/intubación/i);
    expect(n).toContain("Se asiste fibrobroncoscopía a las 11:05 hrs.");
    expect(n).toContain("Se toma muestra de aspirado traqueal para cultivo.");
    expect(n).not.toMatch(/HME/);
  });

  it("PVE no realizada con su razón; un motivo «Otro» no se escribe", () => {
    const n = nota({ eventos: [
      ev("PVE_NO_REALIZADA", "2026-11-04T13:00:00.000Z", "10:00", { razon: "Secreciones abundantes" }),
      ev("TERAPIA_FISICA", "2026-11-04T13:30:00.000Z", "10:30", { realizada: false, nivel: null, ems: false, ims: null, motivo: "Otro" })
    ], controles: [unControl({ terapiaFisica: { estado: "NO", actividades: [], ims: null, motivoContraindicacion: null } })] });
    expect(n).toContain("No se realiza PVE en este turno por secreciones abundantes.");
    expect(n).toContain("KTM no realizada.");
  });
});

describe("kinesiterapia y secreciones", () => {
  it("KTM con nivel en palabras, IMT y educación", () => {
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ terapiaFisica: { estado: "NO", actividades: [], ims: null, motivoContraindicacion: null } })], eventos: [
      unEvento({ tipo: "TERAPIA_FISICA", realizada: true, nivel: 4, ems: true, ims: 5, motivo: null } as never),
      unEvento({ tipo: "IMT" } as never),
      unEvento({ tipo: "EDUCACION", dirigidaA: "FAMILIA" } as never)
    ] });
    expect(n).toContain("Se realiza KTM nivel 4 (bipedestación), con EMS, IMS 5.");
    expect(n).toContain("Se realiza IMT.");
    expect(n).toContain("Se realiza educación a la familia.");
  });

  it("la terapia física de los controles antiguos y la contraindicada", () => {
    expect(nota({ modo: "ULTIMA_ATENCION" })).toContain("Se realiza terapia física: giros en cama / posicionamiento.");
    const c = unControl({ terapiaFisica: { estado: "CONTRAINDICADA", actividades: [], ims: null, motivoContraindicacion: "PIC fuera de meta" } });
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [c] })).toContain("KTM contraindicada por PIC fuera de meta.");
  });

  it("auscultación y secreciones en una línea cada una; sin secreciones es un hallazgo", () => {
    const n = nota({ modo: "ULTIMA_ATENCION" });
    expect(n).toContain("Auscultación: Crépitos.");
    expect(n).toContain("Secreciones mucopurulentas espesas en moderada cantidad.");
    const c = unControl({ kineResp: { auscultacion: "", aspecto: "NINGUNA", reologia: null, cantidad: null, tos: "DEFICIENTE", flujoPicoTos: 55, deglucion: "AUSENTE" } });
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [c] })).toContain("Sin secreciones; tos deficiente, flujo pico de tos 55 L/min, deglución ausente.");
  });
});

describe("los dos modos", () => {
  it("el último control es el último cronológico aunque lleguen desordenados", () => {
    const c1 = unControl({ id: "a", hora: "09:10", registradoEn: "2026-11-04T12:10:00.000Z", fc: 96 });
    const c2 = unControl({ id: "b", hora: "14:20", registradoEn: "2026-11-04T17:20:00.000Z", fc: 77 });
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [c2, c1] })).toContain("FC 77 lpm");
  });

  it("el resumen es solo del turno del último control, cierra con la nota y el plan", () => {
    const ayer = unControl({ id: "y", registradoEn: "2026-11-03T12:10:00.000Z", kineResp: { auscultacion: "Sibilancias", aspecto: null, reologia: null, cantidad: null, tos: null, flujoPicoTos: null, deglucion: null } });
    const n = nota({ controles: [ayer, unControl()] });
    expect(n).not.toContain("Sibilancias");
    const lineas = n.split("\n");
    expect(lineas.at(-2)).toBe("Nota: Queda acoplado a VMI protectora.");
    expect(lineas.at(-1)).toBe("Plan: candidato a extubación si supera PVE vespertina.");
  });
});

describe("camposAlma: orden de ALMA y regla por modalidad", () => {
  const pbw = calcularPbw(172, "M");
  const valor = (c: ReturnType<typeof camposAlma>, et: string) => c.find((x) => x.etiqueta === et)?.valor;

  it("claseModoAlma", () => {
    expect(claseModoAlma("ACVC")).toBe("ac");
    expect(claseModoAlma("PCV")).toBe("pc");
    expect(claseModoAlma("CPAP_PS")).toBe("ps");
    expect(claseModoAlma("CNAF")).toBeNull();
  });

  it("ACVC: FR programada y Vol. Corriente Programado; el espirado y la FR total van a comentarios", () => {
    const c = camposAlma(unControl(), pbw);
    expect(valor(c, "FR programada")).toBe("18");
    expect(valor(c, "Vol. Corriente Programado")).toBe("430");
    expect(valor(c, "Espirado")).toBeUndefined();
    expect(valor(c, "Comentarios")).toContain("FR total 20");
    expect(valor(c, "Comentarios")).toContain("Vt espirado 430");
  });

  it("PCV: el volumen va como Espirado y la presión como Control", () => {
    const c = camposAlma(unControl({ ventilacion: unaVentilacion({ modalidad: "PCV", vtProgramado: null, presion: 15 }) }), pbw);
    expect(valor(c, "Espirado")).toBe("430");
    expect(valor(c, "Control")).toBe("15");
  });

  it("CPAP+PS: FR total y Soporte", () => {
    const c = camposAlma(unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, frTotal: 18 }) }), pbw);
    expect(valor(c, "FR total")).toBe("18");
    expect(valor(c, "Soporte")).toBe("7");
  });

  it("incluye volumen minuto e I:E resultantes", () => {
    const c = camposAlma(unControl(), pbw);
    expect(valor(c, "Vol. Minuto")).toBe("8.6");
    expect(valor(c, "I:E")).toBe("1:2");
  });

  it("la I:E anotada llega a ALMA aunque falten TI y flujo", () => {
    const c = camposAlma(unControl({ ventilacion: unaVentilacion({ ti: null, flujo: null, ie: 3 }) }), pbw);
    expect(valor(c, "I:E")).toBe("1:3");
  });

  it("con asincronía la compliance dice el motivo y no un número falso", () => {
    const c = camposAlma(unControl({ ventilacion: unaVentilacion({ asincronico: true }) }), pbw);
    expect(valor(c, "Compliance Estática")).toBe("no valorable (asincronía)");
    expect(valor(c, "Comentarios")).not.toContain("Plateau");
  });

  it("un dato no registrado queda en blanco (null), nunca cero", () => {
    const c = camposAlma(unControl({ ventilacion: unaVentilacion({ pMedia: null }) }), pbw);
    expect(valor(c, "Meseta (Pº Media)")).toBeNull();
    expect(valor(c, "Auto PEEP")).toBeNull();
  });

  it("SAS en blanco como guion si no hay sedoanalgesia", () => {
    expect(valor(camposAlma(unControl({ infusiones: {}, sas: null, vigilia: "COMA" }), pbw), "SAS")).toBe("—");
  });
});

describe("novedades: PCV con presión pico, Glasgow, neuromonitoreo y equipos", () => {
  const pcvSinPlateau = unControl({
    ventilacion: unaVentilacion({ modalidad: "PCV", vtProgramado: null, flujo: null, presion: 15, peep: 8, pPlateau: null, pPico: 24, vtEspirado: 450 })
  });

  it("camposAlma incluye Modelo Ventilador y Tipo de Humidificación según los equipos", () => {
    const equipos = [
      { tipo: "VENTILADOR", modelo: "Vela", numero: 8, enUso: true },
      { tipo: "HUMIDIFICADOR", modelo: "Humidificador MR850", numero: 2, enUso: true }
    ] as const;
    const c = camposAlma(unControl(), 67.8, equipos);
    expect(c.find((x) => x.etiqueta === "Modelo Ventilador")?.valor).toBe("Vela 8");
    expect(c.find((x) => x.etiqueta === "Tipo de Humidificación")?.valor).toBe("Humidificador MR850 2");
  });

  it("PCV sin plateau: el comentario de ALMA dice que la P. Distensión usa la presión pico", () => {
    const c = camposAlma(pcvSinPlateau, 67.8);
    expect(c.find((x) => x.etiqueta === "Comentarios")?.valor).toContain("P. Distensión 16 (con P. pico)");
  });
});

describe("catálogo de modalidades", () => {
  it("en CPAP+PS importa la presión pico y no la media", async () => {
    const { CAMPOS_POR_MODALIDAD } = await import("./catalogos");
    const campos = CAMPOS_POR_MODALIDAD.CPAP_PS.map((c) => c.campo);
    expect(campos).toContain("pPico");
    expect(campos).not.toContain("pMedia");
  });

  it("en PCV solo van TI y presión de control (sin flujo ni volumen programado); en ACVC TI y flujo van separados", async () => {
    const { CAMPOS_POR_MODALIDAD } = await import("./catalogos");
    const pcv = CAMPOS_POR_MODALIDAD.PCV.map((c) => c.campo);
    expect(pcv).toContain("ti");
    expect(pcv).not.toContain("flujo");
    expect(pcv).not.toContain("vtProgramado");
    const acvc = CAMPOS_POR_MODALIDAD.ACVC.map((c) => c.campo);
    expect(acvc).toContain("ti");
    expect(acvc).toContain("flujo");
  });

  it("amiodarona está como antiarrítmico y su unidad figura sin confirmar", async () => {
    const { INFUSIONES } = await import("./catalogos");
    const a = INFUSIONES.find((i) => i.id === "amiodarona");
    expect(a?.grupo).toBe("ANTIARRITMICO");
    expect(a?.unidadConfirmada).toBe(false);
    expect(INFUSIONES.filter((i) => i.unidadConfirmada === false).map((i) => i.id)).toEqual(["amiodarona", "rocuronio", "vecuronio", "atracurio"]);
  });
});
