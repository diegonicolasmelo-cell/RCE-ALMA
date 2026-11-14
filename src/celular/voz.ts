/**
 * Microfono del telefono para el dictado. Usa el reconocimiento de voz del navegador
 * (Web Speech API): en Android lo procesa Google y en iPhone Apple, fuera del celular. Por eso
 * el dictado nace apagado y cada persona lo activa. Kapta no graba audio ni guarda el texto.
 */

import { esAppsScript } from "../datos/gas";

interface ResultadoVoz {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [i: number]: { readonly transcript: string };
}
interface EventoResultado {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [i: number]: ResultadoVoz };
}
interface ReconocedorNavegador {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: ((e: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type ConstructorReconocedor = new () => ReconocedorNavegador;

function constructorReconocedor(): ConstructorReconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Hay microfono util: el navegador reconoce voz y no estamos dentro de Apps Script (que lo bloquea). */
export const vozDisponible = (): boolean => constructorReconocedor() !== null && !esAppsScript();

/** Por que no hay micrófono aqui, en palabras de la persona. */
export function motivoSinVoz(): string {
  if (constructorReconocedor() === null) return "Este navegador no reconoce voz: usa Chrome (Android) o Safari (iPhone)";
  if (esAppsScript()) return "No funciona en el enlace de Apps Script: úsalo desde la app instalada";
  return "No disponible aquí";
}

const CLAVE_AVISO = "kapta:dictado-aviso";
/** El aviso de privacidad se lee una vez por celular; después el interruptor activa al tiro. */
export function avisoVozLeido(): boolean {
  try { return globalThis.localStorage?.getItem(CLAVE_AVISO) === "1"; } catch { return false; }
}
export function marcarAvisoVozLeido(): void {
  try { globalThis.localStorage?.setItem(CLAVE_AVISO, "1"); } catch { /* vale solo para esta sesion */ }
}

export type ErrorVoz = "permiso" | "sin-red" | "sin-microfono" | "otro";

const MENSAJE_ERROR: Record<ErrorVoz, string> = {
  permiso: "El teléfono no dio permiso para usar el micrófono. Puedes darlo en los ajustes del navegador.",
  "sin-red": "El reconocimiento de voz necesita conexión a internet y ahora no la hay.",
  "sin-microfono": "No se encontró un micrófono disponible en este teléfono.",
  otro: "El reconocimiento de voz se detuvo por un error del teléfono."
};
export const mensajeErrorVoz = (e: ErrorVoz): string => MENSAJE_ERROR[e];

export interface SesionVoz {
  detener(): void;
  cancelar(): void;
}

/**
 * Escucha de corrido. Entrega el texto confirmado acumulado y lo que se esta oyendo ahora.
 * Algunos telefonos cortan solos tras un silencio: se reanuda hasta que la persona detenga.
 */
export function escuchar(manejo: { alTexto: (confirmado: string, enCurso: string) => void; alError: (e: ErrorVoz) => void; alTerminar: () => void }): SesionVoz | null {
  const C = constructorReconocedor();
  if (!C) return null;
  const r = new C();
  r.lang = "es-CL";
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  let confirmado = "";
  let activa = true;
  let fallo = false;
  r.onresult = (e) => {
    let enCurso = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const t = res[0]?.transcript ?? "";
      if (res.isFinal) confirmado = `${confirmado} ${t}`.trim();
      else enCurso += t;
    }
    manejo.alTexto(confirmado, enCurso.trim());
  };
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    fallo = true;
    activa = false;
    manejo.alError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "permiso" : e.error === "network" ? "sin-red" : e.error === "audio-capture" ? "sin-microfono" : "otro");
  };
  r.onend = () => {
    if (activa) {
      try {
        r.start();
        return;
      } catch {
        activa = false;
      }
    }
    if (!fallo) manejo.alTerminar();
  };
  try {
    r.start();
  } catch {
    return null;
  }
  return {
    detener: () => {
      activa = false;
      try { r.stop(); } catch { manejo.alTerminar(); }
    },
    cancelar: () => {
      activa = false;
      fallo = true;
      try { r.abort(); } catch { /* ya detenido */ }
    }
  };
}
