import { describe, expect, it } from "vitest";
import { choque, droga, dosisAmiodarona, duracionMin, elegirRitmo, eventoDeCodigo, finDeCiclo, iniciarCodigo, reloj, ritmoVerificado, terminar, volverAlCodigo, cambiarBpm, cuantasDrogas } from "./codigo-pcr";
import { describirEvento } from "./nota-alma";

const t0 = new Date(2026, 10, 13, 10, 42, 0);
const en = (seg: number): Date => new Date(t0.getTime() + seg * 1000);

describe("codigo PCR en vivo", () => {
  it("parte en el ciclo 1 con metronomo a 110 y anota el inicio", () => {
    const c = iniciarCodigo("c1", t0, null);
    expect(c.bpm).toBe(110);
    expect(c.ciclo).toBe(1);
    expect(c.bitacora[0]).toEqual({ hora: "10:42:00", transcurrido: "00:00", texto: "Inicio del código · RCP ciclo 1" });
    expect(cambiarBpm(c, 20).bpm).toBe(120);
    expect(cambiarBpm(c, -20).bpm).toBe(100);
  });
  it("el choque toma el ritmo actual y la energia; las drogas llevan su dosis", () => {
    let c = iniciarCodigo("c1", t0, null);
    c = elegirRitmo(c, en(30), "TVSP");
    c = choque(c, en(40));
    c = droga(c, en(60), "Epinefrina", "1 mg");
    expect(dosisAmiodarona(c)).toBe("300 mg");
    c = droga(c, en(90), "Amiodarona", dosisAmiodarona(c));
    expect(dosisAmiodarona(c)).toBe("150 mg");
    expect(c.bitacora.map((e) => e.texto)).toEqual(["Inicio del código · RCP ciclo 1", "Ritmo: TV sin pulso", "Choque #1 · 200 J · TV sin pulso", "Epinefrina 1 mg", "Amiodarona 300 mg"]);
    expect(c.bitacora[2]?.transcurrido).toBe("00:40");
    expect(c.ultimaEpi).toBe(en(60).toISOString());
    expect(cuantasDrogas(c)).toBe(2);
  });
  it("al fin del ciclo se pausa y, verificado el ritmo, parte el ciclo siguiente", () => {
    let c = finDeCiclo(iniciarCodigo("c1", t0, null), en(120));
    expect(c.enPausa).toBe(true);
    c = ritmoVerificado(c, en(127), "ASISTOLIA");
    expect(c.enPausa).toBe(false);
    expect(c.ciclo).toBe(2);
    expect(c.ritmo).toBe("ASISTOLIA");
    expect(c.cicloInicio).toBe(en(127).toISOString());
  });
  it("al terminar queda un evento PCR con duracion real, ROSC, choques y bitacora; y se puede volver al codigo", () => {
    let c = choque(iniciarCodigo("c1", t0, "ep1"), en(100));
    c = terminar(c, en(552), true);
    expect(duracionMin(c)).toBe(9);
    const ev = eventoDeCodigo(c, { id: "e1", episodioId: "ep1", hora: "10:51", registradoEn: en(560).toISOString(), rutAutor: "k", comentario: "" });
    expect(ev).toMatchObject({ tipo: "PCR", hora: "10:42", duracionReanimacionMin: 9, rosc: true, choques: 1, realizadaEn: t0.toISOString() });
    expect(describirEvento(ev)).toBe("Paro cardiorrespiratorio, reanimación 9 min, con ROSC, 1 choque");
    const vuelta = volverAlCodigo(c, en(560));
    expect(vuelta.termino).toBeNull();
    expect(vuelta.bitacora.map((e) => e.texto).slice(-2)).toEqual(["Choque #1 · 200 J · FV", "Se retoma el código"]);
  });
  it("el reloj pasa a horas despues de 60 minutos", () => {
    expect(reloj(378)).toBe("06:18");
    expect(reloj(3725)).toBe("1:02:05");
  });
});

describe("la bitacora llega al informe de riesgo del PC", async () => {
  const { componerInformeRiesgo } = await import("./riesgo");
  const { unEpisodio } = await import("./fixtures");
  it("el informe pre-llenado trae cada linea del codigo", () => {
    let c = choque(iniciarCodigo("c1", t0, "ep1"), en(65));
    c = terminar(c, en(300), false);
    const ev = eventoDeCodigo(c, { id: "e1", episodioId: "ep1", hora: "10:47", registradoEn: en(310).toISOString(), rutAutor: "k", comentario: "" });
    const txt = componerInformeRiesgo({ episodio: unEpisodio(), identidad: null, evento: ev, controles: [] });
    expect(txt).toContain("Bitácora de la reanimación:");
    expect(txt).toContain("10:43:05  +01:05  Choque #1 · 200 J · FV");
    expect(txt).toContain("Término sin ROSC");
  });
});
