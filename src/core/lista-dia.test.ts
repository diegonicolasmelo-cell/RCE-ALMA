import { describe, expect, it } from "vitest";
import { listaDelDiaHtml } from "./lista-dia";

describe("Lista de pacientes del día (médico)", () => {
  const fila = { cama: "Cama 3", nombre: "Paciente <Prueba>", edad: 64, diaEstadia: 5, via: "TOT · VM 4 d", ultimo: "10:40 · ACVC · FiO2 40", apk: "No cumple 09:40 DM", alertas: ["BNM"] };
  it("una fila por cama, con la columna de notas en blanco y sin RUT", () => {
    const h = listaDelDiaHtml([fila], "28-11-2026", "día");
    expect(h).toContain("Cama 3");
    expect(h).toContain("Paciente &lt;Prueba&gt;");
    expect(h).toContain('<td class="nota"></td>');
    expect(h).toContain('class="neg">No cumple');
    expect(h).toContain("Turno día");
    expect(h).not.toMatch(/RUT|RUN/);
  });
  it("sin pacientes lo dice", () => {
    expect(listaDelDiaHtml([], "28-11-2026", "noche")).toContain("Sin pacientes en la unidad.");
  });
});
