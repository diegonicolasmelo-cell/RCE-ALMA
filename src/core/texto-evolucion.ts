/**
 * Texto de evolucion para ALMA, en la prosa corta del RCE (Diego, 16-nov-2026).
 *
 * Reglas traidas del motor del RCE (dominio_texto.gs):
 *  - Lo vacio no se escribe (nunca «--» ni «no consignado»); el negativo evaluado si («sin secreciones»).
 *  - Un evento se cuenta con lo que habia antes y lo que queda despues («queda con»), usando el
 *    control ligado al evento o el primero que lo sigue.
 *  - Siglas intactas, coma decimal, nunca «Otro» como motivo.
 *  - Sin encabezado y sin firma: estorban al copiar a ALMA (la autoria queda en el registro).
 *  - Un solo motor: cada bloque es una funcion que devuelve una frase o nada; el orden vive en
 *    `ultimoControl` y `resumenTurno`.
 *
 * La produccion (cuantos controles, KTM, niveles) NO va aqui: vive en Estadistica.
 */

import { CAMPOS_POR_MODALIDAD, ETIQUETA_EDUCACION, ETIQUETA_MODALIDAD, ETIQUETA_MOTIVO_CAMBIO, ETIQUETA_MOTIVO_SIN_PVE, GRUPO_MODALIDAD, NIVELES_KTM, OPCIONES_DEGLUCION, etiquetaAspecto, textoCategoriaRem } from "./catalogos";
import { resumenEvaluacion } from "./evaluaciones";
import { esReintubacion } from "./eventos";
import { calcularDerivados, calcularPbw, esViaAereaArtificial } from "./fisiologia";
import { infusionesActivas, sedoanalgesiaActiva } from "./infusiones";
import { horasDeVm } from "./pve";
import { turnoDe } from "./turnos";
import { esModalidadControlada, mecanicaBloqueadaPorAsincronia } from "./validez";
import type { Control, Episodio, EventoClinico } from "./tipos";

export interface EntradaTexto {
  readonly episodio: Episodio;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
  readonly ahora: Date;
  /** Diagnostico escrito (descifrado en la estacion). Sin el, la categoria REM. */
  readonly diagnostico?: string | null;
}

// ---------------------------------------------------------------------------
// Redaccion
// ---------------------------------------------------------------------------

/** Coma decimal y a lo mas `dec` decimales. */
export function coma(n: number, dec = 1): string {
  const f = 10 ** dec;
  return String(Math.round(n * f) / f).replace(".", ",");
}

/** Minuscula solo en la inicial, salvo que la primera palabra sea una sigla («VNI», «PIC»). */
export function minusculaInicial(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const primera = t.split(/[\s/-]/)[0] ?? "";
  if (primera.length > 1 && primera === primera.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(primera)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

const mayusculaInicial = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Una oracion: con mayuscula inicial y un solo punto final. */
export function oracion(s: string): string {
  const t = s.trim().replace(/[\s.]+$/, "");
  return t ? `${mayusculaInicial(t)}.` : "";
}

/** «a, b y c». */
function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const ordenar = <T extends { registradoEn: string }>(xs: readonly T[]): T[] => [...xs].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));

/** Los motivos «Otro» no dicen nada fuera de la unidad: se omiten. */
const motivo = (m: string | null | undefined): string => {
  const t = (m ?? "").trim();
  return !t || /^otr[oa]s?(\s+motivo)?$/i.test(t) ? "" : minusculaInicial(t);
};

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

/** Dia de estadia: el dia del ingreso es el dia 1 (Diego, 16-nov-2026). */
export function diaDeEstadia(ingresoIso: string | undefined, ref: Date): number | null {
  if (!ingresoIso) return null;
  const i = new Date(ingresoIso);
  const a = Date.UTC(i.getFullYear(), i.getMonth(), i.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function bloqueEstadia(ep: Episodio, ref: Date, dxEscrito: string | null | undefined, primerControl: string | undefined): string {
  const dia = diaDeEstadia(ep.ingresadoEn ?? primerControl, ref);
  const dx = dxEscrito?.trim() || (ep.categoriaRem ? textoCategoriaRem(ep.categoriaRem) : "");
  const partes = [dia !== null ? `Paciente en día ${dia} de estadía en UCI` : "", dx ? `Dx: ${minusculaInicial(dx)}` : ""].filter(Boolean);
  return partes.map(oracion).join(" ");
}

const bloqueFase = (ep: Episodio): string => oracion(ep.faseClinica ?? "");

const VIGILIA: Readonly<Record<string, string>> = { VIGIL_ALERTA: "vigil", SOMNOLIENTO: "somnoliento", ESTUPOROSO: "estuporoso", COMA: "en coma" };

/** «sedoanalgesia con fentanilo 1,2 mcg/kg/h y propofol 2 mg/kg/h, SAS 3» o «sin sedoanalgesia, vigil». */
function textoSedacion(c: Control): string {
  if (sedoanalgesiaActiva(c.infusiones)) {
    const sed = infusionesActivas(c.infusiones, "SEDANTE").map((a) => `${a.nombre.toLowerCase()} ${coma(a.dosis, 3)} ${a.unidad}`);
    const bnm = infusionesActivas(c.infusiones, "BNM").map((a) => `${a.nombre.toLowerCase()} ${coma(a.dosis, 3)} ${a.unidad}`);
    return [`sedoanalgesia con ${enumerar(sed)}`, c.sas !== null ? `SAS ${c.sas}` : "", bnm.length ? `bajo BNM con ${enumerar(bnm)}` : ""].filter(Boolean).join(", ");
  }
  const v = c.vigilia ? VIGILIA[c.vigilia] : "";
  return ["sin sedoanalgesia", v ?? ""].filter(Boolean).join(", ");
}

/** «GCS 11T (O:4, V:1T, M:6)» con via artificial; «GCS 15/15 (O:4, V:5, M:6)» sin ella. */
function textoGcs(c: Control, pbw: number): string {
  const g = calcularDerivados(c, pbw).glasgow;
  const s5q = c.s5q !== null ? `S5Q ${c.s5q}/5` : "";
  if (!g) return s5q;
  const gcs = g.intubado
    ? `GCS ${g.total}T (O:${g.ocular}, V:1T, M:${g.motora})`
    : `GCS ${g.total}/15 (O:${g.ocular}, V:${g.verbal}, M:${g.motora})`;
  const bajoSed = calcularDerivados(c, pbw).glasgowBajoSedacion ? " bajo sedación" : "";
  return [gcs + bajoSed, s5q].filter(Boolean).join(", ");
}

const dvaDe = (c: Control) => [...infusionesActivas(c.infusiones, "DVA"), ...infusionesActivas(c.infusiones, "INOTROPO")];

function textoHemodinamia(c: Control, pbw: number): string {
  const d = calcularDerivados(c, pbw);
  const dva = dvaDe(c).map((a) => `${a.nombre.toLowerCase()} ${coma(a.dosis, 3)} ${a.unidad}`);
  const hdn = dva.length ? `HDN c/DVA: ${enumerar(dva)}` : "HDN s/DVA";
  const signos = [
    c.fc !== null ? `FC ${c.fc} lpm` : "",
    c.pas !== null && c.pad !== null ? `PA ${c.pas}/${c.pad} mmHg${d.pam !== null ? ` (PAM ${d.pam} mmHg)` : ""}` : ""
  ].filter(Boolean);
  return [oracion(hdn), signos.length ? oracion(signos.join(", ")) : ""].filter(Boolean).join(" ");
}

function textoNeuro(c: Control, pbw: number): string {
  const n = c.neuro;
  if (!n) return "";
  const d = calcularDerivados(c, pbw);
  const p: string[] = [];
  if (n.pic !== null) p.push(`PIC ${n.pic} mmHg${d.ppc !== null ? ` (PPC ${d.ppc} mmHg)` : ""}`);
  if (n.etco2 !== null) p.push(`EtCO₂ ${n.etco2} mmHg`);
  if (n.dveAlturaCmH2O !== null) p.push(`derivación ventricular externa (DVE) a ${n.dveAlturaCmH2O} cmH₂O${n.dveAbierta === null ? "" : n.dveAbierta ? ", abierta" : ", cerrada"}`);
  return p.length ? oracion(`Neuromonitoreo: ${p.join(", ")}`) : "";
}

/** Calibre y fijacion vigentes en un momento: del ultimo evento que los fijo, o del episodio. */
function viaEn(ep: Episodio, eventos: readonly EventoClinico[], c: Control): { calibre: string | null; cm: string | null } {
  let calibre: string | null = null;
  let cm: string | null = null;
  for (const e of ordenar(eventos)) {
    if (e.registradoEn > c.registradoEn) break;
    if (e.tipo === "REINTUBACION") { calibre = e.calibre; cm = e.fijacionCm || null; }
    if (e.tipo === "CAMBIO_TUBO") { calibre = e.calibre; cm = e.fijacionCm; }
    if (e.tipo === "CAMBIO_CANULA" || e.tipo === "TRAQUEOSTOMIA") { calibre = e.calibre; cm = null; }
    if (e.tipo === "AJUSTE_TUBO") cm = e.fijacionCm;
  }
  if (ep.viaAereaActual === c.viaAerea) {
    calibre = ep.calibreVia ?? calibre;
    cm = ep.fijacionCm ?? cm;
  }
  return { calibre, cm };
}

function textoVia(ep: Episodio, eventos: readonly EventoClinico[], c: Control): string {
  if (!esViaAereaArtificial(c.viaAerea)) return "";
  const { calibre, cm } = viaEn(ep, eventos, c);
  const n = calibre ? ` N° ${calibre.replace(".", ",")}` : "";
  if (c.viaAerea === "TET") return `VAA mediante TOT${n}${cm && /\d/.test(cm) ? ` a ${cm} cm de arcada dental` : ""}`;
  return `VAA mediante TQT${n}`;
}

/** Los parametros anotados de un modo, con sus etiquetas («flujo 35 L/min, FiO₂ 35%»). */
function parametrosGenericos(c: Control): string[] {
  const v = c.ventilacion;
  return CAMPOS_POR_MODALIDAD[v.modalidad].flatMap((def) => {
    const x = v[def.campo];
    if (typeof x !== "number") return [];
    const et = def.etiqueta === "Temperatura" ? "T°" : def.etiqueta.replace(/^Flujo O₂$/, "flujo O₂").replace(/^Flujo$/, "flujo");
    return [`${et} ${coma(x)}${def.unidad === "%" ? "%" : ` ${def.unidad}`}`];
  });
}

/** Parametros de la VMI con sus resultantes, en el orden del RCE. */
function parametrosVmi(c: Control, pbw: number): string[] {
  const v = c.ventilacion;
  const d = calcularDerivados(c, pbw);
  const controlada = esModalidadControlada(v.modalidad);
  const p: string[] = [];
  const n = (x: number | null, txt: (y: number) => string): void => { if (x !== null) p.push(txt(x)); };
  if (v.modalidad === "CPAP_PS") n(v.presion, (y) => `PS ${coma(y)} cmH₂O`);
  if (v.modalidad === "PCV") n(v.presion, (y) => `P control ${coma(y)} cmH₂O`);
  if (v.modalidad === "ACVC") n(v.vtProgramado, (y) => `Vt programado ${y} ml${d.vtProgramadoPorKg !== null ? ` (${coma(d.vtProgramadoPorKg)} ml/kg PI)` : ""}`);
  n(v.peep, (y) => `PEEP ${coma(y)} cmH₂O`);
  n(v.fio2, (y) => `FiO₂ ${coma(y)}%`);
  n(v.vtEspirado, (y) => `Vt espirado ${y} ml${d.vtEspiradoPorKg !== null ? ` (${coma(d.vtEspiradoPorKg)} ml/kg PI)` : ""}`);
  if (controlada && v.frProgramada !== null) p.push(`FR ${v.frProgramada}${v.frTotal !== null ? `/${v.frTotal}` : ""} rpm`);
  else n(v.frTotal, (y) => `FR ${y} rpm`);
  if (d.volumenMinuto !== null) p.push(`VM ${coma(d.volumenMinuto)} L/min`);
  if (controlada && v.ti !== null) p.push(`Ti ${coma(v.ti, 2)} s`);
  if (controlada && d.relacionIE) p.push(`I:E ${d.relacionIE}`);
  n(v.pPico, (y) => `P pico ${coma(y)} cmH₂O`);
  if (d.drivingPressure !== null) {
    if (d.origenDriving !== "PICO") n(v.pPlateau, (y) => `P plateau ${coma(y)} cmH₂O`);
    p.push(`DP ${coma(d.drivingPressure)} cmH₂O${d.origenDriving === "PICO" ? " (con P pico)" : ""}`);
  }
  if (d.compliance !== null) p.push(`Cest ${coma(d.compliance)} ml/cmH₂O`);
  if (controlada && v.autoPeep !== null) p.push(`autoPEEP ${coma(v.autoPeep)} cmH₂O`);
  if (d.drivingPressure === null && d.compliance === null && mecanicaBloqueadaPorAsincronia(v)) p.push("mecánica estática no valorable por asincronía");
  if (d.tobin !== null) p.push(`índice de Tobin ${Math.round(d.tobin)}`);
  return p;
}

const spo2De = (c: Control): string[] => (c.spo2 !== null ? [`SpO₂ ${c.spo2}%`] : []);

function diasVm(ep: Episodio, eventos: readonly EventoClinico[], controles: readonly Control[], c: Control): string {
  const h = horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, new Date(c.registradoEn));
  if (!h) return "";
  const dias = Math.floor(h.horas / 24);
  return dias < 1 ? "primeras 24 h de VM" : `${dias} ${dias === 1 ? "día" : "días"} de VM`;
}

/** La frase del soporte de un control: VAA + modo + parametros. */
function textoSoporte(ep: Episodio, eventos: readonly EventoClinico[], controles: readonly Control[], c: Control, pbw: number): string {
  const v = c.ventilacion;
  const grupo = GRUPO_MODALIDAD[v.modalidad];
  const via = textoVia(ep, eventos, c);
  const d = calcularDerivados(c, pbw);
  if (grupo === "VENTILACION_MECANICA") {
    const dvm = diasVm(ep, eventos, controles, c);
    const params = [...parametrosVmi(c, pbw), ...spo2De(c)];
    return oracion(`${via ? `${via}, en` : "En"} VMI modo ${ETIQUETA_MODALIDAD[v.modalidad]}${dvm ? ` (${dvm})` : ""}${params.length ? `: ${params.join(", ")}` : ""}`);
  }
  const params = [...parametrosGenericos(c), ...spo2De(c)];
  if (d.rox !== null) params.push(`índice ROX ${coma(d.rox)}`);
  if (v.musculaturaAccesoria !== null) params.push(v.musculaturaAccesoria ? "con uso de musculatura accesoria" : "sin uso de musculatura accesoria");
  const lista = params.length ? `: ${params.join(", ")}` : "";
  if (grupo === "VNI") return oracion(`${via ? `${via}, en` : "En"} VNI modo ${ETIQUETA_MODALIDAD[v.modalidad].replace(/^VNI · /, "")}${lista}`);
  if (v.modalidad === "CNAF") return `Ventila espontáneo con apoyo de CNAF.${params.length ? ` ${oracion(`Parámetros${lista}`)}` : ""}`;
  return oracion(`${via ? `${via}, ventila` : "Ventila"} espontáneo con ${minusculaInicial(ETIQUETA_MODALIDAD[v.modalidad])}${lista}`);
}

/** «CNAF 40 L/min, T° 37 °C, FiO₂ 40%, FR 22 rpm, SpO₂ 95%» o «VMI modo ACVC (Vt …)»: para el «queda con». */
function soporteCorto(c: Control, pbw: number): string {
  const v = c.ventilacion;
  const grupo = GRUPO_MODALIDAD[v.modalidad];
  if (grupo === "VENTILACION_MECANICA") {
    const params = [...parametrosVmi(c, pbw).slice(0, 5), ...spo2De(c)];
    return `VMI modo ${ETIQUETA_MODALIDAD[v.modalidad]}${params.length ? ` (${params.join(", ")})` : ""}`;
  }
  const params = [...parametrosGenericos(c), ...spo2De(c)];
  const nombre = v.modalidad === "CNAF" ? "CNAF" : minusculaInicial(ETIQUETA_MODALIDAD[v.modalidad]);
  // En la CNAF el flujo va pegado al nombre («CNAF 40 L/min»), como lo dice el equipo.
  if (v.modalidad === "CNAF" && v.flujo !== null) return [`CNAF ${coma(v.flujo)} L/min`, ...params.slice(1)].join(", ");
  return [nombre, ...params].join(", ");
}

function textoAuscultacion(c: Control): string {
  const a = c.kineResp.auscultacion.trim();
  return a ? `Auscultación: ${a.replace(/[\s.]+$/, "")}` : "";
}

function textoSecreciones(c: Control): string {
  const k = c.kineResp;
  if (!k.aspecto) return "";
  if (k.aspecto === "NINGUNA") return "sin secreciones";
  const cant = k.cantidad ? ` en ${k.cantidad.toLowerCase()} cantidad` : "";
  // «secreciones mucosas fluidas»: la reologia concuerda en plural con «secreciones».
  const plural = (x: string): string => (/[aeiouáéíóú]$/.test(x) ? `${x}s` : x);
  const reo = k.reologia ? plural(k.reologia.toLowerCase()) : "";
  return `secreciones ${[etiquetaAspecto(k.aspecto).toLowerCase(), reo].filter(Boolean).join(" ")}${cant}`;
}

function textoTos(c: Control): string {
  const k = c.kineResp;
  const p: string[] = [];
  if (k.tos) p.push(`tos ${k.tos === "EFICIENTE" ? "eficiente" : "deficiente"}`);
  if (k.flujoPicoTos !== null) p.push(`flujo pico de tos ${k.flujoPicoTos} L/min`);
  if (k.deglucion) p.push(`deglución ${OPCIONES_DEGLUCION.find((d) => d.val === k.deglucion)?.label.toLowerCase() ?? ""}`.trim());
  return p.join(", ");
}

function lineaSecreciones(c: Control): string {
  const s = textoSecreciones(c);
  const t = textoTos(c);
  if (!s && !t) return "";
  return oracion([s, t].filter(Boolean).join("; "));
}

/** Nivel de la KTM en palabras: «sedente al borde de cama». */
const nivelEnPalabras = (n: number): string =>
  minusculaInicial((NIVELES_KTM.find((x) => x.nivel === n)?.titulo ?? "").replace(/^Nivel \d · /, "").replace(/\s*\([^)]*\)\s*$/, ""));

/** KTM, IMT, educacion y evaluaciones registradas en el periodo (eventos y controles antiguos). */
function bloqueKine(controles: readonly Control[], eventos: readonly EventoClinico[]): string[] {
  const out: string[] = [];
  const ktm = eventos.filter((e): e is Extract<EventoClinico, { tipo: "TERAPIA_FISICA" }> => e.tipo === "TERAPIA_FISICA");
  const hechas = ktm.filter((e) => e.realizada);
  const antiguas = controles.filter((c) => c.terapiaFisica.estado === "REALIZADA");
  if (hechas.length) {
    const nivel = Math.max(...hechas.map((e) => e.nivel ?? 0));
    const ems = hechas.some((e) => e.ems);
    const ims = hechas.map((e) => e.ims).filter((x): x is number => x !== null).at(-1);
    const nv = nivel > 0 ? ` nivel ${nivel} (${nivelEnPalabras(nivel)})` : "";
    out.push(oracion(`${hechas.length > 1 ? `Se realizan ${hechas.length} sesiones de KTM, hasta` : "Se realiza KTM"}${nv}${ems ? ", con EMS" : ""}${ims !== undefined ? `, IMS ${ims}` : ""}`));
  } else if (antiguas.length) {
    const acts = [...new Set(antiguas.flatMap((c) => c.terapiaFisica.actividades))].map(minusculaInicial);
    out.push(oracion(`Se realiza terapia física${acts.length ? `: ${enumerar(acts)}` : ""}`));
  } else {
    const no = ktm.filter((e) => !e.realizada).at(-1);
    const contra = controles.filter((c) => c.terapiaFisica.estado === "CONTRAINDICADA").at(-1);
    if (no) out.push(oracion(`KTM no realizada${motivo(no.motivo) ? ` por ${motivo(no.motivo)}` : ""}`));
    else if (contra) out.push(oracion(`KTM contraindicada${motivo(contra.terapiaFisica.motivoContraindicacion) ? ` por ${motivo(contra.terapiaFisica.motivoContraindicacion)}` : ""}`));
  }
  if (eventos.some((e) => e.tipo === "IMT")) out.push("Se realiza IMT.");
  const edu = eventos.filter((e): e is Extract<EventoClinico, { tipo: "EDUCACION" }> => e.tipo === "EDUCACION");
  if (edu.length) out.push(oracion(`Se realiza educación ${enumerar([...new Set(edu.map((e) => ETIQUETA_EDUCACION[e.dirigidaA]))])}`));
  const evals = eventos.filter((e): e is Extract<EventoClinico, { tipo: "EVALUACION_PUNTUAL" }> => e.tipo === "EVALUACION_PUNTUAL");
  if (evals.length) out.push(oracion(`Evaluaciones: ${evals.map((e) => resumenEvaluacion(e.escala, e.valores, e.total, e.comentario)).join("; ")}`));
  return out;
}

// ---------------------------------------------------------------------------
// Eventos del turno: antes → evento → queda con
// ---------------------------------------------------------------------------

const hrs = (e: EventoClinico): string => {
  const real = "realizadaEn" in e && typeof e.realizadaEn === "string" ? e.realizadaEn : null;
  if (!real) return `a las ${e.hora} hrs`;
  const d = new Date(real);
  return `a las ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} hrs`;
};

/** El control que muestra como quedo el paciente tras el evento: el ligado a el, o el primero despues. */
function controlTras(ev: EventoClinico, controles: readonly Control[]): Control | null {
  return controles.find((c) => c.eventoId === ev.id) ?? ordenar(controles).find((c) => c.registradoEn > ev.registradoEn) ?? null;
}

/** Eventos que cambian el soporte: se cierran con «Queda con…». */
const CAMBIAN_SOPORTE = new Set<EventoClinico["tipo"]>(["EXTUBACION_PROGRAMADA", "AUTOEXTUBACION", "REINTUBACION", "TRAQUEOSTOMIA", "DECANULACION", "DESVINCULACION", "RECONEXION"]);

/** Los eventos que no se narran: pasos internos de un flujo, filtros y cambios administrativos. */
const SIN_NARRAR = new Set<EventoClinico["tipo"]>(["CONTROL_PVE", "EVALUACION_PVE", "REEVAL_POST_EXTUB", "CAMBIO_HMEF", "CAMBIO_FILTRO", "CAMBIO_EQUIPOS", "TERAPIA_FISICA", "IMT", "EDUCACION", "EVALUACION_PUNTUAL"]);

/** Narra los eventos del periodo, en orden, juntando la PVE con su extubacion. */
export function narrarEventos(eventosPeriodo: readonly EventoClinico[], todosEventos: readonly EventoClinico[], controles: readonly Control[], pbw: number): string[] {
  const out: string[] = [];
  const evs = ordenar(eventosPeriodo).filter((e) => !SIN_NARRAR.has(e.tipo));
  const usados = new Set<string>();
  const queda = (ev: EventoClinico): void => {
    if (!CAMBIAN_SOPORTE.has(ev.tipo)) return;
    const c = controlTras(ev, controles);
    if (!c) return;
    // Si otro evento de cambio de soporte ocurrio antes de ese control, el «queda con» es de ese otro.
    const siguiente = evs.find((x) => x.registradoEn > ev.registradoEn && CAMBIAN_SOPORTE.has(x.tipo) && !usados.has(x.id));
    if (siguiente && siguiente.registradoEn <= c.registradoEn) return;
    const gcs = textoGcs(c, pbw);
    out.push(oracion(`Queda con ${soporteCorto(c, pbw)}${gcs ? `, ${gcs}` : ""}`));
  };
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i]!;
    if (usados.has(e.id)) continue;
    usados.add(e.id);
    switch (e.tipo) {
      case "INICIO_PVE": {
        const fin = evs.slice(i + 1).find((x) => x.tipo === "FIN_PVE" || x.tipo === "INICIO_PVE");
        if (fin?.tipo !== "FIN_PVE") { out.push(oracion(`Se inicia PVE según protocolo (${e.duracionMin} min) ${hrs(e)}`)); break; }
        usados.add(fin.id);
        const base = `Se realiza PVE según protocolo (${e.duracionMin} min) ${hrs(e)}`;
        if (!fin.exitosa) { out.push(oracion(`${base} con resultado fallido`), "Continúa con soporte ventilatorio."); break; }
        const sig = evs.slice(i + 1).find((x) => !usados.has(x.id) && (x.tipo === "EXTUBACION_PROGRAMADA" || x.tipo === "PVE_SIN_EXTUBAR"));
        if (sig?.tipo === "EXTUBACION_PROGRAMADA" && !sig.sinPve) {
          usados.add(sig.id);
          out.push(oracion(`${base} con resultado superado, progresando a extubación programada ${hrs(sig)}`));
          queda(sig);
        } else if (sig?.tipo === "PVE_SIN_EXTUBAR") {
          usados.add(sig.id);
          out.push(oracion(`${base} con resultado superado`), oracion(`No se extuba${motivo(sig.motivo) ? ` por ${motivo(sig.motivo)}` : ""}; mantiene ventilación mecánica`));
        } else out.push(oracion(`${base} con resultado superado`));
        break;
      }
      case "FIN_PVE":
        out.push(oracion(`PVE ${e.exitosa ? "superada" : "fallida"} ${hrs(e)}`));
        break;
      case "PVE_SIN_EXTUBAR":
        out.push(oracion(`PVE superada; no se extuba${motivo(e.motivo) ? ` por ${motivo(e.motivo)}` : ""}; mantiene ventilación mecánica`));
        break;
      case "PVE_NO_REALIZADA":
        out.push(oracion(`No se realiza PVE en este turno${motivo(e.razon) ? ` por ${motivo(e.razon)}` : ""}${e.comentario ? ` (${e.comentario})` : ""}`));
        break;
      case "EXTUBACION_PROGRAMADA":
        out.push(oracion(e.sinPve ? `Se realiza extubación fuera de protocolo ${hrs(e)}, sin PVE por ${ETIQUETA_MOTIVO_SIN_PVE[e.sinPve]}` : `Se realiza extubación programada ${hrs(e)}`));
        queda(e);
        break;
      case "AUTOEXTUBACION": {
        out.push(oracion(`${e.accidental ? "Extubación accidental" : "Paciente se autoextuba"} ${hrs(e)}${e.comentario ? `. ${e.comentario}` : ""}`));
        if (e.dispositivo !== "REINTUBACION_INMEDIATA") queda(e);
        break;
      }
      case "FALLA_POST_EXTUB": {
        if (!e.falla) break;
        const reint = evs.slice(i + 1).find((x) => x.tipo === "REINTUBACION" && !usados.has(x.id));
        if (reint?.tipo === "REINTUBACION") {
          usados.add(reint.id);
          out.push(oracion(`Sin embargo, evoluciona con ${minusculaInicial(e.hipotesis || "falla respiratoria")}, por lo que se reintuba ${hrs(reint)} con ${reint.via === "TET" ? "TOT" : "TQT"} N° ${reint.calibre.replace(".", ",")}${reint.via === "TET" && reint.fijacionCm ? ` a ${reint.fijacionCm} cm de arcada dental` : ""}`));
          queda(reint);
        } else out.push(oracion(`Evoluciona con falla post extubación${e.hipotesis ? `: ${minusculaInicial(e.hipotesis)}` : ""}`));
        break;
      }
      case "REINTUBACION": {
        const que = esReintubacion(e, todosEventos) ? "reintubación" : "intubación orotraqueal";
        out.push(oracion(`Paciente requiere ${que} ${hrs(e)} con ${e.via === "TET" ? "TOT" : "TQT"} N° ${e.calibre.replace(".", ",")}${e.via === "TET" && e.fijacionCm ? ` a ${e.fijacionCm} cm de arcada dental` : ""}${e.motivo ? `, por ${e.motivo.charAt(0).toLowerCase()}${e.motivo.slice(1)}` : ""}`));
        queda(e);
        break;
      }
      case "TRAQUEOSTOMIA":
        out.push(oracion(`Se realiza traqueostomía ${hrs(e)}, con cánula N° ${e.calibre.replace(".", ",")}`));
        queda(e);
        break;
      case "DECANULACION":
        out.push(oracion(`Se realiza decanulación${e.accidental ? " accidental" : ""} ${hrs(e)}`));
        queda(e);
        break;
      case "CAMBIO_TUBO":
        out.push(oracion(`Se realiza cambio de TOT por ${ETIQUETA_MOTIVO_CAMBIO[e.motivo]}, N° ${e.calibre.replace(".", ",")} a ${e.fijacionCm} cm de arcada dental`));
        break;
      case "CAMBIO_CANULA":
        out.push(oracion(`Se realiza cambio de cánula de TQT por ${ETIQUETA_MOTIVO_CAMBIO[e.motivo]}, N° ${e.calibre.replace(".", ",")}`));
        break;
      case "AJUSTE_TUBO":
        out.push(oracion(`Se ajusta la fijación del TOT a ${e.fijacionCm} cm de arcada dental (${e.motivo === "DESPLAZAMIENTO_SUPERFICIAL" ? "desplazamiento superficial" : "control radiológico"})`));
        break;
      case "DESVINCULACION":
        out.push(oracion(`Se desvincula de ventilación mecánica ${hrs(e)}`));
        queda(e);
        break;
      case "RECONEXION": {
        const desde = [...todosEventos].reverse().find((x) => x.tipo === "DESVINCULACION" && x.registradoEn < e.registradoEn);
        const h = desde && "realizadaEn" in desde ? (Date.parse(e.realizadaEn) - Date.parse(desde.realizadaEn)) / 3_600_000 : null;
        out.push(oracion(`Se reconecta a VM ${hrs(e)}${h !== null && h > 0 ? `, completando ${coma(h)} h de desvinculación` : ""}`));
        queda(e);
        break;
      }
      case "INICIO_PRONO":
        out.push(oracion(`Se prona ${hrs(e)}`));
        break;
      case "SUPINACION": {
        const ini = [...todosEventos].reverse().find((x) => x.tipo === "INICIO_PRONO" && x.registradoEn < e.registradoEn);
        const h = ini ? (Date.parse(e.registradoEn) - Date.parse(ini.registradoEn)) / 3_600_000 : null;
        out.push(oracion(`Se supina ${hrs(e)}${h !== null && h > 0 ? `, tras ${coma(h)} h en prono` : ""}`));
        break;
      }
      case "INICIO_BNM":
        out.push(oracion(`Se inicia bloqueo neuromuscular con ${e.farmaco.toLowerCase()} ${hrs(e)}`));
        break;
      case "FIN_BNM":
        out.push(oracion(`Se suspende el bloqueo neuromuscular ${hrs(e)}`));
        break;
      case "SUSPENSION_SEDACION":
        out.push(oracion(`Se suspende la sedación${e.farmacos.length ? ` (${enumerar(e.farmacos.map((f) => f.toLowerCase()))})` : ""} ${hrs(e)}`));
        break;
      case "SUSPENSION_DVA":
        // No se narra aquí: la línea de hemodinamia ya dice qué DVA se suspendió en el turno.
        break;
      case "PCR":
        out.push(oracion(`Paro cardiorrespiratorio ${hrs(e)}: reanimación de ${e.duracionReanimacionMin} min${e.rosc === true ? ", con ROSC" : e.rosc === false ? ", sin ROSC" : ""}${e.choques ? `, ${e.choques} ${e.choques === 1 ? "choque" : "choques"}` : ""}`));
        break;
      case "EVENTO_CENTINELA":
        out.push(oracion(`Evento adverso ${hrs(e)}: ${e.descripcion}`));
        break;
      case "EVENTO_LIBRE":
        out.push(oracion(`${e.descripcion} ${hrs(e)}`));
        break;
      case "ASISTENCIA_FBC":
        out.push(oracion(`Se asiste fibrobroncoscopía ${hrs(e)}`));
        break;
      case "ASISTENCIA_PROCEDIMIENTO":
        out.push(oracion(`Se asiste ${minusculaInicial(e.procedimiento)} ${hrs(e)}`));
        break;
      case "TOMA_CULTIVO":
        out.push(oracion(`Se toma muestra de ${minusculaInicial(e.muestra)} para cultivo`));
        break;
      case "TRASLADO_IMAGEN":
        out.push(oracion(`Traslado a ${minusculaInicial(e.destino)} ${hrs(e)}`));
        break;
      case "TRASLADO_CAMA":
        out.push(oracion(`Se traslada a la cama ${e.hasta.replace(/^UCI-0?/, "")}`));
        break;
      default:
        break;
    }
    if (e.comentario && !["AUTOEXTUBACION", "PVE_NO_REALIZADA"].includes(e.tipo)) out.push(oracion(e.comentario));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Los dos modos
// ---------------------------------------------------------------------------

const enTurno = (iso: string, clave: string): boolean => turnoDe(new Date(iso)).clave === clave;

/** Ultimo control: como esta el paciente en ese control, mas la kinesiterapia de su turno. */
export function textoUltimoControl(e: EntradaTexto): string {
  const cs = ordenar(e.controles);
  const u = cs.at(-1);
  if (!u) return "Sin controles registrados.";
  const pbw = calcularPbw(e.episodio.tallaCm, e.episodio.sexo);
  const turno = turnoDe(new Date(u.registradoEn)).clave;
  const evsTurno = e.eventos.filter((x) => enTurno(x.registradoEn, turno));
  const ligado = u.eventoId ? e.eventos.find((x) => x.id === u.eventoId) : undefined;
  const sedGcs = [textoSedacion(u), textoGcs(u, pbw)].filter(Boolean);
  return [
    bloqueEstadia(e.episodio, new Date(u.registradoEn), e.diagnostico, cs[0]?.registradoEn),
    bloqueFase(e.episodio),
    sedGcs.length ? `${oracion(sedGcs[0]!)}${sedGcs[1] ? ` ${oracion(sedGcs[1])}` : ""}` : "",
    textoHemodinamia(u, pbw),
    textoNeuro(u, pbw),
    ...(ligado ? narrarEventos([ligado], e.eventos, [], pbw) : []),
    textoSoporte(e.episodio, e.eventos, cs, u, pbw),
    oracion(textoAuscultacion(u)),
    lineaSecreciones(u),
    ...bloqueKine([u], evsTurno),
    oracion(u.observaciones ? `Nota: ${u.observaciones}` : "")
  ].filter(Boolean).join("\n");
}

/** Resumen del turno del ultimo control: como llega, que paso (en orden) y como cierra. */
export function textoResumenTurno(e: EntradaTexto): string {
  const todos = ordenar(e.controles);
  const ultimo = todos.at(-1);
  if (!ultimo) return "Sin controles registrados.";
  const pbw = calcularPbw(e.episodio.tallaCm, e.episodio.sexo);
  const turno = turnoDe(new Date(ultimo.registradoEn)).clave;
  const cs = todos.filter((c) => enTurno(c.registradoEn, turno));
  const evs = ordenar(e.eventos.filter((x) => enTurno(x.registradoEn, turno)));
  const primero = cs[0]!;
  const lineas: string[] = [];

  lineas.push(bloqueEstadia(e.episodio, new Date(ultimo.registradoEn), e.diagnostico, todos[0]?.registradoEn), bloqueFase(e.episodio));

  // Conciencia: como llega; al cierre solo lo que cambio.
  const sed0 = textoSedacion(primero), sed1 = textoSedacion(ultimo);
  const gcs0 = textoGcs(primero, pbw), gcs1 = textoGcs(ultimo, pbw);
  const inicio = [sed0, gcs0].filter(Boolean).join(", ");
  const cierre = [sed1 !== sed0 ? sed1 : "", gcs1 !== gcs0 ? gcs1 : ""].filter(Boolean).join(", ");
  if (inicio) lineas.push(oracion(`Inicia el turno ${inicio}${cierre && cs.length > 1 ? `; al cierre, ${cierre}` : ""}`));

  // Hemodinamia al cierre, con lo que se inicio o suspendio durante el turno.
  const antes = new Set(cs.slice(0, -1).flatMap((c) => dvaDe(c).map((a) => a.nombre.toLowerCase())));
  const ahoraDva = new Set(dvaDe(ultimo).map((a) => a.nombre.toLowerCase()));
  const suspendidas = [...antes].filter((x) => !ahoraDva.has(x));
  const hdn = textoHemodinamia(ultimo, pbw);
  lineas.push(suspendidas.length ? hdn.replace(/^(HDN [^.]*)\./, `$1 al cierre; se suspende ${enumerar(suspendidas)} durante el turno.`) : hdn);
  lineas.push(textoNeuro(ultimo, pbw));

  // Soporte: como llega, que paso y como cierra (si cambio).
  const cambioSoporte = cs.some((c) => c.ventilacion.modalidad !== primero.ventilacion.modalidad || c.viaAerea !== primero.viaAerea);
  const narrados = narrarEventos(evs, e.eventos, todos, pbw);
  if (cambioSoporte) {
    lineas.push(textoSoporte(e.episodio, e.eventos, todos, primero, pbw), ...narrados);
    lineas.push(`Al cierre (${ultimo.hora} hrs) ${minusculaInicial(textoSoporte(e.episodio, e.eventos, todos, ultimo, pbw).replace(/^Ventila espontáneo con apoyo de CNAF\. Parámetros:/, "ventila espontáneo con CNAF:"))}`);
  } else {
    lineas.push(textoSoporte(e.episodio, e.eventos, todos, ultimo, pbw), ...narrados);
  }

  // Auscultacion y secreciones: al cierre, con el cambio desde el inicio.
  const a0 = primero.kineResp.auscultacion.trim(), a1 = ultimo.kineResp.auscultacion.trim();
  // Si al inicio habia mas hallazgos, se nombra solo lo que ya no esta («crépitos bibasales al inicio del turno»).
  const limpia = (x: string): string => x.replace(/[\s.]+$/, "");
  const extra = a0 && a0 !== a1 ? (a0.startsWith(a1) ? a0.slice(a1.length).replace(/^[\s,;y]+/, "") : a0) : "";
  if (a1) lineas.push(oracion(`Auscultación: ${limpia(a1)}${extra && cs.length > 1 ? ` (${minusculaInicial(limpia(extra))} al inicio del turno)` : ""}`));
  else if (a0) lineas.push(oracion(textoAuscultacion(primero)));
  const s0 = textoSecreciones(primero), s1 = textoSecreciones(ultimo), t1 = textoTos(ultimo);
  if (s0 && s1 && s0 !== s1 && cs.length > 1) lineas.push(oracion(`${s0} al inicio del turno; al cierre ${s1}${t1 ? `, ${t1}` : ""}`));
  else lineas.push(lineaSecreciones(ultimo));

  lineas.push(...bloqueKine(cs, evs));
  const notas = [...new Set(cs.map((c) => c.observaciones.trim()).filter(Boolean))];
  if (notas.length) lineas.push(oracion(`Nota: ${notas.map((n) => n.replace(/[\s.]+$/, "")).join(". ")}`));
  if (e.episodio.pendienteEntrega.trim()) lineas.push(oracion(`Plan: ${minusculaInicial(e.episodio.pendienteEntrega.replace(/[\s.]+$/, ""))}`));
  return lineas.filter(Boolean).join("\n");
}
