import { beforeEach, describe, expect, it } from "vitest";
import { RETOMAR_BORRADOR_MS, useApp } from "./store";
import type { BorradorControl } from "@core/index";

const base = { fc: "" } as unknown as BorradorControl;

describe("un control nuevo parte en blanco", () => {
  beforeEach(() => useApp.setState({ borradores: {}, editados: {}, vista: "camas", camaId: null }));

  it("al abrir una cama se descarta lo que quedo de un control anterior", () => {
    useApp.getState().editar("ep-1", base, (b) => ({ ...b, fc: "80" }));
    useApp.setState({ editados: { "ep-1": Date.now() - RETOMAR_BORRADOR_MS - 1000 } });
    useApp.getState().irA("cama", "ep-1");
    expect(useApp.getState().borradores["ep-1"]).toBeUndefined();
  });

  it("si se interrumpio hace poco, se retoma lo que se estaba escribiendo", () => {
    useApp.getState().editar("ep-1", base, (b) => ({ ...b, fc: "80" }));
    useApp.getState().irA("camas");
    useApp.getState().irA("cama", "ep-1");
    expect(useApp.getState().borradores["ep-1"]?.fc).toBe("80");
  });
});
