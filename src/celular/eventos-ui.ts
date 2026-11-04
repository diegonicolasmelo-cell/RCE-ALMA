import type { Episodio } from "@core/index";
import { horaDe, nuevoId } from "../app/util";

/** Campos comunes de todo evento clinico. */
export function baseEvento(ep: Episodio, rutAutor: string, ahora: Date, comentario = "") {
  return {
    id: nuevoId(),
    episodioId: ep.id,
    hora: horaDe(ahora),
    registradoEn: ahora.toISOString(),
    rutAutor,
    comentario
  };
}
