import { describe, expect, it } from "vitest";
import { unEvento } from "./fixtures";
import { vigenciaFiltros } from "./filtros";
import { hallazgosPendientes, hallazgosSugeridos, rondaDelTurno } from "./ronda";
import type { EventoClinico } from "./tipos";

const en = (d: number, h: number) => new Date(2026, 10, d, h, 0).toISOString();
const ev = (tipo: string, cuando: string, extra: object = {}) => unEvento<EventoClinico>({ tipo, registradoEn: cuando, ...extra } as never);
const ahora = new Date(2026, 10, 23, 15, 0);   // turno día del 23-nov

describe("ronda de equipos", () => {
  it("manda la ÚLTIMA anotación: la ronda corrige la etiqueta aunque sea a un día anterior", () => {
    const eventos = [ev("CAMBIO_HMEF", en(23, 8)), ev("CAMBIO_HMEF", en(23, 11), { fechaEtiqueta: "2026-11-21" })];
    const hme = vigenciaFiltros(eventos, ahora).find((f) => f.elemento === "HME")!;
    expect([hme.cambiadoEn, hme.estado]).toEqual(["2026-11-21", "VENCE_HOY"]);
  });

  it("sugiere los filtros vencidos o que vencen hoy", () => {
    const eventos = [ev("CAMBIO_FILTRO", en(19, 10), { elemento: "TRACHCARE" })];
    expect(hallazgosSugeridos(eventos, ahora).map((h) => h.texto)).toEqual(["TrachCare vencido (etiqueta 19-11)"]);
  });

  it("los hallazgos quedan abiertos hasta que alguien cambia ese filtro después de la ronda", () => {
    const ronda = ev("RONDA_EQUIPOS", en(23, 10), { hallazgos: [{ elemento: "HME", texto: "Filtro HME vencido" }, { texto: "Falta el V60" }] });
    expect(hallazgosPendientes([ronda], ahora)?.hallazgos.length).toBe(2);
    const cambio = ev("CAMBIO_HMEF", en(23, 12));
    expect(hallazgosPendientes([ronda, cambio], ahora)?.hallazgos.map((h) => h.texto)).toEqual(["Falta el V60"]);
  });

  it("una ronda de otro turno no cuenta", () => {
    expect(rondaDelTurno([ev("RONDA_EQUIPOS", en(22, 10), { hallazgos: [] })], ahora)).toBeNull();
  });
});
