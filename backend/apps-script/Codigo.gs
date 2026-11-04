/**
 * UPC-Pulse — API de Google Apps Script sobre Google Sheets.
 *
 * ADVERTENCIA DE ARQUITECTURA, A LA VISTA A PROPOSITO
 * ---------------------------------------------------
 * Este script corre en servidores de Google, NO en la intranet del hospital.
 * Apps Script no puede leer la IP del cliente: no existe allowlist por IP.
 *
 * DECISION DEL USUARIO (riesgo aceptado): nombre y RUT del paciente se guardan
 * en la hoja "identidad" para estar disponibles en cualquier PC de la UCI y
 * abrir Sinapse por RUT. Las defensas son estas tres:
 *   1. Dos tokens. El celular solo tiene APP_TOKEN y el servidor NUNCA le
 *      entrega la hoja de identidad. Solo los PC tienen STATION_TOKEN.
 *   2. Hojas separadas. El canal clinico rechaza cualquier llave identificable
 *      (validarSinIdentidad), asi un bug del celular no puede escribir un nombre.
 *   3. Purga al alta (purgarIdentidad): la hoja no acumula pacientes historicos.
 * Ver docs/PLAN-MAESTRO.md capitulos 1 y 3.
 *
 * MODELO: APPEND-ONLY
 * -------------------
 * Nunca se edita ni se borra una fila. Una correccion es una fila nueva que
 * referencia a la anterior. Eso hace la sincronia idempotente (el UUID generado
 * en el cliente deduplica), da trazabilidad gratis y elimina la clase entera de
 * errores de escritura concurrente desde varios celulares.
 */

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

/** Nombres de las hojas del libro. */
var HOJAS = {
  EPISODIOS: "episodios",
  CONTROLES: "controles",
  EVENTOS: "eventos",
  APK: "apk",
  USUARIOS: "usuarios",
  IDENTIDAD: "identidad",
  AUDITORIA: "auditoria"
};

/**
 * Llaves prohibidas. Espejo de LLAVES_PROHIBIDAS en src/core/sanitizar.ts.
 * Si se agrega una alla, hay que agregarla aqui.
 */
var LLAVES_PROHIBIDAS = [
  "nombre", "nombrepaciente", "apellido", "apellidos", "iniciales",
  "rut", "run", "ficha", "nficha", "numeroficha", "fechanacimiento",
  "fechadenacimiento", "direccion", "telefono", "prevision", "identidad"
];

/** Identifican al profesional, no al paciente: necesarios para la trazabilidad. */
var LLAVES_PERMITIDAS = ["rutautor", "ruttitular"];

var MAX_REGISTROS_POR_LOTE = 200;

// ---------------------------------------------------------------------------
// Puntos de entrada HTTP
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    var cuerpo = JSON.parse(e.postData.contents);

    // El canal de identidad exige el token de estacion; el resto, el de app.
    var esAccionIdentidad =
      cuerpo.accion === "guardarIdentidad" || cuerpo.accion === "purgarIdentidad";
    var autorizado = esAccionIdentidad
      ? tokenEstacionValido(cuerpo.token)
      : tokenValido(cuerpo.token);
    if (!autorizado) {
      return respuesta({ ok: false, error: "TOKEN_INVALIDO" });
    }

    switch (cuerpo.accion) {
      case "guardarIdentidad":
        return respuesta(guardarIdentidad(cuerpo.identidades));
      case "purgarIdentidad":
        return respuesta(purgarIdentidad(cuerpo.episodioIds));
      case "login":
        return respuesta(login(cuerpo.rut, cuerpo.pin));
      case "definirPin":
        return respuesta(definirPin(cuerpo.rut, cuerpo.pinActual, cuerpo.pinNuevo));
      case "sincronizar":
        return respuesta(sincronizar(cuerpo));
      default:
        return respuesta({ ok: false, error: "ACCION_DESCONOCIDA" });
    }
  } catch (err) {
    return respuesta({ ok: false, error: "ERROR_INTERNO", detalle: String(err) });
  }
}

function doGet(e) {
  try {
    if (e.parameter.recurso === "identidad") {
      if (!tokenEstacionValido(e.parameter.token)) {
        return respuesta({ ok: false, error: "TOKEN_INVALIDO" });
      }
      return respuesta({ ok: true, identidades: leerHoja(HOJAS.IDENTIDAD, "") });
    }
    if (!tokenValido(e.parameter.token)) {
      return respuesta({ ok: false, error: "TOKEN_INVALIDO" });
    }
    // `desde` es un ISO 8601; permite sincronia incremental en vez de leer todo.
    return respuesta(leer(e.parameter.desde || ""));
  } catch (err) {
    return respuesta({ ok: false, error: "ERROR_INTERNO", detalle: String(err) });
  }
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---------------------------------------------------------------------------
// Autenticacion
// ---------------------------------------------------------------------------

/**
 * El token de app no es seguridad real: la URL del web app ya es la credencial.
 * Sirve para que un escaneo casual no escriba en la hoja. La autenticacion real
 * del profesional es el PIN.
 */
function tokenValido(token) {
  var esperado = PropertiesService.getScriptProperties().getProperty("APP_TOKEN");
  return Boolean(esperado) && token === esperado;
}

/**
 * Token de estacion: solo lo tienen los PC. Se distribuye como marcador
 * (`.../estacion#t=TOKEN`): el fragmento no viaja al servidor y la app lo
 * guarda en el navegador al primer uso, asi no se re-tipea en cada turno.
 */
function tokenEstacionValido(token) {
  var esperado = PropertiesService.getScriptProperties().getProperty("STATION_TOKEN");
  return Boolean(esperado) && token === esperado;
}

/**
 * Hash del PIN.
 *
 * LIMITACION HONESTA: Apps Script no ofrece bcrypt ni scrypt. Se usa SHA-256
 * con sal por usuario mas una pimienta en ScriptProperties e iteraciones. Para
 * un PIN de 4-6 digitos esto NO resiste a un atacante que obtenga la hoja y
 * tenga tiempo: el espacio de busqueda es pequeno. Es una barrera contra la
 * suplantacion casual entre colegas, que es la amenaza real aqui, no contra un
 * atacante decidido. Si la firma APK llega a tener valor medico-legal formal,
 * hay que migrar a login institucional (LDAP/AD) o a un servidor propio.
 */
function hashPin(pin, sal) {
  var pimienta = PropertiesService.getScriptProperties().getProperty("PIN_PEPPER") || "";
  var dato = sal + ":" + pin + ":" + pimienta;
  for (var i = 0; i < 1000; i++) {
    dato = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, dato)
    );
  }
  return dato;
}

function nuevaSal() {
  return Utilities.getUuid().replace(/-/g, "");
}

function filaUsuario(rut) {
  var hoja = hojaPorNombre(HOJAS.USUARIOS);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim().toUpperCase() === String(rut).trim().toUpperCase()) {
      return { fila: i + 1, rut: datos[i][0], sal: datos[i][1], hash: datos[i][2] };
    }
  }
  return null;
}

function login(rut, pin) {
  var u = filaUsuario(rut);
  if (!u) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };
  if (!u.hash) return { ok: false, error: "PIN_NO_DEFINIDO" };
  if (hashPin(pin, u.sal) !== u.hash) {
    registrarAuditoria(rut, "login_fallido", "");
    return { ok: false, error: "PIN_INCORRECTO" };
  }
  registrarAuditoria(rut, "login", "");
  return { ok: true, rut: u.rut };
}

/** Primer PIN: se define sin PIN previo. Cambios posteriores exigen el actual. */
function definirPin(rut, pinActual, pinNuevo) {
  if (!pinNuevo || String(pinNuevo).length < 4) {
    return { ok: false, error: "PIN_DEMASIADO_CORTO" };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var u = filaUsuario(rut);
    if (!u) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };

    if (u.hash && hashPin(pinActual, u.sal) !== u.hash) {
      return { ok: false, error: "PIN_ACTUAL_INCORRECTO" };
    }

    var sal = nuevaSal();
    var hoja = hojaPorNombre(HOJAS.USUARIOS);
    hoja.getRange(u.fila, 2).setValue(sal);
    hoja.getRange(u.fila, 3).setValue(hashPin(pinNuevo, sal));
    registrarAuditoria(rut, "pin_definido", "");
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Minimizacion de datos (defensa en profundidad del lado servidor)
// ---------------------------------------------------------------------------

/**
 * Rechaza cualquier objeto que contenga una llave identificable, en cualquier
 * nivel de anidamiento. Se prefiere perder la sincronia antes que escribir un
 * dato de paciente en una hoja alojada fuera del hospital.
 */
function validarSinIdentidad(obj, ruta) {
  ruta = ruta || "";
  var hallazgos = [];

  if (obj === null || typeof obj !== "object") return hallazgos;

  if (Object.prototype.toString.call(obj) === "[object Array]") {
    for (var i = 0; i < obj.length; i++) {
      hallazgos = hallazgos.concat(validarSinIdentidad(obj[i], ruta + "[" + i + "]"));
    }
    return hallazgos;
  }

  for (var llave in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, llave)) continue;
    var norm = llave.toLowerCase();
    var rutaActual = ruta === "" ? llave : ruta + "." + llave;

    if (LLAVES_PROHIBIDAS.indexOf(norm) !== -1 && LLAVES_PERMITIDAS.indexOf(norm) === -1) {
      hallazgos.push(rutaActual);
    }
    hallazgos = hallazgos.concat(validarSinIdentidad(obj[llave], rutaActual));
  }

  return hallazgos;
}

// ---------------------------------------------------------------------------
// Escritura (append-only e idempotente)
// ---------------------------------------------------------------------------

function hojaPorNombre(nombre) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(nombre);
  if (!hoja) throw new Error("Falta la hoja: " + nombre + ". Ejecute inicializarLibro().");
  return hoja;
}

/** Ids ya presentes en una hoja, para deduplicar sin releer fila por fila. */
function idsExistentes(hoja) {
  var ultima = hoja.getLastRow();
  var set = {};
  if (ultima < 2) return set;
  var ids = hoja.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) set[String(ids[i][0])] = true;
  return set;
}

/**
 * Agrega registros nuevos. Los ya presentes se ignoran en silencio: eso es lo
 * que hace seguro reintentar una sincronia que fallo a medio camino.
 */
function agregarRegistros(nombreHoja, registros) {
  if (!registros || registros.length === 0) return { insertados: 0, duplicados: 0 };
  if (registros.length > MAX_REGISTROS_POR_LOTE) {
    throw new Error("Lote demasiado grande para " + nombreHoja);
  }

  var hoja = hojaPorNombre(nombreHoja);
  var existentes = idsExistentes(hoja);
  var filas = [];
  var duplicados = 0;

  for (var i = 0; i < registros.length; i++) {
    var r = registros[i];
    if (!r || !r.id) throw new Error("Registro sin id en " + nombreHoja);
    if (existentes[String(r.id)]) {
      duplicados++;
      continue;
    }
    existentes[String(r.id)] = true;
    // Una fila = id + JSON del registro. Sheets no es una base de datos
    // relacional: forzar un esquema de columnas aqui solo crea migraciones
    // dolorosas. El nucleo en TypeScript ya garantiza la forma del objeto.
    filas.push([r.id, r.episodioId || "", r.registradoEn || "", JSON.stringify(r)]);
  }

  if (filas.length > 0) {
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, 4).setValues(filas);
  }

  return { insertados: filas.length, duplicados: duplicados };
}

function sincronizar(cuerpo) {
  var hallazgos = validarSinIdentidad({
    episodios: cuerpo.episodios,
    controles: cuerpo.controles,
    eventos: cuerpo.eventos,
    apk: cuerpo.apk
  });

  if (hallazgos.length > 0) {
    registrarAuditoria(cuerpo.rutAutor || "", "rechazo_identidad", hallazgos.join(","));
    return { ok: false, error: "PAYLOAD_CON_IDENTIDAD", llaves: hallazgos };
  }

  var lock = LockService.getScriptLock();
  // Con 18 profesionales puede haber contencion: se espera en vez de fallar.
  if (!lock.tryLock(30000)) return { ok: false, error: "OCUPADO_REINTENTAR" };

  try {
    var resultado = {
      ok: true,
      episodios: agregarRegistros(HOJAS.EPISODIOS, cuerpo.episodios),
      controles: agregarRegistros(HOJAS.CONTROLES, cuerpo.controles),
      eventos: agregarRegistros(HOJAS.EVENTOS, cuerpo.eventos),
      apk: agregarRegistros(HOJAS.APK, cuerpo.apk),
      servidorEn: new Date().toISOString()
    };
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Identidad del paciente (canal separado, solo token de estacion)
// ---------------------------------------------------------------------------

/** Mapa episodioId -> numero de fila, para actualizar en vez de duplicar. */
function filasPorEpisodio(hoja) {
  var ultima = hoja.getLastRow();
  var mapa = {};
  if (ultima < 2) return mapa;
  var ids = hoja.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) mapa[String(ids[i][0])] = i + 2;
  return mapa;
}

/** Upsert: la identidad si se corrige (un nombre mal tipeado), a diferencia de lo clinico. */
function guardarIdentidad(identidades) {
  if (!identidades || identidades.length === 0) return { ok: true, guardadas: 0 };
  if (identidades.length > MAX_REGISTROS_POR_LOTE) throw new Error("Lote demasiado grande");

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: "OCUPADO_REINTENTAR" };
  try {
    var hoja = hojaPorNombre(HOJAS.IDENTIDAD);
    var filas = filasPorEpisodio(hoja);
    var nuevas = [];

    for (var i = 0; i < identidades.length; i++) {
      var d = identidades[i];
      if (!d || !d.episodioId) throw new Error("Identidad sin episodioId");
      var fila = [d.episodioId, d.episodioId, d.registradoEn || "", JSON.stringify(d)];
      if (filas[String(d.episodioId)]) {
        hoja.getRange(filas[String(d.episodioId)], 1, 1, 4).setValues([fila]);
      } else {
        nuevas.push(fila);
      }
    }
    if (nuevas.length > 0) {
      hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 4).setValues(nuevas);
    }
    registrarAuditoria("", "identidad_guardada", String(identidades.length));
    return { ok: true, guardadas: identidades.length };
  } finally {
    lock.releaseLock();
  }
}

/** Al alta del paciente se borra su identidad; lo clinico des-identificado queda. */
function purgarIdentidad(episodioIds) {
  if (!episodioIds || episodioIds.length === 0) return { ok: true, purgadas: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: "OCUPADO_REINTENTAR" };
  try {
    var hoja = hojaPorNombre(HOJAS.IDENTIDAD);
    var filas = filasPorEpisodio(hoja);
    var aBorrar = [];
    for (var i = 0; i < episodioIds.length; i++) {
      var f = filas[String(episodioIds[i])];
      if (f) aBorrar.push(f);
    }
    // De abajo hacia arriba para que los indices no se corran.
    aBorrar.sort(function (a, b) { return b - a; });
    for (var j = 0; j < aBorrar.length; j++) hoja.deleteRow(aBorrar[j]);
    registrarAuditoria("", "identidad_purgada", String(aBorrar.length));
    return { ok: true, purgadas: aBorrar.length };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

function leerHoja(nombre, desde) {
  var hoja = hojaPorNombre(nombre);
  var ultima = hoja.getLastRow();
  if (ultima < 2) return [];

  var filas = hoja.getRange(2, 1, ultima - 1, 4).getValues();
  var salida = [];

  for (var i = 0; i < filas.length; i++) {
    var registradoEn = String(filas[i][2]);
    if (desde && registradoEn && registradoEn < desde) continue;
    try {
      salida.push(JSON.parse(filas[i][3]));
    } catch (err) {
      // Una celda editada a mano no debe tumbar la lectura completa.
    }
  }

  return salida;
}

function leer(desde) {
  return {
    ok: true,
    episodios: leerHoja(HOJAS.EPISODIOS, desde),
    controles: leerHoja(HOJAS.CONTROLES, desde),
    eventos: leerHoja(HOJAS.EVENTOS, desde),
    apk: leerHoja(HOJAS.APK, desde),
    servidorEn: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

function registrarAuditoria(rut, accion, detalle) {
  try {
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.AUDITORIA);
    if (!hoja) return;
    hoja.appendRow([new Date().toISOString(), rut, accion, detalle]);
  } catch (err) {
    // La auditoria no debe bloquear la operacion clinica.
  }
}

// ---------------------------------------------------------------------------
// Instalacion (ejecutar una vez desde el editor de Apps Script)
// ---------------------------------------------------------------------------

/**
 * Crea las hojas y sus encabezados. Idempotente: se puede volver a ejecutar.
 * Despues hay que cargar la dotacion con cargarDotacion().
 */
function inicializarLibro() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();

  var esquema = {};
  esquema[HOJAS.EPISODIOS] = ["id", "episodioId", "registradoEn", "json"];
  esquema[HOJAS.CONTROLES] = ["id", "episodioId", "registradoEn", "json"];
  esquema[HOJAS.EVENTOS] = ["id", "episodioId", "registradoEn", "json"];
  esquema[HOJAS.APK] = ["id", "episodioId", "registradoEn", "json"];
  esquema[HOJAS.IDENTIDAD] = ["id", "episodioId", "registradoEn", "json"];
  esquema[HOJAS.USUARIOS] = ["rut", "sal", "hashPin", "nombre", "turno"];
  esquema[HOJAS.AUDITORIA] = ["registradoEn", "rut", "accion", "detalle"];

  for (var nombre in esquema) {
    if (!Object.prototype.hasOwnProperty.call(esquema, nombre)) continue;
    var hoja = libro.getSheetByName(nombre);
    if (!hoja) hoja = libro.insertSheet(nombre);
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(esquema[nombre]);
      hoja.setFrozenRows(1);
    }
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("APP_TOKEN")) props.setProperty("APP_TOKEN", Utilities.getUuid());
  if (!props.getProperty("PIN_PEPPER")) props.setProperty("PIN_PEPPER", Utilities.getUuid());
  if (!props.getProperty("STATION_TOKEN")) props.setProperty("STATION_TOKEN", Utilities.getUuid());

  Logger.log("APP_TOKEN (celulares)  = " + props.getProperty("APP_TOKEN"));
  Logger.log("STATION_TOKEN (PC)     = " + props.getProperty("STATION_TOKEN"));
  Logger.log("No pongas el STATION_TOKEN en los celulares: es lo que les impide leer la identidad.");
}

/**
 * Carga la dotacion sin PIN. Cada profesional define el suyo en el primer
 * ingreso mediante la accion definirPin.
 */
function cargarDotacion() {
  var dotacion = [
    ["11.111.111-1", "Mauricio Ortega", "T1"],
    ["11.111.112-2", "Felipe Guerrero", "T1"],
    ["11.111.113-3", "Natalia Parra", "T1"],
    ["22.222.221-1", "Sergio Ortiz", "T2"],
    ["22.222.222-2", "Maria Jose Vega", "T2"],
    ["22.222.223-3", "Alvaro Wilson", "T2"],
    ["33.333.331-1", "Eduardo Gonzalez", "T3"],
    ["16.452.891-K", "Diego Melo", "T3"],
    ["33.333.333-3", "Karen Gonzalez", "T3"],
    ["44.444.441-1", "Carlos Morales", "T4"],
    ["44.444.442-2", "Andres Angel", "T4"],
    ["44.444.443-3", "Manuel Fuentes", "T4"],
    ["55.555.551-1", "Rodrigo Caamano", "SUBROGANCIA"],
    ["55.555.552-2", "Magdalena Contardo", "SUBROGANCIA"],
    ["66.666.661-1", "Aline Campos", "REEMPLAZO"],
    ["66.666.662-2", "Scarlett Tabilo", "REEMPLAZO"]
  ];

  var hoja = hojaPorNombre(HOJAS.USUARIOS);
  var existentes = {};
  var ultima = hoja.getLastRow();
  if (ultima > 1) {
    var ruts = hoja.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < ruts.length; i++) existentes[String(ruts[i][0]).trim().toUpperCase()] = true;
  }

  for (var j = 0; j < dotacion.length; j++) {
    var rut = dotacion[j][0];
    if (existentes[rut.toUpperCase()]) continue;
    hoja.appendRow([rut, "", "", dotacion[j][1], dotacion[j][2]]);
  }
}
