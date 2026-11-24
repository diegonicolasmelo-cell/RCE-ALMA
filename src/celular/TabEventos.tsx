import { ChevronLeft, PenLine, Search, ArrowLeftRight, Ban, CircleAlert, CircleSlash, Footprints, Users, Wind, LogOut, CircleMinus, Eye, Filter, HandHelping, HeartPulse, Repeat, RotateCcw, RotateCw, Ruler, ScanLine, Scissors, ShieldAlert, TestTube, Timer, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DESTINOS_IMAGEN,
  MUESTRAS_CULTIVO,
  PROCEDIMIENTOS_MEDICOS,
  describirEvento,
  pideControl,
  esViaAereaArtificial,
  estadoProno,
  ETIQUETA_MODALIDAD,
  ETIQUETA_MOTIVO_CAMBIO,
  ETIQUETA_MOTIVO_SIN_PVE,
  CAMAS_UNIDAD,
  esCamaPrueba,
  nombreCama,
  botonExtubacion,
  motivoSinPve,
  estadoFlujoPve,
  DESTINOS_EGRESO,
  motivoDeDestino,
  ETIQUETA_MOTIVO_EGRESO,
  NIVELES_KTM,
  MOTIVOS_KTM_NO_REALIZADA,
  RAZONES_PVE_NO_REALIZADA,
  MOTIVOS_REINTUBACION,
  contextoFiltros,
  fechaEtiquetaAhora,
  reglaFiltro
} from "@core/index";
import type { DestinatarioEducacion, DispositivoPosterior, EventoClinico, NivelKtm, MotivoAjusteTubo, MotivoCambioVia, MotivoExtubacionSinPve } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";
import { Pildora } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { horaDe } from "../app/util";
import { casillaNumerica } from "./TecladoPropio";
import { CorregirVia } from "./CorregirVia";
import { useAtras } from "./Inicio";
import { iniciarCodigoPcr } from "./CodigoPcr";

type Base = ReturnType<typeof baseEvento>;
interface Opcion { valor: string; texto: string }
interface CampoForm { id: string; etiqueta: string; opciones?: readonly Opcion[]; valor?: string; /** Casilla numerica: usa el teclado propio. */ num?: boolean; /** Hora HH:MM (el reloj del telefono). */ hora?: boolean; /** Texto largo (varias lineas). */ largo?: boolean; /** Fecha de la etiqueta, escrita a mano (filtros, 24-nov-2026). */ fechaEtiqueta?: boolean }
interface Item {
  k: string;
  texto: string;
  /** Con que via aerea se ofrece: artificial (TET o TQT), natural, solo TET o solo TQT. */
  req?: "art" | "nat" | "tet" | "tqt";
  peligro?: boolean;
  deshabilitado?: boolean;
  /** Por que esta deshabilitado (se muestra bajo el boton). */
  ayuda?: string;
  campos?: readonly CampoForm[];
  /** No va en la lista: se llega desde «Extubación» o buscandolo. */
  oculto?: boolean;
  /** El texto libre "Qué pasó" va como comentario del evento. */
  comentarioDe?: string;
  crear: (v: Record<string, string>, base: Base) => EventoClinico;
}

const DISPOSITIVOS: readonly Opcion[] = [
  { valor: "CNAF", texto: "CNAF" },
  { valor: "VMNI", texto: "VMNI" },
  { valor: "O2_CONVENCIONAL", texto: "O₂ convencional" },
  { valor: "AIRE_AMBIENTE", texto: "Aire ambiente" }
];
const lista = (xs: readonly string[]): readonly Opcion[] => xs.map((x) => ({ valor: x, texto: x }));
/** La fecha de la etiqueta: vacía, para escribirla a mano. */
const CAMPO_ETIQUETA: CampoForm = { id: "fe", etiqueta: "Fecha que escribiste en la etiqueta", fechaEtiqueta: true, valor: "" };
const ddmmEt = (ymd: string): string => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}`;

/** Eventos que cambian la via aerea: despues de registrarlos se sigue con el control. */
const CAMBIAN_VIA = ["extub", "reint", "traq", "autoext", "accext", "decan"];
/**
 * Como se dice cada evento en la unidad, para la busqueda (Diego, 22-nov-2026): quien escribe «prono»,
 * «cta» o «traqueo» lo encuentra aunque el boton diga otra cosa. Sin tildes ni mayusculas.
 */
const SINONIMOS: Readonly<Record<string, string>> = {
  extubar: "extubar extubacion retiro del tubo protocolo pve autoextubacion accidental",
  extub: "extubar extubacion fuera de protocolo sin pve criterio clinico indicacion medica",
  pve: "pve prueba ventilacion espontanea destete weaning con protocolo",
  reint: "intubar intubacion reintubar tot tubo",
  traq: "tqt traqueo traqueostomia",
  ajuste: "ajuste fijacion cm arcada tubo desplazamiento",
  cambioTubo: "recambio tot tubo cuff fuga",
  cambioCanula: "recambio tqt canula cuff",
  decan: "decanular decanulacion canula tqt",
  autoext: "autoextubacion autoext se extubo",
  accext: "extubacion accidental",
  pveNo: "pve no realizada sin pve",
  traslado: "traslado cambio de cama mover",
  egreso: "alta egreso salida fallece",
  ktm: "ktm terapia fisica motora movilizacion sedestacion bipedestacion marcha ems",
  ktmNo: "ktm no realizada terapia fisica",
  imt: "imt threshold entrenamiento inspiratorio",
  edu: "educacion familia cuidador",
  prono: "prono pronar pronacion decubito prono",
  supinar: "supino supinar supinacion",
  fbc: "fbc fibrobroncoscopia broncoscopia lavado",
  cult: "cultivo cta aspirado traqueal hemocultivo urocultivo muestra",
  img: "imagen scanner tac resonancia rx traslado",
  asist: "asistencia procedimiento cvc linea arterial pleurostomia",
  hme: "hme filtro nariz artificial",
  trach: "trachcare trach care succion cerrada",
  hepa: "hepa filtro",
  pcr: "paro pcr rcp reanimacion",
  cent: "centinela adverso caida error"
};
const sinTilde = (t: string): string => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** Un RUT en el texto libre no se guarda: el evento viaja sin identidad. */
const PARECE_RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/;
/** «HH:MM» → ese momento de hoy; si todavia no llega, de ayer (se anota despues de que paso). */
function momentoDeHora(hhmm: string, ahora: Date): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), Number(m[1]), Number(m[2]));
  if (d.getTime() > ahora.getTime() + 60_000) d.setDate(d.getDate() - 1);
  return d;
}

/** Eventos que se registran y siguen con su control (todos menos filtros, TrachCare, cama y PVE). */
const CON_CONTROL = ["reint", "traq", "autoext", "accext", "decan", "cambioTubo", "cambioCanula", "ajuste", "prono", "supinar", "fbc", "cult", "img", "asist", "pcr", "cent", "libre"];

const MOTIVOS_SIN_PVE: readonly Opcion[] = (Object.keys(ETIQUETA_MOTIVO_SIN_PVE) as MotivoExtubacionSinPve[]).map((k) => ({
  valor: k,
  texto: ETIQUETA_MOTIVO_SIN_PVE[k].charAt(0).toUpperCase() + ETIQUETA_MOTIVO_SIN_PVE[k].slice(1)
}));

const MOTIVOS_CAMBIO: readonly Opcion[] = (Object.keys(ETIQUETA_MOTIVO_CAMBIO) as MotivoCambioVia[]).map((k) => ({
  valor: k,
  texto: ETIQUETA_MOTIVO_CAMBIO[k].charAt(0).toUpperCase() + ETIQUETA_MOTIVO_CAMBIO[k].slice(1)
}));

/**
 * `onCambioVia`: que hacer tras un evento que cambia la via aerea (intubacion, extubacion,
 * TQT). El evento lleva al control post evento: el registro sigue al hecho.
 */
export function TabEventos({ ctx, onCambioVia }: { ctx: ContextoCama; onCambioVia?: (texto: string, cambiaVia: boolean) => void }) {
  const { ep, eventos, ahora, rutAutor } = ctx;
  // Filtros: HEPA solo con ventilador conectado; HME no con humidificación activa (24-nov-2026).
  const ctxF = contextoFiltros(ep, ctx.controles);
  const noAplica = (el: "HME" | "HEPA"): Partial<Item> => {
    const r = reglaFiltro(el, ctxF);
    if (r === "NO_APLICA") return { deshabilitado: true, ayuda: el === "HEPA" ? "Sin ventilador conectado: no hay HEPA." : "Con humidificación activa no hay HME." };
    if (r === "POR_ESTADIA") return { ayuda: "PB / AVEA: el HEPA es uno por estadía." };
    return {};
  };
  const { repo, db } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [saliendo, setSaliendo] = useState(false);
  const salida = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Cierra la pantalla del evento deslizandola hacia la derecha (sin animacion si el telefono la reduce). */
  const cerrar = (): void => {
    const k = abierto;
    if (!k) return;
    const sinMovimiento = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSaliendo(true);
    clearTimeout(salida.current);
    salida.current = setTimeout(() => { setAbierto((a) => (a === k ? null : a)); setSaliendo(false); }, sinMovimiento ? 0 : 220);
  };
  useEffect(() => () => clearTimeout(salida.current), []);
  useAtras(abierto !== null, cerrar);

  const prono = estadoProno(eventos, ahora);
  const irA = useApp((s) => s.irA);
  // PVE: el mismo acceso que en la tarjeta de la cama (solo TET con el ultimo control en CPAP+PS).
  const ultimoPve = ctx.ultimo ? { modalidad: ctx.ultimo.ventilacion.modalidad, registradoEn: ctx.ultimo.registradoEn } : null;
  // Camas libres: el traslado solo va a una de ellas (la que se deja necesita aseo terminal).
  const activas = useConsulta(() => repo.episodiosActivos(), [repo], null);
  const libres = CAMAS_UNIDAD.filter((c) => !(activas ?? []).some((e) => e.cama === c) && esCamaPrueba(c) === esCamaPrueba(ep.cama));
  const boton = botonExtubacion(ep, ultimoPve, eventos, ctx.controles[0]?.registradoEn ?? null, ahora);
  const pve = boton?.tipo === "PVE" ? boton.acceso : null;
  // Si ya se retiro la via aerea en este episodio, la proxima intubacion es REintubacion.
  const yaRetiradaVia = eventos.some((e) => e.tipo === "EXTUBACION_PROGRAMADA" || e.tipo === "AUTOEXTUBACION" || e.tipo === "DECANULACION");

  const grupos: { titulo: string; items: Item[] }[] = [
    {
      titulo: "Vía aérea",
      items: [
        // Extubacion (Diego, 22-nov-2026): una puerta con las cuatro vias del retiro del tubo: con
        // protocolo (abre la PVE), fuera de protocolo (con su motivo), autoextubacion y accidental.
        // «Weaning» no se usa: destetar del ventilador incluye tambien la TQT.
        { k: "extubar", texto: "Extubación", req: "tet", crear: (_v, b) => b as never },
        {
          k: "extub", texto: "Extubación fuera de protocolo", req: "tet", oculto: true,
          campos: [
            // Antes de 24 h de VM el motivo viene marcado; despues se elige (no se asume nada).
            { id: "mot", etiqueta: "¿Por qué fuera de protocolo (sin PVE)?", valor: boton?.tipo === "FUERA_PROTOCOLO" ? "MENOS_24H_VM" : "", opciones: [{ valor: "", texto: "— elegir —" }, ...MOTIVOS_SIN_PVE] },
            { id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }
          ],
          crear: (v, b) => ({ ...b, tipo: "EXTUBACION_PROGRAMADA", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior, sinPve: (v["mot"] || "OTRO") as MotivoExtubacionSinPve })
        },
        // La PVE de cada dia, aunque no se extube. Sin PVE posible igual se abre: ahi se ve por que.
        { k: "pve", texto: pve ? pve.texto : "PVE", req: "tet", ...(pve ? {} : { ayuda: `${motivoSinPve(ep.viaAereaActual, ultimoPve, eventos) ?? ""} Si no corresponde PVE, ábrela para extubar fuera de protocolo.`.trim() }), crear: (_v, b) => b as never },
        { k: "reint", texto: yaRetiradaVia ? "Reintubación" : "Intubación", req: "nat", campos: [{ id: "via", etiqueta: "Vía", opciones: lista(["TET", "TQT"]) }, { id: "cal", etiqueta: "Calibre", num: true }, { id: "fij", etiqueta: "Fijación (cm en la arcada dental)", num: true }, { id: "talla", etiqueta: "Talla (cm) · para el peso ideal", valor: String(ep.tallaCm), num: true }, { id: "sexo", etiqueta: "Sexo", valor: ep.sexo, opciones: [{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }] },
          // Reintubación (no la primera intubación): el motivo de la lista del RCE y la hipótesis libre.
          ...(yaRetiradaVia ? [{ id: "mot", etiqueta: "Motivo de la reintubación", valor: "", opciones: [{ valor: "", texto: "— elegir —" }, ...lista(MOTIVOS_REINTUBACION)] }, { id: "hip", etiqueta: "Hipótesis (opcional)" }] : [])],
          comentarioDe: "hip",
          crear: (v, b) => ({ ...b, tipo: "REINTUBACION", via: v["via"] === "TQT" ? "TQT" : "TET", calibre: v["cal"] ?? "", fijacionCm: v["via"] === "TQT" ? "" : v["fij"] ?? "", ...(v["mot"] ? { motivo: v["mot"] } : {}) }) },
        { k: "traq", texto: "Traqueostomía", req: "tet", campos: [{ id: "cal", etiqueta: "Calibre", num: true }], crear: (v, b) => ({ ...b, tipo: "TRAQUEOSTOMIA", calibre: v["cal"] ?? "" }) },
        { k: "ajuste", texto: "Ajustar posición del tubo", req: "tet", campos: [{ id: "cm", etiqueta: "Centímetros en la arcada dental", valor: ep.fijacionCm ?? "", num: true }, { id: "mot", etiqueta: "Motivo", opciones: [{ valor: "DESPLAZAMIENTO_SUPERFICIAL", texto: "Desplazamiento superficial" }, { valor: "CONTROL_RADIOLOGICO", texto: "Control radiológico" }] }], crear: (v, b) => ({ ...b, tipo: "AJUSTE_TUBO", fijacionCm: v["cm"] ?? "", motivo: (v["mot"] ?? "DESPLAZAMIENTO_SUPERFICIAL") as MotivoAjusteTubo }) },
        {
          k: "cambioTubo", texto: "Cambio de tubo", req: "tet",
          campos: [{ id: "cal", etiqueta: "Calibre del tubo nuevo", valor: ep.calibreVia ?? "", num: true }, { id: "fij", etiqueta: "Fijación (cm en la arcada dental)", valor: ep.fijacionCm ?? "", num: true }, { id: "mot", etiqueta: "Motivo", opciones: MOTIVOS_CAMBIO }],
          crear: (v, b) => ({ ...b, tipo: "CAMBIO_TUBO", calibre: (v["cal"] ?? "").trim(), fijacionCm: (v["fij"] ?? "").trim(), motivo: (v["mot"] ?? "OTRO") as MotivoCambioVia })
        },
        {
          k: "cambioCanula", texto: "Cambio de cánula", req: "tqt",
          campos: [{ id: "cal", etiqueta: "Calibre de la cánula nueva", valor: ep.calibreVia ?? "", num: true }, { id: "mot", etiqueta: "Motivo", opciones: MOTIVOS_CAMBIO }],
          crear: (v, b) => ({ ...b, tipo: "CAMBIO_CANULA", calibre: (v["cal"] ?? "").trim(), motivo: (v["mot"] ?? "OTRO") as MotivoCambioVia })
        },
        {
          k: "decan", texto: "Decanulación", req: "tqt",
          campos: [{ id: "disp", etiqueta: "Queda en", opciones: DISPOSITIVOS }, { id: "acc", etiqueta: "¿Fue planificada?", opciones: [{ valor: "no", texto: "Sí, planificada" }, { valor: "si", texto: "No: accidental" }] }],
          crear: (v, b) => ({ ...b, tipo: "DECANULACION", dispositivo: (v["disp"] ?? "CNAF") as Exclude<DispositivoPosterior, "REINTUBACION_INMEDIATA">, accidental: v["acc"] === "si" })
        },
        { k: "autoext", texto: "Autoextubación", req: "tet", peligro: true, campos: [{ id: "txt", etiqueta: "Qué pasó (breve)" }, { id: "disp", etiqueta: "Queda en", opciones: [...DISPOSITIVOS, { valor: "REINTUBACION_INMEDIATA", texto: "Reintubación inmediata" }] }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "AUTOEXTUBACION", dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) },
        // Accidental: la extubo el equipo sin querer (p. ej. en una movilizacion). Cuenta con las autoextubaciones.
        { k: "accext", texto: "Extubación accidental", req: "tet", peligro: true, campos: [{ id: "txt", etiqueta: "Qué pasó (breve)" }, { id: "disp", etiqueta: "Queda en", opciones: [...DISPOSITIVOS, { valor: "REINTUBACION_INMEDIATA", texto: "Reintubación inmediata" }] }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "AUTOEXTUBACION", accidental: true, dispositivo: (v["disp"] ?? "CNAF") as DispositivoPosterior }) },
        { k: "pveNo", texto: "PVE no realizada", req: "tet", campos: [{ id: "raz", etiqueta: "¿Por qué no se realizó la PVE en este turno?", valor: "", opciones: [{ valor: "", texto: "— elegir —" }, ...lista(RAZONES_PVE_NO_REALIZADA)] }, { id: "txt", etiqueta: "Detalle (opcional)" }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "PVE_NO_REALIZADA", razon: v["raz"] ?? "" }) }
      ]
    },
    {
      titulo: "Cama",
      items: [
        {
          k: "traslado", texto: "Cambiar de cama",
          ...(libres.length === 0 ? { deshabilitado: true, ayuda: "No hay camas libres." } : {}),
          campos: [{ id: "cama", etiqueta: "Cama nueva · solo las libres", opciones: libres.map((c) => ({ valor: c, texto: nombreCama(c) })) }],
          crear: (v, b) => ({ ...b, tipo: "TRASLADO_CAMA", desde: ep.cama, hasta: v["cama"] ?? ep.cama })
        },
        {
          // El egreso no es un evento: cierra el episodio (lo mismo que «Dar de alta» en el PC).
          k: "egreso", texto: "Dar de alta (egreso)",
          campos: [{ id: "dest", etiqueta: "Destino del egreso", opciones: [{ valor: "", texto: "— elegir —" }, ...DESTINOS_EGRESO.flatMap((g) => g.destinos.map((d) => ({ valor: d, texto: g.destinos.length > 1 && g.motivo === "ALTA" ? `Sala: ${d}` : d })))] }],
          crear: () => { throw new Error("el egreso no es un evento"); }
        }
      ]
    },
    {
      // Kinesiterapia: cada cosa es un evento que va sola a la estadistica y al REM.
      titulo: "Kinesiterapia",
      items: [
        {
          k: "ktm", texto: "Terapia física (KTM)",
          campos: [
            { id: "niv", etiqueta: "Nivel", valor: "", opciones: [{ valor: "", texto: "— elegir —" }, ...NIVELES_KTM.map((n) => ({ valor: String(n.nivel), texto: n.titulo }))] },
            { id: "ems", etiqueta: "Electroestimulación (EMS)", opciones: [{ valor: "no", texto: "No" }, { valor: "si", texto: "Sí, con EMS" }] },
            { id: "ims", etiqueta: "IMS (0 a 10, opcional)", num: true }
          ],
          crear: (v, b) => ({ ...b, tipo: "TERAPIA_FISICA", realizada: true, nivel: Number(v["niv"]) as NivelKtm, ems: v["ems"] === "si", ims: (v["ims"] ?? "").trim() === "" ? null : Number(v["ims"]), motivo: null })
        },
        {
          k: "ktmNo", texto: "Terapia física no realizada",
          campos: [{ id: "mot", etiqueta: "Motivo", valor: "", opciones: [{ valor: "", texto: "— elegir —" }, ...lista(MOTIVOS_KTM_NO_REALIZADA)] }],
          crear: (v, b) => ({ ...b, tipo: "TERAPIA_FISICA", realizada: false, nivel: null, ems: false, ims: null, motivo: v["mot"] ?? "" })
        },
        { k: "imt", texto: "IMT (entrenamiento muscular inspiratorio)", crear: (_v, b) => ({ ...b, tipo: "IMT" }) },
        {
          k: "edu", texto: "Educación",
          campos: [{ id: "a", etiqueta: "A quién", opciones: [{ valor: "FAMILIA", texto: "A la familia" }, { valor: "PACIENTE", texto: "Al paciente" }, { valor: "CUIDADOR", texto: "Al cuidador" }] }],
          crear: (v, b) => ({ ...b, tipo: "EDUCACION", dirigidaA: (v["a"] ?? "FAMILIA") as DestinatarioEducacion })
        }
      ]
    },
    {
      titulo: "Posición",
      items: [
        prono.enProno
          ? { k: "supinar", texto: "Supinar", req: "art", crear: (_v, b) => ({ ...b, tipo: "SUPINACION" }) }
          : { k: "prono", texto: "Iniciar prono", req: "art", crear: (_v, b) => ({ ...b, tipo: "INICIO_PRONO" }) }
      ]
    },
    {
      titulo: "Procedimientos",
      items: [
        { k: "fbc", texto: "Asistencia en fibrobroncoscopía", crear: (_v, b) => ({ ...b, tipo: "ASISTENCIA_FBC" }) },
        { k: "cult", texto: "Toma de cultivo", campos: [{ id: "mu", etiqueta: "Muestra", opciones: lista(MUESTRAS_CULTIVO) }], crear: (v, b) => ({ ...b, tipo: "TOMA_CULTIVO", muestra: v["mu"] ?? MUESTRAS_CULTIVO[0] ?? "" }) },
        { k: "img", texto: "Traslado a imagenología", campos: [{ id: "dst", etiqueta: "Destino", opciones: lista(DESTINOS_IMAGEN) }], crear: (v, b) => ({ ...b, tipo: "TRASLADO_IMAGEN", destino: v["dst"] ?? DESTINOS_IMAGEN[0] ?? "" }) },
        { k: "asist", texto: "Asistencia en procedimiento", campos: [{ id: "pr", etiqueta: "Procedimiento", opciones: lista(PROCEDIMIENTOS_MEDICOS) }], crear: (v, b) => ({ ...b, tipo: "ASISTENCIA_PROCEDIMIENTO", procedimiento: v["pr"] ?? PROCEDIMIENTOS_MEDICOS[0] ?? "" }) },
        // Cambio de filtro (Diego, 24-nov-2026): sin monitorización y con la FECHA DE LA ETIQUETA escrita
        // a mano (no automática: obliga a pensar si de verdad se cambió). Solo lo que corresponde.
        { k: "hme", texto: "Cambio de filtro HME", req: "art", campos: [CAMPO_ETIQUETA], ...noAplica("HME"), crear: (v, b) => ({ ...b, tipo: "CAMBIO_HMEF", fechaEtiqueta: v["fe"] ?? "" }) },
        { k: "trach", texto: "Cambio de TrachCare", req: "art", campos: [CAMPO_ETIQUETA], crear: (v, b) => ({ ...b, tipo: "CAMBIO_FILTRO", elemento: "TRACHCARE", fechaEtiqueta: v["fe"] ?? "" }) },
        { k: "hepa", texto: "Cambio de filtro HEPA", req: "art", campos: [CAMPO_ETIQUETA], ...noAplica("HEPA"), crear: (v, b) => ({ ...b, tipo: "CAMBIO_FILTRO", elemento: "HEPA", fechaEtiqueta: v["fe"] ?? "" }) }
      ]
    },
    {
      // Lo que no esta en la lista (Diego, 22-nov-2026): «Electroencefalograma», «Desplazamiento de
      // canula»… Con su hora; se registra solo o con su control. No suma a ninguna cifra.
      titulo: "Otro",
      items: [
        {
          k: "libre", texto: "Otro evento (escribirlo)",
          campos: [{ id: "txt", etiqueta: "Qué pasó", largo: true }, { id: "hora", etiqueta: "Hora en que ocurrió", hora: true, valor: horaDe(ahora) }],
          crear: (v, b) => {
            const d = momentoDeHora(v["hora"] ?? "", new Date(b.registradoEn)) ?? new Date(b.registradoEn);
            return { ...b, tipo: "EVENTO_LIBRE", descripcion: (v["txt"] ?? "").trim(), hora: horaDe(d), realizadaEn: d.toISOString() };
          }
        }
      ]
    },
    {
      titulo: "Críticos",
      items: [
        { k: "pcr", texto: "Paro cardiorrespiratorio", peligro: true, campos: [{ id: "min", etiqueta: "Duración de la reanimación (min)", num: true }, { id: "txt", etiqueta: "Qué pasó (breve)" }], comentarioDe: "txt", crear: (v, b) => ({ ...b, tipo: "PCR", duracionReanimacionMin: Number(v["min"]?.replace(",", ".")) || 0 }) },
        { k: "cent", texto: "Evento centinela u otro evento adverso", peligro: true, campos: [{ id: "txt", etiqueta: "Descripción" }], crear: (v, b) => ({ ...b, tipo: "EVENTO_CENTINELA", descripcion: v["txt"] ?? "" }) }
      ]
    }
  ];

  const todos = grupos.flatMap((g) => g.items);
  /** Cada evento solo con la via que corresponde (lo del tubo con TET, lo de la canula con TQT). */
  const aplica = (it: Item): boolean =>
    !it.req ||
    (it.req === "art" && esViaAereaArtificial(ep.viaAereaActual)) ||
    (it.req === "nat" && ep.viaAereaActual === "NATURAL") ||
    (it.req === "tet" && ep.viaAereaActual === "TET") ||
    (it.req === "tqt" && ep.viaAereaActual === "TQT");
  const item = abierto ? todos.find((i) => i.k === abierto) : undefined;

  const registrar = async (it: Item, v: Record<string, string>, conControl = true): Promise<void> => {
    const numOk = (x: string | undefined, min: number, max: number): boolean => {
      const n = Number((x ?? "").replace(",", "."));
      return (x ?? "").trim() !== "" && Number.isFinite(n) && n >= min && n <= max;
    };
    if ((it.k === "cambioTubo" || it.k === "cambioCanula" || it.k === "traq") && !numOk(v["cal"], 2, 12)) return avisar("Revisa el calibre (entre 2 y 12).");
    if (it.k === "hme" || it.k === "trach" || it.k === "hepa") {
      const fe = v["fe"] ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fe)) return avisar("Escribe la fecha que pusiste en la etiqueta.");
      if (fe > fechaEtiquetaAhora(new Date())) return avisar("La fecha de la etiqueta no puede ser posterior a la de hoy.");
    }
    if (it.k === "cambioTubo" && !numOk(v["fij"], 10, 35)) return avisar("Revisa los cm en la arcada (entre 10 y 35).");
    if (it.k === "ajuste" && !numOk(v["cm"], 10, 35)) return avisar("Revisa los cm en la arcada (entre 10 y 35).");
    if (it.k === "reint") {
      const t = Number((v["talla"] ?? "").replace(",", "."));
      if ((v["cal"] ?? "").trim() === "") return avisar("Falta el calibre.");
      if (v["via"] !== "TQT" && (v["fij"] ?? "").trim() === "") return avisar("Faltan los cm en la arcada dental.");
      if (!Number.isFinite(t) || t < 100 || t > 230) return avisar("Revisa la talla: entre 100 y 230 cm.");
      // Talla y sexo son del paciente: si se corrigieron aqui, se corrigen en el episodio.
      const sexo = v["sexo"] === "F" ? "F" : "M";
      if (t !== ep.tallaCm || sexo !== ep.sexo) await repo.guardarEpisodio({ ...ep, tallaCm: t, sexo });
    }
    if (it.k === "traslado") {
      const destino = v["cama"] ?? "";
      if (!libres.includes(destino)) return avisar("Elige una cama libre.");
    }
    if (it.k === "ktm" && !v["niv"]) return avisar("Elige el nivel de la terapia física.");
    if (it.k === "ktm" && (v["ims"] ?? "").trim() !== "" && !numOk(v["ims"], 0, 10)) return avisar("El IMS va de 0 a 10.");
    if (it.k === "ktmNo" && !v["mot"]) return avisar("Elige el motivo por el que no se hizo.");
    if (it.k === "pveNo" && !v["raz"]) return avisar("Elige por qué no se realizó la PVE.");
    if (it.k === "extub" && !v["mot"]) return avisar("Elige por qué fue fuera de protocolo.");
    if (it.k === "libre") {
      const txt = (v["txt"] ?? "").trim();
      if (txt.length < 3) return avisar("Escribe qué pasó.");
      if (txt.length > 140) return avisar("Que sea breve: hasta 140 letras.");
      if (PARECE_RUT.test(txt)) return avisar("Sin RUT ni nombres en el evento: quítalo y vuelve a registrar.");
      if (!momentoDeHora(v["hora"] ?? "", new Date())) return avisar("Revisa la hora (HH:MM).");
    }
    if (it.k === "egreso") {
      const destino = v["dest"] ?? "";
      const motivo = motivoDeDestino(destino);
      if (!motivo) return avisar("Elige el destino del egreso.");
      await repo.darAlta(ep.id, motivo, destino);
      setAbierto(null);
      setValores({});
      useApp.getState().descartar(ep.id);
      useApp.getState().irA("camas");
      avisar(`${nombreCama(ep.cama)} dada de alta (${destino}; ${ETIQUETA_MOTIVO_EGRESO[motivo].toLowerCase()}). La cama queda libre; el nombre y el RUT se borran en el PC.`);
      return;
    }
    const ahoraReal = new Date();
    const comentario = it.comentarioDe ? (v[it.comentarioDe] ?? "") : "";
    // Reintubar dentro de la vigilancia post extubacion es una falla post extubacion: queda registrada.
    const post = it.k === "reint" ? estadoFlujoPve(eventos, ahoraReal).bloque : null;
    if (post && !post.falla) {
      await repo.registrarEvento({ ...baseEvento(ep, rutAutor, new Date(ahoraReal.getTime() - 1)), tipo: "FALLA_POST_EXTUB", falla: true, hipotesis: "", observaciones: "" } as EventoClinico);
    }
    const creado = it.crear(v, baseEvento(ep, rutAutor, ahoraReal, comentario));
    const ev = (conControl || !CON_CONTROL.includes(it.k) ? creado : { ...creado, sinControl: true }) as EventoClinico;
    await repo.registrarEvento(ev);
    cerrar();
    setBusca("");
    // Autoextubacion con reintubacion inmediata: se sigue por el mismo camino de la intubacion.
    if ((it.k === "autoext" || it.k === "accext") && v["disp"] === "REINTUBACION_INMEDIATA") {
      const reint = todos.find((x) => x.k === "reint");
      if (reint?.campos) {
        clearTimeout(salida.current);
        setSaliendo(false);
        setAbierto("reint");
        setValores(Object.fromEntries(reint.campos.map((c) => [c.id, c.valor ?? c.opciones?.[0]?.valor ?? ""])));
      }
      avisar(`${it.k === "accext" ? "Extubación accidental" : "Autoextubación"} registrada. Ahora registra la reintubación: el tubo, los cm y la hora.`);
      return;
    }
    // Extubacion fuera de protocolo: sigue en la PVE con el control inmediato post extubacion.
    if (ev.tipo === "EXTUBACION_PROGRAMADA") {
      useApp.getState().descartar(ep.id);
      useApp.getState().pedirPostExtub(ep.id);
      useApp.getState().irA("pve", ep.id);
      avisar("Extubación fuera de protocolo registrada. Registra el control inmediato post extubación.");
      return;
    }
    if (it.k === "traslado") {
      // La cama nueva pasa a ser mía si la anterior lo era: el paciente sigue en mi lista.
      const mias = useApp.getState().misCamas;
      if (mias?.includes(ep.cama)) useApp.getState().setMisCamas([...mias.filter((c) => c !== ep.cama), v["cama"] ?? ""].sort());
      avisar(`Paciente trasladado a ${nombreCama(v["cama"] ?? "")}. ${nombreCama(ep.cama)} queda libre: recuerda el aseo terminal antes de ocuparla.`);
      return;
    }
    // El evento queda guardado y se sigue con su control, que queda ligado a el.
    if (!conControl && CON_CONTROL.includes(it.k)) {
      // Sin control: si cambio la via aerea, el borrador del control viejo ya no sirve.
      if (CAMBIAN_VIA.includes(it.k)) useApp.getState().descartar(ep.id);
      avisar(it.peligro ? "Evento registrado sin control. El PC ya muestra la alerta con el informe pre-llenado." : `Evento registrado sin control: ${it.texto}.`);
      return;
    }
    if (pideControl(ev) && onCambioVia) {
      useApp.getState().monitorizarEvento({ episodioId: ep.id, eventoId: ev.id, texto: describirEvento(ev, [...eventos, ev]), hora: ev.hora });
      onCambioVia(`Evento registrado: ${it.texto}. Sigue con su monitorización.`, CAMBIAN_VIA.includes(it.k));
      return;
    }
    avisar(it.peligro ? "Evento registrado. El PC ya muestra la alerta con el informe pre-llenado." : "Evento registrado.");
  };

  // Desde la tarjeta de la cama se puede llegar con un evento ya pedido (p. ej. la extubacion).
  const eventoPedido = useApp((s) => s.eventoPedido);
  useEffect(() => {
    if (!eventoPedido) return;
    useApp.getState().pedirEvento(null);
    const it = todos.find((x) => x.k === eventoPedido);
    if (it && aplica(it)) clic(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoPedido]);

  const clic = (it: Item): void => {
    // El paro abre el codigo PCR en vivo, con esta cama ya elegida.
    if (it.k === "pcr") {
      void iniciarCodigoPcr(db, ep.id);
      return;
    }
    if (it.k === "pve") {
      setAbierto(null);
      irA("pve", ep.id);
      return;
    }
    if (it.k === "extubar") {
      clearTimeout(salida.current);
      setSaliendo(false);
      setAbierto("extubar");
      return;
    }
    // Con campos, o si puede llevar control (se elige con o sin control), se abre su tarjeta.
    if (it.campos || CON_CONTROL.includes(it.k)) {
      clearTimeout(salida.current);
      setSaliendo(false);
      setAbierto(it.k);
      setValores(Object.fromEntries((it.campos ?? []).map((c) => [c.id, c.valor ?? c.opciones?.[0]?.valor ?? ""])));
    } else {
      void registrar(it, {});
    }
  };

  // Linea de tiempo: todo lo que paso en la cama, del mas nuevo al mas antiguo, con su fecha y hora.
  const [todo, setTodo] = useState(false);
  const linea = [
    ...eventos.map((e) => ({ id: e.id, en: ("realizadaEn" in e && typeof e.realizadaEn === "string" ? e.realizadaEn : e.registradoEn), texto: describirEvento(e, eventos), fuerte: e.tipo !== "EVALUACION_PUNTUAL" && e.tipo !== "CAMBIO_HMEF" && e.tipo !== "CAMBIO_FILTRO" })),
    ...ctx.controles.map((c) => ({ id: c.id, en: c.registradoEn, texto: `Control · ${ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? c.ventilacion.modalidad}`, fuerte: false }))
  ].sort((a, b) => b.en.localeCompare(a.en));
  const visibles = todo ? linea : linea.slice(0, 10);
  const cuando = (iso: string): string => {
    const d = new Date(iso);
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
    const dia = d.toDateString() === ahora.toDateString() ? "hoy" : d.toDateString() === ayer.toDateString() ? "ayer" : `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `${dia} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <>
      <CorregirVia key={`${ep.calibreVia}-${ep.fijacionCm}`} ep={ep} rutAutor={rutAutor} />
      {prono.enProno && (
        <div className="row">
          {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
        </div>
      )}

      {item && (item.campos || CON_CONTROL.includes(item.k) || item.k === "extubar") && createPortal(
        // Pantalla completa que entra deslizandose desde la derecha y sale igual (Diego, 22-nov-2026:
        // «que no aparezca de golpe, se ve duro»). «‹ Eventos» y el boton atras del telefono vuelven.
        <div className={`ev-capa${saliendo ? " sale" : ""}`}>
          <div className="ev-pantalla" role="dialog" aria-modal="true" aria-label={item.texto}>
            <header className="ev-cabeza">
              <button type="button" className="ev-volver" aria-label="Volver a eventos" onClick={cerrar}><ChevronLeft size={22} aria-hidden />Eventos</button>
              <b style={item.peligro ? { color: "var(--crit-ink)" } : undefined}>{item.texto}</b>
            </header>
            {item.k === "extubar" ? (
              <div className="pf-cuerpo">
                <p className="small muted">¿Cómo se retiró el tubo?</p>
                <div className="evgrid ev-lista">
                  {[
                    { k: "pve", t: "Extubación con protocolo", d: "Abre la PVE: si la supera, se extuba desde ahí." },
                    { k: "extub", t: "Extubación fuera de protocolo", d: "Sin PVE: se anota el motivo." },
                    { k: "autoext", t: "Autoextubación", d: "Qué pasó, con qué queda y aviso al PC.", crit: true },
                    { k: "accext", t: "Extubación accidental", d: "Qué pasó, con qué queda y aviso al PC.", crit: true }
                  ].map((x) => (
                    <button key={x.k} type="button" className={`ev-fila${x.crit ? " crit" : ""}`} onClick={() => { const it = todos.find((y) => y.k === x.k); if (it) clic(it); }}>
                      {x.t}
                      <span className="small muted" style={{ display: "block", fontWeight: 400 }}>{x.d}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
            <div className="pf-cuerpo">
              {(item.campos ?? []).map((c) => (
                <div className="f" key={c.id}>
                  <label htmlFor={`evf-${c.id}`}>{c.etiqueta}</label>
                  {c.opciones ? (
                    <select id={`evf-${c.id}`} value={valores[c.id] ?? ""} onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))}>
                      {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                    </select>
                  ) : c.fechaEtiqueta ? (
                    <>
                      <input id={`evf-${c.id}`} type="date" className="ev-hora" max={fechaEtiquetaAhora(ahora)} value={valores[c.id] ?? ""} onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))} />
                      <span className={`small ${valores[c.id] && valores[c.id] !== fechaEtiquetaAhora(ahora) ? "aviso-etiqueta" : "muted"}`}>
                        {valores[c.id] && valores[c.id] !== fechaEtiquetaAhora(ahora)
                          ? `Escribiste ${ddmmEt(valores[c.id]!)}; a esta hora correspondería ${ddmmEt(fechaEtiquetaAhora(ahora))}. Si lo anotas tarde, está bien.`
                          : `Según la hora, la etiqueta de ahora es ${ddmmEt(fechaEtiquetaAhora(ahora))} (desde las 20:00 va la fecha del día siguiente).`}
                      </span>
                    </>
                  ) : c.hora ? (
                    <input id={`evf-${c.id}`} type="time" className="ev-hora" value={valores[c.id] ?? ""} onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))} />
                  ) : c.largo ? (
                    <textarea id={`evf-${c.id}`} rows={3} maxLength={140} value={valores[c.id] ?? ""} placeholder="Ej.: electroencefalograma · desplazamiento de cánula" onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))} />
                  ) : (
                    <input id={`evf-${c.id}`} {...(c.num ? { ...casillaNumerica(), enterKeyHint: "next" as const } : {})} value={valores[c.id] ?? ""} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} autoComplete="off" onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.value }))} />
                  )}
                </div>
              ))}
              {item.k === "libre" && <p className="small muted">Queda en la línea de tiempo y en la evolución con su hora. No suma a las estadísticas. Sin nombres ni RUT.</p>}
              {item.peligro && <p className="small muted">Se genera una alerta en el PC con el informe de riesgo ya pre-llenado.</p>}
              {item.k === "egreso" && <p className="small muted">El paciente sale de la lista y la cama queda libre. Lo clínico se conserva para las estadísticas; el nombre y el RUT se borran en el PC.</p>}
            </div>
            )}
            {item.k === "extubar" ? null : CON_CONTROL.includes(item.k) ? (
              <div className="pie-inf" style={{ flexDirection: "column" }}>
                <button type="button" className={item.peligro ? "btn danger" : "btn primary"} onClick={() => void registrar(item, valores)}>Registrar y monitorizar ›</button>
                <button type="button" className="btn" onClick={() => void registrar(item, valores, false)}>{item.k === "libre" ? "Registrar solo con la hora" : "Registrar sin control"}</button>
              </div>
            ) : (
              <div className="pie-inf">
                <button type="button" className={item.peligro || item.k === "egreso" ? "btn danger" : "btn primary"} onClick={() => void registrar(item, valores)}>{item.k === "egreso" ? "Confirmar egreso" : "Registrar"}</button>
              </div>
            )}
          </div>
        </div>,
        document.querySelector(".app-cel") ?? document.body
      )}

      {/* Lista con busqueda (Diego, 22-nov-2026): un renglon por evento, como un menu; escribir
          «prono» o «cta» lo encuentra aunque este abajo. Si no esta, se escribe como evento libre. */}
      <label className="ev-buscar">
        <Search size={18} aria-hidden />
        <input id="ev-buscar" type="search" placeholder="Buscar evento" autoComplete="off" enterKeyHint="search" aria-label="Buscar evento" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      {(() => {
        const q = sinTilde(busca);
        const coincide = (it: Item): boolean => !q || sinTilde(`${it.texto} ${SINONIMOS[it.k] ?? ""} ${it.ayuda ?? ""}`).includes(q);
        const visibles = grupos.map((g) => ({ ...g, items: g.items.filter((it) => aplica(it) && (it.k !== "libre" || !q) && (!it.oculto || q) && coincide(it)) })).filter((g) => g.items.length);
        return (
          <>
            {visibles.map((g) => (
              <section key={g.titulo} className="ev-grupo">
                {!q && <h3>{g.titulo}</h3>}
                <div className="evgrid ev-lista">
                  {/* Lo del tubo y la TQT no se ofrece con via aerea natural: ni se muestra. Con via artificial, no se ofrece intubar. */}
                  {g.items.map((it) => {
                    const Icono = it.k === "libre" ? PenLine : ICONO_EVENTO[it.k];
                    return (
                      <button key={it.k} type="button" className={`ev-fila${it.peligro ? " crit" : ""}${it.k === "pve" && !it.ayuda ? " pve-ev" : ""}`} disabled={it.deshabilitado} title={it.ayuda} onClick={() => clic(it)}>
                        {Icono ? <Icono className="ev-ico" size={18} strokeWidth={1.8} aria-hidden /> : null}
                        {it.texto}
                        {it.ayuda && <span className="small muted" style={{ display: "block", fontWeight: 400 }}>{it.ayuda}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {q && (
              <div className="ev-sin">
                {!visibles.length && <p className="muted small">No hay un evento que diga «{busca.trim()}».</p>}
                <button type="button" className="btn" onClick={() => { const libre = todos.find((x) => x.k === "libre"); if (libre) { clic(libre); setValores((x) => ({ ...x, txt: busca.trim() })); } }}>
                  <PenLine size={16} aria-hidden /> Anotar «{busca.trim()}» como evento libre
                </button>
              </div>
            )}
          </>
        );
      })()}

      {linea.length > 0 && (
        <section aria-label="Línea de tiempo">
          <h3>Línea de tiempo ({linea.length})</h3>
          <ol className="linea-tiempo">
            {visibles.map((x) => (
              <li key={x.id}><span className="mono cuando">{cuando(x.en)}</span><span>{x.fuerte ? <b>{x.texto}</b> : x.texto}</span></li>
            ))}
          </ol>
          {linea.length > 10 && <button type="button" className="linkbtn" onClick={() => setTodo((t) => !t)}>{todo ? "Ver menos" : `Ver todo (${linea.length})`}</button>}
        </section>
      )}
    </>
  );
}

/** Icono de cada evento (en el diseño nuevo va sobre el nombre; en el clásico no se muestra). */
const ICONO_EVENTO: Record<string, LucideIcon> = {
  extub: CircleAlert, pve: Timer, reint: RotateCw, traq: Scissors, ajuste: Ruler, cambioTubo: Repeat, cambioCanula: Repeat,
  decan: CircleMinus, autoext: TriangleAlert, accext: TriangleAlert, pveNo: CircleSlash, ktm: Footprints, ktmNo: Ban, imt: Wind, edu: Users, traslado: ArrowLeftRight, egreso: LogOut, supinar: RotateCcw, prono: RotateCw, fbc: Eye,
  cult: TestTube, img: ScanLine, asist: HandHelping, hme: Filter, trach: Filter, hepa: Filter, pcr: HeartPulse, cent: ShieldAlert
};
