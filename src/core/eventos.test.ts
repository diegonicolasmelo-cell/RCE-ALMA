import { describe, expect, it } from "vitest";
import {
  bnmVigente,
  contarIntubaciones,
  estadoProno,
  estadoPve,
  eventosDeRiesgo,
  viaAereaVigente
} from "./eventos";
import { unEvento } from "./fixtures";
import type { EventoClinico } from "./tipos";

const EN = (iso: string) => ({ registradoEn: iso });

describe("viaAereaVigente", () => {
  it("mantiene la via de ingreso si no hay eventos", () => {
    expect(viaAereaVigente("TET", [])).toBe("TET");
  });

  it("una extubacion programada deja la via natural", () => {
    const ev = unEvento<Extract<EventoClinico, { tipo: "EXTUBACION_PROGRAMADA" }>>({
      tipo: "EXTUBACION_PROGRAMADA",
      dispositivo: "CNAF"
    });
    expect(viaAereaVigente("TET", [ev])).toBe("NATURAL");
  });

  it("una autoextubacion tambien deja la via natural", () => {
    const ev = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({
      tipo: "AUTOEXTUBACION",
      dispositivo: "VMNI"
    });
    expect(viaAereaVigente("TET", [ev])).toBe("NATURAL");
  });

  it("aplica los eventos en orden cronologico: extubacion y luego reintubacion", () => {
    const extub = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({
      tipo: "AUTOEXTUBACION",
      dispositivo: "CNAF",
      ...EN("2026-11-04T14:00:00.000Z")
    });
    const reint = unEvento<Extract<EventoClinico, { tipo: "REINTUBACION" }>>({
      tipo: "REINTUBACION",
      via: "TET",
      calibre: "8.0",
      fijacionCm: "22",
      ...EN("2026-11-04T14:40:00.000Z")
    });
    // Se pasan desordenados a proposito: el reductor debe ordenarlos.
    expect(viaAereaVigente("TET", [reint, extub])).toBe("TET");
  });

  it("una traqueostomia muta la via a TQT", () => {
    const ev = unEvento<Extract<EventoClinico, { tipo: "TRAQUEOSTOMIA" }>>({
      tipo: "TRAQUEOSTOMIA",
      calibre: "8.0"
    });
    expect(viaAereaVigente("TET", [ev])).toBe("TQT");
  });

  it("un ajuste de tubo NO altera la via aerea", () => {
    const ev = unEvento<Extract<EventoClinico, { tipo: "AJUSTE_TUBO" }>>({
      tipo: "AJUSTE_TUBO",
      fijacionCm: "23",
      motivo: "DESPLAZAMIENTO_SUPERFICIAL"
    });
    expect(viaAereaVigente("TET", [ev])).toBe("TET");
  });
});

describe("contarIntubaciones", () => {
  it("un ajuste de tubo no contamina la estadistica de intubaciones (regla 3.B)", () => {
    const ajuste = unEvento<Extract<EventoClinico, { tipo: "AJUSTE_TUBO" }>>({
      tipo: "AJUSTE_TUBO",
      fijacionCm: "23",
      motivo: "CONTROL_RADIOLOGICO"
    });
    const reint = unEvento<Extract<EventoClinico, { tipo: "REINTUBACION" }>>({
      tipo: "REINTUBACION",
      via: "TET",
      calibre: "7.5",
      fijacionCm: "21"
    });
    expect(contarIntubaciones([ajuste, ajuste, reint])).toBe(1);
  });
});

describe("estadoPve (cronometro de 30 min)", () => {
  const inicio = unEvento<Extract<EventoClinico, { tipo: "INICIO_PVE" }>>({
    tipo: "INICIO_PVE",
    duracionMin: 30,
    ...EN("2026-11-04T13:00:00.000Z")
  });

  it("no hay PVE activa sin eventos", () => {
    expect(estadoPve([], new Date("2026-11-04T13:00:00.000Z")).activa).toBe(false);
  });

  it("cuenta los minutos transcurridos y restantes", () => {
    const e = estadoPve([inicio], new Date("2026-11-04T13:18:00.000Z"));
    expect(e.activa).toBe(true);
    expect(e.minutosTranscurridos).toBe(18);
    expect(e.minutosRestantes).toBe(12);
    expect(e.completa).toBe(false);
  });

  it("marca completa al cumplir el tiempo de protocolo", () => {
    const e = estadoPve([inicio], new Date("2026-11-04T13:30:00.000Z"));
    expect(e.completa).toBe(true);
    expect(e.minutosRestantes).toBe(0);
  });

  it("no deja minutos restantes negativos si se pasa del tiempo", () => {
    const e = estadoPve([inicio], new Date("2026-11-04T14:30:00.000Z"));
    expect(e.minutosRestantes).toBe(0);
    expect(e.minutosTranscurridos).toBe(90);
  });

  it("un FIN_PVE posterior cierra la prueba", () => {
    const fin = unEvento<Extract<EventoClinico, { tipo: "FIN_PVE" }>>({
      tipo: "FIN_PVE",
      exitosa: true,
      ...EN("2026-11-04T13:31:00.000Z")
    });
    expect(estadoPve([inicio, fin], new Date("2026-11-04T13:40:00.000Z")).activa).toBe(false);
  });
});

describe("estadoProno (horas acumuladas por ciclos)", () => {
  const iniciar = (iso: string) =>
    unEvento<Extract<EventoClinico, { tipo: "INICIO_PRONO" }>>({ tipo: "INICIO_PRONO", ...EN(iso) });
  const supinar = (iso: string) =>
    unEvento<Extract<EventoClinico, { tipo: "SUPINACION" }>>({ tipo: "SUPINACION", ...EN(iso) });

  const ahora = new Date("2026-11-05T12:00:00.000Z");

  it("sin eventos no hay prono", () => {
    const p = estadoProno([], ahora);
    expect(p.enProno).toBe(false);
    expect(p.horasAcumuladas).toBe(0);
    expect(p.ciclosCompletados).toBe(0);
  });

  it("acumula un ciclo cerrado", () => {
    const p = estadoProno(
      [iniciar("2026-11-04T10:00:00.000Z"), supinar("2026-11-05T02:00:00.000Z")],
      ahora
    );
    expect(p.ciclosCompletados).toBe(1);
    expect(p.horasAcumuladas).toBe(16);
    expect(p.enProno).toBe(false);
  });

  it("suma varios ciclos", () => {
    const p = estadoProno(
      [
        iniciar("2026-11-03T10:00:00.000Z"),
        supinar("2026-11-03T22:00:00.000Z"),
        iniciar("2026-11-04T10:00:00.000Z"),
        supinar("2026-11-04T18:00:00.000Z")
      ],
      ahora
    );
    expect(p.ciclosCompletados).toBe(2);
    expect(p.horasAcumuladas).toBe(20);
  });

  it("cuenta el ciclo en curso hasta ahora", () => {
    const p = estadoProno([iniciar("2026-11-05T06:00:00.000Z")], ahora);
    expect(p.enProno).toBe(true);
    expect(p.ciclosCompletados).toBe(0);
    expect(p.horasAcumuladas).toBe(6);
  });

  it("un segundo INICIO_PRONO sin supinacion intermedia no reinicia el reloj", () => {
    const p = estadoProno(
      [iniciar("2026-11-05T06:00:00.000Z"), iniciar("2026-11-05T09:00:00.000Z")],
      ahora
    );
    expect(p.horasAcumuladas).toBe(6);
  });
});

describe("bnmVigente", () => {
  it("queda vigente tras un inicio", () => {
    const ini = unEvento<Extract<EventoClinico, { tipo: "INICIO_BNM" }>>({
      tipo: "INICIO_BNM",
      farmaco: "Rocuronio",
      ...EN("2026-11-04T10:00:00.000Z")
    });
    expect(bnmVigente([ini])).toBe(true);
  });

  it("se apaga con el fin posterior", () => {
    const ini = unEvento<Extract<EventoClinico, { tipo: "INICIO_BNM" }>>({
      tipo: "INICIO_BNM",
      farmaco: "Atracurio",
      ...EN("2026-11-04T10:00:00.000Z")
    });
    const fin = unEvento<Extract<EventoClinico, { tipo: "FIN_BNM" }>>({
      tipo: "FIN_BNM",
      ...EN("2026-11-04T16:00:00.000Z")
    });
    expect(bnmVigente([ini, fin])).toBe(false);
  });
});

describe("eventosDeRiesgo", () => {
  it("selecciona solo los eventos que disparan gestion de riesgo", () => {
    const autoext = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({
      tipo: "AUTOEXTUBACION",
      dispositivo: "CNAF"
    });
    const cultivo = unEvento<Extract<EventoClinico, { tipo: "TOMA_CULTIVO" }>>({
      tipo: "TOMA_CULTIVO",
      muestra: "aspirado traqueal"
    });
    const riesgos = eventosDeRiesgo([autoext, cultivo]);
    expect(riesgos).toHaveLength(1);
    expect(riesgos[0]?.tipo).toBe("AUTOEXTUBACION");
  });
});
