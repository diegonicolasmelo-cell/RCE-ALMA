/**
 * Tendencia de un parametro a lo largo del turno.
 *
 * Linea de 2 px, punto final destacado, linea de referencia punteada y tooltip al
 * pasar el cursor. Un dato invalidado (p. ej. la ΔP con asincronia en modalidad
 * controlada) NO se dibuja: queda un hueco marcado "bloq.", porque un dato falso
 * es peor que un dato ausente.
 */

import { useState } from "react";

const W = 260;
const H = 56;
const P = 6;

interface Props {
  titulo: string;
  unidad: string;
  valores: readonly (number | null)[];
  etiquetas: readonly string[];
  referencia?: number;
  /** Posiciones donde el valor falta POR estar invalidado (no por falta de dato). */
  bloqueados?: readonly boolean[];
}

export function Tendencia({ titulo, unidad, valores, etiquetas, referencia, bloqueados }: Props) {
  const [cursor, setCursor] = useState<number | null>(null);
  const presentes = valores.filter((v): v is number => v !== null);
  const ultimo = presentes.at(-1);

  const dibujo = (() => {
    if (presentes.length === 0) return null;
    let lo = Math.min(...presentes, referencia ?? Infinity);
    let hi = Math.max(...presentes, referencia ?? -Infinity);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const margen = (hi - lo) * 0.15;
    lo -= margen;
    hi += margen;
    const y = (v: number): number => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
    const xs = valores.map((_, i) => (valores.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (valores.length - 1)));
    let d = "";
    let corte = true;
    valores.forEach((v, i) => {
      if (v === null) {
        corte = true;
        return;
      }
      d += `${corte ? "M" : "L"}${xs[i]!.toFixed(1)} ${y(v).toFixed(1)} `;
      corte = false;
    });
    const iUltimo = valores.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
    const aislados = valores
      .map((v, i) => (v !== null && (i === 0 || valores[i - 1] === null) && (i === valores.length - 1 || valores[i + 1] === null) && i !== iUltimo ? i : -1))
      .filter((i) => i >= 0);
    return { y, xs, d, iUltimo, aislados };
  })();

  const mover = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (!dibujo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let mejor = 0;
    let dist = Infinity;
    dibujo.xs.forEach((x, i) => {
      const dd = Math.abs(x - px);
      if (dd < dist) {
        dist = dd;
        mejor = i;
      }
    });
    setCursor(mejor);
  };

  return (
    <div className="spark">
      <div className="lbl">
        <span>{titulo}</span>
        <span>{unidad}</span>
      </div>
      <div className="val">{ultimo ?? "--"}</div>
      {dibujo === null ? (
        <div className="small muted" style={{ height: H, display: "flex", alignItems: "center" }}>Sin datos</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Tendencia de ${titulo}`} onPointerMove={mover} onPointerLeave={() => setCursor(null)}>
          <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" />
          {referencia !== undefined && (
            <line x1={P} x2={W - P} y1={dibujo.y(referencia)} y2={dibujo.y(referencia)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          )}
          <path d={dibujo.d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {valores.map((v, i) =>
            v === null && bloqueados?.[i] ? (
              <text key={i} x={dibujo.xs[i]} y={H / 2 + 3} textAnchor="middle" fontSize={11} fill="var(--crit-ink)" fontWeight={700}>
                bloq.
              </text>
            ) : null
          )}
          {dibujo.aislados.map((i) => (
            <circle key={i} cx={dibujo.xs[i]} cy={dibujo.y(valores[i]!)} r={3.5} fill="var(--accent)" stroke="var(--panel-2)" strokeWidth={1.5} />
          ))}
          {dibujo.iUltimo >= 0 && (
            <circle cx={dibujo.xs[dibujo.iUltimo]} cy={dibujo.y(valores[dibujo.iUltimo]!)} r={4.5} fill="var(--accent)" stroke="var(--panel-2)" strokeWidth={2} />
          )}
        </svg>
      )}
      {cursor !== null && dibujo && (
        <div className="tip mono" style={{ left: `${(dibujo.xs[cursor]! / W) * 100}%`, top: 24 }}>
          {etiquetas[cursor]} · {valores[cursor] === null ? (bloqueados?.[cursor] ? "bloqueado" : "sin dato") : `${valores[cursor]} ${unidad}`}
        </div>
      )}
    </div>
  );
}
