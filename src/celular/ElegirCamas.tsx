import { useEffect, useState } from "react";
import { BedDouble, Info } from "lucide-react";
import { CAMAS_UNIDAD } from "@core/index";
import type { Episodio } from "@core/index";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";
import { useApp } from "../app/store";
import { guardarMeta, leerMeta } from "../datos/db";

export const claveMisCamas = (rut: string): string => `misCamas:${rut}`;
const TAMANO_GRUPO = 6;

/** "Cuales son hoy tus camas": se pregunta al ingresar y se puede reabrir desde la portada. */
export function ElegirCamas() {
  const { repo, db } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const setMisCamas = useApp((s) => s.setMisCamas);
  const irA = useApp((s) => s.irA);
  const episodios = useConsulta<readonly Episodio[]>(() => repo.episodiosActivos(), [repo], []);
  // Las 18 camas de la unidad, con o sin paciente: el turno se reparte por cama.
  const ocupadas = new Set(episodios.map((e) => e.cama));
  const camas = CAMAS_UNIDAD;
  const [sel, setSel] = useState<readonly string[] | null>(null);

  // Parte con lo que eligio la vez anterior; si es la primera, con las que ya tiene como titular.
  useEffect(() => {
    if (sel !== null) return;
    void leerMeta<string[]>(db, claveMisCamas(sesion.rut)).then((g) => {
      setSel(g ?? episodios.filter((e) => e.rutTitular === sesion.rut).map((e) => e.cama));
    });
  }, [db, sesion.rut, episodios, sel]);

  const actual = new Set(sel ?? []);
  const alternar = (cama: string): void => setSel((s) => (s ?? []).includes(cama) ? (s ?? []).filter((x) => x !== cama) : [...(s ?? []), cama]);
  const grupos: string[][] = [];
  for (let i = 0; i < camas.length; i += TAMANO_GRUPO) grupos.push(camas.slice(i, i + TAMANO_GRUPO));
  const completo = (g: string[]): boolean => g.every((c) => actual.has(c));
  const alternarGrupo = (g: string[]): void => setSel((s) => (completo(g) ? (s ?? []).filter((c) => !g.includes(c)) : [...new Set([...(s ?? []), ...g])]));

  const continuar = async (): Promise<void> => {
    const lista = camas.filter((c) => actual.has(c));
    await guardarMeta(db, claveMisCamas(sesion.rut), lista);
    setMisCamas(lista);
    irA("camas");
  };

  return (
    <div className="cel-cuerpo elegir-camas">
      <div>
        <h2 style={{ margin: 0 }}>¿Cuáles son tus camas hoy?</h2>
        <p className="small ink2" style={{ margin: "4px 0 0" }}>Selecciona las camas que estarán a tu cargo. Las demás igual se pueden abrir para ayudar a un colega.</p>
      </div>
      <div className="resumen-camas">
        <BedDouble size={30} strokeWidth={1.6} aria-hidden />
        <span>{actual.size === 0 ? "Aún no eliges camas" : <>Tienes <b>{actual.size}</b> {actual.size === 1 ? "cama" : "camas"} a tu cargo en este turno</>}</span>
      </div>

      <section>
        <h3>Atajos</h3>
        <div className="atajos">
          {grupos.map((g) => (
            <button key={g.join()} type="button" className="chip" aria-pressed={completo(g)} onClick={() => alternarGrupo(g)}>
              {g[0]?.slice(-2)}–{g.at(-1)?.slice(-2)}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setSel([])}>Ninguna</button>
        </div>
      </section>

      <section>
        <h3>Camas</h3>
        <div className="grilla-camas" role="group" aria-label="Camas">
          {camas.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={actual.has(c)} title={ocupadas.has(c) ? "Con paciente" : "Libre"} style={ocupadas.has(c) ? undefined : { opacity: 0.6 }} onClick={() => alternar(c)}>
              {c.slice(-2)}
            </button>
          ))}
        </div>
      </section>

      <p className="nota-camas"><Info size={18} aria-hidden /> Las camas claras están libres. Puedes cambiar tus camas después desde tu cuenta.</p>
      <button type="button" id="btn-ver-camas" className="btn primary grande" onClick={() => void continuar()}>
        {actual.size > 0 ? `Continuar con ${actual.size} ${actual.size === 1 ? "cama" : "camas"}` : "Continuar sin camas"}
      </button>
    </div>
  );
}
