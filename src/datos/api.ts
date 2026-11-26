import type { EquipoRce, HistoriaEntrega, ItemParaRce, PacienteRce } from "@core/index";

/** Un movimiento de equipo hacia el RCE. tipo: CAMA (con `detalle` = n° de cama), BODEGA, EQUIPOS, PRESTAMO, PASILLO. */
export interface MovimientoEquipo { readonly equipo: string; readonly tipo: string; readonly detalle?: string | number; readonly enUso?: boolean }
/**
 * Cliente de la API (Google Apps Script sobre Sheets).
 *
 * Dos canales con dos llaves: el clinico (APP_TOKEN, celulares y PC) y el de
 * identidad (STATION_TOKEN, solo PC). Ver backend/apps-script y docs/PLAN-MAESTRO.md.
 *
 * Apps Script no responde al preflight CORS (OPTIONS). Por eso los POST van con
 * `Content-Type: text/plain`, que el navegador trata como "solicitud simple".
 */

import { DOTACION_DEMO, buscarProfesional } from "@core/index";
import type { ReferenciaNube } from "@core/index";

export interface LoteSync {
  episodios: Record<string, unknown>[];
  controles: Record<string, unknown>[];
  eventos: Record<string, unknown>[];
  apk: Record<string, unknown>[];
  /** RCE by Kaptus: los mismos controles y eventos ya traducidos al idioma del RCE; el servidor los reenvia al tiro. */
  paraRce?: readonly ItemParaRce[];
}

export type RespuestaSync =
  | { readonly ok: true; readonly servidorEn: string; readonly rce?: { readonly estado: string } }
  | { readonly ok: false; readonly error: string; readonly llaves?: readonly string[] };

export interface DatosNube {
  readonly episodios: readonly unknown[];
  readonly controles: readonly unknown[];
  readonly eventos: readonly unknown[];
  readonly apk: readonly unknown[];
  readonly servidorEn: string;
  /** Cambia cuando se limpio todo en el servidor: hay que vaciar la copia local. */
  readonly epoca?: string;
  /** Episodios borrados uno a uno en el servidor: se quitan de la copia local. */
  readonly borrados?: readonly string[];
}

export type ResultadoLogin =
  | { readonly ok: true; readonly correo: string }
  | { readonly ok: false; readonly error: string };

export type Resultado<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };

export interface ClienteApi {
  /** Si no hay servidor (modo demostracion), los datos viven solo en el dispositivo. */
  readonly local: boolean;
  /** El profesional se identifica por su correo; la contrasena se compara en el servidor. */
  login(correo: string, pin: string): Promise<ResultadoLogin>;
  definirPin(correo: string, pinActual: string, pinNuevo: string): Promise<{ ok: boolean; error?: string }>;
  /** La dotacion de la hoja «usuarios» (correo, nombre, turno, rol), sin claves. */
  leerDotacion(): Promise<Resultado<{ dotacion: readonly unknown[] }>>;
  sincronizar(lote: LoteSync): Promise<RespuestaSync>;
  leer(desde: string | null): Promise<Resultado<{ datos: DatosNube }>>;
  /**
   * Referencias de episodio (identidad CIFRADA): solo con token de estacion. La nube
   * guarda un bloque ilegible por episodio; el descifrado ocurre en el navegador.
   */
  leerReferencias(): Promise<Resultado<{ referencias: readonly ReferenciaNube[] }>>;
  guardarReferencias(referencias: readonly ReferenciaNube[]): Promise<{ ok: boolean; error?: string }>;
  purgarReferencias(episodioIds: readonly string[]): Promise<{ ok: boolean; error?: string }>;
  /** Registra las huellas de las llaves que creo este PC (con el registro abierto en el editor). */
  registrarLlaves(huellas: HuellasLlaves): Promise<{ ok: boolean; error?: string }>;
  /**
   * Historias de la entrega de estas camas: el servidor de Kaptus se las pide al RCE en el momento
   * y no las guarda. El celular tampoco: viven solo en la pantalla abierta (Diego, 22-nov-2026).
   */
  leerHistorias(camas: readonly number[]): Promise<Resultado<{ historias: readonly HistoriaEntrega[]; estado?: string; pacientes?: readonly PacienteRce[] }>>;
  /** Mueve equipos en el RCE sin paciente de por medio: cama libre, bodega, equipos médicos, préstamo. */
  ubicarEquipos(correo: string, movimientos: readonly MovimientoEquipo[]): Promise<Resultado<{ movidos: number; avisos: readonly string[] }>>;
  /** Inventario de equipos del RCE (25-nov-2026): la sala en 8 bits elige de aquí. */
  leerInventario(): Promise<Resultado<{ equipos: readonly EquipoRce[]; estado?: string }>>;
  /** «Mis camas» del turno (25-nov-2026, Diego): las mismas quedan pintadas a su firma en el reparto del RCE. */
  informarMisCamas(correo: string, camas: readonly number[]): Promise<Resultado<{ firma: string; turno: string }>>;
  /** Historia clínica escrita o dictada en el celular (26-nov-2026): va al RCE y no se guarda aquí. */
  guardarHistoria(correo: string, cama: number, texto: string): Promise<Resultado<{ historia: HistoriaEntrega }>>;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export interface ConfigHttp {
  readonly url: string;
  readonly appToken: string;
  readonly stationToken: string | null;
  readonly timeoutMs?: number;
}

type Obj = Record<string, unknown>;

/**
 * Como llegan las peticiones al servidor. Por HTTP (la app servida desde otro sitio) o por
 * `google.script.run` (la app servida por el mismo Apps Script). Las reglas son las mismas.
 */
export interface Transporte {
  post(cuerpo: Obj): Promise<Obj>;
  get(params: Record<string, string>): Promise<Obj>;
}

export function crearApiHttp(cfg: ConfigHttp, fetchImpl: typeof fetch = fetch): ClienteApi {
  const timeoutMs = cfg.timeoutMs ?? 20_000;

  async function pedir(init: (signal: AbortSignal) => Promise<Response>): Promise<Obj> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await init(ctrl.signal);
      const texto = await res.text();
      try {
        return JSON.parse(texto) as Obj;
      } catch {
        // Llego una pagina (inicio de sesion de Google, «pagina no encontrada»…) en vez de datos:
        // hay red, pero la direccion no es la de la app o la implementacion no es publica.
        return { ok: false, error: "RESPUESTA_NO_ES_LA_APP" };
      }
    } catch {
      return { ok: false, error: "SIN_CONEXION" };
    } finally {
      clearTimeout(t);
    }
  }

  const post = (cuerpo: Obj): Promise<Obj> =>
    pedir((signal) =>
      fetchImpl(cfg.url, {
        signal,
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(cuerpo),
        redirect: "follow"
      })
    );

  const get = (params: Record<string, string>): Promise<Obj> =>
    pedir((signal) => fetchImpl(`${cfg.url}?${new URLSearchParams(params).toString()}`, { redirect: "follow", signal }));

  return crearApiRemota({ post, get }, cfg);
}

export interface HuellasLlaves {
  readonly huellaApp?: string;
  readonly huellaEstacion?: string;
}

/**
 * Registro de llaves: no lleva token, porque el primer PC aun no tiene ninguna. El servidor lo
 * acepta solo mientras el registro esta abierto desde el editor (15 minutos).
 */
export async function registrarLlavesPor(t: Transporte, huellas: HuellasLlaves): Promise<{ ok: boolean; error?: string }> {
  const r = await t.post({ accion: "registrarLlaves", ...huellas });
  return r["ok"] === true ? { ok: true } : { ok: false, error: typeof r["error"] === "string" ? (r["error"] as string) : "ERROR_DESCONOCIDO" };
}

/** El cliente de la API sobre cualquier transporte. Los tokens viajan en cada peticion. */
export function crearApiRemota(t: Transporte, cfg: { readonly appToken: string; readonly stationToken: string | null }): ClienteApi {
  const { post, get } = t;
  const errorDe = (r: Obj): string => (typeof r["error"] === "string" ? (r["error"] as string) : "ERROR_DESCONOCIDO");

  return {
    local: false,

    async login(correo, pin) {
      const r = await post({ token: cfg.appToken, accion: "login", correo, pin });
      return r["ok"] === true ? { ok: true, correo: String(r["correo"] ?? correo) } : { ok: false, error: errorDe(r) };
    },

    async definirPin(correo, pinActual, pinNuevo) {
      const r = await post({ token: cfg.appToken, accion: "definirPin", correo, pinActual, pinNuevo });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    },

    async leerDotacion() {
      const r = await get({ token: cfg.appToken, recurso: "dotacion" });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      // Un Codigo.gs anterior no conoce este recurso y responde otra cosa: no es una lista vacia.
      if (!Array.isArray(r["dotacion"])) return { ok: false, error: "SERVIDOR_SIN_DOTACION" };
      return { ok: true, dotacion: r["dotacion"] as unknown[] };
    },

    async registrarLlaves(huellas) {
      return registrarLlavesPor(t, huellas);
    },

    async sincronizar(lote) {
      const r = await post({ token: cfg.appToken, accion: "sincronizar", ...lote });
      if (r["ok"] === true) {
        const rce = r["rce"] as { estado?: unknown } | undefined;
        return { ok: true, servidorEn: String(r["servidorEn"] ?? ""), ...(rce && typeof rce.estado === "string" ? { rce: { estado: rce.estado } } : {}) };
      }
      const llaves = Array.isArray(r["llaves"]) ? (r["llaves"] as string[]) : undefined;
      return llaves ? { ok: false, error: errorDe(r), llaves } : { ok: false, error: errorDe(r) };
    },

    async leer(desde) {
      const r = await get({ token: cfg.appToken, ...(desde ? { desde } : {}) });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const arr = (k: string): readonly unknown[] => (Array.isArray(r[k]) ? (r[k] as unknown[]) : []);
      return {
        ok: true,
        datos: {
          episodios: arr("episodios"),
          controles: arr("controles"),
          eventos: arr("eventos"),
          apk: arr("apk"),
          servidorEn: String(r["servidorEn"] ?? ""),
          epoca: typeof r["epoca"] === "string" ? r["epoca"] : "",
          borrados: arr("borrados").map(String)
        }
      };
    },

    async leerHistorias(camas) {
      const r = await post({ token: cfg.appToken, accion: "historias", camas });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const lista = Array.isArray(r["historias"]) ? (r["historias"] as Record<string, unknown>[]) : [];
      const pacientes = Array.isArray(r["pacientes"])
        ? (r["pacientes"] as Record<string, unknown>[])
            .filter((p) => Number.isFinite(Number(p["cama"])) && typeof p["nombre"] === "string" && p["nombre"])
            .map((p): PacienteRce => ({ cama: Number(p["cama"]), nombre: String(p["nombre"]).slice(0, 80), edad: Number.isFinite(Number(p["edad"])) && p["edad"] !== "" && p["edad"] !== null ? Number(p["edad"]) : null }))
        : [];
      return {
        ok: true,
        ...(typeof r["estado"] === "string" ? { estado: r["estado"] } : {}),
        ...(pacientes.length ? { pacientes } : {}),
        historias: lista
          .filter((h) => typeof h["texto"] === "string" && Number.isFinite(Number(h["cama"])))
          .map((h) => ({
            cama: Number(h["cama"]), texto: String(h["texto"]).slice(0, 6000), firma: String(h["firma"] ?? ""), fecha: String(h["fecha"] ?? ""),
            pendientes: Array.isArray(h["pendientes"]) ? (h["pendientes"] as unknown[]).map(String).slice(0, 8) : [],
            plan: typeof h["plan"] === "string" ? h["plan"].slice(0, 400) : ""
          }))
      };
    },

    async ubicarEquipos(correo, movimientos) {
      const r = await post({ token: cfg.appToken, accion: "ubicarEquipos", correo, movimientos });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      return { ok: true, movidos: Number(r["movidos"]) || 0, avisos: Array.isArray(r["avisos"]) ? (r["avisos"] as unknown[]).map(String) : [] };
    },
    async guardarHistoria(correo, cama, texto) {
      const r = await post({ token: cfg.appToken, accion: "guardarHistoria", correo, cama, texto });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      return { ok: true, historia: { cama: Number(r["cama"]) || cama, texto: String(r["texto"] ?? ""), firma: String(r["firma"] ?? ""), fecha: String(r["fecha"] ?? "") } };
    },
    async informarMisCamas(correo, camas) {
      const r = await post({ token: cfg.appToken, accion: "misCamas", correo, camas: [...camas] });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      return { ok: true, firma: String(r["firma"] ?? ""), turno: String(r["turno"] ?? "") };
    },
    async leerInventario() {
      const r = await post({ token: cfg.appToken, accion: "inventario" });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const lista = Array.isArray(r["equipos"]) ? (r["equipos"] as Obj[]) : [];
      return {
        ok: true,
        ...(typeof r["estado"] === "string" ? { estado: r["estado"] } : {}),
        equipos: lista.filter((e) => typeof e["nombre"] === "string" && e["nombre"]).map((e): EquipoRce => ({
          nombre: String(e["nombre"]).slice(0, 40), categoria: String(e["categoria"] ?? "VM"), ubicacion: String(e["ubicacion"] ?? "BODEGA"),
          cama: Number.isFinite(Number(e["cama"])) && e["cama"] !== null ? Number(e["cama"]) : null, enUso: e["enUso"] === true, estado: String(e["estado"] ?? "")
        }))
      };
    },

    async leerReferencias() {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await get({ recurso: "referencia", token: cfg.stationToken });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const filas = Array.isArray(r["referencias"]) ? (r["referencias"] as Obj[]) : [];
      const referencias = filas
        .filter((f) => typeof f["episodioId"] === "string" && typeof f["dato"] === "string")
        .map((f): ReferenciaNube => ({
          episodioId: String(f["episodioId"]),
          registradoEn: typeof f["registradoEn"] === "string" ? f["registradoEn"] : "",
          dato: String(f["dato"])
        }));
      return { ok: true, referencias };
    },

    async guardarReferencias(referencias) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await post({ token: cfg.stationToken, accion: "guardarReferencia", referencias });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    },

    async purgarReferencias(episodioIds) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await post({ token: cfg.stationToken, accion: "purgarReferencia", episodioIds });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    }
  };
}

// ---------------------------------------------------------------------------
// Local (modo demostracion): sin servidor, todo queda en el dispositivo
// ---------------------------------------------------------------------------

/** PIN de la demostracion. En produccion cada profesional define el suyo. */
export const PIN_DEMO = "Kine";

export function crearApiLocal(): ClienteApi {
  const referencias = new Map<string, ReferenciaNube>();
  return {
    local: true,
    async login(correo, pin) {
      if (!buscarProfesional(correo)) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };
      return pin.trim().toLowerCase() === PIN_DEMO.toLowerCase() ? { ok: true, correo } : { ok: false, error: "PIN_INCORRECTO" };
    },
    async definirPin() {
      return { ok: true };
    },
    async leerDotacion() {
      return { ok: true, dotacion: DOTACION_DEMO };
    },
    async sincronizar() {
      // Sin servidor: dar por subido. Los datos ya estan en IndexedDB.
      return { ok: true, servidorEn: new Date().toISOString() };
    },
    async leer() {
      return { ok: true, datos: { episodios: [], controles: [], eventos: [], apk: [], servidorEn: new Date().toISOString() } };
    },
    async leerHistorias() {
      // Sin servidor no hay RCE al que pedirle historias.
      return { ok: true, historias: [] };
    },
    async ubicarEquipos(_correo, movimientos) {
      // Sin servidor (demo): se da por hecho; el inventario de ejemplo se ajusta en la pantalla.
      return { ok: true, movidos: movimientos.length, avisos: [] };
    },
    async guardarHistoria(_correo, cama, texto) {
      // Sin servidor (demo): se muestra como guardada, sin RCE detrás.
      return { ok: true, historia: { cama, texto: texto.trim(), firma: "DEMO", fecha: new Date().toISOString().slice(0, 10) } };
    },
    async informarMisCamas() {
      // Sin servidor (demo): no hay RCE al que avisar.
      return { ok: true, firma: "", turno: "" };
    },
    async leerInventario() {
      // Sin servidor (demo): un inventario de ejemplo, todo en bodega, para usar la sala igual.
      const b = (nombre: string, categoria: string): EquipoRce => ({ nombre, categoria, ubicacion: "BODEGA", cama: null, enUso: false, estado: "Operativo" });
      return { ok: true, equipos: [
        ...[1, 2, 3, 4].map((n) => b(`Savina ${n}`, "VM")), ...[1, 2, 3, 4, 5, 6].map((n) => b(`Mek ${n}`, "VM")), ...[1, 2, 3].map((n) => b(`Vela ${n}`, "VM")),
        b("Servo U", "VM"), b("PB 1", "VM"), b("PB 2", "VM"), b("V60 Nº1", "VNI"), b("V60 Nº2", "VNI"), b("Airvo 1", "CNAF"), b("Airvo 2", "CNAF"), b("MR850 1", "APOYO")
      ] };
    },
    async leerReferencias() {
      return { ok: true, referencias: [...referencias.values()] };
    },
    async guardarReferencias(lista) {
      for (const r of lista) referencias.set(r.episodioId, r);
      return { ok: true };
    },
    async purgarReferencias(ids) {
      for (const id of ids) referencias.delete(id);
      return { ok: true };
    },
    async registrarLlaves() {
      return { ok: true };
    }
  };
}

