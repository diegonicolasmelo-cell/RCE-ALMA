import { useState } from "react";
import { UserPlus } from "lucide-react";
import { camaDeEpisodio, ventiladorEnCama } from "@core/index";
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
  const [ingresando, setIngresando] = useState(false);

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
          <button type="button" className="btn sm primary" onClick={() => setIngresando(true)}>
            <UserPlus size={14} aria-hidden /> Ingresar paciente
          </button>
        </div>
      </div>

      {ingresando && (
        <div style={{ marginBottom: 16 }}>
          <IngresoPaciente camasOcupadas={datos.episodios.map((e) => e.cama.toUpperCase())} onListo={() => setIngresando(false)} />
        </div>
      )}

      {datos.episodios.length === 0 ? (
        <div className="card"><p className="muted">No hay pacientes activos. Usa “Ingresar paciente” para registrar el primero.</p></div>
      ) : (
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
              ventilador={ventiladorEnCama(datos.ventiladores, camaDeEpisodio(ep.cama))}
              onClick={() => onSeleccionar(ep.id)}
            />
          ))}
        </div>
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
          ventiladores={datos.ventiladores}
        />
      )}
    </>
  );
}
