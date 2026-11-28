import { useEffect, useState } from "react";
import { buscarProfesional, camaRce, hitosDelEpisodio, horasDeVm, nombreCama, soloLectura } from "@core/index";
import type { EventoClinico, HistoriaEntrega } from "@core/index";
import { baseEvento } from "./eventos-ui";
import { usePacientesRce } from "./pacientesRce";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { fichaDe } from "../estacion/Entrega";
import type { ResumenCama } from "./Inicio";
import { textoViaCama } from "./ListaCamas";

const p2 = (n: number): string => String(n).padStart(2, "0");
const fechaHora = (iso: string): string => { const d = new Date(iso); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const ddmm = (yyyymmdd: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyymmdd); return m ? `${m[3]}-${m[2]}` : yyyymmdd; };

type EstadoHistorias = "cargando" | { readonly error: string } | ReadonlyMap<number, HistoriaEntrega>;
const HISTORIA_MAX = 1000;
const NOTA_MAX = 300;
const RE_RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/g;
/** Las notas de quien recibe valen para el turno que empieza: se muestran las de las últimas 14 horas. */
const HORAS_NOTA = 14;

/**
 * Lo que anota quien RECIBE el turno (Diego, 26-nov-2026: «si el colega menciona algo que no anotó, él lo
 * puede anotar directamente en la tarjeta»). Es un evento de solo agregar del episodio: lo ven los dos
 * celulares, queda con firma y hora, y no va a ninguna cifra ni al RCE.
 */
function NotasRecibe({ ep, notas }: { ep: ResumenCama["ep"]; notas: readonly Extract<EventoClinico, { tipo: "NOTA_ENTREGA" }>[] }) {
  const { repo } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const lectura = soloLectura(sesion.rol);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const anotar = async (): Promise<void> => {
    const t = texto.replace(RE_RUT, "").trim().slice(0, NOTA_MAX);
    if (!t || guardando) return;
    setGuardando(true);
    try {
      await repo.registrarEvento({ ...baseEvento(ep, sesion.rut, new Date()), tipo: "NOTA_ENTREGA", texto: t });
      setTexto("");
    } finally { setGuardando(false); }
  };
  if (lectura && notas.length === 0) return null;
  return (
    <div className="ent-notas" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <b>Anotado al recibir</b>
      {notas.map((n) => <span key={n.id} className="ent-nota">{n.texto}<small>{n.hora} · {buscarProfesional(n.rutAutor)?.nombre.split(" ")[0] ?? ""}</small></span>)}
      {!lectura && (
        <span className="ent-nota-nueva">
          <input type="text" value={texto} maxLength={NOTA_MAX} placeholder="Lo que te dijeron y no está anotado…" aria-label={`Anotar al recibir · ${nombreCama(ep.cama)}`}
            onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void anotar(); } }} />
          <button type="button" className="btn" disabled={!texto.trim() || guardando} onClick={() => void anotar()}>Anotar</button>
        </span>
      )}
    </div>
  );
}

/** Qué decir si la historia no se pudo guardar. */
function textoNoGuardada(error: string): string {
  if (/HISTORIA_VACIA/.test(error)) return "Escribe algo antes de guardar.";
  if (/HISTORIA_LARGA/.test(error)) return `Pasa de ${HISTORIA_MAX} letras: acórtala.`;
  if (/CAMA_VACIA/.test(error)) return "El RCE no tiene paciente en esa cama.";
  if (/ENLACE_APAGADO/.test(error)) return "El enlace con el RCE está apagado.";
  return "No se pudo guardar. Revisa la señal e inténtalo de nuevo; el texto sigue aquí.";
}

/**
 * Escribir o dictar la historia desde el celular (Diego, 26-nov-2026: «se puede dictar en cualquier
 * momento; de hecho es mejor después, porque uno está preocupado más de controlar»). El dictado es el
 * micrófono del teclado del teléfono: no hay botón propio. Va al RCE y no se guarda en el celular.
 */
function EditorHistoria({ cama, inicial, onGuardada, onCerrar }: {
  cama: number; inicial: string; onGuardada: (h: HistoriaEntrega) => void; onCerrar: () => void;
}) {
  const { api } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const [texto, setTexto] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const guardar = async (): Promise<void> => {
    setGuardando(true); setAviso("");
    const r = await api.guardarHistoria(sesion.rut, cama, texto).catch(() => null);
    setGuardando(false);
    if (r && r.ok) { onGuardada(r.historia); return; }
    setAviso(textoNoGuardada(r && !r.ok ? r.error : "SIN_CONEXION"));
  };
  return (
    <div className="ent-editor" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <label className="small" htmlFor={`hist-${cama}`}><b>Historia clínica</b> · toca el micrófono del teclado para dictar</label>
      <textarea id={`hist-${cama}`} value={texto} maxLength={HISTORIA_MAX} rows={7} onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej.: ingresa por neumonía grave con falla respiratoria; intubado el 23-10; dos PVE fracasadas por taquipnea." />
      <div className="ent-editor-pie">
        <span className="small muted">{texto.length} / {HISTORIA_MAX}</span>
        <button type="button" className="btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void guardar()} disabled={guardando || !texto.trim()}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
      {aviso && <p className="small" role="alert" style={{ margin: 0, color: "var(--rojo, #b3261e)" }}>{aviso}</p>}
      <p className="small muted" style={{ margin: 0 }}>Queda en el RCE con tu firma. Un RUT escrito en el texto se borra al guardar.</p>
    </div>
  );
}

/** Qué decir cuando la historia no llega: cada eslabón tiene su arreglo (Diego, 23-nov-2026). */
function textoSinHistoria(error: string): string {
  switch (error) {
    case "SIN_CONEXION": return "La historia se ve con conexión.";
    case "APAGADO": return "Falta configurar el enlace con el RCE en el servidor de Kaptus (RCE_URL y RCE_TOKEN).";
    case "ACCION_DESCONOCIDA": return "El servidor de Kaptus tiene una versión anterior: falta pegar el Codigo.gs nuevo y publicar.";
    case "RCE_ENLACE_APAGADO": return "El enlace está apagado en el RCE: CONFIG.KAPTUS_ENLACE_ACTIVO tiene que estar en TRUE.";
    case "RCE_TOKEN_INVALIDO": return "La llave del enlace no coincide entre Kaptus y el RCE.";
    case "RCE_ACCION_DESCONOCIDA": case "RCE_PUERTA_CERRADA": return "El RCE publicado es una versión anterior a la 7.13: falta pegarlo y publicar una versión nueva.";
    case "RCE_SIN_RESPUESTA": return "El RCE no respondió. Revisa que la implementación esté publicada para «Cualquier persona».";
    default: return `No llegó la historia (${error}).`;
  }
}

/**
 * Entrega de turno en el celular (Diego, 22-nov-2026): solo mis camas. Cada tarjeta tiene dos caras:
 * adelante cómo está hoy (lo mismo que la entrega de la Estación); al tocarla se da vuelta y atrás
 * está la historia escrita en el RCE y los hitos del episodio. La historia se pide al abrir esta
 * pantalla y vive solo aquí: no se guarda en el celular.
 */
export function EntregaCel({ resumen, ahora }: { resumen: readonly ResumenCama[]; ahora: Date }) {
  const { api } = useServicios();
  const irA = useApp((s) => s.irA);
  const pacientes = usePacientesRce((s) => s.porCama);
  const [historias, setHistorias] = useState<EstadoHistorias>("cargando");
  const [vueltas, setVueltas] = useState<ReadonlySet<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const lectura = soloLectura(useApp((s) => s.sesion)?.rol);
  const guardada = (h: HistoriaEntrega): void => {
    setHistorias((prev) => {
      const m = new Map(prev instanceof Map ? prev : []);
      const antes = m.get(h.cama);
      m.set(h.cama, { ...antes, ...h, pendientes: antes?.pendientes ?? [], ...(antes?.plan ? { plan: antes.plan } : {}) });
      return m;
    });
    setEditando(null);
  };
  const camas = resumen.map((r) => camaRce(r.ep.cama)).filter((n): n is number => n !== null);
  const clave = camas.join(",");
  useEffect(() => {
    let vivo = true;
    setHistorias("cargando");
    api.leerHistorias(camas)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) setHistorias({ error: r.error });
        else if (r.estado === "apagado") setHistorias({ error: "APAGADO" });
        else { setHistorias(new Map(r.historias.map((h) => [h.cama, h]))); if (r.pacientes) usePacientesRce.getState().poner(r.pacientes); }
      })
      .catch(() => { if (vivo) setHistorias({ error: "SIN_CONEXION" }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, clave]);

  if (resumen.length === 0) {
    return (
      <div className="cel-cuerpo">
        <p className="muted">Todavía no eliges tus camas de este turno.</p>
        <button type="button" className="btn primary" onClick={() => irA("elegir")}>Elegir mis camas</button>
      </div>
    );
  }
  const girar = (id: string): void => setVueltas((v) => { const x = new Set(v); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const orden = [...resumen].sort((a, b) => a.ep.cama.localeCompare(b.ep.cama, "es", { numeric: true }));

  return (
    <div className="cel-cuerpo entrega-cel" aria-label="Entrega">
      <p className="small muted" style={{ margin: 0 }}>Toca una tarjeta para ver la historia y los hitos del paciente.</p>
      {orden.map(({ ep, controles, eventos }) => {
        const f = fichaDe(ep, controles, eventos, undefined, ahora);
        const n = camaRce(ep.cama);
        const h = historias instanceof Map && n !== null ? historias.get(n) ?? null : null;
        const hitos = hitosDelEpisodio(ep, eventos);
        const vuelta = vueltas.has(ep.id);
        // «Para el que llega»: lo escrito en el RCE (pendiente y plan de la última evolución, v7.15),
        // lo anotado en la Estación y lo que la app sabe que toca (post extubación, filtros…).
        const pendientes = [...(h?.pendientes ?? []), h?.plan ? `Plan: ${h.plan}` : "", ep.pendienteEntrega.trim(), ...f.atencion.filter((a) => a !== "Nada pendiente registrado")].filter(Boolean);
        return (
          <div
            key={ep.id}
            className={`ent-tarjeta${vuelta ? " vuelta" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={vuelta}
            aria-label={`${nombreCama(ep.cama)}: ${vuelta ? "ver cómo está hoy" : "ver la historia"}`}
            onClick={() => girar(ep.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); girar(ep.id); } }}
          >
            <div className="ent-in">
              <section className="ent-cara" aria-hidden={vuelta}>
                <header className="ent-cab"><b>{nombreCama(ep.cama)}</b>{ep.faseClinica && <span className="ent-fase">{ep.faseClinica}</span>}</header>
                {n !== null && pacientes.get(n) && <span className="ent-paciente">{pacientes.get(n)!.nombre}{pacientes.get(n)!.edad ? ` · ${pacientes.get(n)!.edad} años` : ""}</span>}
                {f.resumen && <span className="small ink2">{f.resumen}</span>}
                <span className="ent-sec">Cómo está</span>
                <span className="ent-linea">{textoViaCama(ep, horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, ahora))}</span>
                {f.comoQueda.map((l) => <span key={l} className="ent-linea">{l}</span>)}
                <span className="ent-sec">Hoy</span>
                {f.eventos.map((l) => <span key={l} className="ent-linea">{l}</span>)}
                {pendientes.length > 0 && <div className="ent-pend"><b>Para el que llega</b>{pendientes.map((p) => <span key={p}>{p}</span>)}</div>}
                <NotasRecibe ep={ep} notas={eventos.filter((x): x is Extract<EventoClinico, { tipo: "NOTA_ENTREGA" }> => x.tipo === "NOTA_ENTREGA" && ahora.getTime() - new Date(x.registradoEn).getTime() < HORAS_NOTA * 3600000)} />
                <span className="ent-giro">Historia ⟲</span>
              </section>
              <section className="ent-cara ent-atras" aria-hidden={!vuelta}>
                <header className="ent-cab"><b>{nombreCama(ep.cama)} · historia</b></header>
                {editando === ep.id && n !== null
                  ? <EditorHistoria cama={n} inicial={h?.texto ?? ""} onGuardada={guardada} onCerrar={() => setEditando(null)} />
                  : historias === "cargando" ? <p className="small muted">Buscando la historia…</p>
                    : "error" in historias ? <p className="small muted">{textoSinHistoria((historias as { error: string }).error)}</p>
                      : h && h.texto ? <blockquote className="ent-historia"><b>Historia</b>{h.texto}<small>{h.firma} · {ddmm(h.fecha)}</small></blockquote>
                        : <p className="small muted">Nadie ha escrito la historia de este paciente.</p>}
                {!lectura && editando !== ep.id && n !== null && historias !== "cargando" && !(typeof historias === "object" && "error" in historias && (historias as { error: string }).error === "APAGADO") && (
                  <button type="button" className="btn ent-escribir" onClick={(e) => { e.stopPropagation(); setEditando(ep.id); }}>
                    {h && h.texto ? "Editar historia" : "Escribir o dictar la historia"}
                  </button>
                )}
                {/* Los hitos van plegados: lo que se lee primero es la historia (Diego, 23-nov-2026).
                    Abrirlos no da vuelta la tarjeta. */}
                <details className="ent-hitos-pl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <summary>Hitos del episodio{hitos.length ? ` (${hitos.length})` : ""}</summary>
                  {hitos.length === 0 ? <span className="small muted">Sin hitos registrados</span>
                    : <ol className="ent-hitos">{hitos.map((x) => <li key={`${x.en}-${x.texto}`}><span>{fechaHora(x.en)}</span>{x.texto}</li>)}</ol>}
                </details>
                <span className="ent-giro">Hoy ⟲</span>
              </section>
            </div>
          </div>
        );
      })}
    </div>
  );
}
