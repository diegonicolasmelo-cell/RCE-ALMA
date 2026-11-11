/**
 * El control como el registro simple: una hoja vertical con dos tarjetas, CSV y Terapia
 * ventilatoria, una fila por dato (etiqueta a la izquierda, casilla a la derecha) y el
 * teclado numerico propio (TecladoPropio). Nada mas que lo que se anota en la cama.
 */

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChangeEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import {
  ASPECTOS_SECRECIONES,
  CAMPOS_POR_MODALIDAD,
  ESCALA_SAS,
  ESTADOS_VIGILIA,
  ETIQUETA_GRUPO_MODALIDAD,
  ETIQUETA_MODALIDAD,
  GRUPO_MODALIDAD,
  INFUSIONES,
  MODALIDADES_POR_VIA,
  OPCIONES_DEGLUCION,
  bandaProteccion,
  calcularDerivados,
  calcularPam,
  calcularPpc,
  cambiarModalidad,
  camposSugeribles,
  conSoporte,
  esModalidadControlada,
  esViaAereaArtificial,
  hayAspectoDeSecreciones,
  iniciarInfusion,
  materializarControl,
  medicionDe,
  momentoDeEvaluacion,
  pideMusculaturaAccesoria,
  sedoanalgesiaActivaEnBorrador,
  semaforoCatecolamina,
  sugerirAnterior,
  suspenderInfusion,
  textoEscalon,
  titularDosis,
  titularPorEscalon,
  transicionSoporte,
  volumenObjetivoMl
} from "@core/index";
import type { CampoVent, GrupoInfusion, IdInfusion, Modalidad, ValorSas } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { horaDe, textoNum } from "../app/util";
import type { ContextoCama } from "./contextoCama";
import { PanelEquipos, PesoIdeal } from "./TabControl";
import { TECLADO_PROPIO, tecladoRango } from "./TecladoPropio";

const GRUPOS_INF: readonly (readonly [GrupoInfusion, string])[] = [
  ["SEDANTE", "Sedoanalgesia y agitación"],
  ["DVA", "Drogas vasoactivas"],
  ["INOTROPO", "Inotrópicos"],
  ["ANTIARRITMICO", "Antiarrítmicos"],
  ["BNM", "Bloqueo neuromuscular"]
];
const BANDA: Record<string, string> = { ULTRAPROTECTOR: "Ultraprotector", PROTECTOR: "Protector", SOBRE_META: "Sobre la meta" };

/** "hoy 09:55 (10-11)": la fecha completa que la app deduce de la hora escrita. */
function cuando(hora: string): string {
  const m = momentoDeEvaluacion(hora, new Date());
  if (!m) return "Esa hora queda a más de 12 h: revisa si está bien escrita.";
  const dia = m.toDateString() === new Date().toDateString() ? "hoy" : "ayer";
  return `Se guarda: ${dia} ${horaDe(m)} (${String(m.getDate()).padStart(2, "0")}-${String(m.getMonth() + 1).padStart(2, "0")})`;
}

/** Casilla numerica de la hoja: en el celular abre el teclado propio, no el del sistema. */
function Num(props: { id: string; campo?: string; valor: string; etiqueta: string; onCambio: (v: string) => void; deshabilitado?: boolean; placeholder?: string; teclado?: string }) {
  return (
    <input
      id={props.id}
      className="num"
      data-teclado={props.teclado}
      data-campo={props.campo}
      inputMode={TECLADO_PROPIO ? "none" : "decimal"}
      enterKeyHint="next"
      autoComplete="off"
      aria-label={props.etiqueta}
      value={props.valor}
      disabled={props.deshabilitado}
      placeholder={props.placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => props.onCambio(e.target.value)}
    />
  );
}

function Fila({ etiqueta, unidad, ayuda, children, clase = "" }: { etiqueta: ReactNode; unidad?: string; ayuda?: ReactNode; children: ReactNode; clase?: string }) {
  return (
    <div className={`fila ${clase}`}>
      <span className="et">
        {etiqueta}
        {unidad && <span className="u"> {unidad}</span>}
        {ayuda && <span className="ayuda">{ayuda}</span>}
      </span>
      {children}
    </div>
  );
}

export function ControlSimple({ ctx }: { ctx: ContextoCama }) {
  const { ep, ultimo, b, editar, pbw } = ctx;
  const { local } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const artificial = esViaAereaArtificial(ep.viaAereaActual);
  const sedada = sedoanalgesiaActivaEnBorrador(b);
  const set = (k: "fc" | "pas" | "pad" | "spo2") => (v: string) => editar((x) => ({ ...x, [k]: v }));
  const setVent = (c: CampoVent, v: string): void => editar((x) => ({ ...x, vent: { ...x.vent, [c]: v } }));
  /** Acepta solo un digito dentro del rango; el resto se ignora al teclear. */
  const digito = (v: string, min: number, max: number): number | null | undefined => {
    if (v.trim() === "") return null;
    const n = Number(v.trim().slice(-1));
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  };
  const setGlasgow = (k: "ocular" | "verbal" | "motora", max: number) => (v: string) => {
    const n = digito(v, 1, max);
    if (n === undefined) return;
    editar((x) => {
      const g = { ...x.glasgow, [k]: n };
      // Con via artificial el verbal no se evalua: queda en T.
      return { ...x, glasgow: artificial ? { ...g, verbal: 1 } : g } as typeof x;
    });
  };

  const horaControl = b.horaControl || horaDe(new Date());
  const pam = calcularPam(medicionDe(b.pas), medicionDe(b.pad));

  // --- Terapia ventilatoria ---
  const permitidos = MODALIDADES_POR_VIA[ep.viaAereaActual];
  const grupos = [...new Set(permitidos.map((m) => GRUPO_MODALIDAD[m]))];
  const transicion = transicionSoporte(ultimo?.ventilacion.modalidad ?? null, b.modalidad, ep.viaAereaActual);
  const horaEvento = b.horaEvento || horaDe(new Date());
  const controlada = esModalidadControlada(b.modalidad);
  const bloqueado = b.asincronico && controlada;
  const campos = CAMPOS_POR_MODALIDAD[b.modalidad];
  const sugeribles = camposSugeribles(b, ultimo);
  const d = calcularDerivados(materializarControl(b, { id: "tmp", numero: 0, ahora: new Date(0), viaAerea: ep.viaAereaActual, monitoreo: ep.monitoreo }), pbw);
  const mlKg = (v: string): string => {
    const n = medicionDe(v);
    return n === null ? `6 ml/kg ${volumenObjetivoMl(pbw, 6)} · 8 ml/kg ${volumenObjetivoMl(pbw, 8)} (PI ${String(pbw).replace(".", ",")} kg)` : `${String(Math.round((n / pbw) * 10) / 10).replace(".", ",")} ml/kg de peso ideal`;
  };

  // --- Infusiones ---
  const activas = INFUSIONES.filter((x) => b.infusiones[x.id].activa);
  const setDosis = (id: IdInfusion, dosis: string): void => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [id]: { ...y.infusiones[id], dosis } } }));
  const suspender = (id: IdInfusion, nombre: string): void => {
    const antes = b.infusiones[id];
    sostenerHoja(id);
    editar((y) => suspenderInfusion(y, id));
    avisar(`${nombre} suspendida.`, () => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [id]: antes } })));
  };
  /**
   * Las flechas de la dosis no le quitan el foco a la casilla: si lo hicieran, el teclado se
   * cerraria, volveria la cabecera y la hoja daria un tiron (y perderia la fila centrada).
   */
  const sinRobarFoco = {
    onPointerDown: (e: PointerEvent) => e.preventDefault(),
    onMouseDown: (e: MouseEvent) => e.preventDefault()
  };
  /**
   * Al suspender, la fila desaparece. Si el cursor estaba en su dosis, no se cierra el teclado
   * (eso hacia volver la cabecera y saltar la hoja): el cursor pasa a la dosis de la fila
   * vecina o, si era la ultima droga, a la casilla siguiente de la hoja, como «Sig.».
   */
  const sostenerHoja = (id: IdInfusion): void => {
    const casilla = document.getElementById(`in-inf-${id}-dosis`);
    if (!casilla || document.activeElement !== casilla) return;
    const fila = casilla.closest(".fila");
    const dosis = [...document.querySelectorAll<HTMLInputElement>('.fila.inf input[id^="in-inf-"]')];
    const i = dosis.indexOf(casilla as HTMLInputElement);
    const otras = [...document.querySelectorAll<HTMLInputElement>("#cuerpo .fila input.num:not([disabled])")].filter((x) => !fila?.contains(x));
    const despues = otras.find((x) => casilla.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
    const destino = dosis[i + 1] ?? dosis[i - 1] ?? despues ?? otras.at(-1);
    destino?.focus({ preventScroll: true });
  };
  // Agregar varias de una vez: se marcan en un panel y se agregan juntas. No se abre el
  // teclado (abrirlo movia la hoja): las nuevas quedan resaltadas un momento y la dosis se toca
  // cuando se quiera.
  const [eligiendo, setEligiendo] = useState(false);
  const [marcadas, setMarcadas] = useState<readonly IdInfusion[]>([]);
  const [recientes, setRecientes] = useState<readonly IdInfusion[]>([]);
  const alternarMarca = (id: IdInfusion): void => setMarcadas((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const cerrarPanel = (): void => {
    setMarcadas([]);
    setEligiendo(false);
  };
  // Escape tambien cierra el panel (en el PC).
  useEffect(() => {
    if (!eligiendo) return;
    const alTeclear = (e: KeyboardEvent): void => {
      if (e.key === "Escape") cerrarPanel();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [eligiendo]);
  const agregarMarcadas = (): void => {
    const ids = marcadas;
    editar((y) => ids.reduce((acc, id) => iniciarInfusion(acc, id), y));
    setMarcadas([]);
    setEligiendo(false);
    setRecientes(ids);
    setTimeout(() => setRecientes([]), 1600);
  };

  const m = ep.monitoreo;
  const setNeuro = (parcial: Partial<typeof b.neuro>): void => editar((x) => ({ ...x, neuro: { ...x.neuro, ...parcial } }));

  return (
    <div className="hoja-simple">
      <section aria-label="CSV">
        <h2>CSV</h2>
        <Fila etiqueta="Hora del control" ayuda={cuando(horaControl)}>
          <input id="in-hora-control" data-campo="horaControl" type="time" value={horaControl} onChange={(e) => editar((x) => ({ ...x, horaControl: e.target.value }))} />
        </Fila>
        <Fila etiqueta="Frec. cardiaca" unidad="lpm">
          <Num id="in-fc" campo="fc" etiqueta="Frecuencia cardiaca" valor={b.fc} onCambio={set("fc")} />
        </Fila>
        <Fila etiqueta="P. arterial" unidad="mmHg">
          <div className="par">
            <Num id="in-pas" campo="pas" etiqueta="Presión sistólica" valor={b.pas} onCambio={set("pas")} />
            <span>/</span>
            <Num id="in-pad" campo="pad" etiqueta="Presión diastólica" valor={b.pad} onCambio={set("pad")} />
          </div>
        </Fila>
        <Fila etiqueta="PAM" unidad="mmHg">
          <div className="calc" aria-live="polite">{textoNum(pam)}</div>
        </Fila>
        <Fila etiqueta="SpO₂" unidad="%">
          <Num id="in-spo2" campo="spo2" etiqueta="Saturación" valor={b.spo2} onCambio={set("spo2")} />
        </Fila>
        <Fila etiqueta="Glasgow" unidad="O · V · M" clase="gcs">
          <div className="tres">
            <label><span>O</span><Num id="in-gcs-o" campo="glasgow" etiqueta="Glasgow ocular, 1 a 4" teclado={tecladoRango(1, 4)} valor={b.glasgow.ocular === null ? "" : String(b.glasgow.ocular)} onCambio={setGlasgow("ocular", 4)} /></label>
            {artificial ? (
              <label><span>V</span><b className="calc t" aria-label="Verbal T" title="Con vía aérea artificial el verbal no se evalúa">T</b></label>
            ) : (
              <label><span>V</span><Num id="in-gcs-v" campo="glasgow" etiqueta="Glasgow verbal, 1 a 5" teclado={tecladoRango(1, 5)} valor={b.glasgow.verbal === null ? "" : String(b.glasgow.verbal)} onCambio={setGlasgow("verbal", 5)} /></label>
            )}
            <label><span>M</span><Num id="in-gcs-m" campo="glasgow" etiqueta="Glasgow motor, 1 a 6" teclado={tecladoRango(1, 6)} valor={b.glasgow.motora === null ? "" : String(b.glasgow.motora)} onCambio={setGlasgow("motora", 6)} /></label>
          </div>
        </Fila>
        {m.capnografia && <Fila etiqueta="EtCO₂" unidad="mmHg"><Num id="in-neuro-etco2" etiqueta="EtCO2" valor={b.neuro.etco2} onCambio={(v) => setNeuro({ etco2: v })} /></Fila>}
        {m.pic && <Fila etiqueta="PIC" unidad="mmHg" ayuda={`PPC ${textoNum(calcularPpc(pam, medicionDe(b.neuro.pic)))}`}><Num id="in-neuro-pic" etiqueta="PIC" valor={b.neuro.pic} onCambio={(v) => setNeuro({ pic: v })} /></Fila>}
        {m.dve && <Fila etiqueta="Altura DVE" unidad="cmH₂O"><Num id="in-neuro-dve" etiqueta="Altura DVE" valor={b.neuro.dveAltura} onCambio={(v) => setNeuro({ dveAltura: v })} /></Fila>}

        <div className="sub-grupo">Infusiones en curso</div>
        {activas.map((def) => {
          const x = b.infusiones[def.id];
          const previa = ultimo?.infusiones[def.id];
          const dosis = medicionDe(x.dosis);
          const esc = def.escalones ? textoEscalon(def.id, dosis) : "";
          const sem = def.semaforo && dosis !== null ? semaforoCatecolamina(dosis) : "SIN_DVA";
          const titular = (s: 1 | -1): string => (def.escalones ? titularPorEscalon(def.id, x.dosis, s) : titularDosis(x.dosis, def.paso ?? 0.01, s));
          return (
            <div className={`fila inf${recientes.includes(def.id) ? " reciente" : ""}`} key={def.id} aria-label={def.nombre}>
              <span className="et">
                {def.nombre} <span className="u">{def.unidad}</span>
                <button type="button" className="quitar" aria-label={`Suspender ${def.nombre}`} {...sinRobarFoco} onClick={() => suspender(def.id, def.nombre)}><X size={15} aria-hidden /></button>
                <span className="ayuda">{previa ? `antes ${previa.dosis}` : "nueva"}</span>
                {esc && <span className="ayuda esc">{esc}</span>}
                {/* La linea del semaforo se reserva desde el comienzo: al titular la fila no crece ni salta. */}
                {def.semaforo && <span className={`ayuda dva ${sem === "SIN_DVA" ? "" : sem.toLowerCase()}`}>{sem === "SIN_DVA" ? "DVA —" : `DVA ${sem.toLowerCase()}`}</span>}
              </span>
              <div className="titular">
                <button type="button" aria-label={`Bajar ${def.nombre}`} {...sinRobarFoco} onClick={() => setDosis(def.id, titular(-1))}>▼</button>
                <Num id={`in-inf-${def.id}-dosis`} campo={`infusion:${def.id}`} etiqueta={`${def.nombre} dosis`} valor={x.dosis} onCambio={(v) => setDosis(def.id, v)} />
                <button type="button" aria-label={`Subir ${def.nombre}`} {...sinRobarFoco} onClick={() => setDosis(def.id, titular(1))}>▲</button>
              </div>
            </div>
          );
        })}
        <div className="acciones">
          <button type="button" className="agregar-inf" aria-haspopup="dialog" onClick={() => setEligiendo(true)}>+ Agregar drogas o infusiones</button>
        </div>
        {/* Despues de las infusiones: con sedoanalgesia en curso se mide SAS; sin ella, la vigilia. */}
        <div className="sub-grupo">{sedada ? "Sedación" : "Conciencia"}</div>
        {sedada ? (
          <Fila etiqueta="SAS" unidad="1-7" ayuda={b.sas === null ? undefined : ESCALA_SAS.find((e) => e.val === b.sas)?.label}>
            <Num id="in-sas" campo="sas" etiqueta="SAS, 1 a 7" teclado={tecladoRango(1, 7)} valor={b.sas === null ? "" : String(b.sas)} onCambio={(v) => { const n = digito(v, 1, 7); if (n !== undefined) editar((x) => ({ ...x, sas: n as ValorSas | null })); }} />
          </Fila>
        ) : (
          <Fila etiqueta="Vigilia" ayuda="sin sedoanalgesia en curso">
            <select id="in-vigilia" data-campo="vigilia" aria-label="Estado de vigilia" value={b.vigilia ?? ""} onChange={(e) => editar((x) => ({ ...x, vigilia: (e.target.value || null) as typeof x.vigilia }))}>
              <option value="">—</option>
              {ESTADOS_VIGILIA.map((v) => <option key={v.val} value={v.val}>{v.label}</option>)}
            </select>
          </Fila>
        )}
        {eligiendo && (
          // Panel flotante: sube desde abajo sobre la hoja, que no cambia de tamano ni se mueve.
          <div className="fondo-flotante" onClick={cerrarPanel}>
            <div className="panel-flotante elegir-inf" role="dialog" aria-modal="true" aria-label="Agregar drogas o infusiones" onClick={(e) => e.stopPropagation()}>
              <header className="pf-cabeza">
                <b>Agregar drogas o infusiones</b>
                <button type="button" className="pf-cerrar" aria-label="Cerrar sin agregar" onClick={cerrarPanel}><X size={20} aria-hidden /></button>
              </header>
              <div className="pf-cuerpo">
                {GRUPOS_INF.map(([g, t]) => {
                  const libres = INFUSIONES.filter((x) => x.grupo === g && !b.infusiones[x.id].activa);
                  return libres.length ? (
                    <div key={g} className="grupo-inf">
                      <div className="sub-titulo">{t}</div>
                      <div className="marcas">
                        {libres.map((x) => (
                          <button key={x.id} type="button" data-id={x.id} aria-pressed={marcadas.includes(x.id)} onClick={() => alternarMarca(x.id)}>
                            {x.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
              <div className="pie-inf">
                <button type="button" className="btn" onClick={cerrarPanel}>Cancelar</button>
                <button type="button" className="btn primary" disabled={marcadas.length === 0} onClick={agregarMarcadas}>
                  {marcadas.length === 0 ? "Marca una o más" : `Agregar (${marcadas.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Terapia ventilatoria">
        <h2>
          Terapia ventilatoria
          {sugeribles.length > 0 && <button type="button" className="peq" onClick={() => editar((x) => sugerirAnterior(x, ultimo))}>Usar lo anterior</button>}
        </h2>
        <Fila etiqueta="Modo">
          <select id="in-modo" data-campo="modalidad" aria-label="Modo ventilatorio" value={b.modalidad} onChange={(e) => editar((x) => cambiarModalidad(x, e.target.value as Modalidad))}>
            {!permitidos.includes(b.modalidad) && <option value={b.modalidad}>{ETIQUETA_MODALIDAD[b.modalidad]} (no corresponde)</option>}
            {grupos.map((g) => (
              <optgroup key={g} label={ETIQUETA_GRUPO_MODALIDAD[g]}>
                {permitidos.filter((x) => GRUPO_MODALIDAD[x] === g).map((x) => <option key={x} value={x}>{ETIQUETA_MODALIDAD[x]}</option>)}
              </optgroup>
            ))}
          </select>
        </Fila>
        {transicion && (
          <div className={`evento-soporte ${transicion.tipo.toLowerCase()}`} role="status">
            <b>{transicion.texto}</b> · de {ETIQUETA_MODALIDAD[transicion.desde]} a {ETIQUETA_MODALIDAD[transicion.hasta]}
            <label htmlFor="in-hora-evento">
              Hora real de la {transicion.tipo === "DESVINCULACION" ? "desvinculación" : "reconexión"}
              <input id="in-hora-evento" data-campo="horaEvento" type="time" value={horaEvento} onChange={(e) => editar((x) => ({ ...x, horaEvento: e.target.value }))} />
            </label>
            <span className="small">{cuando(horaEvento)}</span>
            <span className="small muted">Si ocurrió antes, cámbiala: es distinta de la hora del control. La desvinculación no es una PVE.</span>
          </div>
        )}
        {conSoporte(b.modalidad) && (
          <Fila etiqueta="Asincronía">
            <div className="sw" role="group" aria-label="Asincronía">
              <button type="button" aria-pressed={!b.asincronico} onClick={() => editar((x) => ({ ...x, asincronico: false }))}>No</button>
              <button type="button" aria-pressed={b.asincronico} onClick={() => editar((x) => ({ ...x, asincronico: true }))}>Sí</button>
            </div>
          </Fila>
        )}
        {bloqueado && <div className="notice crit small" style={{ margin: "0 12px 8px" }}><b>Plateau, ΔP y compliance quedan invalidados:</b> hay asincronía en modalidad controlada.</div>}
        {(["PROGRAMADO", "OBSERVADO"] as const).map((g) => (
          <div key={g}>
            <div className="sub-grupo">{g === "PROGRAMADO" ? "Programado" : "Lo que hace el paciente"}</div>
            {campos.filter((c) => c.grupo === g).map((c) => {
              const bloq = bloqueado && c.campo === "pPlateau";
              const esVt = c.campo === "vtProgramado" || c.campo === "vtEspirado";
              return (
                <Fila key={c.campo} etiqueta={c.etiqueta} unidad={c.unidad} clase={bloq ? "bloq" : ""} ayuda={esVt ? <span className="esc">{mlKg(b.vent[c.campo])}</span> : undefined}>
                  <Num id={`in-vent-${c.campo}`} campo={c.campo} etiqueta={c.etiqueta} valor={bloq ? "" : b.vent[c.campo]} deshabilitado={bloq} placeholder={bloq ? "bloqueado" : ""} onCambio={(v) => setVent(c.campo, v)} />
                </Fila>
              );
            })}
          </div>
        ))}
        {pideMusculaturaAccesoria(b.modalidad) && (
          <Fila etiqueta="Musculatura accesoria">
            <div className="sw" role="group" aria-label="Uso de musculatura accesoria">
              <button type="button" aria-pressed={b.musculaturaAccesoria === false} onClick={() => editar((x) => ({ ...x, musculaturaAccesoria: false }))}>No</button>
              <button type="button" aria-pressed={b.musculaturaAccesoria === true} onClick={() => editar((x) => ({ ...x, musculaturaAccesoria: true }))}>Sí</button>
            </div>
          </Fila>
        )}
        {(controlada || b.modalidad === "CPAP_PS" || d.rox !== null || d.vtEspiradoPorKg !== null) && <div className="sub-grupo">Calculado</div>}
        {controlada && <Fila etiqueta="P. distensión" unidad="cmH₂O"><div className="calc">{textoNum(d.drivingPressure)}</div></Fila>}
        {controlada && <Fila etiqueta="Compliance" unidad="ml/cmH₂O"><div className="calc">{textoNum(d.compliance)}</div></Fila>}
        {b.modalidad === "CPAP_PS" && <Fila etiqueta="Índice de Tobin"><div className="calc">{textoNum(d.tobin)}</div></Fila>}
        {d.rox !== null && <Fila etiqueta="Índice ROX"><div className="calc">{textoNum(d.rox)}</div></Fila>}
        {d.vtEspiradoPorKg !== null && (
          <Fila etiqueta="Vt espirado por kilo" ayuda={bandaProteccion(d.vtEspiradoPorKg) ? BANDA[bandaProteccion(d.vtEspiradoPorKg)!] : undefined}>
            <div className="calc">{String(d.vtEspiradoPorKg).replace(".", ",")}</div>
          </Fila>
        )}
        <div className="guia-pi"><PesoIdeal ctx={ctx} /></div>
        <div className="equipos-simple"><PanelEquipos ctx={ctx} /></div>
      </section>
      {!esViaAereaArtificial(ep.viaAereaActual) && (
        <section aria-label="Secreciones, tos y deglución">
          <h2>Secreciones, tos y deglución</h2>
          <Fila etiqueta="Secreciones">
            <select id="in-secreciones" aria-label="Aspecto de las secreciones" value={b.aspecto ?? ""}
              onChange={(e) => editar((x) => {
                const aspecto = (e.target.value || null) as typeof x.aspecto;
                return { ...x, aspecto, ...(hayAspectoDeSecreciones(aspecto) ? {} : { reologia: null, cantidad: null }) };
              })}>
              <option value="">—</option>
              {ASPECTOS_SECRECIONES.map((a) => <option key={a.val} value={a.val}>{a.label}</option>)}
            </select>
          </Fila>
          {hayAspectoDeSecreciones(b.aspecto) && (
            <>
              <Fila etiqueta="Reología">
                <select id="in-reologia" aria-label="Reología de las secreciones" value={b.reologia ?? ""} onChange={(e) => editar((x) => ({ ...x, reologia: (e.target.value || null) as typeof x.reologia }))}>
                  <option value="">—</option>
                  <option value="FLUIDA">Fluida</option>
                  <option value="ESPESA">Espesa</option>
                  <option value="ADHERENTE">Adherente</option>
                </select>
              </Fila>
              <Fila etiqueta="Cantidad">
                <select id="in-cantidad" aria-label="Cantidad de secreciones" value={b.cantidad ?? ""} onChange={(e) => editar((x) => ({ ...x, cantidad: (e.target.value || null) as typeof x.cantidad }))}>
                  <option value="">—</option>
                  <option value="ESCASA">Escasa</option>
                  <option value="MODERADA">Moderada</option>
                  <option value="ABUNDANTE">Abundante</option>
                </select>
              </Fila>
            </>
          )}
          <Fila etiqueta="Tos">
            <select id="in-tos" aria-label="Tos" value={b.tos ?? ""} onChange={(e) => editar((x) => ({ ...x, tos: (e.target.value || null) as typeof x.tos }))}>
              <option value="">—</option>
              <option value="EFICIENTE">Eficiente</option>
              <option value="DEFICIENTE">Deficiente</option>
            </select>
          </Fila>
          <Fila etiqueta="Deglución">
            <select id="in-deglucion" aria-label="Deglución" value={b.deglucion ?? ""} onChange={(e) => editar((x) => ({ ...x, deglucion: (e.target.value || null) as typeof x.deglucion }))}>
              <option value="">—</option>
              {OPCIONES_DEGLUCION.map((o) => <option key={o.val} value={o.val}>{o.label}</option>)}
            </select>
          </Fila>
        </section>
      )}
      {local && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small muted">Modo demostración:</span>
          <button type="button" className="btn sm" onClick={() => editar((x) => ({ ...x, fc: "86", spo2: "97", pas: "122", pad: "68", vent: { ...x.vent, frTotal: "20", vtEspirado: "430" } }))}>Rellenar signos de ejemplo</button>
        </div>
      )}
    </div>
  );
}
