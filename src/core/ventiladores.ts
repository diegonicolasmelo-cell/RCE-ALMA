/**
 * Inventario de ventiladores de la unidad: donde esta cada equipo.
 *
 * Es independiente del paciente: un ventilador esta en una CAMA o en una ZONA
 * (pasillo, bodega, mantencion o fuera de la unidad). Nada de esto lleva datos de
 * pacientes, asi que viaja a la nube tal cual.
 *
 * La fuente de verdad es el REGISTRO DE MOVIMIENTOS, de solo agregar: cada vez que
 * un equipo cambia de lugar queda una fila con quien y cuando. El estado actual de
 * un ventilador es su ultimo movimiento ("manda la ultima edicion"), de modo que
 * dos celulares que anotan lo mismo convergen sin duplicar nada.
 */

import type { EquipoEnSala } from "./tipos";

// ---------------------------------------------------------------------------
// Catalogo
// ---------------------------------------------------------------------------

export type ModeloVentilador = "PB840" | "PB980" | "SERVO_U" | "AVEA" | "VELA" | "MEKICS_EVO5" | "SAVINA300";

export interface DefModeloVentilador {
  readonly clave: ModeloVentilador;
  readonly etiqueta: string;
}

/** Los modelos que tiene la unidad. Cambiar la lista cambia lo que ofrece la app. */
export const MODELOS_VENTILADOR: readonly DefModeloVentilador[] = [
  { clave: "PB840", etiqueta: "PB840" },
  { clave: "PB980", etiqueta: "PB980" },
  { clave: "SERVO_U", etiqueta: "Servo U" },
  { clave: "AVEA", etiqueta: "Avea" },
  { clave: "VELA", etiqueta: "Vela" },
  { clave: "MEKICS_EVO5", etiqueta: "Mekics Evo 5" },
  { clave: "SAVINA300", etiqueta: "Savina 300" }
];

export type ZonaVentilador = "PASILLO" | "BODEGA" | "MANTENCION" | "FUERA";

export const ZONAS_VENTILADOR: readonly { readonly clave: ZonaVentilador; readonly etiqueta: string }[] = [
  { clave: "PASILLO", etiqueta: "Pasillo" },
  { clave: "BODEGA", etiqueta: "Bodega, al fondo" },
  { clave: "MANTENCION", etiqueta: "Mantención" },
  { clave: "FUERA", etiqueta: "Fuera de la unidad" }
];

/** Las 18 camas de la unidad. */
export const CAMAS_UNIDAD: readonly string[] = Array.from({ length: 18 }, (_, i) => String(i + 1));

export type UbicacionVentilador =
  | { readonly tipo: "CAMA"; readonly cama: string }
  | { readonly tipo: "ZONA"; readonly zona: ZonaVentilador };

/** Prestamo a otro servicio. Las fechas son dias calendario: "AAAA-MM-DD". */
export interface PrestamoVentilador {
  readonly servicio: string;
  readonly salida: string;
  readonly retorno: string;
}

/** Un cambio de lugar. Solo se agrega, nunca se edita ni se borra. */
export interface MovimientoVentilador {
  readonly id: string;
  readonly ventiladorId: string;
  readonly modelo: ModeloVentilador;
  readonly numero: number;
  readonly hasta: UbicacionVentilador;
  /** Nota libre (solo en mantencion). Nunca nombres de pacientes. */
  readonly nota: string;
  /** Solo cuando `hasta` es "fuera de la unidad". */
  readonly prestamo: PrestamoVentilador | null;
  readonly registradoEn: string;
  /** El RUT del PROFESIONAL que lo movio (trazabilidad). */
  readonly rutAutor: string;
}

/** Estado actual de un equipo: lo que dice su ultimo movimiento. */
export interface Ventilador {
  readonly id: string;
  readonly modelo: ModeloVentilador;
  readonly numero: number;
  readonly etiqueta: string;
  readonly ubicacion: UbicacionVentilador;
  readonly nota: string;
  readonly prestamo: PrestamoVentilador | null;
  readonly desde: string;
  readonly rutAutor: string;
}

export const LARGO_MAX_NOTA = 200;
export const LARGO_MAX_SERVICIO = 60;

// ---------------------------------------------------------------------------
// Nombres e identidad
// ---------------------------------------------------------------------------

const defDe = (m: ModeloVentilador): DefModeloVentilador | undefined => MODELOS_VENTILADOR.find((d) => d.clave === m);

export const esModeloVentilador = (x: unknown): x is ModeloVentilador => MODELOS_VENTILADOR.some((d) => d.clave === x);
const esZona = (x: unknown): x is ZonaVentilador => ZONAS_VENTILADOR.some((z) => z.clave === x);

/** "PB840 1", "Servo U 2": el numero asocia el nombre a un equipo concreto. */
export function etiquetaVentilador(modelo: ModeloVentilador, numero: number): string {
  return `${defDe(modelo)?.etiqueta ?? modelo} ${numero}`;
}

/** Mismo modelo y numero => mismo id, en cualquier celular. Por eso no se duplican. */
export const idVentilador = (modelo: ModeloVentilador, numero: number): string => `${modelo}-${numero}`;

export const etiquetaZona = (z: ZonaVentilador): string => ZONAS_VENTILADOR.find((x) => x.clave === z)?.etiqueta ?? z;

export function etiquetaUbicacion(u: UbicacionVentilador): string {
  return u.tipo === "CAMA" ? `cama ${u.cama}` : etiquetaZona(u.zona).toLowerCase();
}

/** "a la cama 5", "al pasillo", "a mantención": para decir hacia donde se movio. */
export function haciaUbicacion(u: UbicacionVentilador): string {
  if (u.tipo === "CAMA") return `a la cama ${u.cama}`;
  return { PASILLO: "al pasillo", BODEGA: "a la bodega", MANTENCION: "a mantención", FUERA: "a fuera de la unidad" }[u.zona];
}

/** "la cama 5", "el pasillo", "mantención": para decir donde quedo. */
export function enUbicacion(u: UbicacionVentilador): string {
  if (u.tipo === "CAMA") return `la cama ${u.cama}`;
  return { PASILLO: "el pasillo", BODEGA: "la bodega", MANTENCION: "mantención", FUERA: "fuera de la unidad" }[u.zona];
}

export function ubicacionesIguales(a: UbicacionVentilador, b: UbicacionVentilador): boolean {
  if (a.tipo === "CAMA" && b.tipo === "CAMA") return a.cama === b.cama;
  if (a.tipo === "ZONA" && b.tipo === "ZONA") return a.zona === b.zona;
  return false;
}

export const enCama = (cama: string): UbicacionVentilador => ({ tipo: "CAMA", cama });
export const enZona = (zona: ZonaVentilador): UbicacionVentilador => ({ tipo: "ZONA", zona });

const esUbicacionValida = (u: UbicacionVentilador): boolean =>
  u.tipo === "CAMA" ? CAMAS_UNIDAD.includes(u.cama) : esZona(u.zona);

// ---------------------------------------------------------------------------
// Estado derivado
// ---------------------------------------------------------------------------

/** Del registro de movimientos al inventario actual. Si hay empate de hora, desempata el id. */
export function derivarInventario(movs: readonly MovimientoVentilador[]): readonly Ventilador[] {
  const ultimo = new Map<string, MovimientoVentilador>();
  for (const m of movs) {
    const actual = ultimo.get(m.ventiladorId);
    if (!actual || m.registradoEn > actual.registradoEn || (m.registradoEn === actual.registradoEn && m.id > actual.id)) {
      ultimo.set(m.ventiladorId, m);
    }
  }
  return [...ultimo.values()]
    .map((m): Ventilador => ({
      id: m.ventiladorId,
      modelo: m.modelo,
      numero: m.numero,
      etiqueta: etiquetaVentilador(m.modelo, m.numero),
      ubicacion: m.hasta,
      nota: m.nota,
      prestamo: m.prestamo,
      desde: m.registradoEn,
      rutAutor: m.rutAutor
    }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
}

export function ventiladorEnCama(inv: readonly Ventilador[], cama: string): Ventilador | null {
  return inv.find((v) => v.ubicacion.tipo === "CAMA" && v.ubicacion.cama === cama) ?? null;
}

export function ventiladoresEnZona(inv: readonly Ventilador[], zona: ZonaVentilador): readonly Ventilador[] {
  return inv.filter((v) => v.ubicacion.tipo === "ZONA" && v.ubicacion.zona === zona);
}

/** Camas con ventilador, para la tarjeta de la cama. */
export function ventiladorPorCama(inv: readonly Ventilador[]): ReadonlyMap<string, Ventilador> {
  const m = new Map<string, Ventilador>();
  for (const v of inv) if (v.ubicacion.tipo === "CAMA") m.set(v.ubicacion.cama, v);
  return m;
}

/** "UCI-05" -> "5". Es la cama del inventario; la del episodio trae prefijo y ceros. */
export function camaDeEpisodio(cama: string): string {
  const n = /(\d+)\s*$/.exec(cama);
  return n ? String(Number(n[1])) : cama;
}

/**
 * Los equipos de un episodio con el ventilador del inventario por encima: si la cama
 * tiene uno registrado, ese es el ventilador en uso (el que lleva la nota para ALMA);
 * los accesorios y los de VMNI o alto flujo se conservan.
 */
export function equiposEfectivos(equipos: readonly EquipoEnSala[], ventilador: Ventilador | null): readonly EquipoEnSala[] {
  if (!ventilador) return equipos;
  const sinVentilador = equipos.filter((e) => e.tipo !== "VENTILADOR");
  const delInventario: EquipoEnSala = {
    tipo: "VENTILADOR",
    modelo: defDe(ventilador.modelo)?.etiqueta ?? ventilador.modelo,
    numero: ventilador.numero,
    enUso: true
  };
  return [...sinVentilador.map((e) => (e.tipo === "VMNI" || e.tipo === "ALTO_FLUJO" ? { ...e, enUso: false } : e)), delInventario];
}

// ---------------------------------------------------------------------------
// Prestamos: el aviso visual
// ---------------------------------------------------------------------------

export type NivelPrestamo = "OK" | "HOY" | "ATRASADO";

export interface EstadoPrestamo {
  readonly nivel: NivelPrestamo;
  /** Dias hasta el retorno; negativo si ya paso. */
  readonly dias: number;
  readonly texto: string;
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaNumero(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}

export function diaIso(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Vuelve en 3 d" (verde), "Vuelve hoy" (amarillo), "Atrasado 2 d" (rojo). */
export function estadoPrestamo(p: PrestamoVentilador, hoy: Date): EstadoPrestamo {
  const dias = diaNumero(p.retorno) - diaNumero(diaIso(hoy));
  if (dias < 0) return { nivel: "ATRASADO", dias, texto: `Atrasado ${-dias} d` };
  if (dias === 0) return { nivel: "HOY", dias, texto: "Vuelve hoy" };
  return { nivel: "OK", dias, texto: `Vuelve en ${dias} d` };
}

/** "07-11" para mostrar una fecha corta. */
export function fechaDiaMes(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
}

export function hayPrestamosAtrasados(inv: readonly Ventilador[], hoy: Date): boolean {
  return inv.some((v) => v.ubicacion.tipo === "ZONA" && v.ubicacion.zona === "FUERA" && v.prestamo !== null && estadoPrestamo(v.prestamo, hoy).nivel === "ATRASADO");
}

// ---------------------------------------------------------------------------
// Mover
// ---------------------------------------------------------------------------

export type ErrorMovimiento =
  | "NO_EXISTE"
  | "YA_ESTA_AHI"
  | "UBICACION_INVALIDA"
  | "CAMA_OCUPADA"
  | "FALTA_SERVICIO"
  | "FECHA_INVALIDA"
  | "RETORNO_ANTES_DE_SALIDA"
  | "NOTA_MUY_LARGA";

export const MENSAJE_ERROR_MOVIMIENTO: Readonly<Record<ErrorMovimiento, string>> = {
  NO_EXISTE: "Ese ventilador no está en el inventario.",
  YA_ESTA_AHI: "Ya estaba ahí.",
  UBICACION_INVALIDA: "Ese lugar no existe.",
  CAMA_OCUPADA: "La cama ya tiene un ventilador. Muévelo primero.",
  FALTA_SERVICIO: "Escribe qué servicio lo recibe.",
  FECHA_INVALIDA: "Completa las fechas de salida y de retorno.",
  RETORNO_ANTES_DE_SALIDA: "El retorno no puede ser antes de la salida.",
  NOTA_MUY_LARGA: `La nota admite hasta ${LARGO_MAX_NOTA} caracteres.`
};

export interface DatosDestino {
  readonly nota?: string;
  readonly prestamo?: PrestamoVentilador;
}

export type ResultadoMovimiento =
  | { readonly ok: true; readonly movimientos: readonly MovimientoVentilador[]; readonly resumen: string }
  | { readonly ok: false; readonly error: ErrorMovimiento; readonly mensaje: string };

const falla = (error: ErrorMovimiento): ResultadoMovimiento => ({ ok: false, error, mensaje: MENSAJE_ERROR_MOVIMIENTO[error] });

/** Valida los datos que exige cada destino y devuelve lo que se guarda (nota y prestamo). */
function datosDelDestino(
  destino: UbicacionVentilador,
  datos: DatosDestino
): { readonly nota: string; readonly prestamo: PrestamoVentilador | null } | ErrorMovimiento {
  if (destino.tipo === "ZONA" && destino.zona === "MANTENCION") {
    const nota = (datos.nota ?? "").trim();
    return nota.length > LARGO_MAX_NOTA ? "NOTA_MUY_LARGA" : { nota, prestamo: null };
  }
  if (destino.tipo === "ZONA" && destino.zona === "FUERA") {
    const p = datos.prestamo;
    const servicio = (p?.servicio ?? "").trim();
    if (!servicio) return "FALTA_SERVICIO";
    if (!p || !ISO_DIA.test(p.salida) || !ISO_DIA.test(p.retorno)) return "FECHA_INVALIDA";
    if (p.retorno < p.salida) return "RETORNO_ANTES_DE_SALIDA";
    return { nota: "", prestamo: { servicio: servicio.slice(0, LARGO_MAX_SERVICIO), salida: p.salida, retorno: p.retorno } };
  }
  return { nota: "", prestamo: null };
}

const exigeDatos = (u: UbicacionVentilador): boolean => u.tipo === "ZONA" && (u.zona === "MANTENCION" || u.zona === "FUERA");

export interface ContextoMovimiento {
  readonly rutAutor: string;
  readonly ahora: Date;
  /** Genera el id de cada movimiento (inyectable para probar). */
  readonly nuevoId: () => string;
}

/**
 * Decide un movimiento. Si la cama de destino ya tiene un ventilador, se
 * INTERCAMBIAN (el otro se va al lugar de origen), salvo que el origen sea
 * mantencion o prestamo: ahi hay que mover primero el que ocupa la cama.
 */
export function moverVentilador(
  inv: readonly Ventilador[],
  ventiladorId: string,
  destino: UbicacionVentilador,
  datos: DatosDestino,
  ctx: ContextoMovimiento
): ResultadoMovimiento {
  const v = inv.find((x) => x.id === ventiladorId);
  if (!v) return falla("NO_EXISTE");
  if (!esUbicacionValida(destino)) return falla("UBICACION_INVALIDA");
  if (ubicacionesIguales(v.ubicacion, destino)) return falla("YA_ESTA_AHI");

  const propios = datosDelDestino(destino, datos);
  if (typeof propios === "string") return falla(propios);

  const registradoEn = ctx.ahora.toISOString();
  const mov = (x: Ventilador, hasta: UbicacionVentilador, nota: string, prestamo: PrestamoVentilador | null): MovimientoVentilador => ({
    id: ctx.nuevoId(),
    ventiladorId: x.id,
    modelo: x.modelo,
    numero: x.numero,
    hasta,
    nota,
    prestamo,
    registradoEn,
    rutAutor: ctx.rutAutor
  });

  const movimientos: MovimientoVentilador[] = [mov(v, destino, propios.nota, propios.prestamo)];
  let resumen = `${v.etiqueta} pasó ${haciaUbicacion(destino)}.`;

  if (destino.tipo === "CAMA") {
    const ocupante = ventiladorEnCama(inv, destino.cama);
    if (ocupante) {
      if (exigeDatos(v.ubicacion)) return falla("CAMA_OCUPADA");
      movimientos.push(mov(ocupante, v.ubicacion, "", null));
      resumen += ` ${ocupante.etiqueta} quedó en ${enUbicacion(v.ubicacion)}.`;
    }
  }
  return { ok: true, movimientos, resumen };
}

/** Un equipo nuevo en el inventario. Entra a la bodega salvo que se diga otra cosa. */
export function altaVentilador(
  inv: readonly Ventilador[],
  modelo: ModeloVentilador,
  numero: number,
  destino: UbicacionVentilador,
  ctx: ContextoMovimiento
): ResultadoMovimiento {
  if (!esModeloVentilador(modelo) || !Number.isInteger(numero) || numero < 1) return falla("NO_EXISTE");
  if (!esUbicacionValida(destino) || exigeDatos(destino)) return falla("UBICACION_INVALIDA");
  const id = idVentilador(modelo, numero);
  if (inv.some((v) => v.id === id)) return falla("YA_ESTA_AHI");
  if (destino.tipo === "CAMA" && ventiladorEnCama(inv, destino.cama)) return falla("CAMA_OCUPADA");
  return {
    ok: true,
    movimientos: [
      {
        id: ctx.nuevoId(),
        ventiladorId: id,
        modelo,
        numero,
        hasta: destino,
        nota: "",
        prestamo: null,
        registradoEn: ctx.ahora.toISOString(),
        rutAutor: ctx.rutAutor
      }
    ],
    resumen: `${etiquetaVentilador(modelo, numero)} se agregó en ${enUbicacion(destino)}.`
  };
}

// ---------------------------------------------------------------------------
// Ventanas del tablero (pantallas fijas, sin scroll)
// ---------------------------------------------------------------------------

export interface VentanaVentiladores {
  readonly clave: string;
  readonly titulo: string;
  readonly camas: readonly string[];
  readonly zonas: readonly ZonaVentilador[];
}

const rango = (a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

/** Camas 1 a 4 en columna, el resto en pares (5-6, 7-8, ...). */
export const VENTANAS_VENTILADORES: readonly VentanaVentiladores[] = [
  { clave: "c1-6", titulo: "1–6", camas: rango(1, 6), zonas: [] },
  { clave: "c7-12", titulo: "7–12", camas: rango(7, 12), zonas: [] },
  { clave: "c13-18", titulo: "13–18", camas: rango(13, 18), zonas: [] },
  { clave: "pasillo-bodega", titulo: "Pasillo y bodega", camas: [], zonas: ["PASILLO", "BODEGA"] },
  { clave: "mantencion-prestamo", titulo: "Mantención y préstamo", camas: [], zonas: ["MANTENCION", "FUERA"] }
];

// ---------------------------------------------------------------------------
// Nube
// ---------------------------------------------------------------------------

/** Allowlist: lo que sale a la hoja. No hay ningun dato de paciente en este registro. */
export function serializarMovimientoParaNube(m: MovimientoVentilador): Record<string, unknown> {
  return {
    id: m.id,
    ventiladorId: m.ventiladorId,
    modelo: m.modelo,
    numero: m.numero,
    hasta: m.hasta.tipo === "CAMA" ? { tipo: "CAMA", cama: m.hasta.cama } : { tipo: "ZONA", zona: m.hasta.zona },
    nota: m.nota,
    prestamo: m.prestamo === null ? null : { servicio: m.prestamo.servicio, salida: m.prestamo.salida, retorno: m.prestamo.retorno },
    registradoEn: m.registradoEn,
    rutAutor: m.rutAutor
  };
}

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const esTxt = (x: unknown): x is string => typeof x === "string" && x !== "";

/** La hoja se puede editar a mano: una fila corrupta se descarta, no tumba la lectura. */
export function movimientoVentiladorDeNube(x: unknown): MovimientoVentilador | null {
  if (!esObj(x) || !esTxt(x["id"]) || !esTxt(x["ventiladorId"]) || !esTxt(x["registradoEn"])) return null;
  const modelo = x["modelo"];
  const numero = x["numero"];
  if (!esModeloVentilador(modelo) || typeof numero !== "number" || !Number.isInteger(numero) || numero < 1) return null;
  const h = x["hasta"];
  if (!esObj(h)) return null;
  let hasta: UbicacionVentilador;
  if (h["tipo"] === "CAMA" && typeof h["cama"] === "string") hasta = enCama(h["cama"]);
  else if (h["tipo"] === "ZONA" && esZona(h["zona"])) hasta = enZona(h["zona"]);
  else return null;
  if (!esUbicacionValida(hasta)) return null;
  const p = x["prestamo"];
  const prestamo =
    esObj(p) && typeof p["servicio"] === "string" && typeof p["salida"] === "string" && typeof p["retorno"] === "string" && ISO_DIA.test(p["salida"]) && ISO_DIA.test(p["retorno"])
      ? { servicio: p["servicio"], salida: p["salida"], retorno: p["retorno"] }
      : null;
  return {
    id: x["id"],
    ventiladorId: idVentilador(modelo, numero),
    modelo,
    numero,
    hasta,
    nota: typeof x["nota"] === "string" ? x["nota"] : "",
    prestamo,
    registradoEn: x["registradoEn"],
    rutAutor: typeof x["rutAutor"] === "string" ? x["rutAutor"] : ""
  };
}
