/**
 * Sabana del turno: una fila por parametro y una columna por control.
 * Funcion pura sobre el dominio, separada de la pantalla para poder probarla.
 */

import {
  ETIQUETA_MODALIDAD,
  calcularDerivados,
  calcularGlasgow,
  describirCardiovasculares,
  describirInfusiones,
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

  const filas: FilaSabana[] = [
    { etiqueta: "FC", celda: (c) => t(n(c.fc)) },
    { etiqueta: "PA (PAM)", celda: (c) => t(`${n(c.pas)}/${n(c.pad)} (${n(d(c).pam)})`) },
    { etiqueta: "SpO₂", celda: (c) => t(n(c.spo2)) },
    { etiqueta: "Modo", celda: (c) => t(`${ETIQUETA_MODALIDAD[c.ventilacion.modalidad]}${c.ventilacion.asincronico ? " (asinc.)" : ""}`) },
    { etiqueta: "FR prog.", celda: (c) => t(n(c.ventilacion.frProgramada)) },
    { etiqueta: "FR total", celda: (c) => t(n(c.ventilacion.frTotal)) },
    { etiqueta: "Vt prog.", celda: (c) => t(n(c.ventilacion.vtProgramado)) },
    { etiqueta: "Vt esp. (ml/kg)", celda: (c) => t(c.ventilacion.vtEspirado === null ? "--" : `${c.ventilacion.vtEspirado} (${n(d(c).vtEspiradoPorKg)})`) },
    { etiqueta: "Vol. minuto", celda: (c) => t(`${n(d(c).volumenMinuto)}${d(c).volumenMinutoOrigen === "EDITADO" ? "*" : ""}`) },
    { etiqueta: "I:E", celda: (c) => t(n(d(c).relacionIE)) },
    { etiqueta: "PEEP", celda: (c) => t(n(c.ventilacion.peep)) },
    { etiqueta: "FiO₂", celda: (c) => t(n(c.ventilacion.fio2)) },
    { etiqueta: "P. pico", celda: (c) => t(n(c.ventilacion.pPico)) },
    { etiqueta: "P. plateau", celda: (c) => mec(c, n(c.ventilacion.pPlateau)) },
    { etiqueta: "ΔP", celda: (c) => mec(c, `${n(d(c).drivingPressure)}${d(c).origenDriving === "PICO" ? " (pico)" : ""}`) },
    { etiqueta: "Compliance", celda: (c) => mec(c, n(d(c).compliance)) },
    { etiqueta: "Tobin", celda: (c) => t(n(d(c).tobin)) },
    { etiqueta: "SAS / vigilia", celda: (c) => t(sedoanalgesiaActiva(c.infusiones) ? `SAS ${n(c.sas)}` : c.vigilia ? c.vigilia.toLowerCase().replace("_", " ") : "--") },
    { etiqueta: "Sedación", celda: (c) => t(describirInfusiones(c.infusiones, "SEDANTE") || "—") },
    { etiqueta: "DVA / inotrópicos", celda: (c) => t(describirCardiovasculares(c.infusiones).replace("sin requerimiento de DVA ni inotrópicos", "—")) },
    {
      etiqueta: "Glasgow",
      celda: (c) => {
        if (!c.glasgow) return t("--");
        const g = calcularGlasgow(c.glasgow, c.viaAerea);
        return t(`${g.display}${d(c).glasgowBajoSedacion ? "*" : ""}`);
      }
    }
  ];

  if (monitoreo.capnografia) filas.push({ etiqueta: "EtCO₂", celda: (c) => t(n(c.neuro?.etco2)) });
  if (monitoreo.pic) {
    filas.push({ etiqueta: "PIC", celda: (c) => t(n(c.neuro?.pic)) });
    filas.push({ etiqueta: "PPC", celda: (c) => t(n(d(c).ppc)) });
  }
  if (monitoreo.dve) {
    filas.push({
      etiqueta: "DVE",
      celda: (c) => {
        const x = c.neuro;
        if (!x || x.dveAlturaCmH2O === null) return t("--");
        return t(`${x.dveAlturaCmH2O} cmH₂O ${x.dveAbierta === null ? "" : x.dveAbierta ? "abierta" : "cerrada"}`.trim());
      }
    });
  }

  filas.push(
    { etiqueta: "Kine resp.", celda: (c) => t(c.kineResp.realizada ? `Sí${c.kineResp.aspiracion !== "NO" ? ` · ${c.kineResp.aspiracion === "TRACHCARE" ? "TrachCare" : "set"}` : ""}` : "No") },
    { etiqueta: "Terapia física", celda: (c) => t(c.terapiaFisica.estado === "REALIZADA" ? `Sí${c.terapiaFisica.ims !== null ? ` · IMS ${c.terapiaFisica.ims}` : ""}` : c.terapiaFisica.estado === "CONTRAINDICADA" ? "Contraind." : "No") },
    { etiqueta: "Firma", celda: (c) => t(iniciales(c.rutAutor)) }
  );
  return filas;
}
