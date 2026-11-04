/**
 * Dotacion oficial de kinesiologia UPC Adulto, Hospital San Pablo de Coquimbo.
 *
 * Los RUT son marcadores de posicion y deben reemplazarse por los reales al
 * desplegar. El PIN no vive aqui: se guarda con hash (bcrypt) del lado de
 * Apps Script. Ver docs/PLAN-MAESTRO.md cap. 1 y 9.
 */

import { normalizarRut } from "./sinapse";
import type { IdTurno, Profesional } from "./tipos";

export const DOTACION: readonly Profesional[] = [
  { rut: "11.111.111-1", nombre: "Mauricio Ortega", turno: "T1", rol: "KINE_CLINICO" },
  { rut: "11.111.112-2", nombre: "Felipe Guerrero", turno: "T1", rol: "KINE_CLINICO" },
  { rut: "11.111.113-3", nombre: "Natalia Parra", turno: "T1", rol: "KINE_CLINICO" },

  { rut: "22.222.221-1", nombre: "Sergio Ortiz", turno: "T2", rol: "KINE_CLINICO" },
  { rut: "22.222.222-2", nombre: "Maria Jose Vega", turno: "T2", rol: "KINE_CLINICO" },
  { rut: "22.222.223-3", nombre: "Alvaro Wilson", turno: "T2", rol: "KINE_CLINICO" },

  { rut: "33.333.331-1", nombre: "Eduardo Gonzalez", turno: "T3", rol: "KINE_CLINICO" },
  { rut: "16.452.891-K", nombre: "Diego Melo", turno: "T3", rol: "KINE_CLINICO" },
  { rut: "33.333.333-3", nombre: "Karen Gonzalez", turno: "T3", rol: "KINE_CLINICO" },

  { rut: "44.444.441-1", nombre: "Carlos Morales", turno: "T4", rol: "KINE_CLINICO" },
  { rut: "44.444.442-2", nombre: "Andres Angel", turno: "T4", rol: "KINE_CLINICO" },
  { rut: "44.444.443-3", nombre: "Manuel Fuentes", turno: "T4", rol: "KINE_CLINICO" },

  { rut: "55.555.551-1", nombre: "Rodrigo Caamano", turno: "SUBROGANCIA", rol: "COORDINACION" },
  { rut: "55.555.552-2", nombre: "Magdalena Contardo", turno: "SUBROGANCIA", rol: "COORDINACION" },

  { rut: "66.666.661-1", nombre: "Aline Campos", turno: "REEMPLAZO", rol: "KINE_CLINICO" },
  { rut: "66.666.662-2", nombre: "Scarlett Tabilo", turno: "REEMPLAZO", rol: "KINE_CLINICO" }
];

export const NOMBRE_TURNO: Readonly<Record<IdTurno, string>> = {
  T1: "Turno 1",
  T2: "Turno 2",
  T3: "Turno 3",
  T4: "Turno 4",
  SUBROGANCIA: "Subrogancia y coordinacion",
  REEMPLAZO: "Reemplazos"
};

/** Indexado por RUT normalizado: se acepta con o sin puntos, con guion o sin el, k o K. */
const PORRUT: ReadonlyMap<string, Profesional> = new Map(
  DOTACION.map((p) => [normalizarRut(p.rut) ?? p.rut, p] as const)
);

export function buscarProfesional(rut: string): Profesional | undefined {
  return PORRUT.get(normalizarRut(rut) ?? rut.trim().toUpperCase());
}

/** Tratamiento profesional para la nota clinica. */
export function tituloProfesional(p: Profesional): string {
  return `Klgo. ${p.nombre}`;
}
