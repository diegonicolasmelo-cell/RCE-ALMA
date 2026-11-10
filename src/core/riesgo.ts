/**
 * Informe preliminar de gestion de riesgo.
 *
 * Ante un evento critico (autoextubacion, PCR, evento centinela) el kinesiologo
 * deja en el celular solo la hora y una breve descripcion. En el PC de la
 * estacion el informe aparece ya armado, cruzando el evento con el contexto
 * fisiologico de las horas previas, que ya estaba capturado: hoy ese contexto se
 * reconstruye de memoria, dias despues.
 *
 * La identidad del paciente solo se incluye aqui, en la estacion: el canal
 * clinico (el del celular) nunca la lleva.
 */

import { ESCALA_SAS, ETIQUETA_DISPOSITIVO, ETIQUETA_MODALIDAD, textoEdad } from "./catalogos";
import { buscarProfesional } from "./dotacion";
import { describirEquipos } from "./equipos";
import { eventosDeRiesgo } from "./eventos";
import { describirCardiovasculares, describirInfusiones, sedoanalgesiaActiva } from "./infusiones";
import { formatearRut } from "./sinapse";
import type { Control, Episodio, EventoClinico, IdentidadPaciente } from "./tipos";

export function eventoDeRiesgoMasReciente(eventos: readonly EventoClinico[]): EventoClinico | null {
  return eventosDeRiesgo(eventos).at(-1) ?? null;
}

/** Etiqueta corta para la alerta de la tarjeta. */
export function etiquetaEventoRiesgo(ev: EventoClinico): string {
  switch (ev.tipo) {
    case "AUTOEXTUBACION":
      return "Autoextubación";
    case "PCR":
      return "PCR";
    case "EVENTO_CENTINELA":
      return "Evento centinela";
    default:
      return ev.tipo;
  }
}

function tituloEvento(ev: EventoClinico): string {
  switch (ev.tipo) {
    case "AUTOEXTUBACION":
      return "Autoextubación";
    case "PCR":
      return `Paro cardiorrespiratorio, reanimación ${ev.duracionReanimacionMin} min`;
    case "EVENTO_CENTINELA":
      return `Evento centinela: ${ev.descripcion || "sin descripción"}`;
    default:
      return ev.tipo;
  }
}

/** Ultimo control registrado hasta el momento del evento. */
function controlPrevio(controles: readonly Control[], ev: EventoClinico): Control | null {
  return (
    [...controles]
      .filter((c) => c.registradoEn <= ev.registradoEn)
      .sort((a, b) => a.registradoEn.localeCompare(b.registradoEn))
      .at(-1) ?? null
  );
}

function resumenContexto(c: Control): string {
  const conciencia = sedoanalgesiaActiva(c.infusiones)
    ? `SAS ${c.sas ?? "--"}${c.sas ? ` (${ESCALA_SAS.find((s) => s.val === c.sas)?.label ?? ""})` : ""}`
    : `vigilia ${c.vigilia ? c.vigilia.toLowerCase().replace("_", " ") : "no consignada"}`;
  const sedantes = describirInfusiones(c.infusiones, "SEDANTE");
  const v = c.ventilacion;
  const vent = `${ETIQUETA_MODALIDAD[v.modalidad]} PEEP ${v.peep ?? "--"} FiO2 ${v.fio2 ?? "--"}%`;
  return [conciencia, sedantes || "sin sedantes", describirCardiovasculares(c.infusiones), vent].join(" · ");
}

export interface EntradaInforme {
  readonly episodio: Episodio;
  /** Solo disponible en la estacion. Sin ella el informe nombra la cama. */
  readonly identidad: IdentidadPaciente | null;
  readonly evento: EventoClinico;
  readonly controles: readonly Control[];
}

export function componerInformeRiesgo(e: EntradaInforme): string {
  const { episodio, identidad, evento } = e;
  const previo = controlPrevio(e.controles, evento);
  const autor = buscarProfesional(evento.rutAutor);
  const paciente = identidad
    ? `${identidad.nombre}${identidad.rut ? ` · RUT ${formatearRut(identidad.rut)}` : ""} · ${textoEdad(episodio.edad)}`
    : `cama ${episodio.cama} · ${textoEdad(episodio.edad)} (sin identidad disponible en este equipo)`;
  const queda = evento.tipo === "AUTOEXTUBACION" ? ETIQUETA_DISPOSITIVO[evento.dispositivo] ?? evento.dispositivo : null;

  return [
    "INFORME PRELIMINAR DE GESTIÓN DE RIESGO (pre-llenado)",
    `Evento: ${tituloEvento(evento)}`,
    `Hora: ${evento.hora}   Cama: ${episodio.cama}`,
    `Paciente: ${paciente}`,
    `Descripción inicial (celular): ${evento.comentario || "sin descripción"}`,
    ...(queda ? [`Queda en: ${queda}`] : []),
    `Registrado por: ${autor ? `Klgo. ${autor.nombre}` : `RUT ${evento.rutAutor}`}`,
    `Equipos de la sala: ${describirEquipos(episodio.equipos)}`,
    `Contexto de las horas previas (último control ${previo ? previo.hora : "--"}):`,
    `  ${previo ? resumenContexto(previo) : "sin controles previos en el turno"}`,
    "Pendiente: notificar a coordinación y completar el análisis de seguridad."
  ].join("\n");
}
