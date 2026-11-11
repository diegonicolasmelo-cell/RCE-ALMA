import { ArrowLeftRight, ClipboardList, Stethoscope, Timer, Zap } from "lucide-react";
import { Fragment, useState } from "react";
import {
  CAMAS_UNIDAD,
  botonExtubacion,
  nombreCama,
  apkVigente,
  esViaAereaArtificial,
  estadoFlujoPve,
  estadoProno,
  filtrosPorCambiar,
  bnmEnCurso,
  bnmVigente,
  ETIQUETA_ELEMENTO,
  ETIQUETA_MODALIDAD,
  horasDeVm
} from "@core/index";
import type { Control, Episodio, EventoClinico, HorasVm, ValidacionApk } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora, useConsulta } from "../app/hooks";
import { useApp } from "../app/store";
import { Pildora } from "./componentes";
import { IngresoRapido } from "./IngresoRapido";

interface Fila {
  readonly ep: Episodio;
  readonly ultimo: Control | null;
  readonly eventos: readonly EventoClinico[];
  readonly apks: readonly ValidacionApk[];
}

const haceTexto = (min: number): string => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

/** Camas como tarjetas: de cada una se va a un control o a una evaluacion puntual. */
export function ListaCamas() {
  const { repo } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const irA = useApp((s) => s.irA);
  const pedirEvento = useApp((s) => s.pedirEvento);
  const misCamas = useApp((s) => s.misCamas);
  const ahora = useAhora(30_000);
  const [ingresando, setIngresando] = useState<string | null>(null);

  // null mientras carga: asi una cama ocupada nunca se ve un instante como «Sin ingreso».
  const filas = useConsulta<readonly Fila[] | null>(
    async () => {
      const episodios = await repo.episodiosActivos();
      return Promise.all(
        episodios.map(async (ep) => ({
          ep,
          ultimo: (await repo.controlesDe(ep.id)).at(-1) ?? null,
          eventos: await repo.eventosDe(ep.id),
          apks: await repo.apkDe(ep.id)
        }))
      );
    },
    [repo],
    null
  );

  const porCama = new Map((filas ?? []).map((f) => [f.ep.cama, f] as const));
  const esMiaCama = (c: string): boolean => {
    if (misCamas) return misCamas.includes(c);
    const f = porCama.get(c);
    return f ? f.ep.rutTitular === sesion.rut : false;
  };
  // Las 18 camas en una columna: las mias primero (de la primera a la ultima) y despues las
  // demas, tambien en orden. Las libres van en su lugar, listas para ingresar.
  const orden = [...CAMAS_UNIDAD.filter(esMiaCama), ...CAMAS_UNIDAD.filter((c) => !esMiaCama(c))];
  const nMias = orden.filter(esMiaCama).length;

  if (!filas) return <div className="cel-cuerpo"><p className="muted">Cargando camas…</p></div>;

  return (
    <div className="cel-cuerpo" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Mis camas ({nMias})</h3>
        <button type="button" className="linkbtn" onClick={() => irA("elegir")}>Cambiar mis camas</button>
      </div>
      {nMias === 0 && <p className="small muted">No elegiste camas. Puedes abrir cualquiera de abajo o usar «Cambiar mis camas».</p>}
      {orden.map((cama, i) => {
        const encabezadoOtras = i === nMias && nMias > 0 && <h3 style={{ margin: "8px 0 0" }}>Otras camas</h3>;
        const fila = porCama.get(cama);
        if (!fila) {
          return (
            <Fragment key={cama}>
              {encabezadoOtras}
              <article className="card stack cama-sin" style={{ padding: 12, gap: 8 }} aria-label={`Cama ${cama}`}>
                <header className="row" style={{ justifyContent: "space-between" }}>
                  <b className="cama-num">{cama}</b>
                </header>
                <div className="small ink2">Sin ingreso</div>
                {ingresando === cama ? (
                  <IngresoRapido key={cama} cama={cama} onCancelar={() => setIngresando(null)} />
                ) : (
                  <button type="button" className="btn primary" aria-label={`Ingresar ${nombreCama(cama)}`} onClick={() => setIngresando(cama)}>Ingresar</button>
                )}
              </article>
            </Fragment>
          );
        }
        const { ep, ultimo, eventos, apks } = fila;
        const minutos = ultimo ? Math.max(0, Math.round((ahora.getTime() - Date.parse(ultimo.registradoEn)) / 60000)) : null;
        const apk = apkVigente(apks, ep.id, ahora);
        const flujo = estadoFlujoPve(eventos, ahora);
        const prono = estadoProno(eventos, ahora);
        // Con via aerea natural no hay filtros ni TrachCare que cambiar.
        const cambios = esViaAereaArtificial(ep.viaAereaActual) ? filtrosPorCambiar(eventos, ahora) : [];
        const duePost = flujo.bloque?.momentos.find((m) => !m.registrado && m.minutosFaltantes <= 0 && m.id !== "48H");
        const propia = esMiaCama(cama);
        // Un solo boton de extubacion: fuera de protocolo antes de las 24 h de VM, PVE despues.
        const boton = botonExtubacion(ep, ultimo ? { modalidad: ultimo.ventilacion.modalidad, registradoEn: ultimo.registradoEn } : null, eventos, null, ahora);
        const pve = boton?.tipo === "PVE" ? boton.acceso : null;
        const h = horasDeVm(ep, eventos, null, ahora);
        return (
          <Fragment key={ep.id}>
          {encabezadoOtras}
          <article className="card stack" style={{ padding: 12, gap: 8 }} aria-label={`Cama ${ep.cama}`}>
            <header className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <b className="cama-num">{ep.cama}</b>
                {/* Las flechas cambian al paciente de cama (solo a camas libres). */}
                <button
                  type="button"
                  className="btn-cambiar-cama"
                  aria-label={`Cambiar de cama · ${nombreCama(ep.cama)}`}
                  title="Cambiar al paciente de cama"
                  onClick={() => { pedirEvento("traslado"); irA("eventos", ep.id); }}
                >
                  <ArrowLeftRight size={17} aria-hidden />
                </button>
              </span>
              <span className="small muted" style={{ textAlign: "right" }}>
                {ultimo ? `último ${ultimo.hora} · ${ETIQUETA_MODALIDAD[ultimo.ventilacion.modalidad] ?? "sin modo"}${minutos !== null && minutos >= 60 ? ` · hace ${haceTexto(minutos)}` : ""}` : "sin controles"}
              </span>
            </header>
            <div className="small ink2">
              {textoViaCama(ep, h)}
              {ep.viaAereaActual === "TET" && h && h.horas >= 48 && <> · <b style={{ color: "var(--crit-ink)" }}>NAVM ≥ 48 h</b></>}
              {!propia && " · de otro colega"}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Pildora tipo={apk ? (apk.resultado === "CUMPLE" ? "good" : "crit") : ""}>{apk ? (apk.resultado === "CUMPLE" ? "APK firmada" : "APK no cumple") : "APK pendiente"}</Pildora>
              {flujo.fase === "EN_CURSO" && <Pildora tipo="acc">PVE {flujo.pve.minutosTranscurridos}/{flujo.pve.duracionMin} min</Pildora>}
              {duePost && <Pildora tipo="warn">Post extub. {duePost.etiqueta}</Pildora>}
              {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
              {(bnmVigente(eventos) || bnmEnCurso(ultimo?.infusiones)) && <Pildora tipo="crit">BNM</Pildora>}
              {cambios.map((c) => <Pildora key={c.elemento} tipo="warn">Cambiar {ETIQUETA_ELEMENTO[c.elemento]}</Pildora>)}
            </div>
            <div className="botones-cama">
              <button type="button" className="btn primary" onClick={() => irA("cama", ep.id)}>
                <Stethoscope size={15} aria-hidden /> Monitorización
              </button>
              <button type="button" className="btn" onClick={() => irA("evaluacion", ep.id)}>
                <ClipboardList size={15} aria-hidden /> Evaluaciones
              </button>
              <button type="button" className="btn" onClick={() => irA("eventos", ep.id)}>
                <Zap size={15} aria-hidden /> Eventos
              </button>
            </div>
            {pve && (
              <button type="button" className={pve.destacado ? "btn primary" : "btn"} onClick={() => irA("pve", ep.id)}>
                <Timer size={15} aria-hidden /> {pve.texto}
              </button>
            )}
            {boton?.tipo === "FUERA_PROTOCOLO" && (
              <button type="button" className="btn" onClick={() => { pedirEvento("extub"); irA("eventos", ep.id); }}>
                <Timer size={15} aria-hidden /> Extubación fuera de protocolo
              </button>
            )}
          </article>
          </Fragment>
        );
      })}
    </div>
  );
}

/** «TET 7.5 · 23 cm · TOT 4 d», «TQT 8.0 · TQT 12 d» o «Vía aérea natural», como en el registro simple. */
function textoViaCama(ep: Episodio, h: HorasVm | null): string {
  if (ep.viaAereaActual === "NATURAL") return "Vía aérea natural";
  const via = ep.viaAereaActual === "TET"
    ? [`TET ${ep.calibreVia ?? ""}`.trim(), ep.fijacionCm ? `${ep.fijacionCm}${/\d$/.test(ep.fijacionCm) ? " cm" : ""}` : null]
    : [`TQT ${ep.calibreVia ?? ""}`.trim()];
  const dias = h ? `${ep.viaAereaActual === "TET" ? "TOT" : "TQT"} ${Math.floor(h.horas / 24)} d` : null;
  return [...via, dias].filter(Boolean).join(" · ");
}
