import { useEffect, useState } from "react";
import { camaRce, hitosDelEpisodio, horasDeVm, nombreCama } from "@core/index";
import type { HistoriaEntrega } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { fichaDe } from "../estacion/Entrega";
import type { ResumenCama } from "./Inicio";
import { textoViaCama } from "./ListaCamas";

const p2 = (n: number): string => String(n).padStart(2, "0");
const fechaHora = (iso: string): string => { const d = new Date(iso); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const ddmm = (yyyymmdd: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyymmdd); return m ? `${m[3]}-${m[2]}` : yyyymmdd; };

type EstadoHistorias = "cargando" | { readonly error: string } | ReadonlyMap<number, HistoriaEntrega>;

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
  const [historias, setHistorias] = useState<EstadoHistorias>("cargando");
  const [vueltas, setVueltas] = useState<ReadonlySet<string>>(new Set());
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
        else setHistorias(new Map(r.historias.map((h) => [h.cama, h])));
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
                {f.resumen && <span className="small ink2">{f.resumen}</span>}
                <span className="ent-sec">Cómo está</span>
                <span className="ent-linea">{textoViaCama(ep, horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, ahora))}</span>
                {f.comoQueda.map((l) => <span key={l} className="ent-linea">{l}</span>)}
                <span className="ent-sec">Hoy</span>
                {f.eventos.map((l) => <span key={l} className="ent-linea">{l}</span>)}
                {pendientes.length > 0 && <div className="ent-pend"><b>Para el que llega</b>{pendientes.map((p) => <span key={p}>{p}</span>)}</div>}
                <span className="ent-giro">Historia ⟲</span>
              </section>
              <section className="ent-cara ent-atras" aria-hidden={!vuelta}>
                <header className="ent-cab"><b>{nombreCama(ep.cama)} · historia</b></header>
                {historias === "cargando" ? <p className="small muted">Buscando la historia…</p>
                  : "error" in historias ? <p className="small muted">{textoSinHistoria((historias as { error: string }).error)}</p>
                    : h ? <blockquote className="ent-historia"><b>Historia escrita en el RCE</b>{h.texto}<small>{h.firma} · {ddmm(h.fecha)}</small></blockquote>
                      : <p className="small muted">Nadie ha guardado la historia de este paciente. Se agrega desde el RCE, en el PC.</p>}
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
