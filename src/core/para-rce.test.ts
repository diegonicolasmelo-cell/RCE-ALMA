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

  it("lo que el celular anotaba y no llegaba al RCE ahora viaja (28-nov-2026)", () => {
    const ep = unEpisodio({ cama: "UCI-07" });
    const c = unControl({ viaAerea: "TET", neuro: { etco2: 38, pic: 14, dveAlturaCmH2O: 15, dveAbierta: true },
      ventilacion: unaVentilacion({ modalidad: "ACVC", asincronico: true }),
      kineResp: { ...unControl().kineResp, tos: "DEFICIENTE", flujoPicoTos: 120, deglucion: "ESPORADICA" } } as never);
    expect(controlParaRce(c, ep)!.datos).toMatchObject({ KAP_PIC: 14, KAP_ETCO2: 38, KAP_DVE: "abierta", KAP_DVE_ALT: 15,
      KAP_TOS: "deficiente", KAP_PFT: 120, KAP_DEGLUCION: "esporadica", KAP_ASINCRONICO: true, KAP_OBS: "Queda acoplado a VMI protectora." });
  });

  it("la sedación viaja con los fármacos del RCE y el escalón más alto (25-nov)", () => {
    const ep = unEpisodio({ cama: "UCI-04" });
    const con = (infusiones: object) => controlParaRce(unControl({ infusiones } as never), ep)!.datos;
    expect(con({})).toMatchObject({ SED_TIPO: "Sin sedación" });
    expect(con({}).SED_FARMACOS).toBeUndefined();
    expect(con({ fentanilo: { dosis: 1.2, escalon: 2 }, propofol: { dosis: 1.5, escalon: 3 } })).toMatchObject({ SED_TIPO: "Escalón 3", SED_FARMACOS: "Fentanyl, Propofol" });
    expect(con({ midazolam: { dosis: 0.2, escalon: null } })).toMatchObject({ SED_TIPO: "Fuera de escalón", SED_FARMACOS: "Midazolam" });
    expect(con({ dexmedetomidina: { dosis: 0.4, escalon: 1 } })).toMatchObject({ SED_TIPO: "Escalón 1", SED_FARMACOS: "Precedex" });
    // Las bombas con su dosis (25-nov): el RCE las muestra tal cual, en vez de «múltiples drogas».
    expect(con({ noradrenalina: { dosis: 0.35, escalon: null }, vasopresina: { dosis: 0.03, escalon: null }, fentanilo: { dosis: 1.2, escalon: 2 } })).toMatchObject({
      KAP_DVA_DETALLE: "Noradrenalina 0,35 mcg/kg/min · Vasopresina 0,03 UI/min", KAP_DVA_NIVEL: "ALTA", KAP_SED_DETALLE: "Fentanilo 1,2 mcg/kg/h (esc. 2)"
    });
  });

  it("los eventos de la primera tanda viajan con su código; los demás no", () => {
    const ep = unEpisodio({ cama: "UCI-02" });
    const ext = unEvento<EventoClinico>({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF", registradoEn: new Date(2026, 10, 22, 10, 40).toISOString(), hora: "10:40" } as never);
    const r = eventoParaRce(ext, ep)!;
    expect([r.tipo, r.evento, r.cama, r.horaToma]).toEqual(["EVENTO", "EXTUBACION", 2, "2026-11-22 10:40"]);
    expect(r.datos).toMatchObject({ dispositivo: "CNAF", hora: "10:40" });
    const ktm = unEvento<EventoClinico>({ tipo: "TERAPIA_FISICA", realizada: true, nivel: 3, ems: false } as never);
    expect(eventoParaRce(ktm, ep)).toMatchObject({ evento: "KTM", datos: { nivel: 3, realizada: true } });
    // Desde el 23-nov los cambios de filtro sí viajan (la ronda corrige la fecha de etiqueta en el RCE).
    const filtro = unEvento<EventoClinico>({ tipo: "CAMBIO_FILTRO", elemento: "TRACHCARE", fechaEtiqueta: "2026-11-21" } as never);
    expect(eventoParaRce(filtro, ep)).toMatchObject({ evento: "FILTRO", datos: { k: "tc", fecha: "2026-11-21" } });
    const ronda = unEvento<EventoClinico>({ tipo: "RONDA_EQUIPOS", hallazgos: [{ elemento: "HME", texto: "Filtro HME vencido" }] } as never);
    expect(eventoParaRce(ronda, ep)).toMatchObject({ evento: "RONDA", datos: { hallazgos: "Filtro HME vencido" } });
  });

  it("un evento libre viaja como NOTA, con su texto y la hora en que ocurrió (no la de anotarlo)", () => {
    const ep = unEpisodio({ cama: "UCI-04" });
    const libre = unEvento<EventoClinico>({ tipo: "EVENTO_LIBRE", descripcion: "Electroencefalograma", hora: "08:15", registradoEn: new Date(2026, 10, 22, 9, 0).toISOString(), realizadaEn: new Date(2026, 10, 22, 8, 15).toISOString() } as never);
    expect(eventoParaRce(libre, ep)).toMatchObject({ evento: "NOTA", horaToma: "2026-11-22 08:15", datos: { descripcion: "Electroencefalograma", hora: "08:15" } });
  });

  it("el cambio de cama viaja como TRASLADO con la cama de origen y la de destino", () => {
    const ep = unEpisodio({ cama: "UCI-05" });
    const tr = unEvento<EventoClinico>({ tipo: "TRASLADO_CAMA", desde: "UCI-03", hasta: "UCI-05" } as never);
    expect(eventoParaRce(tr, ep)).toMatchObject({ evento: "TRASLADO", cama: 5, datos: { desde: "UCI-03", hasta: "UCI-05" } });
  });

  it("los equipos de la sala viajan con su nombre y cuál está en uso, en cada control y en el cambio de equipo", () => {
    const ep = unEpisodio({ cama: "UCI-07", equipos: [{ tipo: "VENTILADOR", modelo: "Savina", numero: 2, enUso: true }, { tipo: "VMNI", modelo: "V60", numero: 1, enUso: false }] } as never);
    const c = unControl({ viaAerea: "TET", ventilacion: unaVentilacion({ modalidad: "ACVC" }) });
    expect(controlParaRce(c, ep)?.equipos).toEqual([{ equipo: "Savina 2", enUso: true }, { equipo: "V60 1", enUso: false }]);
    const cambio = unEvento<EventoClinico>({ tipo: "CAMBIO_EQUIPOS", equipos: [{ tipo: "VENTILADOR", modelo: "Meckis", numero: 12, enUso: true }] } as never);
    expect(eventoParaRce(cambio, ep)).toMatchObject({ evento: "EQUIPOS", equipos: [{ equipo: "Meckis 12", enUso: true }] });
  });

  it("la hora va en hora local", () => {
    expect(horaLocal(new Date(2026, 0, 5, 4, 7).toISOString())).toBe("2026-01-05 04:07");
  });
});
