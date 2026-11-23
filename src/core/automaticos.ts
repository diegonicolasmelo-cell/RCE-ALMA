/**
 * Eventos que se registran SOLOS al guardar un control (Diego, 23-nov-2026: «suspensión de
 * sedación y BNM, pero que sea automático cuando se guarda el control»).
 *
 * Se compara el control nuevo con el control vigente anterior del mismo episodio:
 *  · el anterior tenía uno o más sedantes y el nuevo ninguno  → SUSPENSION_SEDACION
 *  · el anterior tenía bloqueo neuromuscular y el nuevo no    → FIN_BNM
 *  · el anterior tenía DVA (vasopresor o inótropo) y el nuevo ninguna → SUSPENSION_DVA
 * Bajar la dosis o cambiar un sedante por otro NO es suspensión. Una corrección de un control
 * no genera eventos (el control original ya los generó o no). El evento queda con la hora del
 * control, y su id sale del control: guardarlo dos veces no lo duplica.
 */
import { infusionesActivas } from "./infusiones";
import type { Control, EventoClinico } from "./tipos";

/** El control vigente inmediatamente anterior (los corregidos se reemplazan por su corrección). */
function anteriorVigente(nuevo: Control, previos: readonly Control[]): Control | null {
  const delEpisodio = previos.filter((c) => c.episodioId === nuevo.episodioId && c.id !== nuevo.id);
  const corregidos = new Set(delEpisodio.map((c) => c.corrige).filter((x): x is string => !!x));
  const vigentes = delEpisodio.filter((c) => !corregidos.has(c.id) && c.registradoEn < nuevo.registradoEn);
  vigentes.sort((a, b) => (a.registradoEn < b.registradoEn ? -1 : a.registradoEn > b.registradoEn ? 1 : 0));
  return vigentes[vigentes.length - 1] ?? null;
}

export function eventosAutomaticosDelControl(nuevo: Control, previos: readonly Control[]): readonly EventoClinico[] {
  if (nuevo.corrige) return [];
  const ant = anteriorVigente(nuevo, previos);
  if (!ant) return [];
  const base = { episodioId: nuevo.episodioId, hora: nuevo.hora, registradoEn: nuevo.registradoEn, rutAutor: nuevo.rutAutor, comentario: "" };
  const out: EventoClinico[] = [];
  const sedAntes = infusionesActivas(ant.infusiones, "SEDANTE");
  if (sedAntes.length && !infusionesActivas(nuevo.infusiones, "SEDANTE").length) {
    out.push({ ...base, id: `${nuevo.id}-sed`, tipo: "SUSPENSION_SEDACION", farmacos: sedAntes.map((x) => x.nombre) });
  }
  const dva = (c: Control) => [...infusionesActivas(c.infusiones, "DVA"), ...infusionesActivas(c.infusiones, "INOTROPO")];
  const dvaAntes = dva(ant);
  if (dvaAntes.length && !dva(nuevo).length) {
    out.push({ ...base, id: `${nuevo.id}-dva`, tipo: "SUSPENSION_DVA", farmacos: dvaAntes.map((x) => x.nombre) });
  }
  if (infusionesActivas(ant.infusiones, "BNM").length && !infusionesActivas(nuevo.infusiones, "BNM").length) {
    out.push({ ...base, id: `${nuevo.id}-bnm`, tipo: "FIN_BNM" });
  }
  return out;
}
