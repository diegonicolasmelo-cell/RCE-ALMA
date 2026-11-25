import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CATEGORIAS_REM, OBJETIVOS_VT_ML_KG, calcularPbw, rangoDeEdad, equiposDeLaCama, equiposParaVia, nombreCama, problemaEquipos, volumenObjetivoMl } from "@core/index";
import type { CategoriaRem, EquipoEnSala, Episodio, Sexo, ViaAerea } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { nuevoId } from "../app/util";
import { guardarMeta } from "../datos/db";
import { avisarMisCamasRce, claveMisCamas } from "./ElegirCamas";
import { Seg } from "./componentes";
import { EditorEquipos } from "./EditorEquipos";
import { casillaNumerica } from "./TecladoPropio";

const numero = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Peso ideal y volumen corriente por kilo, para titular desde el ingreso. */
export function textoPesoIdeal(tallaCm: number | null, sexo: Sexo | null): string | null {
  if (tallaCm === null || sexo === null || tallaCm < 100 || tallaCm > 230) return null;
  const pi = calcularPbw(tallaCm, sexo);
  return `Peso ideal ${String(pi).replace(".", ",")} kg · Vt ${OBJETIVOS_VT_ML_KG.map((o) => `${o} ml/kg ${volumenObjetivoMl(pi, o)}`).join(" · ")} ml`;
}

/**
 * Ingreso a pie de cama desde el celular, sin nombre ni RUT (eso lo pone el PC, cifrado):
 * la via aerea con que llega, el tubo, y el sexo y la talla para el peso ideal. Despues
 * se sigue con el control de ingreso.
 */
export function IngresoRapido({ cama, onCancelar }: { cama: string; onCancelar: () => void }) {
  const { repo, db, api } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const misCamas = useApp((s) => s.misCamas);
  const avisar = useApp((s) => s.avisar);
  const irA = useApp((s) => s.irA);
  const [via, setVia] = useState<ViaAerea | null>(null);
  const [calibre, setCalibre] = useState("");
  const [cm, setCm] = useState("");
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const [talla, setTalla] = useState("");
  const [edad, setEdad] = useState("");
  const [categoria, setCategoria] = useState<CategoriaRem | "">("");
  const [error, setError] = useState<string | null>(null);
  // Los equipos viven en la cama: se parte de lo que dejo el ultimo paciente de esta sala.
  const [equipos, setEquipos] = useState<readonly EquipoEnSala[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void Promise.all([db.episodios.toArray(), db.eventos.toArray()]).then(([eps, evs]) => {
      if (vivo) setEquipos((actual) => actual ?? equiposDeLaCama(cama, eps, evs));
    });
    return () => { vivo = false; };
  }, [db, cama]);
  // Se abre listo para escribir: con el foco en la talla aparece el teclado propio.
  const tallaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => tallaRef.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(t);
  }, []);
  const elegirVia = (v: ViaAerea): void => {
    setVia(v);
    setEquipos((l) => equiposParaVia(l ?? [], v));
  };
  const t = numero(talla);

  const guardar = async (): Promise<void> => {
    if (!sexo) return setError("Elige el sexo (para el peso ideal).");
    if (t === null) return setError("Falta la talla en cm.");
    if (t < 100 || t > 230) return setError("Revisa la talla: entre 100 y 230 cm.");
    if (!via) return setError("Elige la vía aérea con que llega.");
    if (via !== "NATURAL" && numero(calibre) === null) return setError("Falta el calibre.");
    if (via === "TET" && numero(cm) === null) return setError("Faltan los cm en la arcada dental.");
    const problema = problemaEquipos(equipos ?? [], via);
    if (problema) return setError(problema);
    const e = edadValida(edad);
    if (e === null) return setError("Falta la edad (entre 0 y 120 años): va al REM como tramo de edad.");
    if (categoria === "") return setError("Elige el diagnóstico REM del ingreso.");
    const ep: Episodio = {
      id: nuevoId(),
      cama,
      // Solo el tramo del REM: la edad exacta no se guarda. El nombre y el RUT, en el PC.
      rangoEdad: rangoDeEdad(e),
      sexo,
      tallaCm: t,
      tallaOrigen: "ESTIMADA",
      categoriaRem: categoria,
      viaAereaActual: via,
      calibreVia: via === "NATURAL" ? null : calibre.trim(),
      fijacionCm: via === "TET" ? cm.trim() : null,
      diasVM: 0,
      ingresadoEn: new Date().toISOString(),
      equipos: equipos ?? [],
      monitoreo: { capnografia: false, pic: false, dve: false },
      rutTitular: sesion.rut,
      transcritoAlma: false,
      horaTranscripcion: null,
      pendienteEntrega: "",
      activo: true,
      apkArchivada: null
    };
    await repo.guardarEpisodio(ep);
    // La cama ingresada queda entre las mias.
    if (misCamas && !misCamas.includes(cama)) {
      const lista = [...misCamas, cama];
      await guardarMeta(db, claveMisCamas(sesion.rut), lista);
      useApp.getState().setMisCamas(lista);
      avisarMisCamasRce(api, sesion.rut, lista);
    }
    avisar(`${nombreCama(cama)} ingresada. Sigue con el control de ingreso; el nombre y el RUT se agregan en el PC.`);
    irA("cama", ep.id);
  };

  const pi = textoPesoIdeal(t, sexo);
  return (
    <div className="fondo-flotante centrado">
      <form className="panel-flotante" role="dialog" aria-modal="true" aria-label={`Ingreso ${nombreCama(cama)}`} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <header className="pf-cabeza">
          <b>Ingreso · {nombreCama(cama)}</b>
          <button type="button" className="pf-cerrar" aria-label="Cerrar sin ingresar" onClick={onCancelar}><X size={20} aria-hidden /></button>
        </header>
        <div className="pf-cuerpo">
          {/* Sin via elegida se ofrece todo; al elegirla, la lista se ajusta sola. */}
          <EditorEquipos idBase="ir-eq" lista={equipos ?? []} via={via ?? "TQT"} onCambio={setEquipos} />
          <div className="small ink2">Sexo</div>
          <Seg ancho etiqueta="Sexo" valor={sexo} opciones={[{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }]} onCambio={setSexo} />
          <div className="f"><label htmlFor="ir-talla">Talla (cm)</label><input id="ir-talla" ref={tallaRef} {...casillaNumerica(false)} enterKeyHint="next" autoComplete="off" value={talla} onChange={(e) => setTalla(e.target.value)} /></div>
          <div className="notice acc small" aria-live="polite">{pi ?? "Con sexo y talla se calcula el peso ideal y el volumen corriente por kilo."}</div>
          <div className="small ink2">Vía aérea con que llega</div>
          <Seg ancho etiqueta="Vía aérea" valor={via} opciones={[{ valor: "NATURAL", texto: "Natural" }, { valor: "TET", texto: "TET" }, { valor: "TQT", texto: "TQT" }]} onCambio={elegirVia} />
          {via && via !== "NATURAL" && (
            <div className="fgrid2">
              <div className="f"><label htmlFor="ir-cal">Calibre {via === "TET" ? "del tubo" : "de la TQT"}</label><input id="ir-cal" {...casillaNumerica()} enterKeyHint="next" autoComplete="off" value={calibre} onChange={(e) => setCalibre(e.target.value)} /></div>
              {via === "TET" && <div className="f"><label htmlFor="ir-cm">Fijación <span className="muted">cm en la arcada</span></label><input id="ir-cm" {...casillaNumerica()} enterKeyHint="next" autoComplete="off" value={cm} onChange={(e) => setCm(e.target.value)} /></div>}
            </div>
          )}
          {via === "NATURAL" && <p className="small muted" style={{ margin: 0 }}>Con vía aérea natural se ofrecen oxigenoterapia y VNI.</p>}
          <CamposRem idBase="ir" edad={edad} categoria={categoria} onEdad={setEdad} onCategoria={setCategoria} />
          {error && <div className="notice crit small" role="alert">{error}</div>}
        </div>
        <div className="pie-inf">
          <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn primary">Registrar ingreso</button>
        </div>
      </form>
    </div>
  );
}

/** Edad en años (0 a 120) o null. Se usa solo para elegir el tramo del REM: no se guarda. */
function edadValida(v: string): number | null {
  const n = numero(v);
  return n === null || n < 0 || n > 120 ? null : Math.floor(n);
}

/** Edad (se guarda solo el tramo) y diagnostico REM: lo que el REM 28 necesita del ingreso. */
function CamposRem({ idBase, edad, categoria, onEdad, onCategoria }: { idBase: string; edad: string; categoria: CategoriaRem | ""; onEdad: (v: string) => void; onCategoria: (v: CategoriaRem | "") => void }) {
  return (
    <>
      <div className="small ink2">Para el REM</div>
      <div className="fgrid2">
        <div className="f"><label htmlFor={`${idBase}-edad`}>Edad <span className="muted">años</span></label><input id={`${idBase}-edad`} {...casillaNumerica(false)} enterKeyHint="next" autoComplete="off" value={edad} onChange={(e) => onEdad(e.target.value)} /></div>
        <div className="f"><label htmlFor={`${idBase}-cat`}>Diagnóstico REM</label>
          <select id={`${idBase}-cat`} value={categoria} onChange={(e) => onCategoria(e.target.value as CategoriaRem | "")}>
            <option value="">— elegir —</option>
            {CATEGORIAS_REM.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>La edad se guarda solo como tramo del REM ({edadValida(edad) !== null ? `${rangoDeEdad(edadValida(edad)!)} años` : "p. ej. 60–64"}); no se muestra en el celular.</p>
    </>
  );
}

/** Completa la edad y el diagnostico REM de un paciente ya ingresado (p. ej. antes de este cambio). */
export function CompletarRem({ ep, onCerrar }: { ep: Episodio; onCerrar: () => void }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [edad, setEdad] = useState("");
  const [categoria, setCategoria] = useState<CategoriaRem | "">(ep.categoriaRem ?? "");
  const [error, setError] = useState<string | null>(null);
  const guardar = async (): Promise<void> => {
    const e = ep.rangoEdad !== null && edad.trim() === "" ? null : edadValida(edad);
    if (ep.rangoEdad === null && e === null) return setError("Falta la edad (entre 0 y 120 años).");
    if (edad.trim() !== "" && e === null) return setError("Revisa la edad: entre 0 y 120 años.");
    if (categoria === "") return setError("Elige el diagnóstico REM.");
    await repo.guardarEpisodio({ ...ep, rangoEdad: e === null ? ep.rangoEdad : rangoDeEdad(e), categoriaRem: categoria });
    avisar(`Datos del REM de ${nombreCama(ep.cama)} guardados.`);
    onCerrar();
  };
  return (
    <div className="fondo-flotante centrado">
      <form className="panel-flotante" role="dialog" aria-modal="true" aria-label={`Datos REM ${nombreCama(ep.cama)}`} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <header className="pf-cabeza">
          <b>Datos REM · {nombreCama(ep.cama)}</b>
          <button type="button" className="pf-cerrar" aria-label="Cerrar" onClick={onCerrar}><X size={20} aria-hidden /></button>
        </header>
        <div className="pf-cuerpo">
          {ep.rangoEdad !== null && <p className="small muted" style={{ margin: 0 }}>La edad ya está registrada; escribe una solo si hay que corregirla.</p>}
          <CamposRem idBase="cr" edad={edad} categoria={categoria} onEdad={setEdad} onCategoria={setCategoria} />
          {error && <div className="notice crit small" role="alert">{error}</div>}
        </div>
        <div className="pie-inf">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}
