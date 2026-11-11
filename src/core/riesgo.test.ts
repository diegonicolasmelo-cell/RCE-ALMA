import { describe, expect, it } from "vitest";
import { componerInformeRiesgo, etiquetaEventoRiesgo, eventoDeRiesgoMasReciente } from "./riesgo";
import { unControl, unEpisodio, unEvento, unaVentilacion } from "./fixtures";
import type { EventoClinico, IdentidadPaciente } from "./tipos";

const identidad: IdentidadPaciente = { episodioId: "ep-1", nombre: "Paciente Prueba Uno", rut: "12345678-5", ficha: null };
const autoext = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({
  tipo: "AUTOEXTUBACION",
  dispositivo: "CNAF",
  hora: "15:40",
  registradoEn: "2026-11-04T18:40:00.000Z",
  comentario: "Tracciona el TET durante el aseo."
});

describe("eventoDeRiesgoMasReciente", () => {
  it("elige el evento de riesgo y no otros procedimientos", () => {
    const cultivo = unEvento<Extract<EventoClinico, { tipo: "TOMA_CULTIVO" }>>({ tipo: "TOMA_CULTIVO", muestra: "Aspirado traqueal", registradoEn: "2026-11-04T19:00:00.000Z" });
    expect(eventoDeRiesgoMasReciente([autoext, cultivo])?.tipo).toBe("AUTOEXTUBACION");
    expect(eventoDeRiesgoMasReciente([cultivo])).toBeNull();
  });

  it("etiquetas cortas para la alerta de la tarjeta", () => {
    expect(etiquetaEventoRiesgo(autoext)).toBe("Autoextubación");
    expect(etiquetaEventoRiesgo(unEvento<Extract<EventoClinico, { tipo: "PCR" }>>({ tipo: "PCR", duracionReanimacionMin: 8 }))).toBe("PCR");
  });
});

describe("componerInformeRiesgo", () => {
  const previo = unControl({ id: "a", hora: "14:20", registradoEn: "2026-11-04T17:20:00.000Z", infusiones: { fentanilo: { dosis: 0.6, escalon: 1 }, noradrenalina: { dosis: 0.03, escalon: null } }, sas: 4 });
  const posterior = unControl({ id: "b", hora: "16:00", registradoEn: "2026-11-04T19:00:00.000Z", sas: 1 });
  const informe = (id: IdentidadPaciente | null = identidad) =>
    componerInformeRiesgo({ episodio: unEpisodio(), identidad: id, evento: autoext, controles: [posterior, previo] });

  it("arma el informe con los datos del celular: hora, descripción y dispositivo", () => {
    const t = informe();
    expect(t).toContain("Evento: Autoextubación");
    expect(t).not.toMatch(/no planificada/i);
    expect(t).toContain("Hora: 15:40   Cama: UCI-01");
    expect(t).toContain("Tracciona el TET durante el aseo.");
    expect(t).toContain("Queda en: CNAF");
    expect(t).toContain("Registrado por: Klgo. Diego Melo");
  });

  it("incluye el contexto del último control ANTERIOR al evento, no uno posterior", () => {
    const t = informe();
    expect(t).toContain("último control 14:20");
    expect(t).toContain("SAS 4");
    expect(t).toContain("Fentanilo 0.6 mcg/kg/h (esc. 1)");
    expect(t).toContain("Noradrenalina 0.03 mcg/kg/min");
    expect(t).toContain("ACVC PEEP 10 FiO2 45%");
    expect(t).not.toContain("SAS 1");
  });

  it("en la estación incluye la identidad con el RUT formateado", () => {
    expect(informe()).toContain("Paciente: Paciente Prueba Uno · RUT 12.345.678-5 · 60–69 años");
  });

  it("sin identidad (un celular) nombra la cama y no inventa datos", () => {
    const t = informe(null);
    expect(t).toContain("cama UCI-01");
    expect(t).not.toContain("Prueba");
    expect(t).not.toContain("RUT 1");
  });

  it("sin controles previos lo dice en vez de omitirlo", () => {
    const t = componerInformeRiesgo({ episodio: unEpisodio(), identidad, evento: autoext, controles: [posterior] });
    expect(t).toContain("sin controles previos en el turno");
  });

  it("incluye los equipos de la sala (rastreo del ventilador)", () => {
    expect(informe()).toContain("Equipos de la sala: Savina 1 (en uso)");
  });

  it("PCR y evento centinela también arman informe", () => {
    const pcr = unEvento<Extract<EventoClinico, { tipo: "PCR" }>>({ tipo: "PCR", duracionReanimacionMin: 8, registradoEn: "2026-11-04T18:50:00.000Z" });
    const t = componerInformeRiesgo({ episodio: unEpisodio(), identidad, evento: pcr, controles: [previo] });
    expect(t).toContain("Paro cardiorrespiratorio, reanimación 8 min");
    expect(t).not.toContain("Queda en");
  });

  it("el contexto sin sedantes dice vigilia en vez de SAS", () => {
    const sin = unControl({ id: "c", registradoEn: "2026-11-04T17:20:00.000Z", infusiones: {}, sas: null, vigilia: "SOMNOLIENTO", ventilacion: unaVentilacion({ modalidad: "CPAP_PS" }) });
    const t = componerInformeRiesgo({ episodio: unEpisodio(), identidad, evento: autoext, controles: [sin] });
    expect(t).toContain("vigilia somnoliento");
    expect(t).toContain("sin sedantes");
    expect(t).toContain("CPAP+PS");
  });
});
