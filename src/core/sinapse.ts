/**
 * RUT chileno y enlace directo a Sinapse desde la tarjeta del paciente.
 *
 * La plantilla del enlace es configuracion (VITE_SINAPSE_URL), no codigo: el
 * formato exacto de la URL de Sinapse depende de la instalacion del hospital.
 *
 * Marcadores admitidos en la plantilla:
 *   {rut}        12345678-5
 *   {rutPuntos}  12.345.678-5
 *   {cuerpo}     12345678
 *   {dv}         5
 */

/** Devuelve "12345678-K" o null si la entrada no tiene forma de RUT. */
export function normalizarRut(entrada: string): string | null {
  const limpio = entrada.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return null;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** Valida forma y digito verificador (modulo 11). */
export function validarRut(entrada: string): boolean {
  const n = normalizarRut(entrada);
  if (n === null) return false;
  const [cuerpo, dv] = n.split("-");
  return cuerpo !== undefined && dv === digitoVerificador(cuerpo);
}

/** "12345678-5" -> "12.345.678-5". */
export function formatearRut(entrada: string): string {
  const n = normalizarRut(entrada);
  if (n === null) return entrada;
  const [cuerpo = "", dv = ""] = n.split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

/**
 * Enlace a Sinapse para un RUT. Devuelve null (y la UI oculta el boton) si el
 * RUT es invalido o no hay plantilla configurada: es preferible no mostrar el
 * enlace a abrir la ficha de otro paciente por un RUT mal tipeado.
 */
export function enlaceSinapse(rut: string | null, plantilla: string): string | null {
  if (rut === null || plantilla.trim() === "" || !validarRut(rut)) return null;
  const n = normalizarRut(rut);
  if (n === null) return null;
  const [cuerpo = "", dv = ""] = n.split("-");
  const reemplazos: Record<string, string> = {
    rut: n,
    rutPuntos: formatearRut(n),
    cuerpo,
    dv
  };
  return plantilla.replace(/\{(rut|rutPuntos|cuerpo|dv)\}/g, (_m, k: string) =>
    encodeURIComponent(reemplazos[k] ?? "")
  );
}
