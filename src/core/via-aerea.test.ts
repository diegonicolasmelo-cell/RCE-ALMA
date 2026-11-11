import { describe, expect, it } from "vitest";
import { aplicarEventoAEpisodio, contarReintubaciones, esReintubacion, viaAereaVigente } from "./eventos";
import { horasDeVm } from "./pve";
import { describirEvento } from "./nota-alma";
import { resumirTurno } from "./rem28";
import { unEpisodio, unEvento } from "./fixtures";
import type { EventoClinico } from "./tipos";

const en = (h: number): string => new Date(Date.UTC(2026, 10, 10, h)).toISOString();
const ev = (e: Record<string, unknown>, h: number): EventoClinico => unEvento({ ...e, registradoEn: en(h) } as never);

describe("intubación o reintubación", () => {
  it("quien llega con vía natural y se intuba por primera vez tiene una INTUBACIÓN, no una reintubación", () => {
    const intub = ev({ tipo: "REINTUBACION", via: "TET", calibre: "7.5", fijacionCm: "22" }, 3);
    expect(esReintubacion(intub, [intub])).toBe(false);
    expect(contarReintubaciones([intub])).toBe(0);
    expect(describirEvento(intub, [intub])).toMatch(/^Intubación TET/);
  });
  it("después de una extubación, autoextubación o decanulación sí es reintubación", () => {
    for (const retiro of [
      { tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF" },
      { tipo: "AUTOEXTUBACION", dispositivo: "REINTUBACION_INMEDIATA" },
      { tipo: "DECANULACION", dispositivo: "O2_CONVENCIONAL", accidental: true }
    ]) {
      const r = ev(retiro, 2);
      const reint = ev({ tipo: "REINTUBACION", via: "TET", calibre: "7.5", fijacionCm: "22" }, 5);
      expect(esReintubacion(reint, [r, reint]), retiro.tipo).toBe(true);
      expect(describirEvento(reint, [r, reint])).toMatch(/^Reintubación/);
    }
  });
});

describe("cambio de tubo y de cánula", () => {
  const ep = unEpisodio({ viaAereaActual: "TET", calibreVia: "7.5", fijacionCm: "22", ingresadoEn: en(0), diasVM: 0 });
  const cambio = ev({ tipo: "CAMBIO_TUBO", calibre: "8.0", fijacionCm: "23", motivo: "CUFF_DANADO" }, 6);
  it("cambia calibre y cm, pero no la vía", () => {
    const d = aplicarEventoAEpisodio(ep, cambio);
    expect([d.viaAereaActual, d.calibreVia, d.fijacionCm]).toEqual(["TET", "8.0", "23"]);
    expect(viaAereaVigente("TET", [cambio])).toBe("TET");
  });
  it("NO es reintubación y NO reinicia los días de VM", () => {
    expect(contarReintubaciones([cambio])).toBe(0);
    expect(horasDeVm(ep, [cambio], null, new Date(en(10)))?.horas).toBe(10);
    expect(resumirTurno([], [cambio], []).reintubaciones).toBe(0);
    expect(resumirTurno([], [cambio], []).recambiosTubo).toBe(1);
  });
  it("el texto dice el motivo", () => {
    expect(describirEvento(cambio)).toBe("Cambio de tubo: TET calibre 8.0, fijación 23 cm (cuff dañado)");
    expect(describirEvento(ev({ tipo: "CAMBIO_CANULA", calibre: "8", motivo: "PROGRAMADO" }, 6))).toBe("Cambio de cánula: TQT calibre 8 (recambio programado)");
  });
});

describe("decanulación", () => {
  it("deja la vía natural y la accidental se distingue", () => {
    const ep = unEpisodio({ viaAereaActual: "TQT", calibreVia: "8", fijacionCm: "Collarín" });
    const dec = ev({ tipo: "DECANULACION", dispositivo: "O2_CONVENCIONAL", accidental: true }, 4);
    expect(aplicarEventoAEpisodio(ep, dec).viaAereaActual).toBe("NATURAL");
    expect(viaAereaVigente("TQT", [dec])).toBe("NATURAL");
    expect(describirEvento(dec)).toMatch(/^DECANULACIÓN ACCIDENTAL/);
    expect(resumirTurno([], [dec], []).decanulaciones).toBe(1);
  });
});

describe("extubación fuera de protocolo (sin PVE)", () => {
  it("cambia la vía, dice el motivo y se cuenta aparte dentro de las programadas", () => {
    const sin = ev({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF", sinPve: "MENOS_24H_VM" }, 3);
    const con = ev({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF" }, 4);
    expect(viaAereaVigente("TET", [sin])).toBe("NATURAL");
    expect(describirEvento(sin)).toBe("Extubación fuera de protocolo (sin PVE: menos de 24 h de VM), queda en CNAF");
    expect(describirEvento(con)).toMatch(/^Extubación programada/);
    const r = resumirTurno([], [sin, con], []);
    expect([r.extubacionesProgramadas, r.extubacionesSinPve]).toEqual([2, 1]);
    // Despues de ella, una nueva intubacion es REintubacion.
    const reint = ev({ tipo: "REINTUBACION", via: "TET", calibre: "7.5", fijacionCm: "22" }, 6);
    expect(esReintubacion(reint, [sin, reint])).toBe(true);
  });
});
