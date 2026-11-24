/**
 * Evolucion para ALMA (el texto lo arma texto-evolucion.ts, en la prosa del RCE), el texto de
 * cada evento y los campos discretos de ALMA.
 *
 * Es la pieza con mas valor clinico por linea de codigo: resuelve el principal
 * cuello de botella operativo (la transcripcion manual). Por eso es una funcion
 * pura y va con tests.
 *
 * Respeta el candado de mecanica: si la asincronia en modalidad controlada
 * invalida el plateau, la nota NO reporta driving pressure ni compliance y dice
 * por que. Una sola fuente de verdad con la pantalla (src/core/validez.ts).
 */

import { ETIQUETA_DISPOSITIVO, ETIQUETA_MOTIVO_CAMBIO, ETIQUETA_MOTIVO_SIN_PVE, ETIQUETA_MODALIDAD, ETIQUETA_MOTIVO_CAMBIO_EQUIPO, NIVELES_KTM, ETIQUETA_EDUCACION } from "./catalogos";
import { resumenEvaluacion } from "./evaluaciones";
import { etiquetaMomentoPostExtub } from "./pve";
import { describirEquipos, equipoEnUso, etiquetaEquipo } from "./equipos";
import { calcularDerivados } from "./fisiologia";
import { sedoanalgesiaActiva } from "./infusiones";
import { esReintubacion } from "./eventos";
import { textoResumenTurno, textoUltimoControl } from "./texto-evolucion";
import { esModalidadControlada, mecanicaBloqueadaPorAsincronia } from "./validez";
import type {
  Control,
  EquipoEnSala,
  Episodio,
  EventoClinico,
  Modalidad,
  ValidacionApk
} from "./tipos";

export type ModoNota = "TURNO_COMPLETO" | "ULTIMA_ATENCION";

export interface EntradaNota {
  readonly episodio: Episodio;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
  readonly apk: readonly ValidacionApk[];
  readonly modo: ModoNota;
  readonly ahora: Date;
  /** Diagnostico escrito, descifrado en la estacion. Sin el, se usa la categoria REM. */
  readonly diagnostico?: string | null;
}

/**
 * El texto de un evento. Con `eventos` (los del episodio) la intubacion se distingue de la
 * reintubacion; sin ellos se dice «Intubación / reintubación».
 */
export function describirEvento(ev: EventoClinico, eventos?: readonly EventoClinico[]): string {
  switch (ev.tipo) {
    case "EVALUACION_PVE":
      return ev.apto ? "Checklist de PVE: cumple los 8 criterios" : "Checklist de PVE: no cumple los criterios, PVE no iniciada";
    case "CONTROL_PVE":
      return `Control de PVE ${ev.fase === "INICIAL" ? "inicial" : "a los 30 min"}`;
    case "REEVAL_POST_EXTUB":
      return `Reevaluación post extubación (${etiquetaMomentoPostExtub(ev.momento)})`;
    case "FALLA_POST_EXTUB":
      return ev.falla ? `Falla post extubación${ev.hipotesis ? `: ${ev.hipotesis}` : ""}` : "Sin falla post extubación";
    case "INICIO_PVE":
      return `Inicio de PVE (protocolo ${ev.duracionMin} min)`;
    case "FIN_PVE":
      return `Fin de PVE: ${ev.exitosa ? "tolerada" : "no tolerada"}`;
    case "EXTUBACION_PROGRAMADA":
      return ev.sinPve
        ? `Extubación fuera de protocolo (sin PVE: ${ETIQUETA_MOTIVO_SIN_PVE[ev.sinPve]}), queda en ${ETIQUETA_DISPOSITIVO[ev.dispositivo] ?? ev.dispositivo}`
        : `Extubación programada, queda en ${ETIQUETA_DISPOSITIVO[ev.dispositivo] ?? ev.dispositivo}`;
    case "AUTOEXTUBACION":
      if (ev.accidental) return ev.dispositivo === "REINTUBACION_INMEDIATA" ? "EXTUBACIÓN ACCIDENTAL con reintubación inmediata" : `EXTUBACIÓN ACCIDENTAL, queda en ${ETIQUETA_DISPOSITIVO[ev.dispositivo] ?? ev.dispositivo}`;
      return ev.dispositivo === "REINTUBACION_INMEDIATA" ? "AUTOEXTUBACIÓN con reintubación inmediata" : `AUTOEXTUBACIÓN, queda en ${ETIQUETA_DISPOSITIVO[ev.dispositivo] ?? ev.dispositivo}`;
    case "REINTUBACION": {
      const que = !eventos ? "Intubación / reintubación" : esReintubacion(ev, eventos) ? "Reintubación" : "Intubación";
      return `${que} ${ev.via} calibre ${ev.calibre}${ev.via === "TET" && ev.fijacionCm ? `, fijación ${ev.fijacionCm} cm` : ""}${ev.motivo ? ` · ${ev.motivo}` : ""}`;
    }
    case "CAMBIO_TUBO":
      return `Cambio de tubo: TET calibre ${ev.calibre}, fijación ${ev.fijacionCm} cm (${ETIQUETA_MOTIVO_CAMBIO[ev.motivo]})`;
    case "CAMBIO_CANULA":
      return `Cambio de cánula: TQT calibre ${ev.calibre} (${ETIQUETA_MOTIVO_CAMBIO[ev.motivo]})`;
    case "DECANULACION":
      return `${ev.accidental ? "DECANULACIÓN ACCIDENTAL" : "Decanulación"}, queda en ${ETIQUETA_DISPOSITIVO[ev.dispositivo] ?? ev.dispositivo}`;
    case "TRAQUEOSTOMIA":
      return `Traqueostomía calibre ${ev.calibre}`;
    case "AJUSTE_TUBO":
      return `Ajuste de fijación a ${ev.fijacionCm} cm (${ev.motivo === "DESPLAZAMIENTO_SUPERFICIAL" ? "desplazamiento superficial" : "control radiológico"})`;
    case "INICIO_PRONO":
      return "Inicio de ciclo de prono";
    case "SUPINACION":
      return "Supinación";
    case "INICIO_BNM":
      return `Inicio de bloqueo neuromuscular (${ev.farmaco})`;
    case "FIN_BNM":
      return "Suspensión de bloqueo neuromuscular";
    case "SUSPENSION_SEDACION":
      return "Suspensión de sedación";
    case "SUSPENSION_DVA":
      return "Suspensión de DVA";
    case "PCR":
      return `Paro cardiorrespiratorio, reanimación ${ev.duracionReanimacionMin} min${ev.rosc === true ? ", con ROSC" : ev.rosc === false ? ", sin ROSC" : ""}${ev.choques ? `, ${ev.choques} ${ev.choques === 1 ? "choque" : "choques"}` : ""}`;
    case "EVENTO_CENTINELA":
      return `Evento centinela: ${ev.descripcion}`;
    case "EVENTO_LIBRE":
      return ev.descripcion;
    case "ASISTENCIA_FBC":
      return "Asistencia en fibrobroncoscopía";
    case "ASISTENCIA_PROCEDIMIENTO":
      return `Asistencia en ${ev.procedimiento.toLowerCase()}`;
    case "TOMA_CULTIVO":
      return `Toma de cultivo (${ev.muestra})`;
    case "TRASLADO_IMAGEN":
      return `Traslado a ${ev.destino}`;
    case "CAMBIO_HMEF":
      return "Cambio de filtro HME";
    case "EVALUACION_PUNTUAL":
      return `Evaluación ${resumenEvaluacion(ev.escala, ev.valores, ev.total, ev.comentario)}`;
    case "CAMBIO_FILTRO":
      return ev.elemento === "TRACHCARE" ? "Cambio de TrachCare" : "Cambio de filtro HEPA";
    case "RONDA_EQUIPOS":
      return ev.hallazgos.length ? `Ronda de equipos: ${ev.hallazgos.map((h) => h.texto).join("; ")}` : "Ronda de equipos: todo en orden";
    case "CAMBIO_EQUIPOS":
      return `Cambio de equipos: ${describirEquipos(ev.equipos)}${ev.motivo ? ` (${ETIQUETA_MOTIVO_CAMBIO_EQUIPO[ev.motivo].toLowerCase()})` : ""}`;
    case "TRASLADO_CAMA":
      return `Traslado de cama: ${ev.desde} → ${ev.hasta}`;
    case "PVE_NO_REALIZADA":
      return `PVE no realizada: ${ev.razon}`;
    case "TERAPIA_FISICA":
      return ev.realizada
        ? `Terapia física (KTM)${ev.nivel ? ` nivel ${ev.nivel}: ${NIVELES_KTM.find((n) => n.nivel === ev.nivel)?.titulo.replace(/^Nivel \d · /, "").toLowerCase() ?? ""}` : ""}${ev.ems ? ", con EMS" : ""}${ev.ims !== null ? `, IMS ${ev.ims}` : ""}`
        : `Terapia física no realizada: ${ev.motivo ?? "sin motivo"}`;
    case "IMT":
      return "Entrenamiento muscular inspiratorio (IMT)";
    case "EDUCACION":
      return `Educación ${ETIQUETA_EDUCACION[ev.dirigidaA]}`;
    case "PVE_SIN_EXTUBAR":
      return `PVE superada sin extubar${ev.motivo ? `: ${ev.motivo}` : ""}`;
    case "DESVINCULACION":
    case "RECONEXION":
      return `${ev.tipo === "DESVINCULACION" ? "Desvinculación" : "Reconexión"}: de ${ETIQUETA_MODALIDAD[ev.desde]} a ${ETIQUETA_MODALIDAD[ev.hasta]}`;
    default: {
      const _exhaustivo: never = ev;
      return String(_exhaustivo);
    }
  }
}

/** Punto de entrada unico del generador. */
export function componerNotaAlma(entrada: EntradaNota): string {
  return entrada.modo === "ULTIMA_ATENCION" ? textoUltimoControl(entrada) : textoResumenTurno(entrada);
}

// ---------------------------------------------------------------------------
// Campos discretos de ALMA
// ---------------------------------------------------------------------------

export interface CampoAlma {
  readonly etiqueta: string;
  /** `null` = en blanco. */
  readonly valor: string | null;
}

type ClaseAlma = "ac" | "pc" | "ps";

/** La modalidad decide en que campo de ALMA va cada valor (idea de la propuesta de la unidad). */
export function claseModoAlma(m: Modalidad): ClaseAlma | null {
  switch (m) {
    case "ACVC":
      return "ac";
    case "PCV":
      return "pc";
    case "CPAP_PS":
      return "ps";
    default:
      // Desconexion, oxigenoterapia y VNI no van al formulario de ventilacion mecanica de ALMA.
      return null;
  }
}

const texto = (v: number | null): string | null => (v === null ? null : String(v));

/**
 * Valores en el orden del formulario de ventilacion mecanica de ALMA, para
 * tipearlos uno a uno (un registro por control). Es un esquema, no la pantalla real.
 */
export function camposAlma(
  control: Control,
  pbw: number,
  equipos: readonly EquipoEnSala[] = []
): readonly CampoAlma[] {
  const v = control.ventilacion;
  const d = calcularDerivados(control, pbw);
  const k = claseModoAlma(v.modalidad);
  const campos: CampoAlma[] = [
    { etiqueta: "SAS", valor: sedoanalgesiaActiva(control.infusiones) ? texto(control.sas) : "—" },
    { etiqueta: "Modelo Ventilador", valor: equipoEnUso(equipos) ? etiquetaEquipo(equipoEnUso(equipos)!) : null },
    { etiqueta: "Modo", valor: ETIQUETA_MODALIDAD[v.modalidad] }
  ];

  if (k === "ps") campos.push({ etiqueta: "FR total", valor: texto(v.frTotal) });
  else if (k) campos.push({ etiqueta: "FR programada", valor: texto(v.frProgramada) });

  if (k === "ac") campos.push({ etiqueta: "Vol. Corriente Programado", valor: texto(v.vtProgramado) });
  else if (k) campos.push({ etiqueta: "Espirado", valor: texto(v.vtEspirado) });

  campos.push(
    { etiqueta: "Vol. Minuto", valor: texto(d.volumenMinuto) },
    { etiqueta: "P. Pico", valor: texto(v.pPico) },
    { etiqueta: "Meseta (Pº Media)", valor: texto(v.pMedia) }
  );

  if (k === "ps") campos.push({ etiqueta: "Soporte", valor: texto(v.presion) });
  else if (k === "pc") campos.push({ etiqueta: "Control", valor: texto(v.presion) });

  const comentarios = [
    v.frTotal !== null && k !== "ps" ? `FR total ${v.frTotal}` : "",
    k === "ac" && v.vtEspirado !== null ? `Vt espirado ${v.vtEspirado}` : "",
    v.flujo !== null ? `Flujo ${v.flujo} L/min` : "",
    d.origenDriving === "PLATEAU" && v.pPlateau !== null ? `P. Plateau ${v.pPlateau}` : "",
    d.drivingPressure !== null ? `P. Distensión ${d.drivingPressure}${d.origenDriving === "PICO" ? " (con P. pico)" : ""}` : ""
  ].filter((x) => x !== "");

  campos.push(
    { etiqueta: "PEEP Programado", valor: texto(v.peep) },
    { etiqueta: "Tipo de Humidificación", valor: (() => { const h = equipos.find((e) => e.tipo === "HUMIDIFICADOR"); return h ? etiquetaEquipo(h) : null; })() },
    { etiqueta: "FiO2 Programado", valor: texto(v.fio2) },
    { etiqueta: "I:E", valor: d.relacionIE },
    {
      etiqueta: "Compliance Estática",
      valor: mecanicaBloqueadaPorAsincronia(v) ? "no valorable (asincronía)" : texto(d.compliance)
    },
    { etiqueta: "Auto PEEP", valor: esModalidadControlada(v.modalidad) ? texto(v.autoPeep) : "—" },
    { etiqueta: "SpO2", valor: texto(control.spo2) },
    { etiqueta: "Comentarios", valor: comentarios.length > 0 ? comentarios.join(" · ") : null }
  );
  return campos;
}
