import { describe, expect, it } from "vitest";
import {
  describirCardiovasculares,
  describirInfusiones,
  dosisDeEscalon,
  enCurso,
  escalonesDe,
  infusionesActivas,
  infusionLibre,
  infusionPorEscalon,
  iniciar,
  sedoanalgesiaActiva,
  semaforoCatecolamina,
  semaforoDva,
  suspender,
  usaSoporteCardiovascular
} from "./infusiones";
import { INFUSIONES } from "./catalogos";

describe("escalones de sedoanalgesia (protocolo UPC)", () => {
  it("respeta los extremos de los cuatro sedantes con escalones", () => {
    expect(dosisDeEscalon("fentanilo", 1)).toBe(0.6);
    expect(dosisDeEscalon("fentanilo", 6)).toBe(3.6);
    expect(dosisDeEscalon("propofol", 1)).toBe(0.5);
    expect(dosisDeEscalon("propofol", 6)).toBe(3);
    expect(dosisDeEscalon("dexmedetomidina", 1)).toBe(0.2);
    expect(dosisDeEscalon("dexmedetomidina", 6)).toBe(1.5);
    expect(dosisDeEscalon("midazolam", 1)).toBe(0.01);
    expect(dosisDeEscalon("midazolam", 6)).toBe(0.06);
  });

  it("interpola los intermedios linealmente (tabla real por confirmar)", () => {
    expect(dosisDeEscalon("fentanilo", 2)).toBe(1.2);
    expect(dosisDeEscalon("fentanilo", 4)).toBe(2.4);
    expect(dosisDeEscalon("midazolam", 3)).toBe(0.03);
  });

  it("acota escalones fuera de rango en vez de extrapolar una dosis peligrosa", () => {
    expect(dosisDeEscalon("fentanilo", 0)).toBe(0.6);
    expect(dosisDeEscalon("fentanilo", 99)).toBe(3.6);
  });

  it("lorazepam NO tiene escalones: solo dosis libre (no se inventa una escala)", () => {
    expect(dosisDeEscalon("lorazepam", 3)).toBeNull();
    expect(escalonesDe("lorazepam")).toEqual([]);
    expect(infusionPorEscalon("lorazepam", 2)).toBeNull();
  });

  it("entrega los 6 escalones para los botones de la UI", () => {
    const e = escalonesDe("dexmedetomidina");
    expect(e).toHaveLength(6);
    expect(e[0]).toEqual({ escalon: 1, dosis: 0.2 });
    expect(e[5]).toEqual({ escalon: 6, dosis: 1.5 });
  });

  it("la dosis libre queda sin escalón asociado", () => {
    expect(infusionLibre(5.4)).toEqual({ dosis: 5.4, escalon: null });
  });
});

describe("iniciar / suspender", () => {
  it("un farmaco ausente esta suspendido; iniciar lo deja en curso", () => {
    const base = {};
    expect(enCurso(base, "fentanilo")).toBeNull();
    const con = iniciar(base, "fentanilo", { dosis: 1.2, escalon: 2 });
    expect(enCurso(con, "fentanilo")?.dosis).toBe(1.2);
  });

  it("suspender quita solo ese farmaco y no toca los demas", () => {
    const x = iniciar(iniciar({}, "fentanilo", { dosis: 1.2, escalon: 2 }), "propofol", { dosis: 1, escalon: 2 });
    const y = suspender(x, "propofol");
    expect(enCurso(y, "propofol")).toBeNull();
    expect(enCurso(y, "fentanilo")?.dosis).toBe(1.2);
  });

  it("una dosis en cero no cuenta como en curso", () => {
    expect(enCurso({ propofol: { dosis: 0, escalon: null } }, "propofol")).toBeNull();
  });

  it("no muta el objeto original (inmutabilidad)", () => {
    const base = Object.freeze({ fentanilo: { dosis: 1, escalon: 1 } });
    expect(() => suspender(base, "fentanilo")).not.toThrow();
    expect(base.fentanilo.dosis).toBe(1);
  });
});

describe("sedoanalgesia activa se deduce", () => {
  it("es No si no hay ningún sedante en curso, aunque haya DVA", () => {
    expect(sedoanalgesiaActiva({ noradrenalina: { dosis: 0.1, escalon: null } })).toBe(false);
  });

  it("es Sí si hay al menos un sedante", () => {
    expect(sedoanalgesiaActiva({ lorazepam: { dosis: 1, escalon: null } })).toBe(true);
  });
});

describe("infusionesActivas y textos", () => {
  const inf = {
    propofol: { dosis: 1.5, escalon: 3 },
    fentanilo: { dosis: 1.2, escalon: 2 },
    noradrenalina: { dosis: 0.08, escalon: null }
  } as const;

  it("respeta el orden del catálogo, no el de inserción", () => {
    expect(infusionesActivas(inf, "SEDANTE").map((a) => a.id)).toEqual(["fentanilo", "propofol"]);
  });

  it("describe con unidad y escalón", () => {
    expect(describirInfusiones(inf, "SEDANTE")).toBe("Fentanilo 1.2 mcg/kg/h (esc. 2) + Propofol 1.5 mg/kg/h (esc. 3)");
  });

  it("cada farmaco muestra su unidad: vasopresina en UI/min", () => {
    expect(describirCardiovasculares({ vasopresina: { dosis: 0.02, escalon: null } })).toBe("Vasopresina 0.02 UI/min");
    expect(INFUSIONES.find((i) => i.id === "adrenalina")?.unidad).toBe("mcg/kg/min");
  });

  it("lo cardiovascular describe DVA e inotropos juntos", () => {
    expect(
      describirCardiovasculares({ noradrenalina: { dosis: 0.08, escalon: null }, dobutamina: { dosis: 5, escalon: null } })
    ).toBe("Noradrenalina 0.08 mcg/kg/min + Dobutamina 5 mcg/kg/min");
  });

  it("es explícito cuando no hay requerimiento", () => {
    expect(describirCardiovasculares({})).toBe("sin requerimiento de DVA ni inotrópicos");
  });
});

describe("semáforo de riesgo hemodinámico", () => {
  it("aplica los cortes institucionales", () => {
    expect(semaforoCatecolamina(null)).toBe("SIN_DVA");
    expect(semaforoCatecolamina(0.05)).toBe("BAJA");
    expect(semaforoCatecolamina(0.2)).toBe("MEDIA");
    expect(semaforoCatecolamina(0.45)).toBe("ALTA");
  });

  it("trata los límites exactos de forma determinista", () => {
    expect(semaforoCatecolamina(0.1)).toBe("MEDIA");
    expect(semaforoCatecolamina(0.3)).toBe("MEDIA");
    expect(semaforoCatecolamina(0.31)).toBe("ALTA");
  });

  it("se queda con el nivel más alto: NAD baja con adrenalina alta es riesgo alto", () => {
    expect(
      semaforoDva({ noradrenalina: { dosis: 0.05, escalon: null }, adrenalina: { dosis: 0.5, escalon: null } })
    ).toBe("ALTA");
  });

  it("vasopresina, dobutamina y milrinona no entran al semáforo pero cuentan como soporte", () => {
    const inf = { vasopresina: { dosis: 0.03, escalon: null } };
    expect(semaforoDva(inf)).toBe("SIN_DVA");
    expect(usaSoporteCardiovascular(inf)).toBe(true);
    expect(usaSoporteCardiovascular({})).toBe(false);
  });
});
