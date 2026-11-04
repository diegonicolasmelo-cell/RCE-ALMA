import { useState } from "react";
import {
  MOTIVOS_CONTRAINDICACION_MOTORA,
  NIVELES_TERAPIA_FISICA,
  apkDelTurno,
  buscarProfesional,
  esViaAereaArtificial,
  CRITERIOS_APK,
  LEYENDA_APK,
  criteriosNoCumplidos,
  firmarApk,
  inicialesDe,
  marcasPorDefecto,
  turnoAnterior,
  turnoDe
} from "@core/index";
import type { MarcaApk } from "@core/index";
import type { AspectoSecreciones, CantidadSecreciones, ReologiaSecreciones } from "@core/index";
import { useApp } from "../app/store";
import type { SegmentoId } from "./pasos";
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

export function TabKine({ ctx, paso }: { ctx: ContextoCama; paso: SegmentoId }) {
  const { ep, b, editar, apks, ahora, rutAutor } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const turno = turnoDe(ahora);
  const apk = apkDelTurno(apks, ep.id, turno.clave);
  const previa = apkDelTurno(apks, ep.id, turnoAnterior(ahora).clave);
  const noCumple = apk?.resultado === "NO_CUMPLE";
  const [marcas, setMarcas] = useState<MarcaApk[]>(() => marcasPorDefecto(ep.viaAereaActual));
  const [iniciales, setIniciales] = useState(() => inicialesDe(buscarProfesional(rutAutor)?.nombre ?? ""));

  const firmar = async (): Promise<void> => {
    if (iniciales.trim() === "") return avisar("Escribe tus siglas: van en la última fila de la hoja.");
    const v = firmarApk({ id: nuevoId(), episodioId: ep.id, rutAutor, siglas: iniciales, ahora: new Date(), marcas });
    await repo.firmarApk(v);
    if (v.resultado === "NO_CUMPLE") editar((x) => ({ ...x, kineRealizada: false, aspiracion: "NO" }));
    else avisar("APK de este turno firmada. Vale para los controles siguientes.");
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
      {paso === "kine" && (
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
      )}
      {paso === "apk" && (
      <section>
        <h3>Pauta APK <span className="small muted" style={{ textTransform: "none", letterSpacing: 0 }}>· cotejo previo a la KTR</span></h3>
        <p className="small ink2">Una por turno, dos al día, por profesionales distintos. Al firmar se llena una columna de la hoja de papel, con fecha y tus siglas, y queda archivada.</p>
        {previa && (
          <div className="small muted mt">
            Turno anterior: {previa.resultado === "CUMPLE" ? "firmada" : "no cumple"} {previa.hora} · {nombreProfesional(previa.rutAutor)}
          </div>
        )}
        <div className="mt">
          {apk ? (
            <Aviso tipo={apk.resultado === "CUMPLE" ? "good" : "crit"}>
              <b>Este turno: {apk.resultado === "CUMPLE" ? "firmada" : "no cumple"} · {apk.fecha.split("-").reverse().join("/")} {apk.hora} · {apk.siglas}</b>
              {noCumple && <><br /><span className="small">No cumple: {criteriosNoCumplidos(apk).join("; ")}. Kinesiterapia respiratoria diferida.</span></>}
            </Aviso>
          ) : (
            <>
              {b.kineRealizada && <div style={{ marginBottom: 8 }}><Aviso tipo="warn" pequeno>Hiciste kinesiterapia respiratoria: falta firmar la APK de este turno.</Aviso></div>}
              <div className="stack" style={{ gap: 10 }}>
                {CRITERIOS_APK.map((c, i) => (
                  <div key={c.texto}>
                    <div className="small ink2">{c.texto}</div>
                    <Seg ancho etiqueta={c.texto} valor={marcas[i] ?? null}
                      opciones={[{ valor: "1" as MarcaApk, texto: "1 · Sí" }, { valor: "NA" as MarcaApk, texto: "N/A" }, { valor: "0" as MarcaApk, texto: "0 · No" }]}
                      onCambio={(v) => setMarcas((m) => m.map((x, j) => (j === i ? v : x)))} />
                  </div>
                ))}
                <label className="small ink2">
                  Iniciales del profesional que ejecuta KTR
                  <input style={{ marginTop: 4, maxWidth: 120, textTransform: "uppercase" }} value={iniciales} maxLength={6} onChange={(e) => setIniciales(e.target.value)} aria-label="Iniciales del profesional" />
                </label>
                <p className="small muted">{LEYENDA_APK}</p>
                <button type="button" className="btn primary" onClick={() => void firmar()}>Firmar APK</button>
              </div>
            </>
          )}
        </div>
        {!esViaAereaArtificial(ep.viaAereaActual) && !apk && <p className="small muted mt">Vía aérea natural: las filas de lo invasivo y la alimentación parten en N/A; cámbialas si corresponde.</p>}
      </section>
      )}
      {paso === "tf" && (
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
      )}
    </>
  );
}
