import { useState } from "react";
import {
  ESCALA_SAS,
  ESTADOS_VIGILIA,
  INFUSIONES,
  alternarDosisLibre,
  calcularGlasgow,
  calcularPam,
  calcularPpc,
  esViaAereaArtificial,
  iniciarInfusion,
  medicionDe,
  sedoanalgesiaActivaEnBorrador,
  suspenderInfusion
} from "@core/index";
import type { Glasgow, IdInfusion, ValorSas } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { CampoNum, Pildora, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { opcionesNumericas } from "./franja";
import type { DescriptorFranja } from "./franja";
import { TarjetaInfusion } from "./TarjetaInfusion";
import type { SegmentoId } from "./pasos";

export function TabConciencia({ ctx, paso }: { ctx: ContextoCama; paso: SegmentoId }) {
  const { ep, ultimo, b, editar } = ctx;
  const avisar = useApp((s) => s.avisar);
  const sedada = sedoanalgesiaActivaEnBorrador(b);
  const artificial = esViaAereaArtificial(ep.viaAereaActual);

  const suspender = (id: IdInfusion): void => {
    const previo = b.infusiones[id];
    editar((y) => suspenderInfusion(y, id));
    avisar(`${INFUSIONES.find((i) => i.id === id)?.nombre ?? "Infusión"} suspendida.`, () =>
      editar((y) => ({ ...y, infusiones: { ...y.infusiones, [id]: previo } }))
    );
  };

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

  const completo = b.glasgow.ocular !== null && b.glasgow.motora !== null && b.glasgow.verbal !== null;
  const calculado = completo ? calcularGlasgow(b.glasgow as Glasgow, ep.viaAereaActual) : null;

  // Sedoanalgesia: lo que esta en curso se ve siempre; el resto se agrega con "+".
  const [abiertos, setAbiertos] = useState<{ sedacion: boolean; agitacion: boolean; bnm: boolean }>({ sedacion: false, agitacion: false, bnm: false });
  const GRUPO_SEDACION: readonly IdInfusion[] = ["fentanilo", "propofol", "midazolam"];
  const GRUPO_AGITACION: readonly IdInfusion[] = ["dexmedetomidina", "lorazepam"];
  const GRUPO_BNM: readonly IdInfusion[] = ["rocuronio", "vecuronio", "atracurio"];
  const tarjeta = (id: IdInfusion): JSX.Element | null => {
    const def = INFUSIONES.find((i) => i.id === id);
    if (!def) return null;
    return (
      <TarjetaInfusion
        key={def.id}
        def={def}
        x={b.infusiones[def.id]}
        ultimo={ultimo}
        onCambio={(p) => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [def.id]: { ...y.infusiones[def.id], ...p } } }))}
        onIniciar={() => editar((y) => iniciarInfusion(y, def.id))}
        onSuspender={() => suspender(def.id)}
        onAlternarLibre={() => editar((y) => alternarDosisLibre(y, def.id))}
      />
    );
  };
  const visibles = (grupo: readonly IdInfusion[], abierto: boolean): IdInfusion[] => grupo.filter((id) => abierto || b.infusiones[id].activa);

  return (
    <>
      {paso === "neuro" && <Neuromonitoreo ctx={ctx} />}
      {paso === "glasgow" && (
        <section>
          <h3>Glasgow</h3>
          <div className="fgrid4">
            <CampoNum clave="gcs-o" etiqueta="Ocular" unidad="1-4" valor={b.glasgow.ocular === null ? "" : String(b.glasgow.ocular)}
              onCambio={(v) => { const n = digito(v, 1, 4); if (n !== undefined) setGlasgow({ ocular: n as Glasgow["ocular"] | null }); }}
              franja={franjaNum("Ocular", [1, 2, 3, 4], b.glasgow.ocular === null ? "" : String(b.glasgow.ocular), (v) => setGlasgow({ ocular: Number(v) as Glasgow["ocular"] })) } />
            {artificial ? (
              <div className="f"><label>Verbal</label><div className="pam mono">NT</div></div>
            ) : (
              <CampoNum clave="gcs-v" etiqueta="Verbal" unidad="1-5" valor={b.glasgow.verbal === null ? "" : String(b.glasgow.verbal)}
                onCambio={(v) => { const n = digito(v, 1, 5); if (n !== undefined) setGlasgow({ verbal: n as Glasgow["verbal"] | null }); }}
                franja={franjaNum("Verbal", [1, 2, 3, 4, 5], b.glasgow.verbal === null ? "" : String(b.glasgow.verbal), (v) => setGlasgow({ verbal: Number(v) as Glasgow["verbal"] })) } />
            )}
            <CampoNum clave="gcs-m" etiqueta="Motora" unidad="1-6" valor={b.glasgow.motora === null ? "" : String(b.glasgow.motora)}
              onCambio={(v) => { const n = digito(v, 1, 6); if (n !== undefined) setGlasgow({ motora: n as Glasgow["motora"] | null }); }}
              franja={franjaNum("Motora", [1, 2, 3, 4, 5, 6], b.glasgow.motora === null ? "" : String(b.glasgow.motora), (v) => setGlasgow({ motora: Number(v) as Glasgow["motora"] })) } />
            <div className="f">
              <label>Glasgow{sedada && calculado ? " · bajo sedación" : ""}</label>
              <div className="pam mono" aria-live="polite">{calculado ? calculado.display : "--"}</div>
            </div>
          </div>
          <div className="fgrid4">
            <CampoNum clave="s5q" etiqueta="S5Q" unidad="0 a 5" previo={ultimo?.s5q ?? null} valor={b.s5q} onCambio={(v) => { const n = digito(v, 0, 5); if (n !== undefined) editar((x) => ({ ...x, s5q: n === null ? "" : String(n) })); }}
              franja={franjaNum("S5Q", [0, 1, 2, 3, 4, 5], b.s5q, (v) => editar((x) => ({ ...x, s5q: v })))} />
          </div>
        </section>
      )}
      {paso === "sas" && (
        <>
          <section>
            <h3>
              Sedoanalgesia <Pildora tipo={sedada ? "acc" : ""}>{sedada ? "Sí" : "No"}</Pildora>
            </h3>
            <div className="stack" style={{ gap: 6 }}>
              {visibles(GRUPO_SEDACION, abiertos.sedacion).map(tarjeta)}
              {visibles(GRUPO_AGITACION, abiertos.agitacion).map(tarjeta)}
            </div>
            <div className="row mt" style={{ flexWrap: "wrap" }}>
              {!abiertos.sedacion && <button type="button" className="btn sm" onClick={() => setAbiertos((a) => ({ ...a, sedacion: true }))}>+ Agregar sedoanalgesia</button>}
              {!abiertos.agitacion && <button type="button" className="btn sm" onClick={() => setAbiertos((a) => ({ ...a, agitacion: true }))}>+ Agregar manejo de agitación</button>}
            </div>
            <p className="small muted mt">Fentanilo, propofol y midazolam; Precedex y lorazepam son para el paciente agitado. Lo que estaba en curso se hereda y se ve siempre.</p>
          </section>

          {sedada ? (
            <section>
              <h3>Escala SAS</h3>
              <div className="row" style={{ alignItems: "end", gap: 12 }}>
                <div style={{ maxWidth: 110 }}>
                <CampoNum clave="sas" etiqueta="SAS" unidad="1 a 7" previo={ultimo?.sas ?? null} valor={b.sas === null ? "" : String(b.sas)}
                  onCambio={(v) => { const n = digito(v, 1, 7); if (n !== undefined) editar((x) => ({ ...x, sas: n as ValorSas | null })); }}
                  franja={franjaNum("SAS", [1, 2, 3, 4, 5, 6, 7], b.sas === null ? "" : String(b.sas), (v) => editar((x) => ({ ...x, sas: Number(v) as ValorSas })))} />
              </div>
                <div className="sas-desc" aria-live="polite">{b.sas === null ? "" : ESCALA_SAS.find((e) => e.val === b.sas)?.label ?? ""}</div>
              </div>
            </section>
          ) : (
            <section>
              <h3>Estado de vigilia</h3>
              <div className="stack" style={{ gap: 6 }}>
                {ESTADOS_VIGILIA.map((v) => (
                  <button key={v.val} type="button" className="chip" style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} aria-pressed={b.vigilia === v.val} onClick={() => editar((x) => ({ ...x, vigilia: v.val }))}>
                    {v.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3>Bloqueo neuromuscular <Pildora tipo={GRUPO_BNM.some((id) => b.infusiones[id].activa) ? "crit" : ""}>{GRUPO_BNM.some((id) => b.infusiones[id].activa) ? "En curso" : "No"}</Pildora></h3>
            <div className="stack" style={{ gap: 6 }}>{visibles(GRUPO_BNM, abiertos.bnm).map(tarjeta)}</div>
            {!abiertos.bnm && <div className="row mt"><button type="button" className="btn sm" onClick={() => setAbiertos((a) => ({ ...a, bnm: true }))}>+ Agregar bloqueo neuromuscular</button></div>}
          </section>
        </>
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
