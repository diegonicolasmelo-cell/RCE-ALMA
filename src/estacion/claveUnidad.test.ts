import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { cifrarIdentidad, descifrarIdentidad, soloEpisodios } from "@core/index";
import { BaseLocal } from "../datos/db";
import { crearApiLocal } from "../datos/api";
import { instalarContrasena, leerClaveUnidad, olvidarClave } from "./claveUnidad";

const nuevoPc = () => new BaseLocal(`pc-${Math.random()}`);

describe("contraseña de la unidad en cada PC", () => {
  it("el primer PC crea la verificación; los demás solo entran con la misma contraseña", async () => {
    const nube = crearApiLocal(); // hace de Sheet compartido por los dos PC
    const pc1 = nuevoPc();
    const pc2 = nuevoPc();

    expect((await instalarContrasena("contraseña-de-la-unidad", nube, pc1, false)).ok).toBe(false); // sin permiso de crear
    const r1 = await instalarContrasena("contraseña-de-la-unidad", nube, pc1, true);
    expect(r1).toEqual({ ok: true, primera: true });
    expect(await leerClaveUnidad(pc1)).toBeDefined();

    const mala = await instalarContrasena("otra-contraseña-cualquiera", nube, pc2, false);
    expect(mala).toEqual({ ok: false, error: "Esa no es la contraseña de la unidad." });
    expect(await leerClaveUnidad(pc2)).toBeUndefined();

    expect(await instalarContrasena("contraseña-de-la-unidad", nube, pc2, false)).toEqual({ ok: true, primera: false });
  });

  it("un PC con la clave lee lo que otro cifró; la nube solo guarda el bloque ilegible", async () => {
    const nube = crearApiLocal();
    const pc1 = nuevoPc();
    const pc2 = nuevoPc();
    await instalarContrasena("contraseña-de-la-unidad", nube, pc1, true);
    await instalarContrasena("contraseña-de-la-unidad", nube, pc2, false);

    const k1 = (await leerClaveUnidad(pc1))!;
    await nube.guardarReferencias([await cifrarIdentidad(k1, { episodioId: "ep-1", nombre: "María Pérez", rut: "12345678-5", ficha: null }, new Date())]);

    const r = await nube.leerReferencias();
    if (!r.ok) throw new Error("lectura");
    expect(JSON.stringify(r.referencias)).not.toMatch(/Mar[ií]a|P[eé]rez|12345678/);

    const k2 = (await leerClaveUnidad(pc2))!;
    const filas = soloEpisodios(r.referencias);
    expect(await descifrarIdentidad(k2, filas[0]!)).toMatchObject({ nombre: "María Pérez", rut: "12345678-5" });
  });

  it("al quitar la clave de un PC desaparecen también los nombres descifrados de ese equipo", async () => {
    const nube = crearApiLocal();
    const pc = nuevoPc();
    await instalarContrasena("contraseña-de-la-unidad", nube, pc, true);
    await pc.identidades.put({ episodioId: "ep-1", nombre: "X", rut: null, ficha: null });
    await olvidarClave(pc);
    expect(await leerClaveUnidad(pc)).toBeUndefined();
    expect(await pc.identidades.count()).toBe(0);
  });

  it("rechaza una contraseña corta", async () => {
    const r = await instalarContrasena("corta", crearApiLocal(), nuevoPc(), true);
    expect(r.ok).toBe(false);
  });
});
