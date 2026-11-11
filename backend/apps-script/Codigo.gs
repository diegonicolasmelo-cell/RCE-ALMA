/**
 * Kapta (antes UPC-Pulse) — API de Google Apps Script sobre Google Sheets.
 *
 * ADVERTENCIA DE ARQUITECTURA, A LA VISTA A PROPOSITO
 * ---------------------------------------------------
 * Este script corre en servidores de Google, NO en la intranet del hospital.
 * Apps Script no puede leer la IP del cliente: no existe allowlist por IP.
 *
 * DECISION DEL USUARIO: nombre y RUT del paciente NUNCA se guardan en claro. El PC los
 * cifra en el navegador (AES-GCM, con la contrasena de la unidad, que no llega aqui) y
 * esta hoja ("referencia") solo guarda un bloque ilegible por episodio. Defensas:
 *   1. El servidor RECHAZA todo lo que no tenga forma de bloque cifrado (v1.<iv>.<datos>).
 *   2. Dos tokens. El celular solo tiene APP_TOKEN y nunca recibe esta hoja.
 *   3. El canal clinico rechaza cualquier llave identificable (validarSinIdentidad).
 *   4. Purga al alta (purgarReferencia): la hoja no acumula pacientes historicos.
 * El historial de versiones de Sheets conserva el texto cifrado, no el dato.
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
  REFERENCIA: "referencia",
  AUDITORIA: "auditoria"
};

/**
 * Llaves prohibidas. Espejo de LLAVES_PROHIBIDAS en src/core/sanitizar.ts.
 * Si se agrega una alla, hay que agregarla aqui.
 */
var LLAVES_PROHIBIDAS = [
  "nombre", "nombrepaciente", "apellido", "apellidos", "iniciales",
  "rut", "run", "ficha", "nficha", "numeroficha", "fechanacimiento",
  "fechadenacimiento", "direccion", "telefono", "prevision", "identidad",
  // Edad exacta y diagnostico escrito viajan cifrados con la identidad: lo clinico lleva
  // solo rangoEdad y categoriaRem.
  "edad", "diagnostico"
];

/** Identifican al profesional, no al paciente: necesarios para la trazabilidad. */
var LLAVES_PERMITIDAS = ["rutautor", "ruttitular"];

var MAX_REGISTROS_POR_LOTE = 200;

// ---------------------------------------------------------------------------
// Puntos de entrada HTTP
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    return respuesta(procesarPost(JSON.parse(e.postData.contents)));
  } catch (err) {
    return respuesta({ ok: false, error: "ERROR_INTERNO", detalle: String(err) });
  }
}

/**
 * Sin token ni recurso: se sirve la APP (index.html). Con token: es la API de lectura.
 * Asi un solo proyecto de Apps Script es pagina y servidor a la vez.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.token && !p.recurso) return servirApp();
  try {
    return respuesta(procesarGet(p));
  } catch (err) {
    return respuesta({ ok: false, error: "ERROR_INTERNO", detalle: String(err) });
  }
}

/**
 * La pagina de la app. Se sirve con createHtmlOutputFromFile y SIN plantillas: el
 * index.html es un cargador ASCII con la app en base64 ("cohete"), asi el analizador
 * de Google nunca ve el codigo real. Generarlo con `npm run gas`.
 */
function servirApp() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Kapta")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}

/** Llamada desde la app servida por este mismo proyecto (google.script.run). Devuelve texto JSON. */
function rcePost(texto) {
  try {
    return JSON.stringify(procesarPost(JSON.parse(texto)));
  } catch (err) {
    return JSON.stringify({ ok: false, error: "ERROR_INTERNO", detalle: String(err) });
  }
}

/** Lectura desde la app servida por este mismo proyecto (google.script.run). Devuelve texto JSON. */
function rceGet(params) {
  try {
    return JSON.stringify(procesarGet(params || {}));
  } catch (err) {
    return JSON.stringify({ ok: false, error: "ERROR_INTERNO", detalle: String(err) });
  }
}

function procesarPost(cuerpo) {
  // El primer PC aun no tiene llaves: registra sus huellas solo con el registro abierto desde el editor.
  if (cuerpo.accion === "registrarLlaves") return registrarLlaves(cuerpo.huellaApp, cuerpo.huellaEstacion);
  // El canal de identidad exige el token de estacion; el resto, el de app.
  var esAccionIdentidad =
    cuerpo.accion === "guardarReferencia" ||
    cuerpo.accion === "purgarReferencia";
  var autorizado = esAccionIdentidad
    ? tokenEstacionValido(cuerpo.token)
    : tokenValido(cuerpo.token);
  if (!autorizado) return { ok: false, error: "TOKEN_INVALIDO" };

  switch (cuerpo.accion) {
    case "guardarReferencia":
      return guardarReferencia(cuerpo.referencias);
    case "purgarReferencia":
      return purgarReferencia(cuerpo.episodioIds);
    case "login":
      return login(cuerpo.correo || cuerpo.rut, cuerpo.pin);
    case "definirPin":
      return definirPin(cuerpo.correo || cuerpo.rut, cuerpo.pinActual, cuerpo.pinNuevo);
    case "registrarEstacion":
      return registrarLlaves(null, cuerpo.huella);
    case "sincronizar":
      return sincronizar(cuerpo);
    default:
      return { ok: false, error: "ACCION_DESCONOCIDA" };
  }
}

function procesarGet(p) {
  if (p.recurso === "referencia") {
    if (!tokenEstacionValido(p.token)) return { ok: false, error: "TOKEN_INVALIDO" };
    return { ok: true, referencias: leerHoja(HOJAS.REFERENCIA, "") };
  }
  if (!tokenValido(p.token)) return { ok: false, error: "TOKEN_INVALIDO" };
  if (p.recurso === "dotacion") return { ok: true, dotacion: leerDotacion() };
  // `desde` es un ISO 8601; permite sincronia incremental en vez de leer todo.
  return leer(p.desde || "");
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
 * Llave de la app: la tienen los celulares y los PC. Sirve para que quien encuentre la
 * direccion no lea ni escriba datos clinicos; la autenticacion del profesional es su clave.
 * Como la de estacion, la crea el primer PC y aqui se guarda solo su HUELLA.
 */
function tokenValido(token) {
  if (!token) return false;
  var props = PropertiesService.getScriptProperties();
  var huella = props.getProperty("APP_TOKEN_HASH");
  if (huella) return sha256Hex(String(token)) === huella;
  // Instalaciones anteriores: la llave guardada tal cual, hasta que un PC registre una nueva.
  var antigua = props.getProperty("APP_TOKEN");
  return Boolean(antigua) && token === antigua;
}

/**
 * Llave de estacion: solo la tienen los PC. La CREA el primer PC (en su navegador) y aqui
 * se guarda solo su HUELLA (SHA-256): Google nunca tiene la llave. Los demas PC la reciben
 * con su enlace (`#estacion?t=LLAVE`), cuyo fragmento no viaja al servidor.
 *
 * Si se pierde la llave en todos los PC, no se puede recuperar de aqui: se abre el registro
 * otra vez (abrirRegistroEstacion) y un PC crea una nueva.
 */
function tokenEstacionValido(token) {
  if (!token) return false;
  var props = PropertiesService.getScriptProperties();
  var huella = props.getProperty("STATION_TOKEN_HASH");
  if (huella) return sha256Hex(String(token)) === huella;
  // Instalaciones anteriores: la llave guardada tal cual, hasta que un PC registre una nueva.
  var antigua = props.getProperty("STATION_TOKEN");
  return Boolean(antigua) && token === antigua;
}

function sha256Hex(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto)
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

/**
 * Se ejecuta desde el editor antes de configurar el primer PC (o para cambiar las llaves si
 * se perdieron). Deja el registro abierto 15 minutos: en ese lapso un PC puede registrar las
 * HUELLAS de las llaves que creo. Google nunca recibe las llaves.
 */
function abrirRegistroLlaves() {
  var hasta = new Date(Date.now() + 15 * 60 * 1000);
  PropertiesService.getScriptProperties().setProperty("REGISTRO_LLAVES_HASTA", hasta.toISOString());
  Logger.log("Registro de llaves abierto hasta las " + hasta.toLocaleTimeString() + ".");
  Logger.log("Ahora, en el PC: abre la app y pulsa «Configurar este PC como el primero» (o Estado -> Llaves).");
}

/** Nombre anterior: abre el mismo registro. */
function abrirRegistroEstacion() {
  abrirRegistroLlaves();
}

/**
 * El PC registra las huellas (SHA-256) de las llaves que creo: la de la app, la de estacion
 * o ambas. Solo con el registro abierto; despues se cierra solo.
 */
function registrarLlaves(huellaApp, huellaEstacion) {
  var props = PropertiesService.getScriptProperties();
  var hasta = props.getProperty("REGISTRO_LLAVES_HASTA");
  if (!hasta || new Date(hasta).getTime() < Date.now()) return { ok: false, error: "REGISTRO_CERRADO" };
  var valida = function (h) { return /^[0-9a-f]{64}$/.test(String(h || "")); };
  if (!huellaApp && !huellaEstacion) return { ok: false, error: "HUELLA_INVALIDA" };
  if ((huellaApp && !valida(huellaApp)) || (huellaEstacion && !valida(huellaEstacion))) return { ok: false, error: "HUELLA_INVALIDA" };
  if (huellaApp) {
    props.setProperty("APP_TOKEN_HASH", String(huellaApp));
    props.deleteProperty("APP_TOKEN");
  }
  if (huellaEstacion) {
    props.setProperty("STATION_TOKEN_HASH", String(huellaEstacion));
    props.deleteProperty("STATION_TOKEN");
  }
  props.deleteProperty("REGISTRO_LLAVES_HASTA");
  registrarAuditoria("", "llaves_registradas", (huellaApp ? "app " : "") + (huellaEstacion ? "estacion" : ""));
  return { ok: true };
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

/**
 * Hoja «usuarios»: correo | sal | hashPin | nombre | turno | rol. El profesional se
 * identifica por su CORREO; su RUT no se guarda. Coordinacion agrega reemplazos escribiendo
 * una fila nueva (correo, nombre, turno, rol): la app la toma sin publicar nada.
 */
function normalizarCorreo(c) {
  return String(c || "").trim().toLowerCase();
}

function filaUsuario(correo) {
  var buscado = normalizarCorreo(correo);
  if (!buscado) return null;
  var hoja = hojaPorNombre(HOJAS.USUARIOS);
  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (normalizarCorreo(datos[i][0]) === buscado) {
      return { fila: i + 1, correo: buscado, sal: datos[i][1], hash: datos[i][2] };
    }
  }
  return null;
}

/** La dotacion para la app: correo, nombre, turno y rol. Nunca la sal ni el hash. */
function leerDotacion() {
  var datos = hojaPorNombre(HOJAS.USUARIOS).getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < datos.length; i++) {
    var correo = normalizarCorreo(datos[i][0]);
    var nombre = String(datos[i][3] || "").trim();
    if (correo.indexOf("@") < 0 || !nombre) continue;
    lista.push({ correo: correo, nombre: nombre, turno: String(datos[i][4] || "").trim().toUpperCase(), rol: String(datos[i][5] || "").trim().toUpperCase() });
  }
  return lista;
}

function login(correo, pin) {
  var u = filaUsuario(correo);
  if (!u) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };
  if (!u.hash) return { ok: false, error: "PIN_NO_DEFINIDO" };
  if (hashPin(pin, u.sal) !== u.hash) {
    registrarAuditoria(u.correo, "login_fallido", "");
    return { ok: false, error: "PIN_INCORRECTO" };
  }
  registrarAuditoria(u.correo, "login", "");
  return { ok: true, correo: u.correo };
}

/** Primer PIN: se define sin PIN previo. Cambios posteriores exigen el actual. */
function definirPin(correo, pinActual, pinNuevo) {
  if (!pinNuevo || String(pinNuevo).length < 4) {
    return { ok: false, error: "PIN_DEMASIADO_CORTO" };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var u = filaUsuario(correo);
    if (!u) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };

    if (u.hash && hashPin(pinActual, u.sal) !== u.hash) {
      return { ok: false, error: "PIN_ACTUAL_INCORRECTO" };
    }

    var sal = nuevaSal();
    var hoja = hojaPorNombre(HOJAS.USUARIOS);
    hoja.getRange(u.fila, 2).setValue(sal);
    hoja.getRange(u.fila, 3).setValue(hashPin(pinNuevo, sal));
    registrarAuditoria(u.correo, "pin_definido", "");
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

var FORMA_BLOQUE_CIFRADO = /^v1\.[A-Za-z0-9+\/=]+\.[A-Za-z0-9+\/=]+$/;

/** Upsert: una referencia si se corrige, a diferencia de lo clinico. Solo acepta bloques cifrados. */
function guardarReferencia(referencias) {
  var identidades = referencias;
  if (!identidades || identidades.length === 0) return { ok: true, guardadas: 0 };
  if (identidades.length > MAX_REGISTROS_POR_LOTE) throw new Error("Lote demasiado grande");

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: "OCUPADO_REINTENTAR" };
  try {
    var hoja = hojaPorNombre(HOJAS.REFERENCIA);
    var filas = filasPorEpisodio(hoja);
    var nuevas = [];

    for (var i = 0; i < identidades.length; i++) {
      var d = identidades[i];
      if (!d || !d.episodioId) throw new Error("Referencia sin episodioId");
      if (typeof d.dato !== "string" || !FORMA_BLOQUE_CIFRADO.test(d.dato)) {
        return { ok: false, error: "DATO_NO_CIFRADO" };
      }
      // Solo estos tres campos se guardan, pase lo que pase con el resto del cuerpo.
      var limpio = { episodioId: String(d.episodioId), registradoEn: String(d.registradoEn || ""), dato: d.dato };
      var fila = [limpio.episodioId, limpio.episodioId, limpio.registradoEn, JSON.stringify(limpio)];
      if (filas[String(d.episodioId)]) {
        hoja.getRange(filas[String(d.episodioId)], 1, 1, 4).setValues([fila]);
      } else {
        nuevas.push(fila);
      }
    }
    if (nuevas.length > 0) {
      hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 4).setValues(nuevas);
    }
    registrarAuditoria("", "referencia_guardada", String(identidades.length));
    return { ok: true, guardadas: identidades.length };
  } finally {
    lock.releaseLock();
  }
}

/** Al alta del paciente se borra su referencia cifrada; lo clinico des-identificado queda. */
function purgarReferencia(episodioIds) {
  if (!episodioIds || episodioIds.length === 0) return { ok: true, purgadas: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: "OCUPADO_REINTENTAR" };
  try {
    var hoja = hojaPorNombre(HOJAS.REFERENCIA);
    var filas = filasPorEpisodio(hoja);
    var aBorrar = [];
    for (var i = 0; i < episodioIds.length; i++) {
      var f = filas[String(episodioIds[i])];
      if (f) aBorrar.push(f);
    }
    // De abajo hacia arriba para que los indices no se corran.
    aBorrar.sort(function (a, b) { return b - a; });
    for (var j = 0; j < aBorrar.length; j++) hoja.deleteRow(aBorrar[j]);
    registrarAuditoria("", "referencia_purgada", String(aBorrar.length));
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
  esquema[HOJAS.REFERENCIA] = ["id", "episodioId", "registradoEn", "dato"];
  esquema[HOJAS.USUARIOS] = COLUMNAS_USUARIOS;
  esquema[HOJAS.AUDITORIA] = ["registradoEn", "usuario", "accion", "detalle"];

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
  if (!props.getProperty("PIN_PEPPER")) props.setProperty("PIN_PEPPER", Utilities.getUuid());

  var sinApp = !props.getProperty("APP_TOKEN_HASH") && !props.getProperty("APP_TOKEN");
  var sinEstacion = !props.getProperty("STATION_TOKEN_HASH") && !props.getProperty("STATION_TOKEN");
  if (sinApp || sinEstacion) {
    Logger.log("Faltan las llaves: ejecuta abrirRegistroLlaves y configura el primer PC desde la app.");
    Logger.log("Google guarda solo sus huellas: las llaves quedan en los equipos, nunca aqui.");
  }
}

var COLUMNAS_USUARIOS = ["correo", "sal", "hashPin", "nombre", "turno", "rol"];

// ---------------------------------------------------------------------------
// Limpieza de episodios antiguos (ejecutar a mano desde el editor, una vez)
// ---------------------------------------------------------------------------

/** Rangos del REM 28. Espejo de RANGOS_EDAD en src/core/catalogos.ts. */
var RANGOS_EDAD_REM = [
  "0\u20134", "5\u20139", "10\u201314", "15\u201319", "20\u201324", "25\u201329", "30\u201334", "35\u201339", "40\u201344",
  "45\u201349", "50\u201354", "55\u201359", "60\u201364", "65\u201369", "70\u201374", "75\u201379", "80 y m\u00e1s"
];

function rangoDeEdadRem(edad) {
  var i = Math.floor(edad / 5);
  return RANGOS_EDAD_REM[Math.min(RANGOS_EDAD_REM.length - 1, Math.max(0, i))];
}

/** Cuenta lo que se limpiaria en la hoja episodios, sin escribir nada. */
function limpiarEpisodiosAntiguosSIMULACRO() {
  return limpiarEpisodiosAntiguos_(false);
}

/**
 * Quita de la hoja episodios la edad exacta y el diagnostico escrito que viajaban en claro
 * antes de noviembre de 2026: la edad pasa a rango del REM y el diagnostico se borra
 * (la categoria REM queda pendiente). Excepcion unica a la regla de solo agregar.
 * El historial de versiones de la planilla conserva lo anterior.
 */
function limpiarEpisodiosAntiguosCONFIRMAR() {
  return limpiarEpisodiosAntiguos_(true);
}

function limpiarEpisodiosAntiguos_(escribir) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("La hoja esta ocupada: reintenta en un minuto.");
  try {
    var hoja = hojaPorNombre(HOJAS.EPISODIOS);
    var resumen = { filas: 0, conEdad: 0, conDiagnostico: 0, ilegibles: 0, cambiadas: 0, escrito: false };
    var ultima = hoja.getLastRow();
    if (ultima < 2) {
      Logger.log(JSON.stringify(resumen));
      return resumen;
    }
    var rango = hoja.getRange(2, 4, ultima - 1, 1);
    var valores = rango.getValues();
    resumen.filas = valores.length;
    for (var i = 0; i < valores.length; i++) {
      var r;
      try {
        r = JSON.parse(valores[i][0]);
      } catch (err) {
        resumen.ilegibles++;
        continue;
      }
      if (!r || typeof r !== "object") continue;
      var tocada = false;
      if (Object.prototype.hasOwnProperty.call(r, "edad")) {
        if (r.rangoEdad === undefined) r.rangoEdad = typeof r.edad === "number" && r.edad > 0 ? rangoDeEdadRem(r.edad) : null;
        delete r.edad;
        resumen.conEdad++;
        tocada = true;
      }
      if (Object.prototype.hasOwnProperty.call(r, "diagnostico")) {
        if (r.categoriaRem === undefined) r.categoriaRem = null;
        delete r.diagnostico;
        resumen.conDiagnostico++;
        tocada = true;
      }
      if (tocada) {
        valores[i][0] = JSON.stringify(r);
        resumen.cambiadas++;
      }
    }
    if (escribir && resumen.cambiadas > 0) {
      rango.setValues(valores);
      resumen.escrito = true;
      registrarAuditoria("", "limpieza_episodios", String(resumen.cambiadas));
    }
    Logger.log((escribir ? "CONFIRMAR: " : "SIMULACRO (no se escribio nada): ") + JSON.stringify(resumen));
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Carga la dotacion en la hoja «usuarios» (correo, nombre, turno, rol), sin contrasenas:
 * cada profesional define la suya en su primer ingreso. No duplica correos que ya esten.
 * Si la hoja tiene el formato antiguo (por RUT), la rehace: las contrasenas ya definidas se
 * pierden y cada uno vuelve a definir la suya al entrar.
 * Para agregar un reemplazo despues, basta escribir una fila nueva en la hoja.
 */
function cargarDotacion() {
  var dotacion = [
    ["mow_13@hotmail.com", "Mauricio Ortega Wanders", "T1", "KINE_CLINICO"],
    ["felipeguerreroes@gmail.com", "Felipe Guerrero Espinoza", "T1", "KINE_CLINICO"],
    ["nataliaparrarojas@gmail.com", "Natalia Parra Rojas", "T1", "KINE_CLINICO"],
    ["sortizgomez@gmail.com", "Sergio Ortiz Gómez", "T2", "KINE_CLINICO"],
    ["mariajose.vega27@gmail.com", "María José Vega", "T2", "KINE_CLINICO"],
    ["klgoalvarowilson@gmail.com", "Álvaro Wilson Espinoza", "T2", "KINE_CLINICO"],
    ["edogonzaleztapia@gmail.com", "Eduardo González Tapia", "T3", "KINE_CLINICO"],
    ["diegonicolas.melo@gmail.com", "Diego Melo Villagrán", "T3", "KINE_CLINICO"],
    ["kren.gv20@gmail.com", "Karen González Vázquez", "T3", "KINE_CLINICO"],
    ["moralesfcarlos@gmail.com", "Carlos Morales Flores", "T4", "KINE_CLINICO"],
    ["andresangel78@gmail.com", "Andrés Ángel Gómez", "T4", "KINE_CLINICO"],
    ["fuentessmanuel@gmail.com", "Manuel Fuentes Blanco", "T4", "KINE_CLINICO"],
    ["rcaamano.tapia@gmail.com", "Rodrigo Caamaño Tapia", "SUBROGANCIA", "COORDINACION"],
    ["maida.contardo@gmail.com", "Magdalena Contardo Cisternas", "SUBROGANCIA", "COORDINACION"],
    ["alinecamposrivera@gmail.com", "Aline Rivera Campos", "REEMPLAZO", "KINE_CLINICO"],
    ["escarletabilo@gmail.com", "Escarlett Tabilo Alfred", "REEMPLAZO", "KINE_CLINICO"]
  ];

  var hoja = hojaPorNombre(HOJAS.USUARIOS);
  var encabezado = hoja.getLastRow() > 0 ? String(hoja.getRange(1, 1).getValue()).trim().toLowerCase() : "";
  if (encabezado !== "correo") {
    hoja.clear();
    hoja.appendRow(COLUMNAS_USUARIOS);
    hoja.setFrozenRows(1);
    if (encabezado) Logger.log("La hoja «usuarios» tenia el formato antiguo (por RUT): se rehizo por correo. Cada uno define su contrasena de nuevo.");
  }

  var existentes = {};
  var ultima = hoja.getLastRow();
  if (ultima > 1) {
    var correos = hoja.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < correos.length; i++) existentes[normalizarCorreo(correos[i][0])] = true;
  }

  var agregados = 0;
  for (var j = 0; j < dotacion.length; j++) {
    var correo = normalizarCorreo(dotacion[j][0]);
    if (existentes[correo]) continue;
    hoja.appendRow([correo, "", "", dotacion[j][1], dotacion[j][2], dotacion[j][3]]);
    agregados++;
  }
  Logger.log("Dotacion: " + agregados + " profesionales agregados a la hoja «usuarios».");
}
