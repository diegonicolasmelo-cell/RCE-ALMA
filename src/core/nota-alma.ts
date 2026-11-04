/**
 * Generador de evolucion clinica para HIS ALMA (TrakCare).
 *
 * Es la pieza con mas valor clinico por linea de codigo: resuelve el principal
 * cuello de botella operativo (transcripcion manual). Por eso es una funcion
 * pura y va con tests sobre casos reales.
 *
 * Respeta el candado de mecanica: si la asincronia en modo controlado invalida
 * el plateau, la nota NO reporta driving pressure ni compliance, y dice por que.
 * Una sola fuente de verdad con la pantalla (src/core/validez.ts).
 */

import { buscarProfesional } from "./dotacion";
import { calcularDerivados, calcularPbw, esViaAereaArtificial } from "./fisiologia";
import { describirDva } from "./dva";
import { describirSedacion } from "./sedacion";
import { ESCALA_SAS, ESTADOS_VIGILIA } from "./catalogos";
import { estadoProno, eventosDeRiesgo } from "./eventos";
import { resumirTurno } from "./rem28";
import type { Control, Episodio, EventoClinico, ValidacionApk } from "./tipos";

export type ModoNota = "TURNO_COMPLETO" | "ULTIMA_ATENCION";

export interface EntradaNota {
  readonly episodio: Episodio;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
  readonly apk: readonly ValidacionApk[];
  readonly modo: ModoNota;
  readonly ahora: Date;
}

function nombreDe(rut: string): string {
  const p = buscarProfesional(rut);
  return p ? `Klgo. ${p.nombre}` : `RUT ${rut}`;
}

function ordenados(controles: readonly Control[]): readonly Control[] {
  return [...controles].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
}

function etiquetaVia(e: Episodio): string {
  return esViaAereaArtificial(e.viaAereaActual)
    ? `${e.viaAereaActual}${e.calibreVia ? ` ${e.calibreVia}` : ""}${
        e.fijacionCm ? ` (fijacion ${e.fijacionCm})` : ""
      }`
    : "via aerea natural";
}

function etiquetaConciencia(c: Control): string {
  if (c.sedacionActiva) {
    const sas = ESCALA_SAS.find((s) => s.val === c.sas);
    return sas ? `SAS ${sas.label.replace("· ", "")}` : "SAS no consignado";
  }
  const v = ESTADOS_VIGILIA.find((e) => e.val === c.vigilia);
  return v ? `estado de vigilia ${v.label.toLowerCase()}` : "estado de vigilia no consignado";
}

/** Bloque respiratorio de un control, con el candado de mecanica aplicado. */
function bloqueRespiratorio(c: Control, pbw: number): string {
  const d = calcularDerivados(c, pbw);
  const s = c.soporte;

  if (s.tipo === "VMI") {
    const partes = [
      `VMI ${s.modoVMI ?? "modo no consignado"}`,
      `FiO2 ${fmt(s.fio2)}%`,
      `PEEP ${fmt(s.peep)} cmH2O`,
      `Vt ${fmt(s.vt)} ml${d.vtPorKg !== null ? ` (${d.vtPorKg} ml/kg PBW)` : ""}`,
      `FR ${fmt(s.fr)} rpm`,
      `P.pico ${fmt(s.pPico)} cmH2O`
    ];

    if (d.drivingPressure !== null) {
      partes.push(
        `P.plateau ${fmt(s.pPlateau)} cmH2O`,
        `driving pressure ${d.drivingPressure} cmH2O`,
        `compliance estatica ${d.compliance ?? "--"} ml/cmH2O`
      );
    } else if (s.asincronico) {
      // No se reporta un dato contaminado por esfuerzo muscular activo.
      partes.push(
        `mecanica estatica no valorable (asincronia paciente-ventilador en modo controlado)`
      );
    }

    if (d.tobin !== null) partes.push(`indice de Tobin ${d.tobin}`);
    if (s.presionCuff !== null) partes.push(`presion de cuff ${s.presionCuff} cmH2O`);
    return partes.join(", ");
  }

  const partes = [etiquetaSoporteNoInvasivo(c), `FiO2 ${fmt(s.fio2)}%`];
  if (s.flujo !== null) partes.push(`flujo ${s.flujo} L/min`);
  if (s.fr !== null) partes.push(`FR ${s.fr} rpm`);
  if (d.rox !== null) partes.push(`indice ROX ${d.rox}`);
  return partes.join(", ");
}

function etiquetaSoporteNoInvasivo(c: Control): string {
  switch (c.soporte.tipo) {
    case "VMNI":
      return "VMNI";
    case "CNAF":
      return "CNAF";
    case "O2_CONVENCIONAL":
      return "oxigenoterapia convencional";
    case "AIRE_AMBIENTAL":
      return "aire ambiental";
    case "VMI":
      return "VMI";
    default:
      return "soporte no consignado";
  }
}

function fmt(v: number | null): string {
  return v === null ? "--" : String(v);
}

function bloqueEsfuerzo(c: Control, pbw: number): string | null {
  if (c.esfuerzo === null) return null;
  const e = c.esfuerzo;
  const d = calcularDerivados(c, pbw);
  const partes: string[] = [];
  if (e.p01 !== null) partes.push(`P0.1 ${e.p01} cmH2O`);
  if (e.nif !== null) partes.push(`NIF ${e.nif} cmH2O`);
  if (e.pOcc !== null) partes.push(`P.occ ${e.pOcc} cmH2O`);
  if (e.pMus !== null) partes.push(`P.mus ${e.pMus} cmH2O`);
  if (e.pmi !== null) partes.push(`PMI ${e.pmi} cmH2O`);
  if (e.pim !== null) partes.push(`PIM ${e.pim} cmH2O`);
  if (e.pcf !== null) {
    const semaforo =
      d.semaforoPcf === "OPTIMO"
        ? "sobre corte de exito"
        : d.semaforoPcf === "LIMITE"
          ? "en rango limite"
          : "bajo corte de exito";
    partes.push(`flujo pico de tos ${e.pcf} L/min (${semaforo})`);
  }
  return partes.length > 0 ? partes.join(", ") : null;
}

function bloqueMotor(c: Control): string {
  const i = c.intervencion;
  if (i.motoraContraindicada) {
    return `Kinesiterapia motora contraindicada por: ${
      i.motivoContraindicacion ?? "motivo no consignado"
    }.`;
  }
  if (i.actividadesMotoras.length === 0) {
    return `Kinesiterapia motora sin actividades consignadas${
      i.ims !== null ? ` (IMS ${i.ims})` : ""
    }.`;
  }
  return `Kinesiterapia motora realizada: ${i.actividadesMotoras.join(", ").toLowerCase()}${
    i.ims !== null ? ` (nivel IMS ${i.ims})` : ""
  }.`;
}

function describirEvento(ev: EventoClinico): string {
  switch (ev.tipo) {
    case "INICIO_PVE":
      return `Inicio de PVE (protocolo ${ev.duracionMin} min)`;
    case "FIN_PVE":
      return `Fin de PVE: ${ev.exitosa ? "tolerada" : "no tolerada"}`;
    case "EXTUBACION_PROGRAMADA":
      return `Extubacion programada, queda en ${ev.dispositivoSalida}`;
    case "AUTOEXTUBACION":
      return `AUTOEXTUBACION NO PLANIFICADA, queda en ${ev.dispositivoSalida}`;
    case "REINTUBACION":
      return `Reintubacion ${ev.via} calibre ${ev.calibre}, fijacion ${ev.fijacionCm}`;
    case "TRAQUEOSTOMIA":
      return `Traqueostomia calibre ${ev.calibre}`;
    case "AJUSTE_TUBO":
      return `Ajuste de fijacion a ${ev.fijacionCm} cm (${
        ev.motivo === "DESPLAZAMIENTO_SUPERFICIAL"
          ? "desplazamiento superficial"
          : "control radiologico"
      })`;
    case "INICIO_PRONO":
      return "Inicio de ciclo de prono";
    case "SUPINACION":
      return "Supinacion";
    case "INICIO_BNM":
      return `Inicio de bloqueo neuromuscular (${ev.farmaco})`;
    case "FIN_BNM":
      return "Suspension de bloqueo neuromuscular";
    case "PCR":
      return `Evento PCR, reanimacion ${ev.duracionReanimacionMin} min`;
    case "EVENTO_CENTINELA":
      return `Evento centinela: ${ev.descripcion}`;
    case "ASISTENCIA_PROCEDIMIENTO":
      return `Asistencia en ${ev.procedimiento}`;
    case "TOMA_CULTIVO":
      return `Toma de cultivo (${ev.muestra})`;
    case "TRASLADO_IMAGEN":
      return `Traslado a ${ev.destino}`;
    default: {
      const _exhaustivo: never = ev;
      return String(_exhaustivo);
    }
  }
}

/** Nota de una sola atencion, para controles intermedios. */
function notaUltimaAtencion(entrada: EntradaNota, pbw: number): string {
  const { episodio } = entrada;
  const lista = ordenados(entrada.controles);
  const u = lista[lista.length - 1];
  if (!u) return `[SIN CONTROLES REGISTRADOS PARA ${episodio.cama}]`;

  const d = calcularDerivados(u, pbw);
  const esfuerzo = bloqueEsfuerzo(u, pbw);

  const lineas = [
    `[CONTROL KINESIOLOGIA UPC · ${episodio.cama} · ATENCION #${u.numero} (${u.hora} hrs)]`,
    `Profesional: ${nombreDe(u.rutAutor)}${u.esControlApoyo ? " (control de apoyo)" : ""}.`,
    ``,
    `1. HEMODINAMIA: FC ${fmt(u.fc)} lpm, PA ${fmt(u.pas)}/${fmt(u.pad)} mmHg (PAM ${fmt(
      d.pam
    )} mmHg). ${capitalizar(describirDva(u.dva))}.${
      u.pic !== null ? ` PIC ${u.pic} mmHg (PPC ${fmt(d.ppc)} mmHg).` : ""
    }`,
    `2. CONCIENCIA Y SEDACION: Glasgow ${d.glasgow.completo}, ${etiquetaConciencia(u)}. ${
      u.sedacionActiva ? `Sedoanalgesia: ${describirSedacion(u.sedacion)}.` : "Sin sedoanalgesia."
    }${u.bnmActivo ? " Con bloqueo neuromuscular activo." : ""}`,
    `3. RESPIRATORIO Y VIA AEREA: ${etiquetaVia(episodio)} en ${bloqueRespiratorio(u, pbw)}. ` +
      `SpO2 ${fmt(u.spo2)}%.${
        u.secrecionesCantidad
          ? ` Secreciones ${u.secrecionesCantidad.toLowerCase()}${
              u.secrecionesTipo ? ` ${u.secrecionesTipo.toLowerCase()}` : ""
            }${u.intervencion.aspiracion !== "NO_REQUIERE" ? ", aspiradas" : ""}.`
          : ""
      }`,
    ...(esfuerzo ? [`4. ESFUERZO RESPIRATORIO: ${esfuerzo}.`] : []),
    `${esfuerzo ? "5" : "4"}. KINESITERAPIA: ${
      u.intervencion.respiratoriaRealizada
        ? "Kinesiterapia respiratoria realizada. "
        : ""
    }${bloqueMotor(u)}`,
    ...(u.observaciones ? [``, `Observacion: ${u.observaciones}`] : [])
  ];

  return lineas.join("\n");
}

function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Nota de resumen de turno: la que se pega en ALMA al cierre. */
function notaTurnoCompleto(entrada: EntradaNota, pbw: number): string {
  const { episodio, eventos, apk } = entrada;
  const lista = ordenados(entrada.controles);
  const primero = lista[0];
  const ultimo = lista[lista.length - 1];

  if (!primero || !ultimo) {
    return `[SIN CONTROLES REGISTRADOS EN EL TURNO PARA ${episodio.cama}]`;
  }

  const dPrimero = calcularDerivados(primero, pbw);
  const dUltimo = calcularDerivados(ultimo, pbw);
  const stats = resumirTurno(lista, eventos, apk);
  const prono = estadoProno(eventos, entrada.ahora);
  const riesgos = eventosDeRiesgo(eventos);

  const cronologia = lista
    .map((c) => {
      const evs = eventos
        .filter((e) => e.hora === c.hora)
        .map(describirEvento);
      const hitos = evs.length > 0 ? ` | Hitos: ${evs.join("; ")}` : "";
      return `  · [#${c.numero} · ${c.hora} hrs${
        c.esControlApoyo ? " · apoyo" : ""
      }] ${bloqueMotor(c)}${hitos}${c.observaciones ? ` ${c.observaciones}` : ""}`;
    })
    .join("\n");

  const eventosFueraDeControl = eventos
    .filter((e) => !lista.some((c) => c.hora === e.hora))
    .map((e) => `  · [${e.hora} hrs] ${describirEvento(e)}${e.comentario ? `. ${e.comentario}` : ""}`)
    .join("\n");

  const bloques = [
    `[EVOLUCION KINESIOLOGIA UPC · RESUMEN DE TURNO · ${episodio.cama}]`,
    `Diagnostico: ${episodio.diagnostico} | Edad ${episodio.edad} a | PBW ${pbw} kg | Dias de VM: ${episodio.diasVM}`,
    ``,
    `1. HEMODINAMIA Y PERFUSION`,
    `Inicia turno (${primero.hora} hrs) con PAM ${fmt(dPrimero.pam)} mmHg y cierra (${
      ultimo.hora
    } hrs) con FC ${fmt(ultimo.fc)} lpm, PA ${fmt(ultimo.pas)}/${fmt(ultimo.pad)} mmHg (PAM ${fmt(
      dUltimo.pam
    )} mmHg). ${capitalizar(describirDva(ultimo.dva))}.${
      ultimo.pic !== null ? ` PIC ${ultimo.pic} mmHg con PPC ${fmt(dUltimo.ppc)} mmHg.` : ""
    }`,
    ``,
    `2. CONCIENCIA Y SEDACION`,
    `Evoluciona desde Glasgow ${dPrimero.glasgow.display} hacia Glasgow ${
      dUltimo.glasgow.completo
    }, ${etiquetaConciencia(ultimo)}. ${
      ultimo.sedacionActiva
        ? `Sedoanalgesia al cierre: ${describirSedacion(ultimo.sedacion)}.`
        : "Sin sedoanalgesia al cierre."
    }${ultimo.bnmActivo ? " Mantiene bloqueo neuromuscular." : ""}`,
    ``,
    `3. SOPORTE VENTILATORIO AL CIERRE`,
    `${capitalizar(etiquetaVia(episodio))} en ${bloqueRespiratorio(ultimo, pbw)}. SpO2 ${fmt(
      ultimo.spo2
    )}%.`,
    ...(bloqueEsfuerzo(ultimo, pbw)
      ? [`Esfuerzo respiratorio: ${bloqueEsfuerzo(ultimo, pbw)}.`]
      : []),
    ...(prono.ciclosCompletados > 0 || prono.enProno
      ? [
          `Prono: ${prono.ciclosCompletados} ciclo(s) completado(s), ${prono.horasAcumuladas} h acumuladas${
            prono.enProno ? " (en prono al cierre)" : ""
          }.`
        ]
      : []),
    ``,
    `4. PRODUCCION KINESICA DEL TURNO (${stats.totalControles} controles)`,
    `  · Kinesiterapia respiratoria: ${stats.kineRespiratoria} | Aspiraciones: ${stats.aspiraciones}`,
    `  · Kinesiterapia motora realizada: ${stats.kineMotoraRealizada} (contraindicada: ${stats.kineMotoraContraindicada}) | IMS al cierre: ${
      ultimo.intervencion.ims ?? "--"
    }`,
    `  · Movilizacion por nivel: N1 ${stats.movilizacionPorNivel[1]} · N2 ${stats.movilizacionPorNivel[2]} · N3 ${stats.movilizacionPorNivel[3]} · N4 ${stats.movilizacionPorNivel[4]}`,
    `  · Pautas APK validadas: ${stats.apkCumple} (no cumple: ${stats.apkNoCumple})`,
    `  · Hitos: PVE ${stats.pve} | cultivos ${stats.cultivos} | asistencia a procedimientos ${stats.asistenciaProcedimientos} | traslados ${stats.traslados} | reintubaciones ${stats.reintubaciones}`,
    ``,
    `5. CRONOLOGIA DE ATENCIONES`,
    cronologia,
    ...(eventosFueraDeControl ? [``, `Eventos clinicos adicionales:`, eventosFueraDeControl] : []),
    ...(riesgos.length > 0
      ? [
          ``,
          `6. EVENTOS DE SEGURIDAD DEL PACIENTE`,
          ...riesgos.map(
            (e) => `  · [${e.hora} hrs] ${describirEvento(e)}. Notificado para gestion de riesgo.`
          )
        ]
      : []),
    ``,
    `PLAN / ENTREGA DE TURNO: ${episodio.pendienteEntrega || "sin pendientes consignados"}`
  ];

  return bloques.join("\n");
}

/** Punto de entrada unico del generador. */
export function componerNotaAlma(entrada: EntradaNota): string {
  const pbw = calcularPbw(entrada.episodio.tallaCm, entrada.episodio.sexo);
  return entrada.modo === "ULTIMA_ATENCION"
    ? notaUltimaAtencion(entrada, pbw)
    : notaTurnoCompleto(entrada, pbw);
}

// ---------------------------------------------------------------------------
// Casillas discretas
// ---------------------------------------------------------------------------

export interface CasillaAlma {
  readonly id: string;
  readonly label: string;
  /** `false` para parametros que en ALMA llena enfermeria, no kinesiologia. */
  readonly deKine: boolean;
  readonly valor: string;
}

/**
 * ALMA tiene campos discretos, no solo una caja de notas. Estas son las
 * casillas para copiar de a una, en el orden del formulario.
 */
export function casillasAlma(control: Control, pbw: number): readonly CasillaAlma[] {
  const d = calcularDerivados(control, pbw);
  const s = control.soporte;
  const bloqueada = d.leyendaMecanica ?? "No valorable";

  return [
    { id: "via", label: "Via aerea", deKine: true, valor: control.viaAerea },
    { id: "soporte", label: "Soporte respiratorio", deKine: true, valor: etiquetaSoporteNoInvasivo(control) },
    { id: "modoVMI", label: "Modalidad VMI", deKine: true, valor: s.modoVMI ?? "--" },
    { id: "fio2", label: "FiO2 (%)", deKine: true, valor: fmt(s.fio2) },
    { id: "peep", label: "PEEP / CPAP (cmH2O)", deKine: true, valor: fmt(s.peep) },
    { id: "vt", label: "Vt espirado (ml)", deKine: true, valor: fmt(s.vt) },
    { id: "vtKg", label: "Vt / kg PBW (ml/kg)", deKine: true, valor: fmt(d.vtPorKg) },
    { id: "ps", label: "Presion soporte (cmH2O)", deKine: true, valor: fmt(s.presionSoporte) },
    { id: "fr", label: "Frecuencia respiratoria (rpm)", deKine: true, valor: fmt(s.fr) },
    { id: "ppico", label: "Presion pico (cmH2O)", deKine: true, valor: fmt(s.pPico) },
    {
      id: "pplat",
      label: "Presion plateau (cmH2O)",
      deKine: true,
      valor: d.drivingPressure !== null ? fmt(s.pPlateau) : bloqueada
    },
    {
      id: "dp",
      label: "Driving pressure (cmH2O)",
      deKine: true,
      valor: d.drivingPressure !== null ? String(d.drivingPressure) : bloqueada
    },
    {
      id: "crs",
      label: "Compliance estatica (ml/cmH2O)",
      deKine: true,
      valor: d.compliance !== null ? String(d.compliance) : bloqueada
    },
    { id: "tobin", label: "Indice Tobin (RSBI)", deKine: true, valor: fmt(d.tobin) },
    { id: "flujo", label: "Flujo CNAF (L/min)", deKine: true, valor: fmt(s.flujo) },
    { id: "rox", label: "Indice ROX", deKine: true, valor: fmt(d.rox) },
    { id: "cuff", label: "Presion cuff (cmH2O)", deKine: true, valor: fmt(s.presionCuff) },
    { id: "spo2", label: "SpO2 (%)", deKine: true, valor: fmt(control.spo2) },
    { id: "pcf", label: "Flujo pico de tos (L/min)", deKine: true, valor: fmt(control.esfuerzo?.pcf ?? null) },
    { id: "glasgow", label: "Glasgow (O-V-M)", deKine: true, valor: d.glasgow.completo },
    {
      id: "conciencia",
      label: control.sedacionActiva ? "Escala SAS" : "Estado de vigilia",
      deKine: true,
      valor: etiquetaConciencia(control)
    },
    { id: "ims", label: "Nivel IMS", deKine: true, valor: String(control.intervencion.ims ?? "--") },
    { id: "fc", label: "Frecuencia cardiaca (lpm)", deKine: false, valor: fmt(control.fc) },
    {
      id: "pa",
      label: "Presion arterial (PAM)",
      deKine: false,
      valor: `${fmt(control.pas)}/${fmt(control.pad)} (${fmt(d.pam)})`
    },
    { id: "dva", label: "Drogas vasoactivas", deKine: false, valor: describirDva(control.dva) }
  ];
}
