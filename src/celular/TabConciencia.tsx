import {
  ESCALA_SAS,
  ESTADOS_VIGILIA,
  FARMACOS_BNM,
  INFUSIONES,
  alternarDosisLibre,
  bnmVigente,
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
import { Aviso, CampoNum, Fichas, Pildora, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { opcionesNumericas } from "./franja";
import type { DescriptorFranja } from "./franja";
import { baseEvento } from "./eventos-ui";
import { TarjetaInfusion } from "./TarjetaInfusion";
import type { PasoId } from "./pasos";

export function TabConciencia({ ctx, paso }: { ctx: ContextoCama; paso: PasoId }) {
  const { ep, ultimo, b, editar, eventos } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const bnm = bnmVigente(eventos)
    ? [...eventos].filter((e) => e.tipo === "INICIO_BNM").sort((a, c) => a.registradoEn.localeCompare(c.registradoEn)).at(-1) ?? null
    : null;
  const sedada = sedoanalgesiaActivaEnBorrador(b);
  const artificial = esViaAereaArtificial(ep.viaAereaActual);

  const suspender = (id: IdInfusion): void => {
    const previo = b.infusiones[id];
    editar((y) => suspenderInfusion(y, id));
    avisar(`${INFUSIONES.find((i) => i.id === id)?.nombre ?? "Infusión"} suspendida.`, () =>
      editar((y) => ({ ...y, infusiones: { ...y.infusiones, [id]: previo } }))
    );
  };

  const setGlasgow = (parcial: Partial<typeof b.glasgow>): void =>
    editar((x) => {
      const g = { ...x.glasgow, ...parcial };
      // Con via artificial el verbal no es testeable (NT): queda fijo y no se pide.
      return { ...x, glasgow: artificial ? { ...g, verbal: 1 } : g };
    });

  const completo = b.glasgow.ocular !== null && b.glasgow.motora !== null && b.glasgow.verbal !== null;
  const calculado = completo ? calcularGlasgow(b.glasgow as Glasgow, ep.viaAereaActual) : null;

  return (
    <>
      {paso === "neuro" && <Neuromonitoreo ctx={ctx} />}
      {paso === "glasgow" && (
      <section>
        <h3>Glasgow</h3>
        <div className="stack" style={{ gap: 8 }}>
          <div>
            <div className="small ink2">Ocular</div>
            <Fichas etiqueta="Ocular" valor={b.glasgow.ocular} opciones={[4, 3, 2, 1].map((n) => ({ valor: n as 1 | 2 | 3 | 4, texto: String(n) }))} onCambio={(v) => setGlasgow({ ocular: v })} />
          </div>
          <div>
            <div className="small ink2">Verbal</div>
            {artificial ? (
              <Pildora>NT · vía aérea artificial</Pildora>
            ) : (
              <Fichas etiqueta="Verbal" valor={b.glasgow.verbal} opciones={[5, 4, 3, 2, 1].map((n) => ({ valor: n as 1 | 2 | 3 | 4 | 5, texto: String(n) }))} onCambio={(v) => setGlasgow({ verbal: v })} />
            )}
          </div>
          <div>
            <div className="small ink2">Motora</div>
            <Fichas etiqueta="Motora" valor={b.glasgow.motora} opciones={[6, 5, 4, 3, 2, 1].map((n) => ({ valor: n as 1 | 2 | 3 | 4 | 5 | 6, texto: String(n) }))} onCambio={(v) => setGlasgow({ motora: v })} />
          </div>
        </div>
        {calculado && (
          <p className="small ink2 mt">
            <b className="mono">{calculado.completo}</b>
            {sedada && " · se registra bajo sedación"}
          </p>
        )}
        <div className="mt" style={{ maxWidth: 160 }}>
          <CampoNum clave="s5q" etiqueta="S5Q" unidad="0 a 5" valor={b.s5q} onCambio={(v) => editar((x) => ({ ...x, s5q: v }))} franja={() => ({ etiqueta: "S5Q", opciones: opcionesNumericas([0, 1, 2, 3, 4, 5], b.s5q), onElegir: (v) => editar((x) => ({ ...x, s5q: v })) })} />
        </div>
        {sedada && (
          <div className="mt">
            <Aviso tipo="warn" pequeno>El Glasgow con sedación en curso no es lo correcto, pero así se trabaja: la nota lo deja marcado "bajo sedación".</Aviso>
          </div>
        )}
      </section>
      )}
      {paso === "sas" && (
      <section>
        <h3>{sedada ? "Escala SAS" : "Estado de vigilia"}</h3>
        {sedada ? (
          <>
            <div className="sas">
              {ESCALA_SAS.map((s) => (
                <button key={s.val} type="button" className="chip" aria-pressed={b.sas === s.val} onClick={() => editar((x) => ({ ...x, sas: s.val as ValorSas }))}>
                  {s.val}
                </button>
              ))}
            </div>
            <p className="small ink2 mt">{b.sas ? `${b.sas} · ${ESCALA_SAS.find((s) => s.val === b.sas)?.label}` : "Hay sedación en curso: se pide SAS."}</p>
          </>
        ) : (
          <>
            <div className="stack" style={{ gap: 6 }}>
              {ESTADOS_VIGILIA.map((v) => (
                <button key={v.val} type="button" className="chip" style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} aria-pressed={b.vigilia === v.val} onClick={() => editar((x) => ({ ...x, vigilia: v.val }))}>
                  {v.label}
                </button>
              ))}
            </div>
            <p className="small muted mt">Sin sedación en curso: se pide estado de vigilia.</p>
          </>
        )}
      </section>
      )}
      {paso === "sedacion" && (
      <>
      <section>
        <h3>
          Sedoanalgesia <Pildora tipo={sedada ? "acc" : ""}>{sedada ? "Sí" : "No"}</Pildora>
        </h3>
        <div className="stack" style={{ gap: 6 }}>
          {INFUSIONES.filter((i) => i.grupo === "SEDANTE").map((def) => (
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
          ))}
        </div>
        <p className="small muted mt">Lo que estaba en curso se hereda. Iniciar abre el teclado para el escalón; Suspender lo deja en cero.</p>
      </section>

      <section>
        <h3>Bloqueo neuromuscular {bnm ? <Pildora tipo="crit">En curso</Pildora> : <Pildora>No</Pildora>}</h3>
        {bnm ? (
          <div className="row">
            <span className="small ink2">{bnm.tipo === "INICIO_BNM" ? bnm.farmaco : ""} desde las {bnm.hora}</span>
            <button type="button" className="btn stop" onClick={() => void repo.registrarEvento({ ...baseEvento(ep, ctx.rutAutor, new Date()), tipo: "FIN_BNM" }).then(() => avisar("Bloqueo neuromuscular suspendido."))}>Suspender</button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <div className="small ink2">Iniciar con</div>
            <div className="row">
              {FARMACOS_BNM.map((f) => (
                <button key={f} type="button" className="btn play" onClick={() => void repo.registrarEvento({ ...baseEvento(ep, ctx.rutAutor, new Date()), tipo: "INICIO_BNM", farmaco: f }).then(() => avisar(`Bloqueo neuromuscular iniciado (${f}).`))}>{f}</button>
              ))}
            </div>
          </div>
        )}
      </section>
      </>
      )}
    </>
  );
}

function Neuromonitoreo({ ctx }: { ctx: ContextoCama }) {
  const { ep, b, editar, ultimo } = ctx;
  const { repo } = useServicios();
  const m = ep.monitoreo;

  const alternar = (clave: keyof typeof m): void => {
    void repo.guardarEpisodio({ ...ep, monitoreo: { ...m, [clave]: !m[clave] } });
  };

  const pam = calcularPam(medicionDe(b.pas), medicionDe(b.pad));
  const ppc = calcularPpc(pam, medicionDe(b.neuro.pic));
  const sinFranja = (etiqueta: string) => (): DescriptorFranja => ({ etiqueta, opciones: [], onElegir: () => undefined });
  const prev = (v: number | null | undefined): string => (v === null || v === undefined ? "" : `ant. ${v}`);
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
              <CampoNum clave="neuro:etco2" etiqueta="EtCO₂" unidad="mmHg" valor={b.neuro.etco2} onCambio={(v) => setNeuro({ etco2: v })} franja={sinFranja("EtCO₂")} placeholder={prev(ultimo?.neuro?.etco2)} />
            )}
            {m.pic && (
              <CampoNum clave="neuro:pic" etiqueta="PIC" unidad="mmHg" valor={b.neuro.pic} onCambio={(v) => setNeuro({ pic: v })} franja={sinFranja("PIC")} placeholder={prev(ultimo?.neuro?.pic)} />
            )}
            {m.pic && (
              <div className="f">
                <label>PPC (PAM − PIC)</label>
                <div className="pam mono">{ppc ?? "--"}</div>
              </div>
            )}
            {m.dve && (
              <CampoNum clave="neuro:dve" etiqueta="Altura DVE" unidad="cmH₂O" valor={b.neuro.dveAltura} onCambio={(v) => setNeuro({ dveAltura: v })} franja={sinFranja("Altura DVE")} placeholder={prev(ultimo?.neuro?.dveAlturaCmH2O)} />
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
