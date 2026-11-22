import { describe, expect, it } from "vitest";
import { unControl, unEvento } from "./fixtures";
import { florecioElDesierto, logrosDe, LOGROS } from "./logros";
import type { EventoClinico } from "./tipos";

const YO = "diego.melo@demo.upc";
const OTRO = "otro@demo.upc";
/** Un instante local (AAAA, mes 1-12, dia, hora, minuto) en ISO. */
const en = (d: number, h: number, m = 0): string => new Date(2026, 10, d, h, m).toISOString();
const estado = (id: string, l: ReturnType<typeof logrosDe>) => l.find((x) => x.id === id)!;

describe("logros secretos", () => {
  it("hay 15 personajes y ninguno se gana sin registrar nada", () => {
    expect(LOGROS).toHaveLength(15);
    expect(logrosDe(YO, [], [], []).every((l) => !l.ganado)).toBe(true);
  });

  it("el chuncho: 50 controles registrados EN VIVO entre las 4 y las 5 (Diego, 22-nov)", () => {
    const de4 = Array.from({ length: 49 }, (_, i) => unControl({ id: `c${i}`, registradoEn: en(1 + (i % 20), 4, i % 60) }));
    expect(estado("chuncho", logrosDe(YO, de4, [], [])).ganado).toBe(false);
    const cincuenta = [...de4, unControl({ id: "c50", registradoEn: en(21, 4, 30) })];
    expect(estado("chuncho", logrosDe(YO, cincuenta, [], [])).ganado).toBe(true);
    // A las 5:00 ya no cuenta, ni los de otra persona.
    const fuera = [...de4, unControl({ id: "c5", registradoEn: en(21, 5, 0) })];
    expect(estado("chuncho", logrosDe(YO, fuera, [], [])).ganado).toBe(false);
    expect(estado("chuncho", logrosDe(YO, [...de4, unControl({ id: "x", registradoEn: en(22, 4), rutAutor: OTRO })], [], [])).ganado).toBe(false);
  });

  it("el guanaco: 3 traslados (a imagen o de cama)", () => {
    const t = (id: string, tipo: "TRASLADO_IMAGEN" | "TRASLADO_CAMA", d: number) =>
      unEvento<EventoClinico>({ id, tipo, registradoEn: en(d, 10) } as never);
    const dos = [t("a", "TRASLADO_IMAGEN", 1), t("b", "TRASLADO_CAMA", 2)];
    expect(estado("guanaco", logrosDe(YO, [], dos, [])).ganado).toBe(false);
    const tres = logrosDe(YO, [], [...dos, t("c", "TRASLADO_IMAGEN", 3)], []);
    expect(estado("guanaco", tres).ganado).toBe(true);
    expect(estado("guanaco", tres).ganadoEn).toBe(en(3, 10));
  });

  it("la colonia: controles en 5 camas distintas en un mismo turno", () => {
    const cinco = ["e1", "e2", "e3", "e4", "e5"].map((ep, i) => unControl({ id: ep, episodioId: ep, registradoEn: en(5, 9 + i) }));
    expect(estado("pinguino", logrosDe(YO, cinco.slice(0, 4), [], [])).ganado).toBe(false);
    expect(estado("pinguino", logrosDe(YO, cinco, [], [])).ganado).toBe(true);
  });

  it("de pie: una terapia física de nivel 4 o más", () => {
    const tf = (nivel: number) => unEvento<EventoClinico>({ tipo: "TERAPIA_FISICA", nivel, registradoEn: en(6, 11) } as never);
    expect(estado("copiapoa", logrosDe(YO, [], [tf(3)], [])).ganado).toBe(false);
    expect(estado("copiapoa", logrosDe(YO, [], [tf(4)], [])).ganado).toBe(true);
  });

  it("el desierto florece solo con todos los personajes", () => {
    expect(florecioElDesierto(logrosDe(YO, [unControl()], [], []))).toBe(false);
  });
});
