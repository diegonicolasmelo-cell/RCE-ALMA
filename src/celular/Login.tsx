import { useState } from "react";
import { CORREO_DEMO, buscarUsuario } from "@core/index";
import { PIN_DEMO } from "../datos/api";
import { guardarMeta } from "../datos/db";
import { refrescarDotacion } from "../datos/servicios";
import { useServicios } from "../app/contexto";
import { Logo } from "../app/Logo";
import { useApp } from "../app/store";

export const CLAVE_SESION = "sesion";
const DURACION_SESION_MS = 12 * 3600 * 1000;

export interface SesionGuardada {
  /** Correo del profesional (el nombre del campo es historico). */
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
    // Un colega recien agregado a la hoja: se vuelve a pedir la dotacion antes de rechazarlo.
    const prof = buscarUsuario(rut) ?? (!local && (await refrescarDotacion(db, api)) ? buscarUsuario(rut) : undefined);
    if (!prof) return setError(local ? "Ese usuario no está en la dotación de la unidad." : "Ese correo no está en la hoja «usuarios» de la unidad. Pide a coordinación que lo agregue.");
    setCargando(true);
    const r = await api.login(prof.correo, pin);
    setCargando(false);
    if (r.ok) {
      await guardarMeta(db, CLAVE_SESION, { rut: prof.correo, desde: Date.now() } satisfies SesionGuardada);
      setSesion({ rut: prof.correo, nombre: `Klgo. ${prof.nombre}`, rol: prof.rol });
      // Cada ingreso pregunta cuales son hoy tus camas.
      useApp.setState({ vista: "elegir" });
      return;
    }
    if (r.error === "PIN_NO_DEFINIDO") return setFase("definir");
    setError(
      r.error === "PIN_INCORRECTO" ? "Contraseña incorrecta."
      : r.error === "SIN_CONEXION" ? "Sin conexión: el primer ingreso del día necesita red."
      : r.error === "USUARIO_NO_ENCONTRADO" ? "Ese correo no está en la hoja «usuarios» de la unidad."
      : "No se pudo ingresar."
    );
  };

  /** Primer ingreso: la contraseña que escribio queda como suya, si la repite igual. */
  const definir = async (): Promise<void> => {
    const prof = buscarUsuario(rut);
    if (!prof) return;
    if (pin.length < 4) return setError("La contraseña debe tener al menos 4 caracteres.");
    if (nuevoPin !== pin) return setError("Las dos contraseñas no coinciden.");
    setCargando(true);
    const r = await api.definirPin(prof.correo, "", nuevoPin);
    setCargando(false);
    if (!r.ok) return setError("No se pudo guardar la contraseña.");
    setNuevoPin("");
    setFase("ingreso");
    await entrar();
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
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo tam={40} />Kapta</h1>
        <p className="ink2">Captura a pie de cama · UCI Adulto</p>
      </div>

      {fase === "ingreso" ? (
        <>
          <div className="f">
            <label htmlFor="rut">Correo</label>
            <input
              id="rut"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={rut}
              placeholder="tucorreo@…"
              onChange={(e) => setRut(e.target.value)}
              style={{ textAlign: "left", fontFamily: "var(--font-ui)" }}
            />
          </div>
          <div className="f">
            <label htmlFor="pin">Contraseña</label>
            <input id="pin" type="password" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} />
          </div>
        </>
      ) : (
        <>
          <div className="notice acc">Es tu primer ingreso: la contraseña que escribiste quedará como tuya. Repítela para confirmarla. Con ella se firman la APK y tus controles.</div>
          <div className="f">
            <label htmlFor="npin">Repite la contraseña</label>
            <input id="npin" type="password" autoComplete="new-password" value={nuevoPin} onChange={(e) => setNuevoPin(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} />
          </div>
        </>
      )}

      {error && <div className="notice crit" role="alert">{error}</div>}
      <button type="submit" className="btn primary grande" disabled={cargando}>
        {fase === "ingreso" ? "Ingresar" : "Guardar contraseña e ingresar"}
      </button>
      {local && <div className="notice new small">Modo demostración (sin servidor): correo <b>{CORREO_DEMO}</b> (o cualquier nombre de la dotación) y contraseña <b className="mono">{PIN_DEMO.toLowerCase()}</b>. Los datos son inventados y quedan solo en este dispositivo.</div>}
    </form>
  );
}
