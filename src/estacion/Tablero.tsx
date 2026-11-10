import { useState } from "react";
import { UserPlus } from "lucide-react";
import { CAMAS_UNIDAD, nombreCama } from "@core/index";
import { cx } from "../app/util";
import type { DatosUnidad } from "./datos";
import { Detalle } from "./Detalle";
import { IngresoPaciente } from "./IngresoPaciente";
import { TarjetaCama } from "./TarjetaCama";
import { nombreProfesional } from "./util";

interface Props {
  datos: DatosUnidad;
  ahora: Date;
  seleccionada: string | null;
  onSeleccionar: (id: string) => void;
}

export function Tablero({ datos, ahora, seleccionada, onSeleccionar }: Props) {
  const [filtro, setFiltro] = useState<string>("todas");
  /** null: sin formulario; "": ingreso sin cama elegida; "UCI-05": ingreso a esa cama. */
  const [ingresando, setIngresando] = useState<string | null>(null);
  const ocupadas = datos.episodios.map((e) => e.cama.toUpperCase());
  const libres = CAMAS_UNIDAD.filter((c) => !ocupadas.includes(c));

  const titulares = [...new Set(datos.episodios.map((e) => e.rutTitular))];
  const lista = filtro === "todas" ? datos.episodios : datos.episodios.filter((e) => e.rutTitular === filtro);
  const sel = datos.episodios.find((e) => e.id === seleccionada) ?? lista[0] ?? null;
  const transcritas = datos.episodios.filter((e) => e.transcritoAlma).length;

  return (
    <>
      <p className="intro">Cualquier PC de la UCI muestra esto. Es solo lectura salvo el ingreso, el alta y el titular. Lo que se guarda en un celular aparece aquí.</p>
      <div className="pc-bar">
        <div className="row">
          <button type="button" className="chip" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>Toda la unidad</button>
          {titulares.map((rut) => (
            <button key={rut} type="button" className={cx("chip")} style={{ fontFamily: "var(--font-ui)" }} aria-pressed={filtro === rut} onClick={() => setFiltro(rut)}>
              {nombreProfesional(rut)}
            </button>
          ))}
        </div>
        <div className="row">
          <span className="small muted">{transcritas} de {datos.episodios.length} camas transcritas a ALMA</span>
          <button type="button" className="btn sm primary" onClick={() => setIngresando("")}>
            <UserPlus size={14} aria-hidden /> Ingresar paciente
          </button>
        </div>
      </div>

      {ingresando !== null && (
        <div style={{ marginBottom: 16 }}>
          <IngresoPaciente key={ingresando} camaInicial={ingresando} camasOcupadas={ocupadas} onListo={() => setIngresando(null)} />
        </div>
      )}

      {datos.episodios.length > 0 && (
        <div className="camas">
          {lista.map((ep) => (
            <TarjetaCama
              key={ep.id}
              ep={ep}
              controles={datos.controles.get(ep.id) ?? []}
              eventos={datos.eventos.get(ep.id) ?? []}
              apks={datos.apks.get(ep.id) ?? []}
              identidad={datos.identidades.get(ep.id) ?? null}
              ahora={ahora}
              seleccionada={sel?.id === ep.id}
              onClick={() => onSeleccionar(ep.id)}
            />
          ))}
        </div>
      )}

      {filtro === "todas" && libres.length > 0 && (
        <section aria-label="Camas libres" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "12px 0 8px" }}>Camas libres ({libres.length})</h3>
          <div className="camas-libres">
            {libres.map((c) => (
              <button key={c} type="button" className="cama-libre" aria-label={`Ingresar paciente en ${nombreCama(c)}`} aria-pressed={ingresando === c} onClick={() => setIngresando(c)}>
                <b>{nombreCama(c)}</b>
                <span className="small muted">Libre · Ingresar</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {sel && (
        <Detalle
          key={sel.id}
          ep={sel}
          controles={datos.controles.get(sel.id) ?? []}
          eventos={datos.eventos.get(sel.id) ?? []}
          apks={datos.apks.get(sel.id) ?? []}
          identidad={datos.identidades.get(sel.id) ?? null}
          ahora={ahora}
        />
      )}
    </>
  );
}
