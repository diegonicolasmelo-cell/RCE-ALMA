import { useEffect, useState } from "react";
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
  const camas = [...episodios].sort((a, b) => a.cama.localeCompare(b.cama));
  const [sel, setSel] = useState<readonly string[] | null>(null);

  // Parte con lo que eligio la vez anterior; si es la primera, con las que ya tiene como titular.
  useEffect(() => {
    if (sel !== null || camas.length === 0) return;
    void leerMeta<string[]>(db, claveMisCamas(sesion.rut)).then((g) => {
      setSel(g ?? camas.filter((e) => e.rutTitular === sesion.rut).map((e) => e.cama));
    });
  }, [db, sesion.rut, camas, sel]);

  const actual = new Set(sel ?? []);
  const alternar = (cama: string): void => setSel((s) => (s ?? []).includes(cama) ? (s ?? []).filter((x) => x !== cama) : [...(s ?? []), cama]);
  const grupos: string[][] = [];
  for (let i = 0; i < camas.length; i += TAMANO_GRUPO) grupos.push(camas.slice(i, i + TAMANO_GRUPO).map((e) => e.cama));
  const completo = (g: string[]): boolean => g.every((c) => actual.has(c));
  const alternarGrupo = (g: string[]): void => setSel((s) => (completo(g) ? (s ?? []).filter((c) => !g.includes(c)) : [...new Set([...(s ?? []), ...g])]));

  const continuar = async (): Promise<void> => {
    const lista = camas.map((e) => e.cama).filter((c) => actual.has(c));
    await guardarMeta(db, claveMisCamas(sesion.rut), lista);
    setMisCamas(lista);
    irA("camas");
  };

  return (
    <div className="cel-cuerpo" style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>¿Cuáles son tus camas hoy?</h2>
        <p className="small ink2">{sesion.nombre}. Con ellas parte la portada; las demás igual se pueden abrir para ayudar a un colega.</p>
      </div>

      <section>
        <h3>Atajos</h3>
        <div className="row" style={{ flexWrap: "wrap" }}>
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
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }} role="group" aria-label="Camas">
          {camas.map((e) => (
            <button key={e.id} type="button" className="chip" aria-pressed={actual.has(e.cama)} onClick={() => alternar(e.cama)}>
              {e.cama.slice(-2)}
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="btn primary grande" onClick={() => void continuar()}>
        Ver camas{actual.size > 0 ? ` (${actual.size} mías)` : ""}
      </button>
    </div>
  );
}
