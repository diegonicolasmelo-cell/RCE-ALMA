/**
 * La marca de Kápta CSV junto al logo del hospital, sobre la franja azul marino de arriba, y el
 * paisaje de Coquimbo (el faro y la cruz) al pie de las pantallas de entrada.
 */
import { useEffect } from "react";
import bannerNoche from "./iconos/banner-noche.png?inline";

/** Azul marino de la franja de entrada. */
export const AZUL_MARINO = "#0b2c5a";
/** Fondo de la app de dia y de noche (el mismo de --bg). */
export const FONDO_DIA = "#eef1f4";
export const FONDO_NOCHE = "#0e1318";

/**
 * Color de las franjas del telefono (la de la hora y la bateria, y en Android la de los botones):
 * el de lo que se ve arriba de la pantalla, para que la franja se funda con la app.
 */
export function useColorBarras(color: string): void {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [color]);
}

/** Franja azul marino con la marca y el logo del hospital; «mini» es la versión baja. */
export function CabeceraMarca({ mini = false }: { mini?: boolean }) {
  return (
    <header className={`marca-cab${mini ? " mini" : ""}`}>
      <img src={bannerNoche} alt="Kápta CSV · Control de signos vitales · Hospital San Pablo de Coquimbo" />
      <svg className="ola" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 18 C 90 44, 210 0, 400 22 L400 40 L0 40 Z" className="ola-clara" />
        <path d="M0 28 C 120 46, 250 12, 400 30 L400 40 L0 40 Z" className="ola-fondo" />
      </svg>
    </header>
  );
}

/**
 * Siluetas de la region al pie de las pantallas de entrada: el Faro Monumental de La Serena (torre
 * cuadrada almenada con su linterna, sobre el fuerte con torreones) y la Cruz del Tercer Milenio
 * de Coquimbo (tres pilares, brazos anchos y patas abiertas, sobre el cerro).
 */
export function PaisajeCoquimbo() {
  return (
    <svg className="paisaje" viewBox="0 0 400 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path className="cerro-lejano" d="M0 96 C 50 84, 100 92, 160 86 C 220 80, 260 70, 300 66 C 340 62, 370 70, 400 74 L400 130 L0 130 Z" />
      {/* Faro Monumental de La Serena */}
      <g className="silueta">
        {/* fuerte con almenas y torreones */}
        <path d="M22 112 V98 h4 v-3 h4 v3 h4 v-3 h4 v3 h4 v-3 h4 v3 h28 v-3 h4 v3 h4 v-3 h4 v3 h4 v-3 h4 v3 h4 V112 Z" />
        <rect x="16" y="94" width="9" height="18" rx="2" />
        <path d="M16 94 a4.5 4.5 0 0 1 9 0 Z" />
        <rect x="95" y="94" width="9" height="18" rx="2" />
        <path d="M95 94 a4.5 4.5 0 0 1 9 0 Z" />
        {/* torre */}
        <rect x="52" y="40" width="16" height="58" />
        <path d="M49 40 V34 h3 v-2 h3 v2 h3 v-2 h4 v2 h3 v-2 h3 v2 h3 V40 Z" />
        {/* linterna y cupula */}
        <rect x="55" y="25" width="10" height="8" rx="1" />
        <path d="M54 25 a6 5 0 0 1 12 0 Z" />
        <rect x="59.3" y="16" width="1.4" height="5" />
      </g>
      {/* Cruz del Tercer Milenio */}
      <g className="silueta">
        {/* pilar central y los dos laterales */}
        <rect x="328" y="6" width="8" height="84" />
        <rect x="322" y="18" width="5" height="72" />
        <rect x="337" y="18" width="5" height="72" />
        {/* brazos */}
        <path d="M300 20 h64 v10 h-64 Z" />
        {/* patas abiertas y base */}
        <path d="M322 70 L304 104 h7 L326 78 Z" />
        <path d="M342 70 L360 104 h-7 L338 78 Z" />
        <path d="M312 92 h40 v14 h-40 Z" />
        <path d="M300 104 h64 l6 8 h-76 Z" />
      </g>
      <path className="cerro" d="M0 112 C 40 104, 90 106, 130 110 C 180 116, 230 104, 270 100 C 310 96, 350 100, 400 96 L400 130 L0 130 Z" />
    </svg>
  );
}
