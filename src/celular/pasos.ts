/**
 * El control se llena bloque por bloque, en el orden de la hoja de papel. Un bloque
 * se muestra solo y se pasa al siguiente con "Siguiente" (o con "Sig." del teclado
 * al terminar sus casilleros): nunca se salta un bloque porque este vacio, asi lo que
 * estaba apagado y hoy esta en curso (o al reves) siempre se ve.
 */

export type PasoId = "fc" | "pa" | "neuro" | "glasgow" | "sas" | "sedacion" | "dva" | "modo" | "vent" | "spo2" | "kine" | "apk" | "tf";

export interface DefPaso {
  readonly id: PasoId;
  readonly corto: string;
  readonly titulo: string;
}

export const PASOS: readonly DefPaso[] = [
  { id: "fc", corto: "FC", titulo: "Frecuencia cardiaca" },
  { id: "pa", corto: "PA", titulo: "Presión arterial" },
  { id: "neuro", corto: "PIC", titulo: "Neuromonitoreo" },
  { id: "glasgow", corto: "Glasgow", titulo: "Glasgow y S5Q" },
  { id: "sas", corto: "SAS", titulo: "SAS / estado de vigilia" },
  { id: "sedacion", corto: "Sedación", titulo: "Sedoanalgesia y bloqueo neuromuscular" },
  { id: "dva", corto: "DVA", titulo: "DVA, inotrópicos y antiarrítmicos" },
  { id: "modo", corto: "Modo", titulo: "Ventilador y modo" },
  { id: "vent", corto: "Ventilación", titulo: "Terapia ventilatoria" },
  { id: "spo2", corto: "SpO₂", titulo: "Saturación" },
  { id: "kine", corto: "Kine", titulo: "Kinesiterapia respiratoria" },
  { id: "apk", corto: "APK", titulo: "Pauta APK" },
  { id: "tf", corto: "Terapia física", titulo: "Terapia física" }
];

const SEDANTES = ["fentanilo", "propofol", "midazolam", "dexmedetomidina", "lorazepam"];

/** A que bloque pertenece un campo que falta, para llevar a la persona hasta el. */
export function pasoDeCampo(campo: string): PasoId {
  if (campo === "fc") return "fc";
  if (campo === "pas" || campo === "pad") return "pa";
  if (campo === "glasgow") return "glasgow";
  if (campo === "sas" || campo === "vigilia") return "sas";
  if (campo.startsWith("infusion:")) return SEDANTES.includes(campo.slice("infusion:".length)) ? "sedacion" : "dva";
  if (campo === "frTotal") return "vent";
  if (campo === "spo2") return "spo2";
  if (campo === "kine") return "kine";
  if (campo === "apk") return "apk";
  if (campo === "terapiaFisica") return "tf";
  return "fc";
}
