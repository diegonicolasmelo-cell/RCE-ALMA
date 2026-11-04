/**
 * Borrador de control: estado del formulario y regla anti-sesgo.
 *
 * REGLA 3.A DEL INFORME, Y UN CONFLICTO QUE SE RESUELVE AQUI
 * El informe exige que al abrir "+ Nueva Atencion" las variables dinamicas
 * (FC, PAS, PAD, FR, Vt, P.Pico, P.Plateau, SpO2) nazcan vacias, para forzar la
 * lectura fresca del monitor y del ventilador.
 *
 * El prototipo original hacia lo contrario: las heredaba del ultimo control
 * (`fc: ult.fc`, `pas: ult.pas`, ...), que es precisamente el sesgo de arrastre
 * que se queria eliminar. Se implementa la regla del informe: en blanco.
 *
 * El criterio de que hereda y que no tiene logica clinica: lo que cambia minuto
 * a minuto y se lee de una pantalla se pide fresco; lo que es un ESTADO que el
 * kinesiologo cambia deliberadamente (infusiones continuas, modo ventilatorio)
 * se hereda y se suspende con un toque.
 *
 * El borrador usa `string` y no `number | null` porque "" (campo vacio sin tocar)
 * y 0 (valor medido igual a cero) son clinicamente distintos y no deben colapsar.
 */

import { esViaAereaArtificial } from "./fisiologia";
import type {
  CantidadSecreciones,
  Control,
  Episodio,
  EstadoVigilia,
  Medicion,
  ModoVMI,
  Sedacion,
  TipoAspiracion,
  TipoSecreciones,
  TipoVentilacion,
  Uuid,
  ValorSas,
  ViaAerea
} from "./tipos";

/**
 * Campos que SIEMPRE nacen vacios en un control nuevo.
 * Lista explicita y exportada para que un test la verifique: si alguien agrega
 * herencia sobre uno de estos campos, el test falla antes del deploy.
 */
export const CAMPOS_DINAMICOS_EN_BLANCO = [
  "fc",
  "pas",
  "pad",
  "fr",
  "vt",
  "pPico",
  "pPlateau",
  "spo2"
] as const;

export type CampoDinamico = (typeof CAMPOS_DINAMICOS_EN_BLANCO)[number];

export interface BorradorControl {
  readonly episodioId: Uuid;
  readonly rutAutor: string;
  readonly esControlApoyo: boolean;
  /** Observada, no editable en rutina: proviene del episodio. */
  readonly viaAerea: ViaAerea;

  // --- dinamicas: nacen "" ---
  fc: string;
  pas: string;
  pad: string;
  fr: string;
  vt: string;
  pPico: string;
  pPlateau: string;
  spo2: string;

  // --- estado heredable ---
  pic: string;
  tienePic: boolean;
  noradrenalina: string;
  adrenalina: string;
  vasopresina: string;
  tipoVentilacion: TipoVentilacion;
  modoVMI: ModoVMI | null;
  fio2: string;
  peep: string;
  presionSoporte: string;
  flujo: string;
  presionCuff: string;
  asincronico: boolean;
  sedacionActiva: boolean;
  sedacion: Sedacion;
  bnmActivo: boolean;

  // --- conciencia ---
  gcsOcular: 1 | 2 | 3 | 4;
  gcsVerbal: 1 | 2 | 3 | 4 | 5;
  gcsMotora: 1 | 2 | 3 | 4 | 5 | 6;
  sas: ValorSas | null;
  vigilia: EstadoVigilia | null;

  // --- esfuerzo / destete (panel condicional) ---
  p01: string;
  nif: string;
  pOcc: string;
  pMus: string;
  pmi: string;
  pim: string;
  pcf: string;

  // --- intervencion kinesica: SIEMPRE limpia ---
  secrecionesCantidad: CantidadSecreciones | null;
  secrecionesTipo: TipoSecreciones | null;
  respiratoriaRealizada: boolean;
  aspiracion: TipoAspiracion;
  motoraContraindicada: boolean;
  motivoContraindicacion: string | null;
  actividadesMotoras: string[];
  ims: number | null;
  observaciones: string;
}

/**
 * Crea el borrador de un control nuevo.
 *
 * `ultimo` es el control previo del episodio, si existe. De el se hereda SOLO
 * el estado continuo; nunca una variable dinamica ni una intervencion kinesica.
 */
export function crearBorradorNuevoControl(
  episodio: Episodio,
  ultimo: Control | null,
  rutAutor: string
): BorradorControl {
  const esMio = episodio.rutTitular === rutAutor;
  const via = episodio.viaAereaActual;
  const artificial = esViaAereaArtificial(via);

  return {
    episodioId: episodio.id,
    rutAutor,
    esControlApoyo: !esMio,
    viaAerea: via,

    // Regla 3.A: en blanco, sin excepcion.
    fc: "",
    pas: "",
    pad: "",
    fr: "",
    vt: "",
    pPico: "",
    pPlateau: "",
    spo2: "",

    // Estado continuo heredado (ahorro de tipeo sin riesgo de sesgo).
    pic: textoDe(ultimo?.pic ?? null),
    tienePic: ultimo?.pic !== null && ultimo?.pic !== undefined,
    noradrenalina: textoDe(ultimo?.dva.noradrenalina ?? null),
    adrenalina: textoDe(ultimo?.dva.adrenalina ?? null),
    vasopresina: textoDe(ultimo?.dva.vasopresina ?? null),
    tipoVentilacion: ultimo?.soporte.tipo ?? (artificial ? "VMI" : "AIRE_AMBIENTAL"),
    modoVMI: ultimo?.soporte.modoVMI ?? (artificial ? "PSV" : null),
    fio2: textoDe(ultimo?.soporte.fio2 ?? null),
    peep: textoDe(ultimo?.soporte.peep ?? null),
    presionSoporte: textoDe(ultimo?.soporte.presionSoporte ?? null),
    flujo: textoDe(ultimo?.soporte.flujo ?? null),
    presionCuff: textoDe(ultimo?.soporte.presionCuff ?? null),
    // La asincronia es una observacion del momento: no se hereda.
    asincronico: false,
    sedacionActiva: ultimo?.sedacionActiva ?? false,
    sedacion: { ...(ultimo?.sedacion ?? {}) },
    bnmActivo: ultimo?.bnmActivo ?? false,

    gcsOcular: ultimo?.glasgow.ocular ?? 4,
    gcsVerbal: artificial ? 1 : (ultimo?.glasgow.verbal ?? 5),
    gcsMotora: ultimo?.glasgow.motora ?? 6,
    sas: ultimo?.sedacionActiva ? (ultimo.sas ?? null) : null,
    vigilia: ultimo?.sedacionActiva === false ? (ultimo.vigilia ?? null) : null,

    // Mediciones de esfuerzo: siempre frescas.
    p01: "",
    nif: "",
    pOcc: "",
    pMus: "",
    pmi: "",
    pim: "",
    pcf: "",

    // Intervencion kinesica y eventos: 100% limpios, sin herencia.
    secrecionesCantidad: null,
    secrecionesTipo: null,
    respiratoriaRealizada: false,
    aspiracion: "NO_REQUIERE",
    motoraContraindicada: false,
    motivoContraindicacion: null,
    actividadesMotoras: [],
    ims: null,
    observaciones: ""
  };
}

function textoDe(v: Medicion): string {
  return v === null ? "" : String(v);
}

/** "" -> null. Un 0 escrito a proposito se conserva como 0. */
export function medicionDe(texto: string): Medicion {
  const t = texto.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface DatosMaterializacion {
  readonly id: Uuid;
  readonly numero: number;
  readonly ahora: Date;
  readonly corrige?: Uuid | null;
}

/** Convierte el borrador en un Control inmutable listo para persistir. */
export function materializarControl(
  b: BorradorControl,
  datos: DatosMaterializacion
): Control {
  const esVMI = b.tipoVentilacion === "VMI";
  const hayEsfuerzo = [b.p01, b.nif, b.pOcc, b.pMus, b.pmi, b.pim, b.pcf].some(
    (v) => v.trim() !== ""
  );

  return {
    id: datos.id,
    episodioId: b.episodioId,
    numero: datos.numero,
    hora: `${String(datos.ahora.getHours()).padStart(2, "0")}:${String(
      datos.ahora.getMinutes()
    ).padStart(2, "0")}`,
    registradoEn: datos.ahora.toISOString(),
    rutAutor: b.rutAutor,
    esControlApoyo: b.esControlApoyo,
    corrige: datos.corrige ?? null,

    fc: medicionDe(b.fc),
    pas: medicionDe(b.pas),
    pad: medicionDe(b.pad),
    spo2: medicionDe(b.spo2),
    pic: b.tienePic ? medicionDe(b.pic) : null,

    dva: {
      noradrenalina: medicionDe(b.noradrenalina),
      adrenalina: medicionDe(b.adrenalina),
      vasopresina: medicionDe(b.vasopresina)
    },

    viaAerea: b.viaAerea,
    soporte: {
      tipo: b.tipoVentilacion,
      modoVMI: esVMI ? b.modoVMI : null,
      fio2: medicionDe(b.fio2),
      peep: medicionDe(b.peep),
      vt: medicionDe(b.vt),
      fr: medicionDe(b.fr),
      presionSoporte: medicionDe(b.presionSoporte),
      pPico: medicionDe(b.pPico),
      pPlateau: medicionDe(b.pPlateau),
      flujo: medicionDe(b.flujo),
      presionCuff: medicionDe(b.presionCuff),
      asincronico: b.asincronico
    },
    esfuerzo: hayEsfuerzo
      ? {
          p01: medicionDe(b.p01),
          nif: medicionDe(b.nif),
          pOcc: medicionDe(b.pOcc),
          pMus: medicionDe(b.pMus),
          pmi: medicionDe(b.pmi),
          pim: medicionDe(b.pim),
          pcf: medicionDe(b.pcf)
        }
      : null,

    glasgow: { ocular: b.gcsOcular, verbal: b.gcsVerbal, motora: b.gcsMotora },
    sedacionActiva: b.sedacionActiva,
    // Conciencia condicional (regla 3.E): SAS solo con sedacion, vigilia solo sin ella.
    sas: b.sedacionActiva ? b.sas : null,
    vigilia: b.sedacionActiva ? null : b.vigilia,
    sedacion: b.sedacionActiva ? b.sedacion : {},
    bnmActivo: b.bnmActivo,

    secrecionesCantidad: b.secrecionesCantidad,
    secrecionesTipo: b.secrecionesTipo,

    intervencion: {
      respiratoriaRealizada: b.respiratoriaRealizada,
      aspiracion: b.aspiracion,
      motoraContraindicada: b.motoraContraindicada,
      motivoContraindicacion: b.motoraContraindicada ? b.motivoContraindicacion : null,
      actividadesMotoras: b.motoraContraindicada ? [] : [...b.actividadesMotoras],
      ims: b.motoraContraindicada ? null : b.ims
    },
    observaciones: b.observaciones.trim()
  };
}
