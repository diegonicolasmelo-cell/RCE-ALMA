import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CAMAS_UNIDAD, turnoDe } from "@core/index";
import { cx } from "../app/util";
import type { DatosUnidad } from "./datos";
import { FILAS_HOJA, columnasMosaico, fichasEnVivo, inicioHoja, numeroCama, segmentosDeCamas } from "./enVivo";
import type { FichaEnVivo, FilaControl } from "./enVivo";

/** Columnas de la hoja por cama: los ultimos nueve controles, como el papel. */
const NCOL = 9;
const SEGMENTOS = segmentosDeCamas(CAMAS_UNIDAD);

const ddmm = (d: Date): string => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const hhmm = (d: Date): string => d.toTimeString().slice(0, 5);
const o = (x: string): string => x || "—";

/**
 * La letra del panel de Manuel (Manrope). Se pide solo al abrir esta vista; sin internet o si el
 * navegador la bloquea, queda la letra del sistema y nada mas cambia.
 */
function useLetraManrope(): void {
  useEffect(() => {
    const id = "kv-manrope";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
}

/**
 * Kaptus en vivo: los controles de toda la unidad para dejar en media pantalla al lado de ALMA.
 * Solo lee lo que la estacion ya tiene cargado; no pide clave ni hace otra lectura a la red.
 */
export function EnVivo({ datos, ahora }: { datos: DatosUnidad; ahora: Date }) {
  useLetraManrope();
  const fichas = useMemo(() => fichasEnVivo(datos.episodios, datos.controles, datos.eventos, ahora, datos.identidades), [datos, ahora]);
  const [vista, setVista] = useState<"general" | "hoja">("general");
  const [seg, setSeg] = useState(0);
  const [idx, setIdx] = useState(0);
  const i = Math.max(0, Math.min(idx, fichas.length - 1));

  const mover = (d: number): void => {
    if (vista === "general") setSeg((s) => Math.max(0, Math.min(SEGMENTOS.length - 1, s + d)));
    else setIdx(Math.max(0, Math.min(fichas.length - 1, i + d)));
  };
  const irCama = (cama: string): void => {
    const k = fichas.findIndex((f) => f.cama.toUpperCase() === cama);
    if (k < 0) return;
    setIdx(k);
    setVista("hoja");
  };
  const moverRef = useRef(mover);
  moverRef.current = mover;
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") moverRef.current(1);
      if (e.key === "ArrowLeft") moverRef.current(-1);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  const porCama = new Map(fichas.map((f) => [f.cama.toUpperCase(), f] as const));
  const enSeg = vista === "general" ? SEGMENTOS[seg] ?? [] : [];
  const actual = vista === "hoja" ? fichas[i] ?? null : null;
  const pendSeg = enSeg.reduce((a, c) => a + (porCama.get(c)?.pendientesAlma ?? 0), 0);
  const turno = turnoDe(ahora);
  const primero = numeroCama(enSeg[0] ?? "");
  const ultimo = numeroCama(enSeg.at(-1) ?? "");
  const anteriorOff = vista === "general" ? seg === 0 : i === 0;
  const siguienteOff = vista === "general" ? seg === SEGMENTOS.length - 1 : i >= fichas.length - 1;

  return (
    <section className="kv" aria-label="Kaptus en vivo">
      <div className="kv-bar">
        <h2 className="kv-titulo">Controles</h2>
        <span className="kv-sub">
          Hoja {ddmm(inicioHoja(ahora))} · {turno.tipo === "DIA" ? "Día" : "Noche"} · act. {hhmm(ahora)} · solo lectura
        </span>
        <span className="kv-esp" />
        <div className="kv-seg" role="group" aria-label="Vista">
          <button type="button" aria-pressed={vista === "general"} onClick={() => setVista("general")}>General</button>
          <button type="button" aria-pressed={vista === "hoja"} onClick={() => setVista("hoja")}>Hoja por cama</button>
        </div>
      </div>
      <div className="kv-camas">
        {CAMAS_UNIDAD.map((c) => {
          const f = porCama.get(c);
          const n = numeroCama(c);
          if (!f) return <button key={c} type="button" className="kv-cama libre" disabled title={`Cama ${n} libre`}>{n}</button>;
          const sel = enSeg.includes(c) || actual?.cama.toUpperCase() === c;
          return (
            <button key={c} type="button" className={cx("kv-cama", sel && "sel")} onClick={() => irCama(c)} title={`Cama ${n} · ${f.iniciales ? `${f.iniciales} · ` : ""}${f.paciente}${f.pendientesAlma ? ` · ${f.pendientesAlma} sin pasar a ALMA` : ""}`}>
              {n}
              {f.pendientesAlma > 0 && <span className="kv-pt">{f.pendientesAlma}</span>}
            </button>
          );
        })}
        <span className="kv-nav">
          <button type="button" className="kv-btn" disabled={anteriorOff} onClick={() => mover(-1)} title={vista === "general" ? "Camas anteriores" : "Cama anterior"} aria-label={vista === "general" ? "Camas anteriores" : "Cama anterior"}>←</button>
          <span className="kv-sub kv-pos">
            {vista === "general"
              ? `Camas ${primero}–${ultimo} · ${seg + 1} de ${SEGMENTOS.length}${pendSeg ? ` · ${pendSeg} sin ALMA` : ""}`
              : fichas.length ? `${i + 1} de ${fichas.length}` : ""}
          </span>
          <button type="button" className="kv-btn" disabled={siguienteOff} onClick={() => mover(1)} title={vista === "general" ? "Camas siguientes" : "Cama siguiente"} aria-label={vista === "general" ? "Camas siguientes" : "Cama siguiente"}>→</button>
        </span>
      </div>
      {vista === "general" ? (
        <Mosaico camas={enSeg} porCama={porCama} onAbrir={irCama} />
      ) : actual ? (
        <HojaCama key={actual.episodioId} f={actual} ahora={ahora} />
      ) : (
        <p className="kv-vacio">No hay pacientes en la unidad.</p>
      )}
    </section>
  );
}

function Mosaico({ camas, porCama, onAbrir }: { camas: readonly string[]; porCama: ReadonlyMap<string, FichaEnVivo>; onAbrir: (c: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(camas.length || 1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = (): void => setCols(columnasMosaico(el.clientWidth, el.clientHeight, camas.length));
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, [camas.length]);
  // El renglon DVA mide lo mismo en todas las fichas del segmento: los demas renglones quedan alineados.
  const lineasDva = Math.max(1, ...camas.map((c) => porCama.get(c)?.controles.at(-1)?.dva.length ?? 1));

  return (
    <div ref={ref} className="kv-mosaico" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, ["--kv-dva" as string]: lineasDva }}>
      {camas.map((c) => {
        const f = porCama.get(c);
        if (!f) return <div key={c} className="kv-tile libre"><span className="kv-n">{numeroCama(c)}</span><span>Libre</span></div>;
        return <Ficha key={c} f={f} onAbrir={() => onAbrir(c)} />;
      })}
    </div>
  );
}

function Ficha({ f, onAbrir }: { f: FichaEnVivo; onAbrir: () => void }) {
  const u: FilaControl | undefined = f.controles.at(-1);
  const r = (cls: string, lab: string, val: string, extra = "") => (
    <>
      <dt className={cls}>{lab}</dt>
      <dd className={cx(cls, extra)}><span className="v">{o(val)}</span></dd>
    </>
  );
  return (
    <button type="button" className={cx("kv-tile", u?.satBaja && "alerta")} onClick={onAbrir} title={`Cama ${f.numero} · ${f.iniciales ? `${f.iniciales} · ` : ""}${f.paciente} · abrir la hoja`}>
      <div className="kv-t-h"><span className="kv-n">{f.numero}</span><span className="kv-pac">{f.iniciales ?? f.paciente}</span>{f.iniciales && <span className="kv-sx">{f.paciente}</span>}</div>
      <div className="kv-t-s"><span className={cx("kv-pill", u?.soporte === "VNI" ? "vni" : u?.soporte === "VMI" ? "vmi" : "o2")}>{u ? (u.soporte === "VNI" && !u.modo.startsWith("VNI") ? `VNI ${u.modo}` : u.modo) : "Sin controles"}</span></div>
      <div className="kv-va">{f.viaAerea}</div>
      <dl className="kv-lis">
        {r("vmx", "VM", f.vm)}
        {r("h", "FC", u?.fc ?? "")}
        {r("h", "PA", u?.pa ?? "")}
        {r("h", "PAM", u?.pam ?? "")}
        <dt className="h">DVA</dt>
        <dd className="h dv">{u?.dva.length ? <span className="v">{u.dva.map((d) => <span key={d}>{d}<br /></span>)}</span> : <span className="v">—</span>}</dd>
        {r("ne", "GCS", u?.gcs ?? "")}
        {r("ne", "SAS/E", u?.sasE ?? "")}
        {r("o", "PEEP", u?.peep ?? "")}
        {r("o", "FiO₂", u?.fio2 ?? "")}
        {r("o", "SAT", u?.sat ?? "", u?.satBaja ? "fuera" : "")}
        {r("m", "VT", u?.vt ?? "")}
        {r("m", "FR", u?.fr ?? "")}
        {r("m", "PP", u?.pp ?? "")}
        {r("m", "DP", u?.dp ?? "")}
      </dl>
      <div className="kv-t-pie">
        <span className={cx("kv-hora", f.ultimoViejo && "vieja")} title={f.deEstaHoja ? "Último control" : "Sin controles en esta hoja: el último anterior"}>{u?.hora ?? "—"}</span>
        {f.pendientesAlma > 0
          ? <span className="kv-pill pend" title={`${f.pendientesAlma} sin pasar a ALMA`}>{f.pendientesAlma}<span className="w"> ALMA</span></span>
          : <span className="kv-pill ok" title={f.deEstaHoja ? "Todo pasado a ALMA" : "Sin controles en esta hoja"}>✓</span>}
      </div>
    </button>
  );
}

function HojaCama({ f, ahora }: { f: FichaEnVivo; ahora: Date }) {
  const desde = Math.max(0, f.controles.length - NCOL);
  const cs = f.controles.slice(desde);
  const [sel, setSel] = useState<number>(cs.length - 1);
  const c = cs[sel] ?? cs.at(-1) ?? null;
  const cols = Array.from({ length: NCOL }, (_, j) => cs[j] ?? null);
  const turno = turnoDe(ahora);
  const grupos = ["MONITORIZACIÓN", "TERAPIA VENTILATORIA"] as const;
  return (
    <div className="kv-hoja">
      <div className="kv-banda">
        <div><span>CAMA</span><b>{f.numero}</b></div>
        <div><span>EDAD</span><b>{f.edad}</b></div>
        <div className="pac"><span>PACIENTE</span><b>{f.iniciales ? `${f.iniciales} · ${f.paciente}` : f.paciente}</b></div>
        <div><span>INGRESO</span><b>{f.ingreso}</b></div>
        <div><span>DÍAS</span><b>{f.diasUci ?? "—"}</b></div>
        <div><span>HOJA</span><b>{ddmm(inicioHoja(ahora))} · {turno.tipo === "DIA" ? "Día" : "Noche"}</b></div>
      </div>
      <div className="kv-dx"><b>FASE CLÍNICA:</b><span className="t">{f.fase}</span><span className="kv-va-h">{f.viaAerea}{f.vm ? ` · VM ${f.vm}` : ""}{f.reintubaciones ? ` · ${f.reintubaciones} reint.` : ""}</span></div>
      <div className="kv-gw">
        <table className="kv-gr">
          <colgroup><col className="cs" /><col className="cl" />{cols.map((_, j) => <col key={j} />)}</colgroup>
          <thead>
            <tr>
              <th />
              <th className="lab">HORA</th>
              {cols.map((x, j) => (
                <th key={j}>
                  {x ? (
                    <button type="button" className={cx("kv-hb", x.enAlma ? "hecho" : "pend")} aria-pressed={j === sel} onClick={() => setSel(j)} title={x.enAlma ? "Pasado a ALMA" : "Sin pasar a ALMA"}>
                      {x.hora}<small>{x.enAlma ? "ALMA ✓" : f.deEstaHoja ? "pendiente" : "hoja anterior"}</small>
                    </button>
                  ) : <span className="kv-hb vacia">&nbsp;<small>&nbsp;</small></span>}
                </th>
              ))}
            </tr>
          </thead>
          {grupos.map((g) => {
            const filas = FILAS_HOJA.filter((x) => x.grupo === g);
            return (
              <tbody key={g} className={g === "MONITORIZACIÓN" ? "mon" : "ven"}>
                {filas.map((fila, r) => (
                  <tr key={fila.etiqueta}>
                    {r === 0 && <th className="sg" rowSpan={filas.length}>{g}</th>}
                    <th className="lab">{fila.etiqueta}</th>
                    {cols.map((x, j) => {
                      if (!x) return <td key={j} />;
                      const val = fila.valor(x);
                      const esDva = fila.etiqueta === "DVA";
                      return (
                        <td key={j} className={cx(esDva && "dva", fila.etiqueta === "Modo" && "mo", j === sel && "sel", fila.etiqueta === "SpO₂" && x.satBaja && "fuera")} title={`${fila.etiqueta} ${x.hora}: ${val || "sin dato"}`}>
                          {esDva && x.dva.length ? x.dva.map((d) => <span key={d}>{d}<br /></span>) : val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="kv-h-f">
        {c ? (c.enAlma ? <span className="ok">Control {c.hora} pasado a ALMA</span> : <span>Control {c.hora} sin pasar a ALMA · se marca en «Para ALMA»</span>) : <span>Sin controles registrados</span>}
        <span className="kv-filt">
          <span>Talla <b>{f.tallaCm} cm</b></span>
          <span>peso ideal <b>{Math.round(f.pesoIdeal)} kg</b></span>
          <span>6 ml/kg <b>{Math.round(f.pesoIdeal * 6)} ml</b></span>
          {desde > 0 && <span>+{desde} controles anteriores</span>}
        </span>
      </div>
    </div>
  );
}
