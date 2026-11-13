import { describe, expect, it } from "vitest";
import { columnasSabana, dvaCorta, filasSabana, otrosEventos, sedacionCorta } from "./sabana";
import { unControl, unEvento, unaVentilacion } from "@core/fixtures";

const SIN_MONITOREO = { capnografia: false, pic: false, dve: false };
const fila = (et: string, mon = SIN_MONITOREO) => filasSabana(67.8, mon).find((f) => f.etiqueta === et)!;

describe("sábana del turno", () => {
  it("muestra ΔP, compliance y plateau cuando el plateau es válido", () => {
    const c = unControl();
    expect(fila("P. distensión (ΔP)").celda(c)).toEqual({ texto: "10" });
    expect(fila("Compliance").celda(c).texto).toBe("43");
  });

  it("BLOQUEA plateau, ΔP y compliance con asincronía en modalidad controlada (no dibuja un dato falso)", () => {
    const c = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    for (const et of ["P. plateau", "P. distensión (ΔP)", "Compliance"]) {
      expect(fila(et).celda(c)).toEqual({ texto: "bloq.", bloqueado: true });
    }
  });

  it("lo que sí es real bajo asincronía sigue visible", () => {
    const c = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    expect(fila("Vol. tidal esp. (ml/kg)").celda(c).texto).toBe("430 (6.3)");
    expect(fila("Vol. minuto").celda(c).texto).toBe("8.6");
  });

  it("el Tobin solo tiene valor en CPAP+PS", () => {
    expect(fila("I. Tobin").celda(unControl()).texto).toBe("--");
    const cpap = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, frTotal: 18, vtEspirado: 460 }) });
    expect(fila("I. Tobin").celda(cpap).texto).toBe("39");
  });

  it("PCV sin plateau muestra la ΔP declarando que usa la presión pico", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "PCV", presion: 15, peep: 8, pPlateau: null, pPico: 24 }) });
    expect(fila("P. distensión (ΔP)").celda(c).texto).toBe("16 (pico)");
  });

  it("el volumen minuto es el espirado que se anotó, sin marcas", () => {
    expect(fila("Vol. minuto").celda(unControl({ ventilacion: unaVentilacion({ volMinuto: 9.1 }) })).texto).toBe("9.1");
  });

  it("el Glasgow bajo sedación se marca con asterisco", () => {
    expect(fila("Glasgow").celda(unControl({ glasgow: { ocular: 3, verbal: 1, motora: 5 } })).texto).toBe("9T*");
    expect(fila("Glasgow").celda(unControl()).texto).toBe("--");
  });

  it("las filas de neuromonitoreo aparecen solo si el episodio las tiene activas", () => {
    const sin = filasSabana(67.8, SIN_MONITOREO).map((f) => f.etiqueta);
    expect(sin).not.toContain("PIC / PPC");
    const con = filasSabana(67.8, { capnografia: true, pic: true, dve: true }).map((f) => f.etiqueta);
    expect(con).toEqual(expect.arrayContaining(["EtCO₂", "PIC / PPC", "DVE"]));
    const c = unControl({ pas: 120, pad: 60, neuro: { etco2: 34, pic: 15, dveAlturaCmH2O: 12, dveAbierta: true } });
    expect(fila("PIC / PPC", { capnografia: true, pic: true, dve: true }).celda(c).texto).toBe("15 / 65");
    expect(fila("DVE", { capnografia: true, pic: true, dve: true }).celda(c).texto).toBe("12 cmH₂O abierta");
  });

  it("sigue el orden de la hoja de papel, por bloques: monitorización, terapia ventilatoria, kinesiología y firma", () => {
    const f = filasSabana(67.8, SIN_MONITOREO);
    const e = f.map((x) => x.etiqueta);
    const orden = ["Frec. cardiaca", "P. arterial (PAM)", "SpO₂", "Glasgow", "SAS / vigilia", "Sedación", "DVA / inotrópicos", "Modo", "P. plateau", "P. distensión (ΔP)", "Compliance", "Vol. minuto", "FiO₂", "Auscultación", "Terapia física", "Firma"];
    expect(orden.map((x) => e.indexOf(x))).toEqual([...orden.map((x) => e.indexOf(x))].sort((a, b) => a - b));
    expect(Math.min(...orden.map((x) => e.indexOf(x)))).toBeGreaterThan(-1);
    expect([...new Set(f.map((x) => x.grupo))]).toEqual(["Monitorización", "Terapia ventilatoria", "Kinesiología", "Firma"]);
    expect(e).not.toContain("S5Q");
  });

  it("Auto PEEP solo se muestra en modalidades controladas", () => {
    expect(fila("Auto PEEP").celda(unControl({ ventilacion: unaVentilacion({ autoPeep: 2 }) })).texto).toBe("2");
    const cpap = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", autoPeep: null }) });
    expect(fila("Auto PEEP").celda(cpap).texto).toBe("—");
  });

  it("la firma son las iniciales del profesional", () => {
    expect(fila("Firma").celda(unControl()).texto).toBe("DM");
  });
});

describe("columnas por control y eventos aparte", () => {
  const ahora = new Date(2026, 10, 11, 18, 0);
  const en = (dia: number, h: number): string => new Date(2026, 10, dia, h, 0).toISOString();
  const ctl = (id: string, dia: number, h: number) => unControl({ id, registradoEn: en(dia, h) });
  const ev = (e: Record<string, unknown>, dia: number, h: number) => unEvento({ ...e, registradoEn: en(dia, h) } as never);
  const controles = [ctl("a", 9, 10), ctl("b", 10, 21), ctl("c", 11, 1), ctl("d", 11, 9), ctl("e", 11, 13)];
  const eventos = [
    ev({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF" }, 11, 8),
    ev({ tipo: "CAMBIO_HMEF" }, 11, 2),
    ev({ tipo: "TOMA_CULTIVO", muestra: "Aspirado traqueal" }, 10, 22)
  ];
  it("24 h por defecto; la estadía muestra todos los controles", () => {
    expect(columnasSabana(controles, eventos, "24H", ahora).map((c) => c.control.id)).toEqual(["b", "c", "d", "e"]);
    expect(columnasSabana(controles, eventos, "ESTADIA", ahora).map((c) => c.control.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("el evento de vía aérea se marca en la columna del control que generó", () => {
    const cols = columnasSabana(controles, eventos, "24H", ahora);
    expect(cols.find((c) => c.control.id === "d")?.hitos).toEqual([`Extubación · ${eventos[0]!.hora}`]);
    expect(cols.filter((c) => c.hitos.length > 0)).toHaveLength(1);
  });
  it("el evento ligado a un control va en su columna y sale de «Otros eventos»", () => {
    const cultivo = eventos[2]!;
    const conVinculo = controles.map((c) => (c.id === "b" ? { ...c, eventoId: cultivo.id } : c));
    const cols = columnasSabana(conVinculo, eventos, "24H", ahora);
    expect(cols.find((c) => c.control.id === "b")?.hitos).toEqual([`Cultivo Aspirado traqueal · ${cultivo.hora}`]);
    expect(otrosEventos(eventos, "24H", ahora, conVinculo).some((e) => e.id === cultivo.id)).toBe(false);
    expect(otrosEventos(eventos, "24H", ahora, controles).some((e) => e.id === cultivo.id)).toBe(true);
  });
  it("una línea marca el cambio de día", () => {
    const cols = columnasSabana(controles, eventos, "24H", ahora);
    expect(cols.map((c) => c.nuevoDia)).toEqual([false, true, false, false]);
  });
  it("filtros, cultivos y demás van en la lista aparte, del más nuevo al más antiguo", () => {
    expect(otrosEventos(eventos, "24H", ahora).map((e) => e.tipo)).toEqual(["CAMBIO_HMEF", "TOMA_CULTIVO"]);
  });
});

describe("sedación y DVA en la sábana, cortas", () => {
  it("sedación: solo el escalón de cada droga", () => {
    expect(sedacionCorta(unControl({ infusiones: { fentanilo: { dosis: 1.2, escalon: 2 } } }))).toBe("Fentanilo esc. 2");
    expect(sedacionCorta(unControl({ infusiones: {} }))).toBe("—");
  });
  it("DVA: solo el número, sin la unidad", () => {
    const c = unControl({ infusiones: { noradrenalina: { dosis: 0.08, escalon: null } } });
    expect(dvaCorta(c)).toBe("Noradrenalina 0.08");
    expect(dvaCorta(unControl({ infusiones: {} }))).toBe("—");
  });
});
