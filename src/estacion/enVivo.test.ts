import { describe, expect, it } from "vitest";
import { unControl, unEpisodio, unEvento, unaVentilacion } from "@core/fixtures";
import type { EventoClinico } from "@core/index";
import { FILAS_HOJA, columnasMosaico, fichaEnVivo, fichasEnVivo, filaControl, inicioHoja, pasadoAAlma, segmentosDeCamas, textoViaAerea, vigentes } from "./enVivo";

// Todo ficticio: hora local para que la hoja de las 08:00 no dependa del huso del equipo.
const en = (h: number, m = 0, dia = 4): string => new Date(2026, 10, dia, h, m).toISOString();
const AHORA = new Date(2026, 10, 4, 15, 0);
const ctl = (id: string, hora: string, h: number, m = 0, dia = 4, over = {}) =>
  unControl({ id, hora, registradoEn: en(h, m, dia), ...over });

describe("Kaptus en vivo · vía aérea", () => {
  it("TET con número y distancia, TQT con número, o vía natural", () => {
    expect(textoViaAerea({ viaAereaActual: "TET", calibreVia: "7.5", fijacionCm: "22" })).toBe("TET Nº 7,5 · 22 cm");
    expect(textoViaAerea({ viaAereaActual: "TET", calibreVia: null, fijacionCm: null })).toBe("TET Nº — · —");
    expect(textoViaAerea({ viaAereaActual: "TQT", calibreVia: "8", fijacionCm: null })).toBe("TQT Nº 8");
    expect(textoViaAerea({ viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null })).toBe("Vía natural");
  });
});

describe("Kaptus en vivo · hoja y ALMA", () => {
  it("la hoja empieza a las 08:00; a las 02:00 todavía es la hoja de ayer", () => {
    expect(inicioHoja(AHORA).getTime()).toBe(new Date(2026, 10, 4, 8, 0).getTime());
    expect(inicioHoja(new Date(2026, 10, 5, 2, 0)).getTime()).toBe(new Date(2026, 10, 4, 8, 0).getTime());
  });

  it("pasado a ALMA según la hora de transcripción del episodio, también después de medianoche", () => {
    const ep = { transcritoAlma: true, horaTranscripcion: "01:30" };
    expect(pasadoAAlma("22:00", ep)).toBe(true);
    expect(pasadoAAlma("01:30", ep)).toBe(true);
    expect(pasadoAAlma("03:00", ep)).toBe(false);
    expect(pasadoAAlma("09:00", { transcritoAlma: false, horaTranscripcion: null })).toBe(false);
  });

  it("solo cuenta los controles de la hoja y marca pendientes los posteriores a la transcripción", () => {
    const ep = unEpisodio({ transcritoAlma: true, horaTranscripcion: "11:00" });
    const f = fichaEnVivo(ep, [ctl("a", "06:00", 6), ctl("b", "10:00", 10), ctl("c", "13:00", 13)], [], AHORA);
    expect(f.controles.map((c) => c.id)).toEqual(["b", "c"]);
    expect(f.controles.map((c) => c.enAlma)).toEqual([true, false]);
    expect(f.pendientesAlma).toBe(1);
    expect(f.deEstaHoja).toBe(true);
  });

  it("sin controles en la hoja muestra el último anterior, sin contarlo como pendiente y marcado viejo", () => {
    const f = fichaEnVivo(unEpisodio(), [ctl("a", "05:00", 5), ctl("b", "06:00", 6)], [], AHORA);
    expect(f.controles.map((c) => c.id)).toEqual(["b"]);
    expect(f.deEstaHoja).toBe(false);
    expect(f.pendientesAlma).toBe(0);
    expect(f.ultimoViejo).toBe(true);
  });

  it("un control corregido se reemplaza por su corrección", () => {
    const l = vigentes([ctl("a", "10:00", 10), ctl("b", "10:00", 10, 5, 4, { corrige: "a" })]);
    expect(l.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("Kaptus en vivo · ficha", () => {
  it("dice sexo y rango de edad; sin identidad descifrada no hay iniciales", () => {
    const f = fichaEnVivo(unEpisodio({ sexo: "F", rangoEdad: "45–49" }), [ctl("a", "10:00", 10)], [], AHORA);
    expect(f.paciente).toBe("F · 45–49");
    expect(f.iniciales).toBeNull();
    expect(JSON.stringify(f)).not.toContain("@");
  });

  it("con la identidad descifrada en este PC muestra solo las iniciales, nunca el nombre", () => {
    const ident = new Map([["ep-1", { nombre: "Paciente Ficticio Prueba" }]]);
    const [f] = fichasEnVivo([unEpisodio()], new Map(), new Map(), AHORA, ident);
    expect(f!.iniciales).toBe("PFP");
    expect(JSON.stringify(f)).not.toContain("Ficticio");
  });

  it("los días de VM salen de la regla de Kaptus (pve.ts): horas el primer día, días después", () => {
    const ep = unEpisodio({ diasVM: 0, ingresadoEn: en(7, 0) });
    expect(fichaEnVivo(ep, [], [], AHORA).vm).toBe("8 h");
    const reint = unEvento<Extract<EventoClinico, { tipo: "REINTUBACION" }>>({ tipo: "REINTUBACION", via: "TET", calibre: "7.5", fijacionCm: "22", registradoEn: en(10, 0, 1) });
    expect(fichaEnVivo(ep, [], [reint], AHORA).vm).toBe("3 d");
    expect(fichaEnVivo(unEpisodio({ viaAereaActual: "NATURAL", diasVM: 0 }), [], [reint], AHORA).vm).toBe("");
  });

  it("valores en el orden de la ficha, con coma decimal, PAM y ΔP del núcleo", () => {
    const c = ctl("a", "10:00", 10, 0, 4, {
      infusiones: { noradrenalina: { dosis: 0.12, escalon: null }, fentanilo: { dosis: 1, escalon: 2 }, propofol: { dosis: 20, escalon: 3 } },
      glasgow: { ocular: 3, verbal: 1, motora: 5 },
      ventilacion: unaVentilacion({ fio2: 40, peep: 8, pPlateau: 21.5 })
    });
    const f = filaControl(c, 67.8, false);
    expect(f.fc).toBe("96");
    expect(f.pa).toBe("112/62");
    expect(f.pam).toBe("79");
    expect(f.dva).toEqual(["NA 0,12"]);
    expect(f.gcs).toBe("9T");
    expect(f.sasE).toBe("3/3");
    expect([f.peep, f.fio2, f.sat, f.vt, f.fr, f.pp, f.dp]).toEqual(["8", "40", "95", "430", "20", "21,5", "13,5"]);
    expect(f.soporte).toBe("VMI");
  });

  it("con asincronía en modo controlado el plateau y la ΔP quedan bloqueados, nunca un número falso", () => {
    const f = filaControl(ctl("a", "10:00", 10, 0, 4, { ventilacion: unaVentilacion({ asincronico: true }) }), 67.8, false);
    expect([f.pp, f.dp]).toEqual(["bloq.", "bloq."]);
  });

  it("SAT bajo 90 % marca la ficha", () => {
    expect(filaControl(ctl("a", "10:00", 10, 0, 4, { spo2: 88 }), 67.8, false).satBaja).toBe(true);
    expect(filaControl(ctl("a", "10:00", 10), 67.8, false).satBaja).toBe(false);
  });

  it("ordena por número de cama y deja fuera los egresados", () => {
    const eps = [unEpisodio({ id: "x", cama: "UCI-12" }), unEpisodio({ id: "y", cama: "UCI-03" }), unEpisodio({ id: "z", cama: "UCI-07", activo: false })];
    expect(fichasEnVivo(eps, new Map(), new Map(), AHORA).map((f) => f.numero)).toEqual([3, 12]);
  });
});

describe("Kaptus en vivo · paginación y hoja por cama", () => {
  it("18 camas en tres segmentos de seis", () => {
    const s = segmentosDeCamas();
    expect(s.length).toBe(3);
    expect(s[1]).toEqual(["UCI-07", "UCI-08", "UCI-09", "UCI-10", "UCI-11", "UCI-12"]);
  });

  it("la hoja trae monitorización y terapia ventilatoria con los rótulos de la carilla", () => {
    expect(FILAS_HOJA.filter((f) => f.grupo === "MONITORIZACIÓN").map((f) => f.etiqueta)).toContain("SAS/Escalón");
    expect(FILAS_HOJA.at(-1)!.etiqueta).toBe("Firma");
  });
});

describe("Kaptus en vivo · mosaico", () => {
  it("seis fichas caben en una fila si cada una queda legible; si no, pasan a dos filas", () => {
    expect(columnasMosaico(659, 520, 6)).toBe(6);
    expect(columnasMosaico(1342, 520, 6)).toBe(6);
    expect(columnasMosaico(300, 520, 6)).toBe(3);
  });
});
