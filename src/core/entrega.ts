/**
 * Entrega de turno en el celular (Diego, 22-nov-2026): cada cama de mis camas tiene dos caras.
 * Adelante, cómo está hoy (sale de la entrega de la Estación). Atrás, la historia escrita en el
 * RCE y los hitos del episodio, que salen solos de los eventos ya registrados.
 */

import type { Episodio, EventoClinico } from "./tipos";

/** Historia de la entrega: la escribe el RCE (PC), sin nombre ni RUT; el celular solo la muestra. */
export interface HistoriaEntrega {
  /** Número de cama del RCE (Kaptus «UCI-03» = 3). */
  readonly cama: number;
  /** Hasta 600 letras; puede venir en punteo (saltos de línea). */
  readonly texto: string;
  /** Iniciales de quien la guardó. */
  readonly firma: string;
  /** «yyyy-MM-dd» de la última edición. */
  readonly fecha: string;
}

export interface Hito {
  readonly en: string;
  readonly texto: string;
}

const cuandoDe = (e: EventoClinico): string => ("realizadaEn" in e && typeof e.realizadaEn === "string" ? e.realizadaEn : e.registradoEn);

/**
 * Los hitos del episodio, del más antiguo al más nuevo: ingreso, vía aérea, PVE, prono, cultivos,
 * traslados a imagen y PCR (lo que Diego aprobó el 22-nov-2026). Los cambios de filtro, los controles
 * y las evaluaciones no son hitos.
 */
export function hitosDelEpisodio(ep: Episodio, eventos: readonly EventoClinico[]): readonly Hito[] {
  const out: Hito[] = [];
  if (ep.ingresadoEn) out.push({ en: ep.ingresadoEn, texto: "Ingreso a la UCI" });
  let retiroPrevio = false;
  const orden = [...eventos].sort((a, b) => cuandoDe(a).localeCompare(cuandoDe(b)));
  for (const e of orden) {
    const t = ((): string | null => {
      switch (e.tipo) {
        case "REINTUBACION":
          return `${retiroPrevio ? "Reintubación" : "Intubación"}${e.via === "TQT" ? " por TQT" : ""}`;
        case "EXTUBACION_PROGRAMADA":
          return e.sinPve ? "Extubación fuera de protocolo" : "Extubación con protocolo";
        case "AUTOEXTUBACION":
          return e.accidental ? "Extubación accidental" : "Autoextubación";
        case "FIN_PVE":
          return e.exitosa ? "PVE superada" : "PVE fracasada";
        case "PVE_SIN_EXTUBAR":
          return "PVE superada, sin extubar";
        case "TRAQUEOSTOMIA":
          return "Traqueostomía";
        case "DECANULACION":
          return e.accidental ? "Decanulación accidental" : "Decanulación";
        case "INICIO_PRONO":
          return "Prono";
        case "TOMA_CULTIVO":
          return `Cultivo${e.muestra ? ` · ${e.muestra.toLowerCase()}` : ""}`;
        case "TRASLADO_IMAGEN":
          return `Traslado a ${e.destino ? e.destino.toLowerCase() : "imagen"}`;
        case "PCR":
          return "Paro cardiorrespiratorio";
        default:
          return null;
      }
    })();
    if (e.tipo === "EXTUBACION_PROGRAMADA" || e.tipo === "AUTOEXTUBACION" || e.tipo === "DECANULACION") retiroPrevio = true;
    if (t) out.push({ en: cuandoDe(e), texto: t });
  }
  return out.sort((a, b) => a.en.localeCompare(b.en));
}
