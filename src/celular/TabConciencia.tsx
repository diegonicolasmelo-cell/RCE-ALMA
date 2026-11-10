import {
  ESCALA_SAS,
  ESTADOS_VIGILIA,
  calcularPam,
  calcularPpc,
  esViaAereaArtificial,
  medicionDe,
  sedoanalgesiaActivaEnBorrador
} from "@core/index";
import type { Glasgow, ValorSas } from "@core/index";
import { useServicios } from "../app/contexto";
import { CampoNum, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { opcionesNumericas } from "./franja";
import type { DescriptorFranja } from "./franja";
import type { SegmentoId } from "./pasos";

export function TabConciencia({ ctx, paso }: { ctx: ContextoCama; paso: SegmentoId }) {
  const { ep, b, editar } = ctx;
  const sedada = sedoanalgesiaActivaEnBorrador(b);
  const artificial = esViaAereaArtificial(ep.viaAereaActual);

  /** Acepta solo un digito dentro del rango; el resto se ignora al teclear. */
  const digito = (v: string, min: number, max: number): number | null | undefined => {
    if (v.trim() === "") return null;
    const n = Number(v.trim().slice(-1));
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  };
  const setGlasgow = (parcial: Partial<typeof b.glasgow>): void =>
    editar((x) => {
      const g = { ...x.glasgow, ...parcial };
      // Con via artificial el verbal no es testeable (NT): queda fijo y no se pide.
      return { ...x, glasgow: artificial ? { ...g, verbal: 1 } : g };
    });
  const franjaNum = (etiqueta: string, valores: readonly number[], actual: string, elegir: (v: string) => void) => (): DescriptorFranja => ({
    etiqueta,
    opciones: opcionesNumericas(valores, actual),
    onElegir: elegir
  });


  return (
    <>
      {paso === "neuro" && <Neuromonitoreo ctx={ctx} />}
      {paso === "glasgow" && (
        <section aria-label="Glasgow">
          <div className="fila-hoja">
            <label htmlFor="in-gcs-o">Glasgow <span className="muted">O · V · M</span></label>
            <div className="gcs-tres">
              <span><small>O</small><CampoNum soloCasilla clave="gcs-o" etiqueta="Ocular" ariaLabel="Glasgow ocular, 1 a 4" valor={b.glasgow.ocular === null ? "" : String(b.glasgow.ocular)}
                onCambio={(v) => { const n = digito(v, 1, 4); if (n !== undefined) setGlasgow({ ocular: n as Glasgow["ocular"] | null }); }}
                franja={franjaNum("Ocular", [1, 2, 3, 4], b.glasgow.ocular === null ? "" : String(b.glasgow.ocular), (v) => setGlasgow({ ocular: Number(v) as Glasgow["ocular"] }))} /></span>
              {artificial ? (
                <span><small>V</small><b className="gcs-t" title="Con vía aérea artificial el verbal no se evalúa" aria-label="Verbal T">T</b></span>
              ) : (
                <span><small>V</small><CampoNum soloCasilla clave="gcs-v" etiqueta="Verbal" ariaLabel="Glasgow verbal, 1 a 5" valor={b.glasgow.verbal === null ? "" : String(b.glasgow.verbal)}
                  onCambio={(v) => { const n = digito(v, 1, 5); if (n !== undefined) setGlasgow({ verbal: n as Glasgow["verbal"] | null }); }}
                  franja={franjaNum("Verbal", [1, 2, 3, 4, 5], b.glasgow.verbal === null ? "" : String(b.glasgow.verbal), (v) => setGlasgow({ verbal: Number(v) as Glasgow["verbal"] }))} /></span>
              )}
              <span><small>M</small><CampoNum soloCasilla clave="gcs-m" etiqueta="Motora" ariaLabel="Glasgow motor, 1 a 6" valor={b.glasgow.motora === null ? "" : String(b.glasgow.motora)}
                onCambio={(v) => { const n = digito(v, 1, 6); if (n !== undefined) setGlasgow({ motora: n as Glasgow["motora"] | null }); }}
                franja={franjaNum("Motora", [1, 2, 3, 4, 5, 6], b.glasgow.motora === null ? "" : String(b.glasgow.motora), (v) => setGlasgow({ motora: Number(v) as Glasgow["motora"] }))} /></span>
            </div>
          </div>
        </section>
      )}
      {paso === "sas" && (
        <section aria-label={sedada ? "SAS" : "Estado de vigilia"}>
          {sedada ? (
            <div className="fila-hoja">
              <label htmlFor="in-sas">SAS <span className="muted">1-7</span><span className="ayuda sas-desc" aria-live="polite">{b.sas === null ? "" : ESCALA_SAS.find((e) => e.val === b.sas)?.label ?? ""}</span></label>
              <CampoNum soloCasilla clave="sas" etiqueta="SAS" ariaLabel="SAS, 1 a 7" valor={b.sas === null ? "" : String(b.sas)}
                onCambio={(v) => { const n = digito(v, 1, 7); if (n !== undefined) editar((x) => ({ ...x, sas: n as ValorSas | null })); }}
                franja={franjaNum("SAS", [1, 2, 3, 4, 5, 6, 7], b.sas === null ? "" : String(b.sas), (v) => editar((x) => ({ ...x, sas: Number(v) as ValorSas })))} />
            </div>
          ) : (
            <div className="fila-hoja vigilia">
              <label>Vigilia <span className="ayuda">sin sedoanalgesia en curso</span></label>
              <select aria-label="Estado de vigilia" value={b.vigilia ?? ""} onChange={(e) => editar((x) => ({ ...x, vigilia: (e.target.value || null) as typeof x.vigilia }))}>
                <option value="">—</option>
                {ESTADOS_VIGILIA.map((v) => <option key={v.val} value={v.val}>{v.label}</option>)}
              </select>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Neuromonitoreo({ ctx }: { ctx: ContextoCama }) {
  const { ep, b, editar } = ctx;
  const { repo } = useServicios();
  const m = ep.monitoreo;

  const alternar = (clave: keyof typeof m): void => {
    void repo.guardarEpisodio({ ...ep, monitoreo: { ...m, [clave]: !m[clave] } });
  };

  const pam = calcularPam(medicionDe(b.pas), medicionDe(b.pad));
  const ppc = calcularPpc(pam, medicionDe(b.neuro.pic));
  const sinFranja = (etiqueta: string) => (): DescriptorFranja => ({ etiqueta, opciones: [], onElegir: () => undefined });
  const setNeuro = (parcial: Partial<typeof b.neuro>): void => editar((x) => ({ ...x, neuro: { ...x.neuro, ...parcial } }));

  return (
    <section>
      <h3>Monitoreo del episodio</h3>
      <div className="row" style={{ gap: 6 }}>
        {([
          ["capnografia", "Capnografía"],
          ["pic", "PIC"],
          ["dve", "DVE"]
        ] as const).map(([k, t]) => (
          <button key={k} type="button" className="chip" style={{ fontFamily: "var(--font-ui)" }} aria-pressed={m[k]} onClick={() => alternar(k)}>
            {t}
          </button>
        ))}
      </div>
      <p className="small muted mt">Se define una vez por episodio; el control solo pide lo que está activo.</p>

      {(m.capnografia || m.pic || m.dve) && (
        <div className="stack mt" style={{ gap: 8 }}>
          <div className="fgrid">
            {m.capnografia && (
              <CampoNum clave="neuro:etco2" etiqueta="EtCO₂" unidad="mmHg" valor={b.neuro.etco2} onCambio={(v) => setNeuro({ etco2: v })} franja={sinFranja("EtCO₂")} />
            )}
            {m.pic && (
              <CampoNum clave="neuro:pic" etiqueta="PIC" unidad="mmHg" valor={b.neuro.pic} onCambio={(v) => setNeuro({ pic: v })} franja={sinFranja("PIC")} />
            )}
            {m.pic && (
              <div className="f">
                <label>PPC (PAM − PIC)</label>
                <div className="pam mono">{ppc ?? "--"}</div>
              </div>
            )}
            {m.dve && (
              <CampoNum clave="neuro:dve" etiqueta="Altura DVE" unidad="cmH₂O" valor={b.neuro.dveAltura} onCambio={(v) => setNeuro({ dveAltura: v })} franja={sinFranja("Altura DVE")} />
            )}
          </div>
          {m.dve && (
            <Seg etiqueta="Estado de la DVE" ancho valor={b.neuro.dveAbierta} opciones={[{ valor: true, texto: "DVE abierta" }, { valor: false, texto: "DVE cerrada" }]} onCambio={(v) => setNeuro({ dveAbierta: v })} />
          )}
        </div>
      )}
    </section>
  );
}
