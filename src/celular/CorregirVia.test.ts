import { describe, expect, it } from "vitest";
import { unEpisodio } from "@core/fixtures";
import { corregirVia } from "./CorregirVia";

describe("corregir un dato mal anotado de la vía aérea", () => {
  const ep = unEpisodio({ viaAereaActual: "TET", calibreVia: "7.5", fijacionCm: "22" });
  const ahora = new Date(2026, 10, 11, 9, 40);
  it("cambia el dato y deja constancia de quién, cuándo y el valor previo", () => {
    const c = corregirVia(ep, "8.0", "23", "diego.melo@demo.upc", ahora);
    expect([c.calibreVia, c.fijacionCm]).toEqual(["8.0", "23"]);
    expect(c.correcciones?.map((x) => [x.campo, x.antes, x.despues])).toEqual([["calibre", "7.5", "8.0"], ["fijacion", "22", "23"]]);
    expect(c.correcciones?.[0]?.rutAutor).toBe("diego.melo@demo.upc");
  });
  it("sin cambios no deja constancia", () => {
    expect(corregirVia(ep, "7.5", "22", "x@y.cl", ahora)).toBe(ep);
  });
  it("con TQT no hay cm que corregir", () => {
    const tqt = unEpisodio({ viaAereaActual: "TQT", calibreVia: "8", fijacionCm: "Collarín" });
    const c = corregirVia(tqt, "7", "30", "x@y.cl", ahora);
    expect([c.calibreVia, c.fijacionCm]).toEqual(["7", "Collarín"]);
  });
});
