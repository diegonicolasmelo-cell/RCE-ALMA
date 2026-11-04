import { useState } from "react";
import {
  DESTINOS_IMAGEN,
  FARMACOS_BNM,
  MUESTRAS_CULTIVO,
  PROCEDIMIENTOS_MEDICOS,
  bnmVigente,
  describirEvento,
  esViaAereaArtificial,
  estadoProno
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

export function TabEventos({ ctx }: { ctx: ContextoCama }) {
  const { ep, eventos, ahora, rutAutor } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});

  const prono = estadoProno(eventos, ahora);
  const bnm = bnmVigente(eventos);

  const grupos: { titulo: string; items: Item[] }[] = [
    {
      titulo: "Vía aérea",
      items: [
        { k: "extub", texto: "Extubación programada", req: "art", campos: [{ id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }], crear: (v, b) => ({ ...b, tipo: "EXTUBACION_PROGRAMADA", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) },
        { k: "reint", texto: "Reintubación / IOT", req: "nat", campos: [{ id: "via", etiqueta: "Vía", opciones: lista(["TET", "TQT"]) }, { id: "cal", etiqueta: "Calibre" }, { id: "fij", etiqueta: "Fijación (cm a la comisura)" }], crear: (v, b) => ({ ...b, tipo: "REINTUBACION", via: v["via"] === "TQT" ? "TQT" : "TET", calibre: v["cal"] ?? "", fijacionCm: v["fij"] ?? "" }) },
        { k: "traq", texto: "Traqueostomía", req: "art", campos: [{ id: "cal", etiqueta: "Calibre" }], crear: (v, b) => ({ ...b, tipo: "TRAQUEOSTOMIA", calibre: v["cal"] ?? "" }) },
        { k: "ajuste", texto: "Ajustar posición del tubo", req: "art", campos: [{ id: "cm", etiqueta: "Centímetros a la comisura", valor: ep.fijacionCm ?? "" }, { id: "mot", etiqueta: "Motivo", opciones: [{ valor: "DESPLAZAMIENTO_SUPERFICIAL", texto: "Desplazamiento superficial" }, { valor: "CONTROL_RADIOLOGICO", texto: "Control radiológico" }] }], crear: (v, b) => ({ ...b, tipo: "AJUSTE_TUBO", fijacionCm: v["cm"] ?? "", motivo: (v["mot"] ?? "DESPLAZAMIENTO_SUPERFICIAL") as MotivoAjusteTubo }) },
        { k: "autoext", texto: "Autoextubación", req: "art", peligro: true, campos: [{ id: "txt", etiqueta: "Qué pasó (breve)" }, { id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "AUTOEXTUBACION", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) }
      ]
    },
    {
      titulo: "Posición y bloqueo",
      items: [
        prono.enProno
          ? { k: "supinar", texto: "Supinar", req: "art", crear: (_v, b) => ({ ...b, tipo: "SUPINACION" }) }
          : { k: "prono", texto: "Iniciar prono", req: "art", crear: (_v, b) => ({ ...b, tipo: "INICIO_PRONO" }) },
        bnm
          ? { k: "bnmfin", texto: "Suspender bloqueo neuromuscular", req: "art", crear: (_v, b) => ({ ...b, tipo: "FIN_BNM" }) }
          : { k: "bnmini", texto: "Iniciar bloqueo neuromuscular", req: "art", campos: [{ id: "far", etiqueta: "Fármaco", opciones: lista(FARMACOS_BNM) }], crear: (v, b) => ({ ...b, tipo: "INICIO_BNM", farmaco: v["far"] ?? FARMACOS_BNM[0] ?? "" }) }
      ]
    },
    {
      titulo: "Procedimientos",
      items: [
        { k: "fbc", texto: "Asistencia en fibrobroncoscopía", crear: (_v, b) => ({ ...b, tipo: "ASISTENCIA_FBC" }) },
        { k: "cult", texto: "Toma de cultivo", campos: [{ id: "mu", etiqueta: "Muestra", opciones: lista(MUESTRAS_CULTIVO) }], crear: (v, b) => ({ ...b, tipo: "TOMA_CULTIVO", muestra: v["mu"] ?? MUESTRAS_CULTIVO[0] ?? "" }) },
        { k: "img", texto: "Traslado a imagenología", campos: [{ id: "dst", etiqueta: "Destino", opciones: lista(DESTINOS_IMAGEN) }], crear: (v, b) => ({ ...b, tipo: "TRASLADO_IMAGEN", destino: v["dst"] ?? DESTINOS_IMAGEN[0] ?? "" }) },
        { k: "asist", texto: "Asistencia en procedimiento", campos: [{ id: "pr", etiqueta: "Procedimiento", opciones: lista(PROCEDIMIENTOS_MEDICOS) }], crear: (v, b) => ({ ...b, tipo: "ASISTENCIA_PROCEDIMIENTO", procedimiento: v["pr"] ?? PROCEDIMIENTOS_MEDICOS[0] ?? "" }) },
        { k: "hmef", texto: "Cambio de filtro HMEF", crear: (_v, b) => ({ ...b, tipo: "CAMBIO_HMEF" }) }
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
    const ahoraReal = new Date();
    const comentario = it.comentarioDe ? (v[it.comentarioDe] ?? "") : "";
    const ev = it.crear(v, baseEvento(ep, rutAutor, ahoraReal, comentario));
    await repo.registrarEvento(ev);
    setAbierto(null);
    setValores({});
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
      {(prono.enProno || bnm) && (
        <div className="row">
          {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
          {bnm && <Pildora tipo="crit">Bloqueo neuromuscular en curso</Pildora>}
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
