/**
 * Generador de evolucion clinica para HIS ALMA (TrakCare) y campos discretos.
 *
 * Es la pieza con mas valor clinico por linea de codigo: resuelve el principal
 * cuello de botella operativo (la transcripcion manual). Por eso es una funcion
 * pura y va con tests.
 *
 * Respeta el candado de mecanica: si la asincronia en modalidad controlada
 * invalida el plateau, la nota NO reporta driving pressure ni compliance y dice
 * por que. Una sola fuente de verdad con la pantalla (src/core/validez.ts).
 */

import { buscarProfesional } from "./dotacion";
import { ESCALA_SAS, ESTADOS_VIGILIA, ETIQUETA_MODALIDAD, HALLAZGOS_AUSCULTACION } from "./catalogos";
import { apkVigente } from "./apk";
import { nombreEscala } from "./evaluaciones";
import { etiquetaMomentoPostExtub } from "./pve";
import { describirEquipos, equipoEnUso, etiquetaEquipo } from "./equipos";
import { calcularDerivados, calcularPbw, esViaAereaArtificial } from "./fisiologia";
import { describirCardiovasculares, describirInfusiones, sedoanalgesiaActiva } from "./infusiones";
import { estadoProno, eventosDeRiesgo } from "./eventos";
import { resumirTurno } from "./rem28";
import { esModalidadControlada, mecanicaBloqueadaPorAsincronia } from "./validez";
import type {
  Control,
  EquipoEnSala,
  Episodio,
  EventoClinico,
  Modalidad,
  ValidacionApk
} from "./tipos";

export type ModoNota = "TURNO_COMPLETO" | "ULTIMA_ATENCION";

export interface EntradaNota {
  readonly episodio: Episodio;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
  readonly apk: readonly ValidacionApk[];
  readonly modo: ModoNota;
  readonly ahora: Date;
}

const fmt = (v: number | null): string => (v === null ? "--" : String(v));

function nombreDe(rut: string): string {
  const p = buscarProfesional(rut);
  return p ? `Klgo. ${p.nombre}` : `RUT ${rut}`;
}

function ordenados(controles: readonly Control[]): readonly Control[] {
  return [...controles].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
}

function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function etiquetaVia(e: Episodio): string {
  if (!esViaAereaArtificial(e.viaAereaActual)) return "vía aérea natural";
  const fij = e.fijacionCm ? ` (fijación ${e.fijacionCm}${/\d/.test(e.fijacionCm) ? " cm" : ""})` : "";
  return `${e.viaAereaActual}${e.calibreVia ? ` ${e.calibreVia}` : ""}${fij}`;
}

function textoGlasgow(c: Control, pbw: number): string {
  const d = calcularDerivados(c, pbw);
  if (!d.glasgow) return c.s5q !== null ? `S5Q ${c.s5q}/5` : "";
  return `Glasgow ${d.glasgow.completo}${d.glasgowBajoSedacion ? " (registrado bajo sedación)" : ""}${c.s5q !== null ? `, S5Q ${c.s5q}/5` : ""}`;
}

function textoConciencia(c: Control, pbw: number): string {
  const gl = textoGlasgow(c, pbw);
  const sufijo = gl ? `, ${gl}` : "";
  if (sedoanalgesiaActiva(c.infusiones)) {
    const sas = ESCALA_SAS.find((s) => s.val === c.sas);
    return `${sas ? `SAS ${sas.val} (${sas.label})` : "SAS no consignado"}, ${describirInfusiones(c.infusiones, "SEDANTE")}${sufijo}`;
  }
  const v = ESTADOS_VIGILIA.find((e) => e.val === c.vigilia);
  return `sin sedoanalgesia, estado de vigilia ${v ? v.label.toLowerCase() : "no consignado"}${sufijo}`;
}

function textoNeuro(c: Control, pbw: number): string {
  const n = c.neuro;
  if (!n) return "";
  const d = calcularDerivados(c, pbw);
  const partes: string[] = [];
  if (n.etco2 !== null) partes.push(`EtCO₂ ${n.etco2} mmHg`);
  if (n.pic !== null) partes.push(`PIC ${n.pic} mmHg${d.ppc !== null ? ` (PPC ${d.ppc} mmHg)` : ""}`);
  if (n.dveAlturaCmH2O !== null) {
    partes.push(`DVE a ${n.dveAlturaCmH2O} cmH₂O${n.dveAbierta === null ? "" : n.dveAbierta ? " abierta" : " cerrada"}`);
  }
  return partes.join(", ");
}

function textoSecreciones(c: Control): string {
  const k = c.kineResp;
  if (!k.aspecto && !k.reologia && !k.cantidad) return "";
  const partes = [k.cantidad, k.aspecto, k.reologia].filter((x): x is NonNullable<typeof x> => x !== null);
  return `Secreciones ${partes.join(", ").toLowerCase()}`;
}

function textoAuscultacion(c: Control): string {
  const h = c.kineResp.auscultacion;
  return h.length === 0 ? "" : `Auscultación: ${h.map((x) => HALLAZGOS_AUSCULTACION.find((d) => d.val === x)?.label ?? x).join(", ")}`;
}

function textoKine(c: Control): string {
  return [textoAuscultacion(c), textoSecreciones(c)].filter(Boolean).join(". ") || "Sin hallazgos respiratorios registrados";
}

function textoTerapiaFisica(c: Control): string {
  const t = c.terapiaFisica;
  if (t.estado === "CONTRAINDICADA") {
    return `Terapia física contraindicada${t.motivoContraindicacion ? ` (${t.motivoContraindicacion})` : ""}`;
  }
  if (t.estado === "NO") return "Sin terapia física";
  const acts = t.actividades.length > 0 ? t.actividades.join(" + ") : "Terapia física realizada";
  return `${acts}${t.ims !== null ? ` (IMS ${t.ims})` : ""}`;
}

/** Bloque respiratorio de un control: programado, paciente y resultantes segun modalidad. */
function bloqueRespiratorio(c: Control, pbw: number): string {
  const v = c.ventilacion;
  const d = calcularDerivados(c, pbw);

  if (v.modalidad === "CNAF") {
    const p = [`CNAF flujo ${fmt(v.flujo)} L/min`, `FiO2 ${fmt(v.fio2)}%`, `FR ${fmt(v.frTotal)} rpm`];
    if (d.rox !== null) p.push(`índice ROX ${d.rox}`);
    return p.join(", ");
  }

  const controlada = esModalidadControlada(v.modalidad);
  const p = [`VMI ${ETIQUETA_MODALIDAD[v.modalidad]}`, `FiO2 ${fmt(v.fio2)}%`, `PEEP ${fmt(v.peep)}`];
  if (v.presion !== null) p.push(`${v.modalidad === "PCV" ? "P. control" : "P. soporte"} ${v.presion}`);
  if (v.modalidad === "ACVC") {
    p.push(`Vt programado ${fmt(v.vtProgramado)} ml (${fmt(d.vtProgramadoPorKg)} ml/kg PI)`);
  }
  p.push(`Vt espirado ${fmt(v.vtEspirado)} ml (${fmt(d.vtEspiradoPorKg)} ml/kg PI)`);
  p.push(controlada ? `FR programada ${fmt(v.frProgramada)} / total ${fmt(v.frTotal)} rpm` : `FR ${fmt(v.frTotal)} rpm`);
  if (d.volumenMinuto !== null) {
    p.push(`volumen minuto espirado ${d.volumenMinuto} L/min`);
  }
  if (controlada && v.ti !== null) p.push(`TI ${v.ti} s${d.relacionIE ? ` (I:E ${d.relacionIE})` : ""}`);
  p.push(`P.pico ${fmt(v.pPico)}`);

  if (d.drivingPressure !== null) {
    // En PCV, si el ventilador no permite medir plateau, la ΔP se calcula con la presion pico.
    const conPico = d.origenDriving === "PICO";
    if (!conPico) p.push(`P.plateau ${fmt(v.pPlateau)}`);
    p.push(
      `driving pressure ${d.drivingPressure}${conPico ? " (con P. pico)" : ""}`,
      `compliance ${conPico ? "" : "estática "}${fmt(d.compliance)}${conPico ? " (con P. pico)" : ""}`
    );
  } else if (mecanicaBloqueadaPorAsincronia(v)) {
    // No se reporta un dato contaminado por esfuerzo muscular activo.
    p.push("mecánica estática no valorable (asincronía paciente-ventilador en modalidad controlada)");
  }
  if (d.tobin !== null) p.push(`índice de Tobin ${d.tobin}`);
  return p.join(", ");
}

export function describirEvento(ev: EventoClinico): string {
  switch (ev.tipo) {
    case "EVALUACION_PVE":
      return ev.apto ? "Checklist de PVE: cumple los 8 criterios" : "Checklist de PVE: no cumple los criterios, PVE no iniciada";
    case "CONTROL_PVE":
      return `Control de PVE ${ev.fase === "INICIAL" ? "inicial" : "a los 30 min"}`;
    case "REEVAL_POST_EXTUB":
      return `Reevaluación post extubación (${etiquetaMomentoPostExtub(ev.momento)})`;
    case "FALLA_POST_EXTUB":
      return ev.falla ? `Falla post extubación${ev.hipotesis ? `: ${ev.hipotesis}` : ""}` : "Sin falla post extubación";
    case "INICIO_PVE":
      return `Inicio de PVE (protocolo ${ev.duracionMin} min)`;
    case "FIN_PVE":
      return `Fin de PVE: ${ev.exitosa ? "tolerada" : "no tolerada"}`;
    case "EXTUBACION_PROGRAMADA":
      return `Extubación programada, queda en ${ev.dispositivo}`;
    case "AUTOEXTUBACION":
      return `AUTOEXTUBACIÓN NO PLANIFICADA, queda en ${ev.dispositivo}`;
    case "REINTUBACION":
      return `Reintubación ${ev.via} calibre ${ev.calibre}, fijación ${ev.fijacionCm} cm`;
    case "TRAQUEOSTOMIA":
      return `Traqueostomía calibre ${ev.calibre}`;
    case "AJUSTE_TUBO":
      return `Ajuste de fijación a ${ev.fijacionCm} cm (${ev.motivo === "DESPLAZAMIENTO_SUPERFICIAL" ? "desplazamiento superficial" : "control radiológico"})`;
    case "INICIO_PRONO":
      return "Inicio de ciclo de prono";
    case "SUPINACION":
      return "Supinación";
    case "INICIO_BNM":
      return `Inicio de bloqueo neuromuscular (${ev.farmaco})`;
    case "FIN_BNM":
      return "Suspensión de bloqueo neuromuscular";
    case "PCR":
      return `Paro cardiorrespiratorio, reanimación ${ev.duracionReanimacionMin} min`;
    case "EVENTO_CENTINELA":
      return `Evento centinela: ${ev.descripcion}`;
    case "ASISTENCIA_FBC":
      return "Asistencia en fibrobroncoscopía";
    case "ASISTENCIA_PROCEDIMIENTO":
      return `Asistencia en ${ev.procedimiento.toLowerCase()}`;
    case "TOMA_CULTIVO":
      return `Toma de cultivo (${ev.muestra})`;
    case "TRASLADO_IMAGEN":
      return `Traslado a ${ev.destino}`;
    case "CAMBIO_HMEF":
      return "Cambio de filtro HME";
    case "EVALUACION_PUNTUAL":
      return `Evaluación ${nombreEscala(ev.escala)}${ev.total !== null ? `: ${ev.total}` : ""}`;
    case "CAMBIO_FILTRO":
      return ev.elemento === "TRACHCARE" ? "Cambio de TrachCare" : "Cambio de filtro HEPA";
    case "CAMBIO_EQUIPOS":
      return `Cambio de equipos: ${describirEquipos(ev.equipos)}`;
    default: {
      const _exhaustivo: never = ev;
      return String(_exhaustivo);
    }
  }
}

function notaUltimaAtencion(entrada: EntradaNota, pbw: number): string {
  const { episodio } = entrada;
  const u = ordenados(entrada.controles).at(-1);
  if (!u) return `[SIN CONTROLES REGISTRADOS PARA ${episodio.cama}]`;
  const d = calcularDerivados(u, pbw);
  const sec = textoSecreciones(u);

  return [
    `[CONTROL KINESIOLOGÍA UPC · ${episodio.cama} · ATENCIÓN #${u.numero} (${u.hora} hrs)]`,
    `Profesional: ${nombreDe(u.rutAutor)}${u.esControlApoyo ? " (control de apoyo)" : ""}.`,
    ``,
    `1. HEMODINAMIA: FC ${fmt(u.fc)} lpm, PA ${fmt(u.pas)}/${fmt(u.pad)} mmHg (PAM ${fmt(d.pam)} mmHg). ${capitalizar(describirCardiovasculares(u.infusiones))}.`,
    `2. CONCIENCIA Y SEDACIÓN: ${capitalizar(textoConciencia(u, pbw))}.`,
    `3. RESPIRATORIO Y VÍA AÉREA: ${etiquetaVia(episodio)} en ${bloqueRespiratorio(u, pbw)}. SpO2 ${fmt(u.spo2)}%.${sec ? ` ${sec}.` : ""}`,
    ...(textoNeuro(u, pbw) ? [`   Neuromonitoreo: ${textoNeuro(u, pbw)}.`] : []),
    `4. KINESITERAPIA: ${textoKine(u)} ${textoTerapiaFisica(u)}.`,
    ...(u.observaciones ? [``, `Observación: ${u.observaciones}`] : [])
  ].join("\n");
}

function notaTurnoCompleto(entrada: EntradaNota, pbw: number): string {
  const { episodio, eventos, apk, ahora } = entrada;
  const lista = ordenados(entrada.controles);
  const primero = lista[0];
  const ultimo = lista.at(-1);
  if (!primero || !ultimo) return `[SIN CONTROLES REGISTRADOS EN EL TURNO PARA ${episodio.cama}]`;

  const dP = calcularDerivados(primero, pbw);
  const dU = calcularDerivados(ultimo, pbw);
  const stats = resumirTurno(lista, eventos, apk);
  const prono = estadoProno(eventos, ahora);
  const riesgos = eventosDeRiesgo(eventos);
  const apkTurno = apkVigente(apk, episodio.id, ahora);

  const cronologia = lista
    .map((c) => {
      const evs = eventos.filter((e) => e.hora === c.hora).map(describirEvento);
      const sec = textoSecreciones(c);
      return `  · [#${c.numero} · ${c.hora} hrs${c.esControlApoyo ? " · apoyo" : ""}] ${textoTerapiaFisica(c)}${sec ? ` | ${sec}` : ""}${evs.length ? ` | Hitos: ${evs.join("; ")}` : ""}${c.observaciones ? ` ${c.observaciones}` : ""}`;
    })
    .join("\n");

  const aparte = eventos
    .filter((e) => !lista.some((c) => c.hora === e.hora))
    .map((e) => `  · [${e.hora} hrs] ${describirEvento(e)}${e.comentario ? `. ${e.comentario}` : ""}`)
    .join("\n");

  return [
    `[EVOLUCIÓN KINESIOLOGÍA UPC · RESUMEN DE TURNO · ${episodio.cama}]`,
    `Diagnóstico: ${episodio.diagnostico} | ${episodio.edad} a | talla ${episodio.tallaCm} cm (${episodio.tallaOrigen === "MEDIDA" ? "medida" : "estimada"}) | peso ideal ${pbw} kg | Días de VM: ${episodio.diasVM}`,
    `Equipos: ${describirEquipos(episodio.equipos)}`,
    ``,
    `1. HEMODINAMIA Y PERFUSIÓN`,
    `Inicia (${primero.hora} hrs) con PAM ${fmt(dP.pam)} mmHg y cierra (${ultimo.hora} hrs) con FC ${fmt(ultimo.fc)} lpm, PA ${fmt(ultimo.pas)}/${fmt(ultimo.pad)} mmHg (PAM ${fmt(dU.pam)} mmHg). ${capitalizar(describirCardiovasculares(ultimo.infusiones))}.`,
    ``,
    `2. CONCIENCIA Y SEDACIÓN`,
    `${capitalizar(textoConciencia(primero, pbw))} → ${textoConciencia(ultimo, pbw)}.`,
    ``,
    `3. SOPORTE VENTILATORIO AL CIERRE`,
    `${capitalizar(etiquetaVia(episodio))} en ${bloqueRespiratorio(ultimo, pbw)}. SpO2 ${fmt(ultimo.spo2)}%.`,
    ...(textoNeuro(ultimo, pbw) ? [`Neuromonitoreo al cierre: ${textoNeuro(ultimo, pbw)}.`] : []),
    ...(prono.ciclosCompletados > 0 || prono.enProno
      ? [`Prono: ${prono.ciclosCompletados} ciclo(s) completado(s), ${prono.horasAcumuladas} h acumuladas${prono.enProno ? " (en prono al cierre)" : ""}.`]
      : []),
    ``,
    `4. PRODUCCIÓN KINÉSICA DEL TURNO (${stats.totalControles} controles)`,
    `  · Atenciones kinésicas (controles): ${stats.kineRespiratoria}`,
    `  · Terapia física realizada: ${stats.terapiaFisicaRealizada} (contraindicada: ${stats.terapiaFisicaContraindicada}) | IMS al cierre: ${fmt(ultimo.terapiaFisica.ims)}`,
    `  · Movilización por nivel: N1 ${stats.movilizacionPorNivel[1]} · N2 ${stats.movilizacionPorNivel[2]} · N3 ${stats.movilizacionPorNivel[3]} · N4 ${stats.movilizacionPorNivel[4]}`,
    `  · APK de este turno: ${apkTurno ? `${apkTurno.resultado === "CUMPLE" ? "firmada" : "no cumple"} ${apkTurno.hora}` : "no registrada"}`,
    `  · Hitos: PVE ${stats.pve} | FBC ${stats.asistenciasFbc} | cultivos ${stats.cultivos} | procedimientos ${stats.asistenciaProcedimientos} | traslados ${stats.traslados} | reintubaciones ${stats.reintubaciones}`,
    ``,
    `5. CRONOLOGÍA DE ATENCIONES`,
    cronologia,
    ...(aparte ? [``, `Eventos clínicos adicionales:`, aparte] : []),
    ...(riesgos.length > 0
      ? [``, `6. EVENTOS DE SEGURIDAD DEL PACIENTE`, ...riesgos.map((e) => `  · [${e.hora} hrs] ${describirEvento(e)}. Notificado para gestión de riesgo.`)]
      : []),
    ``,
    `PLAN / ENTREGA DE TURNO: ${episodio.pendienteEntrega || "sin pendientes consignados"}`
  ].join("\n");
}

/** Punto de entrada unico del generador. */
export function componerNotaAlma(entrada: EntradaNota): string {
  const pbw = calcularPbw(entrada.episodio.tallaCm, entrada.episodio.sexo);
  return entrada.modo === "ULTIMA_ATENCION" ? notaUltimaAtencion(entrada, pbw) : notaTurnoCompleto(entrada, pbw);
}

// ---------------------------------------------------------------------------
// Campos discretos de ALMA
// ---------------------------------------------------------------------------

export interface CampoAlma {
  readonly etiqueta: string;
  /** `null` = en blanco. */
  readonly valor: string | null;
}

type ClaseAlma = "ac" | "pc" | "ps";

/** La modalidad decide en que campo de ALMA va cada valor (idea de la propuesta de la unidad). */
export function claseModoAlma(m: Modalidad): ClaseAlma | null {
  switch (m) {
    case "ACVC":
      return "ac";
    case "PCV":
      return "pc";
    case "CPAP_PS":
      return "ps";
    case "CNAF":
      return null;
  }
}

const texto = (v: number | null): string | null => (v === null ? null : String(v));

/**
 * Valores en el orden del formulario de ventilacion mecanica de ALMA, para
 * tipearlos uno a uno (un registro por control). Es un esquema, no la pantalla real.
 */
export function camposAlma(
  control: Control,
  pbw: number,
  equipos: readonly EquipoEnSala[] = []
): readonly CampoAlma[] {
  const v = control.ventilacion;
  const d = calcularDerivados(control, pbw);
  const k = claseModoAlma(v.modalidad);
  const campos: CampoAlma[] = [
    { etiqueta: "SAS", valor: sedoanalgesiaActiva(control.infusiones) ? texto(control.sas) : "—" },
    { etiqueta: "Modelo Ventilador", valor: equipoEnUso(equipos) ? etiquetaEquipo(equipoEnUso(equipos)!) : null },
    { etiqueta: "Modo", valor: ETIQUETA_MODALIDAD[v.modalidad] }
  ];

  if (k === "ps") campos.push({ etiqueta: "FR total", valor: texto(v.frTotal) });
  else if (k) campos.push({ etiqueta: "FR programada", valor: texto(v.frProgramada) });

  if (k === "ac") campos.push({ etiqueta: "Vol. Corriente Programado", valor: texto(v.vtProgramado) });
  else if (k) campos.push({ etiqueta: "Espirado", valor: texto(v.vtEspirado) });

  campos.push(
    { etiqueta: "Vol. Minuto", valor: texto(d.volumenMinuto) },
    { etiqueta: "P. Pico", valor: texto(v.pPico) },
    { etiqueta: "Meseta (Pº Media)", valor: texto(v.pMedia) }
  );

  if (k === "ps") campos.push({ etiqueta: "Soporte", valor: texto(v.presion) });
  else if (k === "pc") campos.push({ etiqueta: "Control", valor: texto(v.presion) });

  const comentarios = [
    v.frTotal !== null && k !== "ps" ? `FR total ${v.frTotal}` : "",
    k === "ac" && v.vtEspirado !== null ? `Vt espirado ${v.vtEspirado}` : "",
    v.flujo !== null ? `Flujo ${v.flujo} L/min` : "",
    d.origenDriving === "PLATEAU" && v.pPlateau !== null ? `P. Plateau ${v.pPlateau}` : "",
    d.drivingPressure !== null ? `P. Distensión ${d.drivingPressure}${d.origenDriving === "PICO" ? " (con P. pico)" : ""}` : ""
  ].filter((x) => x !== "");

  campos.push(
    { etiqueta: "PEEP Programado", valor: texto(v.peep) },
    { etiqueta: "Tipo de Humidificación", valor: (() => { const h = equipos.find((e) => e.tipo === "HUMIDIFICADOR"); return h ? etiquetaEquipo(h) : null; })() },
    { etiqueta: "FiO2 Programado", valor: texto(v.fio2) },
    { etiqueta: "I:E", valor: d.relacionIE },
    {
      etiqueta: "Compliance Estática",
      valor: mecanicaBloqueadaPorAsincronia(v) ? "no valorable (asincronía)" : texto(d.compliance)
    },
    { etiqueta: "Auto PEEP", valor: esModalidadControlada(v.modalidad) ? texto(v.autoPeep) : "—" },
    { etiqueta: "SpO2", valor: texto(control.spo2) },
    { etiqueta: "Comentarios", valor: comentarios.length > 0 ? comentarios.join(" · ") : null }
  );
  return campos;
}
