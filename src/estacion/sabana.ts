/**
 * Sabana del turno: una fila por parametro y una columna por control.
 * Funcion pura sobre el dominio, separada de la pantalla para poder probarla.
 */

import {
  OPCIONES_DEGLUCION,
  etiquetaAspecto,
  ETIQUETA_MODALIDAD,
  calcularDerivados,
  calcularGlasgow,
  describirCardiovasculares,
  describirInfusiones,
  esModalidadControlada,
  esReintubacion,
  mecanicaBloqueadaPorAsincronia,
  sedoanalgesiaActiva
} from "@core/index";
import type { Control, EventoClinico, MonitoreoEpisodio } from "@core/index";
import { iniciales } from "./util";

export interface Celda {
  readonly texto: string;
  /** Dato invalidado (candado de mecanica): se muestra bloqueado, nunca un numero falso. */
  readonly bloqueado?: boolean;
}

export type GrupoSabana = "Monitorización" | "Terapia ventilatoria" | "Kinesiología" | "Firma";

export interface FilaSabana {
  readonly grupo: GrupoSabana;
  readonly etiqueta: string;
  readonly celda: (c: Control) => Celda;
}

const n = (v: number | string | null | undefined, vacio = "--"): string => (v === null || v === undefined ? vacio : String(v));
const t = (texto: string): Celda => ({ texto });

export function filasSabana(pbw: number, monitoreo: MonitoreoEpisodio): readonly FilaSabana[] {
  const d = (c: Control) => calcularDerivados(c, pbw);
  const bloq = (c: Control): boolean => mecanicaBloqueadaPorAsincronia(c.ventilacion);
  const mec = (c: Control, valor: string): Celda => (bloq(c) ? { texto: "bloq.", bloqueado: true } : t(valor));

  const glasgowDe = (c: Control): Celda => {
    if (!c.glasgow) return t("--");
    const g = calcularGlasgow(c.glasgow, c.viaAerea);
    return t(`${g.display}${d(c).glasgowBajoSedacion ? "*" : ""}`);
  };
  const dve = (c: Control): Celda => {
    const x = c.neuro;
    if (!x || x.dveAlturaCmH2O === null) return t("--");
    return t(`${x.dveAlturaCmH2O} cmH₂O ${x.dveAbierta === null ? "" : x.dveAbierta ? "abierta" : "cerrada"}`.trim());
  };

  // Mismo orden que la hoja de registro kinesico: Monitorizacion, Terapia ventilatoria,
  // Kinesiologia y la firma. Cada fila sabe a que bloque pertenece.
  const M = "Monitorización" as const;
  const V = "Terapia ventilatoria" as const;
  const K = "Kinesiología" as const;
  const filas: FilaSabana[] = [
    { grupo: M, etiqueta: "Frec. cardiaca", celda: (c) => t(n(c.fc)) },
    { grupo: M, etiqueta: "P. arterial (PAM)", celda: (c) => t(`${n(c.pas)}/${n(c.pad)} (${n(d(c).pam)})`) }
  ];
  if (monitoreo.pic) filas.push({ grupo: M, etiqueta: "PIC / PPC", celda: (c) => t(`${n(c.neuro?.pic)} / ${n(d(c).ppc)}`) });
  filas.push(
    { grupo: M, etiqueta: "SpO₂", celda: (c) => t(n(c.spo2)) },
    { grupo: M, etiqueta: "Glasgow", celda: glasgowDe },
    { grupo: M, etiqueta: "SAS / vigilia", celda: (c) => t(sedoanalgesiaActiva(c.infusiones) ? `SAS ${n(c.sas)}` : c.vigilia ? c.vigilia.toLowerCase().replace("_", " ") : "--") },
    { grupo: M, etiqueta: "Sedación", celda: (c) => t(describirInfusiones(c.infusiones, "SEDANTE") || "—") },
    { grupo: M, etiqueta: "DVA / inotrópicos", celda: (c) => t(describirCardiovasculares(c.infusiones).replace("sin requerimiento de DVA ni inotrópicos", "—")) },
    { grupo: M, etiqueta: "Bloqueo neuromuscular", celda: (c) => t(describirInfusiones(c.infusiones, "BNM") || "—") }
  );
  if (monitoreo.capnografia) filas.push({ grupo: M, etiqueta: "EtCO₂", celda: (c) => t(n(c.neuro?.etco2)) });
  if (monitoreo.dve) filas.push({ grupo: M, etiqueta: "DVE", celda: dve });

  filas.push(
    { grupo: V, etiqueta: "Modo", celda: (c) => t(`${ETIQUETA_MODALIDAD[c.ventilacion.modalidad]}${c.ventilacion.asincronico ? " (asinc.)" : ""}`) },
    { grupo: V, etiqueta: "Vol. tidal prog.", celda: (c) => t(n(c.ventilacion.vtProgramado)) },
    { grupo: V, etiqueta: "Vol. tidal esp. (ml/kg)", celda: (c) => t(c.ventilacion.vtEspirado === null ? "--" : `${c.ventilacion.vtEspirado} (${n(d(c).vtEspiradoPorKg)})`) },
    { grupo: V, etiqueta: "F max / T ins", celda: (c) => t(`${n(c.ventilacion.flujo)} / ${n(c.ventilacion.ti)}`) },
    { grupo: V, etiqueta: "Frecuencia prog.", celda: (c) => t(n(c.ventilacion.frProgramada)) },
    { grupo: V, etiqueta: "Frecuencia total", celda: (c) => t(n(c.ventilacion.frTotal)) },
    { grupo: V, etiqueta: "PEEP / EPAP", celda: (c) => t(n(c.ventilacion.peep)) },
    { grupo: V, etiqueta: "P. sop / IPAP / control", celda: (c) => t(n(c.ventilacion.presion)) },
    { grupo: V, etiqueta: "P. máxima", celda: (c) => t(n(c.ventilacion.pPico)) },
    { grupo: V, etiqueta: "P. media", celda: (c) => t(n(c.ventilacion.pMedia)) },
    { grupo: V, etiqueta: "P. plateau", celda: (c) => mec(c, n(c.ventilacion.pPlateau)) },
    { grupo: V, etiqueta: "P. distensión (ΔP)", celda: (c) => mec(c, `${n(d(c).drivingPressure)}${d(c).origenDriving === "PICO" ? " (pico)" : ""}`) },
    { grupo: V, etiqueta: "Compliance", celda: (c) => mec(c, n(d(c).compliance)) },
    { grupo: V, etiqueta: "Auto PEEP", celda: (c) => t(esModalidadControlada(c.ventilacion.modalidad) ? n(c.ventilacion.autoPeep) : "—") },
    { grupo: V, etiqueta: "Relación I:E", celda: (c) => t(n(d(c).relacionIE)) },
    { grupo: V, etiqueta: "I. Tobin", celda: (c) => t(n(d(c).tobin)) },
    { grupo: V, etiqueta: "Vol. minuto", celda: (c) => t(n(d(c).volumenMinuto)) },
    { grupo: V, etiqueta: "FiO₂", celda: (c) => t(n(c.ventilacion.fio2)) },
    { grupo: V, etiqueta: "Temperatura (CNAF)", celda: (c) => t(c.ventilacion.modalidad === "CNAF" || c.ventilacion.modalidad === "CNAF_TQT" ? n(c.ventilacion.temperatura) : "—") },
    { grupo: V, etiqueta: "Musc. accesoria", celda: (c) => t(c.ventilacion.musculaturaAccesoria === null ? "--" : c.ventilacion.musculaturaAccesoria ? "Sí" : "No") },
    { grupo: K, etiqueta: "Auscultación", celda: (c) => t(c.kineResp.auscultacion.trim() === "" ? "--" : c.kineResp.auscultacion) },
    { grupo: K, etiqueta: "Secreciones", celda: (c) => { const k = c.kineResp; if (!k.aspecto) return t("--"); if (k.aspecto === "NINGUNA") return t("sin secreciones"); return t([etiquetaAspecto(k.aspecto).toLowerCase(), k.cantidad?.toLowerCase(), k.reologia?.toLowerCase()].filter(Boolean).join(", ")); } },
    { grupo: K, etiqueta: "Tos / PEF", celda: (c) => t(c.kineResp.tos === null && c.kineResp.flujoPicoTos === null ? "--" : `${c.kineResp.tos === "EFICIENTE" ? "eficiente" : c.kineResp.tos === "DEFICIENTE" ? "deficiente" : "—"}${c.kineResp.flujoPicoTos !== null ? ` · ${c.kineResp.flujoPicoTos} L/min` : ""}`) },
    { grupo: K, etiqueta: "Deglución", celda: (c) => t(OPCIONES_DEGLUCION.find((d) => d.val === c.kineResp.deglucion)?.label ?? "--") },
    { grupo: K, etiqueta: "Terapia física", celda: (c) => t(c.terapiaFisica.estado === "REALIZADA" ? `Sí${c.terapiaFisica.ims !== null ? ` · IMS ${c.terapiaFisica.ims}` : ""}` : c.terapiaFisica.estado === "CONTRAINDICADA" ? "Contraind." : "No") },
    { grupo: "Firma", etiqueta: "Firma", celda: (c) => t(iniciales(c.rutAutor)) }
  );
  return filas;
}

// ---------------------------------------------------------------------------
// Columnas: una por control, con los hitos de via aerea que lo generaron
// ---------------------------------------------------------------------------

/** Eventos que cambian la via aerea: generan un control y se marcan en su columna. */
const TIPOS_VIA: ReadonlySet<EventoClinico["tipo"]> = new Set([
  "REINTUBACION", "EXTUBACION_PROGRAMADA", "AUTOEXTUBACION", "TRAQUEOSTOMIA", "DECANULACION", "CAMBIO_TUBO", "CAMBIO_CANULA"
]);

/** Rotulo corto para el encabezado de la columna. */
export function hitoCorto(ev: EventoClinico, eventos: readonly EventoClinico[]): string {
  switch (ev.tipo) {
    case "REINTUBACION":
      return esReintubacion(ev, eventos) ? "Reintubación" : "Intubación";
    case "EXTUBACION_PROGRAMADA":
      return ev.sinPve ? "Extubación s/PVE" : "Extubación";
    case "AUTOEXTUBACION":
      return "Autoextubación";
    case "TRAQUEOSTOMIA":
      return "Traqueostomía";
    case "DECANULACION":
      return ev.accidental ? "Decanulación accid." : "Decanulación";
    case "CAMBIO_TUBO":
      return "Cambio de tubo";
    case "CAMBIO_CANULA":
      return "Cambio de cánula";
    default:
      return "";
  }
}

export type RangoSabana = "24H" | "ESTADIA";

export interface ColumnaSabana {
  readonly control: Control;
  /** Hitos de via aerea ocurridos desde el control anterior hasta este. */
  readonly hitos: readonly string[];
  /** Primera columna de un dia nuevo (se marca con una linea gruesa). */
  readonly nuevoDia: boolean;
  /** «Mié 11-11»: el dia del control. */
  readonly dia: string;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaDe = (iso: string): string => {
  const d = new Date(iso);
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Las columnas de la sabana: un control cada una, de la mas antigua a la mas nueva. */
export function columnasSabana(controles: readonly Control[], eventos: readonly EventoClinico[], rango: RangoSabana, ahora: Date): readonly ColumnaSabana[] {
  const todos = [...controles].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  const desde = rango === "24H" ? new Date(ahora.getTime() - 24 * 3_600_000).toISOString() : "";
  const via = eventos.filter((e) => TIPOS_VIA.has(e.tipo)).sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  const columnas: ColumnaSabana[] = [];
  todos.forEach((c, i) => {
    if (c.registradoEn < desde) return;
    const anterior = todos[i - 1]?.registradoEn ?? "";
    const hitos = via.filter((e) => e.registradoEn > anterior && e.registradoEn <= c.registradoEn).map((e) => hitoCorto(e, eventos));
    const dia = diaDe(c.registradoEn);
    columnas.push({ control: c, hitos, dia, nuevoDia: columnas.length > 0 && columnas[columnas.length - 1]!.dia !== dia });
  });
  return columnas;
}

/**
 * Los demas eventos del rango (filtros, cultivos, prono, PVE, procedimientos…): no forman
 * parte del control y van en una lista aparte. Las evaluaciones tienen su propia pestana.
 */
export function otrosEventos(eventos: readonly EventoClinico[], rango: RangoSabana, ahora: Date): readonly EventoClinico[] {
  const desde = rango === "24H" ? new Date(ahora.getTime() - 24 * 3_600_000).toISOString() : "";
  return eventos
    .filter((e) => !TIPOS_VIA.has(e.tipo) && e.tipo !== "EVALUACION_PUNTUAL" && e.registradoEn >= desde)
    .sort((a, b) => b.registradoEn.localeCompare(a.registradoEn));
}

/** Las evaluaciones del episodio, de la mas nueva a la mas antigua. */
export function evaluacionesDe(eventos: readonly EventoClinico[]): readonly EventoClinico[] {
  return eventos.filter((e) => e.tipo === "EVALUACION_PUNTUAL").sort((a, b) => b.registradoEn.localeCompare(a.registradoEn));
}
