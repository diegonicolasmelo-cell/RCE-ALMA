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

import { CAMPOS_POR_MODALIDAD, ETIQUETA_MODALIDAD, INFUSIONES, conSoporte, hayAspectoDeSecreciones, modalidadPermitida, transicionSoporte } from "./catalogos";
import { momentoDeEvaluacion } from "./evaluaciones";
import { esViaAereaArtificial } from "./fisiologia";
import { dosisDeEscalon, sedoanalgesiaActiva } from "./infusiones";
import { kineRespiratoriaPermitida } from "./apk";
import { CAMPOS_VENT } from "./tipos";
import type {
  AspectoSecreciones,
  Deglucion,
  EficienciaTos,
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

/** Ajustes del ventilador. */
export const CAMPOS_VENT_PROGRAMADOS: readonly CampoVent[] = [
  "frProgramada",
  "vtProgramado",
  "flujo",
  "ti",
  "presion",
  "peep",
  "fio2",
  "temperatura",
  "presionMax"
];

/** Lo que hace el paciente: nace en blanco, se lee del monitor. */
export const CAMPOS_VENT_OBSERVADOS: readonly CampoVent[] = [
  "frTotal",
  "vtEspirado",
  "pPico",
  "pPlateau",
  "pMedia",
  "autoPeep",
  "volMinuto",
  "fuga"
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
  /**
   * Hora REAL (HH:mm) de la desvinculacion o reconexion que deduce el cambio de modo
   * respecto del control anterior. Puede ser antes del control; "" = la de ahora.
   */
  horaEvento: string;
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
  /** Manejo de secreciones: evaluacion, nace en blanco. */
  tos: EficienciaTos | null;
  flujoPicoTos: string;
  deglucion: Deglucion | null;

  terapiaFisica: EstadoTerapiaFisica | null;
  actividades: string[];
  ims: string;
  motivoContraindicacion: string | null;

  observaciones: string;
}

export function infusionVacia(id: IdInfusion): BorradorInfusion {
  const def = INFUSIONES.find((i) => i.id === id);
  // Siempre por dosis: el escalon no se guarda, lo interpreta la sabana desde la dosis.
  void def;
  return { activa: false, escalon: "", dosis: "", libre: true };
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
  // El modo se hereda solo si corresponde a la via aerea de hoy (p. ej. tras extubar, un
  // CPAP+PS ya no se ofrece): si no, parte en uno de los de esa via y se elige.
  const heredada = ultimo?.ventilacion.modalidad ?? null;
  const modalidad: Modalidad =
    heredada && modalidadPermitida(heredada, episodio.viaAereaActual) ? heredada : artificial ? "CPAP_PS" : "CNAF";

  const vent = Object.fromEntries(CAMPOS_VENT.map((c) => [c, ""])) as Record<CampoVent, string>;
  // Solo el modo y la FiO2 se heredan. El resto de los ajustes nace en blanco: se repite con
  // "Usar lo anterior" (sugerirAnterior) o se escribe, pero nunca queda pre-rellenado.
  if (ultimo) vent.fio2 = textoDe(ultimo.ventilacion.fio2);

  const infusiones = Object.fromEntries(
    INFUSIONES.map((def) => {
      const previa = ultimo?.infusiones[def.id];
      const b: BorradorInfusion =
        previa && previa.dosis > 0
          ? { activa: true, escalon: "", dosis: String(previa.dosis), libre: true }
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
    horaEvento: "",
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
    tos: null,
    flujoPicoTos: "",
    deglucion: null,

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
  return { ...b, modalidad, asincronico: conSoporte(modalidad) ? b.asincronico : false };
}

/** Iniciar: un sedante con escalones parte en la dosis del escalon 1 (se titula con ▲ / ▼). */
export function iniciarInfusion(b: BorradorControl, id: IdInfusion): BorradorControl {
  const d1 = dosisDeEscalon(id, 1);
  const x = b.infusiones[id];
  return { ...b, infusiones: { ...b.infusiones, [id]: { ...x, activa: true, libre: true, escalon: "", dosis: x.dosis || (d1 === null ? "" : String(d1)) } } };
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
  /** Via aerea vigente: decide que modos se pueden guardar. */
  readonly viaAerea?: ViaAerea;
  /** Modo del control anterior: si cambia el soporte, la hora del evento debe ser valida. */
  readonly modalidadAnterior?: Modalidad | null;
  readonly ahora?: Date;
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
  if (ctx.viaAerea && !modalidadPermitida(b.modalidad, ctx.viaAerea)) {
    falta("modalidad", `un modo que corresponda a la vía aérea (${ETIQUETA_MODALIDAD[b.modalidad]} no se usa con ${ctx.viaAerea === "NATURAL" ? "vía aérea natural" : ctx.viaAerea})`);
  }
  if (ctx.viaAerea) {
    const tr = transicionSoporte(ctx.modalidadAnterior ?? null, b.modalidad, ctx.viaAerea);
    if (tr && b.horaEvento.trim() !== "" && !momentoDeEvaluacion(b.horaEvento, ctx.ahora ?? new Date())) {
      falta("horaEvento", `la hora real de la ${tr.tipo === "DESVINCULACION" ? "desvinculación" : "reconexión"} (de las últimas 12 horas)`);
    }
  }

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
    asincronico: conSoporte(b.modalidad) ? b.asincronico : false,
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
    fuga: campo("fuga"),
    presionMax: campo("presionMax"),
    musculaturaAccesoria: b.modalidad === "CNAF" || b.modalidad === "CNAF_TQT" ? b.musculaturaAccesoria : null,
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
      // Reologia y cantidad solo tienen sentido si hay secreciones.
      reologia: hayAspectoDeSecreciones(b.aspecto) ? b.reologia : null,
      cantidad: hayAspectoDeSecreciones(b.aspecto) ? b.cantidad : null,
      tos: b.tos,
      flujoPicoTos: medicionDe(b.flujoPicoTos),
      deglucion: b.deglucion
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

/** Ajustes programados (menos FiO2, que ya se hereda) en que el control anterior puede sugerir algo. */
const CAMPOS_SUGERIBLES: readonly CampoVent[] = CAMPOS_VENT_PROGRAMADOS.filter((c) => c !== "fio2");

/**
 * Campos programados vacios que el control anterior puede rellenar. Solo vale si la
 * modalidad es la misma: los ajustes de otro modo no se pueden "repetir".
 */
export function camposSugeribles(b: BorradorControl, ultimo: Control | null): CampoVent[] {
  if (!ultimo || ultimo.ventilacion.modalidad !== b.modalidad) return [];
  const aplica = new Set(CAMPOS_POR_MODALIDAD[b.modalidad].map((d) => d.campo));
  return CAMPOS_SUGERIBLES.filter((c) => aplica.has(c) && b.vent[c].trim() === "" && ultimo.ventilacion[c] !== null);
}

/** "Usar lo anterior": rellena SOLO los casilleros programados que siguen vacios. */
export function sugerirAnterior(b: BorradorControl, ultimo: Control | null): BorradorControl {
  const campos = camposSugeribles(b, ultimo);
  if (!ultimo || campos.length === 0) return b;
  const vent = { ...b.vent };
  for (const c of campos) vent[c] = textoDe(ultimo.ventilacion[c]);
  return { ...b, vent };
}
