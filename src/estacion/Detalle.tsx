import { Copy, ExternalLink, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import {
  dotacion,
  apkDelTurno,
  calcularDerivados,
  calcularPbw,
  componerInformeRiesgo,
  describirEquipos,
  describirEvento,
  enlaceSinapse,
  eventosDeRiesgo,
  formatearRut,
  purgaDeIdentidadLista,
  textoEdad,
  turnoAnterior,
  turnoDe
} from "@core/index";
import type { Control, Episodio, EventoClinico, IdentidadPaciente, ValidacionApk } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { Aviso } from "../celular/componentes";
import { htmlApk, nombreArchivoApk } from "./apkDocumento";
import { borrarIdentidad } from "./purga";
import { filasSabana } from "./sabana";
import { PanelCircuitoYEvaluaciones, PanelPve } from "./PanelPve";
import { Tendencia } from "./Tendencia";
import { CompletarIdentidad } from "./CompletarIdentidad";
import { VENTANA_ALERTA_MS, copiarTexto, nombreProfesional } from "./util";

interface Props {
  ep: Episodio;
  controles: readonly Control[];
  eventos: readonly EventoClinico[];
  apks: readonly ValidacionApk[];
  identidad: IdentidadPaciente | null;
  ahora: Date;
}

const MAX_COLUMNAS = 10;

export function Detalle({ ep, controles, eventos, apks, identidad, ahora }: Props) {
  const { repo, api, db, config } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [confirmarAlta, setConfirmarAlta] = useState(false);

  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const visibles = controles.slice(-MAX_COLUMNAS);
  const etiquetas = visibles.map((c) => c.hora);
  const derivados = visibles.map((c) => calcularDerivados(c, pbw));
  const filas = useMemo(() => filasSabana(pbw, ep.monitoreo), [pbw, ep.monitoreo]);

  const riesgos = eventosDeRiesgo(eventos).filter((e) => ahora.getTime() - Date.parse(e.registradoEn) < VENTANA_ALERTA_MS);
  const sinapse = enlaceSinapse(identidad?.rut ?? null, config.sinapseUrl);
  const apkActual = apkDelTurno(apks, ep.id, turnoDe(ahora).clave);
  const apkPrevia = apkDelTurno(apks, ep.id, turnoAnterior(ahora).clave);

  const copiar = async (texto: string, ok: string): Promise<void> => {
    avisar((await copiarTexto(texto)) ? ok : "El navegador bloqueó el portapapeles: selecciona el texto y copia con Ctrl+C.");
  };

  const darDeAlta = async (): Promise<void> => {
    await repo.darAlta(ep.id);
    if (!purgaDeIdentidadLista(ep, apks)) {
      avisar(`${ep.cama} dada de alta. La identidad se borrará cuando el PC de respaldo guarde la hoja APK final (sigue cifrada mientras tanto).`);
      return;
    }
    const r = await borrarIdentidad(api, db, ep.id);
    avisar(r.ok ? `${ep.cama} dada de alta. La identidad se borró.` : `${ep.cama} dada de alta, pero la identidad no se pudo borrar de la nube (${r.error}). Se reintenta sola.`);
  };

  const abrirApk = (imprimir: boolean): void => {
    const html = htmlApk(ep, identidad, apks);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    if (imprimir) {
      const w = window.open(url, "_blank");
      if (w) w.addEventListener("load", () => w.print());
      else avisar("El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir.");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nombreArchivoApk(ep, identidad)}.html`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const razonSinSinapse = !identidad?.rut ? "sin RUT registrado" : !config.sinapseUrl ? "falta configurar VITE_SINAPSE_URL" : "RUT con dígito verificador inválido";

  return (
    <div className="card detail">
      <div className="detail-head">
        <div>
          <h2 style={{ margin: 0 }}>{ep.cama} · {identidad ? identidad.nombre : "Sin identidad en este equipo"}</h2>
          <div className="small ink2">
            {identidad?.rut ? <>RUT <span className="mono">{formatearRut(identidad.rut)}</span> · </> : null}
            {textoEdad(ep.edad)} · {ep.diagnostico || "diagnóstico pendiente"}
          </div>
          <div className="small ink2">Equipos: {describirEquipos(ep.equipos)}</div>
          {!identidad && ep.edad === 0 && <div className="mt"><CompletarIdentidad ep={ep} /></div>}
          <div className="small ink2">
            APK · turno anterior: {apkPrevia ? `${apkPrevia.resultado === "CUMPLE" ? "firmada" : "no cumple"} ${apkPrevia.hora} (${nombreProfesional(apkPrevia.rutAutor)})` : "sin registro"} · este turno:{" "}
            {apkActual ? `${apkActual.resultado === "CUMPLE" ? "firmada" : "no cumple"} ${apkActual.hora}` : "pendiente"}
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" disabled={apks.length === 0} title="Hoja APK de papel, rellenada con las firmas" onClick={() => abrirApk(true)}>
            <FileText size={14} aria-hidden /> Hoja APK
          </button>
          <button type="button" className="btn" disabled={apks.length === 0} onClick={() => abrirApk(false)}>Descargar APK</button>
          {sinapse ? (
            <a className="btn" href={sinapse} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden /> Abrir Sinapse
            </a>
          ) : (
            <button type="button" className="btn" disabled title={razonSinSinapse}>Abrir Sinapse · {razonSinSinapse}</button>
          )}
          <div className="f" style={{ minWidth: 170 }}>
            <label htmlFor="titular">Kinesiólogo titular</label>
            <select id="titular" value={ep.rutTitular} style={{ textAlign: "left" }} onChange={(e) => void repo.guardarEpisodio({ ...ep, rutTitular: e.target.value })}>
              {dotacion().map((p) => <option key={p.correo} value={p.correo}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {riesgos.map((ev) => {
        const informe = componerInformeRiesgo({ episodio: ep, identidad, evento: ev, controles });
        return (
          <Aviso key={ev.id} tipo="crit">
            <b>{describirEvento(ev)} · {ev.hora}.</b> El informe preliminar ya está armado con lo que dejó el kinesiólogo desde el celular y el contexto de las horas previas.
            <pre className="nota" style={{ marginTop: 8, maxHeight: 260 }}>{informe}</pre>
            <div className="row mt">
              <button type="button" className="btn primary sm" onClick={() => void copiar(informe, "Informe de riesgo copiado.")}>
                <Copy size={13} aria-hidden /> Copiar informe
              </button>
              <span className="small">El envío por correo a coordinación va en una versión siguiente.</span>
            </div>
          </Aviso>
        );
      })}

      <PanelPve eventos={eventos} ahora={ahora} />
      <PanelCircuitoYEvaluaciones eventos={eventos} ahora={ahora} />

      {visibles.length > 0 ? (
        <>
          <section>
            <h3>Tendencia del turno</h3>
            <div className="sparks">
              <Tendencia titulo="PAM" unidad="mmHg" valores={derivados.map((d) => d.pam)} etiquetas={etiquetas} referencia={65} />
              <Tendencia titulo="FC" unidad="lpm" valores={visibles.map((c) => c.fc)} etiquetas={etiquetas} />
              <Tendencia titulo="SpO₂" unidad="%" valores={visibles.map((c) => c.spo2)} etiquetas={etiquetas} />
              <Tendencia titulo="Driving pressure" unidad="cmH₂O" valores={derivados.map((d) => d.drivingPressure)} etiquetas={etiquetas}
                bloqueados={visibles.map((c, i) => c.ventilacion.asincronico && derivados[i]!.leyendaMecanica !== null)} />
              {ep.monitoreo.pic && <Tendencia titulo="PPC" unidad="mmHg" valores={derivados.map((d) => d.ppc)} etiquetas={etiquetas} referencia={60} />}
            </div>
            <p className="small muted mt">Línea punteada: referencia (PAM 65). En ΔP, “bloq.” marca un control con asincronía en modalidad controlada: no se dibuja un dato falso.</p>
          </section>

          <section>
            <h3>Sábana del turno</h3>
            <div className="scroll-x">
              <table className="sab">
                <thead>
                  <tr>
                    <th>Parámetro</th>
                    {visibles.map((c) => <th key={c.id}>{c.hora}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.etiqueta}>
                      <td>{f.etiqueta}</td>
                      {visibles.map((c) => {
                        const x = f.celda(c);
                        return (
                          <td key={c.id} className="v">
                            {x.bloqueado ? <span className="lockc" title="Invalidado: asincronía en modalidad controlada">bloq.</span> : x.texto}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted mt">* Volumen minuto editado (leído del ventilador) o Glasgow registrado bajo sedación.</p>
          </section>
        </>
      ) : (
        <p className="muted">Todavía no hay controles de esta cama.</p>
      )}

      <section>
        <h3>Alta</h3>
        {!confirmarAlta ? (
          <button type="button" className="btn sm" onClick={() => setConfirmarAlta(true)}>Dar de alta</button>
        ) : (
          <div className="row">
            <button type="button" className="btn danger sm" onClick={() => void darDeAlta()}>Confirmar alta y borrar la identidad</button>
            <button type="button" className="btn sm" onClick={() => setConfirmarAlta(false)}>Cancelar</button>
          </div>
        )}
        <p className="small muted mt">Al dar de alta se borra el nombre y el RUT. Lo clínico queda sin identidad para las estadísticas.</p>
      </section>
    </div>
  );
}
