/**
 * Dibujos de los ventiladores en 8 bits: una grilla de 20 x 18 cuadros por modelo.
 * Son aproximaciones de la silueta de cada equipo (no copias fieles); se afinan con fotos.
 *
 * Cada forma es una lista de cajas: "b" dibuja contorno oscuro y relleno, "r" solo relleno.
 * `B` es el color del cuerpo del modelo y `A` su color de acento.
 */

import type { ModeloVentilador } from "@core/index";

type Caja = readonly [tipo: "b" | "r", x: number, y: number, ancho: number, alto: number, color: string];

export const PALETA_SPRITE: Readonly<Record<string, string>> = {
  K: "#1e2a26",
  S: "#2f3d38",
  G: "#7be39a",
  H: "#d5ffe0",
  D: "#e4e7e4",
  L: "#aeb6b2",
  W: "#5d6a64"
};

/** Cuerpo y acento de cada modelo. El Mekics y el Savina 300 son blancos; este ultimo con franja celeste. */
export const COLORES_MODELO: Readonly<Record<ModeloVentilador, readonly [cuerpo: string, acento: string]>> = {
  PB840: ["#9db7d6", "#5f84b3"],
  PB980: ["#6f95c4", "#3f6697"],
  SERVO_U: ["#c4b0dd", "#8467b0"],
  AVEA: ["#8fcdbd", "#4a9a85"],
  VELA: ["#f0c389", "#c98a2e"],
  MEKICS_EVO5: ["#f3f5f3", "#9fb0bb"],
  SAVINA300: ["#fbfbf9", "#a9d4ee"]
};

export const FORMAS: Readonly<Record<ModeloVentilador, readonly Caja[]>> = {
  PB840: [["b", 2, 1, 16, 7, "S"], ["r", 4, 2, 12, 5, "G"], ["r", 5, 4, 3, 1, "H"], ["r", 8, 3, 2, 1, "H"], ["r", 10, 4, 4, 1, "H"], ["b", 3, 8, 14, 4, "B"], ["r", 4, 9, 6, 1, "A"], ["r", 13, 9, 3, 2, "D"], ["r", 8, 12, 4, 2, "L"], ["b", 4, 14, 12, 2, "L"], ["r", 4, 16, 2, 2, "W"], ["r", 14, 16, 2, 2, "W"]],
  PB980: [["b", 3, 0, 14, 9, "S"], ["r", 4, 1, 12, 7, "G"], ["r", 5, 5, 3, 1, "H"], ["r", 8, 3, 2, 2, "H"], ["r", 10, 5, 5, 1, "H"], ["b", 17, 2, 2, 7, "L"], ["b", 3, 9, 14, 4, "B"], ["r", 5, 10, 3, 2, "A"], ["r", 10, 11, 5, 1, "A"], ["r", 8, 13, 4, 1, "L"], ["b", 2, 14, 16, 2, "L"], ["r", 3, 16, 2, 2, "W"], ["r", 15, 16, 2, 2, "W"]],
  SERVO_U: [["b", 2, 0, 16, 7, "S"], ["r", 4, 1, 12, 5, "G"], ["r", 4, 4, 3, 1, "H"], ["r", 7, 2, 2, 2, "H"], ["r", 9, 3, 5, 1, "H"], ["b", 5, 7, 10, 6, "B"], ["r", 8, 8, 4, 4, "D"], ["r", 9, 9, 2, 2, "A"], ["b", 15, 7, 3, 6, "L"], ["r", 8, 13, 4, 1, "L"], ["b", 3, 14, 14, 2, "L"], ["r", 4, 16, 2, 2, "W"], ["r", 14, 16, 2, 2, "W"]],
  AVEA: [["b", 6, 0, 8, 3, "L"], ["b", 1, 2, 18, 7, "S"], ["r", 3, 3, 11, 5, "G"], ["r", 4, 6, 3, 1, "H"], ["r", 7, 4, 2, 2, "H"], ["r", 9, 6, 4, 1, "H"], ["r", 15, 3, 2, 2, "D"], ["r", 15, 6, 2, 2, "D"], ["b", 1, 9, 18, 3, "B"], ["r", 3, 10, 2, 1, "D"], ["r", 6, 10, 2, 1, "D"], ["r", 9, 10, 2, 1, "D"], ["r", 15, 10, 3, 1, "A"], ["r", 9, 12, 2, 2, "L"], ["b", 3, 14, 14, 2, "L"], ["r", 3, 16, 2, 2, "W"], ["r", 15, 16, 2, 2, "W"]],
  VELA: [["b", 4, 1, 12, 7, "S"], ["r", 5, 2, 10, 5, "G"], ["r", 6, 5, 3, 1, "H"], ["r", 9, 3, 2, 2, "H"], ["r", 11, 5, 3, 1, "H"], ["b", 5, 8, 10, 4, "B"], ["r", 6, 9, 3, 2, "D"], ["r", 11, 9, 3, 1, "A"], ["r", 9, 12, 2, 3, "L"], ["r", 3, 15, 14, 1, "L"], ["r", 3, 16, 2, 2, "W"], ["r", 9, 16, 2, 2, "W"], ["r", 15, 16, 2, 2, "W"]],
  // Segun la foto del manual del MV2000 EVO5: pantalla grande sobre cuello delgado, gabinete con manilla y columna angosta.
  MEKICS_EVO5: [["b", 2, 0, 16, 7, "S"], ["r", 4, 2, 12, 3, "G"], ["r", 5, 3, 3, 1, "H"], ["r", 8, 2, 2, 2, "H"], ["r", 10, 3, 4, 1, "H"], ["r", 9, 7, 2, 1, "L"], ["b", 5, 8, 10, 5, "B"], ["r", 7, 9, 6, 1, "A"], ["r", 7, 11, 3, 1, "D"], ["b", 2, 9, 3, 3, "L"], ["r", 15, 10, 2, 1, "L"], ["b", 7, 13, 6, 3, "B"], ["r", 3, 16, 14, 1, "L"], ["r", 2, 16, 3, 2, "W"], ["r", 15, 16, 3, 2, "W"], ["r", 9, 16, 2, 2, "W"]],
  // Blanco, con una franja celeste pastel entre el monitor y las patas.
  SAVINA300: [["b", 7, 0, 6, 3, "L"], ["b", 2, 2, 16, 6, "S"], ["r", 3, 3, 14, 4, "G"], ["r", 4, 5, 3, 1, "H"], ["r", 7, 4, 2, 2, "H"], ["r", 9, 5, 5, 1, "H"], ["b", 2, 8, 16, 3, "A"], ["b", 3, 11, 14, 3, "B"], ["r", 13, 12, 3, 1, "D"], ["r", 9, 14, 2, 1, "L"], ["r", 3, 15, 14, 1, "L"], ["r", 3, 16, 2, 2, "W"], ["r", 9, 16, 2, 2, "W"], ["r", 15, 16, 2, 2, "W"]]
};

export interface RectSprite {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
}

/** Las cajas del modelo ya resueltas a rectangulos con color. */
export function rectsDe(modelo: ModeloVentilador): readonly RectSprite[] {
  const [cuerpo, acento] = COLORES_MODELO[modelo];
  const color = (k: string): string => (k === "B" ? cuerpo : k === "A" ? acento : PALETA_SPRITE[k] ?? "#000000");
  const salida: RectSprite[] = [];
  for (const [tipo, x, y, w, h, k] of FORMAS[modelo]) {
    if (tipo === "b") {
      salida.push({ x, y, w, h, color: PALETA_SPRITE["K"] ?? "#000000" });
      salida.push({ x: x + 1, y: y + 1, w: w - 2, h: h - 2, color: color(k) });
    } else {
      salida.push({ x, y, w, h, color: color(k) });
    }
  }
  return salida.filter((r) => r.w > 0 && r.h > 0);
}
