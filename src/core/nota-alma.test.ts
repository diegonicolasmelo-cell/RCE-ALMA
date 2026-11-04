import { describe, expect, it } from "vitest";
import { casillasAlma, componerNotaAlma } from "./nota-alma";
import { calcularPbw } from "./fisiologia";
import { unControl, unEpisodio, unEsfuerzo, unEvento, unSoporte } from "./fixtures";
import type { EntradaNota } from "./nota-alma";
import type { EventoClinico } from "./tipos";

const AHORA = new Date("2026-11-04T20:00:00.000Z");

function entrada(over: Partial<EntradaNota> = {}): EntradaNota {
  return {
    episodio: unEpisodio(),
    controles: [unControl()],
    eventos: [],
    apk: [],
    modo: "TURNO_COMPLETO",
    ahora: AHORA,
    ...over
  };
}

describe("nota de turno completo", () => {
  it("encabeza con la cama, nunca con el nombre del paciente", () => {
    const nota = componerNotaAlma(entrada());
    expect(nota).toContain("UCI-01");
    expect(nota).toContain("EVOLUCION KINESIOLOGIA UPC");
    expect(nota).not.toContain("Soto");
  });

  it("incluye hemodinamia con PAM calculada", () => {
    const nota = componerNotaAlma(entrada());
    expect(nota).toContain("PA 112/62 mmHg");
    expect(nota).toContain("PAM 79 mmHg");
  });

  it("reporta Glasgow con verbal NT en paciente intubado", () => {
    expect(componerNotaAlma(entrada())).toContain("9T/11T (O3 V:NT M5)");
  });

  it("describe la sedoanalgesia con dosis y escalon", () => {
    expect(componerNotaAlma(entrada())).toContain("Fentanilo 1.2 mcg/kg/h (esc. 2)");
  });

  it("incluye la produccion kinesica del turno", () => {
    const nota = componerNotaAlma(entrada());
    expect(nota).toContain("PRODUCCION KINESICA DEL TURNO (1 controles)");
    expect(nota).toContain("Kinesiterapia respiratoria: 1");
  });

  it("cierra con el plan de entrega de turno", () => {
    expect(componerNotaAlma(entrada())).toContain("PLAN / ENTREGA DE TURNO: Candidato a extubacion");
  });

  it("avisa explicitamente si no hay controles en vez de generar una nota vacia", () => {
    expect(componerNotaAlma(entrada({ controles: [] }))).toBe(
      "[SIN CONTROLES REGISTRADOS EN EL TURNO PARA UCI-01]"
    );
  });
});

/**
 * El test que da credibilidad clinica a la plataforma: la nota oficial no puede
 * reportar una mecanica contaminada por esfuerzo muscular activo.
 */
describe("candado de mecanica aplicado a la nota", () => {
  it("reporta driving pressure y compliance cuando el plateau es valido", () => {
    const nota = componerNotaAlma(entrada());
    expect(nota).toContain("driving pressure 10 cmH2O");
    expect(nota).toContain("compliance estatica 43 ml/cmH2O");
  });

  it("NO reporta driving pressure ni compliance en VCV con asincronia", () => {
    const c = unControl({ soporte: unSoporte({ modoVMI: "VCV", asincronico: true }) });
    const nota = componerNotaAlma(entrada({ controles: [c] }));
    expect(nota).not.toContain("driving pressure");
    expect(nota).not.toContain("compliance estatica");
    expect(nota).not.toContain("P.plateau");
  });

  it("explica por que la mecanica no es valorable en vez de omitirla en silencio", () => {
    const c = unControl({ soporte: unSoporte({ modoVMI: "VCV", asincronico: true }) });
    const nota = componerNotaAlma(entrada({ controles: [c] }));
    expect(nota).toContain("mecanica estatica no valorable");
    expect(nota).toContain("asincronia paciente-ventilador en modo controlado");
  });

  it("sigue reportando los parametros que si son medidas reales del ventilador", () => {
    const c = unControl({ soporte: unSoporte({ modoVMI: "VCV", asincronico: true }) });
    const nota = componerNotaAlma(entrada({ controles: [c] }));
    expect(nota).toContain("Vt 430 ml");
    expect(nota).toContain("indice de Tobin 47");
  });
});

describe("soporte no invasivo", () => {
  it("reporta ROX y no driving pressure en CNAF", () => {
    const c = unControl({
      viaAerea: "NATURAL",
      spo2: 94,
      glasgow: { ocular: 4, verbal: 5, motora: 6 },
      sedacionActiva: false,
      sas: null,
      vigilia: "VIGIL_ALERTA",
      sedacion: {},
      soporte: unSoporte({ tipo: "CNAF", modoVMI: null, fio2: 40, fr: 24, flujo: 50 })
    });
    const nota = componerNotaAlma(
      entrada({ episodio: unEpisodio({ viaAereaActual: "NATURAL" }), controles: [c] })
    );
    expect(nota).toContain("CNAF");
    expect(nota).toContain("indice ROX");
    expect(nota).not.toContain("driving pressure");
  });

  it("usa estado de vigilia en vez de SAS cuando no hay sedacion", () => {
    const c = unControl({
      sedacionActiva: false,
      sas: null,
      vigilia: "SOMNOLIENTO",
      sedacion: {}
    });
    const nota = componerNotaAlma(entrada({ controles: [c] }));
    expect(nota).toContain("estado de vigilia somnoliento");
    expect(nota).toContain("Sin sedoanalgesia");
  });
});

describe("eventos clinicos en la nota", () => {
  it("destaca una autoextubacion como evento de seguridad del paciente", () => {
    const autoext = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({
      tipo: "AUTOEXTUBACION",
      dispositivoSalida: "CNAF",
      hora: "15:40",
      comentario: "Paciente tracciona TET durante aseo."
    });
    const nota = componerNotaAlma(entrada({ eventos: [autoext] }));
    expect(nota).toContain("EVENTOS DE SEGURIDAD DEL PACIENTE");
    expect(nota).toContain("AUTOEXTUBACION NO PLANIFICADA");
    expect(nota).toContain("Notificado para gestion de riesgo");
  });

  it("informa los ciclos de prono y las horas acumuladas", () => {
    const iniciar = unEvento<Extract<EventoClinico, { tipo: "INICIO_PRONO" }>>({
      tipo: "INICIO_PRONO",
      registradoEn: "2026-11-04T02:00:00.000Z"
    });
    const supinar = unEvento<Extract<EventoClinico, { tipo: "SUPINACION" }>>({
      tipo: "SUPINACION",
      registradoEn: "2026-11-04T18:00:00.000Z"
    });
    const nota = componerNotaAlma(entrada({ eventos: [iniciar, supinar] }));
    expect(nota).toContain("Prono: 1 ciclo(s) completado(s), 16 h acumuladas");
  });

  it("un ajuste de tubo no se reporta como intubacion", () => {
    const ajuste = unEvento<Extract<EventoClinico, { tipo: "AJUSTE_TUBO" }>>({
      tipo: "AJUSTE_TUBO",
      fijacionCm: "23",
      motivo: "CONTROL_RADIOLOGICO",
      hora: "11:00"
    });
    const nota = componerNotaAlma(entrada({ eventos: [ajuste] }));
    expect(nota).toContain("Ajuste de fijacion a 23 cm (control radiologico)");
    expect(nota).toContain("reintubaciones 0");
  });
});

describe("esfuerzo respiratorio y destete", () => {
  it("reporta el flujo pico de tos con su interpretacion frente al corte", () => {
    const c = unControl({
      soporte: unSoporte({ modoVMI: "PSV", presionSoporte: 7, peep: 5 }),
      esfuerzo: unEsfuerzo({ pcf: 70, p01: 1.2, nif: -45 })
    });
    const nota = componerNotaAlma(entrada({ controles: [c] }));
    expect(nota).toContain("flujo pico de tos 70 L/min (sobre corte de exito)");
    expect(nota).toContain("P0.1 1.2 cmH2O");
  });

  it("marca un PCF insuficiente como bajo el corte", () => {
    const c = unControl({ esfuerzo: unEsfuerzo({ pcf: 35 }) });
    expect(componerNotaAlma(entrada({ controles: [c] }))).toContain("bajo corte de exito");
  });
});

describe("nota de ultima atencion", () => {
  it("genera una nota breve de un solo control", () => {
    const nota = componerNotaAlma(entrada({ modo: "ULTIMA_ATENCION" }));
    expect(nota).toContain("CONTROL KINESIOLOGIA UPC");
    expect(nota).toContain("ATENCION #1 (09:10 hrs)");
    expect(nota).not.toContain("CRONOLOGIA DE ATENCIONES");
  });

  it("atribuye el control a su autor por nombre, resuelto desde la dotacion", () => {
    expect(componerNotaAlma(entrada({ modo: "ULTIMA_ATENCION" }))).toContain("Klgo. Diego Melo");
  });

  it("marca los controles de apoyo", () => {
    const c = unControl({ esControlApoyo: true });
    const nota = componerNotaAlma(entrada({ modo: "ULTIMA_ATENCION", controles: [c] }));
    expect(nota).toContain("(control de apoyo)");
  });

  it("toma el ultimo control cronologicamente, aunque lleguen desordenados", () => {
    const c1 = unControl({ id: "a", numero: 1, hora: "09:10", registradoEn: "2026-11-04T12:10:00.000Z" });
    const c2 = unControl({ id: "b", numero: 2, hora: "14:20", registradoEn: "2026-11-04T17:20:00.000Z" });
    const nota = componerNotaAlma(entrada({ modo: "ULTIMA_ATENCION", controles: [c2, c1] }));
    expect(nota).toContain("ATENCION #2 (14:20 hrs)");
  });
});

describe("casillasAlma (campos discretos de TrakCare)", () => {
  const pbw = calcularPbw(172, "M");

  it("entrega los valores listos para copiar de a uno", () => {
    const casillas = casillasAlma(unControl(), pbw);
    const porId = new Map(casillas.map((c) => [c.id, c.valor]));
    expect(porId.get("peep")).toBe("10");
    expect(porId.get("vt")).toBe("430");
    expect(porId.get("dp")).toBe("10");
    expect(porId.get("glasgow")).toBe("9T/11T (O3 V:NT M5)");
  });

  it("distingue los parametros que no son de kinesiologia", () => {
    const casillas = casillasAlma(unControl(), pbw);
    expect(casillas.find((c) => c.id === "fc")?.deKine).toBe(false);
    expect(casillas.find((c) => c.id === "peep")?.deKine).toBe(true);
  });

  it("muestra el motivo del bloqueo en la casilla, no un numero falso", () => {
    const c = unControl({ soporte: unSoporte({ modoVMI: "VCV", asincronico: true }) });
    const casillas = casillasAlma(c, pbw);
    const dp = casillas.find((x) => x.id === "dp");
    expect(dp?.valor).toContain("asincronia");
    expect(dp?.valor).not.toMatch(/^\d/);
  });

  it("usa -- para un dato no registrado, nunca 0", () => {
    const c = unControl({ fc: null });
    expect(casillasAlma(c, pbw).find((x) => x.id === "fc")?.valor).toBe("--");
  });
});
