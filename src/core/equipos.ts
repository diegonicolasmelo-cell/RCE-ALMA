/**
 * Equipos de la sala: rastreo de la ubicacion de ventiladores y dispositivos.
 *
 * Un equipo se nombra por modelo y numero ("Savina 1", "Vela 8", "Meckis 3"): el
 * numero asocia el nombre a un numero de serie. El Servo U es unico y no lleva
 * numero. Por ahora basta con anotar el nombre; el numero de serie se ve despues
 * en el PC.
 *
 * Son estado del episodio (como la via aerea) y un cambio queda como evento con
 * hora, de modo que se conserva el historial de movimientos.
 */

import { CATALOGO_EQUIPOS, ETIQUETA_TIPO_EQUIPO } from "./catalogos";
import type { EquipoEnSala, TipoEquipo } from "./tipos";

/** Dispositivos que dan soporte respiratorio: solo uno esta "en uso" a la vez. */
const TIPOS_DE_SOPORTE: readonly TipoEquipo[] = ["VENTILADOR", "VMNI", "ALTO_FLUJO"];

export const esSoporteRespiratorio = (t: TipoEquipo): boolean => TIPOS_DE_SOPORTE.includes(t);

export function etiquetaEquipo(e: EquipoEnSala): string {
  return e.numero === null ? e.modelo : `${e.modelo} ${e.numero}`;
}

/** Un modelo numerado exige un numero entero positivo; uno unico, ninguno. */
export function equipoEsValido(modelo: string, numero: number | null): boolean {
  const def = CATALOGO_EQUIPOS.find((d) => d.modelo === modelo);
  if (!def) return false;
  if (!def.numerado) return numero === null;
  return numero !== null && Number.isInteger(numero) && numero >= 1;
}

const mismo = (a: EquipoEnSala, b: EquipoEnSala): boolean => a.modelo === b.modelo && a.numero === b.numero;

/** Agrega un equipo del catalogo. No duplica uno ya presente (mismo modelo y numero). */
export function agregarEquipo(
  lista: readonly EquipoEnSala[],
  modelo: string,
  numero: number | null
): readonly EquipoEnSala[] {
  const def = CATALOGO_EQUIPOS.find((d) => d.modelo === modelo);
  if (!def || !equipoEsValido(modelo, numero)) return lista;
  const nuevo: EquipoEnSala = { tipo: def.tipo, modelo, numero, enUso: !esSoporteRespiratorio(def.tipo) };
  if (lista.some((e) => mismo(e, nuevo))) return lista;
  // El primer soporte respiratorio que entra a la sala queda en uso por defecto.
  const hayEnUso = lista.some((e) => esSoporteRespiratorio(e.tipo) && e.enUso);
  const conUso = esSoporteRespiratorio(def.tipo) && !hayEnUso ? { ...nuevo, enUso: true } : nuevo;
  return [...lista, conUso];
}

export function quitarEquipo(lista: readonly EquipoEnSala[], equipo: EquipoEnSala): readonly EquipoEnSala[] {
  return lista.filter((e) => !mismo(e, equipo));
}

/** Marca cual equipo da el soporte ahora; los demas soportes quedan en la sala sin uso. */
export function ponerEnUso(lista: readonly EquipoEnSala[], equipo: EquipoEnSala): readonly EquipoEnSala[] {
  if (!esSoporteRespiratorio(equipo.tipo)) return lista;
  return lista.map((e) => (esSoporteRespiratorio(e.tipo) ? { ...e, enUso: mismo(e, equipo) } : e));
}

export function equipoEnUso(lista: readonly EquipoEnSala[]): EquipoEnSala | null {
  return lista.find((e) => esSoporteRespiratorio(e.tipo) && e.enUso) ?? null;
}

export function equiposIguales(a: readonly EquipoEnSala[], b: readonly EquipoEnSala[]): boolean {
  if (a.length !== b.length) return false;
  const clave = (e: EquipoEnSala): string => `${e.modelo}|${e.numero}|${e.enUso}`;
  const ca = a.map(clave).sort();
  const cb = b.map(clave).sort();
  return ca.every((x, i) => x === cb[i]);
}

/** "Savina 1 (en uso) · Humidificador MR850 2". */
export function describirEquipos(lista: readonly EquipoEnSala[]): string {
  if (lista.length === 0) return "sin equipos registrados";
  return lista
    .map((e) => `${etiquetaEquipo(e)}${esSoporteRespiratorio(e.tipo) && e.enUso ? " (en uso)" : ""}`)
    .join(" · ");
}

export function etiquetaTipoEquipo(t: TipoEquipo): string {
  return ETIQUETA_TIPO_EQUIPO[t];
}
