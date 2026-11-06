/**
 * Borrador de control: estado del formulario, regla anti-sesgo y validacion.
 *
 * REGLA ANTI-SESGO (informe 3.A)
 * Lo que se lee de un monitor o del ventilador NACE EN BLANCO en cada control:
 * signos vitales, y lo que el paciente realmente hace (FR total, Vt espirado,
 * presiones). Lo que es un AJUSTE que el kinesiologo cambia deliberadamente
 * (modalidad, FR/Vt/flujo/TI/presion programados, PEEP, FiO2) y las infusiones
 * en curso se HEREDAN, para no tipear de nuevo.
 *
 * La escala de conciencia (SAS o vigilia) es una evaluacion, no un ajuste: nace
 * en blanco, como la kine y la terapia fisica.
 *
 * El borrador usa `string` porque "" (campo sin tocar) y 0 (valor medido igual
 * a cero) son clinicamente distintos y no deben colapsar.
 */

import { CAMPOS_POR_MODALIDAD, INFUSIONES } from "./catalogos";
import { esViaAereaArtificial } from "./fisiologia";
import { dosisDeEscalon, sedoanalgesiaActiva } from "./infusiones";
import { kineRespiratoriaPermitida } from "./apk";
import { CAMPOS_VENT } from "./tipos";
import type {
  AspectoSecreciones,
  CampoVent,
  CantidadSecreciones,
  Control,
  EquipoEnSala,
  Episodio,
  EstadoTerapiaFisica,
  EstadoVigilia,
  IdInfusion,
  Glasgow,
  Infusiones,
  Medicion,
  Modalidad,
  MonitoreoEpisodio,
  Neuromonitoreo,
  ReologiaSecreciones,
  Uuid,
  ValidacionApk,
  ValorSas,
  Ventilacion,
  ViaAerea
} from "./tipos";

export const CAMPOS_VITALES = ["fc", "spo2", "pas", "pad"] as const;
export type CampoVital = (typeof CAMPOS_VITALES)[number];

/** Ajustes del ventilador: se heredan del control anterior. */
export const CAMPOS_VENT_PROGRAMADOS: readonly CampoVent[] = [
  "frProgramada",
  "vtProgramado",
  "flujo",
  "ti",
  "presion",
  "peep",
  "fio2",
  "temperatura"
];

/** Lo que hace el paciente: nace en blanco, se lee del monitor. */
export const CAMPOS_VENT_OBSERVADOS: readonly CampoVent[] = [
  "frTotal",
  "vtEspirado",
  "pPico",
  "pPlateau",
  "pMedia",
  "autoPeep",
  "volMinuto"
];

export interface BorradorInfusion {
  activa: boolean;
  /** Escalon 1-6 como texto, o "" */
  escalon: string;
  dosis: string;
  /** Dosis libre en lugar de escalon. Siempre true si el farmaco no tiene escalones. */
  libre: boolean;
}

export interface BorradorControl {
  episodioId: Uuid;
  rutAutor: string;
  esControlApoyo: boolean;

  fc: string;
  spo2: string;
  pas: string;
  pad: string;

  modalidad: Modalidad;
  asincronico: boolean;
  /** Uso de musculatura accesoria (CNAF). Observacion del momento: nace en blanco. */
  musculaturaAccesoria: boolean | null;
  vent: Record<CampoVent, string>;

  infusiones: Record<IdInfusion, BorradorInfusion>;
  sas: ValorSas | null;
  vigilia: EstadoVigilia | null;
  /** Se registra aunque haya sedacion. Los tres componentes o ninguno. */
  glasgow: { ocular: Glasgow["ocular"] | null; verbal: Glasgow["verbal"] | null; motora: Glasgow["motora"] | null };
  /** S5Q 0 a 5, como texto. Nace en blanco. */
  s5q: string;

  /** Neuromonitoreo: solo lo que el episodio tiene activo. Nace en blanco. */
  neuro: { etco2: string; pic: string; dveAltura: string; dveAbierta: boolean | null };
  /** Equipos de la sala: se heredan del episodio; un cambio genera un evento. */
  equipos: readonly EquipoEnSala[];

  /** Auscultacion y secreciones: evaluaciones, nacen en blanco. */
  auscultacion: string;
  aspecto: AspectoSecreciones | null;
  reologia: ReologiaSecreciones | null;
  cantidad: CantidadSecreciones | null;

  terapiaFisica: EstadoTerapiaFisica | null;
  actividades: string[];
  ims: string;
  motivoContraindicacion: string | null;

  observaciones: string;
}

export function infusionVacia(id: IdInfusion): BorradorInfusion {
  const def = INFUSIONES.find((i) => i.id === id);
  return { activa: false, escalon: "", dosis: "", libre: def ? def.escalones === null : true };
}

function textoDe(v: Medicion | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

/** "" -> null. Un 0 escrito a proposito se conserva como 0. Acepta coma decimal. */
export function medicionDe(texto: string): Medicion {
  const t = texto.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Crea el borrador de un control nuevo. De `ultimo` se hereda SOLO el estado
 * continuo (ajustes del ventilador, infusiones); nunca una lectura de monitor
 * ni una evaluacion.
 */
export function crearBorradorNuevoControl(
  episodio: Episodio,
  ultimo: Control | null,
  rutAutor: string
): BorradorControl {
  const artificial = esViaAereaArtificial(episodio.viaAereaActual);
  const modalidad: Modalidad = ultimo?.ventilacion.modalidad ?? (artificial ? "CPAP_PS" : "CNAF");

  const vent = Object.fromEntries(CAMPOS_VENT.map((c) => [c, ""])) as Record<CampoVent, string>;
  if (ultimo) {
    for (const c of CAMPOS_VENT_PROGRAMADOS) vent[c] = textoDe(ultimo.ventilacion[c]);
  }

  const infusiones = Object.fromEntries(
    INFUSIONES.map((def) => {
      const previa = ultimo?.infusiones[def.id];
      const b: BorradorInfusion =
        previa && previa.dosis > 0
          ? {
              activa: true,
              escalon: previa.escalon === null ? "" : String(previa.escalon),
              dosis: String(previa.dosis),
              libre: previa.escalon === null
            }
          : infusionVacia(def.id);
      return [def.id, b];
    })
  ) as Record<IdInfusion, BorradorInfusion>;

  return {
    episodioId: episodio.id,
    rutAutor,
    esControlApoyo: episodio.rutTitular !== rutAutor,

    fc: "",
    spo2: "",
    pas: "",
    pad: "",

    modalidad,
    // La asincronia es una observacion del momento: no se hereda.
    asincronico: false,
    musculaturaAccesoria: null,
    vent,

    infusiones,
    sas: null,
    vigilia: null,
    glasgow: { ocular: null, verbal: null, motora: null },
    s5q: "",
    neuro: { etco2: "", pic: "", dveAltura: "", dveAbierta: null },
    equipos: episodio.equipos,

    auscultacion: "",
    aspecto: null,
    reologia: null,
    cantidad: null,

    terapiaFisica: null,
    actividades: [],
    ims: "",
    motivoContraindicacion: null,

    observaciones: ""
  };
}

// ---------------------------------------------------------------------------
// Transformaciones puras del borrador
// ---------------------------------------------------------------------------

export function cambiarModalidad(b: BorradorControl, modalidad: Modalidad): BorradorControl {
  return { ...b, modalidad, asincronico: modalidad === "CNAF" ? false : b.asincronico };
}

export function iniciarInfusion(b: BorradorControl, id: IdInfusion): BorradorControl {
  return { ...b, infusiones: { ...b.infusiones, [id]: { ...b.infusiones[id], activa: true } } };
}

export function suspenderInfusion(b: BorradorControl, id: IdInfusion): BorradorControl {
  const libre = infusionVacia(id).libre;
  return { ...b, infusiones: { ...b.infusiones, [id]: { activa: false, escalon: "", dosis: "", libre } } };
}

export function alternarDosisLibre(b: BorradorControl, id: IdInfusion): BorradorControl {
  const x = b.infusiones[id];
  // Sin escalones definidos, la dosis libre es la unica opcion.
  if (infusionVacia(id).libre) return b;
  return { ...b, infusiones: { ...b.infusiones, [id]: { ...x, libre: !x.libre, escalon: "", dosis: "" } } };
}

/** Dosis efectiva de una infusion del borrador: del escalon o libre. `null` si falta. */
export function dosisEfectiva(id: IdInfusion, x: BorradorInfusion): number | null {
  if (x.libre) return medicionDe(x.dosis);
  const esc = medicionDe(x.escalon);
  return esc === null ? null : dosisDeEscalon(id, esc);
}

// ---------------------------------------------------------------------------
// Validacion
// ---------------------------------------------------------------------------

export interface ProblemaBorrador {
  /** Identificador del campo o bloque con el problema. */
  readonly campo: string;
  readonly mensaje: string;
}

export interface ContextoValidacion {
  /** APK vigente del turno para este episodio, o null si no hay. */
  readonly apkVigente: ValidacionApk | null;
}

const ETIQUETA_VITAL: Readonly<Record<CampoVital, string>> = {
  fc: "FC",
  spo2: "SpO₂",
  pas: "PAS",
  pad: "PAD"
};

/** Lista lo que falta para poder guardar. Vacia = se puede guardar. */
export function validarBorrador(b: BorradorControl, ctx: ContextoValidacion): readonly ProblemaBorrador[] {
  const problemas: ProblemaBorrador[] = [];
  const falta = (campo: string, mensaje: string): void => {
    problemas.push({ campo, mensaje });
  };

  for (const c of CAMPOS_VITALES) {
    if (medicionDe(b[c]) === null) falta(c, ETIQUETA_VITAL[c]);
  }
  if (medicionDe(b.vent.frTotal) === null) falta("frTotal", "FR total");

  const sedada = sedoanalgesiaActivaEnBorrador(b);
  if (sedada && b.sas === null) falta("sas", "SAS");
  if (!sedada && b.vigilia === null) falta("vigilia", "estado de vigilia");

  for (const def of INFUSIONES) {
    const x = b.infusiones[def.id];
    if (x.activa && dosisEfectiva(def.id, x) === null) {
      falta(`infusion:${def.id}`, `${def.nombre}: ${x.libre ? "dosis" : "escalón"}`);
    }
  }

  const g = b.glasgow;
  const nGlasgow = [g.ocular, g.verbal, g.motora].filter((x) => x !== null).length;
  if (nGlasgow > 0 && nGlasgow < 3) falta("glasgow", "Glasgow completo (O, V y M)");


  // Cada control es una atencion: exige la APK firmada por quien guarda, valida para todo su turno.
  if (!kineRespiratoriaPermitida(ctx.apkVigente)) {
    falta("apk", "la APK no cumple: la kinesiterapia respiratoria queda diferida");
  } else if (ctx.apkVigente === null) {
    falta("apk", "firmar la APK");
  }

  return problemas;
}

/** Sedoanalgesia activa segun lo que hay en el borrador (para decidir SAS vs vigilia). */
export function sedoanalgesiaActivaEnBorrador(b: BorradorControl): boolean {
  const sedantes: Infusiones = Object.fromEntries(
    INFUSIONES.filter((d) => d.grupo === "SEDANTE" && b.infusiones[d.id].activa).map((d) => [d.id, { dosis: 1, escalon: null }])
  );
  return sedoanalgesiaActiva(sedantes);
}

// ---------------------------------------------------------------------------
// Materializacion
// ---------------------------------------------------------------------------

export interface DatosMaterializacion {
  readonly id: Uuid;
  readonly numero: number;
  readonly ahora: Date;
  /** Via aerea vigente del episodio. El control la observa; no es editable en rutina. */
  readonly viaAerea: ViaAerea;
  /** Monitoreo activo del episodio: define que campos de neuromonitoreo se guardan. */
  readonly monitoreo: MonitoreoEpisodio;
  readonly corrige?: Uuid | null;
}

/** Convierte el borrador en un Control inmutable. Asume que `validarBorrador` no reporta problemas. */
export function materializarControl(b: BorradorControl, datos: DatosMaterializacion): Control {
  const aplica = new Set(CAMPOS_POR_MODALIDAD[b.modalidad].map((d) => d.campo));
  const campo = (c: CampoVent): Medicion => (aplica.has(c) ? medicionDe(b.vent[c]) : null);

  const ventilacion: Ventilacion = {
    modalidad: b.modalidad,
    asincronico: b.modalidad === "CNAF" ? false : b.asincronico,
    frProgramada: campo("frProgramada"),
    vtProgramado: campo("vtProgramado"),
    flujo: campo("flujo"),
    ti: campo("ti"),
    presion: campo("presion"),
    peep: campo("peep"),
    fio2: campo("fio2"),
    frTotal: campo("frTotal"),
    vtEspirado: campo("vtEspirado"),
    pPico: campo("pPico"),
    pPlateau: campo("pPlateau"),
    pMedia: campo("pMedia"),
    autoPeep: campo("autoPeep"),
    temperatura: campo("temperatura"),
    musculaturaAccesoria: b.modalidad === "CNAF" ? b.musculaturaAccesoria : null,
    volMinuto: campo("volMinuto")
  };

  const m = datos.monitoreo;
  const neuro: Neuromonitoreo | null =
    m.capnografia || m.pic || m.dve
      ? {
          etco2: m.capnografia ? medicionDe(b.neuro.etco2) : null,
          pic: m.pic ? medicionDe(b.neuro.pic) : null,
          dveAlturaCmH2O: m.dve ? medicionDe(b.neuro.dveAltura) : null,
          dveAbierta: m.dve ? b.neuro.dveAbierta : null
        }
      : null;
  const glasgow: Glasgow | null =
    b.glasgow.ocular !== null && b.glasgow.verbal !== null && b.glasgow.motora !== null
      ? { ocular: b.glasgow.ocular, verbal: b.glasgow.verbal, motora: b.glasgow.motora }
      : null;

  const infusiones: Record<string, { dosis: number; escalon: number | null }> = {};
  for (const def of INFUSIONES) {
    const x = b.infusiones[def.id];
    if (!x.activa) continue;
    const dosis = dosisEfectiva(def.id, x);
    if (dosis === null) continue;
    infusiones[def.id] = { dosis, escalon: x.libre ? null : medicionDe(x.escalon) };
  }

  const sedada = sedoanalgesiaActivaEnBorrador(b);
  const tf = b.terapiaFisica ?? "NO";

  const hora = `${String(datos.ahora.getHours()).padStart(2, "0")}:${String(datos.ahora.getMinutes()).padStart(2, "0")}`;

  return {
    id: datos.id,
    episodioId: b.episodioId,
    numero: datos.numero,
    hora,
    registradoEn: datos.ahora.toISOString(),
    rutAutor: b.rutAutor,
    esControlApoyo: b.esControlApoyo,
    corrige: datos.corrige ?? null,

    fc: medicionDe(b.fc),
    pas: medicionDe(b.pas),
    pad: medicionDe(b.pad),
    spo2: medicionDe(b.spo2),

    viaAerea: datos.viaAerea,
    ventilacion,
    esfuerzo: null,
    neuro,

    infusiones,
    sas: sedada ? b.sas : null,
    vigilia: sedada ? null : b.vigilia,
    glasgow,
    s5q: medicionDe(b.s5q),

    kineResp: {
      auscultacion: b.auscultacion.trim(),
      aspecto: b.aspecto,
      reologia: b.reologia,
      cantidad: b.cantidad
    },
    terapiaFisica: {
      estado: tf,
      actividades: tf === "REALIZADA" ? [...b.actividades] : [],
      ims: tf === "REALIZADA" ? medicionDe(b.ims) : null,
      motivoContraindicacion: tf === "CONTRAINDICADA" ? b.motivoContraindicacion : null
    },
    observaciones: b.observaciones.trim()
  };
}

/**
 * Un borrador guardado por una version anterior de la app puede no traer los campos
 * nuevos (y traer otros que ya no existen). Se completa con la base recien creada para
 * esa cama: nunca debe romper la pantalla.
 */
export function completarBorrador(guardado: Partial<BorradorControl> | undefined | null, base: BorradorControl): BorradorControl {
  if (!guardado) return base;
  const g = guardado as Partial<BorradorControl> & Record<string, unknown>;
  const infusiones = { ...base.infusiones };
  for (const id of Object.keys(base.infusiones) as (keyof typeof infusiones)[]) {
    const x = g.infusiones?.[id];
    if (x && typeof x === "object") infusiones[id] = { ...base.infusiones[id], ...x };
  }
  const limpio: BorradorControl = {
    ...base,
    ...(g as Partial<BorradorControl>),
    vent: { ...base.vent, ...(g.vent ?? {}) },
    infusiones,
    glasgow: { ...base.glasgow, ...(g.glasgow ?? {}) },
    neuro: { ...base.neuro, ...(g.neuro ?? {}) },
    auscultacion: typeof g.auscultacion === "string" ? g.auscultacion : Array.isArray(g.auscultacion) ? (g.auscultacion as string[]).join(", ") : base.auscultacion,
    actividades: Array.isArray(g.actividades) ? g.actividades : base.actividades
  };
  // Campos que ya no existen en el modelo.
  const sobrante = limpio as unknown as Record<string, unknown>;
  delete sobrante["kineRealizada"];
  delete sobrante["aspiracion"];
  return limpio;
}
