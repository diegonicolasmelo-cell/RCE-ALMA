import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { BaseLocal } from "../datos/db";
import { crearApiLocal } from "../datos/api";
import { useIdentidadesEnMemoria } from "./identidades";
import { borrarIdentidad } from "./purga";
import { olvidarClave } from "./claveUnidad";

const id = (n: string) => ({ episodioId: n, nombre: "María Pérez", rut: "12345678-5", ficha: null });

describe("los nombres descifrados viven solo en memoria", () => {
  beforeEach(() => useIdentidadesEnMemoria.getState().vaciar());

  it("poner, reemplazar y quitar no tocan el disco del navegador", async () => {
    const db = new BaseLocal(`mem-${Math.random()}`);
    useIdentidadesEnMemoria.getState().poner(id("ep-1"));
    useIdentidadesEnMemoria.getState().reemplazar([id("ep-2"), id("ep-3")]);
    expect([...useIdentidadesEnMemoria.getState().mapa.keys()]).toEqual(["ep-2", "ep-3"]);
    expect(await db.identidades.count()).toBe(0);
  });

  it("borrar la identidad la quita de la nube y de la memoria de este PC", async () => {
    const db = new BaseLocal(`mem-${Math.random()}`);
    const nube = crearApiLocal();
    await nube.guardarReferencias([{ episodioId: "ep-1", registradoEn: "x", dato: "v1.a.b" }]);
    useIdentidadesEnMemoria.getState().poner(id("ep-1"));
    expect((await borrarIdentidad(nube, db, "ep-1")).ok).toBe(true);
    expect(useIdentidadesEnMemoria.getState().mapa.has("ep-1")).toBe(false);
    const r = await nube.leerReferencias();
    expect(r.ok && r.referencias.length).toBe(0);
  });

  it("si la nube falla, el nombre sigue en memoria para reintentar", async () => {
    const db = new BaseLocal(`mem-${Math.random()}`);
    const nubeCaida = { ...crearApiLocal(), purgarReferencias: async () => ({ ok: false, error: "SIN_CONEXION" }) };
    useIdentidadesEnMemoria.getState().poner(id("ep-1"));
    expect((await borrarIdentidad(nubeCaida, db, "ep-1")).ok).toBe(false);
    expect(useIdentidadesEnMemoria.getState().mapa.has("ep-1")).toBe(true);
  });

  it("quitar la clave vacía la memoria y cualquier resto en disco", async () => {
    const db = new BaseLocal(`mem-${Math.random()}`);
    await db.identidades.put(id("ep-viejo"));
    useIdentidadesEnMemoria.getState().poner(id("ep-1"));
    await olvidarClave(db);
    expect(useIdentidadesEnMemoria.getState().mapa.size).toBe(0);
    expect(await db.identidades.count()).toBe(0);
  });
});
