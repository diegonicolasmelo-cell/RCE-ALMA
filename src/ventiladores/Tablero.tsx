import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  MODELOS_VENTILADOR,
  VENTANAS_VENTILADORES,
  ZONAS_VENTILADOR,
  diaIso,
  enCama,
  enZona,
  estadoPrestamo,
  fechaDiaMes,
  hayPrestamosAtrasados,
  ventiladorEnCama,
  ventiladoresEnZona
} from "@core/index";
import type { ModeloVentilador, ResultadoMovimiento, UbicacionVentilador, Ventilador, ZonaVentilador } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora } from "../app/hooks";
import { nuevoId } from "../app/util";
import { useInventario } from "./inventario";
import { SpriteVentilador } from "./Sprite";

type Pendiente = { readonly id: string; readonly zona: "MANTENCION" | "FUERA" };

const SUMA_DIAS = (hoy: Date, n: number): string => diaIso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n));

/**
 * El tablero de ventiladores: cinco ventanas fijas (camas 1-6, 7-12, 13-18, pasillo y bodega,
 * mantencion y prestamo). Se toca un ventilador y despues el lugar de destino. Sirve igual en
 * el PC y en el celular.
 */
export function TableroVentiladores({ rutAutor }: { readonly rutAutor: string }) {
  const { repo } = useServicios();
  const inv = useInventario();
  const hoy = useAhora(60_000);
  const [ventana, setVentana] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [pend, setPend] = useState<Pendiente | null>(null);
  const [mensaje, setMensaje] = useState("Toca un ventilador y luego la cama o la zona donde lo quieres mover.");
  const atrasado = hayPrestamosAtrasados(inv, hoy);

  // Si el equipo elegido desaparece del inventario (otro PC lo movio), se suelta la seleccion.
  useEffect(() => {
    if (sel && !inv.some((v) => v.id === sel)) setSel(null);
    if (pend && !inv.some((v) => v.id === pend.id)) setPend(null);
  }, [inv, sel, pend]);

  const aplicar = async (r: ResultadoMovimiento): Promise<boolean> => {
    setMensaje(r.ok ? r.resumen : r.mensaje);
    if (r.ok) {
      setSel(null);
      setPend(null);
    }
    return r.ok;
  };

  const irA = async (destino: UbicacionVentilador): Promise<void> => {
    if (!sel) {
      setMensaje("Primero toca un ventilador.");
      return;
    }
    if (destino.tipo === "ZONA" && (destino.zona === "MANTENCION" || destino.zona === "FUERA")) {
      const v = inv.find((x) => x.id === sel);
      if (v && v.ubicacion.tipo === "ZONA" && v.ubicacion.zona === destino.zona) {
        setMensaje("Ya estaba en esa zona.");
        return;
      }
      setPend({ id: sel, zona: destino.zona });
      setMensaje(`Completa los datos de ${v?.etiqueta ?? "el ventilador"}.`);
      return;
    }
    setPend(null);
    await aplicar(await repo.moverVentilador(sel, destino, {}, rutAutor, nuevoId));
  };

  const def = VENTANAS_VENTILADORES[ventana] ?? VENTANAS_VENTILADORES[0]!;

  return (
    <div className="vt">
      <div className="vt-estado" role="status" aria-live="polite">{mensaje}</div>

      <div className="vt-tabs" role="tablist" aria-label="Tramos de camas y zonas">
        {VENTANAS_VENTILADORES.map((v, i) => (
          <button key={v.clave} type="button" role="tab" className="vt-tab" aria-selected={i === ventana} onClick={() => setVentana(i)}>
            {v.titulo}
            {v.zonas.includes("FUERA") && atrasado && <span className="vt-punto" role="img" aria-label="Hay equipos atrasados" />}
          </button>
        ))}
      </div>

      {def.camas.length > 0 && (
        <section className="vt-zona" aria-label={`Camas ${def.titulo}`}>
          <h3>Camas {def.camas[0]} a {def.camas.at(-1)}{def.camas[0] !== "1" ? ", en pares" : ""}</h3>
          <div className="vt-camas">
            {def.camas.filter((c) => Number(c) <= 4).length > 0 && (
              <div className="vt-col">
                {def.camas.filter((c) => Number(c) <= 4).map((c) => (
                  <CamaVentilador key={c} cama={c} v={ventiladorEnCama(inv, c)} fila sel={sel} hoy={hoy} onSel={setSel} onIr={irA} />
                ))}
              </div>
            )}
            <div className="vt-pares">
              {parear(def.camas.filter((c) => Number(c) >= 5)).map(([a, b]) => (
                <div className="vt-par" key={a}>
                  <CamaVentilador cama={a} v={ventiladorEnCama(inv, a)} sel={sel} hoy={hoy} onSel={setSel} onIr={irA} />
                  {b && <CamaVentilador cama={b} v={ventiladorEnCama(inv, b)} sel={sel} hoy={hoy} onSel={setSel} onIr={irA} />}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {def.zonas.length > 0 && (
        <div className="vt-zonas">
          {def.zonas.map((z) => (
            <ZonaVista
              key={z}
              zona={z}
              equipos={ventiladoresEnZona(inv, z)}
              sel={sel}
              hoy={hoy}
              onSel={setSel}
              onIr={irA}
              formulario={pend && pend.zona === z ? <FormularioDestino zona={z} hoy={hoy} onCancelar={() => { setPend(null); setMensaje("Movimiento cancelado."); }} onGuardar={async (datos) => {
                const r = await repo.moverVentilador(pend.id, enZona(z), datos, rutAutor, nuevoId);
                await aplicar(r);
                return r.ok ? null : r.mensaje;
              }} /> : null}
            />
          ))}
          {def.zonas.includes("BODEGA") && (
            <AgregarVentilador onAgregar={async (modelo, numero) => aplicar(await repo.altaVentilador(modelo, numero, enZona("BODEGA"), rutAutor, nuevoId))} />
          )}
        </div>
      )}
    </div>
  );
}

function parear(camas: readonly string[]): readonly (readonly [string, string | undefined])[] {
  const salida: (readonly [string, string | undefined])[] = [];
  for (let i = 0; i < camas.length; i += 2) {
    const a = camas[i];
    if (a) salida.push([a, camas[i + 1]]);
  }
  return salida;
}

interface PropsDestino {
  readonly sel: string | null;
  readonly hoy: Date;
  readonly onSel: (id: string | null) => void;
  readonly onIr: (d: UbicacionVentilador) => Promise<void>;
}

function CamaVentilador({ cama, v, fila, sel, hoy, onSel, onIr }: PropsDestino & { readonly cama: string; readonly v: Ventilador | null; readonly fila?: boolean }) {
  return (
    <div
      className={`vt-cama${v ? " con" : ""}${fila ? " fila" : ""}${sel ? " destino" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Cama ${cama}${v ? `, ${v.etiqueta}` : ", sin ventilador"}`}
      onClick={() => void onIr(enCama(cama))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onIr(enCama(cama));
        }
      }}
    >
      <span className="vt-num">Cama {cama}</span>
      {v ? <ChipVentilador v={v} sel={sel === v.id} hoy={hoy} onSel={onSel} /> : <span className="vt-sin">Sin ventilador</span>}
    </div>
  );
}

function ZonaVista({
  zona,
  equipos,
  sel,
  hoy,
  onSel,
  onIr,
  formulario
}: PropsDestino & { readonly zona: ZonaVentilador; readonly equipos: readonly Ventilador[]; readonly formulario: JSX.Element | null }) {
  const titulo = ZONAS_VENTILADOR.find((z) => z.clave === zona)?.etiqueta ?? zona;
  return (
    <div
      className={`vt-zonabox${sel ? " destino" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={titulo}
      onClick={() => void onIr(enZona(zona))}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          void onIr(enZona(zona));
        }
      }}
    >
      <h3>{titulo}</h3>
      <div className="vt-lista">
        {equipos.map((v) => <ChipVentilador key={v.id} v={v} sel={sel === v.id} hoy={hoy} onSel={onSel} />)}
        {equipos.length === 0 && <span className="vt-sin">Sin equipos</span>}
      </div>
      {formulario}
    </div>
  );
}

/** El ventilador dibujado, con su nombre, la nota de mantencion o el aviso de prestamo. */
export function ChipVentilador({ v, sel, hoy, onSel }: { readonly v: Ventilador; readonly sel: boolean; readonly hoy: Date; readonly onSel?: (id: string | null) => void }) {
  const est = v.prestamo ? estadoPrestamo(v.prestamo, hoy) : null;
  return (
    <button
      type="button"
      className={`vt-eq${sel ? " sel" : ""}`}
      aria-pressed={onSel ? sel : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSel?.(sel ? null : v.id);
      }}
    >
      <SpriteVentilador modelo={v.modelo} />
      <span className="vt-nombre">{v.etiqueta}</span>
      {est && <span className={`vt-insignia ${est.nivel.toLowerCase()}`}>{est.texto}</span>}
      {!est && v.nota && <span className="vt-nota">{v.nota}</span>}
      {v.prestamo && (
        <span className="vt-tip" role="tooltip">
          <b>{v.prestamo.servicio}</b>
          <br />Salió {fechaDiaMes(v.prestamo.salida)}
          <br />Vuelve {fechaDiaMes(v.prestamo.retorno)}
        </span>
      )}
    </button>
  );
}

function FormularioDestino({
  zona,
  hoy,
  onGuardar,
  onCancelar
}: {
  readonly zona: "MANTENCION" | "FUERA";
  readonly hoy: Date;
  readonly onGuardar: (datos: { nota?: string; prestamo?: { servicio: string; salida: string; retorno: string } }) => Promise<string | null>;
  readonly onCancelar: () => void;
}) {
  const [servicio, setServicio] = useState("");
  const [salida, setSalida] = useState(SUMA_DIAS(hoy, 0));
  const [retorno, setRetorno] = useState(SUMA_DIAS(hoy, 3));
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(await onGuardar(zona === "FUERA" ? { prestamo: { servicio, salida, retorno } } : { nota }));
  };

  return (
    <form className="vt-form" noValidate onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onSubmit={(e) => void enviar(e)}>
      {zona === "FUERA" ? (
        <>
          <label htmlFor="vt-serv">Servicio que lo recibe</label>
          <input id="vt-serv" type="text" autoComplete="off" placeholder="Por ejemplo, Pabellón" value={servicio} onChange={(e) => setServicio(e.target.value)} />
          <div className="vt-fechas">
            <div>
              <label htmlFor="vt-sal">Fecha de salida</label>
              <input id="vt-sal" type="date" value={salida} onChange={(e) => setSalida(e.target.value)} />
            </div>
            <div>
              <label htmlFor="vt-ret">Fecha de retorno</label>
              <input id="vt-ret" type="date" value={retorno} onChange={(e) => setRetorno(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="vt-nota">Nota libre</label>
          <textarea id="vt-nota" rows={2} placeholder="Qué le pasa, quién lo revisa, qué falta. Sin nombres de pacientes." value={nota} onChange={(e) => setNota(e.target.value)} />
        </>
      )}
      <span className="vt-error" role="alert">{error}</span>
      <div className="vt-botones">
        <button type="submit" className="btn primary sm">Guardar</button>
        <button type="button" className="btn sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function AgregarVentilador({ onAgregar }: { readonly onAgregar: (m: ModeloVentilador, n: number) => Promise<boolean> }) {
  const [abierto, setAbierto] = useState(false);
  const [modelo, setModelo] = useState<ModeloVentilador>(MODELOS_VENTILADOR[0]?.clave ?? "PB840");
  const [numero, setNumero] = useState("");
  const n = Number(numero);
  const valido = Number.isInteger(n) && n >= 1;
  return (
    <div className="vt-zonabox vt-agregar">
      <button type="button" className="btn sm" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        Agregar un ventilador al inventario
      </button>
      {abierto && (
        <form
          className="vt-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!valido) return;
            void onAgregar(modelo, n).then((ok) => {
              if (ok) {
                setNumero("");
                setAbierto(false);
              }
            });
          }}
        >
          <label htmlFor="vt-modelo">Modelo</label>
          <select id="vt-modelo" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloVentilador)}>
            {MODELOS_VENTILADOR.map((m) => <option key={m.clave} value={m.clave}>{m.etiqueta}</option>)}
          </select>
          <label htmlFor="vt-numero">Número del equipo</label>
          <input id="vt-numero" inputMode="numeric" placeholder="1" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <div className="vt-botones">
            <button type="submit" className="btn primary sm" disabled={!valido}>Agregar a la bodega</button>
          </div>
        </form>
      )}
    </div>
  );
}

