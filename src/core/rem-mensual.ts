/**
 * REM 28 del mes, calculado desde el log (no se acumula: se agrega sobre lo registrado).
 *
 * Definiciones de la unidad (Diego, 11-nov-2026):
 *   B.1 ingresos y egresos: personas, por categoria REM, sexo y rango quinquenal.
 *   B.2 evaluacion inicial: una por ingreso del mes.
 *   B.3 evaluacion intermedia: cualquier reevaluacion (una escala que ya se habia medido en el episodio).
 *   B.4 sesiones: solo las motoras (eventos de terapia fisica realizada; antes, controles con ella).
 *   B.6 ejercicios terapeuticos = sesiones motoras; terapia respiratoria = controles + IMT (como
 *   el RCE); fisioterapia = sesiones con EMS; educacion = eventos de educacion (16-nov-2026).
 *   BS 0102501 = personas con IMT en el mes; 01010922 PTO = personas con su PRIMERA
 *   bipedestacion del episodio en el mes (KTM nivel 4 o 5).
 *   Asistencia en VMNI: cada conexion de un paciente a la VMNI.
 *   BS: una atencion por persona en el mes.
 */

import { CATEGORIAS_REM, GRUPO_MODALIDAD, MOTIVOS_EGRESO, RANGOS_EDAD } from "./catalogos";
import type { CategoriaRem, MotivoEgreso, RangoEdad } from "./catalogos";
import type { Control, Episodio, EventoClinico } from "./tipos";
import { primeraBipedestacion } from "./estadistica";

/** "AAAA-MM" en hora local. */
export function mesDe(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface CeldaSexo {
  readonly hombres: number;
  readonly mujeres: number;
}

/** Una fila de B.1: total, por sexo y por rango x sexo. */
export interface FilaSexoRango {
  readonly total: number;
  readonly hombres: number;
  readonly mujeres: number;
  readonly porRango: Readonly<Record<RangoEdad, CeldaSexo>>;
  /** Personas contadas sin rango de edad: no caben en ninguna columna y hay que completarlas. */
  readonly sinRango: number;
}

/** Una fila de B.2 a B.4: total y por rango (sin sexo). */
export interface FilaRango {
  readonly total: number;
  readonly porRango: Readonly<Record<RangoEdad, number>>;
  readonly sinRango: number;
}

export interface RemMensual {
  readonly mes: string;
  readonly ingresos: FilaSexoRango;
  readonly ingresosPorCategoria: Readonly<Record<CategoriaRem, FilaSexoRango>>;
  readonly ingresosSinCategoria: number;
  readonly egresos: FilaSexoRango;
  readonly egresosPorMotivo: Readonly<Record<MotivoEgreso, FilaSexoRango>>;
  /** Egresados del mes dados de alta antes de que existiera el motivo. */
  readonly egresosSinMotivo: number;
  readonly evaluacionInicial: FilaRango;
  readonly evaluacionIntermedia: FilaRango;
  readonly sesionesMotoras: FilaRango;
  /** B.6 Terapia respiratoria y funcional pulmonar: controles del mes. */
  readonly terapiaRespiratoria: number;
  /** B.6 Ejercicios terapeuticos: sesiones motoras del mes. */
  readonly ejerciciosTerapeuticos: number;
  /** B.6 Fisioterapia: sesiones con electroestimulacion (EMS). */
  readonly fisioterapia: number;
  /** B.6 Educacion a usuario/a, cuidador/a y/o familiar. */
  readonly educacion: number;
  /** Sesiones de IMT del mes (van dentro de la terapia respiratoria). */
  readonly sesionesImt: number;
  /** Conexiones de pacientes a la VMNI en el mes (cada paso de otro soporte a VNI). */
  readonly conexionesVmni: number;
  readonly bs: {
    /** 0601101 Evaluacion kinesiologica integral: ingresos del mes. */
    readonly evaluacionIntegral: number;
    /** 0601104 Atencion kinesiologica integral UPC: personas atendidas en el mes. */
    readonly atencionIntegralUpc: number;
    /** 0601024 Reeducacion motriz: personas con al menos una sesion motora. */
    readonly reeducacionMotriz: number;
    /** 0601030 Maniobras de permeabilizacion de la via aerea: personas con al menos una sesion respiratoria. */
    readonly permeabilizacionViaAerea: number;
    /** 0601171 Asistencia en IOT, VMNI o cambio de canula de TQT: personas con eso en el mes. */
    readonly asistenciaIotCanula: number;
    /** 0102501 Reeducacion de la tos y respiracion (IMT): personas con IMT en el mes. */
    readonly reeducacionTos: number;
    /** 01010922 Prueba de tolerancia ortostatica: primeras bipedestaciones del episodio en el mes. */
    readonly toleranciaOrtostatica: number;
  };
}

function filaSexoRangoVacia(): { total: number; hombres: number; mujeres: number; porRango: Record<RangoEdad, { hombres: number; mujeres: number }>; sinRango: number } {
  const porRango = Object.fromEntries(RANGOS_EDAD.map((r) => [r, { hombres: 0, mujeres: 0 }])) as Record<RangoEdad, { hombres: number; mujeres: number }>;
  return { total: 0, hombres: 0, mujeres: 0, porRango, sinRango: 0 };
}

function filaRangoVacia(): { total: number; porRango: Record<RangoEdad, number>; sinRango: number } {
  return { total: 0, porRango: Object.fromEntries(RANGOS_EDAD.map((r) => [r, 0])) as Record<RangoEdad, number>, sinRango: 0 };
}

function sumarPersona(f: ReturnType<typeof filaSexoRangoVacia>, ep: Episodio): void {
  f.total++;
  const h = ep.sexo === "M";
  if (h) f.hombres++;
  else f.mujeres++;
  if (!ep.rangoEdad) f.sinRango++;
  else if (h) f.porRango[ep.rangoEdad].hombres++;
  else f.porRango[ep.rangoEdad].mujeres++;
}

function sumarRango(f: ReturnType<typeof filaRangoVacia>, ep: Episodio, n = 1): void {
  f.total += n;
  if (ep.rangoEdad) f.porRango[ep.rangoEdad] += n;
  else f.sinRango += n;
}

const EVENTOS_ASISTENCIA_IOT: readonly EventoClinico["tipo"][] = ["REINTUBACION", "CAMBIO_TUBO", "CAMBIO_CANULA"];

export function consolidarRemMensual(
  mes: string,
  episodios: readonly Episodio[],
  controles: ReadonlyMap<string, readonly Control[]>,
  eventos: ReadonlyMap<string, readonly EventoClinico[]>
): RemMensual {
  const ingresos = filaSexoRangoVacia();
  const porCategoria = Object.fromEntries(CATEGORIAS_REM.map((c) => [c, filaSexoRangoVacia()])) as Record<CategoriaRem, ReturnType<typeof filaSexoRangoVacia>>;
  let ingresosSinCategoria = 0;
  const egresos = filaSexoRangoVacia();
  const porMotivo = Object.fromEntries(MOTIVOS_EGRESO.map((m) => [m, filaSexoRangoVacia()])) as Record<MotivoEgreso, ReturnType<typeof filaSexoRangoVacia>>;
  let egresosSinMotivo = 0;
  const inicial = filaRangoVacia();
  const intermedia = filaRangoVacia();
  const motoras = filaRangoVacia();
  let terapiaRespiratoria = 0;
  let atendidas = 0;
  let conMotora = 0;
  let conAsistencia = 0;
  let conRespiratoria = 0;
  let conexionesVmni = 0;
  let fisioterapia = 0;
  let educacion = 0;
  let sesionesImt = 0;
  let conImt = 0;
  let pto = 0;

  for (const ep of episodios) {
    if (ep.ingresadoEn && mesDe(ep.ingresadoEn) === mes) {
      sumarPersona(ingresos, ep);
      if (ep.categoriaRem) sumarPersona(porCategoria[ep.categoriaRem], ep);
      else ingresosSinCategoria++;
      sumarRango(inicial, ep);
    }
    if (!ep.activo) {
      if (ep.egreso && mesDe(ep.egreso.en) === mes) {
        sumarPersona(egresos, ep);
        sumarPersona(porMotivo[ep.egreso.motivo], ep);
      } else if (!ep.egreso) {
        egresosSinMotivo++;
      }
    }

    const todosCs = [...(controles.get(ep.id) ?? [])].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
    const cs = todosCs.filter((c) => mesDe(c.registradoEn) === mes);
    if (cs.length > 0) conRespiratoria++;
    let vmniDelMes = 0;
    todosCs.forEach((c, i) => {
      const enVni = GRUPO_MODALIDAD[c.ventilacion.modalidad] === "VNI";
      const veniaEnVni = i > 0 && GRUPO_MODALIDAD[todosCs[i - 1]!.ventilacion.modalidad] === "VNI";
      if (enVni && !veniaEnVni && mesDe(c.registradoEn) === mes) vmniDelMes++;
    });
    conexionesVmni += vmniDelMes;
    const evs = eventos.get(ep.id) ?? [];
    const delMes = evs.filter((e) => mesDe(e.registradoEn) === mes);
    const ktmAntigua = cs.filter((c) => c.terapiaFisica.estado === "REALIZADA");
    const ktmEv = delMes.filter((e): e is Extract<EventoClinico, { tipo: "TERAPIA_FISICA" }> => e.tipo === "TERAPIA_FISICA" && e.realizada);
    const nMotoras = ktmAntigua.length + ktmEv.length;
    const nImt = ktmAntigua.filter((c) => c.terapiaFisica.actividades.some((a) => a.startsWith("IMT"))).length + delMes.filter((e) => e.tipo === "IMT").length;
    terapiaRespiratoria += cs.length + nImt;
    sesionesImt += nImt;
    if (nImt > 0) conImt++;
    fisioterapia += ktmAntigua.filter((c) => c.terapiaFisica.actividades.some((a) => a.startsWith("EMS"))).length + ktmEv.filter((e) => e.ems).length;
    educacion += delMes.filter((e) => e.tipo === "EDUCACION").length;
    const bip = primeraBipedestacion(todosCs, evs);
    if (bip && mesDe(bip) === mes) pto++;
    if (nMotoras > 0) {
      sumarRango(motoras, ep, nMotoras);
      conMotora++;
    }
    if (cs.length > 0 || delMes.length > 0) atendidas++;
    if (vmniDelMes > 0 || delMes.some((e) => EVENTOS_ASISTENCIA_IOT.includes(e.tipo))) conAsistencia++;

    // Reevaluacion: una escala que ya se habia medido antes en el mismo episodio.
    const vistas = new Set<string>();
    for (const e of [...evs].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn))) {
      if (e.tipo !== "EVALUACION_PUNTUAL") continue;
      if (vistas.has(e.escala) && mesDe(e.registradoEn) === mes) sumarRango(intermedia, ep);
      vistas.add(e.escala);
    }
  }

  return {
    mes,
    ingresos,
    ingresosPorCategoria: porCategoria,
    ingresosSinCategoria,
    egresos,
    egresosPorMotivo: porMotivo,
    egresosSinMotivo,
    evaluacionInicial: inicial,
    evaluacionIntermedia: intermedia,
    sesionesMotoras: motoras,
    terapiaRespiratoria,
    ejerciciosTerapeuticos: motoras.total,
    fisioterapia,
    educacion,
    sesionesImt,
    conexionesVmni,
    bs: {
      evaluacionIntegral: ingresos.total,
      atencionIntegralUpc: atendidas,
      reeducacionMotriz: conMotora,
      permeabilizacionViaAerea: conRespiratoria,
      asistenciaIotCanula: conAsistencia,
      reeducacionTos: conImt,
      toleranciaOrtostatica: pto
    }
  };
}

