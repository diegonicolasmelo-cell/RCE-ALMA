import { useState } from "react";
import {
  DESTINOS_IMAGEN,
  MUESTRAS_CULTIVO,
  PROCEDIMIENTOS_MEDICOS,
  describirEvento,
  esViaAereaArtificial,
  estadoProno,
  vigenciaFiltros,
  ETIQUETA_ELEMENTO,
  ETIQUETA_MODALIDAD,
  ETIQUETA_MOTIVO_CAMBIO
} from "@core/index";
import type { DispositivoPosterior, EventoClinico, MotivoAjusteTubo, MotivoCambioVia } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { Pildora } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { casillaNumerica } from "./TecladoPropio";
import { CorregirVia } from "./CorregirVia";

type Base = ReturnType<typeof baseEvento>;
interface Opcion { valor: string; texto: string }
interface CampoForm { id: string; etiqueta: string; opciones?: readonly Opcion[]; valor?: string; /** Casilla numerica: usa el teclado propio. */ num?: boolean }
interface Item {
  k: string;
  texto: string;
  /** Con que via aerea se ofrece: artificial (TET o TQT), natural, solo TET o solo TQT. */
  req?: "art" | "nat" | "tet" | "tqt";
  peligro?: boolean;
  deshabilitado?: boolean;
  campos?: readonly CampoForm[];
  /** El texto libre "Qué pasó" va como comentario del evento. */
  comentarioDe?: string;
  crear: (v: Record<string, string>, base: Base) => EventoClinico;
}

const DISPOSITIVOS: readonly Opcion[] = [
  { valor: "CNAF", texto: "CNAF" },
  { valor: "VMNI", texto: "VMNI" },
  { valor: "O2_CONVENCIONAL", texto: "O₂ convencional" },
  { valor: "AIRE_AMBIENTE", texto: "Aire ambiente" }
];
const lista = (xs: readonly string[]): readonly Opcion[] => xs.map((x) => ({ valor: x, texto: x }));

/** Eventos que cambian la via aerea: despues de registrarlos se sigue con el control. */
const CAMBIAN_VIA = ["extub", "reint", "traq", "autoext", "decan"];

const MOTIVOS_CAMBIO: readonly Opcion[] = (Object.keys(ETIQUETA_MOTIVO_CAMBIO) as MotivoCambioVia[]).map((k) => ({
  valor: k,
  texto: ETIQUETA_MOTIVO_CAMBIO[k].charAt(0).toUpperCase() + ETIQUETA_MOTIVO_CAMBIO[k].slice(1)
}));

/**
 * `onCambioVia`: que hacer tras un evento que cambia la via aerea (intubacion, extubacion,
 * TQT). El evento lleva al control post evento: el registro sigue al hecho.
 */
export function TabEventos({ ctx, onCambioVia }: { ctx: ContextoCama; onCambioVia?: (texto: string) => void }) {
  const { ep, eventos, ahora, rutAutor } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});

  const prono = estadoProno(eventos, ahora);
  // Si ya se retiro la via aerea en este episodio, la proxima intubacion es REintubacion.
  const yaRetiradaVia = eventos.some((e) => e.tipo === "EXTUBACION_PROGRAMADA" || e.tipo === "AUTOEXTUBACION" || e.tipo === "DECANULACION");

  const grupos: { titulo: string; items: Item[] }[] = [
    {
      titulo: "Vía aérea",
      items: [
        { k: "extub", texto: "Extubación programada", req: "tet", campos: [{ id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }], crear: (v, b) => ({ ...b, tipo: "EXTUBACION_PROGRAMADA", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) },
        { k: "reint", texto: yaRetiradaVia ? "Reintubación" : "Intubación", req: "nat", campos: [{ id: "via", etiqueta: "Vía", opciones: lista(["TET", "TQT"]) }, { id: "cal", etiqueta: "Calibre", num: true }, { id: "fij", etiqueta: "Fijación (cm en la arcada dental)", num: true }, { id: "talla", etiqueta: "Talla (cm) · para el peso ideal", valor: String(ep.tallaCm), num: true }, { id: "sexo", etiqueta: "Sexo", valor: ep.sexo, opciones: [{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }] }], crear: (v, b) => ({ ...b, tipo: "REINTUBACION", via: v["via"] === "TQT" ? "TQT" : "TET", calibre: v["cal"] ?? "", fijacionCm: v["via"] === "TQT" ? "" : v["fij"] ?? "" }) },
        { k: "traq", texto: "Traqueostomía", req: "tet", campos: [{ id: "cal", etiqueta: "Calibre", num: true }], crear: (v, b) => ({ ...b, tipo: "TRAQUEOSTOMIA", calibre: v["cal"] ?? "" }) },
        { k: "ajuste", texto: "Ajustar posición del tubo", req: "tet", campos: [{ id: "cm", etiqueta: "Centímetros en la arcada dental", valor: ep.fijacionCm ?? "", num: true }, { id: "mot", etiqueta: "Motivo", opciones: [{ valor: "DESPLAZAMIENTO_SUPERFICIAL", texto: "Desplazamiento superficial" }, { valor: "CONTROL_RADIOLOGICO", texto: "Control radiológico" }] }], crear: (v, b) => ({ ...b, tipo: "AJUSTE_TUBO", fijacionCm: v["cm"] ?? "", motivo: (v["mot"] ?? "DESPLAZAMIENTO_SUPERFICIAL") as MotivoAjusteTubo }) },
        {
          k: "cambioTubo", texto: "Cambio de tubo", req: "tet",
          campos: [{ id: "cal", etiqueta: "Calibre del tubo nuevo", valor: ep.calibreVia ?? "", num: true }, { id: "fij", etiqueta: "Fijación (cm en la arcada dental)", valor: ep.fijacionCm ?? "", num: true }, { id: "mot", etiqueta: "Motivo", opciones: MOTIVOS_CAMBIO }],
          crear: (v, b) => ({ ...b, tipo: "CAMBIO_TUBO", calibre: (v["cal"] ?? "").trim(), fijacionCm: (v["fij"] ?? "").trim(), motivo: (v["mot"] ?? "OTRO") as MotivoCambioVia })
        },
        {
          k: "cambioCanula", texto: "Cambio de cánula", req: "tqt",
          campos: [{ id: "cal", etiqueta: "Calibre de la cánula nueva", valor: ep.calibreVia ?? "", num: true }, { id: "mot", etiqueta: "Motivo", opciones: MOTIVOS_CAMBIO }],
          crear: (v, b) => ({ ...b, tipo: "CAMBIO_CANULA", calibre: (v["cal"] ?? "").trim(), motivo: (v["mot"] ?? "OTRO") as MotivoCambioVia })
        },
        {
          k: "decan", texto: "Decanulación", req: "tqt",
          campos: [{ id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }, { id: "acc", etiqueta: "¿Fue planificada?", opciones: [{ valor: "no", texto: "Sí, planificada" }, { valor: "si", texto: "No: accidental" }] }],
          crear: (v, b) => ({ ...b, tipo: "DECANULACION", dispositivo: (v["disp"] ?? "CNAF") as Exclude<DispositivoPosterior, "REINTUBACION_INMEDIATA">, accidental: v["acc"] === "si" })
        },
        { k: "autoext", texto: "Autoextubación", req: "tet", peligro: true, campos: [{ id: "txt", etiqueta: "Qué pasó (breve)" }, { id: "disp", etiqueta: "Queda en", opciones: [...DISPOSITIVOS, { valor: "REINTUBACION_INMEDIATA", texto: "Reintubación inmediata" }] }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "AUTOEXTUBACION", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) }
      ]
    },
    {
      titulo: "Posición",
      items: [
        prono.enProno
          ? { k: "supinar", texto: "Supinar", req: "art", crear: (_v, b) => ({ ...b, tipo: "SUPINACION" }) }
          : { k: "prono", texto: "Iniciar prono", req: "art", crear: (_v, b) => ({ ...b, tipo: "INICIO_PRONO" }) }
      ]
    },
    {
      titulo: "Procedimientos",
      items: [
        { k: "fbc", texto: "Asistencia en fibrobroncoscopía", crear: (_v, b) => ({ ...b, tipo: "ASISTENCIA_FBC" }) },
        { k: "cult", texto: "Toma de cultivo", campos: [{ id: "mu", etiqueta: "Muestra", opciones: lista(MUESTRAS_CULTIVO) }], crear: (v, b) => ({ ...b, tipo: "TOMA_CULTIVO", muestra: v["mu"] ?? MUESTRAS_CULTIVO[0] ?? "" }) },
        { k: "img", texto: "Traslado a imagenología", campos: [{ id: "dst", etiqueta: "Destino", opciones: lista(DESTINOS_IMAGEN) }], crear: (v, b) => ({ ...b, tipo: "TRASLADO_IMAGEN", destino: v["dst"] ?? DESTINOS_IMAGEN[0] ?? "" }) },
        { k: "asist", texto: "Asistencia en procedimiento", campos: [{ id: "pr", etiqueta: "Procedimiento", opciones: lista(PROCEDIMIENTOS_MEDICOS) }], crear: (v, b) => ({ ...b, tipo: "ASISTENCIA_PROCEDIMIENTO", procedimiento: v["pr"] ?? PROCEDIMIENTOS_MEDICOS[0] ?? "" }) },
        { k: "hme", texto: "Cambio de filtro HME", req: "art", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_HMEF" }) },
        { k: "trach", texto: "Cambio de TrachCare", req: "art", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_FILTRO", elemento: "TRACHCARE" }) },
        { k: "hepa", texto: "Cambio de filtro HEPA", req: "art", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_FILTRO", elemento: "HEPA" }) }
      ]
    },
    {
      titulo: "Críticos",
      items: [
        { k: "pcr", texto: "Paro cardiorrespiratorio", peligro: true, campos: [{ id: "min", etiqueta: "Duración de la reanimación (min)", num: true }, { id: "txt", etiqueta: "Qué pasó (breve)" }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "PCR", duracionReanimacionMin: Number(v["min"]?.replace(",", ".")) || 0 }) },
        { k: "cent", texto: "Evento centinela u otro evento adverso", peligro: true, campos: [{ id: "txt", etiqueta: "Descripción" }], crear: (v, b) => ({ ...b, tipo: "EVENTO_CENTINELA", descripcion: v["txt"] ?? "" }) }
      ]
    }
  ];

  const todos = grupos.flatMap((g) => g.items);
  /** Cada evento solo con la via que corresponde (lo del tubo con TET, lo de la canula con TQT). */
  const aplica = (it: Item): boolean =>
    !it.req ||
    (it.req === "art" && esViaAereaArtificial(ep.viaAereaActual)) ||
    (it.req === "nat" && ep.viaAereaActual === "NATURAL") ||
    (it.req === "tet" && ep.viaAereaActual === "TET") ||
    (it.req === "tqt" && ep.viaAereaActual === "TQT");
  const item = abierto ? todos.find((i) => i.k === abierto) : undefined;
  const artificial = esViaAereaArtificial(ep.viaAereaActual);

  const registrar = async (it: Item, v: Record<string, string>): Promise<void> => {
    const numOk = (x: string | undefined, min: number, max: number): boolean => {
      const n = Number((x ?? "").replace(",", "."));
      return (x ?? "").trim() !== "" && Number.isFinite(n) && n >= min && n <= max;
    };
    if ((it.k === "cambioTubo" || it.k === "cambioCanula" || it.k === "traq") && !numOk(v["cal"], 2, 12)) return avisar("Revisa el calibre (entre 2 y 12).");
    if (it.k === "cambioTubo" && !numOk(v["fij"], 10, 35)) return avisar("Revisa los cm en la arcada (entre 10 y 35).");
    if (it.k === "ajuste" && !numOk(v["cm"], 10, 35)) return avisar("Revisa los cm en la arcada (entre 10 y 35).");
    if (it.k === "reint") {
      const t = Number((v["talla"] ?? "").replace(",", "."));
      if ((v["cal"] ?? "").trim() === "") return avisar("Falta el calibre.");
      if (v["via"] !== "TQT" && (v["fij"] ?? "").trim() === "") return avisar("Faltan los cm en la arcada dental.");
      if (!Number.isFinite(t) || t < 100 || t > 230) return avisar("Revisa la talla: entre 100 y 230 cm.");
      // Talla y sexo son del paciente: si se corrigieron aqui, se corrigen en el episodio.
      const sexo = v["sexo"] === "F" ? "F" : "M";
      if (t !== ep.tallaCm || sexo !== ep.sexo) await repo.guardarEpisodio({ ...ep, tallaCm: t, sexo });
    }
    const ahoraReal = new Date();
    const comentario = it.comentarioDe ? (v[it.comentarioDe] ?? "") : "";
    const ev = it.crear(v, baseEvento(ep, rutAutor, ahoraReal, comentario));
    await repo.registrarEvento(ev);
    setAbierto(null);
    setValores({});
    // Autoextubacion con reintubacion inmediata: se sigue por el mismo camino de la intubacion.
    if (it.k === "autoext" && v["disp"] === "REINTUBACION_INMEDIATA") {
      const reint = todos.find((x) => x.k === "reint");
      if (reint?.campos) {
        setAbierto("reint");
        setValores(Object.fromEntries(reint.campos.map((c) => [c.id, c.valor ?? c.opciones?.[0]?.valor ?? ""])));
      }
      avisar("Autoextubación registrada. Ahora registra la reintubación: el tubo, los cm y la hora.");
      return;
    }
    if (CAMBIAN_VIA.includes(it.k) && onCambioVia) {
      onCambioVia(`${it.texto} registrada. Sigue con el control post evento.`);
      return;
    }
    avisar(it.peligro ? "Evento registrado. El PC ya muestra la alerta con el informe pre-llenado." : "Evento registrado.");
  };

  const clic = (it: Item): void => {
    if (it.campos) {
      setAbierto(it.k);
      setValores(Object.fromEntries(it.campos.map((c) => [c.id, c.valor ?? c.opciones?.[0]?.valor ?? ""])));
    } else {
      void registrar(it, {});
    }
  };

  // Linea de tiempo: todo lo que paso en la cama, del mas nuevo al mas antiguo, con su fecha y hora.
  const [todo, setTodo] = useState(false);
  const linea = [
    ...eventos.map((e) => ({ id: e.id, en: ("realizadaEn" in e && typeof e.realizadaEn === "string" ? e.realizadaEn : e.registradoEn), texto: describirEvento(e, eventos), fuerte: e.tipo !== "EVALUACION_PUNTUAL" && e.tipo !== "CAMBIO_HMEF" && e.tipo !== "CAMBIO_FILTRO" })),
    ...ctx.controles.map((c) => ({ id: c.id, en: c.registradoEn, texto: `Control · ${ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? c.ventilacion.modalidad}`, fuerte: false }))
  ].sort((a, b) => b.en.localeCompare(a.en));
  const visibles = todo ? linea : linea.slice(0, 10);
  const cuando = (iso: string): string => {
    const d = new Date(iso);
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
    const dia = d.toDateString() === ahora.toDateString() ? "hoy" : d.toDateString() === ayer.toDateString() ? "ayer" : `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `${dia} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <>
      <CorregirVia key={`${ep.calibreVia}-${ep.fijacionCm}`} ep={ep} rutAutor={rutAutor} />
      {prono.enProno && (
        <div className="row">
          {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
        </div>
      )}

      {item?.campos && (
        <div className="card stack" style={{ padding: 12, gap: 8, borderColor: item.peligro ? "var(--crit)" : undefined }}>
          <b>{item.texto}</b>
          {item.campos.map((c) => (
            <div className="f" key={c.id}>
              <label htmlFor={`evf-${c.id}`}>{c.etiqueta}</label>
              {c.opciones ? (
                <select id={`evf-${c.id}`} value={valores[c.id] ?? ""} onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))}>
                  {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                </select>
              ) : (
                <input id={`evf-${c.id}`} {...(c.num ? { ...casillaNumerica(), enterKeyHint: "next" as const } : {})} value={valores[c.id] ?? ""} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} autoComplete="off" onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="row">
            <button type="button" className={item.peligro ? "btn danger" : "btn primary"} onClick={() => void registrar(item, valores)}>Registrar</button>
            <button type="button" className="btn" onClick={() => setAbierto(null)}>Cancelar</button>
          </div>
          {item.peligro && <p className="small muted">Se genera una alerta en el PC con el informe de riesgo ya pre-llenado.</p>}
        </div>
      )}

      {/* Filtros y circuito: solo con via aerea artificial (con via natural no hay HME, HEPA ni TrachCare). */}
      {artificial && (
        <section>
          <h3>Filtros y circuito</h3>
          <ul className="small ink2" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
            {vigenciaFiltros(eventos, ahora).map((v) => (
              <li key={v.elemento}>
                <b>{ETIQUETA_ELEMENTO[v.elemento]}</b>:{" "}
                {v.estado === "SIN_REGISTRO" ? "sin cambio registrado" : v.estado === "VENCIDO" ? `vencido desde el ${v.venceFecha}` : v.estado === "VENCE_HOY" ? `cambiado el ${v.cambiadoEn}, vence hoy` : `cambiado el ${v.cambiadoEn}, vence el ${v.venceFecha}`}
              </li>
            ))}
          </ul>
          <p className="small muted mt">Se anota la fecha solo cuando se cambia; el sistema cuenta el plazo (TrachCare y HEPA 3 días, HME 2).</p>
        </section>
      )}

      {grupos.filter((g) => g.items.some(aplica)).map((g) => (
        <section key={g.titulo}>
          <h3>{g.titulo}</h3>
          <div className="evgrid">
            {/* Lo del tubo y la TQT (extubar, TQT, ajustar el tubo, autoextubacion, filtros, TrachCare y
                prono) no se ofrece con via aerea natural: ni se muestra. Con via artificial, no se ofrece intubar. */}
            {g.items.filter(aplica).map((it) => {
              const off = it.deshabilitado;
              return (
                <button key={it.k} type="button" className={it.peligro ? "btn danger-o" : "btn"} disabled={off} onClick={() => clic(it)}>
                  {it.texto}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {linea.length > 0 && (
        <section aria-label="Línea de tiempo">
          <h3>Línea de tiempo ({linea.length})</h3>
          <ol className="linea-tiempo">
            {visibles.map((x) => (
              <li key={x.id}><span className="mono cuando">{cuando(x.en)}</span><span>{x.fuerte ? <b>{x.texto}</b> : x.texto}</span></li>
            ))}
          </ol>
          {linea.length > 10 && <button type="button" className="linkbtn" onClick={() => setTodo((t) => !t)}>{todo ? "Ver menos" : `Ver todo (${linea.length})`}</button>}
        </section>
      )}
    </>
  );
}
