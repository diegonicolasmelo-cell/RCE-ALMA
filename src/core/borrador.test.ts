import { describe, expect, it } from "vitest";
import {
  CAMPOS_DINAMICOS_EN_BLANCO,
  crearBorradorNuevoControl,
  materializarControl,
  medicionDe
} from "./borrador";
import { unControl, unEpisodio } from "./fixtures";

/**
 * REGLA ANTI-SESGO 3.A — el test mas importante del nucleo.
 *
 * El prototipo original heredaba los signos vitales del control anterior, que es
 * exactamente el sesgo de arrastre que el informe quiere eliminar. Estos tests
 * fijan la regla correcta: si alguien reintroduce la herencia, fallan.
 */
describe("regla anti-sesgo: variables dinamicas nacen en blanco", () => {
  const episodio = unEpisodio();
  const anterior = unControl();

  it("deja TODAS las variables dinamicas vacias aunque exista un control previo", () => {
    const b = crearBorradorNuevoControl(episodio, anterior, episodio.rutTitular);
    for (const campo of CAMPOS_DINAMICOS_EN_BLANCO) {
      expect(b[campo], `el campo dinamico "${campo}" debe nacer vacio`).toBe("");
    }
  });

  it("cubre los ocho campos que exige el informe", () => {
    expect([...CAMPOS_DINAMICOS_EN_BLANCO].sort()).toEqual(
      ["fc", "fr", "pPico", "pPlateau", "pad", "pas", "spo2", "vt"].sort()
    );
  });

  it("nunca hereda la observacion de asincronia: es del momento", () => {
    const previo = unControl({ soporte: { ...anterior.soporte, asincronico: true } });
    expect(crearBorradorNuevoControl(episodio, previo, episodio.rutTitular).asincronico).toBe(false);
  });

  it("deja la seccion kinesica completamente limpia", () => {
    const b = crearBorradorNuevoControl(episodio, anterior, episodio.rutTitular);
    expect(b.actividadesMotoras).toEqual([]);
    expect(b.respiratoriaRealizada).toBe(false);
    expect(b.aspiracion).toBe("NO_REQUIERE");
    expect(b.motoraContraindicada).toBe(false);
    expect(b.ims).toBeNull();
    expect(b.observaciones).toBe("");
  });

  it("deja las mediciones de esfuerzo respiratorio frescas", () => {
    const b = crearBorradorNuevoControl(episodio, anterior, episodio.rutTitular);
    expect([b.p01, b.nif, b.pOcc, b.pMus, b.pmi, b.pim, b.pcf]).toEqual(["", "", "", "", "", "", ""]);
  });
});

describe("herencia deliberada de estado continuo", () => {
  const episodio = unEpisodio();

  it("hereda las infusiones continuas para evitar tipeo excesivo", () => {
    const previo = unControl({
      dva: { noradrenalina: 0.08, adrenalina: null, vasopresina: null },
      sedacionActiva: true,
      sedacion: { fentanilo: { escalon: 2, dosis: 1.2 } }
    });
    const b = crearBorradorNuevoControl(episodio, previo, episodio.rutTitular);
    expect(b.noradrenalina).toBe("0.08");
    expect(b.sedacionActiva).toBe(true);
    expect(b.sedacion.fentanilo?.dosis).toBe(1.2);
  });

  it("hereda el modo ventilatorio, PEEP y FiO2", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    expect(b.tipoVentilacion).toBe("VMI");
    expect(b.modoVMI).toBe("VCV");
    expect(b.peep).toBe("10");
    expect(b.fio2).toBe("45");
  });

  it("toma la via aerea del episodio, no del control previo", () => {
    const b = crearBorradorNuevoControl(unEpisodio({ viaAereaActual: "TQT" }), unControl(), "x");
    expect(b.viaAerea).toBe("TQT");
  });

  it("fuerza verbal = 1 cuando la via aerea es artificial", () => {
    const b = crearBorradorNuevoControl(episodio, null, episodio.rutTitular);
    expect(b.gcsVerbal).toBe(1);
  });

  it("marca el control como de apoyo si la cama no es del autor", () => {
    const b = crearBorradorNuevoControl(episodio, null, "99.999.999-9");
    expect(b.esControlApoyo).toBe(true);
  });
});

describe("medicionDe", () => {
  it("distingue campo vacio de cero medido", () => {
    expect(medicionDe("")).toBeNull();
    expect(medicionDe("   ")).toBeNull();
    expect(medicionDe("0")).toBe(0);
  });

  it("acepta coma decimal (teclado en espanol)", () => {
    expect(medicionDe("0,08")).toBe(0.08);
  });

  it("devuelve null ante texto no numerico en vez de NaN", () => {
    expect(medicionDe("abc")).toBeNull();
  });
});

describe("materializarControl", () => {
  const episodio = unEpisodio();
  const ahora = new Date("2026-11-04T15:30:00.000Z");

  it("convierte campos vacios en null, no en cero", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    const c = materializarControl(b, { id: "ct-2", numero: 2, ahora });
    expect(c.fc).toBeNull();
    expect(c.soporte.pPlateau).toBeNull();
  });

  it("aplica conciencia condicional: sin sedacion no guarda SAS", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    b.sedacionActiva = false;
    b.sas = 4;
    b.vigilia = "VIGIL_ALERTA";
    const c = materializarControl(b, { id: "ct-2", numero: 2, ahora });
    expect(c.sas).toBeNull();
    expect(c.vigilia).toBe("VIGIL_ALERTA");
    expect(c.sedacion).toEqual({});
  });

  it("aplica conciencia condicional: con sedacion no guarda estado de vigilia", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    b.sedacionActiva = true;
    b.sas = 3;
    b.vigilia = "COMA";
    const c = materializarControl(b, { id: "ct-2", numero: 2, ahora });
    expect(c.sas).toBe(3);
    expect(c.vigilia).toBeNull();
  });

  it("descarta actividades motoras si la kine motora esta contraindicada", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    b.motoraContraindicada = true;
    b.motivoContraindicacion = "Sangrado activo o procedimiento invasivo en curso";
    b.actividadesMotoras = ["Marcha asistida en el box / pasillo UPC"];
    b.ims = 8;
    const c = materializarControl(b, { id: "ct-2", numero: 2, ahora });
    expect(c.intervencion.actividadesMotoras).toEqual([]);
    expect(c.intervencion.ims).toBeNull();
    expect(c.intervencion.motivoContraindicacion).toContain("Sangrado activo");
  });

  it("no crea bloque de esfuerzo si no se midio nada", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    expect(materializarControl(b, { id: "ct-2", numero: 2, ahora }).esfuerzo).toBeNull();
  });

  it("crea el bloque de esfuerzo si se midio al menos un parametro", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    b.pcf = "62";
    const c = materializarControl(b, { id: "ct-2", numero: 2, ahora });
    expect(c.esfuerzo?.pcf).toBe(62);
    expect(c.esfuerzo?.nif).toBeNull();
  });
});
