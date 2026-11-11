/**
 * Estadistica de turno y consolidado REM 28.
 *
 * Al ser el modelo append-only, el consolidado es una AGREGACION sobre el log,
 * no un contador que alguien incrementa (y que termina desincronizado del hecho
 * que lo origino). Se calcula, no se acumula. Ver docs/PLAN-MAESTRO.md cap. 9.
 */

import { NIVEL_POR_ACTIVIDAD } from "./catalogos";
import { contarReintubaciones } from "./eventos";
import type { Control, EventoClinico, TipoEvento, ValidacionApk } from "./tipos";

export type ConteoPorNivel = Readonly<Record<1 | 2 | 3 | 4, number>>;

export interface ResumenTurno {
  readonly totalControles: number;
  readonly kineRespiratoria: number;
  readonly terapiaFisicaRealizada: number;
  readonly terapiaFisicaContraindicada: number;
  /** Sesiones que incluyeron al menos una actividad de cada nivel. */
  readonly movilizacionPorNivel: ConteoPorNivel;
  readonly imsMaximo: number | null;
  readonly apkCumple: number;
  readonly apkNoCumple: number;
  readonly pve: number;
  readonly pveExitosas: number;
  readonly cultivos: number;
  readonly asistenciasFbc: number;
  readonly asistenciaProcedimientos: number;
  readonly traslados: number;
  /** Intubaciones reales. Un AJUSTE_TUBO no cuenta. */
  readonly reintubaciones: number;
  /** Recambios de tubo o de canula (no son reintubaciones). */
  readonly recambiosTubo: number;
  readonly decanulaciones: number;
  readonly extubacionesProgramadas: number;
  readonly autoextubaciones: number;
  readonly pcr: number;
  readonly eventosCentinela: number;
  readonly ciclosProno: number;
}

function nivelesVacios(): Record<1 | 2 | 3 | 4, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0 };
}

export function resumirTurno(
  controles: readonly Control[],
  eventos: readonly EventoClinico[],
  apk: readonly ValidacionApk[] = []
): ResumenTurno {
  const porNivel = nivelesVacios();
  let imsMaximo: number | null = null;

  for (const c of controles) {
    const tf = c.terapiaFisica;
    if (tf.ims !== null && (imsMaximo === null || tf.ims > imsMaximo)) imsMaximo = tf.ims;

    // Una sesion cuenta una vez por nivel, aunque incluya varias actividades de el.
    const niveles = new Set<1 | 2 | 3 | 4>();
    for (const act of tf.actividades) {
      const n = NIVEL_POR_ACTIVIDAD.get(act);
      if (n !== undefined) niveles.add(n);
    }
    for (const n of niveles) porNivel[n] += 1;
  }

  const porTipo = (tipo: TipoEvento): number => eventos.filter((e) => e.tipo === tipo).length;

  return {
    totalControles: controles.length,
    // Cada control es una atencion kinesica.
    kineRespiratoria: controles.length,
    terapiaFisicaRealizada: controles.filter((c) => c.terapiaFisica.estado === "REALIZADA").length,
    terapiaFisicaContraindicada: controles.filter((c) => c.terapiaFisica.estado === "CONTRAINDICADA").length,
    movilizacionPorNivel: porNivel,
    imsMaximo,
    apkCumple: apk.filter((v) => v.resultado === "CUMPLE").length,
    apkNoCumple: apk.filter((v) => v.resultado === "NO_CUMPLE").length,
    pve: porTipo("INICIO_PVE"),
    pveExitosas: eventos.filter((e) => e.tipo === "FIN_PVE" && e.exitosa).length,
    cultivos: porTipo("TOMA_CULTIVO"),
    asistenciasFbc: porTipo("ASISTENCIA_FBC"),
    asistenciaProcedimientos: porTipo("ASISTENCIA_PROCEDIMIENTO"),
    traslados: porTipo("TRASLADO_IMAGEN"),
    // Solo REintubaciones: la primera intubacion de quien llego con via natural no cuenta.
    reintubaciones: contarReintubaciones(eventos),
    recambiosTubo: porTipo("CAMBIO_TUBO") + porTipo("CAMBIO_CANULA"),
    decanulaciones: porTipo("DECANULACION"),
    extubacionesProgramadas: porTipo("EXTUBACION_PROGRAMADA"),
    autoextubaciones: porTipo("AUTOEXTUBACION"),
    pcr: porTipo("PCR"),
    eventosCentinela: porTipo("EVENTO_CENTINELA"),
    // Un ciclo se cuenta al supinar: un prono en curso aun no es ciclo cerrado.
    ciclosProno: porTipo("SUPINACION")
  };
}

/** Consolidado mensual: suma de los resumenes de todos los episodios del periodo. */
export function consolidarRem28(resumenes: readonly ResumenTurno[]): ResumenTurno {
  const porNivel = nivelesVacios();
  let imsMaximo: number | null = null;

  for (const r of resumenes) {
    for (const n of [1, 2, 3, 4] as const) porNivel[n] += r.movilizacionPorNivel[n];
    if (r.imsMaximo !== null && (imsMaximo === null || r.imsMaximo > imsMaximo)) imsMaximo = r.imsMaximo;
  }

  const sumar = (f: (r: ResumenTurno) => number): number => resumenes.reduce((acc, r) => acc + f(r), 0);

  return {
    totalControles: sumar((r) => r.totalControles),
    kineRespiratoria: sumar((r) => r.kineRespiratoria),
    terapiaFisicaRealizada: sumar((r) => r.terapiaFisicaRealizada),
    terapiaFisicaContraindicada: sumar((r) => r.terapiaFisicaContraindicada),
    movilizacionPorNivel: porNivel,
    imsMaximo,
    apkCumple: sumar((r) => r.apkCumple),
    apkNoCumple: sumar((r) => r.apkNoCumple),
    pve: sumar((r) => r.pve),
    pveExitosas: sumar((r) => r.pveExitosas),
    cultivos: sumar((r) => r.cultivos),
    asistenciasFbc: sumar((r) => r.asistenciasFbc),
    asistenciaProcedimientos: sumar((r) => r.asistenciaProcedimientos),
    traslados: sumar((r) => r.traslados),
    reintubaciones: sumar((r) => r.reintubaciones),
    recambiosTubo: sumar((r) => r.recambiosTubo),
    decanulaciones: sumar((r) => r.decanulaciones),
    extubacionesProgramadas: sumar((r) => r.extubacionesProgramadas),
    autoextubaciones: sumar((r) => r.autoextubaciones),
    pcr: sumar((r) => r.pcr),
    eventosCentinela: sumar((r) => r.eventosCentinela),
    ciclosProno: sumar((r) => r.ciclosProno)
  };
}
