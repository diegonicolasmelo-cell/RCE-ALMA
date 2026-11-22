import { describe, expect, it } from "vitest";
import { unControl, unEpisodio, unEvento, unaVentilacion } from "./fixtures";
import { camaRce, controlParaRce, eventoParaRce, horaLocal, soporteRce } from "./para-rce";
import type { EventoClinico } from "./tipos";

describe("RCE by Kaptus: traducción al idioma del RCE", () => {
  it("las camas: «UCI-03» de Kaptus es la cama 3 del RCE", () => {
    expect(camaRce("UCI-03")).toBe(3);
    expect(camaRce("UCI-18")).toBe(18);
    expect(camaRce("pasillo")).toBeNull();
  });

  it("vía aérea, soporte y modo con los catálogos del RCE", () => {
    expect(soporteRce("TET", "ACVC", null)).toEqual({ va: "TOT", soporte: "VM", modo: "ACVC" });
    expect(soporteRce("TET", "PCV", null)).toEqual({ va: "TOT", soporte: "VM", modo: "ACPC" });
    expect(soporteRce("TQT", "CNAF_TQT", 40)).toEqual({ va: "TQT", soporte: "Oxigenoterapia/OAF", modo: "CTAF" });
    expect(soporteRce("TQT", "VALVULA_FONACION", null)).toEqual({ va: "TQT", soporte: "Ambiente", modo: "Válvula de fonación" });
    expect(soporteRce("TQT", "VALVULA_FONACION", 2)).toEqual({ va: "TQT", soporte: "Oxigenoterapia/OAF", modo: "Válvula de fonación" });
    expect(soporteRce("NATURAL", "O2_NARICERA", 3)).toEqual({ va: "Natural", soporte: "Oxigenoterapia/OAF", modo: "NRC" });
    expect(soporteRce("NATURAL", "VNI_ST", null)).toEqual({ va: "Full Face", soporte: "VNI", modo: "S/T" });
    expect(soporteRce("NATURAL", "AIRE_AMBIENTE", null)).toEqual({ va: "Natural", soporte: "Ambiente", modo: "Sin soporte" });
  });

  it("un control de ACVC lleva los nombres de EVOLUCIONES, sin nombre ni RUT", () => {
    const ep = unEpisodio({ cama: "UCI-07" });
    const c = unControl({ id: "ct-9", registradoEn: new Date(2026, 10, 22, 9, 10).toISOString(), viaAerea: "TET", fc: 98, pas: 112, pad: 58, spo2: 95,
      glasgow: { ocular: 4, verbal: 1, motora: 6 }, ventilacion: unaVentilacion({ modalidad: "ACVC", vtProgramado: 430, peep: 8, fio2: 40, frProgramada: 18, frTotal: 20 }) });
    const r = controlParaRce(c, ep)!;
    expect([r.tipo, r.cama, r.horaToma]).toEqual(["CONTROL", 7, "2026-11-22 09:10"]);
    expect(r.datos).toMatchObject({ VENT_VIA_AEREA: "TOT", VENT_SOPORTE: "VM", VENT_MODO: "ACVC", VENT_VT: 430, VENT_PEEP: 8, VENT_FIO2: 40, VENT_FR: 20, VENT_SPO2: 95, KAP_FC: 98, KAP_PAS: 112, KAP_PAD: 58, SED_GCS_TOT: "11T" });
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/nombre|rut"|Paciente/i);
  });

  it("los eventos de la primera tanda viajan con su código; los demás no", () => {
    const ep = unEpisodio({ cama: "UCI-02" });
    const ext = unEvento<EventoClinico>({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF", registradoEn: new Date(2026, 10, 22, 10, 40).toISOString(), hora: "10:40" } as never);
    const r = eventoParaRce(ext, ep)!;
    expect([r.tipo, r.evento, r.cama, r.horaToma]).toEqual(["EVENTO", "EXTUBACION", 2, "2026-11-22 10:40"]);
    expect(r.datos).toMatchObject({ dispositivo: "CNAF", hora: "10:40" });
    const ktm = unEvento<EventoClinico>({ tipo: "TERAPIA_FISICA", realizada: true, nivel: 3, ems: false } as never);
    expect(eventoParaRce(ktm, ep)).toMatchObject({ evento: "KTM", datos: { nivel: 3, realizada: true } });
    const filtro = unEvento<EventoClinico>({ tipo: "CAMBIO_FILTRO" } as never);
    expect(eventoParaRce(filtro, ep)).toBeNull();
  });

  it("un evento libre viaja como NOTA, con su texto y la hora en que ocurrió (no la de anotarlo)", () => {
    const ep = unEpisodio({ cama: "UCI-04" });
    const libre = unEvento<EventoClinico>({ tipo: "EVENTO_LIBRE", descripcion: "Electroencefalograma", hora: "08:15", registradoEn: new Date(2026, 10, 22, 9, 0).toISOString(), realizadaEn: new Date(2026, 10, 22, 8, 15).toISOString() } as never);
    expect(eventoParaRce(libre, ep)).toMatchObject({ evento: "NOTA", horaToma: "2026-11-22 08:15", datos: { descripcion: "Electroencefalograma", hora: "08:15" } });
  });

  it("la hora va en hora local", () => {
    expect(horaLocal(new Date(2026, 0, 5, 4, 7).toISOString())).toBe("2026-01-05 04:07");
  });
});
