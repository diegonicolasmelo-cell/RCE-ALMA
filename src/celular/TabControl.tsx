import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CAMPOS_POR_MODALIDAD,
  CATALOGO_EQUIPOS,
  ETIQUETA_GRUPO_MODALIDAD,
  ETIQUETA_MODALIDAD,
  GRUPO_MODALIDAD,
  MODALIDADES_CON_VT,
  MODALIDADES_POR_VIA,
  OBJETIVOS_VT_ML_KG,
  VALORES_RAPIDOS,
  agregarEquipo,
  bandaProteccion,
  calcularDerivados,
  calcularPam,
  camposSugeribles,
  conSoporte,
  momentoDeEvaluacion,
  transicionSoporte,
  cambiarModalidad,
  describirEquipos,
  equipoEnUso,
  equiposIguales,
  esModalidadControlada,
  etiquetaEquipo,
  materializarControl,
  medicionDe,
  mlPorKg,
  opcionesVolumenObjetivo,
  ponerEnUso,
  quitarEquipo,
  sugerirAnterior
} from "@core/index";
import type { CampoVent, CampoVentDef, Modalidad } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import type { SegmentoId } from "./pasos";
import { horaDe, textoNum } from "../app/util";
import { Aviso, CampoNum, Pildora, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { opcionesNumericas, useFranja } from "./franja";
import type { DescriptorFranja } from "./franja";

const BANDA = {
  ULTRAPROTECTOR: { tipo: "acc" as const, t: "Ultraprotector" },
  PROTECTOR: { tipo: "good" as const, t: "Protector" },
  SOBRE_META: { tipo: "warn" as const, t: "Sobre la meta" }
};

export function TabControl({ ctx, paso }: { ctx: ContextoCama; paso: SegmentoId }) {
  const { ep, ultimo, b, editar, pbw } = ctx;
  const { local } = useServicios();
  const f = useFranja();
  const controlada = esModalidadControlada(b.modalidad);
  const bloqueado = b.asincronico && controlada;

  const setVent = (campo: CampoVent, v: string): void => editar((x) => ({ ...x, vent: { ...x.vent, [campo]: v } }));

  // Control provisorio solo para calcular lo que se muestra mientras se escribe.
  const tmp = useMemo(
    () => materializarControl(b, { id: "tmp", numero: 0, ahora: new Date(0), viaAerea: ep.viaAereaActual, monitoreo: ep.monitoreo }),
    [b, ep.viaAereaActual, ep.monitoreo]
  );
  const d = calcularDerivados(tmp, pbw);

  /** Franja de un casillero del ventilador. Lo observado NO ofrece "ant.": se lee del monitor. */
  const franjaVent = (def: CampoVentDef) => (): DescriptorFranja => {
    const previa = ultimo?.ventilacion[def.campo] ?? null;
    const actual = b.vent[def.campo];
    const programado = def.grupo === "PROGRAMADO";
    const opciones =
      def.campo === "vtProgramado"
        ? [
            ...(previa !== null ? [{ valor: String(previa), texto: `ant. ${previa}`, previa: true }] : []),
            ...opcionesVolumenObjetivo(pbw, OBJETIVOS_VT_ML_KG).map((o) => ({
              valor: String(o.ml),
              texto: String(o.ml),
              sub: `${o.mlKg} ml/kg`,
              activa: actual === String(o.ml)
            }))
          ]
        : opcionesNumericas(VALORES_RAPIDOS[def.campo] ?? [], actual, programado ? previa : null);
    return { etiqueta: `${def.etiqueta} ${def.unidad}`, opciones, onElegir: (v) => setVent(def.campo, v) };
  };

  // Solo los modos de la via aerea de hoy: con via natural, oxigenoterapia y VNI; con TET,
  // los ventilatorios y el tubo T / HME; con TQT, ademas alto flujo por TQT, S/T y AVAPS.
  const permitidos = MODALIDADES_POR_VIA[ep.viaAereaActual];
  f.registrar("modo", () => {
    const previa = ultimo?.ventilacion.modalidad ?? null;
    const previaVale = previa !== null && permitidos.includes(previa);
    return {
      etiqueta: "Modo",
      opciones: [
        ...(previa && previaVale ? [{ valor: previa, texto: `Igual: ${ETIQUETA_MODALIDAD[previa]}`, previa: true, activa: b.modalidad === previa }] : []),
        ...permitidos.filter((m) => m !== previa || !previaVale).map((m) => ({ valor: m, texto: ETIQUETA_MODALIDAD[m], sub: ETIQUETA_GRUPO_MODALIDAD[GRUPO_MODALIDAD[m]], activa: b.modalidad === m }))
      ],
      onElegir: (v) => editar((x) => cambiarModalidad(x, v as Modalidad))
    };
  });

  const sinFranja = (etiqueta: string) => (): DescriptorFranja => ({ etiqueta, opciones: [], onElegir: () => undefined });
  // Cambio de soporte respecto del control anterior: se registra solo, como evento, con su hora real.
  const transicion = transicionSoporte(ultimo?.ventilacion.modalidad ?? null, b.modalidad, ep.viaAereaActual);
  const horaEvento = b.horaEvento || horaDe(new Date());
  // Hora real del control: se sugiere la de ahora y se corrige si se tomo antes.
  const horaControl = b.horaControl || horaDe(new Date());
  const momentoControl = momentoDeEvaluacion(horaControl, new Date());
  const fechaCorta = (d: Date): string => {
    const hoy = new Date();
    const dia = d.toDateString() === hoy.toDateString() ? "hoy" : "ayer";
    return `${dia} ${horaDe(d)} (${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")})`;
  };
  const momentoEvento = transicion ? momentoDeEvaluacion(horaEvento, new Date()) : null;
  const campos = CAMPOS_POR_MODALIDAD[b.modalidad];
  const sugeribles = camposSugeribles(b, ultimo);
  const grupo = (g: "PROGRAMADO" | "OBSERVADO") =>
    campos
      .filter((c) => c.grupo === g)
      .map((def) => (
        <CampoNum
          key={def.campo}
          clave={`vent:${def.campo}`}
          etiqueta={def.etiqueta}
          unidad={def.unidad}
          valor={b.vent[def.campo]}
          previo={ultimo && ultimo.ventilacion.modalidad === b.modalidad ? ultimo.ventilacion[def.campo] : null}
          onCambio={(v) => setVent(def.campo, v)}
          franja={franjaVent(def)}
          placeholder={def.campo === "pPlateau" && bloqueado ? "bloqueado" : ""}
          deshabilitado={def.campo === "pPlateau" && bloqueado}
        />
      ));

  const pam = calcularPam(medicionDe(b.pas), medicionDe(b.pad));

  return (
    <>
      {paso === "fc" && (
        <section aria-label="Hora y frecuencia cardiaca">
          <div className="fila-hoja">
            <label htmlFor="in-hora-control">Hora del control<span className="ayuda">{momentoControl ? `Se guarda: ${fechaCorta(momentoControl)}` : "Esa hora queda a más de 12 h: revísala."}</span></label>
            <input id="in-hora-control" type="time" value={horaControl} onChange={(e) => editar((x) => ({ ...x, horaControl: e.target.value }))} />
          </div>
          <CampoNum clave="fc" etiqueta="Frec. cardiaca" unidad="lpm" previo={ultimo?.fc ?? null} valor={b.fc} onCambio={(v) => editar((x) => ({ ...x, fc: v }))} franja={sinFranja("FC")} />
          {local && (
            <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
              <span className="small muted">Modo demostración:</span>
              <button type="button" className="btn sm" onClick={() => rellenarEjemplo(ctx)}>Rellenar signos de ejemplo</button>
            </div>
          )}
        </section>
      )}
      {paso === "pa" && (
        <section aria-label="Presión arterial y saturación">
          <div className="fila-hoja">
            <label htmlFor="in-pas">P. arterial <span className="muted">mmHg</span></label>
            <div className="pa-dos">
              <CampoNum soloCasilla clave="pas" etiqueta="PAS" ariaLabel="Presión sistólica" valor={b.pas} onCambio={(v) => editar((x) => ({ ...x, pas: v }))} franja={sinFranja("PAS")} />
              <span aria-hidden="true">/</span>
              <CampoNum soloCasilla clave="pad" etiqueta="PAD" ariaLabel="Presión diastólica" valor={b.pad} onCambio={(v) => editar((x) => ({ ...x, pad: v }))} franja={sinFranja("PAD")} />
            </div>
          </div>
          <div className="fila-hoja">
            <label>PAM <span className="muted">mmHg</span></label>
            <div className="pam mono" aria-live="polite">{textoNum(pam)}</div>
          </div>
          <CampoNum clave="spo2" etiqueta="SpO₂" unidad="%" previo={ultimo?.spo2 ?? null} valor={b.spo2} onCambio={(v) => editar((x) => ({ ...x, spo2: v }))} franja={sinFranja("SpO₂")} />
        </section>
      )}
      {paso === "modo" && (
      <section>
        <h3>Soporte y modo</h3>
        <PanelEquipos ctx={ctx} />
        <div className="fgrid2 mt">
          <div className="f">
            <label>Modo</label>
            <button type="button" className="pickbtn" data-stop="modo" onFocus={() => f.abrir("modo")} onClick={() => f.abrir("modo")}>
              {ETIQUETA_MODALIDAD[b.modalidad]}
            </button>
          </div>
          {conSoporte(b.modalidad) && (
            <div className="f">
              <label>Asincronía</label>
              <Seg
                ancho
                etiqueta="Asincronía"
                valor={b.asincronico}
                opciones={[{ valor: false, texto: "No" }, { valor: true, texto: "Sí" }]}
                onCambio={(v) => editar((x) => ({ ...x, asincronico: v }))}
              />
            </div>
          )}
        </div>
        {transicion && (
          <div className={`evento-soporte ${transicion.tipo.toLowerCase()} mt`} role="status">
            <b>{transicion.texto}</b> · de {ETIQUETA_MODALIDAD[transicion.desde]} a {ETIQUETA_MODALIDAD[transicion.hasta]}
            <label htmlFor="in-hora-evento">
              Hora real de la {transicion.tipo === "DESVINCULACION" ? "desvinculación" : "reconexión"}
              <input id="in-hora-evento" type="time" value={horaEvento} onChange={(e) => editar((x) => ({ ...x, horaEvento: e.target.value }))} />
            </label>
            <span className="small">{momentoEvento ? `Se guarda: ${fechaCorta(momentoEvento)}` : "Esa hora queda a más de 12 h: revísala."}</span>
            <span className="small muted">Si ocurrió antes, cámbiala: es distinta de la hora del control. La desvinculación no es una PVE.</span>
          </div>
        )}
        {bloqueado && (
          <div className="mt">
            <Aviso tipo="crit" pequeno>
              <b>Plateau, ΔP y compliance quedan invalidados:</b> hay asincronía en modalidad controlada y el plateau está contaminado por el esfuerzo del paciente.
            </Aviso>
          </div>
        )}
      </section>
      )}
      {paso === "vent" && (
        <>
      <section>
        <h3>Terapia ventilatoria · {ETIQUETA_MODALIDAD[b.modalidad]}</h3>
        <div className="subg-hoja con-boton">
          <span>Programado</span>
          {sugeribles.length > 0 && (
            <button type="button" className="btn sm" onClick={() => editar((x) => sugerirAnterior(x, ultimo))}>
              Usar lo anterior
            </button>
          )}
        </div>
        <div className="fgrid">{grupo("PROGRAMADO")}</div>
        <div className="subg-hoja">Lo que hace el paciente</div>
        <div className="fgrid">
          {grupo("OBSERVADO")}
        </div>
        {(b.modalidad === "CNAF" || b.modalidad === "CNAF_TQT") && (
          <div className="mt">
            <div className="small ink2">Uso de musculatura accesoria</div>
            <Seg ancho etiqueta="Uso de musculatura accesoria" valor={b.musculaturaAccesoria} opciones={[{ valor: true, texto: "Sí" }, { valor: false, texto: "No" }]} onCambio={(v) => editar((x) => ({ ...x, musculaturaAccesoria: v }))} />
          </div>
        )}
      </section>

      <Resultantes ctx={ctx} d={d} bloqueado={bloqueado} />
        </>
      )}
    </>
  );
}


function rellenarEjemplo({ b, editar }: ContextoCama): void {
  const aplica = new Set(CAMPOS_POR_MODALIDAD[b.modalidad].map((c) => c.campo));
  const obs: Partial<Record<CampoVent, string>> = { frTotal: "20", vtEspirado: "430", pPico: "22", pPlateau: "18", pMedia: "10" };
  editar((x) => ({
    ...x,
    fc: "86",
    spo2: "97",
    pas: "122",
    pad: "68",
    vent: { ...x.vent, ...Object.fromEntries(Object.entries(obs).filter(([k]) => aplica.has(k as CampoVent))) }
  }));
}

// ---------------------------------------------------------------------------

function Resultantes({ ctx, d, bloqueado }: { ctx: ContextoCama; d: ReturnType<typeof calcularDerivados>; bloqueado: boolean }) {
  const { b, pbw } = ctx;
  if (b.modalidad === "CNAF" || b.modalidad === "CNAF_TQT") {
    return (
      <section>
        <h3>Resultantes</h3>
        <div className="derived"><Celda valor={d.rox} etiqueta="ROX" /></div>
      </section>
    );
  }
  // Oxigenoterapia y tubo T / HME: sin volumen que proteger.
  if (!MODALIDADES_CON_VT.includes(b.modalidad)) return null;
  const programado = mlPorKg(medicionDe(b.vent.vtProgramado), pbw);
  const lineas: { l: string; ml: number | null; kg: number | null }[] = [
    ...(b.modalidad === "ACVC" || b.modalidad === "AVAPS" ? [{ l: b.modalidad === "AVAPS" ? "Objetivo" : "Programado", ml: medicionDe(b.vent.vtProgramado), kg: programado }] : []),
    { l: "Espirado", ml: medicionDe(b.vent.vtEspirado), kg: d.vtEspiradoPorKg }
  ];
  return (
    <section>
      <h3>Guía de protección pulmonar</h3>
      <div className="guide">
        <PesoIdeal ctx={ctx} />
        {lineas.map((x) => {
          const banda = bandaProteccion(x.kg);
          return (
            <div className="gl" key={x.l}>
              <span className="small ink2">{x.l}</span>
              <b className="mono">{x.ml === null ? "--" : `${x.ml} ml`}</b>
              <span className="mono small">{x.kg === null ? "" : `${x.kg.toFixed(1)} ml/kg`}</span>
              {banda && <Pildora tipo={BANDA[banda].tipo}>{BANDA[banda].t}</Pildora>}
            </div>
          );
        })}
        {d.posibleFuga && <div className="small" style={{ color: "var(--warn-ink)" }}>Programado y espirado difieren más de 10 %: ¿fuga en el circuito?</div>}
      </div>

      <h3 style={{ marginTop: 10 }}>Resultantes</h3>
      <div className="derived">
        <Celda valor={d.vtEspiradoPorKg} etiqueta="Vt/kg esp." />
        {esModalidadControlada(b.modalidad) ? (
          <>
            <Celda valor={d.drivingPressure} etiqueta={d.origenDriving === "PICO" ? "ΔP (con pico)" : "ΔP"} bloqueado={bloqueado} />
            <Celda valor={d.compliance} etiqueta={d.origenDriving === "PICO" ? "Cest (con pico)" : "Cest"} bloqueado={bloqueado} />
            <Celda valor={d.relacionIE} etiqueta="I:E" />
          </>
        ) : (
          <Celda valor={d.tobin} etiqueta="Tobin" />
        )}
      </div>
    </section>
  );
}

function Celda({ valor, etiqueta, bloqueado }: { valor: number | string | null; etiqueta: string; bloqueado?: boolean }) {
  return (
    <div>
      <b>{bloqueado ? <Lock size={14} aria-label="Invalidado por asincronía" /> : valor ?? "--"}</b>
      <span>{etiqueta}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Talla y peso ideal: se definen al ingreso; aqui solo se ven y, si hace falta, se corrigen. */
export function PesoIdeal({ ctx }: { ctx: ContextoCama }) {
  const { ep, pbw } = ctx;
  const { repo } = useServicios();
  const [editando, setEditando] = useState(false);
  const [talla, setTalla] = useState(String(ep.tallaCm));
  useEffect(() => setTalla(String(ep.tallaCm)), [ep.tallaCm]);

  const guardar = async (): Promise<void> => {
    const t = medicionDe(talla);
    if (t !== null && t >= 100 && t <= 230 && t !== ep.tallaCm) await repo.guardarEpisodio({ ...ep, tallaCm: t });
    else setTalla(String(ep.tallaCm));
    setEditando(false);
  };

  return (
    <div className="small muted" style={{ fontWeight: 700, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>Peso ideal <span className="mono">{pbw} kg</span> · talla</span>
      {editando ? (
        <input aria-label="Talla en cm" inputMode="numeric" autoFocus autoComplete="off" value={talla} style={{ width: 80, minHeight: 34 }}
          onChange={(e) => setTalla(e.target.value)} onBlur={() => void guardar()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      ) : (
        <>
          <span className="mono">{ep.tallaCm} cm</span>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => setEditando(true)}>editar</button>
        </>
      )}
    </div>
  );
}

export function PanelEquipos({ ctx }: { ctx: ContextoCama }) {
  const { ep, rutAutor, ahora } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState(ep.equipos);
  const [modelo, setModelo] = useState<string>(CATALOGO_EQUIPOS[0]?.modelo ?? "");
  const [numero, setNumero] = useState("");
  useEffect(() => {
    if (!abierto) setLista(ep.equipos);
  }, [ep.equipos, abierto]);

  const def = CATALOGO_EQUIPOS.find((e) => e.modelo === modelo);
  const agregar = (): void => {
    setLista((l) => agregarEquipo(l, modelo, def?.numerado ? medicionDe(numero) : null));
    setNumero("");
  };
  const aplicar = async (): Promise<void> => {
    if (!equiposIguales(lista, ep.equipos)) {
      await repo.registrarEvento({ ...baseEvento(ep, rutAutor, ahora), tipo: "CAMBIO_EQUIPOS", equipos: lista });
      avisar("Equipos de la sala actualizados.");
    }
    setAbierto(false);
  };

  return (
    <div className="mt">
      <button type="button" className="todo-row small" style={{ width: "100%", textAlign: "left", background: "none", cursor: "pointer", color: "inherit" }} onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <b>Equipos de la sala:</b> {describirEquipos(ep.equipos)} <span className="muted">· {abierto ? "cerrar" : "cambiar"}</span>
      </button>
      {abierto && (
        <div className="card stack" style={{ padding: 10, gap: 8, marginTop: 6 }}>
          {lista.length === 0 && <div className="small muted">Sin equipos registrados.</div>}
          {lista.map((e) => (
            <div key={etiquetaEquipo(e)} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                <b>{etiquetaEquipo(e)}</b>{" "}
                {e.enUso && <Pildora tipo="acc">en uso</Pildora>}
              </span>
              <span className="row">
                {!e.enUso && (e.tipo === "VENTILADOR" || e.tipo === "VMNI" || e.tipo === "ALTO_FLUJO") && (
                  <button type="button" className="btn sm" onClick={() => setLista((l) => ponerEnUso(l, e))}>Poner en uso</button>
                )}
                <button type="button" className="btn sm" onClick={() => setLista((l) => quitarEquipo(l, e))}>Quitar</button>
              </span>
            </div>
          ))}
          <div className="row">
            <select value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo de equipo">
              {CATALOGO_EQUIPOS.map((e) => (
                <option key={e.modelo}>{e.modelo}</option>
              ))}
            </select>
            {def?.numerado && (
              <input inputMode="numeric" value={numero} placeholder="n.º" aria-label="Número del equipo" style={{ width: 70 }} onChange={(e) => setNumero(e.target.value)} />
            )}
            <button type="button" className="btn sm" onClick={agregar}>Agregar</button>
          </div>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void aplicar()}>Aplicar cambios</button>
            <button type="button" className="btn" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
          <div className="small muted">
            {equipoEnUso(lista) ? `En uso: ${etiquetaEquipo(equipoEnUso(lista)!)}.` : "Ningún equipo marcado en uso."} El número asocia el nombre a un número de serie.
          </div>
        </div>
      )}
    </div>
  );
}
