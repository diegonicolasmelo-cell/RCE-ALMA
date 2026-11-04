import { describe, expect, it } from "vitest";
import { camposAlma, claseModoAlma, componerNotaAlma } from "./nota-alma";
import type { EntradaNota } from "./nota-alma";
import { calcularPbw } from "./fisiologia";
import { firmarApkCumple } from "./apk";
import { unControl, unEpisodio, unEvento, unaVentilacion } from "./fixtures";
import type { EventoClinico } from "./tipos";

const AHORA = new Date(2026, 10, 4, 20, 0);

function entrada(over: Partial<EntradaNota> = {}): EntradaNota {
  return { episodio: unEpisodio(), controles: [unControl()], eventos: [], apk: [], modo: "TURNO_COMPLETO", ahora: AHORA, ...over };
}
const nota = (over: Partial<EntradaNota> = {}) => componerNotaAlma(entrada(over));

describe("nota de turno completo", () => {
  it("encabeza con la cama y nunca con el nombre del paciente", () => {
    const n = nota();
    expect(n).toContain("UCI-01");
    expect(n).toContain("EVOLUCIÓN KINESIOLOGÍA UPC");
    expect(n).not.toContain("Soto");
  });

  it("incluye la talla con su origen y el peso ideal", () => {
    expect(nota()).toContain("talla 172 cm (estimada) | peso ideal 67.8 kg");
  });

  it("hemodinamia con PAM calculada y el soporte cardiovascular", () => {
    const n = nota({ controles: [unControl({ infusiones: { noradrenalina: { dosis: 0.08, escalon: null }, vasopresina: { dosis: 0.02, escalon: null } } })] });
    expect(n).toContain("PAM 79 mmHg");
    expect(n).toContain("Noradrenalina 0.08 mcg/kg/min + Vasopresina 0.02 UI/min");
  });

  it("describe la sedoanalgesia con dosis y escalón", () => {
    expect(nota()).toContain("Fentanilo 1.2 mcg/kg/h (esc. 2)");
  });

  it("sin sedantes en curso informa estado de vigilia", () => {
    const n = nota({ controles: [unControl({ infusiones: {}, sas: null, vigilia: "SOMNOLIENTO" })] });
    expect(n).toContain("sin sedoanalgesia, estado de vigilia somnoliento");
  });

  it("informa la APK del turno y la producción", () => {
    const apk = firmarApkCumple({ id: "a", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: new Date(2026, 10, 4, 15, 5) });
    const n = nota({ apk: [apk], ahora: new Date(2026, 10, 4, 16, 0) });
    expect(n).toContain("APK de este turno: firmada 15:05");
    expect(n).toContain("Kinesiterapia respiratoria: 1 | Aspiraciones: 1");
  });

  it("avisa si no hay controles en vez de generar una nota vacía", () => {
    expect(nota({ controles: [] })).toBe("[SIN CONTROLES REGISTRADOS EN EL TURNO PARA UCI-01]");
  });
});

describe("programado vs paciente, y resultantes por modalidad", () => {
  it("ACVC: Vt programado y espirado con ml/kg, FR programada y total, volumen minuto, TI e I:E", () => {
    const n = nota();
    expect(n).toContain("Vt programado 430 ml (6.3 ml/kg PI)");
    expect(n).toContain("Vt espirado 430 ml (6.3 ml/kg PI)");
    expect(n).toContain("FR programada 18 / total 20 rpm");
    expect(n).toContain("volumen minuto 8.6 L/min");
    expect(n).toContain("TI 1 s (I:E 1:2)");
  });

  it("el Tobin NO aparece en modalidades controladas", () => {
    expect(nota()).not.toContain("Tobin");
  });

  it("el Tobin SÍ aparece en CPAP+PS", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, frProgramada: null, vtProgramado: null, flujo: null, ti: null, frTotal: 18, vtEspirado: 460 }) });
    const n = nota({ controles: [c] });
    expect(n).toContain("índice de Tobin 39");
    expect(n).toContain("P. soporte 7");
    expect(n).not.toContain("driving pressure");
  });

  it("CNAF reporta flujo e índice ROX, sin volúmenes", () => {
    const c = unControl({ viaAerea: "NATURAL", spo2: 94, ventilacion: unaVentilacion({ modalidad: "CNAF", fio2: 40, frTotal: 24, flujo: 50, vtProgramado: null, vtEspirado: null, peep: null }) });
    const n = nota({ episodio: unEpisodio({ viaAereaActual: "NATURAL" }), controles: [c] });
    expect(n).toContain("CNAF flujo 50 L/min");
    expect(n).toContain("índice ROX 9.79");
    expect(n).not.toContain("Vt espirado");
  });
});

/** La nota oficial no puede reportar una mecánica contaminada por esfuerzo activo. */
describe("candado de mecánica aplicado a la nota", () => {
  it("reporta ΔP y compliance cuando el plateau es válido", () => {
    const n = nota();
    expect(n).toContain("driving pressure 10");
    expect(n).toContain("compliance estática 43");
  });

  it("NO reporta plateau, ΔP ni compliance con asincronía en modalidad controlada", () => {
    const n = nota({ controles: [unControl({ ventilacion: unaVentilacion({ asincronico: true }) })] });
    expect(n).not.toContain("driving pressure");
    expect(n).not.toContain("compliance estática");
    expect(n).not.toContain("P.plateau");
    expect(n).toContain("mecánica estática no valorable");
  });

  it("sigue reportando lo que sí es real bajo asincronía", () => {
    const n = nota({ controles: [unControl({ ventilacion: unaVentilacion({ asincronico: true }) })] });
    expect(n).toContain("Vt espirado 430 ml");
    expect(n).toContain("volumen minuto 8.6");
  });
});

describe("eventos en la nota", () => {
  it("destaca una autoextubación como evento de seguridad", () => {
    const e = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({ tipo: "AUTOEXTUBACION", dispositivo: "CNAF", hora: "15:40", comentario: "Tracciona TET durante aseo." });
    const n = nota({ eventos: [e] });
    expect(n).toContain("EVENTOS DE SEGURIDAD DEL PACIENTE");
    expect(n).toContain("AUTOEXTUBACIÓN NO PLANIFICADA");
    expect(n).toContain("Notificado para gestión de riesgo");
  });

  it("un ajuste de tubo no se reporta como intubación", () => {
    const e = unEvento<Extract<EventoClinico, { tipo: "AJUSTE_TUBO" }>>({ tipo: "AJUSTE_TUBO", fijacionCm: "23", motivo: "CONTROL_RADIOLOGICO", hora: "11:00" });
    const n = nota({ eventos: [e] });
    expect(n).toContain("Ajuste de fijación a 23 cm (control radiológico)");
    expect(n).toContain("reintubaciones 0");
  });

  it("incluye los procedimientos nuevos: FBC, cultivo, traslado y filtro", () => {
    const evs: EventoClinico[] = [
      unEvento<Extract<EventoClinico, { tipo: "ASISTENCIA_FBC" }>>({ tipo: "ASISTENCIA_FBC", hora: "11:00" }),
      unEvento<Extract<EventoClinico, { tipo: "TOMA_CULTIVO" }>>({ tipo: "TOMA_CULTIVO", muestra: "Aspirado traqueal", hora: "11:05" }),
      unEvento<Extract<EventoClinico, { tipo: "CAMBIO_HMEF" }>>({ tipo: "CAMBIO_HMEF", hora: "11:10" })
    ];
    const n = nota({ eventos: evs });
    expect(n).toContain("Asistencia en fibrobroncoscopía");
    expect(n).toContain("Toma de cultivo (Aspirado traqueal)");
    expect(n).toContain("Cambio de filtro HMEF");
  });
});

describe("kine y secreciones", () => {
  it("la última atención informa aspiración, secreciones y terapia física", () => {
    const n = nota({ modo: "ULTIMA_ATENCION" });
    expect(n).toContain("Kinesiterapia respiratoria realizada con aspiración (TrachCare)");
    expect(n).toContain("Secreciones moderada, mucopurulenta, espesa");
    expect(n).toContain("Giros en cama / posicionamiento (IMS 1)");
  });

  it("terapia física contraindicada deja el motivo", () => {
    const c = unControl({ terapiaFisica: { estado: "CONTRAINDICADA", actividades: [], ims: null, motivoContraindicacion: "PIC fuera de meta" } });
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [c] })).toContain("Terapia física contraindicada (PIC fuera de meta)");
  });

  it("atribuye el control a su autor y marca el de apoyo", () => {
    const n = nota({ modo: "ULTIMA_ATENCION", controles: [unControl({ esControlApoyo: true })] });
    expect(n).toContain("Klgo. Diego Melo (control de apoyo)");
  });

  it("toma el último control cronológicamente aunque lleguen desordenados", () => {
    const c1 = unControl({ id: "a", numero: 1, hora: "09:10", registradoEn: "2026-11-04T12:10:00.000Z" });
    const c2 = unControl({ id: "b", numero: 2, hora: "14:20", registradoEn: "2026-11-04T17:20:00.000Z" });
    expect(nota({ modo: "ULTIMA_ATENCION", controles: [c2, c1] })).toContain("ATENCIÓN #2 (14:20 hrs)");
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
