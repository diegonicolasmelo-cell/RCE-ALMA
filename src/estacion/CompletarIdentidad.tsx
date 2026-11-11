import { useState } from "react";
import { formatearRut, normalizarRut, rangoDeEdad, validarRut } from "@core/index";
import type { Episodio } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { useGuardarIdentidad } from "./IngresoPaciente";

/**
 * Un paciente ingresado desde el celular llega sin identidad (el celular nunca la maneja):
 * aqui el PC agrega nombre, RUT, edad y diagnostico. El nombre y el RUT se cifran antes de
 * subir, igual que en el ingreso hecho desde el PC.
 */
export function CompletarIdentidad({ ep }: { ep: Episodio }) {
  const { repo } = useServicios();
  const guardarIdentidad = useGuardarIdentidad();
  const avisar = useApp((s) => s.avisar);
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [edad, setEdad] = useState("");
  const [dx, setDx] = useState(ep.diagnostico);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (): Promise<void> => {
    if (nombre.trim() === "") return setError("Falta el nombre del paciente (queda solo en la estación).");
    if (rut.trim() !== "" && !validarRut(rut)) return setError("El RUT no es válido (revisa el dígito verificador).");
    const e = Number(edad);
    if (!Number.isFinite(e) || e < 18 || e > 120) return setError("La edad debe estar entre 18 y 120.");
    const r = await guardarIdentidad({ episodioId: ep.id, nombre: nombre.trim(), rut: rut.trim() === "" ? null : (normalizarRut(rut) ?? null), ficha: null, edad: e });
    if (r.error) return setError(r.error);
    await repo.guardarEpisodio({ ...ep, rangoEdad: rangoDeEdad(e), diagnostico: dx.trim() });
    avisar(r.subida?.ok ? `Identidad de ${ep.cama} completada.` : `Identidad de ${ep.cama} guardada en este PC, pero no se pudo subir (${r.subida?.error ?? "sin conexión"}): reintenta desde Estado.`);
  };

  return (
    <form className="notice warn stack" style={{ gap: 8 }} aria-label="Completar identidad" onSubmit={(ev) => { ev.preventDefault(); void guardar(); }}>
      <b>Ingresado desde el celular: falta la identidad</b>
      <div className="fgrid">
        <div className="f"><label htmlFor="ci-nombre">Nombre</label><input id="ci-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} /></div>
        <div className="f"><label htmlFor="ci-rut">RUT</label><input id="ci-rut" value={rut} onChange={(e) => setRut(e.target.value)} onBlur={() => normalizarRut(rut) && setRut(formatearRut(rut))} style={{ textAlign: "left" }} /></div>
        <div className="f"><label htmlFor="ci-edad">Edad</label><input id="ci-edad" inputMode="numeric" value={edad} onChange={(ev) => setEdad(ev.target.value)} /></div>
      </div>
      <div className="f"><label htmlFor="ci-dx">Diagnóstico</label><input id="ci-dx" value={dx} onChange={(e) => setDx(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} /></div>
      {error && <div className="notice crit" role="alert">{error}</div>}
      <div className="row"><button type="submit" className="btn primary">Guardar identidad</button></div>
      <p className="small muted" style={{ margin: 0 }}>El nombre y el RUT se cifran en este equipo antes de subirse. El celular nunca los recibe.</p>
    </form>
  );
}
