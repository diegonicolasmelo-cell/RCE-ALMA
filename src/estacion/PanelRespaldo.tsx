import { useState } from "react";
import { abrirRespaldoCifrado, armarRespaldoCifrado, nombreRespaldo } from "@core/index";
import type { DocumentoRespaldo } from "@core/index";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";
import { useApp } from "../app/store";
import { Aviso } from "../celular/componentes";
import { borrarArchivos, leerCarpeta, leerHojasHtml, permisoConcedido } from "./archivoLocal";
import { useClaveUnidad } from "./claveUnidad";

function descargar(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function verHoja(d: DocumentoRespaldo): void {
  const url = URL.createObjectURL(new Blob([d.html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (w) w.addEventListener("load", () => w.print());
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Respaldo mensual cifrado de la carpeta local, y apertura de un respaldo en cualquier PC con la clave. */
export function PanelRespaldo() {
  const { db } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const clave = useClaveUnidad();
  const carpeta = useConsulta(() => leerCarpeta(db), [db], undefined);
  const [incluidos, setIncluidos] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [abiertos, setAbiertos] = useState<readonly DocumentoRespaldo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!clave) {
    return (
      <div className="card stack">
        <h2>Respaldo mensual cifrado</h2>
        <p className="small muted">Instala la contraseña de la unidad en este equipo para generar o abrir respaldos.</p>
      </div>
    );
  }

  const generar = async (): Promise<void> => {
    setError(null);
    if (!carpeta || !(await permisoConcedido(carpeta))) return setError("Elige la carpeta de las hojas y confirma el permiso (sección de arriba).");
    const hojas = await leerHojasHtml(carpeta);
    if (hojas.length === 0) return setError("La carpeta no tiene hojas APK.");
    descargar(nombreRespaldo(new Date()), await armarRespaldoCifrado(clave, hojas, new Date()));
    setIncluidos(hojas.map((h) => h.nombre));
    avisar(`Respaldo con ${hojas.length} hoja(s) descargado. Envíalo y confirma abajo para vaciar la carpeta.`);
  };

  const vaciar = async (): Promise<void> => {
    if (!carpeta) return;
    await borrarArchivos(carpeta, incluidos);
    // Las hojas de pacientes aun en la unidad se vuelven a escribir con su proxima firma.
    await db.meta.where("clave").startsWith("apkLocal:").delete();
    setIncluidos([]);
    setConfirmando(false);
    avisar("Carpeta vaciada.");
  };

  const abrir = async (archivo: File | undefined): Promise<void> => {
    setError(null);
    setAbiertos(null);
    if (!archivo) return;
    try {
      setAbiertos(await abrirRespaldoCifrado(clave, await archivo.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el respaldo.");
    }
  };

  return (
    <div className="card stack">
      <h2>Respaldo mensual cifrado</h2>
      <p className="small ink2">Junta las hojas APK de la carpeta en un solo archivo cifrado con la contraseña de la unidad. Ese archivo se puede enviar por correo o guardar en un disco: sin la contraseña no se lee.</p>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => void generar()}>Generar el respaldo de la carpeta</button>
      </div>
      {incluidos.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <Aviso tipo="warn" pequeno>Descargaste un respaldo con {incluidos.length} hoja(s). Cuando confirmes que llegó a su destino, puedes vaciar la carpeta.</Aviso>
          {confirmando ? (
            <div className="row">
              <b className="small">¿Ya llegó el respaldo y quieres borrar esas hojas de la carpeta?</b>
              <button type="button" className="btn sm danger" onClick={() => void vaciar()}>Sí, vaciar</button>
              <button type="button" className="btn sm" onClick={() => setConfirmando(false)}>No</button>
            </div>
          ) : (
            <div className="row"><button type="button" className="btn sm" onClick={() => setConfirmando(true)}>Vaciar la carpeta de esas hojas</button></div>
          )}
        </div>
      )}

      <h3>Abrir un respaldo</h3>
      <div className="f">
        <label htmlFor="in-respaldo">Archivo de respaldo (.upcres)</label>
        <input id="in-respaldo" type="file" accept=".upcres" onChange={(e) => void abrir(e.target.files?.[0])} style={{ textAlign: "left" }} />
      </div>
      {error && <Aviso tipo="crit" pequeno>{error}</Aviso>}
      {abiertos && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          {abiertos.map((d) => (
            <li key={d.nombre}>{d.nombre.replace(/\.html$/i, "")} <button type="button" className="btn sm" onClick={() => verHoja(d)}>Ver / imprimir</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
