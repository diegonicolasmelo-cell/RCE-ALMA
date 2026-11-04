import { describe, expect, it } from "vitest";
import {
  CAMPOS_VENT_OBSERVADOS,
  CAMPOS_VENT_PROGRAMADOS,
  CAMPOS_VITALES,
  alternarDosisLibre,
  cambiarModalidad,
  crearBorradorNuevoControl,
  dosisEfectiva,
  infusionVacia,
  iniciarInfusion,
  materializarControl,
  medicionDe,
  suspenderInfusion,
  validarBorrador
} from "./borrador";
import type { BorradorControl } from "./borrador";
import { firmarApkCumple, firmarApkNoCumple } from "./apk";
import { unControl, unEpisodio, unaVentilacion } from "./fixtures";
import type { ValidacionApk } from "./tipos";

const episodio = unEpisodio();
const AHORA = new Date(2026, 10, 4, 15, 30);

const apkOk = () => firmarApkCumple({ id: "a1", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: AHORA });
const apkNo = () => firmarApkNoCumple({ id: "a2", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: AHORA }, ["PEEP ≤ 12 cmH₂O"]);

/** Un borrador completo, listo para guardar. */
function completo(over: Partial<BorradorControl> = {}): BorradorControl {
  const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
  return {
    ...b,
    fc: "86",
    spo2: "97",
    pas: "122",
    pad: "68",
    vent: { ...b.vent, frTotal: "20", vtEspirado: "430", pPico: "25", pPlateau: "20", pMedia: "12" },
    sas: 3,
    kineRealizada: true,
    terapiaFisica: "NO",
    ...over
  };
}

/**
 * REGLA ANTI-SESGO 3.A — el test más importante del núcleo. Si alguien
 * reintroduce la herencia de lecturas de monitor, estos tests fallan.
 */
describe("regla anti-sesgo: lo que se lee del monitor nace en blanco", () => {
  const previo = unControl();
  const b = crearBorradorNuevoControl(episodio, previo, episodio.rutTitular);

  it("signos vitales vacíos aunque exista un control previo", () => {
    for (const c of CAMPOS_VITALES) expect(b[c], `"${c}" debe nacer vacío`).toBe("");
  });

  it("lo que hace el paciente (FR total, Vt espirado, presiones) nace vacío", () => {
    for (const c of CAMPOS_VENT_OBSERVADOS) expect(b.vent[c], `"${c}" debe nacer vacío`).toBe("");
  });

  it("cubre exactamente lo observado", () => {
    expect([...CAMPOS_VENT_OBSERVADOS].sort()).toEqual(["frTotal", "pMedia", "pPico", "pPlateau", "vtEspirado"]);
  });

  it("la asincronía es del momento: no se hereda", () => {
    const previoAsinc = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    expect(crearBorradorNuevoControl(episodio, previoAsinc, episodio.rutTitular).asincronico).toBe(false);
  });

  it("las evaluaciones (SAS, vigilia, kine, terapia física) nacen en blanco", () => {
    expect(b.sas).toBeNull();
    expect(b.vigilia).toBeNull();
    expect(b.kineRealizada).toBeNull();
    expect(b.terapiaFisica).toBeNull();
    expect(b.actividades).toEqual([]);
    expect(b.ims).toBe("");
    expect(b.observaciones).toBe("");
  });
});

describe("herencia deliberada de ajustes e infusiones", () => {
  const previo = unControl({
    infusiones: { fentanilo: { dosis: 1.2, escalon: 2 }, noradrenalina: { dosis: 0.08, escalon: null } },
    ventilacion: unaVentilacion({ peep: 8, fio2: 40, vtProgramado: 600, frProgramada: 16, ti: 1.1, flujo: 55 })
  });
  const b = crearBorradorNuevoControl(episodio, previo, episodio.rutTitular);

  it("hereda los ajustes programados del ventilador", () => {
    for (const c of CAMPOS_VENT_PROGRAMADOS) expect(b.vent[c]).toBe(String(previo.ventilacion[c] ?? ""));
    expect(b.vent.peep).toBe("8");
    expect(b.vent.vtProgramado).toBe("600");
  });

  it("hereda la modalidad", () => expect(b.modalidad).toBe("ACVC"));

  it("hereda las infusiones en curso con su escalón o dosis libre", () => {
    expect(b.infusiones.fentanilo).toEqual({ activa: true, escalon: "2", dosis: "1.2", libre: false });
    expect(b.infusiones.noradrenalina).toMatchObject({ activa: true, dosis: "0.08", libre: true });
  });

  it("los farmacos que estaban suspendidos nacen apagados (apagados por defecto)", () => {
    expect(b.infusiones.adrenalina.activa).toBe(false);
    expect(b.infusiones.vasopresina.activa).toBe(false);
    expect(b.infusiones.dobutamina.activa).toBe(false);
  });

  it("sin control previo, la modalidad depende de la vía aérea y todo nace apagado", () => {
    const nuevo = crearBorradorNuevoControl(unEpisodio({ viaAereaActual: "NATURAL" }), null, "x");
    expect(nuevo.modalidad).toBe("CNAF");
    expect(Object.values(nuevo.infusiones).every((i) => !i.activa)).toBe(true);
    expect(crearBorradorNuevoControl(episodio, null, "x").modalidad).toBe("CPAP_PS");
  });

  it("marca el control como de apoyo si la cama no es del autor", () => {
    expect(crearBorradorNuevoControl(episodio, null, "99.999.999-9").esControlApoyo).toBe(true);
  });
});

describe("transformaciones del borrador", () => {
  it("cambiar a CNAF fuerza sincrónico (no aplica)", () => {
    const b = { ...completo(), asincronico: true };
    expect(cambiarModalidad(b, "CNAF").asincronico).toBe(false);
    expect(cambiarModalidad(b, "PCV").asincronico).toBe(true);
  });

  it("iniciar y suspender infusiones", () => {
    const b = iniciarInfusion(completo(), "adrenalina");
    expect(b.infusiones.adrenalina.activa).toBe(true);
    const s = suspenderInfusion({ ...b, infusiones: { ...b.infusiones, adrenalina: { activa: true, escalon: "", dosis: "0.1", libre: true } } }, "adrenalina");
    expect(s.infusiones.adrenalina).toEqual({ activa: false, escalon: "", dosis: "", libre: true });
  });

  it("alternar dosis libre en un sedante con escalones", () => {
    const b = iniciarInfusion(completo(), "propofol");
    expect(b.infusiones.propofol.libre).toBe(false);
    expect(alternarDosisLibre(b, "propofol").infusiones.propofol.libre).toBe(true);
  });

  it("lorazepam no tiene escalones: siempre dosis libre, no se puede alternar", () => {
    const b = iniciarInfusion(completo(), "lorazepam");
    expect(infusionVacia("lorazepam").libre).toBe(true);
    expect(alternarDosisLibre(b, "lorazepam")).toBe(b);
  });

  it("la dosis efectiva sale del escalón o de la dosis libre", () => {
    expect(dosisEfectiva("fentanilo", { activa: true, escalon: "3", dosis: "", libre: false })).toBe(1.8);
    expect(dosisEfectiva("fentanilo", { activa: true, escalon: "", dosis: "5,4", libre: true })).toBe(5.4);
    expect(dosisEfectiva("fentanilo", { activa: true, escalon: "", dosis: "", libre: false })).toBeNull();
  });
});

describe("medicionDe", () => {
  it("distingue campo vacío de cero medido", () => {
    expect(medicionDe("")).toBeNull();
    expect(medicionDe("  ")).toBeNull();
    expect(medicionDe("0")).toBe(0);
  });
  it("acepta coma decimal y rechaza texto", () => {
    expect(medicionDe("0,08")).toBe(0.08);
    expect(medicionDe("abc")).toBeNull();
  });
});

describe("validarBorrador", () => {
  const sinApk: { apkVigente: ValidacionApk | null } = { apkVigente: null };
  const campos = (b: BorradorControl, ctx = sinApk) => validarBorrador(b, ctx).map((p) => p.campo);

  it("un borrador recién creado reporta todo lo obligatorio", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    const c = campos(b);
    expect(c).toEqual(expect.arrayContaining(["fc", "spo2", "pas", "pad", "frTotal", "kine", "terapiaFisica"]));
  });

  it("un borrador completo con APK vigente no reporta nada", () => {
    expect(campos(completo(), { apkVigente: apkOk() })).toEqual([]);
  });

  it("con sedoanalgesia en curso se exige SAS; sin ella, estado de vigilia", () => {
    const sedada = completo({ sas: null });
    expect(campos(sedada, { apkVigente: apkOk() })).toContain("sas");
    const sinSed = suspenderInfusion(completo({ sas: null }), "fentanilo");
    const c = campos(sinSed, { apkVigente: apkOk() });
    expect(c).toContain("vigilia");
    expect(c).not.toContain("sas");
  });

  it("una infusión iniciada sin dosis o escalón impide guardar", () => {
    const b = iniciarInfusion(completo(), "propofol");
    expect(campos(b, { apkVigente: apkOk() })).toContain("infusion:propofol");
  });

  it("kine respiratoria hecha exige la APK de este turno", () => {
    const m = validarBorrador(completo(), sinApk).find((p) => p.campo === "apk");
    expect(m?.mensaje).toContain("firmar la APK");
  });

  it("una APK que no cumple impide la kine respiratoria", () => {
    const m = validarBorrador(completo(), { apkVigente: apkNo() }).find((p) => p.campo === "apk");
    expect(m?.mensaje).toContain("no cumple");
  });

  it("si no hizo kine respiratoria no se exige APK", () => {
    expect(campos(completo({ kineRealizada: false }), sinApk)).not.toContain("apk");
  });
});

describe("materializarControl", () => {
  const datos = { id: "ct-2", numero: 2, ahora: AHORA, viaAerea: "TET" as const };

  it("campos vacíos son null, no cero", () => {
    const b = crearBorradorNuevoControl(episodio, unControl(), episodio.rutTitular);
    const c = materializarControl(b, datos);
    expect(c.fc).toBeNull();
    expect(c.ventilacion.pPlateau).toBeNull();
  });

  it("toma la vía aérea del episodio, no del borrador", () => {
    expect(materializarControl(completo(), { ...datos, viaAerea: "TQT" }).viaAerea).toBe("TQT");
  });

  it("los campos que no aplican a la modalidad quedan en null", () => {
    const b = cambiarModalidad(
      completo({ vent: { ...completo().vent, flujo: "40", vtProgramado: "600", pPlateau: "20" } }),
      "CNAF"
    );
    const v = materializarControl(b, datos).ventilacion;
    expect(v.modalidad).toBe("CNAF");
    expect(v.vtProgramado).toBeNull();
    expect(v.pPlateau).toBeNull();
    expect(v.peep).toBeNull();
    expect(v.flujo).toBe(40);
  });

  it("CPAP+PS no guarda plateau ni TI aunque estuvieran tipeados", () => {
    const b = cambiarModalidad(completo({ vent: { ...completo().vent, ti: "1", pPlateau: "20", presion: "7" } }), "CPAP_PS");
    const v = materializarControl(b, datos).ventilacion;
    expect(v.pPlateau).toBeNull();
    expect(v.ti).toBeNull();
    expect(v.presion).toBe(7);
  });

  it("la dosis de una infusión por escalón sale del protocolo", () => {
    const b = iniciarInfusion(completo(), "propofol");
    const conEsc = { ...b, infusiones: { ...b.infusiones, propofol: { activa: true, escalon: "4", dosis: "", libre: false } } };
    expect(materializarControl(conEsc, datos).infusiones.propofol).toEqual({ dosis: 2, escalon: 4 });
  });

  it("una dosis libre queda sin escalón", () => {
    const b = completo();
    const libre = { ...b, infusiones: { ...b.infusiones, lorazepam: { activa: true, escalon: "", dosis: "1,5", libre: true } } };
    expect(materializarControl(libre, datos).infusiones.lorazepam).toEqual({ dosis: 1.5, escalon: null });
  });

  it("las infusiones suspendidas no se guardan", () => {
    const c = materializarControl(suspenderInfusion(completo(), "fentanilo"), datos);
    expect(c.infusiones.fentanilo).toBeUndefined();
  });

  it("conciencia condicional: con sedación guarda SAS y no vigilia", () => {
    const c = materializarControl(completo({ vigilia: "COMA" }), datos);
    expect(c.sas).toBe(3);
    expect(c.vigilia).toBeNull();
  });

  it("conciencia condicional: sin sedación guarda vigilia y no SAS", () => {
    const c = materializarControl(suspenderInfusion(completo({ sas: 4, vigilia: "VIGIL_ALERTA" }), "fentanilo"), datos);
    expect(c.sas).toBeNull();
    expect(c.vigilia).toBe("VIGIL_ALERTA");
  });

  it("si no hizo kine respiratoria descarta aspiración y secreciones", () => {
    const c = materializarControl(completo({ kineRealizada: false, aspiracion: "SET", aspecto: "PURULENTA" }), datos);
    expect(c.kineResp).toEqual({ realizada: false, aspiracion: "NO", aspecto: null, reologia: null, cantidad: null });
  });

  it("terapia física contraindicada descarta actividades e IMS y guarda el motivo", () => {
    const c = materializarControl(
      completo({ terapiaFisica: "CONTRAINDICADA", actividades: ["Marcha asistida en el box"], ims: "8", motivoContraindicacion: "PIC fuera de meta" }),
      datos
    );
    expect(c.terapiaFisica).toEqual({ estado: "CONTRAINDICADA", actividades: [], ims: null, motivoContraindicacion: "PIC fuera de meta" });
  });

  it("terapia física realizada guarda actividades e IMS", () => {
    const c = materializarControl(completo({ terapiaFisica: "REALIZADA", actividades: ["IMT (entrenamiento muscular inspiratorio)"], ims: "3" }), datos);
    expect(c.terapiaFisica.ims).toBe(3);
    expect(c.terapiaFisica.actividades).toHaveLength(1);
  });
});
