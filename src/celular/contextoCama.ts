import type { BorradorControl, Control, Episodio, EventoClinico, ValidacionApk } from "@core/index";

/** Todo lo que necesita una pestana del celular para la cama seleccionada. */
export interface ContextoCama {
  readonly ep: Episodio;
  readonly ultimo: Control | null;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
  readonly apks: readonly ValidacionApk[];
  readonly b: BorradorControl;
  /** Modifica el borrador de esta cama con una funcion pura. */
  readonly editar: (fn: (b: BorradorControl) => BorradorControl) => void;
  readonly pbw: number;
  readonly ahora: Date;
  readonly rutAutor: string;
}
