import { describe, expect, it } from "vitest";
import { filtrosPorCambiar, vigenciaFiltros } from "./filtros";
import type { EventoClinico } from "./tipos";

const base = (d: Date, id: string) => ({ id, episodioId: "ep", hora: "10:00", registradoEn: d.toISOString(), rutAutor: "x", comentario: "" });
const fil = (d: Date, elemento: "TRACHCARE" | "HEPA"): EventoClinico => ({ ...base(d, "f" + d.getTime() + elemento), tipo: "CAMBIO_FILTRO", elemento });
const hme = (d: Date): EventoClinico => ({ ...base(d, "h" + d.getTime()), tipo: "CAMBIO_HMEF" });
const dia = (n: number, h = 10) => new Date(2026, 10, n, h);
const v = (evs: EventoClinico[], ahora: Date) => Object.fromEntries(vigenciaFiltros(evs, ahora).map((x) => [x.elemento, x]));

describe("vigencia de filtros y TrachCare", () => {
  it("sin registro no inventa fechas", () => {
    expect(v([], dia(4))["HME"]!.estado).toBe("SIN_REGISTRO");
  });

  it("TrachCare y HEPA duran 3 días; HME 2 días", () => {
    const evs = [fil(dia(4), "TRACHCARE"), fil(dia(4), "HEPA"), hme(dia(4))];
    const r = v(evs, dia(4, 15));
    expect(r["TRACHCARE"]).toMatchObject({ venceFecha: "2026-11-07", diasRestantes: 3, estado: "VIGENTE" });
    expect(r["HEPA"]!.venceFecha).toBe("2026-11-07");
    expect(r["HME"]).toMatchObject({ venceFecha: "2026-11-06", diasRestantes: 2 });
  });

  it("el día del vencimiento avisa 'vence hoy' y después queda vencido", () => {
    const evs = [hme(dia(4))];
    expect(v(evs, dia(6))["HME"]!.estado).toBe("VENCE_HOY");
    expect(v(evs, dia(7))["HME"]).toMatchObject({ estado: "VENCIDO", diasRestantes: -1 });
  });

  it("un cambio nuevo reinicia el plazo (vale el último)", () => {
    const evs = [hme(dia(4)), hme(dia(6))];
    expect(v(evs, dia(7))["HME"]).toMatchObject({ estado: "VIGENTE", venceFecha: "2026-11-08" });
  });

  it("lista lo que hay que cambiar hoy", () => {
    const evs = [fil(dia(1), "TRACHCARE"), hme(dia(6)), fil(dia(3), "HEPA")];
    expect(filtrosPorCambiar(evs, dia(6)).map((x) => x.elemento).sort()).toEqual(["HEPA", "TRACHCARE"]);
  });
});
