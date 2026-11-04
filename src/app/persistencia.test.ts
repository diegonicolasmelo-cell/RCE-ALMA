import { describe, expect, it } from "vitest";
import { VIGENCIA_BORRADOR_MS, borradoresVigentes } from "./persistencia";
import { crearBorradorNuevoControl } from "@core/index";
import { unEpisodio } from "@core/fixtures";

const borrador = crearBorradorNuevoControl(unEpisodio(), null, "x");
const guardado = (t: number) => ({ guardadoEn: t, borradores: { "ep-1": borrador } });

describe("borradores que sobreviven al cierre de la app", () => {
  const ahora = 1_000_000_000;

  it("recupera un borrador reciente", () => {
    expect(borradoresVigentes(guardado(ahora - 60_000), ahora)).toHaveProperty("ep-1");
  });

  it("descarta uno de hace más de 12 h: arrastraría un contexto clínico que ya cambió", () => {
    expect(borradoresVigentes(guardado(ahora - VIGENCIA_BORRADOR_MS - 1), ahora)).toEqual({});
  });

  it("sin nada guardado devuelve vacío", () => {
    expect(borradoresVigentes(undefined, ahora)).toEqual({});
  });
});
