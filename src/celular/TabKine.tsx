import { useState } from "react";
import {
  MOTIVOS_CONTRAINDICACION_MOTORA,
  NIVELES_TERAPIA_FISICA,
  apkDelTurno,
  buscarProfesional,
  esViaAereaArtificial,
  etiquetaPerfil,
  firmarApkCumple,
  firmarApkNoCumple,
  pautaApk,
  textoAsercionApk,
  turnoAnterior,
  turnoDe
} from "@core/index";
import type { AspectoSecreciones, CantidadSecreciones, ReologiaSecreciones } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { nuevoId } from "../app/util";
import { Aviso, CampoNum, Fichas, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { opcionesNumericas } from "./franja";
import type { DescriptorFranja } from "./franja";

const nombreProfesional = (rut: string): string => {
  const p = buscarProfesional(rut);
  return p ? `Klgo. ${p.nombre}` : `RUT ${rut}`;
};

export function TabKine({ ctx }: { ctx: ContextoCama }) {
  const { ep, b, editar, apks, ahora, rutAutor } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState(false);
  const [criterios, setCriterios] = useState<string[]>([]);

  const turno = turnoDe(ahora);
  const apk = apkDelTurno(apks, ep.id, turno.clave);
  const previa = apkDelTurno(apks, ep.id, turnoAnterior(ahora).clave);
  const noCumple = apk?.resultado === "NO_CUMPLE";
  const pauta = pautaApk(ep.viaAereaActual);
  const datosFirma = () => ({ id: nuevoId(), episodioId: ep.id, via: ep.viaAereaActual, rutAutor, ahora: new Date() });

  const firmar = async (): Promise<void> => {
    await repo.firmarApk(firmarApkCumple(datosFirma()));
    avisar("APK de este turno firmada. Vale para los controles siguientes.");
  };
  const firmarNo = async (): Promise<void> => {
    if (criterios.length === 0) return avisar("Marca qué criterio no se cumple.");
    await repo.firmarApk(firmarApkNoCumple(datosFirma(), criterios));
    editar((x) => ({ ...x, kineRealizada: false, aspiracion: "NO" }));
    setAbierto(false);
    setCriterios([]);
  };

  const sec = <K extends "aspecto" | "reologia" | "cantidad">(clave: K, valor: NonNullable<(typeof b)[K]>): void =>
    editar((x) => ({ ...x, [clave]: x[clave] === valor ? null : valor }));

  const franjaIms = (): DescriptorFranja => ({
    etiqueta: "Nivel IMS",
    opciones: opcionesNumericas([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], b.ims),
    onElegir: (v) => editar((x) => ({ ...x, ims: v }))
  });

  const FILAS: { titulo: string; clave: "aspecto" | "reologia" | "cantidad"; opciones: readonly { valor: string; texto: string }[] }[] = [
    { titulo: "Secreciones · calidad (aspecto)", clave: "aspecto", opciones: [{ valor: "MUCOSA", texto: "Mucosa" }, { valor: "MUCOPURULENTA", texto: "Mucopurulenta" }, { valor: "PURULENTA", texto: "Purulenta" }, { valor: "HEMATICA", texto: "Hemática" }] },
    { titulo: "Secreciones · reología", clave: "reologia", opciones: [{ valor: "FLUIDA", texto: "Fluida" }, { valor: "ESPESA", texto: "Espesa" }, { valor: "ADHERENTE", texto: "Adherente" }] },
    { titulo: "Secreciones · cantidad", clave: "cantidad", opciones: [{ valor: "ESCASA", texto: "Escasa" }, { valor: "MODERADA", texto: "Moderada" }, { valor: "ABUNDANTE", texto: "Abundante" }] }
  ];

  return (
    <>
      <section>
        <h3>Kinesiterapia respiratoria</h3>
        <Seg ancho etiqueta="Kinesiterapia respiratoria" valor={b.kineRealizada} opciones={[{ valor: true, texto: "Sí", deshabilitada: noCumple }, { valor: false, texto: "No" }]}
          onCambio={(v) => editar((x) => ({ ...x, kineRealizada: v, ...(v ? {} : { aspiracion: "NO" as const, aspecto: null, reologia: null, cantidad: null }) }))} />
        {noCumple && <div className="mt"><Aviso tipo="crit" pequeno>La APK de este turno no cumple: la kinesiterapia respiratoria queda diferida.</Aviso></div>}
        {b.kineRealizada && (
          <div className="stack mt" style={{ gap: 10 }}>
            <div>
              <div className="small ink2">Aspiración</div>
              <Fichas etiqueta="Aspiración" valor={b.aspiracion} opciones={[{ valor: "NO", texto: "No" }, { valor: "TRACHCARE", texto: "TrachCare" }, { valor: "SET", texto: "Set" }]} onCambio={(v) => editar((x) => ({ ...x, aspiracion: v }))} />
            </div>
            {FILAS.map((fila) => (
              <div key={fila.clave}>
                <div className="small ink2">{fila.titulo}</div>
                <Fichas etiqueta={fila.titulo} valor={b[fila.clave]} opciones={fila.opciones} onCambio={(v) => sec(fila.clave, v as AspectoSecreciones & ReologiaSecreciones & CantidadSecreciones)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>
          Pauta APK <span className="small muted" style={{ textTransform: "none", letterSpacing: 0 }}>· {etiquetaPerfil(pauta.perfil)}</span>
        </h3>
        <p className="small ink2">Se firma una vez por turno, dos al día, por profesionales distintos. Lo que firmes ahora vale para los controles siguientes de este turno.</p>
        {previa && (
          <div className="small muted mt">
            Turno anterior: {previa.resultado === "CUMPLE" ? "firmada" : "no cumple"} {previa.hora} · {nombreProfesional(previa.rutAutor)}
          </div>
        )}
        <div className="mt">
          {apk ? (
            <Aviso tipo={apk.resultado === "CUMPLE" ? "good" : "crit"}>
              <b>Este turno: {apk.resultado === "CUMPLE" ? "firmada" : "no cumple"} · {apk.hora}</b>
              <br />
              <span className="small">{textoAsercionApk(apk, nombreProfesional(apk.rutAutor))}</span>
            </Aviso>
          ) : (
            <>
              {b.kineRealizada && <div style={{ marginBottom: 8 }}><Aviso tipo="warn" pequeno>Hiciste kinesiterapia respiratoria: falta firmar la APK de este turno.</Aviso></div>}
              <details className="crit-list">
                <summary>Ver los {pauta.criterios.length} criterios</summary>
                <ul>{pauta.criterios.map((c) => <li key={c}>{c}</li>)}</ul>
              </details>
              <div className="row mt">
                <button type="button" className="btn primary" onClick={() => void firmar()}>Firmar: cumple la pauta</button>
                <button type="button" className="btn" onClick={() => setAbierto((a) => !a)}>Un criterio no cumple</button>
              </div>
              {abierto && (
                <div className="stack mt" style={{ gap: 2 }}>
                  {pauta.criterios.map((c) => (
                    <label key={c} className="chk">
                      <input type="checkbox" checked={criterios.includes(c)} onChange={(e) => setCriterios((l) => (e.target.checked ? [...l, c] : l.filter((x) => x !== c)))} /> {c}
                    </label>
                  ))}
                  <button type="button" className="btn danger mt" onClick={() => void firmarNo()}>Registrar “no cumple”</button>
                </div>
              )}
            </>
          )}
        </div>
        <p className="small muted mt">Un toque no marca criterios uno por uno: deja <b>una declaración firmada</b>. Si un criterio falla, se nombra cuál.</p>
        {!esViaAereaArtificial(ep.viaAereaActual) && <p className="small muted">Vía aérea natural: se aplican los criterios del perfil natural.</p>}
      </section>

      <section>
        <h3>
          Terapia física <span className="small muted" style={{ textTransform: "none", letterSpacing: 0 }}>· KTM + IMT</span>
        </h3>
        <Seg ancho etiqueta="Terapia física" valor={b.terapiaFisica} opciones={[{ valor: "REALIZADA", texto: "Realizada" }, { valor: "NO", texto: "No" }, { valor: "CONTRAINDICADA", texto: "Contraindicada" }]} onCambio={(v) => editar((x) => ({ ...x, terapiaFisica: v }))} />
        {b.terapiaFisica === "REALIZADA" && (
          <div className="stack mt" style={{ gap: 8 }}>
            {NIVELES_TERAPIA_FISICA.map((n) => (
              <div key={n.nivel}>
                <div className="small ink2" style={{ fontWeight: 700 }}>{n.titulo}</div>
                {n.items.map((it) => (
                  <label key={it} className="chk">
                    <input type="checkbox" checked={b.actividades.includes(it)} onChange={(e) => editar((x) => ({ ...x, actividades: e.target.checked ? [...x.actividades, it] : x.actividades.filter((a) => a !== it) }))} /> {it}
                  </label>
                ))}
              </div>
            ))}
            <div style={{ maxWidth: 160 }}>
              <CampoNum clave="ims" etiqueta="Nivel IMS" unidad="0 a 10" valor={b.ims} onCambio={(v) => editar((x) => ({ ...x, ims: v }))} franja={franjaIms} />
            </div>
          </div>
        )}
        {b.terapiaFisica === "CONTRAINDICADA" && (
          <div className="stack mt" style={{ gap: 6 }}>
            {MOTIVOS_CONTRAINDICACION_MOTORA.map((m) => (
              <button key={m} type="button" className="chip" style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} aria-pressed={b.motivoContraindicacion === m} onClick={() => editar((x) => ({ ...x, motivoContraindicacion: m }))}>
                {m}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
