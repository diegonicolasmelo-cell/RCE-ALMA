import { AlertTriangle, Check } from "lucide-react";
import {
  apkVigente,
  bnmVigente,
  calcularDerivados,
  calcularPbw,
  equipoEnUso,
  estadoProno,
  estadoPve,
  etiquetaEquipo,
  etiquetaEventoRiesgo,
  eventoDeRiesgoMasReciente,
  semaforoDva,
  usaSoporteCardiovascular
} from "@core/index";
import type { Control, Episodio, EventoClinico, IdentidadPaciente, ValidacionApk } from "@core/index";
import { cx } from "../app/util";
import { Pildora } from "../celular/componentes";
import { VENTANA_ALERTA_MS, haceTexto, nombreProfesional } from "./util";

const SEMAFORO = {
  SIN_DVA: null,
  BAJA: { tipo: "good" as const, t: "DVA baja" },
  MEDIA: { tipo: "warn" as const, t: "DVA media" },
  ALTA: { tipo: "crit" as const, t: "DVA alta" }
};

interface Props {
  ep: Episodio;
  controles: readonly Control[];
  eventos: readonly EventoClinico[];
  apks: readonly ValidacionApk[];
  identidad: IdentidadPaciente | null;
  ahora: Date;
  seleccionada: boolean;
  onClick: () => void;
  /** Version reducida, sin boton (espejo). */
  mini?: boolean;
}

export function TarjetaCama({ ep, controles, eventos, apks, identidad, ahora, seleccionada, onClick }: Props) {
  const u = controles.at(-1) ?? null;
  const d = u ? calcularDerivados(u, calcularPbw(ep.tallaCm, ep.sexo)) : null;
  const riesgoCrudo = eventoDeRiesgoMasReciente(eventos);
  const riesgo = riesgoCrudo && ahora.getTime() - Date.parse(riesgoCrudo.registradoEn) < VENTANA_ALERTA_MS ? riesgoCrudo : null;
  const nivel = u ? semaforoDva(u.infusiones) : "SIN_DVA";
  const sem = SEMAFORO[nivel];
  const soporte = u ? usaSoporteCardiovascular(u.infusiones) : false;
  const prono = estadoProno(eventos, ahora);
  const pve = estadoPve(eventos, ahora);
  const apk = apkVigente(apks, ep.id, ahora);
  const equipo = equipoEnUso(ep.equipos);
  const minutos = u ? Math.max(0, Math.round((ahora.getTime() - Date.parse(u.registradoEn)) / 60000)) : null;

  return (
    <button type="button" className={cx("cama", riesgo && "alerta")} aria-current={seleccionada} onClick={onClick}>
      <header>
        <span className="id">{ep.cama}</span>
        <span className="small muted">{u ? `último ${u.hora} · ${haceTexto(minutos ?? 0)}` : "sin registro"}</span>
      </header>
      {riesgo && (
        <Pildora tipo="crit">
          <AlertTriangle size={13} aria-hidden /> {etiquetaEventoRiesgo(riesgo)} {riesgo.hora}
        </Pildora>
      )}
      <div>
        <div className="nm">{identidad ? identidad.nombre : <span className="muted">Sin identidad en este equipo</span>}</div>
        <div className="meta">{ep.edad} a · {ep.sexo} · {ep.diagnostico}</div>
      </div>
      <div className="pills">
        <Pildora tipo="acc">{ep.viaAereaActual === "NATURAL" ? "Vía natural" : ep.viaAereaActual}</Pildora>
        {d?.pam != null && <Pildora><span className="mono">PAM {d.pam}</span></Pildora>}
        {sem ? <Pildora tipo={sem.tipo}>{sem.t}</Pildora> : soporte ? <Pildora tipo="warn">Soporte CV</Pildora> : u ? <Pildora>Sin DVA</Pildora> : null}
        {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
        {pve.activa && <Pildora tipo="acc">PVE en curso</Pildora>}
        {bnmVigente(eventos) && <Pildora tipo="crit">BNM</Pildora>}
        {equipo && <Pildora>{etiquetaEquipo(equipo)}</Pildora>}
        <Pildora tipo={ep.transcritoAlma ? "good" : ""}>
          {ep.transcritoAlma ? <><Check size={12} aria-hidden /> Transcrito {ep.horaTranscripcion}</> : "Pendiente"}
        </Pildora>
        <Pildora tipo={apk ? (apk.resultado === "CUMPLE" ? "good" : "crit") : ""}>
          {apk ? (apk.resultado === "CUMPLE" ? <><Check size={12} aria-hidden /> APK</> : "APK no cumple") : "APK pendiente"}
        </Pildora>
      </div>
      <div className="small muted">Titular: {nombreProfesional(ep.rutTitular)}</div>
    </button>
  );
}
