import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CAMPOS_POR_MODALIDAD,
  CATALOGO_EQUIPOS,
  ETIQUETA_MODALIDAD,
  INFUSIONES,
  MODALIDADES,
  OBJETIVOS_VT_ML_KG,
  VALORES_RAPIDOS,
  agregarEquipo,
  alternarDosisLibre,
  bandaProteccion,
  calcularDerivados,
  calcularPam,
  cambiarModalidad,
  describirEquipos,
  equipoEnUso,
  equiposIguales,
  esModalidadControlada,
  etiquetaEquipo,
  iniciarInfusion,
  materializarControl,
  medicionDe,
  mlPorKg,
  opcionesVolumenObjetivo,
  ponerEnUso,
  quitarEquipo,
  suspenderInfusion
} from "@core/index";
import type { CampoVent, CampoVentDef, Modalidad } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import type { SegmentoId } from "./pasos";
import { textoNum } from "../app/util";
import { Aviso, CampoNum, Pildora, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { opcionesNumericas, useFranja } from "./franja";
import type { DescriptorFranja } from "./franja";
import { TarjetaInfusion } from "./TarjetaInfusion";

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

  f.registrar("modo", () => {
    const previa = ultimo?.ventilacion.modalidad ?? null;
    return {
      etiqueta: "Modo",
      opciones: [
        ...(previa ? [{ valor: previa, texto: `Igual: ${ETIQUETA_MODALIDAD[previa]}`, previa: true, activa: b.modalidad === previa }] : []),
        ...MODALIDADES.filter((m) => m !== previa).map((m) => ({ valor: m, texto: ETIQUETA_MODALIDAD[m], activa: b.modalidad === m }))
      ],
      onElegir: (v) => editar((x) => cambiarModalidad(x, v as Modalidad))
    };
  });

  const sinFranja = (etiqueta: string) => (): DescriptorFranja => ({ etiqueta, opciones: [], onElegir: () => undefined });
  const campos = CAMPOS_POR_MODALIDAD[b.modalidad];
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
          onCambio={(v) => setVent(def.campo, v)}
          franja={franjaVent(def)}
          placeholder={def.campo === "pPlateau" && bloqueado ? "bloqueado" : g === "OBSERVADO" && ultimo?.ventilacion[def.campo] != null ? `ant. ${ultimo.ventilacion[def.campo]}` : ""}
          deshabilitado={def.campo === "pPlateau" && bloqueado}
        />
      ));

  const tarjetas = (grupoInf: (typeof INFUSIONES)[number]["grupo"]) =>
    INFUSIONES.filter((i) => i.grupo === grupoInf).map((def) => {
      const x = b.infusiones[def.id];
      return (
        <TarjetaInfusion
          key={def.id}
          def={def}
          x={x}
          ultimo={ultimo}
          onCambio={(p) => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [def.id]: { ...y.infusiones[def.id], ...p } } }))}
          onIniciar={() => editar((y) => iniciarInfusion(y, def.id))}
          onSuspender={() => suspenderConDeshacer(def.id)}
          onAlternarLibre={() => editar((y) => alternarDosisLibre(y, def.id))}
        />
      );
    });

  const avisar = useApp((s) => s.avisar);
  const suspenderConDeshacer = (id: (typeof INFUSIONES)[number]["id"]): void => {
    const previo = b.infusiones[id];
    editar((y) => suspenderInfusion(y, id));
    const nombre = INFUSIONES.find((i) => i.id === id)?.nombre ?? "Infusión";
    avisar(`${nombre} suspendida.`, () => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [id]: previo } })));
  };

  const pam = calcularPam(medicionDe(b.pas), medicionDe(b.pad));

  return (
    <>
      {paso === "fc" && (
        <>
      <section>
        <h3>Frecuencia cardiaca</h3>
        <div style={{ maxWidth: 160 }}>
          <CampoNum clave="fc" etiqueta="FC" unidad="lpm" valor={b.fc} onCambio={(v) => editar((x) => ({ ...x, fc: v }))} franja={sinFranja("FC")} placeholder={textoPrevio(ultimo?.fc)} />
        </div>
      </section>

      <section>
        <h3>Inotrópicos y antiarrítmicos</h3>
        <div className="stack" style={{ gap: 6 }}>
          <div className="grpt">Inotrópicos</div>
          {tarjetas("INOTROPO")}
          <div className="grpt">Antiarrítmicos</div>
          {tarjetas("ANTIARRITMICO")}
        </div>
      </section>

      {local && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small muted">Modo demostración:</span>
          <button type="button" className="btn sm" onClick={() => rellenarEjemplo(ctx)}>
            Rellenar signos de ejemplo
          </button>
        </div>
      )}
        </>
      )}
      {paso === "pa" && (
        <>
      <section>
        <h3>Presión arterial</h3>
        <div className="fgrid">
          <CampoNum clave="pas" etiqueta="PAS" valor={b.pas} onCambio={(v) => editar((x) => ({ ...x, pas: v }))} franja={sinFranja("PAS")} placeholder={textoPrevio(ultimo?.pas)} />
          <CampoNum clave="pad" etiqueta="PAD" valor={b.pad} onCambio={(v) => editar((x) => ({ ...x, pad: v }))} franja={sinFranja("PAD")} placeholder={textoPrevio(ultimo?.pad)} />
          <div className="f">
            <label>PAM</label>
            <div className="pam mono" aria-live="polite">{textoNum(pam)}</div>
          </div>
        </div>
      </section>
      
      <section>
        <h3>Drogas vasoactivas</h3>
        <div className="stack" style={{ gap: 6 }}>
          {tarjetas("DVA")}
        </div>
      </section>
        </>
      )}
      {paso === "modo" && (
      <section>
        <h3>Ventilador</h3>
        <PesoIdeal ctx={ctx} />
        <PanelEquipos ctx={ctx} />
        <div className="fgrid2 mt">
          <div className="f">
            <label>Modo</label>
            <button type="button" className="pickbtn" data-stop="modo" onFocus={() => f.abrir("modo")} onClick={() => f.abrir("modo")}>
              {ETIQUETA_MODALIDAD[b.modalidad]}
            </button>
          </div>
          <div className="f">
            <label>Sincronía</label>
            {b.modalidad === "CNAF" ? (
              <div className="small muted" style={{ padding: "10px 0" }}>No aplica</div>
            ) : (
              <Seg
                ancho
                etiqueta="Sincronía"
                valor={b.asincronico}
                opciones={[{ valor: false, texto: "Sincrónico" }, { valor: true, texto: "Asincrónico" }]}
                onCambio={(v) => editar((x) => ({ ...x, asincronico: v }))}
              />
            )}
          </div>
        </div>
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
        <div className="subg">Programado</div>
        <div className="fgrid">{grupo("PROGRAMADO")}</div>
        <div className="subg">Lo que hace el paciente</div>
        <div className="fgrid">{grupo("OBSERVADO")}</div>
      </section>

      <Resultantes ctx={ctx} d={d} bloqueado={bloqueado} franjaVm={franjaVent({ campo: "volMinuto", etiqueta: "Vol. minuto", unidad: "L/min", grupo: "OBSERVADO" })} />
        </>
      )}
      {paso === "spo2" && (
      <section>
        <h3>Saturación</h3>
        <div style={{ maxWidth: 160 }}>
          <CampoNum clave="spo2" etiqueta="SpO₂" unidad="%" valor={b.spo2} onCambio={(v) => editar((x) => ({ ...x, spo2: v }))} franja={sinFranja("SpO₂")} placeholder={textoPrevio(ultimo?.spo2)} />
        </div>
      </section>
      )}
    </>
  );
}

const textoPrevio = (v: number | null | undefined): string => (v === null || v === undefined ? "" : `ant. ${v}`);

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

function Resultantes({ ctx, d, bloqueado, franjaVm }: { ctx: ContextoCama; d: ReturnType<typeof calcularDerivados>; bloqueado: boolean; franjaVm: () => DescriptorFranja }) {
  const { b, pbw, ep } = ctx;
  if (b.modalidad === "CNAF") {
    return (
      <section>
        <h3>Resultantes</h3>
        <div className="derived"><Celda valor={d.rox} etiqueta="ROX" /></div>
      </section>
    );
  }
  const programado = mlPorKg(medicionDe(b.vent.vtProgramado), pbw);
  const lineas: { l: string; ml: number | null; kg: number | null }[] = [
    ...(b.modalidad === "ACVC" ? [{ l: "Programado", ml: medicionDe(b.vent.vtProgramado), kg: programado }] : []),
    { l: "Espirado", ml: medicionDe(b.vent.vtEspirado), kg: d.vtEspiradoPorKg }
  ];
  return (
    <section>
      <h3>Guía de protección pulmonar</h3>
      <div className="guide">
        <div className="small muted" style={{ fontWeight: 700 }}>
          Peso ideal {pbw} kg · talla {ep.tallaCm} cm
        </div>
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
        <Celda valor={d.volumenMinuto} etiqueta={d.volumenMinutoOrigen === "EDITADO" ? "Vol. min (editado)" : "Vol. min"} />
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
      <div className="mt" style={{ maxWidth: 220 }}>
        <CampoNum
          clave="vent:volMinuto"
          etiqueta="Editar volumen minuto"
          unidad="L/min"
          valor={b.vent.volMinuto}
          onCambio={(v) => ctx.editar((x) => ({ ...x, vent: { ...x.vent, volMinuto: v } }))}
          franja={franjaVm}
          placeholder={d.volumenMinutoOrigen === "CALCULADO" && d.volumenMinuto !== null ? `calculado ${d.volumenMinuto}` : "calculado"}
        />
      </div>
      <div className="small muted">Se calcula con el volumen espirado y la FR total. Si el ventilador muestra otro valor, escríbelo aquí.</div>
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

function PesoIdeal({ ctx }: { ctx: ContextoCama }) {
  const { ep, pbw } = ctx;
  const { repo } = useServicios();
  const [editando, setEditando] = useState(false);
  const [talla, setTalla] = useState(String(ep.tallaCm));
  const [origen, setOrigen] = useState(ep.tallaOrigen);
  useEffect(() => {
    if (!editando) {
      setTalla(String(ep.tallaCm));
      setOrigen(ep.tallaOrigen);
    }
  }, [ep.tallaCm, ep.tallaOrigen, editando]);

  const guardar = async (): Promise<void> => {
    const t = medicionDe(talla);
    if (t !== null && t >= 100 && t <= 230) await repo.guardarEpisodio({ ...ep, tallaCm: t, tallaOrigen: origen });
    setEditando(false);
  };

  if (!editando) {
    return (
      <div className="small ink2">
        Peso ideal <b className="mono">{pbw} kg</b> · talla {ep.tallaCm} cm ({ep.tallaOrigen === "MEDIDA" ? "medida" : "estimada"}){" "}
        <button type="button" className="linkbtn" style={{ padding: "0 0 0 6px" }} onClick={() => setEditando(true)}>editar</button>
      </div>
    );
  }
  return (
    <div className="card stack" style={{ padding: 10, gap: 8 }}>
      <div className="small ink2">Talla para el peso ideal</div>
      <div className="row">
        <div className="f inl" style={{ marginLeft: 0 }}>
          <input inputMode="numeric" value={talla} aria-label="Talla en cm" onChange={(e) => setTalla(e.target.value)} />
          <span className="small muted">cm</span>
        </div>
        <Seg etiqueta="Origen de la talla" valor={origen} opciones={[{ valor: "ESTIMADA", texto: "Estimada" }, { valor: "MEDIDA", texto: "Medida" }]} onCambio={setOrigen} />
        <button type="button" className="btn sm primary" onClick={() => void guardar()}>Listo</button>
      </div>
    </div>
  );
}

function PanelEquipos({ ctx }: { ctx: ContextoCama }) {
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
