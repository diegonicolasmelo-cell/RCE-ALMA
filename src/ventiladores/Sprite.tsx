import type { ModeloVentilador } from "@core/index";
import { rectsDe } from "./sprites";

/** Un ventilador en 8 bits. Decorativo: el nombre siempre va escrito al lado. */
export function SpriteVentilador({ modelo }: { readonly modelo: ModeloVentilador }) {
  return (
    <svg className="vt-sprite" viewBox="0 0 20 18" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {rectsDe(modelo).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />
      ))}
    </svg>
  );
}
