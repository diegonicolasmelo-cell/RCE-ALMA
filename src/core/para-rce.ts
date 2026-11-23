/**
 * RCE by Kaptus: lo que Kaptus le manda al RCE (enlace inmediato, 22-nov-2026).
 *
 * Kaptus y el RCE son un solo proyecto: Kaptus anota a pie de cama (el teléfono) y el RCE es el
 * escritorio (sábana, evolución para ALMA, cifras). Esto traduce un control o un evento de Kaptus al
 * idioma del RCE: los MISMOS nombres de columna de EVOLUCIONES y sus mismos catálogos de vía aérea,
 * soporte y modo, para que la sábana y el formulario del RCE los lean con una sola regla.
 *
 * Una sola traducción, aquí, con pruebas: el servidor de Kaptus solo reenvía lo que el teléfono armó.
 * Nunca viaja el nombre ni el RUT: cama, hora, datos clínicos y el correo de quien anotó.
 */

import { calcularDerivados, calcularGlasgow } from "./fisiologia";
import { infusionesActivas } from "./infusiones";
import { calcularPbw } from "./fisiologia";
import { ASPECTOS_SECRECIONES } from "./catalogos";
import { etiquetaEquipo } from "./equipos";
import type { Control, Episodio, EquipoEnSala, EventoClinico, Modalidad, ViaAerea } from "./tipos";

/** Un control o un evento listo para el RCE. */
export interface ItemParaRce {
  readonly id: string;
  readonly tipo: "CONTROL" | "EVENTO";
  /** Número de la cama del RCE (Kaptus «UCI-03» = cama 3). */
  readonly cama: number;
  /** Hora local de lo ocurrido, «yyyy-MM-dd HH:mm». */
  readonly horaToma: string;
  /** Correo de quien lo anotó: el RCE saca la firma de KINESIOLOGOS.EMAIL. */
  readonly autor: string;
  /** Solo eventos: el código del RCE (EXTUBACION, PVE, KTM…). */
  readonly evento?: string;
  /** Valores simples con los nombres del RCE. */
  readonly datos: Readonly<Record<string, string | number | boolean>>;
  /** Solo controles: el evento que monitoriza, para marcar su columna en la sábana. */
  readonly eventos?: readonly { readonly tipo: string; readonly hora: string }[];
  /**
   * Los equipos de la sala con su nombre («Savina 2», «Meckis 12») y cuál está en uso (23-nov-2026):
   * el RCE pone esos ventiladores en la cama. Kaptus alimenta, el RCE muestra.
   */
  readonly equipos?: readonly { readonly equipo: string; readonly enUso: boolean }[];
}

// Ojo: la llave es «equipo», nunca «nombre» (el servidor de Kaptus rechaza todo lote que traiga «nombre»).
const equiposRce = (l: readonly EquipoEnSala[] | undefined): { equipo: string; enUso: boolean }[] =>
  (l ?? []).map((e) => ({ equipo: etiquetaEquipo(e), enUso: e.enUso }));

const pad = (n: number): string => String(n).padStart(2, "0");
/** «yyyy-MM-dd HH:mm» en hora local. */
export function horaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «UCI-03» → 3. Null si la cama no tiene número. */
export function camaRce(cama: string): number | null {
  const m = /(\d+)\s*$/.exec(cama);
  return m ? Number(m[1]) : null;
}

/** Vía aérea, soporte y modo con los catálogos del RCE (VMAPS del index del RCE). */
export function soporteRce(via: ViaAerea, m: Modalidad, flujoO2: number | null): { va: string; soporte: string; modo: string } {
  const va = via === "TET" ? "TOT" : via === "TQT" ? "TQT" : "Natural";
  const VM = (modo: string) => ({ va, soporte: "VM", modo });
  const O2 = (modo: string) => ({ va, soporte: "Oxigenoterapia/OAF", modo });
  switch (m) {
    case "ACVC": return VM("ACVC");
    case "PCV": return VM("ACPC");
    case "CPAP_PS": return VM("CPAP/PS");
    case "TUBO_T": return O2("Tubo T");
    case "CNAF_TQT": return O2("CTAF");
    case "VALVULA_FONACION": return flujoO2 ? O2("Válvula de fonación") : { va, soporte: "Ambiente", modo: "Válvula de fonación" };
    case "O2_NARICERA": return O2("NRC");
    case "O2_VENTURI": return O2("MMV");
    case "O2_RESERVORIO": return O2("MR");
    // El RCE no tiene mascarilla simple: queda con el nombre viejo, que el RCE sigue leyendo.
    case "O2_MASCARILLA": return O2("Mascarilla");
    case "CNAF": return O2("CNAF");
    // VNI con vía natural: Kaptus no pregunta la interfaz; el RCE la pide (Full Face u Oronasal).
    case "VNI_CPAP": return via === "TQT" ? VM("CPAP") : { va: "Full Face", soporte: "VNI", modo: "CPAP" };
    case "VNI_ST": return via === "TQT" ? VM("S/T") : { va: "Full Face", soporte: "VNI", modo: "S/T" };
    case "AVAPS": return via === "TQT" ? VM("AVAPS") : { va: "Full Face", soporte: "VNI", modo: "AVAPS" };
    case "AIRE_AMBIENTE": return { va, soporte: "Ambiente", modo: "Sin soporte" };
  }
}

/** Solo lo que tiene dato (el RCE descarta el resto). */
function limpio(o: Record<string, string | number | boolean | null | undefined>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out;
}

/** Un control de Kaptus en el idioma del RCE. Null si la cama no tiene número. */
export function controlParaRce(c: Control, ep: Episodio, eventos: readonly EventoClinico[] = []): ItemParaRce | null {
  const cama = camaRce(ep.cama);
  if (cama === null) return null;
  const v = c.ventilacion;
  const d = calcularDerivados(c, calcularPbw(ep.tallaCm, ep.sexo));
  const s = soporteRce(c.viaAerea, v.modalidad, v.flujo);
  const vni = s.soporte === "VNI" || ((v.modalidad === "VNI_ST" || v.modalidad === "AVAPS" || v.modalidad === "VNI_CPAP") && c.viaAerea === "TQT");
  const o2 = s.soporte !== "VM" && s.soporte !== "VNI";
  const g = c.glasgow ? calcularGlasgow(c.glasgow, c.viaAerea) : null;
  const dva = [...infusionesActivas(c.infusiones, "DVA"), ...infusionesActivas(c.infusiones, "INOTROPO")];
  const aspecto = c.kineResp.aspecto ? ASPECTOS_SECRECIONES.find((a) => a.val === c.kineResp.aspecto)?.label ?? "" : "";
  const datos = limpio({
    VENT_VIA_AEREA: s.va, VENT_SOPORTE: s.soporte, VENT_MODO: s.modo,
    // Vt: el programado en ACVC; en el resto, el espirado (como lo lee la hoja del RCE).
    VENT_VT: v.modalidad === "ACVC" ? v.vtProgramado : v.vtEspirado,
    VENT_FLUJO: o2 ? null : v.flujo, VENT_TI: v.ti,
    VENT_FR: v.frTotal ?? v.frProgramada,
    VENT_PEEP: vni ? null : v.peep, VENT_EPAP: vni ? v.peep : null,
    VENT_PS: !vni && v.modalidad === "CPAP_PS" ? v.presion : null, VENT_IPAP: vni && v.modalidad !== "VNI_CPAP" ? v.presion : null,
    VENT_PMAX: v.pPico, VENT_PMEDIA: v.pMedia, VENT_PPL: v.pPlateau, VENT_AUTOPEEP: v.autoPeep,
    VENT_FIO2: v.fio2, VENT_SPO2: c.spo2, VENT_LITROS: o2 ? v.flujo : null, VENT_TEMP: v.temperatura,
    CALC_ML_KG: d.mlKgGuia, CALC_DP: d.drivingPressure, CALC_CESR: d.compliance, CALC_IE: d.relacionIE, CALC_TOBIN: d.tobin, CALC_VOL_MIN: d.volumenMinuto,
    SED_GCS_TOT: g ? g.display : null, SED_GCS_O: c.glasgow?.ocular, SED_GCS_V: g ? (g.intubado ? "T" : c.glasgow?.verbal) : null, SED_GCS_M: c.glasgow?.motora,
    SED_SAS: c.sas,
    HEMO_DVA: dva.length ? "Sí" : null, HEMO_NUM_DVA: dva.length || null,
    KAP_FC: c.fc, KAP_PAS: c.pas, KAP_PAD: c.pad, KAP_PAM: d.pam,
    RESP_SECR_CAR: aspecto || null, RESP_SECR_REOL: c.kineResp.reologia?.toLowerCase() ?? null, RESP_SECR_QTY: c.kineResp.cantidad?.toLowerCase() ?? null
  });
  const ev = c.eventoId ? eventos.find((e) => e.id === c.eventoId) : undefined;
  const cod = ev ? eventoRceDe(ev) : null;
  return {
    id: c.id, tipo: "CONTROL", cama, horaToma: horaLocal(c.registradoEn), autor: c.rutAutor, datos, equipos: equiposRce(ep.equipos),
    ...(cod ? { eventos: [{ tipo: cod, hora: ev!.hora }] } : {})
  };
}

/** El código del RCE para un evento de Kaptus (primera tanda del PRD); null = no se envía. */
export function eventoRceDe(e: EventoClinico): string | null {
  switch (e.tipo) {
    case "EXTUBACION_PROGRAMADA": return "EXTUBACION";
    case "AUTOEXTUBACION": return e.accidental ? "EXTUBACION_ACCIDENTAL" : "AUTOEXTUBACION";
    case "REINTUBACION": return "REINTUBACION";
    case "FALLA_POST_EXTUB": return "FALLA_POST_EXTUB";
    case "DECANULACION": return "DECANULACION";
    case "DESVINCULACION": return "DESVINCULACION";
    case "RECONEXION": return "RECONEXION";
    case "CAMBIO_TUBO": return "CAMBIO_TUBO";
    case "CAMBIO_CANULA": return "CAMBIO_CANULA";
    case "AJUSTE_TUBO": return "AJUSTE_TUBO";
    case "INICIO_PVE": return "PVE";
    case "FIN_PVE": return "PVE_FIN";
    case "PVE_NO_REALIZADA": return "PVE_NO_REALIZADA";
    case "PVE_SIN_EXTUBAR": return "PVE_SIN_EXTUBAR";
    case "TRAQUEOSTOMIA": return "TQT";
    case "INICIO_PRONO": return "PRONO";
    case "SUPINACION": return "SUPINO";
    case "TERAPIA_FISICA": return "KTM";
    case "IMT": return "IMT";
    case "EDUCACION": return "EDUCACION";
    case "TOMA_CULTIVO": return "CULTIVO";
    case "TRASLADO_IMAGEN": return "IMAGEN";
    case "ASISTENCIA_PROCEDIMIENTO":
    case "ASISTENCIA_FBC": return "ASISTENCIA";
    case "EVALUACION_PUNTUAL": return "EVALUACION";
    // Evento escrito a mano (22-nov-2026): llega al RCE como nota con su texto y su hora.
    case "EVENTO_LIBRE": return "NOTA";
    // Cambio de cama (23-nov-2026): el RCE mueve al paciente igual que «mover a cama vacía».
    case "TRASLADO_CAMA": return "TRASLADO";
    // Cambio de ventilador u otro equipo de la sala (23-nov-2026): el RCE lo pone en la cama.
    case "CAMBIO_EQUIPOS": return "EQUIPOS";
    default: return null;
  }
}

/** Un evento de Kaptus en el idioma del RCE. Null si no está en la primera tanda o la cama no tiene número. */
export function eventoParaRce(e: EventoClinico, ep: Episodio): ItemParaRce | null {
  const cama = camaRce(ep.cama);
  const evento = eventoRceDe(e);
  if (cama === null || evento === null) return null;
  const real = "realizadaEn" in e && typeof e.realizadaEn === "string" ? e.realizadaEn : e.registradoEn;
  const x = e as unknown as Record<string, unknown>;
  const simple = (k: string): string | number | boolean | null => {
    const val = x[k];
    return typeof val === "string" || typeof val === "number" || typeof val === "boolean" ? val : null;
  };
  const datos = limpio({
    hora: e.hora, dispositivo: simple("dispositivo"), sinPve: simple("sinPve"), accidental: simple("accidental"),
    exitosa: simple("exitosa"), realizada: simple("realizada"), nivel: simple("nivel"), muestra: simple("muestra"),
    destino: simple("destino"), escala: simple("escala"), total: simple("total"), razon: simple("razon"), motivo: simple("motivo"),
    desde: simple("desde"), hasta: simple("hasta"), descripcion: simple("descripcion")
  });
  const equipos = e.tipo === "CAMBIO_EQUIPOS" ? { equipos: equiposRce(e.equipos) } : e.tipo === "TRASLADO_CAMA" ? { equipos: equiposRce(ep.equipos) } : {};
  return { id: e.id, tipo: "EVENTO", cama, horaToma: horaLocal(real), autor: e.rutAutor, evento, datos, ...equipos };
}
