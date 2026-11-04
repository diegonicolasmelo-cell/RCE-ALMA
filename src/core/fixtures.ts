/**
 * Constructores de datos para tests. No se usa en produccion.
 * Defaults clinicamente coherentes: cada test sobreescribe solo lo que prueba.
 */

import type {
  Control,
  Dva,
  Episodio,
  EsfuerzoRespiratorio,
  EventoClinico,
  Glasgow,
  IntervencionKinesica,
  SoporteVentilatorio
} from "./tipos";

export function unEpisodio(over: Partial<Episodio> = {}): Episodio {
  return {
    id: "ep-1",
    cama: "UCI-01",
    edad: 64,
    sexo: "M",
    tallaCm: 172,
    diagnostico: "Shock septico foco pulmonar / SDRA en resolucion",
    viaAereaActual: "TET",
    calibreVia: "8.0",
    fijacionCm: "22",
    diasVM: 4,
    rutTitular: "16.452.891-K",
    transcritoAlma: false,
    horaTranscripcion: null,
    pendienteEntrega: "Candidato a extubacion si supera PVE vespertina.",
    activo: true,
    ...over
  };
}

const SOPORTE_VMI: SoporteVentilatorio = {
  tipo: "VMI",
  modoVMI: "VCV",
  fio2: 45,
  peep: 10,
  vt: 430,
  fr: 20,
  presionSoporte: null,
  pPico: 25,
  pPlateau: 20,
  flujo: null,
  presionCuff: 28,
  asincronico: false
};

const DVA_SIN: Dva = { noradrenalina: null, adrenalina: null, vasopresina: null };

const GLASGOW_BASE: Glasgow = { ocular: 3, verbal: 1, motora: 5 };

const INTERVENCION_BASE: IntervencionKinesica = {
  respiratoriaRealizada: true,
  aspiracion: "CIRCUITO_CERRADO",
  motoraContraindicada: false,
  motivoContraindicacion: null,
  actividadesMotoras: ["Giros en cama / posicionamiento"],
  ims: 1
};

export function unSoporte(over: Partial<SoporteVentilatorio> = {}): SoporteVentilatorio {
  return { ...SOPORTE_VMI, ...over };
}

export function unEsfuerzo(over: Partial<EsfuerzoRespiratorio> = {}): EsfuerzoRespiratorio {
  return {
    p01: null,
    nif: null,
    pOcc: null,
    pMus: null,
    pmi: null,
    pim: null,
    pcf: null,
    ...over
  };
}

export function unControl(over: Partial<Control> = {}): Control {
  return {
    id: "ct-1",
    episodioId: "ep-1",
    numero: 1,
    hora: "09:10",
    registradoEn: "2026-11-04T12:10:00.000Z",
    rutAutor: "16.452.891-K",
    esControlApoyo: false,
    corrige: null,
    fc: 96,
    pas: 112,
    pad: 62,
    spo2: 95,
    pic: null,
    dva: DVA_SIN,
    viaAerea: "TET",
    soporte: SOPORTE_VMI,
    esfuerzo: null,
    glasgow: GLASGOW_BASE,
    sedacionActiva: true,
    sas: 3,
    vigilia: null,
    sedacion: { fentanilo: { escalon: 2, dosis: 1.2 } },
    bnmActivo: false,
    secrecionesCantidad: "MODERADAS",
    secrecionesTipo: "MUCOPURULENTAS",
    intervencion: INTERVENCION_BASE,
    observaciones: "Queda acoplado a VMI protectora.",
    ...over
  };
}

let seq = 0;

/** Evento con los campos base rellenos; `tipo` y su carga util vienen del caller. */
export function unEvento<T extends EventoClinico>(
  especifico: Omit<T, keyof BaseEvento> & Partial<BaseEvento>
): T {
  seq += 1;
  return {
    id: `ev-${seq}`,
    episodioId: "ep-1",
    hora: "10:00",
    registradoEn: "2026-11-04T13:00:00.000Z",
    rutAutor: "16.452.891-K",
    comentario: "",
    ...especifico
  } as T;
}

type BaseEvento = {
  id: string;
  episodioId: string;
  hora: string;
  registradoEn: string;
  rutAutor: string;
  comentario: string;
};
