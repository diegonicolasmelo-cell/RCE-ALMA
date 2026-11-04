import { describe, expect, it } from "vitest";
import {
  describirSedacion,
  dosisDeEscalon,
  escalonesDe,
  infusionLibre,
  sedantesActivos,
  suspender
} from "./sedacion";

describe("escalones de sedacion (protocolo UPC)", () => {
  it("respeta los extremos del protocolo de fentanilo", () => {
    expect(dosisDeEscalon("fentanilo", 1)).toBe(0.6);
    expect(dosisDeEscalon("fentanilo", 6)).toBe(3.6);
  });

  it("interpola linealmente los escalones intermedios", () => {
    // (3.6 - 0.6) / 5 = 0.6 por escalon
    expect(dosisDeEscalon("fentanilo", 2)).toBe(1.2);
    expect(dosisDeEscalon("fentanilo", 4)).toBe(2.4);
  });

  it("respeta los extremos de propofol, precedex y midazolam", () => {
    expect(dosisDeEscalon("propofol", 1)).toBe(0.5);
    expect(dosisDeEscalon("propofol", 6)).toBe(3);
    expect(dosisDeEscalon("precedex", 1)).toBe(0.2);
    expect(dosisDeEscalon("precedex", 6)).toBe(1.5);
    expect(dosisDeEscalon("midazolam", 1)).toBe(0.01);
    expect(dosisDeEscalon("midazolam", 6)).toBe(0.06);
  });

  it("usa tres decimales cuando el farmaco lo necesita (midazolam)", () => {
    expect(dosisDeEscalon("midazolam", 2)).toBe(0.02);
    expect(dosisDeEscalon("midazolam", 3)).toBe(0.03);
  });

  it("acota escalones fuera de rango en vez de extrapolar una dosis peligrosa", () => {
    expect(dosisDeEscalon("fentanilo", 0)).toBe(0.6);
    expect(dosisDeEscalon("fentanilo", 99)).toBe(3.6);
  });

  it("entrega los 6 escalones para los botones de la UI", () => {
    const e = escalonesDe("precedex");
    expect(e).toHaveLength(6);
    expect(e[0]).toEqual({ escalon: 1, dosis: 0.2 });
    expect(e[5]).toEqual({ escalon: 6, dosis: 1.5 });
  });
});

describe("dosis libre", () => {
  it("permite registrar fuera de protocolo (coma inducido, estatus epileptico)", () => {
    const inf = infusionLibre(5.4);
    expect(inf.escalon).toBeNull();
    expect(inf.dosis).toBe(5.4);
  });
});

describe("sedantesActivos", () => {
  it("ignora farmacos en cero o ausentes", () => {
    const activos = sedantesActivos({
      fentanilo: { escalon: 2, dosis: 1.2 },
      propofol: { escalon: null, dosis: 0 },
      midazolam: { escalon: null, dosis: null }
    });
    expect(activos.map((a) => a.id)).toEqual(["fentanilo"]);
  });

  it("devuelve los activos en el orden del protocolo, no el de insercion", () => {
    const activos = sedantesActivos({
      precedex: { escalon: 1, dosis: 0.2 },
      fentanilo: { escalon: 1, dosis: 0.6 }
    });
    // Protocolo: fentanilo, propofol, precedex, midazolam, lorazepam.
    expect(activos.map((a) => a.id)).toEqual(["fentanilo", "precedex"]);
  });
});

describe("describirSedacion", () => {
  it("describe la infusion con unidad y escalon", () => {
    const texto = describirSedacion({
      fentanilo: { escalon: 2, dosis: 1.2 },
      precedex: { escalon: null, dosis: 0.4 }
    });
    expect(texto).toBe("Fentanilo 1.2 mcg/kg/h (esc. 2) + Precedex 0.4 mcg/kg/h");
  });

  it("informa explicitamente la ausencia de sedantes activos", () => {
    expect(describirSedacion({})).toBe("sin sedantes activos");
    expect(describirSedacion({ propofol: { escalon: null, dosis: 0 } })).toBe(
      "sin sedantes activos"
    );
  });
});

describe("suspender", () => {
  it("deja el farmaco en cero con un solo toque y no toca los demas", () => {
    const s = suspender(
      { fentanilo: { escalon: 2, dosis: 1.2 }, propofol: { escalon: 3, dosis: 1.5 } },
      "propofol"
    );
    expect(s.propofol?.dosis).toBe(0);
    expect(s.fentanilo?.dosis).toBe(1.2);
    expect(sedantesActivos(s).map((a) => a.id)).toEqual(["fentanilo"]);
  });
});
