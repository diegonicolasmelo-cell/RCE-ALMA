/**
 * Datos de demostracion: pacientes INVENTADOS para probar la app sin servidor.
 * Nunca se cargan cuando hay una API configurada.
 */

import { construirRut, firmarApkCumple, turnoAnterior } from "@core/index";
import type {
  Control,
  Episodio,
  EventoClinico,
  IdentidadPaciente,
  Infusiones,
  Ventilacion
} from "@core/index";
import type { BaseLocal } from "./db";
import type { Repositorio } from "./repositorio";

const MIN = 60_000;
const RUT_DIEGO = "16.452.891-K";
const RUT_KAREN = "33.333.333-3";
const RUT_EDUARDO = "33.333.331-1";

const hora = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function vent(over: Partial<Ventilacion> = {}): Ventilacion {
  return {
    modalidad: "ACVC",
    asincronico: false,
    frProgramada: 18,
    vtProgramado: 430,
    flujo: 50,
    ti: 1.0,
    presion: null,
    peep: 10,
    fio2: 45,
    frTotal: 20,
    vtEspirado: 430,
    pPico: 25,
    pPlateau: 20,
    pMedia: 12,
    autoPeep: null,
    volMinuto: 8.6,
    temperatura: null,
    fuga: null,
    presionMax: null,
    musculaturaAccesoria: null,
    ...over
  };
}

interface DatosControl {
  episodioId: string;
  numero: number;
  ahora: Date;
  minutosAtras: number;
  autor?: string;
  over: Partial<Control>;
}

function control(d: DatosControl): Control {
  const t = new Date(d.ahora.getTime() - d.minutosAtras * MIN);
  return {
    id: `${d.episodioId}-c${d.numero}`,
    episodioId: d.episodioId,
    numero: d.numero,
    hora: hora(t),
    registradoEn: t.toISOString(),
    rutAutor: d.autor ?? RUT_DIEGO,
    esControlApoyo: false,
    corrige: null,
    fc: 90,
    pas: 118,
    pad: 66,
    spo2: 96,
    viaAerea: "TET",
    ventilacion: vent(),
    esfuerzo: null,
    neuro: null,
    infusiones: {},
    sas: 4,
    vigilia: null,
    glasgow: null,
    s5q: null,
    kineResp: { auscultacion: "MP disminuido, crépitos bibasales", aspecto: "MUCOPURULENTA", reologia: "ESPESA", cantidad: "MODERADA", tos: "DEFICIENTE", flujoPicoTos: 60, deglucion: "ESPORADICA" },
    terapiaFisica: { estado: "NO", actividades: [], ims: null, motivoContraindicacion: null },
    observaciones: "",
    ...d.over
  };
}

/** Camas 09 a 18 del demo: lo justo para ver la portada completa (18 camas, 3 kinesiologos). */
const EXTRAS: readonly { edad: number; sexo: "M" | "F"; talla: number; dx: string; via: "TET" | "TQT" | "NATURAL"; dias: number }[] = [
  { edad: 61, sexo: "M", talla: 169, dx: "Postoperatorio cardíaco", via: "TET", dias: 1 },
  { edad: 49, sexo: "F", talla: 160, dx: "Pancreatitis grave", via: "TET", dias: 5 },
  { edad: 73, sexo: "M", talla: 172, dx: "Neumonía por aspiración", via: "NATURAL", dias: 0 },
  { edad: 35, sexo: "M", talla: 180, dx: "Politraumatizado", via: "TET", dias: 2 },
  { edad: 82, sexo: "F", talla: 155, dx: "EPOC reagudizado, VMNI", via: "NATURAL", dias: 0 },
  { edad: 56, sexo: "M", talla: 174, dx: "Sepsis abdominal", via: "TET", dias: 3 },
  { edad: 68, sexo: "F", talla: 158, dx: "Insuficiencia respiratoria hipoxémica", via: "TQT", dias: 14 },
  { edad: 44, sexo: "M", talla: 177, dx: "Cetoacidosis diabética", via: "NATURAL", dias: 0 },
  { edad: 59, sexo: "M", talla: 171, dx: "Hemorragia digestiva alta", via: "TET", dias: 2 },
  { edad: 66, sexo: "F", talla: 162, dx: "Postoperatorio neuroquirúrgico", via: "TET", dias: 1 }
];

const FENT = (esc: number, dosis: number): Infusiones => ({ fentanilo: { dosis, escalon: esc } });

export async function sembrarSiVacia(db: BaseLocal, repo: Repositorio, ahora: Date = new Date()): Promise<boolean> {
  if ((await db.episodios.count()) > 0) return false;

  const ep = (id: string, p: Partial<Episodio> & Pick<Episodio, "cama" | "edad" | "sexo" | "tallaCm" | "diagnostico">): Episodio => ({
    id,
    tallaOrigen: "ESTIMADA",
    viaAereaActual: "TET",
    calibreVia: "8.0",
    fijacionCm: "22",
    diasVM: 3,
    equipos: [],
    monitoreo: { capnografia: false, pic: false, dve: false },
    rutTitular: RUT_DIEGO,
    transcritoAlma: false,
    horaTranscripcion: null,
    pendienteEntrega: "",
    activo: true,
    apkArchivada: null,
    ...p
  });

  const episodios: Episodio[] = [
    ep("ep-01", { cama: "UCI-01", edad: 64, sexo: "M", tallaCm: 172, diagnostico: "Shock séptico foco pulmonar / SDRA en resolución", diasVM: 4,
      equipos: [{ tipo: "VENTILADOR", modelo: "Servo U", numero: null, enUso: true }, { tipo: "HUMIDIFICADOR", modelo: "Humidificador MR850", numero: 1, enUso: true }],
      pendienteEntrega: "Candidato a extubación si mantiene SAS 4 y supera PVE vespertina." }),
    ep("ep-02", { cama: "UCI-02", edad: 39, sexo: "F", tallaCm: 162, tallaOrigen: "MEDIDA", diagnostico: "TEC grave / neuromonitoreo", calibreVia: "7.5", fijacionCm: "21", diasVM: 6,
      equipos: [{ tipo: "VENTILADOR", modelo: "Savina", numero: 1, enUso: true }],
      monitoreo: { capnografia: true, pic: true, dve: true },
      pendienteEntrega: "Neuroprotección estricta: SAS 1-2, PPC > 70 mmHg y normocapnia." }),
    ep("ep-03", { cama: "UCI-03", edad: 71, sexo: "M", tallaCm: 168, diagnostico: "EPOC reagudizado / destete prolongado en TQT", viaAereaActual: "TQT", fijacionCm: "Collarín", diasVM: 12,
      equipos: [{ tipo: "VENTILADOR", modelo: "Vela", numero: 8, enUso: true }],
      transcritoAlma: true, horaTranscripcion: "12:40", pendienteEntrega: "Evaluar válvula de fonación mañana." }),
    ep("ep-04", { cama: "UCI-04", edad: 52, sexo: "M", tallaCm: 178, diagnostico: "SDRA grave, en prono", calibreVia: "8.5", fijacionCm: "23", diasVM: 3,
      equipos: [{ tipo: "VENTILADOR", modelo: "Meckis", numero: 3, enUso: true }] }),
    ep("ep-05", { cama: "UCI-05", edad: 58, sexo: "F", tallaCm: 158, diagnostico: "Neumonía grave, posextubación", viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null, diasVM: 0 }),
    ep("ep-06", { cama: "UCI-06", edad: 45, sexo: "M", tallaCm: 175, diagnostico: "Postoperatorio abdominal", diasVM: 1,
      equipos: [{ tipo: "VENTILADOR", modelo: "PB 980", numero: 2, enUso: true }] }),
    ep("ep-07", { cama: "UCI-07", edad: 67, sexo: "F", tallaCm: 160, diagnostico: "Insuficiencia cardiaca descompensada", viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null, diasVM: 0, rutTitular: RUT_KAREN }),
    ep("ep-08", { cama: "UCI-08", edad: 77, sexo: "M", tallaCm: 170, diagnostico: "Sepsis urinaria", viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null, diasVM: 0, rutTitular: RUT_KAREN }),
    ...EXTRAS.map((x, i) => {
      const n = i + 9;
      const natural = x.via === "NATURAL";
      return ep(`ep-${String(n).padStart(2, "0")}`, {
        cama: `UCI-${String(n).padStart(2, "0")}`, edad: x.edad, sexo: x.sexo, tallaCm: x.talla, diagnostico: x.dx,
        viaAereaActual: x.via, calibreVia: natural ? null : "8.0", fijacionCm: natural ? null : x.via === "TQT" ? "Collarín" : "22", diasVM: natural ? 0 : x.dias,
        rutTitular: n <= 12 ? RUT_KAREN : RUT_EDUARDO
      });
    })
  ];

  const c = (episodioId: string, numero: number, minutosAtras: number, over: Partial<Control>, autor?: string): Control =>
    control({ episodioId, numero, ahora, minutosAtras, over, ...(autor ? { autor } : {}) });

  const controles: Control[] = [
    c("ep-01", 1, 300, { fc: 96, pas: 112, pad: 62, spo2: 95, infusiones: { ...FENT(2, 1.2), noradrenalina: { dosis: 0.08, escalon: null } }, sas: 3,
      terapiaFisica: { estado: "REALIZADA", actividades: ["Giros en cama / posicionamiento"], ims: 1, motivoContraindicacion: null } }),
    c("ep-01", 2, 210, { fc: 92, pas: 116, pad: 66, spo2: 95, ventilacion: vent({ asincronico: true, frTotal: 22, vtEspirado: 420, pPico: 27, pPlateau: 28 }),
      infusiones: { ...FENT(2, 1.2), noradrenalina: { dosis: 0.08, escalon: null } }, sas: 3,
      terapiaFisica: { estado: "REALIZADA", actividades: ["Movilización pasiva / activo-asistida"], ims: 1, motivoContraindicacion: null } }),
    c("ep-01", 3, 120, { fc: 88, pas: 120, pad: 68, spo2: 96, ventilacion: vent({ peep: 8, fio2: 40, vtEspirado: 440, pPlateau: 19 }),
      infusiones: { ...FENT(1, 0.6), noradrenalina: { dosis: 0.05, escalon: null } }, sas: 4,
      terapiaFisica: { estado: "REALIZADA", actividades: ["Sedestación al borde de cama"], ims: 3, motivoContraindicacion: null } }),
    c("ep-01", 4, 25, { fc: 84, pas: 124, pad: 70, spo2: 97,
      ventilacion: vent({ modalidad: "CPAP_PS", frProgramada: null, vtProgramado: null, flujo: null, ti: null, presion: 7, peep: 5, fio2: 35, frTotal: 18, vtEspirado: 460, pPico: 14, pPlateau: null, pMedia: null }),
      infusiones: { ...FENT(1, 0.6), noradrenalina: { dosis: 0.03, escalon: null } }, sas: 4, glasgow: { ocular: 4, verbal: 1, motora: 6 },
      terapiaFisica: { estado: "REALIZADA", actividades: ["Sedestación al borde de cama", "Bipedestación asistida"], ims: 3, motivoContraindicacion: null } }),

    c("ep-02", 1, 60, { fc: 74, pas: 138, pad: 76, spo2: 98,
      ventilacion: vent({ vtProgramado: 350, vtEspirado: 350, peep: 6, fio2: 35, frTotal: 18, pPico: 21, pPlateau: 16, pMedia: 10 }),
      neuro: { etco2: 34, pic: 19, dveAlturaCmH2O: 12, dveAbierta: true },
      infusiones: { fentanilo: { dosis: 2.4, escalon: 4 }, propofol: { dosis: 2.5, escalon: 5 }, noradrenalina: { dosis: 0.08, escalon: null } }, sas: 1, glasgow: { ocular: 1, verbal: 1, motora: 3 },
      terapiaFisica: { estado: "CONTRAINDICADA", actividades: [], ims: null, motivoContraindicacion: "PIC fuera de meta" } }),

    c("ep-03", 1, 200, { fc: 82, pas: 128, pad: 72, spo2: 94, viaAerea: "TQT",
      ventilacion: vent({ modalidad: "CPAP_PS", frProgramada: null, vtProgramado: null, flujo: null, ti: null, presion: 6, peep: 5, fio2: 35, frTotal: 19, vtEspirado: 420, pPico: 12, pPlateau: null, pMedia: null }),
      sas: null, vigilia: "VIGIL_ALERTA", glasgow: { ocular: 4, verbal: 1, motora: 6 },
      terapiaFisica: { estado: "REALIZADA", actividades: ["Movilización pasiva / activo-asistida"], ims: 3, motivoContraindicacion: null } }),

    c("ep-04", 1, 110, { fc: 104, pas: 104, pad: 58, spo2: 92,
      ventilacion: vent({ vtProgramado: 380, vtEspirado: 380, peep: 12, fio2: 70, frProgramada: 24, frTotal: 28, pPico: 30, pPlateau: 27, pMedia: 18 }),
      infusiones: { ...FENT(4, 2.4), noradrenalina: { dosis: 0.35, escalon: null } }, sas: 2,
      terapiaFisica: { estado: "CONTRAINDICADA", actividades: [], ims: null, motivoContraindicacion: "Inestabilidad hemodinámica / DVA en ascenso" } }),

    // Posoperatorio despierto, ya en CPAP+PS: candidato a la PVE diaria.
    c("ep-06", 1, 30, { fc: 86, pas: 126, pad: 72, spo2: 97,
      ventilacion: vent({ modalidad: "CPAP_PS", frProgramada: null, vtProgramado: null, flujo: null, ti: null, presion: 8, peep: 5, fio2: 30, frTotal: 16, vtEspirado: 480, pPico: 14, pPlateau: null, pMedia: null }),
      sas: 4, glasgow: { ocular: 4, verbal: 1, motora: 6 } }),

    c("ep-07", 1, 240, { fc: 80, pas: 130, pad: 74, spo2: 95, viaAerea: "NATURAL",
      ventilacion: vent({ modalidad: "CNAF", frProgramada: null, vtProgramado: null, ti: null, peep: null, flujo: 40, fio2: 40, frTotal: 20, vtEspirado: null, pPico: null, pPlateau: null, pMedia: null }),
      sas: null, vigilia: "VIGIL_ALERTA", kineResp: { auscultacion: "MP conservado", aspecto: null, reologia: null, cantidad: null, tos: "EFICIENTE", flujoPicoTos: 120, deglucion: "PRESENTE" } }, RUT_KAREN)
  ];

  EXTRAS.forEach((x, i) => {
    const n = i + 9;
    const id = `ep-${String(n).padStart(2, "0")}`;
    const natural = x.via === "NATURAL";
    controles.push(
      c(id, 1, 40 + i * 17, {
        fc: 78 + i * 3, pas: 120 + i, pad: 68, spo2: 95, viaAerea: x.via,
        ventilacion: natural
          ? vent({ modalidad: "CNAF", frProgramada: null, vtProgramado: null, ti: null, peep: null, flujo: 40, fio2: 40, frTotal: 20, vtEspirado: null, pPico: null, pPlateau: null, pMedia: null })
          : vent({ vtProgramado: 420, vtEspirado: 420, frTotal: 19 }),
        sas: natural ? null : 4, vigilia: natural ? "VIGIL_ALERTA" : null
      }, n <= 12 ? RUT_KAREN : RUT_EDUARDO)
    );
  });

  const prono: EventoClinico = {
    id: "ep-04-ev1",
    episodioId: "ep-04",
    tipo: "INICIO_PRONO",
    hora: hora(new Date(ahora.getTime() - 18 * 60 * MIN)),
    registradoEn: new Date(ahora.getTime() - 18 * 60 * MIN).toISOString(),
    rutAutor: RUT_DIEGO,
    comentario: ""
  };

  const turnoPrevio = turnoAnterior(ahora).clave;
  const apkPrevia = (id: string, episodioId: string, via: "TET" | "TQT" | "NATURAL", rut: string) => ({
    ...firmarApkCumple({ id, episodioId, via, rutAutor: rut, siglas: "FG", ahora: new Date(ahora.getTime() - 6 * 60 * MIN) }),
    turno: turnoPrevio
  });

  // Identidades: solo existen en el PC de la estacion (tabla propia), nunca en el canal clinico.
  const nombres: readonly [string, string, number][] = [
    ["ep-01", "Paciente Prueba Uno", 12345678],
    ["ep-02", "Paciente Prueba Dos", 9876543],
    ["ep-03", "Paciente Prueba Tres", 15432109],
    ["ep-04", "Paciente Prueba Cuatro", 8765432],
    ["ep-05", "Paciente Prueba Cinco", 14000001],
    ["ep-06", "Paciente Prueba Seis", 17000002],
    ["ep-07", "Paciente Prueba Siete", 13000003],
    ["ep-08", "Paciente Prueba Ocho", 16000004],
    ...EXTRAS.map((_, i): [string, string, number] => [`ep-${String(i + 9).padStart(2, "0")}`, `Paciente Prueba ${i + 9}`, 18000000 + i * 1111])
  ];
  const identidades: IdentidadPaciente[] = nombres.map(([episodioId, nombre, cuerpo]) => ({ episodioId, nombre, rut: construirRut(cuerpo), ficha: null }));

  for (const e of episodios) await repo.guardarEpisodio(e);
  for (const k of controles) await repo.guardarControl(k);
  await repo.registrarEvento(prono);
  await repo.firmarApk(apkPrevia("ep-01-apk0", "ep-01", "TET", "11.111.112-2"));
  await repo.firmarApk(apkPrevia("ep-02-apk0", "ep-02", "TET", "11.111.112-2"));
  await repo.firmarApk(apkPrevia("ep-03-apk0", "ep-03", "TQT", "22.222.222-2"));
  await db.identidades.bulkPut(identidades);
  return true;
}
