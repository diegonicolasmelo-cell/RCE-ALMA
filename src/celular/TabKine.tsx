import {
  MOTIVOS_CONTRAINDICACION_MOTORA,
  NIVELES_TERAPIA_FISICA,
  apkDelTurno,
  buscarProfesional,
  esViaAereaArtificial,
  HALLAZGOS_AUSCULTACION,
  apkVigente,
  criteriosNoCumplidos,
  firmarApk,
  inicialesDe,
  marcasPorDefecto,
  turnoDe
} from "@core/index";
import type { HallazgoAuscultacion } from "@core/index";
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

  // La APK es de cada kinesiologo: la que firmaste en este turno vale para todos tus controles.
  const turnoActual = turnoDe(ahora).clave;
  const mia = apkVigente(apks, ep.id, ahora, rutAutor);
  const deOtro = apkDelTurno(apks.filter((a) => a.rutAutor !== rutAutor), ep.id, turnoActual);
  const noCumple = mia?.resultado === "NO_CUMPLE";

  const firmar = async (): Promise<void> => {
    const prof = buscarProfesional(rutAutor);
    const v = firmarApk({
      id: nuevoId(),
      episodioId: ep.id,
      rutAutor,
      siglas: inicialesDe(prof?.nombre ?? ""),
      ahora: new Date(),
      // Todo en 1; lo invasivo y la alimentacion quedan N/A si no hay via aerea artificial.
      marcas: marcasPorDefecto(ep.viaAereaActual)
    });
    await repo.firmarApk(v);
    avisar("APK firmada. Vale para todos tus controles de este turno.");
  };

  const alternarHallazgo = (h: HallazgoAuscultacion): void =>
    editar((x) => ({ ...x, auscultacion: x.auscultacion.includes(h) ? x.auscultacion.filter((y) => y !== h) : [...x.auscultacion, h] }));

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
          <h3>Auscultación y secreciones</h3>
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <div className="small ink2">Auscultación</div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }} role="group" aria-label="Auscultación">
                {HALLAZGOS_AUSCULTACION.map((h) => (
                  <button key={h.val} type="button" className="chip" style={{ fontFamily: "var(--font-ui)" }} aria-pressed={b.auscultacion.includes(h.val)} onClick={() => alternarHallazgo(h.val)}>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            {FILAS.map((fila) => (
              <div key={fila.clave}>
                <div className="small ink2">{fila.titulo}</div>
                <Fichas etiqueta={fila.titulo} valor={b[fila.clave]} opciones={fila.opciones} onCambio={(v) => sec(fila.clave, v as AspectoSecreciones & ReologiaSecreciones & CantidadSecreciones)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {paso === "apk" && (
        <section>
          <h3>Pauta APK</h3>
          {mia ? (
            <Aviso tipo={noCumple ? "crit" : "good"}>
              <b>{noCumple ? "APK que no cumple" : "APK firmada"} · {mia.fecha.split("-").reverse().join("/")} {mia.hora} · {mia.siglas}</b>
              <br />
              <span className="small">{noCumple ? `No cumple: ${criteriosNoCumplidos(mia).join("; ")}.` : "Vale para todos tus controles de este turno."}</span>
            </Aviso>
          ) : (
            <>
              {deOtro && <div style={{ marginBottom: 8 }}><Aviso tipo="warn" pequeno>Este turno ya la firmó {nombreProfesional(deOtro.rutAutor)} ({deOtro.hora}). Cada kinesiólogo firma la suya.</Aviso></div>}
              <button type="button" className="btn primary grande" onClick={() => void firmar()}>Firmar APK</button>
              <p className="small muted mt">
                Queda con la fecha, la hora y tus siglas ({nombreProfesional(rutAutor)}), y completa la hoja de papel de este paciente. Todo en 1{esViaAereaArtificial(ep.viaAereaActual) ? "" : "; lo invasivo y la alimentación quedan N/A (sin vía aérea artificial)"}.
              </p>
            </>
          )}
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
