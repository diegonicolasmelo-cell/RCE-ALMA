import { useEffect, useState } from "react";
import { florecioElDesierto, logrosDe } from "@core/index";
import type { EstadoLogro, IdPersonaje } from "@core/index";
import { useServicios } from "../app/contexto";
import { guardarMeta, leerMeta } from "../datos/db";
import { DESIERTO_FLORIDO, FONDO_PAISAJE, SIMBOLOS_PAISAJE } from "./paisaje-dibujos";

/** Donde vive cada personaje en el paisaje (viewBox 1200 x 460), de la costa a la cordillera. */
const LUGAR: Readonly<Record<IdPersonaje, { x: number; y: number; w: number }>> = {
  pinguino: { x: 88, y: 196, w: 62 }, delfin: { x: 150, y: 330, w: 80 }, chungungo: { x: 300, y: 286, w: 66 },
  pelicano: { x: 230, y: 372, w: 68 }, olivillo: { x: 400, y: 228, w: 76 }, chuncho: { x: 486, y: 236, w: 50 },
  quisco: { x: 560, y: 300, w: 78 }, copiapoa: { x: 470, y: 350, w: 64 }, ananuca: { x: 660, y: 356, w: 56 },
  papayo: { x: 740, y: 286, w: 72 }, degu: { x: 820, y: 362, w: 64 }, cururo: { x: 900, y: 378, w: 60 },
  zorro: { x: 960, y: 300, w: 70 }, chinchilla: { x: 1040, y: 350, w: 64 }, guanaco: { x: 1080, y: 228, w: 76 }
};

/** Los secretos ya vistos en este celular: lo recien descubierto se anuncia una vez. */
const CLAVE_VISTOS = "paisajeVistos";

const fecha = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

/**
 * Mi paisaje (seccion 19 del plan, 22-nov-2026): la Region de Coquimbo con los personajes que
 * descubri. Cada uno se gana con un secreto; los que faltan son huecos con «?» y no dicen como se
 * ganan. Personal: se calcula con lo que yo registre, sin pacientes ni ranking.
 */
export function Paisaje({ autor }: { autor: string }) {
  const { repo, db } = useServicios();
  const [estados, setEstados] = useState<readonly EstadoLogro[] | null>(null);
  const [nuevos, setNuevos] = useState<readonly IdPersonaje[]>([]);
  const [elegido, setElegido] = useState<IdPersonaje | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await repo.registrosDe(autor);
      const l = logrosDe(autor, r.controles, r.eventos, r.apks);
      const vistos = new Set((await leerMeta<string[]>(db, `${CLAVE_VISTOS}:${autor}`)) ?? []);
      const recien = l.filter((x) => x.ganado && !vistos.has(x.id)).map((x) => x.id);
      setEstados(l);
      setNuevos(recien);
      if (recien.length) setElegido(recien[0]!);
      await guardarMeta(db, `${CLAVE_VISTOS}:${autor}`, l.filter((x) => x.ganado).map((x) => x.id));
    })();
  }, [repo, db, autor]);

  if (!estados) return <div className="cel-cuerpo"><p className="muted">Cargando tu paisaje…</p></div>;
  const ganados = estados.filter((e) => e.ganado).length;
  const florido = florecioElDesierto(estados);
  const sel = elegido ? estados.find((e) => e.id === elegido) : undefined;

  return (
    <div className="cel-cuerpo paisaje-cel" aria-label="Museo">
      <p className="small muted" style={{ margin: 0 }}>
        {ganados} de {estados.length} personajes de la Región de Coquimbo. Cada uno se gana con un secreto: nadie sabe cómo hasta que lo descubre. Toca uno para ver su historia.
      </p>
      {nuevos.length > 0 && (
        <div className="pk-nuevo" role="status">¡Descubriste {nuevos.length === 1 ? "un secreto" : `${nuevos.length} secretos`}! Ya está{nuevos.length === 1 ? "" : "n"} en tu paisaje.</div>
      )}
      <div className="pk-lienzo">
        <svg className="pk-svg" viewBox="0 0 1200 460" role="img" aria-label="Paisaje de la Región de Coquimbo">
          <defs dangerouslySetInnerHTML={{ __html: SIMBOLOS_PAISAJE }} />
          <g dangerouslySetInnerHTML={{ __html: FONDO_PAISAJE }} />
          {florido && <g dangerouslySetInnerHTML={{ __html: DESIERTO_FLORIDO }} />}
          {estados.map((e) => {
            const p = LUGAR[e.id];
            const cx = p.x + p.w / 2;
            const cy = p.y + p.w / 2;
            return (
              <g key={e.id} className={`pk-pj${e.ganado ? "" : " hueco"}${nuevos.includes(e.id) ? " llega" : ""}${elegido === e.id ? " sel" : ""}`} role="button" tabIndex={0}
                aria-label={e.ganado ? e.personaje : "Personaje por descubrir"}
                onClick={() => setElegido(e.id)} onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); setElegido(e.id); } }}
                style={{ transformOrigin: `${cx}px ${p.y + p.w}px` }}>
                {e.ganado ? (
                  <>
                    <ellipse cx={cx} cy={p.y + p.w - 4} rx={p.w / 2.6} ry={5} fill="#000" opacity={0.12} />
                    <use href={`#s-${e.id}`} x={p.x} y={p.y} width={p.w} height={p.w} />
                  </>
                ) : (
                  <>
                    <circle cx={cx} cy={cy} r={p.w / 2.6} fill="rgba(255,255,255,.15)" stroke="#fff" strokeWidth={2.5} strokeDasharray="6 6" />
                    <text x={cx} y={cy + 8} textAnchor="middle" className="pk-q">?</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="pk-ficha" aria-live="polite">
        {!sel ? (
          <p className="muted" style={{ margin: 0 }}>Toca un personaje del paisaje.</p>
        ) : sel.ganado ? (
          <>
            <svg viewBox="0 0 100 100" className="pk-mini" aria-hidden><use href={`#s-${sel.id}`} /></svg>
            <div>
              <span className="pk-tit">{sel.titulo} · {sel.personaje}</span>
              <p>{sel.secreto}</p>
              {sel.ganadoEn && <span className="small muted">Descubierto el {fecha(sel.ganadoEn)}</span>}
            </div>
          </>
        ) : (
          <div>
            <span className="pk-tit">Por descubrir</span>
            <p>Aquí vive un personaje que aún no encuentras. El secreto no se cuenta: se descubre trabajando.</p>
          </div>
        )}
      </div>
      {florido && <p className="pk-florido">Descubriste a todos: el desierto floreció en tu paisaje.</p>}
    </div>
  );
}
