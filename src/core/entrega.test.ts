import { describe, expect, it } from "vitest";
import { hitosDelEpisodio } from "./entrega";
import { unEpisodio, unEvento } from "./fixtures";
import type { EventoClinico } from "./tipos";

const ev = (tipo: string, h: number, extra: object = {}) => unEvento<EventoClinico>({ tipo, registradoEn: new Date(2026, 10, 20, h).toISOString(), ...extra } as never);

describe("hitos del episodio para la entrega", () => {
  it("ordena ingreso, vía aérea, PVE, prono y cultivos; deja fuera filtros y evaluaciones", () => {
    const ep = unEpisodio({ ingresadoEn: new Date(2026, 10, 20, 1).toISOString() });
    const hitos = hitosDelEpisodio(ep, [
      ev("TOMA_CULTIVO", 9, { muestra: "Aspirado traqueal" }),
      ev("REINTUBACION", 2, { via: "TET" }),
      ev("CAMBIO_HMEF", 3),
      ev("INICIO_PRONO", 4),
      ev("FIN_PVE", 10, { exitosa: true }),
      ev("EXTUBACION_PROGRAMADA", 11, { dispositivo: "CNAF" }),
      ev("REINTUBACION", 14, { via: "TET" })
    ]);
    expect(hitos.map((h) => h.texto)).toEqual([
      "Ingreso a la UCI", "Intubación", "Prono", "Cultivo · aspirado traqueal", "PVE superada", "Extubación con protocolo", "Reintubación"
    ]);
  });
  it("la extubación sin PVE se nombra fuera de protocolo", () => {
    const { ingresadoEn: _sinIngreso, ...sinIngreso } = unEpisodio();
    expect(hitosDelEpisodio(sinIngreso, [ev("EXTUBACION_PROGRAMADA", 8, { sinPve: "CRITERIO_CLINICO" })]).map((h) => h.texto)).toEqual(["Extubación fuera de protocolo"]);
  });
});
