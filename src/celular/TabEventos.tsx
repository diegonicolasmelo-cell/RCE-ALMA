import { useState } from "react";
import {
  DESTINOS_IMAGEN,
  MUESTRAS_CULTIVO,
  PROCEDIMIENTOS_MEDICOS,
  describirEvento,
  esViaAereaArtificial,
  estadoProno,
  vigenciaFiltros,
  ETIQUETA_ELEMENTO
} from "@core/index";
import type { DispositivoPosterior, EventoClinico, MotivoAjusteTubo } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { Pildora } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";

type Base = ReturnType<typeof baseEvento>;
interface Opcion { valor: string; texto: string }
interface CampoForm { id: string; etiqueta: string; opciones?: readonly Opcion[]; valor?: string }
interface Item {
  k: string;
  texto: string;
  req?: "art" | "nat";
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
const CAMBIAN_VIA = ["extub", "reint", "traq", "autoext"];

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

  const grupos: { titulo: string; items: Item[] }[] = [
    {
      titulo: "Vía aérea",
      items: [
        { k: "extub", texto: "Extubación programada", req: "art", campos: [{ id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }], crear: (v, b) => ({ ...b, tipo: "EXTUBACION_PROGRAMADA", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) },
        { k: "reint", texto: "Intubación / reintubación", req: "nat", campos: [{ id: "via", etiqueta: "Vía", opciones: lista(["TET", "TQT"]) }, { id: "cal", etiqueta: "Calibre" }, { id: "fij", etiqueta: "Fijación (cm en la arcada dental)" }, { id: "talla", etiqueta: "Talla (cm) · para el peso ideal", valor: String(ep.tallaCm) }, { id: "sexo", etiqueta: "Sexo", valor: ep.sexo, opciones: [{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }] }], crear: (v, b) => ({ ...b, tipo: "REINTUBACION", via: v["via"] === "TQT" ? "TQT" : "TET", calibre: v["cal"] ?? "", fijacionCm: v["via"] === "TQT" ? "" : v["fij"] ?? "" }) },
        { k: "traq", texto: "Traqueostomía", req: "art", campos: [{ id: "cal", etiqueta: "Calibre" }], crear: (v, b) => ({ ...b, tipo: "TRAQUEOSTOMIA", calibre: v["cal"] ?? "" }) },
        { k: "ajuste", texto: "Ajustar posición del tubo", req: "art", campos: [{ id: "cm", etiqueta: "Centímetros en la arcada dental", valor: ep.fijacionCm ?? "" }, { id: "mot", etiqueta: "Motivo", opciones: [{ valor: "DESPLAZAMIENTO_SUPERFICIAL", texto: "Desplazamiento superficial" }, { valor: "CONTROL_RADIOLOGICO", texto: "Control radiológico" }] }], crear: (v, b) => ({ ...b, tipo: "AJUSTE_TUBO", fijacionCm: v["cm"] ?? "", motivo: (v["mot"] ?? "DESPLAZAMIENTO_SUPERFICIAL") as MotivoAjusteTubo }) },
        { k: "autoext", texto: "Autoextubación", req: "art", peligro: true, campos: [{ id: "txt", etiqueta: "Qué pasó (breve)" }, { id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "AUTOEXTUBACION", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) }
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
        { k: "hme", texto: "Cambio de filtro HME", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_HMEF" }) },
        { k: "trach", texto: "Cambio de TrachCare", req: "art", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_FILTRO", elemento: "TRACHCARE" }) },
        { k: "hepa", texto: "Cambio de filtro HEPA", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_FILTRO", elemento: "HEPA" }) }
      ]
    },
    {
      titulo: "Críticos",
      items: [
        { k: "pcr", texto: "Paro cardiorrespiratorio", peligro: true, campos: [{ id: "min", etiqueta: "Duración de la reanimación (min)" }, { id: "txt", etiqueta: "Qué pasó (breve)" }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "PCR", duracionReanimacionMin: Number(v["min"]?.replace(",", ".")) || 0 }) },
        { k: "cent", texto: "Evento centinela u otro evento adverso", peligro: true, campos: [{ id: "txt", etiqueta: "Descripción" }], crear: (v, b) => ({ ...b, tipo: "EVENTO_CENTINELA", descripcion: v["txt"] ?? "" }) }
      ]
    }
  ];

  const todos = grupos.flatMap((g) => g.items);
  const item = abierto ? todos.find((i) => i.k === abierto) : undefined;
  const artificial = esViaAereaArtificial(ep.viaAereaActual);

  const registrar = async (it: Item, v: Record<string, string>): Promise<void> => {
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

  const recientes = [...eventos].slice(-4).reverse();

  return (
    <>
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
                <input id={`evf-${c.id}`} value={valores[c.id] ?? ""} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} autoComplete="off" onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))} />
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

      {grupos.map((g) => (
        <section key={g.titulo}>
          <h3>{g.titulo}</h3>
          <div className="evgrid">
            {g.items.map((it) => {
              const off = it.deshabilitado || (it.req === "art" && !artificial) || (it.req === "nat" && artificial);
              return (
                <button key={it.k} type="button" className={it.peligro ? "btn danger-o" : "btn"} disabled={off} onClick={() => clic(it)}>
                  {it.texto}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {recientes.length > 0 && (
        <section>
          <h3>Registrados</h3>
          <ul className="small ink2" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
            {recientes.map((e) => (
              <li key={e.id}><span className="mono">{e.hora}</span> {describirEvento(e)}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
