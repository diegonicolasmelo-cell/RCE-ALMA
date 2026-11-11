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

import { CATALOGO_EQUIPOS, ETIQUETA_TIPO_EQUIPO, GRUPO_MODALIDAD } from "./catalogos";
import type { DefinicionEquipo } from "./catalogos";
import type { Episodio, EquipoEnSala, EventoClinico, Modalidad, TipoEquipo, ViaAerea } from "./tipos";

/** Dispositivos que dan soporte respiratorio: solo uno esta "en uso" a la vez. */
const TIPOS_DE_SOPORTE: readonly TipoEquipo[] = ["VENTILADOR", "VMNI", "ALTO_FLUJO"];

export const esSoporteRespiratorio = (t: TipoEquipo): boolean => TIPOS_DE_SOPORTE.includes(t);

export function etiquetaEquipo(e: EquipoEnSala): string {
  if (e.numero === null) return e.modelo;
  // "Airvo 2 3" se lee mal: con un modelo que termina en numero, "Airvo 2 n.º 3".
  return /\s\d+$/.test(e.modelo) ? `${e.modelo} n.º ${e.numero}` : `${e.modelo} ${e.numero}`;
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

// ---------------------------------------------------------------------------
// Equipos segun la via aerea (decision de Diego, 11-nov-2026)
// ---------------------------------------------------------------------------
//
// El ventilador vive en la cama: toda cama tiene uno, este en uso o no. Con TET debe estar en
// uso; con via natural queda en la sala sin uso (la VNI es el V60). CNAF (Airvo 2) y V60 se
// ofrecen con via natural y con TQT; base calefactora y Aerogen, con cualquier via.

/** Si un tipo de equipo se ofrece con esta via. */
export function tipoSeOfrece(t: TipoEquipo, via: ViaAerea): boolean {
  if (t === "ALTO_FLUJO" || t === "VMNI") return via !== "TET";
  return true;
}

/** Si un equipo puede dar el soporte con esta via. */
export function puedeEstarEnUso(t: TipoEquipo, via: ViaAerea): boolean {
  if (!esSoporteRespiratorio(t)) return true;
  if (t === "VENTILADOR") return via !== "NATURAL";
  return via !== "TET";
}

export function modelosOfrecidos(via: ViaAerea): readonly DefinicionEquipo[] {
  return CATALOGO_EQUIPOS.filter((d) => tipoSeOfrece(d.tipo, via));
}

/**
 * Deja la lista coherente con la via: quita lo que no se ofrece, apaga lo que no puede estar en
 * uso y, con TET, deja el ventilador en uso si nadie da el soporte.
 */
export function equiposParaVia(lista: readonly EquipoEnSala[], via: ViaAerea): readonly EquipoEnSala[] {
  const filtrada = lista
    .filter((e) => tipoSeOfrece(e.tipo, via))
    .map((e) => (e.enUso && esSoporteRespiratorio(e.tipo) && !puedeEstarEnUso(e.tipo, via) ? { ...e, enUso: false } : e));
  if (via === "TET" && !filtrada.some((e) => esSoporteRespiratorio(e.tipo) && e.enUso)) {
    const vent = filtrada.find((e) => e.tipo === "VENTILADOR");
    if (vent) return ponerEnUso(filtrada, vent);
  }
  return filtrada;
}

/**
 * `null` si esta bien; si no, que falta. Toda cama tiene su ventilador. Con TET o TQT el
 * paciente conectado necesita un soporte en uso: el ventilador queda sin uso solo si esta
 * desvinculado (y no se ha reconectado). Al ingreso, con TET se asume conectado.
 */
export function problemaEquipos(lista: readonly EquipoEnSala[], via: ViaAerea, conectado = via === "TET"): string | null {
  const ventiladores = lista.filter((e) => e.tipo === "VENTILADOR");
  if (ventiladores.length === 0) return "Registra el ventilador de la sala: toda cama tiene uno, esté en uso o no.";
  if (via !== "NATURAL" && conectado && !lista.some((e) => esSoporteRespiratorio(e.tipo) && e.enUso)) {
    return `Con ${via} el ventilador de la sala debe quedar en uso: solo queda sin uso si el paciente está desvinculado.`;
  }
  const malUsado = lista.find((e) => e.enUso && esSoporteRespiratorio(e.tipo) && !puedeEstarEnUso(e.tipo, via));
  if (malUsado) return `${etiquetaEquipo(malUsado)} no puede estar en uso con ${via === "NATURAL" ? "vía aérea natural" : via}.`;
  return null;
}

/** Sin soporte (cama vacia, tubo T, O2): todo queda en la sala sin uso. */
const sinUso = (l: readonly EquipoEnSala[]): readonly EquipoEnSala[] => l.map((e) => (esSoporteRespiratorio(e.tipo) ? { ...e, enUso: false } : e));

/** Que equipo da el soporte en cada modo: VM el ventilador, VNI el V60, CNAF el Airvo. */
export function tipoParaModalidad(m: Modalidad): TipoEquipo | null {
  const g = GRUPO_MODALIDAD[m];
  if (g === "VENTILACION_MECANICA") return "VENTILADOR";
  if (g === "VNI") return "VMNI";
  if (m === "CNAF" || m === "CNAF_TQT") return "ALTO_FLUJO";
  return null;
}

/**
 * Al desvincular o reconectar, el uso sigue al modo: queda en uso el equipo que lo da; sin
 * soporte (tubo T, O2), nada en uso. Si la sala no tiene ese equipo, la lista no cambia.
 */
export function equiposSegunModalidad(lista: readonly EquipoEnSala[], m: Modalidad): readonly EquipoEnSala[] {
  const tipo = tipoParaModalidad(m);
  if (!tipo) return sinUso(lista);
  const equipo = lista.find((e) => e.tipo === tipo);
  return equipo ? ponerEnUso(lista, equipo) : lista;
}

/** Si se cambio algun ventilador (no solo su uso): ese cambio pide motivo. */
export function cambioDeVentilador(antes: readonly EquipoEnSala[], despues: readonly EquipoEnSala[]): boolean {
  const clave = (l: readonly EquipoEnSala[]): string => l.filter((e) => e.tipo === "VENTILADOR").map((e) => `${e.modelo}|${e.numero}`).sort().join(",");
  return clave(antes) !== "" && clave(antes) !== clave(despues);
}


/**
 * Los equipos que hay hoy en una cama. Si esta ocupada, los del paciente; si esta libre, los que
 * dejo el ultimo que estuvo ahi (al egresar o al cambiarse de cama), sin uso.
 */
export function equiposDeLaCama(cama: string, episodios: readonly Episodio[], eventos: readonly EventoClinico[]): readonly EquipoEnSala[] {
  const ocupada = episodios.find((e) => e.activo && e.cama === cama);
  if (ocupada) return ocupada.equipos;
  const candidatos: { en: string; equipos: readonly EquipoEnSala[] }[] = [];
  for (const e of episodios) {
    if (e.cama === cama && !e.activo) candidatos.push({ en: e.egreso?.en ?? e.ingresadoEn ?? "", equipos: e.equipos });
  }
  for (const ev of eventos) {
    if (ev.tipo === "TRASLADO_CAMA" && ev.desde === cama && ev.equiposDejados) candidatos.push({ en: ev.registradoEn, equipos: ev.equiposDejados });
  }
  candidatos.sort((a, b) => a.en.localeCompare(b.en));
  return sinUso(candidatos.at(-1)?.equipos ?? []);
}

/**
 * Al cambiar de cama el paciente toma los equipos de la cama nueva; los suyos quedan en la que
 * deja. Lo que estaba en uso pasa a un equipo del mismo tipo de la cama nueva. Si de la cama
 * nueva no se sabe nada, se asume que sus equipos van con el.
 */
export function equiposDelTraslado(actuales: readonly EquipoEnSala[], deLaCamaNueva: readonly EquipoEnSala[]): { equiposDejados: readonly EquipoEnSala[]; equiposNuevos: readonly EquipoEnSala[] } {
  if (deLaCamaNueva.length === 0) return { equiposDejados: [], equiposNuevos: actuales };
  const enUso = equipoEnUso(actuales);
  const reemplazo = enUso ? deLaCamaNueva.find((e) => e.tipo === enUso.tipo) : undefined;
  return { equiposDejados: sinUso(actuales), equiposNuevos: reemplazo ? ponerEnUso(deLaCamaNueva, reemplazo) : deLaCamaNueva };
}
