import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { OBJETIVOS_VT_ML_KG, calcularPbw, equiposDeLaCama, equiposParaVia, nombreCama, problemaEquipos, volumenObjetivoMl } from "@core/index";
import type { EquipoEnSala, Episodio, Sexo, ViaAerea } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { nuevoId } from "../app/util";
import { guardarMeta } from "../datos/db";
import { claveMisCamas } from "./ElegirCamas";
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
  const { repo, db } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const misCamas = useApp((s) => s.misCamas);
  const avisar = useApp((s) => s.avisar);
  const irA = useApp((s) => s.irA);
  const [via, setVia] = useState<ViaAerea | null>(null);
  const [calibre, setCalibre] = useState("");
  const [cm, setCm] = useState("");
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const [talla, setTalla] = useState("");
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
    const ep: Episodio = {
      id: nuevoId(),
      cama,
      // Edad y diagnostico los completa el PC junto con la identidad.
      rangoEdad: null,
      sexo,
      tallaCm: t,
      tallaOrigen: "ESTIMADA",
      categoriaRem: null,
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
    }
    avisar(`${nombreCama(cama)} ingresada. Sigue con el control de ingreso; el nombre y el RUT se agregan en el PC.`);
    irA("cama", ep.id);
  };

  const pi = textoPesoIdeal(t, sexo);
  return (
    <div className="fondo-flotante">
      <form className="panel-flotante" role="dialog" aria-modal="true" aria-label={`Ingreso ${nombreCama(cama)}`} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <header className="pf-cabeza">
          <b>Ingreso · {nombreCama(cama)}</b>
          <button type="button" className="pf-cerrar" aria-label="Cerrar sin ingresar" onClick={onCancelar}><X size={20} aria-hidden /></button>
        </header>
        <div className="pf-cuerpo">
          <p className="small muted" style={{ margin: 0 }}>Nombre, RUT y edad se ingresan en el PC de la estación. Aquí se registra la vía aérea con que llega y el sexo y la talla para el peso ideal.</p>
          <div className="small ink2">Sexo</div>
          <Seg ancho etiqueta="Sexo" valor={sexo} opciones={[{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }]} onCambio={setSexo} />
          <div className="f"><label htmlFor="ir-talla">Talla (cm)</label><input id="ir-talla" {...casillaNumerica(false)} enterKeyHint="next" autoComplete="off" value={talla} onChange={(e) => setTalla(e.target.value)} /></div>
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
          {via && (
            <>
              <div className="small ink2">Equipos de la sala</div>
              <p className="small muted" style={{ margin: 0 }}>El ventilador vive en la cama: regístralo siempre, esté en uso o no.{equipos?.length ? " Viene lo que quedó en esta sala." : ""}</p>
              <EditorEquipos idBase="ir-eq" lista={equipos ?? []} via={via} onCambio={setEquipos} />
            </>
          )}
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
