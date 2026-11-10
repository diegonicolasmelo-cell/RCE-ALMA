import { useEffect, useState } from "react";
import { CORREO_DEMO, buscarProfesional, buscarUsuario } from "@core/index";
import type { Profesional } from "@core/index";
import { PIN_DEMO } from "../datos/api";
import { guardarMeta, leerMeta } from "../datos/db";
import { refrescarDotacion } from "../datos/servicios";
import type { EstadoDotacion } from "../datos/servicios";
import { useServicios } from "../app/contexto";
import { Logo } from "../app/Logo";
import { useApp } from "../app/store";
import { activarHuella, huellaDisponible, leerHuellas, olvidarHuella, verificarHuella } from "./huella";
import type { HuellaGuardada } from "./huella";

/** Quien dijo «Ahora no» a la huella en este celular: no se le vuelve a ofrecer. */
const CLAVE_HUELLA_NO = "huellaNo";

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
  const [fase, setFase] = useState<"ingreso" | "definir" | "huella">("ingreso");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [conHuella, setConHuella] = useState(false);
  const [huellas, setHuellas] = useState<readonly HuellaGuardada[]>([]);
  const [porActivar, setPorActivar] = useState<Profesional | null>(null);

  useEffect(() => {
    void (async () => {
      const disponible = await huellaDisponible();
      setConHuella(disponible);
      if (disponible) setHuellas((await leerHuellas(db)).filter((h) => buscarProfesional(h.correo)));
    })();
  }, [db]);

  /** Abre la sesion de esta persona (despues de la contrasena o de la huella). */
  const abrirSesion = async (prof: Profesional): Promise<void> => {
    await guardarMeta(db, CLAVE_SESION, { rut: prof.correo, desde: Date.now() } satisfies SesionGuardada);
    setSesion({ rut: prof.correo, nombre: `Klgo. ${prof.nombre}`, rol: prof.rol });
    // Cada ingreso pregunta cuales son hoy tus camas.
    useApp.setState({ vista: "elegir" });
  };

  const entrarConHuella = async (h: HuellaGuardada): Promise<void> => {
    setError(null);
    const prof = buscarProfesional(h.correo);
    if (!prof) return setError("Esa persona ya no está en la hoja «usuarios»: entra con correo y contraseña.");
    setCargando(true);
    const r = await verificarHuella(h);
    setCargando(false);
    if (r.ok) return abrirSesion(prof);
    setError(r.error === "CANCELADO" ? "No se confirmó la huella. Vuelve a intentarlo o entra con tu contraseña." : "No se pudo usar la huella en este celular. Entra con tu contraseña.");
  };

  const activar = async (): Promise<void> => {
    if (!porActivar) return;
    setError(null);
    setCargando(true);
    const r = await activarHuella(db, porActivar.correo, porActivar.nombre);
    setCargando(false);
    if (!r.ok) return setError(r.error === "CANCELADO" ? "No se activó la huella. Puedes intentarlo de nuevo o seguir sin ella." : "Este celular no pudo guardar la huella. Sigue con tu contraseña.");
    await abrirSesion(porActivar);
  };

  const sinHuella = async (): Promise<void> => {
    if (!porActivar) return;
    const no = (await leerMeta<string[]>(db, CLAVE_HUELLA_NO)) ?? [];
    await guardarMeta(db, CLAVE_HUELLA_NO, [...new Set([...no, porActivar.correo])]);
    await abrirSesion(porActivar);
  };

  const entrar = async (): Promise<void> => {
    setError(null);
    // Un colega recien agregado a la hoja: se vuelve a pedir la dotacion antes de rechazarlo.
    let prof = buscarUsuario(rut);
    let estado: EstadoDotacion = true;
    if (!prof && !local) {
      setCargando(true);
      estado = await refrescarDotacion(db, api);
      setCargando(false);
      prof = buscarUsuario(rut);
    }
    if (!prof) {
      return setError(
        local ? "Ese usuario no está en la dotación de la unidad."
        : estado === "servidor" ? "El servidor todavía no entrega la lista de usuarios: en Apps Script falta pegar el Codigo.gs nuevo y publicar una nueva versión."
        : estado === "vacia" ? "La hoja «usuarios» está vacía: en el editor de Apps Script ejecuta cargarDotacion."
        : estado === "llave" ? "Este equipo tiene una llave antigua de la app (se crearon llaves nuevas). Abre de nuevo el enlace para celulares que muestra el PC en Estado → «Llaves de la unidad»."
        : estado === "direccion" ? "La dirección del servidor guardada en este equipo no responde como la app. Revisa que la implementación tenga acceso «Cualquier persona» y vuelve a abrir el enlace para celulares del PC."
        : estado === "red" ? "Sin conexión con el servidor: revisa la señal o el wifi y vuelve a intentar."
        : typeof estado === "string" && estado.startsWith("otro:") ? `El servidor respondió un error (${estado.slice(5)}). Avísale a coordinación.`
        : "Ese correo no está en la hoja «usuarios» de la unidad. Pide a coordinación que lo agregue."
      );
    }
    setCargando(true);
    const r = await api.login(prof.correo, pin);
    setCargando(false);
    if (r.ok) {
      // En un celular con lector, se ofrece la huella una vez (salvo que ya la tenga o dijo que no).
      const yaTiene = huellas.some((h) => h.correo === prof.correo);
      const dijoNo = ((await leerMeta<string[]>(db, CLAVE_HUELLA_NO)) ?? []).includes(prof.correo);
      if (conHuella && !yaTiene && !dijoNo) {
        setPin("");
        setPorActivar(prof);
        return setFase("huella");
      }
      return abrirSesion(prof);
    }
    if (r.error === "PIN_NO_DEFINIDO") return setFase("definir");
    setError(
      r.error === "PIN_INCORRECTO" ? "Contraseña incorrecta."
      : r.error === "SIN_CONEXION" ? "Sin conexión: el primer ingreso del día necesita red."
      : r.error === "USUARIO_NO_ENCONTRADO" ? "Ese correo no está en la hoja «usuarios» de la unidad."
      : r.error === "TOKEN_INVALIDO" ? "Este equipo tiene una llave antigua de la app. Abre de nuevo el enlace para celulares que muestra el PC en «Llaves de la unidad»."
      : r.error === "RESPUESTA_NO_ES_LA_APP" ? "La dirección del servidor guardada en este equipo no responde como la app. Vuelve a abrir el enlace para celulares del PC."
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

  if (fase === "huella" && porActivar) {
    return (
      <div className="login">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo tam={40} />Kapta</h1>
          <p className="ink2">Hola, {porActivar.nombre}</p>
        </div>
        <div className="notice acc">
          <b>¿Entrar con tu huella en este celular?</b> La próxima vez no tendrás que escribir la contraseña: el teléfono te pedirá la huella (o tu cara o el PIN de pantalla). La huella no sale del teléfono; ni la app ni Google la ven.
        </div>
        {error && <div className="notice crit" role="alert">{error}</div>}
        <button type="button" className="btn primary grande" disabled={cargando} onClick={() => void activar()}>{cargando ? "Esperando la huella…" : "Usar mi huella"}</button>
        <button type="button" className="btn" disabled={cargando} onClick={() => void sinHuella()}>Ahora no</button>
        <p className="small muted" style={{ margin: 0 }}>Solo en este celular y solo para ti. Si cambias de teléfono, entras una vez con la contraseña y la activas de nuevo.</p>
      </div>
    );
  }

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

      {fase === "ingreso" && huellas.length > 0 && (
        <div className="stack" aria-label="Entrar con huella">
          {huellas.map((h) => (
            <div key={h.correo} className="row" style={{ gap: 8 }}>
              <button type="button" className="btn primary grande" style={{ flex: 1 }} disabled={cargando} onClick={() => void entrarConHuella(h)}>
                <HuellaIcono /> Entrar con huella · {buscarProfesional(h.correo)?.nombre ?? h.correo}
              </button>
              <button
                type="button"
                className="btn sm"
                aria-label={`Quitar la huella de ${buscarProfesional(h.correo)?.nombre ?? h.correo}`}
                onClick={() => void olvidarHuella(db, h.correo).then(() => setHuellas((l) => l.filter((x) => x.correo !== h.correo)))}
              >
                Quitar
              </button>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0, textAlign: "center" }}>o con tu correo y contraseña</p>
        </div>
      )}

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

/** Huella dactilar dibujada (sin emoji: el Chrome del hospital no trae los nuevos). */
function HuellaIcono() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: "-4px", marginRight: 6 }}>
      <path d="M6.5 5.5A8 8 0 0 1 20 11.5" />
      <path d="M4 9.5a8 8 0 0 0-.2 3.5" />
      <path d="M8 18.5c1-1.8 1.5-3.8 1.5-6a2.5 2.5 0 0 1 5 0c0 2.6-.4 4.8-1.3 6.8" />
      <path d="M12 12.5c0 3-.7 5.6-2 7.7" />
      <path d="M17.2 14.5c-.2 2-.7 3.8-1.4 5.3" />
      <path d="M6.3 16.5c.5-1.3.7-2.6.7-4a5 5 0 0 1 9.5-2.2" />
    </svg>
  );
}
