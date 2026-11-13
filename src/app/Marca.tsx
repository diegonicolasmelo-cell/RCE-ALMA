/**
 * La marca de Kápta CSV junto al logo del hospital, sobre la franja azul marino de arriba, y el
 * paisaje de Coquimbo (el faro y la cruz) al pie de las pantallas de entrada.
 */
import bannerNoche from "./iconos/banner-noche.png?inline";

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

/** Siluetas del faro y de la cruz sobre los cerros, en azul muy claro. */
export function PaisajeCoquimbo() {
  return (
    <svg className="paisaje" viewBox="0 0 400 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path className="cerro-lejano" d="M0 78 C 60 60, 110 70, 170 62 C 240 52, 300 66, 400 56 L400 110 L0 110 Z" />
      {/* Faro */}
      <g className="silueta">
        <rect x="48" y="40" width="14" height="40" rx="1" />
        <rect x="45" y="36" width="20" height="5" rx="1" />
        <rect x="49" y="26" width="12" height="11" rx="1" />
        <path d="M47 26 L55 18 L63 26 Z" />
        <rect x="42" y="78" width="26" height="6" rx="1" />
      </g>
      {/* Cruz */}
      <g className="silueta">
        <rect x="329" y="18" width="8" height="52" rx="1" />
        <rect x="316" y="30" width="34" height="7" rx="1" />
        <path d="M320 70 h26 l6 12 h-38 Z" />
      </g>
      <path className="cerro" d="M0 92 C 50 76, 90 80, 130 88 C 190 98, 250 78, 300 80 C 340 82, 370 74, 400 78 L400 110 L0 110 Z" />
    </svg>
  );
}
