/**
 * Dotacion de kinesiologia UPC Adulto.
 *
 * La lista REAL vive en la hoja «usuarios» de Google (correo, nombre, turno, rol): la app la
 * pide al servidor al arrancar y la guarda en el equipo para usarla sin senal. Asi se agregan
 * reemplazos sin publicar una version, y ningun correo ni RUT queda en el codigo publicado.
 *
 * Aqui solo esta la dotacion de DEMOSTRACION, con correos inventados (@demo.upc). El RUT del
 * profesional no existe en la app: se identifica por su correo.
 */

import type { IdTurno, Profesional } from "./tipos";

const demo = (nombre: string, turno: IdTurno, rol: Profesional["rol"] = "KINE_CLINICO"): Profesional => ({
  correo: `${sinTildes(nombre).replace(/ /g, ".")}@demo.upc`,
  nombre,
  turno,
  rol
});

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Dotacion de la demostracion (correos inventados). */
export const DOTACION_DEMO: readonly Profesional[] = [
  demo("Mauricio Ortega", "T1"),
  demo("Felipe Guerrero", "T1"),
  demo("Natalia Parra", "T1"),
  demo("Sergio Ortiz", "T2"),
  demo("Maria Jose Vega", "T2"),
  demo("Alvaro Wilson", "T2"),
  demo("Eduardo Gonzalez", "T3"),
  { ...demo("Diego Melo", "T3"), museo: true },
  demo("Karen Gonzalez", "T3"),
  demo("Carlos Morales", "T4"),
  demo("Andres Angel", "T4"),
  demo("Manuel Fuentes", "T4"),
  demo("Rodrigo Caamano", "SUBROGANCIA", "COORDINACION"),
  demo("Magdalena Contardo", "SUBROGANCIA", "COORDINACION"),
  demo("Aline Campos", "REEMPLAZO"),
  demo("Scarlett Tabilo", "REEMPLAZO"),
  // Perfil de solo lectura (24-nov-2026): el médico de la UCI ve, no registra.
  demo("Medico Uci", "REEMPLAZO", "MEDICO")
];

/** Correo de demostracion de Diego, para el aviso del modo demostracion y las pruebas. */
export const CORREO_DEMO = "diego.melo@demo.upc";

export const NOMBRE_TURNO: Readonly<Record<IdTurno, string>> = {
  T1: "Turno 1",
  T2: "Turno 2",
  T3: "Turno 3",
  T4: "Turno 4",
  SUBROGANCIA: "Subrogancia y coordinacion",
  REEMPLAZO: "Reemplazos"
};

const TURNOS: readonly IdTurno[] = ["T1", "T2", "T3", "T4", "SUBROGANCIA", "REEMPLAZO"];

let actual: readonly Profesional[] = DOTACION_DEMO;
let porCorreo = new Map<string, Profesional>();
indexar();

function indexar(): void {
  porCorreo = new Map(actual.map((p) => [p.correo, p] as const));
}

/** La dotacion vigente (la de la hoja en produccion; la de demostracion en la demo). */
export function dotacion(): readonly Profesional[] {
  return actual;
}

/** Fija la dotacion vigente. Descarta filas sin correo valido o sin nombre. */
export function fijarDotacion(lista: readonly unknown[]): readonly Profesional[] {
  actual = lista.flatMap((x): Profesional[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    const correo = String(o["correo"] ?? "").trim().toLowerCase();
    const nombre = String(o["nombre"] ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !nombre) return [];
    const turno = TURNOS.includes(o["turno"] as IdTurno) ? (o["turno"] as IdTurno) : "REEMPLAZO";
    const r = String(o["rol"] ?? "").toUpperCase();
    const rol: Profesional["rol"] = r.startsWith("COORD") ? "COORDINACION" : r.startsWith("INTERN") ? "INTERNO" : r.startsWith("MED") || r.startsWith("MÉD") ? "MEDICO" : "KINE_CLINICO";
    const museo = /^(TRUE|SI|SÍ|1)$/i.test(String(o["museo"] ?? "").trim()) || o["museo"] === true;
    return [{ correo, nombre, turno, rol, ...(museo ? { museo: true } : {}) }];
  });
  indexar();
  return actual;
}

/** Profesional por su identificador (el correo; sin importar mayusculas ni espacios). */
export function buscarProfesional(id: string): Profesional | undefined {
  return porCorreo.get(id.trim().toLowerCase());
}

/**
 * Usuario por correo o por nombre ("Diego Melo", sin importar tildes ni mayusculas).
 * Por nombre debe haber UNA sola coincidencia; si es ambiguo no adivina.
 */
export function buscarUsuario(texto: string): Profesional | undefined {
  if (texto.includes("@")) return buscarProfesional(texto);
  const q = sinTildes(texto);
  if (q === "") return undefined;
  const exactos = actual.filter((p) => sinTildes(p.nombre) === q);
  if (exactos.length === 1) return exactos[0];
  const parciales = actual.filter((p) => q.split(" ").every((t) => sinTildes(p.nombre).split(" ").some((n) => n.startsWith(t))));
  return parciales.length === 1 ? parciales[0] : undefined;
}

/** Tratamiento profesional para la nota clinica: «Klgo.», o «Int.» para el interno. */
export function tituloProfesional(p: Profesional): string {
  return `${p.rol === "INTERNO" ? "Int." : p.rol === "MEDICO" ? "Dr(a)." : "Klgo."} ${p.nombre}`;
}

/** Como se nombra el rol en la cuenta. */
export function etiquetaRol(rol: Profesional["rol"]): string {
  return rol === "COORDINACION" ? "Kinesiólogo · Coordinación" : rol === "INTERNO" ? "Interno de kinesiología" : rol === "MEDICO" ? "Médico UCI · solo lectura" : "Kinesiólogo clínico";
}

/**
 * Perfil de solo lectura (Diego, 24-nov-2026): el médico de la UCI ve las camas, la sábana y la
 * Entrega, pero no ingresa, no monitoriza ni registra eventos o evaluaciones. El servidor rechaza
 * cualquier registro suyo: esconder botones no protege.
 */
export function soloLectura(rol: Profesional["rol"] | undefined | null): boolean {
  return rol === "MEDICO";
}
