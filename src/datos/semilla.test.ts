import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { BaseLocal } from "./db";
import { Sincronizador } from "./sync";
import { Repositorio } from "./repositorio";
import { sembrarSiVacia } from "./semilla";
import { crearApiLocal } from "./api";
import { parsearHash } from "./config";
import { calcularDerivados, calcularPbw, contieneDatoIdentificable, apkVigente, turnoDe, turnoAnterior, validarRut } from "@core/index";

async function sembrada() {
  const db = new BaseLocal(`semilla-${Math.random()}`);
  const sync = new Sincronizador(db, crearApiLocal());
  const repo = new Repositorio(db, sync);
  const ahora = new Date(2026, 10, 4, 15, 0);
  await sembrarSiVacia(db, repo, ahora);
  return { db, sync, repo, ahora };
}

describe("datos de demostración", () => {
  it("crea ocho camas y es idempotente", async () => {
    const { db, repo, ahora } = await sembrada();
    expect(await db.episodios.count()).toBe(8);
    expect(await sembrarSiVacia(db, repo, ahora)).toBe(false);
    expect(await db.episodios.count()).toBe(8);
  });

  it("todos los controles se pueden evaluar sin romper el cálculo clínico", async () => {
    const { db } = await sembrada();
    for (const c of await db.controles.toArray()) {
      const ep = (await db.episodios.get(c.episodioId))!;
      expect(() => calcularDerivados(c, calcularPbw(ep.tallaCm, ep.sexo))).not.toThrow();
    }
  });

  it("nada de lo encolado para la nube lleva identidad (el canal clínico está limpio)", async () => {
    const { db } = await sembrada();
    for (const e of await db.cola.toArray()) expect(contieneDatoIdentificable(e.payload)).toEqual([]);
  });

  it("la identidad vive solo en su propia tabla, con RUT de dígito verificador válido", async () => {
    const { db } = await sembrada();
    const ids = await db.identidades.toArray();
    expect(ids).toHaveLength(8);
    expect(ids.every((i) => i.rut !== null && validarRut(i.rut))).toBe(true);
    const episodio = JSON.stringify(await db.episodios.toArray());
    expect(episodio).not.toContain("Prueba");
  });

  it("la APK del turno anterior existe, pero la de este turno falta (hay que firmarla)", async () => {
    const { db, ahora } = await sembrada();
    const apks = await db.apk.toArray();
    expect(apks).toHaveLength(3);
    expect(apkVigente(apks, "ep-01", ahora)).toBeNull();
    expect(apks[0]?.turno).toBe(turnoAnterior(ahora).clave);
    expect(turnoAnterior(ahora).clave).not.toBe(turnoDe(ahora).clave);
  });

  it("los equipos se nombran por modelo y número, con el Servo U único", async () => {
    const { db } = await sembrada();
    const e1 = (await db.episodios.get("ep-01"))!;
    expect(e1.equipos.find((e) => e.modelo === "Servo U")?.numero).toBeNull();
    expect((await db.episodios.get("ep-03"))!.equipos[0]).toMatchObject({ modelo: "Vela", numero: 8 });
  });

  it("la cama en prono tiene su evento y la de neuromonitoreo su monitoreo activo", async () => {
    const { db } = await sembrada();
    expect((await db.eventos.where("episodioId").equals("ep-04").toArray())[0]?.tipo).toBe("INICIO_PRONO");
    expect((await db.episodios.get("ep-02"))!.monitoreo).toEqual({ capnografia: true, pic: true, dve: true });
  });
});

describe("parsearHash", () => {
  it("separa la ruta del token de estación y lo quita de la barra", () => {
    expect(parsearHash("#estacion?t=ABC123")).toEqual({ ruta: "estacion", token: "ABC123", sinToken: "#estacion" });
  });
  it("sin token deja el hash como está", () => {
    expect(parsearHash("#celular")).toEqual({ ruta: "celular", token: null, sinToken: "#celular" });
    expect(parsearHash("")).toEqual({ ruta: "", token: null, sinToken: "" });
  });
  it("acepta el token solo", () => {
    expect(parsearHash("#t=XYZ")).toEqual({ ruta: "", token: "XYZ", sinToken: "" });
  });
});
