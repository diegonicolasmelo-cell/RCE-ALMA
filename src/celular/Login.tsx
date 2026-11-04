import { useState } from "react";
import { buscarProfesional, formatearRut, normalizarRut } from "@core/index";
import { PIN_DEMO } from "../datos/api";
import { guardarMeta } from "../datos/db";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";

export const CLAVE_SESION = "sesion";
const DURACION_SESION_MS = 12 * 3600 * 1000;

export interface SesionGuardada {
  rut: string;
  desde: number;
}

export function sesionVigente(s: SesionGuardada | undefined, ahora = Date.now()): SesionGuardada | null {
  return s && ahora - s.desde < DURACION_SESION_MS ? s : null;
}

export function Login() {
  const { api, db, local } = useServicios();
  const setSesion = useApp((s) => s.setSesion);
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [nuevoPin, setNuevoPin] = useState("");
  const [fase, setFase] = useState<"ingreso" | "definir">("ingreso");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const entrar = async (): Promise<void> => {
    setError(null);
    const prof = buscarProfesional(rut);
    if (!prof) return setError("Ese RUT no está en la dotación de la unidad.");
    setCargando(true);
    const r = await api.login(prof.rut, pin);
    setCargando(false);
    if (r.ok) {
      await guardarMeta(db, CLAVE_SESION, { rut: prof.rut, desde: Date.now() } satisfies SesionGuardada);
      setSesion({ rut: prof.rut, nombre: `Klgo. ${prof.nombre}`, rol: prof.rol });
      return;
    }
    if (r.error === "PIN_NO_DEFINIDO") return setFase("definir");
    setError(
      r.error === "PIN_INCORRECTO" ? "PIN incorrecto."
      : r.error === "SIN_CONEXION" ? "Sin conexión: el primer ingreso del día necesita red."
      : "No se pudo ingresar."
    );
  };

  const definir = async (): Promise<void> => {
    const prof = buscarProfesional(rut);
    if (!prof) return;
    if (nuevoPin.length < 4) return setError("El PIN debe tener al menos 4 dígitos.");
    setCargando(true);
    const r = await api.definirPin(prof.rut, "", nuevoPin);
    setCargando(false);
    if (!r.ok) return setError("No se pudo definir el PIN.");
    setPin(nuevoPin);
    setFase("ingreso");
    setError(null);
  };

  return (
    <form
      className="login"
      onSubmit={(e) => {
        e.preventDefault();
        void (fase === "ingreso" ? entrar() : definir());
      }}
    >
      <div>
        <h1>UPC-Pulse</h1>
        <p className="ink2">Captura a pie de cama · UCI Adulto</p>
      </div>

      {fase === "ingreso" ? (
        <>
          <div className="f">
            <label htmlFor="rut">RUT</label>
            <input
              id="rut"
              inputMode="text"
              autoComplete="username"
              value={rut}
              placeholder="12.345.678-5"
              onChange={(e) => setRut(e.target.value)}
              onBlur={() => normalizarRut(rut) && setRut(formatearRut(rut))}
              style={{ textAlign: "left", fontFamily: "var(--font-ui)" }}
            />
          </div>
          <div className="f">
            <label htmlFor="pin">PIN</label>
            <input id="pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} style={{ textAlign: "left" }} />
          </div>
        </>
      ) : (
        <>
          <div className="notice acc">Es tu primer ingreso: define un PIN de 4 a 6 dígitos. Con él se firman la APK y tus controles.</div>
          <div className="f">
            <label htmlFor="npin">Nuevo PIN</label>
            <input id="npin" type="password" inputMode="numeric" value={nuevoPin} onChange={(e) => setNuevoPin(e.target.value)} style={{ textAlign: "left" }} />
          </div>
        </>
      )}

      {error && <div className="notice crit" role="alert">{error}</div>}
      <button type="submit" className="btn primary grande" disabled={cargando}>
        {fase === "ingreso" ? "Ingresar" : "Definir PIN"}
      </button>
      {local && <div className="notice new small">Modo demostración (sin servidor): ingresa con cualquier RUT de la dotación y el PIN <b className="mono">{PIN_DEMO}</b>. Los datos son inventados y quedan solo en este dispositivo.</div>}
    </form>
  );
}
