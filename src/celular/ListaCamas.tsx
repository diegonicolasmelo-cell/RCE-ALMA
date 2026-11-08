import { ClipboardList, Stethoscope, Timer } from "lucide-react";
import { Fragment } from "react";
import {
  accesoPve,
  apkVigente,
  esViaAereaArtificial,
  estadoFlujoPve,
  estadoProno,
  filtrosPorCambiar,
  bnmEnCurso,
  bnmVigente,
  ETIQUETA_ELEMENTO
} from "@core/index";
import type { Control, Episodio, EventoClinico, ValidacionApk } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora, useConsulta } from "../app/hooks";
import { useApp } from "../app/store";
import { Pildora } from "./componentes";

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
  const misCamas = useApp((s) => s.misCamas);
  const ahora = useAhora(30_000);

  const filas = useConsulta<readonly Fila[]>(
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
    []
  );

  if (filas.length === 0) {
    return <div className="cel-cuerpo"><p className="muted">No hay camas activas. Un PC de la estación debe ingresar a los pacientes.</p></div>;
  }
  const esMia = (e: Episodio): boolean => (misCamas ? misCamas.includes(e.cama) : e.rutTitular === sesion.rut);
  // Las mias primero, de la primera a la ultima; despues las demas, tambien en orden.
  const ordenadas = [...filas].sort((a, b) => Number(esMia(b.ep)) - Number(esMia(a.ep)) || a.ep.cama.localeCompare(b.ep.cama));
  const nMias = ordenadas.filter((f) => esMia(f.ep)).length;

  return (
    <div className="cel-cuerpo" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Mis camas ({nMias})</h3>
        <button type="button" className="linkbtn" onClick={() => irA("elegir")}>Cambiar mis camas</button>
      </div>
      {nMias === 0 && <p className="small muted">No elegiste camas. Puedes abrir cualquiera de abajo o usar «Cambiar mis camas».</p>}
      {ordenadas.map(({ ep, ultimo, eventos, apks }, i) => {
        const minutos = ultimo ? Math.max(0, Math.round((ahora.getTime() - Date.parse(ultimo.registradoEn)) / 60000)) : null;
        const apk = apkVigente(apks, ep.id, ahora);
        const flujo = estadoFlujoPve(eventos, ahora);
        const prono = estadoProno(eventos, ahora);
        const cambios = filtrosPorCambiar(eventos, ahora);
        const duePost = flujo.bloque?.momentos.find((m) => !m.registrado && m.minutosFaltantes <= 0 && m.id !== "48H");
        const propia = esMia(ep);
        const pve = accesoPve(ep.viaAereaActual, ultimo?.ventilacion.modalidad ?? null, eventos, ahora);
        return (
          <Fragment key={ep.id}>
          {i === nMias && <h3 style={{ margin: "8px 0 0" }}>Otras camas · para ayudar a un colega</h3>}
          <article className="card stack" style={{ padding: 12, gap: 8 }} aria-label={`Cama ${ep.cama}`}>
            <header className="row" style={{ justifyContent: "space-between" }}>
              <b className="mono" style={{ fontSize: 20 }}>{ep.cama}</b>
              <span className="small muted">{ultimo ? `último ${ultimo.hora} · hace ${haceTexto(minutos ?? 0)}` : "sin controles"}</span>
            </header>
            <div className="small ink2">
              {esViaAereaArtificial(ep.viaAereaActual) ? `${ep.viaAereaActual} · VM día ${ep.diasVM}` : "Vía aérea natural"}
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
            <div className="row">
              <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => irA("cama", ep.id)}>
                <Stethoscope size={15} aria-hidden /> Registrar control
              </button>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => irA("evaluacion", ep.id)}>
                <ClipboardList size={15} aria-hidden /> Evaluación
              </button>
            </div>
            {pve && (
              <button type="button" className={pve.destacado ? "btn primary" : "btn"} onClick={() => irA("pve", ep.id)}>
                <Timer size={15} aria-hidden /> {pve.texto}
              </button>
            )}
          </article>
          </Fragment>
        );
      })}
    </div>
  );
}
