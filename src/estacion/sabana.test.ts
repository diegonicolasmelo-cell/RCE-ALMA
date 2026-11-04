import { describe, expect, it } from "vitest";
import { filasSabana } from "./sabana";
import { unControl, unaVentilacion } from "@core/fixtures";

const SIN_MONITOREO = { capnografia: false, pic: false, dve: false };
const fila = (et: string, mon = SIN_MONITOREO) => filasSabana(67.8, mon).find((f) => f.etiqueta === et)!;

describe("sábana del turno", () => {
  it("muestra ΔP, compliance y plateau cuando el plateau es válido", () => {
    const c = unControl();
    expect(fila("ΔP").celda(c)).toEqual({ texto: "10" });
    expect(fila("Compliance").celda(c).texto).toBe("43");
  });

  it("BLOQUEA plateau, ΔP y compliance con asincronía en modalidad controlada (no dibuja un dato falso)", () => {
    const c = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    for (const et of ["P. plateau", "ΔP", "Compliance"]) {
      expect(fila(et).celda(c)).toEqual({ texto: "bloq.", bloqueado: true });
    }
  });

  it("lo que sí es real bajo asincronía sigue visible", () => {
    const c = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    expect(fila("Vt esp. (ml/kg)").celda(c).texto).toBe("430 (6.3)");
    expect(fila("Vol. minuto").celda(c).texto).toBe("8.6");
  });

  it("el Tobin solo tiene valor en CPAP+PS", () => {
    expect(fila("Tobin").celda(unControl()).texto).toBe("--");
    const cpap = unControl({ ventilacion: unaVentilacion({ modalidad: "CPAP_PS", presion: 7, frTotal: 18, vtEspirado: 460 }) });
    expect(fila("Tobin").celda(cpap).texto).toBe("39");
  });

  it("PCV sin plateau muestra la ΔP declarando que usa la presión pico", () => {
    const c = unControl({ ventilacion: unaVentilacion({ modalidad: "PCV", presion: 15, peep: 8, pPlateau: null, pPico: 24 }) });
    expect(fila("ΔP").celda(c).texto).toBe("16 (pico)");
  });

  it("un volumen minuto editado se marca con asterisco", () => {
    expect(fila("Vol. minuto").celda(unControl({ ventilacion: unaVentilacion({ volMinuto: 9.1 }) })).texto).toBe("9.1*");
  });

  it("el Glasgow bajo sedación se marca con asterisco", () => {
    expect(fila("Glasgow").celda(unControl({ glasgow: { ocular: 3, verbal: 1, motora: 5 } })).texto).toBe("9T*");
    expect(fila("Glasgow").celda(unControl()).texto).toBe("--");
  });

  it("las filas de neuromonitoreo aparecen solo si el episodio las tiene activas", () => {
    const sin = filasSabana(67.8, SIN_MONITOREO).map((f) => f.etiqueta);
    expect(sin).not.toContain("PIC");
    const con = filasSabana(67.8, { capnografia: true, pic: true, dve: true }).map((f) => f.etiqueta);
    expect(con).toEqual(expect.arrayContaining(["EtCO₂", "PIC", "PPC", "DVE"]));
    const c = unControl({ pas: 120, pad: 60, neuro: { etco2: 34, pic: 15, dveAlturaCmH2O: 12, dveAbierta: true } });
    expect(fila("PPC", { capnografia: true, pic: true, dve: true }).celda(c).texto).toBe("65");
    expect(fila("DVE", { capnografia: true, pic: true, dve: true }).celda(c).texto).toBe("12 cmH₂O abierta");
  });

  it("la firma son las iniciales del profesional", () => {
    expect(fila("Firma").celda(unControl()).texto).toBe("DM");
  });
});
