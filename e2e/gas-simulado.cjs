/**
 * Un Google Apps Script de mentira para probar el Codigo.gs REAL en Node: hojas en
 * memoria, propiedades, candado, digestos y las salidas de HtmlService/ContentService.
 * No reemplaza el ensayo contra Google, pero corre las mismas funciones del servidor.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function crearHoja(nombre) {
  const filas = [];
  const ancho = () => filas.reduce((m, f) => Math.max(m, f.length), 0);
  const rango = (fila, col, nf = 1, nc = 1) => ({
    getValues: () =>
      Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (_, j) => (filas[fila - 1 + i] ?? [])[col - 1 + j] ?? "")),
    setValues: (vals) => {
      vals.forEach((v, i) => {
        const r = (filas[fila - 1 + i] ??= []);
        v.forEach((x, j) => (r[col - 1 + j] = x));
      });
    },
    setValue: (x) => {
      const r = (filas[fila - 1] ??= []);
      r[col - 1] = x;
    }
  });
  return {
    nombre,
    filas,
    getLastRow: () => filas.length,
    appendRow: (r) => filas.push([...r]),
    getRange: rango,
    getDataRange: () => rango(1, 1, filas.length, ancho()),
    deleteRow: (i) => filas.splice(i - 1, 1),
    setFrozenRows: () => {}
  };
}

function crearAppsScriptSimulado() {
  const hojas = new Map();
  const propiedades = new Map();
  const libro = {
    getSheetByName: (n) => hojas.get(n) ?? null,
    insertSheet: (n) => {
      const h = crearHoja(n);
      hojas.set(n, h);
      return h;
    }
  };
  const salidaTexto = (texto) => ({ texto, setMimeType() { return this; } });
  const global = {
    SpreadsheetApp: { getActiveSpreadsheet: () => libro },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propiedades.has(k) ? propiedades.get(k) : null),
        setProperty: (k, v) => propiedades.set(k, String(v)),
        deleteProperty: (k) => propiedades.delete(k)
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_alg, texto) => [...crypto.createHash("sha256").update(String(texto), "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString("base64"),
      getUuid: () => crypto.randomUUID()
    },
    Logger: { log: () => {} },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: salidaTexto },
    HtmlService: {
      createHtmlOutputFromFile: (archivo) => {
        const salida = { archivo, titulo: null, metas: {}, setTitle(t) { this.titulo = t; return this; }, addMetaTag(k, v) { this.metas[k] = v; return this; } };
        return salida;
      }
    },
    JSON,
    Date,
    String,
    Object,
    Boolean,
    Math
  };
  const ctx = vm.createContext(global);
  const codigo = fs.readFileSync(path.join(__dirname, "..", "backend", "apps-script", "Codigo.gs"), "utf8");
  vm.runInContext(codigo, ctx, { filename: "Codigo.gs" });
  const llamar = (fn, ...args) => ctx[fn](...args);
  return { llamar, hojas, propiedades };
}

module.exports = { crearAppsScriptSimulado };
