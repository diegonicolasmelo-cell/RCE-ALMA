import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import {
  CATALOGO_EQUIPOS,
  ETIQUETA_MOTIVO_CAMBIO_EQUIPO,
  MOTIVOS_CAMBIO_EQUIPO,
  SECCIONES_SALA,
  cambioDeVentilador,
  conSoporte,
  equipoParaDibujar,
  esSoporteRespiratorio,
  etiquetaEquipo,
  modelosOfrecidos,
  nombreCama,
  numeroValido,
  problemaEquipos,
  rangoNumeroEquipo,
  rondaDelTurno,
  contextoFiltros,
  esViaAereaArtificial,
  hallazgosSugeridos,
  salaAlElegir
} from "@core/index";
import type { MotivoCambioEquipo } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { baseEvento } from "./eventos-ui";
import type { ResumenCama } from "./Inicio";
import { useAtras } from "./Inicio";

/*
 * Dibujos en 8 bits (16×16), provisorios hasta que lleguen los de Diego. Todos comparten la silueta
 * de un ventilador con pantalla y pedestal; cada modelo cambia el color de la pantalla y de la base.
 * Una letra es un color; S = pantalla, A = base.
 */
const PAL: Readonly<Record<string, string>> = { k: "#1d2a33", w: "#f4f7f9", g: "#9fb3bf", c: "#5fd3c4", y: "#f2c14e", r: "#e0574f" };
const SILUETA = [
  "................", "..kkkkkkkkkkkk..", "..kwwwwwwwwwwk..", "..kwSSSSSSSSwk..", "..kwSccScSccwk..", "..kwSSSSSSSSwk..",
  "..kwSyySSrSSwk..", "..kwwwwwwwwwwk..", "..kwggwwggwwwk..", "..kkkkkkkkkkkk..", ".......kk.......", ".......kk.......",
  "....kkkkkkkk....", "....kAAAAAAk....", "...kk......kk...", "...kk......kk..."
];
const COLORES: Readonly<Record<string, readonly [string, string]>> = {
  "Servo U": ["#1c3d34", "#5fd3c4"], Savina: ["#24425c", "#f2c14e"], Vela: ["#2d3b2b", "#f08a3c"], Avea: ["#4a2b2b", "#e0574f"],
  Meckis: ["#22364a", "#9fb3bf"], "PB 840": ["#3b2c4f", "#8b6fd6"], "PB 980": ["#2a2f55", "#2f7fd0"], V60: ["#33333d", "#5b6b77"],
  "Airvo 2": ["#173c46", "#5fd3c4"], "Humidificador MR850": ["#3a3a3a", "#f4f7f9"], "NBZ Aerogen": ["#26323a", "#c9d6de"]
};

export function Sprite8({ modelo, px = 64 }: { modelo: string; px?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const [pant, base] = COLORES[modelo] ?? ["#33404a", "#9fb3bf"];
    ctx.clearRect(0, 0, 16, 16);
    SILUETA.forEach((fila, y) => [...fila].forEach((ch, x) => {
      const col = ch === "S" ? pant : ch === "A" ? base : PAL[ch];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }));
  }, [modelo]);
  return <canvas ref={ref} width={16} height={16} className="sprite8" style={{ width: px, height: px }} aria-hidden />;
}

/**
 * La ronda vista como la sala (idea de Diego, 24-nov-2026; programada el 25-nov). Secciones de 6
 * camas en grilla 2×3; cada cama muestra su equipo dibujado. Tocar una cama → tipo → número.
 */
export function SalaOchoBits({ resumen, ahora, rutAutor, onRevisar }: {
  resumen: readonly ResumenCama[]; ahora: Date; rutAutor: string; onRevisar: (episodioId: string) => void;
}) {
  const [seccion, setSeccion] = useState(SECCIONES_SALA[0]!.id);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const sec = SECCIONES_SALA.find((s) => s.id === seccion) ?? SECCIONES_SALA[0]!;
  const porCama = new Map(resumen.map((r) => [r.ep.cama, r]));
  const actual = eligiendo ? resumen.find((r) => r.ep.id === eligiendo) ?? null : null;

  return (
    <div className="sala8">
      <div className="sala8-secs" role="tablist" aria-label="Secciones de la sala">
        {SECCIONES_SALA.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === sec.id} onClick={() => setSeccion(s.id)}>{s.nombre}</button>
        ))}
      </div>
      <div className="sala8-grilla">
        {sec.camas.map((cama) => {
          const r = porCama.get(cama);
          if (!r) return <div key={cama} className="sala8-cama libre" aria-label={`${nombreCama(cama)} libre`}><span className="sala8-n">{nombreCama(cama)}</span><span className="sala8-eq">Libre</span></div>;
          const eq = equipoParaDibujar(r.ep.equipos);
          const ronda = rondaDelTurno(r.eventos, ahora);
          const porCambiar = !ronda && esViaAereaArtificial(r.ep.viaAereaActual) ? hallazgosSugeridos(r.eventos, ahora, contextoFiltros(r.ep, r.controles)).length : 0;
          return (
            <button key={cama} type="button" className={`sala8-cama${eq ? "" : " vacia"}`} aria-label={`Sala · ${nombreCama(cama)}`} onClick={() => setEligiendo(r.ep.id)}>
              <span className="sala8-n">{nombreCama(cama)}{ronda ? <span className="sala8-ok" title="Revisada en este turno"> ✓</span> : null}</span>
              {eq ? <Sprite8 modelo={eq.modelo} /> : <span className="sala8-mas" aria-hidden>+</span>}
              <span className="sala8-eq">{eq ? etiquetaEquipo(eq) : "Sin equipo"}</span>
              {eq && esSoporteRespiratorio(eq.tipo) && <span className={`sala8-uso ${eq.enUso ? "si" : "no"}`}>{eq.enUso ? "en uso" : "sin uso"}</span>}
              {porCambiar > 0 && <span className="sala8-venc">{porCambiar} por cambiar</span>}
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Las secciones son provisorias (camas en orden de 6 en 6) hasta definir cuáles van adelante, al medio y atrás.</p>
      {actual && <ElegirEquipo key={actual.ep.id} r={actual} ahora={ahora} rutAutor={rutAutor} onCerrar={() => setEligiendo(null)} onRevisar={() => { setEligiendo(null); onRevisar(actual.ep.id); }} />}
    </div>
  );
}

function ElegirEquipo({ r, ahora, rutAutor, onCerrar, onRevisar }: { r: ResumenCama; ahora: Date; rutAutor: string; onCerrar: () => void; onRevisar: () => void }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const { ep, controles } = r;
  const [modelo, setModelo] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [motivo, setMotivo] = useState<MotivoCambioEquipo | "">("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useAtras(true, () => (modelo ? setModelo(null) : onCerrar()));
  const ultimo = controles[controles.length - 1] ?? null;
  const conectado = ep.viaAereaActual !== "NATURAL" && (ultimo ? conSoporte(ultimo.ventilacion.modalidad) : ep.viaAereaActual === "TET");
  const rango = modelo ? rangoNumeroEquipo(modelo) : null;
  const n = rango ? (numero ? Number(numero) : null) : null;
  const listo = modelo !== null && numeroValido(modelo, n);
  const nueva = listo ? salaAlElegir(ep.equipos, modelo!, n, ep.viaAereaActual) : ep.equipos;
  const cambiaVentilador = listo && ep.equipos.some((e) => e.tipo === "VENTILADOR") && cambioDeVentilador(ep.equipos, nueva);

  const tecla = (t: string): void => {
    setError(null);
    if (t === "⌫") return setNumero((x) => x.slice(0, -1));
    setNumero((x) => (x + t).replace(/^0+/, "").slice(0, 2));
  };
  const guardar = async (): Promise<void> => {
    if (!listo || guardando) return;
    const problema = problemaEquipos(nueva, ep.viaAereaActual, conectado);
    if (problema) return setError(problema);
    if (cambiaVentilador && motivo === "") return setError("Indica por qué se cambia el ventilador.");
    setGuardando(true);
    try {
      await repo.registrarEvento({ ...baseEvento(ep, rutAutor, ahora), tipo: "CAMBIO_EQUIPOS", equipos: nueva, ...(cambiaVentilador && motivo ? { motivo } : {}) });
      avisar(`${nombreCama(ep.cama)}: ${etiquetaEquipo(nueva[nueva.length - 1]!)} anotado.`);
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="ev-capa">
      <div className="ev-pantalla" role="dialog" aria-modal="true" aria-label={`Equipo · ${nombreCama(ep.cama)}`}>
        <header className="ev-cabeza">
          <button type="button" className="ev-volver" aria-label={modelo ? "Volver a los tipos" : "Volver a la sala"} onClick={() => (modelo ? (setModelo(null), setNumero(""), setError(null)) : onCerrar())}>
            <ChevronLeft size={22} aria-hidden />{modelo ? "Tipos" : "Sala"}
          </button>
          <b>{nombreCama(ep.cama)}</b>
        </header>
        <div className="pf-cuerpo">
          {!modelo ? (
            <>
              <p className="small muted" style={{ margin: 0 }}>En la sala: {ep.equipos.length ? ep.equipos.map((e) => `${etiquetaEquipo(e)}${esSoporteRespiratorio(e.tipo) ? (e.enUso ? " (en uso)" : " (sin uso)") : ""}`).join(" · ") : "nada anotado"}. Toca el tipo de equipo que ves.</p>
              <div className="sala8-tipos">
                {modelosOfrecidos(ep.viaAereaActual).map((d) => (
                  <button key={d.modelo} type="button" className="sala8-tipo" onClick={() => { setModelo(d.modelo); setNumero(""); setError(null); }}>
                    <Sprite8 modelo={d.modelo} px={48} />
                    <span>{d.modelo}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn" onClick={onRevisar}>Revisar filtros y hallazgos de esta cama ›</button>
            </>
          ) : (
            <div className="sala8-num">
              <div className="sala8-elegido"><Sprite8 modelo={modelo} px={72} /><b>{rango ? `${modelo} ${numero || "_"}` : modelo}</b></div>
              {rango ? (
                <>
                  <p className="small muted" style={{ margin: 0 }}>¿Cuál {modelo}? Número del {rango.min} al {rango.max}.</p>
                  <div className="sala8-teclado" role="group" aria-label="Número del equipo">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map((t) => (
                      <button key={t} type="button" aria-label={t === "⌫" ? "Borrar" : t} onClick={() => tecla(t)}>{t}</button>
                    ))}
                  </div>
                  {numero && !listo && <p className="aviso-etiqueta" role="alert">{modelo} va del {rango.min} al {rango.max}.</p>}
                </>
              ) : <p className="small muted" style={{ margin: 0 }}>Hay uno solo en la unidad: no lleva número.</p>}
              {cambiaVentilador && (
                <div className="sala8-motivo" role="group" aria-label="Motivo del cambio">
                  <span className="small">¿Por qué se cambia el ventilador?</span>
                  {MOTIVOS_CAMBIO_EQUIPO.map((m) => (
                    <button key={m} type="button" className={motivo === m ? "on" : ""} aria-pressed={motivo === m} onClick={() => { setMotivo(m); setError(null); }}>{ETIQUETA_MOTIVO_CAMBIO_EQUIPO[m]}</button>
                  ))}
                </div>
              )}
              {error && <p className="aviso-etiqueta" role="alert">{error}</p>}
            </div>
          )}
        </div>
        {modelo && (
          <div className="pie-inf">
            <button type="button" className="btn primary" disabled={!listo || guardando} onClick={() => void guardar()}>
              {listo ? `Anotar ${etiquetaEquipo({ tipo: CATALOGO_EQUIPOS.find((d) => d.modelo === modelo)!.tipo, modelo, numero: n, enUso: true })} en ${nombreCama(ep.cama)}` : "Elige el número"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.querySelector(".app-cel") ?? document.body
  );
}
