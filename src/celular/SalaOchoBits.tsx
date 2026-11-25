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
import { MAX_EQUIPOS_SALA, camaRce, dejarEnSala, equipoDeInventario, nombreRce, segmentosSala, usarEnSala } from "@core/index";
import type { EquipoEnSala, EquipoRce, MotivoCambioEquipo } from "@core/index";
import { useCargarInventarioRce, useInventarioRce } from "./inventarioRce";
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

const ALIAS: readonly [RegExp, string][] = [
  [/^servo/i, "Servo U"], [/^savina/i, "Savina"], [/^vela/i, "Vela"], [/^avea/i, "Avea"], [/^me(c?k|ck)/i, "Meckis"],
  [/^pb\s*9/i, "PB 980"], [/^pb|puritan/i, "PB 840"], [/^v\s?60/i, "V60"], [/^airvo/i, "Airvo 2"], [/^mr|humid/i, "Humidificador MR850"], [/aerogen|nbz/i, "NBZ Aerogen"]
];
/** Dibujos propios (25-nov-2026, desde las fotos de Diego): cada modelo con su forma. */
const PAL2: Readonly<Record<string, string>> = {"k": "#1d2a33", "w": "#f4f7f9", "g": "#9fb3bf", "G": "#7d8b96", "d": "#5b6b77", "n": "#0f1d33", "c": "#5fd3c4", "b": "#5aa0d8", "N": "#2f3f7a", "L": "#a9c4e6", "B": "#5f86c4", "p": "#e9eef2", "y": "#f2c14e", "l": "#bfe0f3"};
const PROPIOS: Readonly<Record<string, readonly string[]>> = {
  "PB 840": ["..kkkkkkkkkkkk..", "..kwnnnnnnwwwk..", "..kwnnnnnnwddk..", "..kwnnnnnnwdck..", "..kwnnnnnnwwwk..", "..kwnnnnnnkkkk..", "..kwnnnnnnwk....", "..kwbwbwwgwk....", "..kkkkkkkkkk....", ".kggggggggggk...", "..kwwwwwwwwk....", "..kwddwwgwwk....", "..kwddwwwwwk....", "..kwwwwwwwwk....", "..kkkkkkkkkk....", "...k......k....."],
  "PB 980": ["................", ".kkkkkkkkkkkkkk.", ".kNNNNNNNNNNNNk.", ".kNnnnnnnnnnnNk.", ".kNnccncnnccnNk.", ".kNnnnnnnnnnnNk.", ".kNNNNNwwNNNNNk.", ".kkkkkkkkkkkkkk.", "......kggk......", "NNNNNNNNNNNNNNNN", ".kwwwwwwwwwwwwk.", ".kNNNwwwwwwNNNk.", ".kNNNwwNNwwNNNk.", ".kNNNwwwwwwNNNk.", ".kkkkkkkkkkkkkk.", "................"],
  "Avea": ["..kkkkkkkkkkkk..", "..kLLLLLLLLLLk..", "..kLnnnnnnnnLk..", "..kLnnccccnnLk..", "..kLnnnnnnnnLk..", "..kLLLLLLLggLk..", "..kkkkkkkkkkkk..", "......kLLk......", ".kkkkkkkkkkkkkk.", ".kBBBBBBBBBBBBk.", ".kBBBBBBdddBBBk.", ".kBBBBBBdgdBBBk.", ".kBBBBBBdddBBBk.", ".kBBBBBBBBBBBBk.", ".kkkkkkkkkkkkkk.", "................"],
  "Servo U": ["...kkkkkkkkkk...", "...knnnnnnnnk...", "...knnnnnnnnk...", "...knnnnnnnnk...", "...kkkkkkkkkk...", "...wwwwwwwwww...", ".......kk.......", ".....kwwwwk.....", ".....kwwkdk.....", ".....kwwkdk.....", ".....kwwwwk.....", "......kggk......", "......kggk......", "..kkkkkkkkkkkk..", ".kk..........kk.", ".kk..........kk."],
  "Savina": ["................", ".kkkkkkkkkkkkkk.", ".kwwwwwwwwwwwwk.", ".kwppppppppywwk.", ".kwpddpppppgwwk.", ".kwppppppppwGwk.", ".kwwwwwwwwwwwwk.", "Gkkkkkkkkkkkkkk.", "GklllllllllllkG.", ".klwwlllllwwlk.G", ".klwcwlllwcwlk..", ".kllwllllllwlk..", ".kkkkkkkkkkkkkk.", ".GGGGGGGGGGGGGG.", "..G..........G..", "................"]
};
function aliasDe(modelo: string): string {
  if (COLORES[modelo]) return modelo;
  return ALIAS.find(([re]) => re.test(modelo.trim()))?.[1] ?? "";
}
function colorDe(modelo: string): readonly [string, string] {
  return COLORES[aliasDe(modelo)] ?? ["#33404a", "#9fb3bf"];
}

export function Sprite8({ modelo, px = 64 }: { modelo: string; px?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 16, 16);
    const propio = PROPIOS[aliasDe(modelo)];
    if (propio) {
      propio.forEach((fila, y) => [...fila].forEach((ch, x) => { const col = PAL2[ch]; if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } }));
      return;
    }
    const [pant, base] = colorDe(modelo);
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
  useCargarInventarioRce();
  const inv = useInventarioRce((x) => x.equipos);
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
          // Si el celular aún no anotó equipos en esta cama, se muestran los que el RCE tiene ahí.
          const delRce = r.ep.equipos.length ? [] : inv.filter((e) => e.cama === camaRce(cama)).map((e) => equipoDeInventario(e, e.enUso));
          const eq = equipoParaDibujar(r.ep.equipos.length ? r.ep.equipos : delRce);
          // La cama se parte en 1, 2 o 4 (Diego, 25-nov): hasta 4 equipos a la vista, el que está en uso resaltado.
          const lista = (r.ep.equipos.length ? r.ep.equipos : delRce).slice(0, MAX_EQUIPOS_SALA);
          const seg = segmentosSala(lista.length);
          const ronda = rondaDelTurno(r.eventos, ahora);
          const porCambiar = !ronda && esViaAereaArtificial(r.ep.viaAereaActual) ? hallazgosSugeridos(r.eventos, ahora, contextoFiltros(r.ep, r.controles)).length : 0;
          return (
            <button key={cama} type="button" className={`sala8-cama${eq ? "" : " vacia"}`} aria-label={`Sala · ${nombreCama(cama)}`} onClick={() => setEligiendo(r.ep.id)}>
              <span className="sala8-n">{nombreCama(cama)}{ronda ? <span className="sala8-ok" title="Revisada en este turno"> ✓</span> : null}</span>
              {lista.length ? (
                <span className={`sala8-segs s${seg}`}>
                  {lista.map((e) => {
                    const uso = esSoporteRespiratorio(e.tipo) && e.enUso;
                    return (
                      <span key={etiquetaEquipo(e)} className={`sala8-seg${uso ? " uso" : ""}`}>
                        <Sprite8 modelo={e.modelo} px={seg === 1 ? 64 : seg === 2 ? 44 : 32} />
                        <span className="sala8-eq">{etiquetaEquipo(e)}</span>
                        {seg === 1 && esSoporteRespiratorio(e.tipo) && <span className={`sala8-uso ${e.enUso ? "si" : "no"}`}>{e.enUso ? "en uso" : "sin uso"}</span>}
                      </span>
                    );
                  })}
                </span>
              ) : (<><span className="sala8-mas" aria-hidden>+</span><span className="sala8-eq">Sin equipo</span></>)}
              {delRce.length > 0 && <span className="sala8-rce">según RCE · confirmar</span>}
              {porCambiar > 0 && <span className="sala8-venc">{porCambiar} por cambiar</span>}
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{inv.length ? `Equipos del RCE: ${inv.length}. ` : "Sin el inventario del RCE (sin señal o sin enlace): se usa el catálogo. "}Las secciones son provisorias (camas en orden de 6 en 6) hasta definir cuáles van adelante, al medio y atrás.</p>
      {actual && inv.length > 0 && <SalaCama key={actual.ep.id} r={actual} resumen={resumen} inv={inv} ahora={ahora} rutAutor={rutAutor} onCerrar={() => setEligiendo(null)} onRevisar={() => { setEligiendo(null); onRevisar(actual.ep.id); }} />}
      {actual && inv.length === 0 && <ElegirEquipo key={actual.ep.id} r={actual} ahora={ahora} rutAutor={rutAutor} onCerrar={() => setEligiendo(null)} onRevisar={() => { setEligiendo(null); onRevisar(actual.ep.id); }} />}
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

const CATS: readonly { id: string; t: string }[] = [{ id: "VM", t: "VM" }, { id: "VNI", t: "VNI" }, { id: "CNAF", t: "Alto flujo" }, { id: "APOYO", t: "Apoyo" }];
const dondeEsta = (e: EquipoRce): string => (e.cama !== null ? `Cama ${e.cama}${e.enUso ? " · en uso" : ""}` : e.ubicacion === "BODEGA" ? "Bodega" : e.ubicacion === "PRESTAMO" ? "Préstamo" : "Pasillo");

/**
 * La sala de una cama con el inventario real (25-nov-2026, Diego): «hacer click, seleccionar y dejarlo
 * en la sala; hacer click y ponerlo en uso»; mover fácil; varios movimientos se suman a la cola; y en
 * la ronda, si sigue el mismo, se confirma. Cada toque se guarda al tiro (CAMBIO_EQUIPOS en la cola).
 */
function SalaCama({ r, resumen, inv, ahora, rutAutor, onCerrar, onRevisar }: {
  r: ResumenCama; resumen: readonly ResumenCama[]; inv: readonly EquipoRce[]; ahora: Date; rutAutor: string; onCerrar: () => void; onRevisar: () => void;
}) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const ubicar = useInventarioRce((x) => x.ubicar);
  const { ep, controles, eventos } = r;
  const n = camaRce(ep.cama);
  const delRce = inv.filter((e) => e.cama === n).map((e) => equipoDeInventario(e, e.enUso));
  const [sala, setSala] = useState<readonly EquipoEnSala[]>(ep.equipos.length ? ep.equipos : delRce);
  const [sel, setSel] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [cat, setCat] = useState("VM");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useAtras(true, onCerrar);
  const ultimo = controles[controles.length - 1] ?? null;
  const conectado = (via: string, u: typeof ultimo): boolean => via !== "NATURAL" && (u ? conSoporte(u.ventilacion.modalidad) : via === "TET");
  const ronda = rondaDelTurno(eventos, ahora);

  /** Guarda la sala de una cama (este paciente u otro) y refleja el inventario al tiro. */
  const guardarSala = async (quien: ResumenCama, lista: readonly EquipoEnSala[], antes: readonly EquipoEnSala[]): Promise<boolean> => {
    const u = quien.controles[quien.controles.length - 1] ?? null;
    const p = problemaEquipos(lista, quien.ep.viaAereaActual, conectado(quien.ep.viaAereaActual, u));
    if (p) { setError(`${nombreCama(quien.ep.cama)}: ${p}`); return false; }
    await repo.registrarEvento({ ...baseEvento(quien.ep, rutAutor, new Date()), tipo: "CAMBIO_EQUIPOS", equipos: lista });
    const c = camaRce(quien.ep.cama);
    lista.forEach((e) => ubicar(nombreRce(e), c, e.enUso));
    antes.filter((a) => !lista.some((b) => nombreRce(b) === nombreRce(a))).forEach((a) => ubicar(nombreRce(a), null, false));
    return true;
  };
  const hacer = async (f: () => Promise<boolean>): Promise<void> => {
    if (ocupado) return;
    setOcupado(true); setError(null);
    try { if (await f()) { setSel(null); setMoviendo(false); } } finally { setOcupado(false); }
  };
  const aqui = async (lista: readonly EquipoEnSala[], msg: string): Promise<boolean> => {
    if (!(await guardarSala(r, lista, sala))) return false;
    setSala(lista); avisar(msg); return true;
  };
  const otraCama = (nombre: string): ResumenCama | null => resumen.find((x) => x.ep.id !== ep.id && x.ep.equipos.some((e) => nombreRce(e).toLowerCase() === nombre.toLowerCase())) ?? null;

  const agregar = (e: EquipoRce): Promise<void> => hacer(async () => {
    if (sala.length >= MAX_EQUIPOS_SALA) { setError(`Caben hasta ${MAX_EQUIPOS_SALA} equipos por cama: saca uno primero.`); return false; }
    const de = otraCama(e.nombre);
    if (de) {
      const suyo = de.ep.equipos.find((x) => nombreRce(x).toLowerCase() === e.nombre.toLowerCase())!;
      if (suyo.enUso && esSoporteRespiratorio(suyo.tipo)) { setError(`${e.nombre} está en uso en ${nombreCama(de.ep.cama)}: cámbialo allá primero.`); return false; }
      if (!(await guardarSala(de, de.ep.equipos.filter((x) => x !== suyo), de.ep.equipos))) return false;
    }
    return aqui(dejarEnSala(sala, e, ep.viaAereaActual, conectado(ep.viaAereaActual, ultimo)), `${e.nombre} queda en la sala de ${nombreCama(ep.cama)}.`);
  });
  const usar = (eq: EquipoEnSala): Promise<void> => hacer(() => aqui(usarEnSala(sala, eq), `${nombreRce(eq)} en uso.`));
  const sinUso = (eq: EquipoEnSala): Promise<void> => hacer(() => aqui(sala.map((x) => (x === eq ? { ...x, enUso: false } : x)), `${nombreRce(eq)} sin uso.`));
  const alPasillo = (eq: EquipoEnSala): Promise<void> => hacer(() => aqui(sala.filter((x) => x !== eq), `${nombreRce(eq)} al pasillo.`));
  const mover = (eq: EquipoEnSala, destino: ResumenCama): Promise<void> => hacer(async () => {
    const enDestino = destino.ep.equipos;
    const u = destino.controles[destino.controles.length - 1] ?? null;
    const comoRce: EquipoRce = { nombre: nombreRce(eq), categoria: eq.tipo === "VMNI" ? "VNI" : eq.tipo === "ALTO_FLUJO" ? "CNAF" : eq.tipo === "VENTILADOR" ? "VM" : "APOYO", ubicacion: "CAMA", cama: null, enUso: false, estado: "" };
    const nuevaDestino = dejarEnSala(enDestino, comoRce, destino.ep.viaAereaActual, conectado(destino.ep.viaAereaActual, u));
    const sinEl = sala.filter((x) => x !== eq);
    if (problemaEquipos(sinEl, ep.viaAereaActual, conectado(ep.viaAereaActual, ultimo))) { setError(`Si sale ${nombreRce(eq)}, ${nombreCama(ep.cama)} queda sin soporte: pon otro en uso primero.`); return false; }
    if (!(await guardarSala(destino, nuevaDestino, enDestino))) return false;
    return aqui(sinEl, `${nombreRce(eq)} pasa a ${nombreCama(destino.ep.cama)}.`);
  });
  const confirmar = (): Promise<void> => hacer(async () => {
    // Si la sala venía del RCE (el celular no la había anotado), se anota primero.
    if (!ep.equipos.length && sala.length && !(await guardarSala(r, sala, []))) return false;
    const hall = esViaAereaArtificial(ep.viaAereaActual) ? hallazgosSugeridos(eventos, ahora, contextoFiltros(ep, controles)) : [];
    await repo.registrarEvento({ ...baseEvento(ep, rutAutor, new Date()), tipo: "RONDA_EQUIPOS", hallazgos: hall });
    avisar(`${nombreCama(ep.cama)}: confirmado, sigue igual${hall.length ? ` · ${hall.length} filtro(s) por cambiar` : ""}.`);
    onCerrar();
    return true;
  });

  const nombres = new Set(sala.map((x) => nombreRce(x).toLowerCase()));
  const disponibles = inv.filter((e) => !nombres.has(e.nombre.toLowerCase()) && e.categoria.toUpperCase() === cat);
  const otras = resumen.filter((x) => x.ep.id !== ep.id).sort((a, b) => a.ep.cama.localeCompare(b.ep.cama, "es", { numeric: true }));

  return createPortal(
    <div className="ev-capa">
      <div className="ev-pantalla" role="dialog" aria-modal="true" aria-label={`Equipo · ${nombreCama(ep.cama)}`}>
        <header className="ev-cabeza">
          <button type="button" className="ev-volver" aria-label="Volver a la sala" onClick={onCerrar}><ChevronLeft size={22} aria-hidden />Sala</button>
          <b>{nombreCama(ep.cama)}</b>
        </header>
        <div className="pf-cuerpo">
          <section className="ronda-sec">
            <h3>En la sala {ronda ? <span className="small muted">· confirmada este turno</span> : null}</h3>
            {!ep.equipos.length && sala.length > 0 && <p className="small muted" style={{ margin: 0 }}>Según el RCE. Si sigue igual, confírmalo abajo.</p>}
            {sala.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nada anotado. Toca un equipo de abajo para dejarlo en la sala.</p>}
            <div className="sala8-tipos">
              {sala.map((eq) => {
                const nom = nombreRce(eq), abierto = sel === nom;
                return (
                  <button key={nom} type="button" className={`sala8-tipo${abierto ? " sel" : ""}${eq.enUso && esSoporteRespiratorio(eq.tipo) ? " uso" : ""}`} aria-label={`En la sala · ${nom}`} onClick={() => { setSel(abierto ? null : nom); setMoviendo(false); }}>
                    <Sprite8 modelo={eq.modelo} px={48} />
                    <span>{nom}</span>
                    {esSoporteRespiratorio(eq.tipo) && <span className={`sala8-uso ${eq.enUso ? "si" : "no"}`}>{eq.enUso ? "en uso" : "sin uso"}</span>}
                  </button>
                );
              })}
            </div>
            {sel && (() => {
              const eq = sala.find((x) => nombreRce(x) === sel); if (!eq) return null;
              return (
                <div className="sala8-acciones" role="group" aria-label={`Qué hacer con ${sel}`}>
                  {esSoporteRespiratorio(eq.tipo) && !eq.enUso && <button type="button" className="btn primary" disabled={ocupado} onClick={() => void usar(eq)}>Poner en uso</button>}
                  {esSoporteRespiratorio(eq.tipo) && eq.enUso && <button type="button" className="btn" disabled={ocupado} onClick={() => void sinUso(eq)}>Dejar sin uso</button>}
                  <button type="button" className="btn" disabled={ocupado} onClick={() => setMoviendo((m) => !m)}>Mover a otra cama</button>
                  <button type="button" className="btn" disabled={ocupado} onClick={() => void alPasillo(eq)}>Sacar al pasillo</button>
                  {moviendo && (
                    <div className="sala8-destinos">
                      {otras.map((x) => <button key={x.ep.id} type="button" className="ch-cama" disabled={ocupado} onClick={() => void mover(eq, x)}>{nombreCama(x.ep.cama)}</button>)}
                    </div>
                  )}
                </div>
              );
            })()}
            {error && <p className="aviso-etiqueta" role="alert">{error}</p>}
          </section>
          <section className="ronda-sec">
            <h3>Agregar a la sala <span className="small muted">· {sala.length} de {MAX_EQUIPOS_SALA}</span></h3>
            <div className="sala8-secs" role="tablist" aria-label="Tipo de equipo">
              {CATS.map((c) => <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}>{c.t}</button>)}
            </div>
            <div className="sala8-tipos">
              {disponibles.map((e) => (
                <button key={e.nombre} type="button" className="sala8-tipo" disabled={ocupado} aria-label={`Agregar · ${e.nombre}`} onClick={() => void agregar(e)}>
                  <Sprite8 modelo={e.nombre} px={44} />
                  <span>{e.nombre}</span>
                  <small className="muted">{dondeEsta(e)}</small>
                </button>
              ))}
              {disponibles.length === 0 && <p className="small muted" style={{ margin: 0 }}>No hay más equipos de este tipo en el inventario.</p>}
            </div>
          </section>
        </div>
        <div className="pie-inf" style={{ flexDirection: "column" }}>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void confirmar()}>✓ Sigue igual · confirmar {nombreCama(ep.cama)}</button>
          <button type="button" className="btn" onClick={onRevisar}>Filtros y hallazgos ›</button>
        </div>
      </div>
    </div>,
    document.querySelector(".app-cel") ?? document.body
  );
}
