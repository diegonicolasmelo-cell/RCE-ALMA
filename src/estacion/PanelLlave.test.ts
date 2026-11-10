import { describe, expect, it } from "vitest";
import { enlaceCelular, limpiarUrlExec } from "./PanelLlave";

const EXEC = "https://script.google.com/macros/s/AKfyc_ABC-123/exec";

describe("dirección /exec pegada desde la barra del navegador", () => {
  it("se limpia sola: #estacion, ?parámetros, espacios y barra final", () => {
    for (const t of [EXEC, ` ${EXEC} `, `${EXEC}#estacion`, `${EXEC}?demo=1#x`, `${EXEC}/`, `Mi app: ${EXEC}`]) {
      expect(limpiarUrlExec(t).url, t).toBe(EXEC);
    }
    expect(limpiarUrlExec("https://script.google.com/a/macros/hospital.cl/s/XYZ/exec#estacion").url).toBe("https://script.google.com/a/macros/hospital.cl/s/XYZ/exec");
  });
  it("explica por qué no sirve: /dev, la interna de Google u otra cosa", () => {
    expect(limpiarUrlExec(EXEC.replace("/exec", "/dev")).motivo).toMatch(/\/dev/);
    expect(limpiarUrlExec("https://n-abc-0lu-script.googleusercontent.com/userCodeAppPanel").motivo).toMatch(/interna/);
    expect(limpiarUrlExec("hola").url).toBeNull();
  });
  it("el enlace del celular lleva la /exec y la llave de la app", () => {
    expect(enlaceCelular("https://diegonicolasmelo-cell.github.io/RCE-ALMA/", EXEC, "LLAVE")).toBe(
      `https://diegonicolasmelo-cell.github.io/RCE-ALMA/#config?u=${encodeURIComponent(EXEC)}&a=LLAVE`
    );
  });
});
