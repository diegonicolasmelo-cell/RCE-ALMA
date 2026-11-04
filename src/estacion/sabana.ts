/**
 * Sabana del turno: una fila por parametro y una columna por control.
 * Funcion pura sobre el dominio, separada de la pantalla para poder probarla.
 */

import {
  CORTE_S5Q,
  ETIQUETA_MODALIDAD,
  calcularDerivados,
  calcularGlasgow,
  describirCardiovasculares,
  describirInfusiones,
  esModalidadControlada,
  mecanicaBloqueadaPorAsincronia,
  sedoanalgesiaActiva
} from "@core/index";
import type { Control, MonitoreoEpisodio } from "@core/index";
import { iniciales } from "./util";

export interface Celda {
  readonly texto: string;
  /** Dato invalidado (candado de mecanica): se muestra bloqueado, nunca un numero falso. */
  readonly bloqueado?: boolean;
}

export interface FilaSabana {
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

  // Mismo orden que la hoja de papel "Cuidados respiratorios": primero Monitorizacion,
  // despues Terapia ventilatoria. Lo que el papel no tiene va al final.
  const filas: FilaSabana[] = [
    // --- Monitorizacion ---
    { etiqueta: "Frec. cardiaca", celda: (c) => t(n(c.fc)) },
    { etiqueta: "P. arterial (PAM)", celda: (c) => t(`${n(c.pas)}/${n(c.pad)} (${n(d(c).pam)})`) }
  ];
  if (monitoreo.pic) filas.push({ etiqueta: "PIC / PPC", celda: (c) => t(`${n(c.neuro?.pic)} / ${n(d(c).ppc)}`) });
  filas.push(
    { etiqueta: "Glasgow", celda: glasgowDe },
    { etiqueta: "S5Q", celda: (c) => t(c.s5q === null ? "--" : `${c.s5q}/5 (${c.s5q >= CORTE_S5Q ? "≥" : "<"}${CORTE_S5Q})`) },
    { etiqueta: "SAS / escalón", celda: (c) => t(sedoanalgesiaActiva(c.infusiones) ? `SAS ${n(c.sas)}` : c.vigilia ? c.vigilia.toLowerCase().replace("_", " ") : "--") },
    { etiqueta: "DVA / inotrópicos", celda: (c) => t(describirCardiovasculares(c.infusiones).replace("sin requerimiento de DVA ni inotrópicos", "—")) },
    // --- Terapia ventilatoria ---
    { etiqueta: "Modo", celda: (c) => t(`${ETIQUETA_MODALIDAD[c.ventilacion.modalidad]}${c.ventilacion.asincronico ? " (asinc.)" : ""}`) },
    { etiqueta: "Vol. tidal prog.", celda: (c) => t(n(c.ventilacion.vtProgramado)) },
    { etiqueta: "Vol. tidal esp. (ml/kg)", celda: (c) => t(c.ventilacion.vtEspirado === null ? "--" : `${c.ventilacion.vtEspirado} (${n(d(c).vtEspiradoPorKg)})`) },
    { etiqueta: "F max / T ins", celda: (c) => t(`${n(c.ventilacion.flujo)} / ${n(c.ventilacion.ti)}`) },
    { etiqueta: "Frecuencia prog.", celda: (c) => t(n(c.ventilacion.frProgramada)) },
    { etiqueta: "Frecuencia total", celda: (c) => t(n(c.ventilacion.frTotal)) },
    { etiqueta: "PEEP / EPAP", celda: (c) => t(n(c.ventilacion.peep)) },
    { etiqueta: "P. sop / IPAP / control", celda: (c) => t(n(c.ventilacion.presion)) },
    { etiqueta: "P. máxima", celda: (c) => t(n(c.ventilacion.pPico)) },
    { etiqueta: "P. media", celda: (c) => t(n(c.ventilacion.pMedia)) },
    { etiqueta: "P. plateau", celda: (c) => mec(c, n(c.ventilacion.pPlateau)) },
    { etiqueta: "P. distensión (ΔP)", celda: (c) => mec(c, `${n(d(c).drivingPressure)}${d(c).origenDriving === "PICO" ? " (pico)" : ""}`) },
    { etiqueta: "Compliance", celda: (c) => mec(c, n(d(c).compliance)) },
    { etiqueta: "Auto PEEP", celda: (c) => t(esModalidadControlada(c.ventilacion.modalidad) ? n(c.ventilacion.autoPeep) : "—") },
    { etiqueta: "Relación I:E", celda: (c) => t(n(d(c).relacionIE)) },
    { etiqueta: "I. Tobin", celda: (c) => t(n(d(c).tobin)) },
    { etiqueta: "Vol. minuto", celda: (c) => t(n(d(c).volumenMinuto)) },
    { etiqueta: "FiO₂", celda: (c) => t(n(c.ventilacion.fio2)) },
    { etiqueta: "SpO₂", celda: (c) => t(n(c.spo2)) },
    // --- Lo que el papel no trae ---
    { etiqueta: "Sedación", celda: (c) => t(describirInfusiones(c.infusiones, "SEDANTE") || "—") }
  );

  if (monitoreo.capnografia) filas.push({ etiqueta: "EtCO₂", celda: (c) => t(n(c.neuro?.etco2)) });
  if (monitoreo.dve) filas.push({ etiqueta: "DVE", celda: dve });

  filas.push(
    { etiqueta: "Kine resp.", celda: (c) => t(c.kineResp.realizada ? `Sí${c.kineResp.aspiracion !== "NO" ? ` · ${c.kineResp.aspiracion === "TRACHCARE" ? "TrachCare" : "set"}` : ""}` : "No") },
    { etiqueta: "Terapia física", celda: (c) => t(c.terapiaFisica.estado === "REALIZADA" ? `Sí${c.terapiaFisica.ims !== null ? ` · IMS ${c.terapiaFisica.ims}` : ""}` : c.terapiaFisica.estado === "CONTRAINDICADA" ? "Contraind." : "No") },
    { etiqueta: "Firma", celda: (c) => t(iniciales(c.rutAutor)) }
  );
  return filas;
}
