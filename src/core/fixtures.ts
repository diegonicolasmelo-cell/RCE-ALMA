/**
 * Constructores de datos para tests. No se usa en produccion.
 * Defaults clinicamente coherentes: cada test sobreescribe solo lo que prueba.
 */

import type {
  Control,
  Episodio,
  EventoClinico,
  KineRespiratoria,
  TerapiaFisica,
  Ventilacion
} from "./tipos";

export function unEpisodio(over: Partial<Episodio> = {}): Episodio {
  return {
    id: "ep-1",
    cama: "UCI-01",
    edad: 64,
    sexo: "M",
    tallaCm: 172,
    tallaOrigen: "ESTIMADA",
    diagnostico: "Shock séptico foco pulmonar / SDRA en resolución",
    viaAereaActual: "TET",
    calibreVia: "8.0",
    fijacionCm: "22",
    diasVM: 4,
    equipos: [{ tipo: "VENTILADOR", modelo: "Savina", numero: 1, enUso: true }],
    monitoreo: { capnografia: false, pic: false, dve: false },
    rutTitular: "16.452.891-K",
    transcritoAlma: false,
    horaTranscripcion: null,
    pendienteEntrega: "Candidato a extubación si supera PVE vespertina.",
    activo: true,
    apkArchivada: null,
    ...over
  };
}

/** ACVC sincronico con valores coherentes (PI 67.8 kg: 430 ml son 6.3 ml/kg). */
export function unaVentilacion(over: Partial<Ventilacion> = {}): Ventilacion {
  return {
    modalidad: "ACVC",
    asincronico: false,
    frProgramada: 18,
    vtProgramado: 430,
    flujo: 50,
    ti: 1.0,
    presion: null,
    peep: 10,
    fio2: 45,
    frTotal: 20,
    vtEspirado: 430,
    pPico: 25,
    pPlateau: 20,
    pMedia: 12,
    autoPeep: null,
    volMinuto: 8.6,
    temperatura: null,
    musculaturaAccesoria: null,
    ...over
  };
}

const KINE_BASE: KineRespiratoria = {
  auscultacion: ["CREPITOS"],
  aspecto: "MUCOPURULENTA",
  reologia: "ESPESA",
  cantidad: "MODERADA"
};

const TF_BASE: TerapiaFisica = {
  estado: "REALIZADA",
  actividades: ["Giros en cama / posicionamiento"],
  ims: 1,
  motivoContraindicacion: null
};

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
    viaAerea: "TET",
    ventilacion: unaVentilacion(),
    esfuerzo: null,
    neuro: null,
    infusiones: { fentanilo: { dosis: 1.2, escalon: 2 } },
    sas: 3,
    vigilia: null,
    glasgow: null,
    s5q: null,
    kineResp: KINE_BASE,
    terapiaFisica: TF_BASE,
    observaciones: "Queda acoplado a VMI protectora.",
    ...over
  };
}

let seq = 0;
type BaseEvento = {
  id: string;
  episodioId: string;
  hora: string;
  registradoEn: string;
  rutAutor: string;
  comentario: string;
};

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
