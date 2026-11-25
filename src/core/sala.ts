/**
 * La sala dibujada de la ronda «en 8 bits» (idea de Diego, 24-nov-2026; programada el 25-nov:
 * «con la ronda de equipos avanza con los bloques y grillas de VM 8 bit por ahora»).
 *
 * La unidad se recorre por SECCIONES de 6 camas (grilla 2×3). Tocar una cama ofrece los tipos de
 * equipo con su dibujo y un teclado para el número; al elegirlo, ese equipo queda en la sala de la
 * cama. No es un registro nuevo: escribe el mismo CAMBIO_EQUIPOS que el panel de equipos.
 *
 * 🔴 PROVISORIO: qué camas van en cada sección lo tiene que decir Diego. Mientras, se reparten las
 * 18 camas en tres secciones de 6, en orden. Pasillo, Bodega y Equipos médicos quedan para cuando
 * se decida cómo se anotan los equipos que no están en una cama.
 */
import { CATALOGO_EQUIPOS, CAMAS_UNIDAD } from "./catalogos";
import { esSoporteRespiratorio, puedeEstarEnUso, quitarEquipo } from "./equipos";
import type { EquipoRce } from "./entrega";
import type { EquipoEnSala, TipoEquipo, ViaAerea } from "./tipos";

export interface SeccionSala {
  readonly id: string;
  readonly nombre: string;
  readonly camas: readonly string[];
}

export const SECCIONES_SALA: readonly SeccionSala[] = [
  { id: "ADELANTE", nombre: "Adelante", camas: CAMAS_UNIDAD.slice(0, 6) },
  { id: "MEDIO", nombre: "Medio", camas: CAMAS_UNIDAD.slice(6, 12) },
  { id: "ATRAS", nombre: "Atrás", camas: CAMAS_UNIDAD.slice(12, 18) }
];

/** Los números que acepta el teclado (Diego, 24-nov): Meckis 1–20, Vela 1–10, el resto 1–10. */
export function rangoNumeroEquipo(modelo: string): { readonly min: number; readonly max: number } | null {
  const def = CATALOGO_EQUIPOS.find((d) => d.modelo === modelo);
  if (!def || !def.numerado) return null;
  return { min: 1, max: modelo === "Meckis" ? 20 : 10 };
}

export function numeroValido(modelo: string, numero: number | null): boolean {
  const r = rangoNumeroEquipo(modelo);
  if (r === null) return numero === null && CATALOGO_EQUIPOS.some((d) => d.modelo === modelo);
  return numero !== null && Number.isInteger(numero) && numero >= r.min && numero <= r.max;
}

/**
 * La sala de la cama después de elegir un equipo en la grilla. El elegido entra y, si puede dar el
 * soporte con esa vía aérea, queda EN USO; el que estaba en uso del mismo tipo sale de la sala (se
 * cambió). Los demás equipos se quedan como estaban.
 */
export function salaAlElegir(lista: readonly EquipoEnSala[], modelo: string, numero: number | null, via: ViaAerea): readonly EquipoEnSala[] {
  const def = CATALOGO_EQUIPOS.find((d) => d.modelo === modelo);
  if (!def || !numeroValido(modelo, numero)) return lista;
  const yaEsta = lista.find((e) => e.modelo === modelo && e.numero === numero);
  const enUso = esSoporteRespiratorio(def.tipo) && puedeEstarEnUso(def.tipo, via);
  let base = lista;
  if (enUso) {
    const anterior = lista.find((e) => e.tipo === def.tipo && e.enUso && !(e.modelo === modelo && e.numero === numero));
    if (anterior) base = quitarEquipo(base, anterior);
  }
  if (yaEsta) base = quitarEquipo(base, yaEsta);
  const nuevo: EquipoEnSala = { tipo: def.tipo, modelo, numero, enUso: enUso || !esSoporteRespiratorio(def.tipo) };
  const resto = enUso ? base.map((e) => (esSoporteRespiratorio(e.tipo) ? { ...e, enUso: false } : e)) : base;
  return [...resto, nuevo];
}

/** El equipo que se dibuja en el cuadro de la cama: el que da el soporte, si no el primero. */
export function equipoParaDibujar(lista: readonly EquipoEnSala[]): EquipoEnSala | null {
  return lista.find((e) => esSoporteRespiratorio(e.tipo) && e.enUso) ?? lista.find((e) => esSoporteRespiratorio(e.tipo)) ?? lista[0] ?? null;
}

// ---------------------------------------------------------------------------
// Inventario del RCE (25-nov-2026, Diego: «no puedo guardar los VM… tiene que tener integración con
// el panel del RCE»). La sala elige los equipos REALES de la unidad: su nombre es el del RCE, así el
// RCE los encuentra al recibir el CAMBIO_EQUIPOS. Sin inventario (sin enlace), queda el catálogo.
// ---------------------------------------------------------------------------


/** VM · VNI · CNAF · APOYO del RCE → el tipo de Kaptus. */
export function tipoDeCategoria(categoria: string, nombre = ""): TipoEquipo {
  const c = categoria.toUpperCase();
  if (c === "VNI") return "VMNI";
  if (c === "CNAF") return "ALTO_FLUJO";
  if (c === "APOYO") return /aerogen|nbz|nebul/i.test(nombre) ? "NEBULIZADOR" : "HUMIDIFICADOR";
  return "VENTILADOR";
}

/** Un equipo del inventario como equipo de la sala: el modelo ES el nombre del RCE (sin número aparte). */
export function equipoDeInventario(e: EquipoRce, enUso = false): EquipoEnSala {
  const tipo = tipoDeCategoria(e.categoria, e.nombre);
  return { tipo, modelo: e.nombre, numero: null, enUso: esSoporteRespiratorio(tipo) ? enUso : true };
}

const mismoNombre = (a: EquipoEnSala, nombre: string): boolean => (a.numero === null ? a.modelo : `${a.modelo} ${a.numero}`).toLowerCase() === nombre.toLowerCase();

/**
 * Deja un equipo en la sala (Diego: «hacer click, seleccionar y dejarlo en la sala»). Entra SIN USO,
 * salvo que la cama necesite un soporte en uso y no tenga ninguno (TET conectado): ahí entra en uso.
 */
export function dejarEnSala(lista: readonly EquipoEnSala[], e: EquipoRce, via: ViaAerea, conectado: boolean): readonly EquipoEnSala[] {
  if (lista.some((x) => mismoNombre(x, e.nombre))) return lista;
  const nuevo = equipoDeInventario(e, false);
  const falta = via !== "NATURAL" && conectado && esSoporteRespiratorio(nuevo.tipo) && puedeEstarEnUso(nuevo.tipo, via) && !lista.some((x) => esSoporteRespiratorio(x.tipo) && x.enUso);
  return [...lista, falta ? { ...nuevo, enUso: true } : nuevo];
}

/** «Hacer click y ponerlo en uso»: ese queda en uso y los demás soportes de la sala, sin uso. */
export function usarEnSala(lista: readonly EquipoEnSala[], equipo: EquipoEnSala): readonly EquipoEnSala[] {
  if (!esSoporteRespiratorio(equipo.tipo)) return lista;
  return lista.map((x) => (esSoporteRespiratorio(x.tipo) ? { ...x, enUso: x.modelo === equipo.modelo && x.numero === equipo.numero } : x));
}

/** El nombre con que el RCE conoce a un equipo de la sala. */
export const nombreRce = (e: EquipoEnSala): string => (e.numero === null ? e.modelo : `${e.modelo} ${e.numero}`);
