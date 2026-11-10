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
  demo("Diego Melo", "T3"),
  demo("Karen Gonzalez", "T3"),
  demo("Carlos Morales", "T4"),
  demo("Andres Angel", "T4"),
  demo("Manuel Fuentes", "T4"),
  demo("Rodrigo Caamano", "SUBROGANCIA", "COORDINACION"),
  demo("Magdalena Contardo", "SUBROGANCIA", "COORDINACION"),
  demo("Aline Campos", "REEMPLAZO"),
  demo("Scarlett Tabilo", "REEMPLAZO")
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
    const rol = String(o["rol"] ?? "").toUpperCase().startsWith("COORD") ? "COORDINACION" : "KINE_CLINICO";
    return [{ correo, nombre, turno, rol }];
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

/** Tratamiento profesional para la nota clinica. */
export function tituloProfesional(p: Profesional): string {
  return `Klgo. ${p.nombre}`;
}
