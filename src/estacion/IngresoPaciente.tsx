import { useState } from "react";
import { CAMAS_UNIDAD, nombreCama, dotacion, cifrarIdentidad, formatearRut, normalizarRut, validarRut } from "@core/index";
import type { Episodio, IdentidadPaciente, OrigenTalla, Sexo, ViaAerea } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { nuevoId } from "../app/util";
import { Seg } from "../celular/componentes";
import { useClaveUnidad } from "./claveUnidad";
import { useIdentidadesEnMemoria } from "./identidades";

/**
 * Ingreso de un paciente a la unidad. La identidad (nombre y RUT) va por su propio
 * canal y token; el episodio clinico solo lleva cama, edad, sexo y talla.
 */
/**
 * Guarda la identidad de un episodio: cifrada con la clave de la unidad antes de subir
 * (en produccion), en memoria en este PC; en la demostracion, en la base local.
 * Devuelve un texto de error si no se pudo guardar de forma segura, o el resultado de la subida.
 */
export function useGuardarIdentidad(): (identidad: IdentidadPaciente) => Promise<{ readonly error: string | null; readonly subida: { ok: boolean; error?: string | undefined } | null }> {
  const { api, db, local } = useServicios();
  const clave = useClaveUnidad();
  return async (identidad) => {
    if (!local && !clave) return { error: "Falta instalar la contraseña de la unidad en este equipo (pestaña Estado). Sin ella no se puede guardar el nombre de forma segura.", subida: null };
    if (local) await db.identidades.put(identidad);
    else useIdentidadesEnMemoria.getState().poner(identidad);
    const r = local || !clave ? await api.guardarReferencias([]) : await api.guardarReferencias([await cifrarIdentidad(clave, identidad, new Date())]);
    return { error: null, subida: r };
  };
}

export function IngresoPaciente({ camasOcupadas, onListo, camaInicial = "" }: { camasOcupadas: readonly string[]; onListo: () => void; camaInicial?: string }) {
  const { repo, local } = useServicios();
  const clave = useClaveUnidad();
  const guardarIdentidad = useGuardarIdentidad();
  const avisar = useApp((s) => s.avisar);
  const [cama, setCama] = useState(camaInicial);
  const libres = CAMAS_UNIDAD.filter((c) => !camasOcupadas.includes(c));
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [edad, setEdad] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [talla, setTalla] = useState("");
  const [origen, setOrigen] = useState<OrigenTalla>("ESTIMADA");
  const [dx, setDx] = useState("");
  const [via, setVia] = useState<ViaAerea>("TET");
  const [titular, setTitular] = useState(dotacion().find((p) => p.rol === "KINE_CLINICO")?.correo ?? "");
  const [error, setError] = useState<string | null>(null);

  const guardar = async (): Promise<void> => {
    const camaTxt = cama.trim().toUpperCase();
    const e = Number(edad);
    const t = Number(talla.replace(",", "."));
    if (camaTxt === "") return setError("Falta la cama.");
    if (camasOcupadas.includes(camaTxt)) return setError(`La cama ${camaTxt} ya tiene un paciente activo.`);
    if (nombre.trim() === "") return setError("Falta el nombre del paciente (queda solo en la estación).");
    if (rut.trim() !== "" && !validarRut(rut)) return setError("El RUT no es válido (revisa el dígito verificador).");
    if (!Number.isFinite(e) || e < 0 || e > 120) return setError("La edad debe estar entre 0 y 120.");
    if (!Number.isFinite(t) || t < 100 || t > 230) return setError("La talla debe estar entre 100 y 230 cm (se usa para el peso ideal).");

    const id = nuevoId();
    const ep: Episodio = {
      id,
      cama: camaTxt,
      edad: e,
      sexo,
      tallaCm: t,
      tallaOrigen: origen,
      diagnostico: dx.trim(),
      viaAereaActual: via,
      calibreVia: null,
      fijacionCm: null,
      diasVM: 0,
      equipos: [],
      monitoreo: { capnografia: false, pic: false, dve: false },
      rutTitular: titular,
      transcritoAlma: false,
      horaTranscripcion: null,
      pendienteEntrega: "",
      activo: true,
      apkArchivada: null
    };
    const identidad = { episodioId: id, nombre: nombre.trim(), rut: rut.trim() === "" ? null : (normalizarRut(rut) ?? null), ficha: null };

    // En produccion la identidad solo sube CIFRADA; sin la clave de la unidad no se ingresa.
    if (!local && !clave) return setError("Falta instalar la contraseña de la unidad en este equipo (pestaña Estado). Sin ella no se puede guardar el nombre de forma segura.");
    await repo.guardarEpisodio(ep);
    const g = await guardarIdentidad(identidad);
    const r = g.subida ?? { ok: false, error: g.error ?? undefined };
    avisar(r.ok ? `Paciente ingresado en ${camaTxt}.` : `Ingresado en ${camaTxt}, pero la identidad no se pudo subir (${r.error ?? "sin conexión"}): reintenta desde Estado.`);
    onListo();
  };

  return (
    <form className="card stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); void guardar(); }}>
      <h2 style={{ margin: 0 }}>Ingresar paciente</h2>
      <div className="fgrid">
        <div className="f">
          <label htmlFor="in-cama">Cama</label>
          <select id="in-cama" value={cama} onChange={(e) => setCama(e.target.value)}>
            <option value="">Elige…</option>
            {libres.map((c) => <option key={c} value={c}>{nombreCama(c)}</option>)}
          </select>
        </div>
        <div className="f"><label htmlFor="in-edad">Edad</label><input id="in-edad" inputMode="numeric" value={edad} onChange={(e) => setEdad(e.target.value)} /></div>
        <div className="f"><label htmlFor="in-talla">Talla (cm)</label><input id="in-talla" inputMode="numeric" value={talla} onChange={(e) => setTalla(e.target.value)} /></div>
      </div>
      <div className="row">
        <Seg etiqueta="Sexo" valor={sexo} opciones={[{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }]} onCambio={setSexo} />
        <Seg etiqueta="Origen de la talla" valor={origen} opciones={[{ valor: "ESTIMADA", texto: "Estimada" }, { valor: "MEDIDA", texto: "Medida" }]} onCambio={setOrigen} />
        <Seg etiqueta="Vía aérea de ingreso" valor={via} opciones={[{ valor: "TET", texto: "TET" }, { valor: "TQT", texto: "TQT" }, { valor: "NATURAL", texto: "Natural" }]} onCambio={setVia} />
      </div>
      <div className="f"><label htmlFor="in-nombre">Nombre (solo en la estación)</label><input id="in-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} /></div>
      <div className="f"><label htmlFor="in-rut">RUT (para abrir Sinapse)</label><input id="in-rut" value={rut} onChange={(e) => setRut(e.target.value)} onBlur={() => normalizarRut(rut) && setRut(formatearRut(rut))} style={{ textAlign: "left" }} /></div>
      <div className="f"><label htmlFor="in-dx">Diagnóstico</label><input id="in-dx" value={dx} onChange={(e) => setDx(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} /></div>
      <div className="f">
        <label htmlFor="in-titular">Kinesiólogo titular</label>
        <select id="in-titular" value={titular} onChange={(e) => setTitular(e.target.value)}>
          {dotacion().map((p) => <option key={p.correo} value={p.correo}>{p.nombre}</option>)}
        </select>
      </div>
      {error && <div className="notice crit" role="alert">{error}</div>}
      <div className="row">
        <button type="submit" className="btn primary">Ingresar</button>
        <button type="button" className="btn" onClick={onListo}>Cancelar</button>
      </div>
      <p className="small muted">El nombre y el RUT se cifran en este equipo antes de subirse: en la nube queda un bloque ilegible, y se borra al dar de alta. El celular nunca los recibe.</p>
    </form>
  );
}
