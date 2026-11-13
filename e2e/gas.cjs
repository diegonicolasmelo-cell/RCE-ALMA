/**
 * Arranque REAL del index.html de Apps Script en Chromium, con el Codigo.gs real detras
 * (simulado en Node) y un `google.script` de mentira que imita el iframe de Google.
 *
 *   npm run gas && NODE_PATH=$(npm root -g) node e2e/gas.cjs
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { crearAppsScriptSimulado } = require("./gas-simulado.cjs");

const PUERTO = Number(process.env.E2E_GAS_PORT ?? 4185);
const URL = `http://localhost:${PUERTO}/`;
const INDEX = path.join(__dirname, "..", "dist-gas", "index.html");

let pasadas = 0;
const prueba = async (nombre, fn) => {
  try {
    await fn();
    pasadas += 1;
    console.log(`  ok   ${nombre}`);
  } catch (e) {
    console.log(`  FALLA ${nombre}\n       ${String(e.message).split("\n").slice(0, 30).join("\n       ")}`);
    throw e;
  }
};

/** Lo que Google pone alrededor del index.html: una pagina con el contenido del archivo. */
const pagina = () =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kapta</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fs.readFileSync(INDEX, "utf8")}</body></html>`;

(async () => {
  if (!fs.existsSync(INDEX)) throw new Error("Falta dist-gas/index.html: corre npm run gas");
  const servidorHttp = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pagina());
  });
  await new Promise((r) => servidorHttp.listen(PUERTO, r));

  const gas = crearAppsScriptSimulado();
  gas.llamar("inicializarLibro");
  gas.llamar("cargarDotacion");
  assert.equal(gas.propiedades.get("APP_TOKEN"), undefined, "inicializarLibro ya no crea la llave de la app");
  assert.equal(gas.propiedades.get("STATION_TOKEN"), undefined, "inicializarLibro ya no crea la llave de estacion");
  // Las crea el primer PC (prueba de abajo).
  let APP = "";
  let LLAVE = "";
  const llamadas = [];

  const navegador = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const errores = [];

  /** Un equipo nuevo (navegador sin datos) que abre la URL /exec con este fragmento y parametros. */
  async function abrir({ hash = "", parametros = {} }, contexto) {
    const ctx = contexto ?? (await navegador.newContext({ viewport: { width: 390, height: 844 } }));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
    p.on("console", (m) => m.type() === "error" && errores.push("console: " + m.text()));
    await p.exposeFunction("__rcePost", (texto) => {
      llamadas.push({ tipo: "post", cuerpo: JSON.parse(texto) });
      return gas.llamar("rcePost", texto);
    });
    await p.exposeFunction("__rceGet", (params) => {
      llamadas.push({ tipo: "get", params });
      return gas.llamar("rceGet", params);
    });
    await p.addInitScript(
      ({ hash, parametros }) => {
        window.__hashAfuera = [];
        const ejecutor = (ok, falla) => ({
          withSuccessHandler: (f) => ejecutor(f, falla),
          withFailureHandler: (f) => ejecutor(ok, f),
          rcePost: (t) => window.__rcePost(t).then(ok, falla),
          rceGet: (q) => window.__rceGet(q).then(ok, falla)
        });
        window.google = {
          script: {
            run: ejecutor(() => {}, () => {}),
            url: { getLocation: (cb) => setTimeout(() => cb({ hash, parameter: parametros, parameters: {} }), 10) },
            history: { replace: (_e, _p, h) => window.__hashAfuera.push(h) }
          }
        };
      },
      { hash, parametros }
    );
    await p.goto(URL);
    return { p, ctx };
  }

  try {
    console.log("Apps Script");

    await prueba("el index.html es ASCII puro y no tiene '<' ni '>' fuera de sus etiquetas", async () => {
      const html = fs.readFileSync(INDEX, "utf8");
      assert.ok(!/[^\x09\x0a\x0d\x20-\x7e]/.test(html));
      assert.ok(!/[<>]/.test(html.replace(/<\/?(div|script)[^<>]*>/g, "")));
      const g = gas.llamar("doGet", { parameter: {} });
      assert.equal(g.archivo, "index");
      assert.equal(g.titulo, "Kapta");
    });

    await prueba("?demo=1 arranca la demostracion sin tocar la hoja", async () => {
      const antes = llamadas.length;
      const { p, ctx } = await abrir({ parametros: { demo: "1" } });
      await p.waitForSelector("#rut", { timeout: 10000 });
      await p.fill("#rut", "diego.melo@demo.upc");
      await p.fill("#pin", "kine");
      await p.click("button[type=submit]");
      await p.waitForSelector("text=¿Cuáles son tus camas hoy?");
      assert.equal(llamadas.length, antes, "la demostracion no debe llamar al servidor");
      await ctx.close();
    });

    await prueba("un equipo sin conectar no ve datos y dice como conectarse", async () => {
      const { p, ctx } = await abrir({});
      await p.waitForSelector("text=aún no está conectado", { timeout: 10000 });
      assert.equal(await p.locator("#rut").count(), 0);
      await ctx.close();
    });

    const primerPc = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    await prueba("el primer PC crea las dos llaves y Google guarda solo sus huellas", async () => {
      const a = await abrir({}, primerPc);
      await a.p.waitForSelector("text=aún no está conectado", { timeout: 10000 });
      // Sin abrir el registro desde el editor, no se puede.
      await a.p.click('button:has-text("Configurar este PC como el primero")');
      await a.p.waitForSelector("text=El registro está cerrado");
      gas.llamar("abrirRegistroLlaves");
      await a.p.click('button:has-text("Configurar este PC como el primero")');
      await a.p.waitForSelector("#rut", { timeout: 10000 });
      await a.p.close();
      const b = await abrir({ hash: "estacion" }, primerPc);
      await b.p.waitForSelector(".estacion", { timeout: 10000 });
      await b.p.click('[role=tab]:has-text("Estado")');
      assert.match(await b.p.textContent("body"), /Con llave de estación/);
      const enlace = (await b.p.locator('[aria-label="Llaves de la unidad"] .mono').first().textContent()).trim();
      const m = /^#estacion\?a=([A-Za-z0-9_-]{43})&t=([A-Za-z0-9_-]{43})$/.exec(enlace);
      assert.ok(m, `enlace: ${enlace}`);
      [, APP, LLAVE] = m;
      const huella = (x) => require("node:crypto").createHash("sha256").update(x, "utf8").digest("hex");
      assert.equal(gas.propiedades.get("APP_TOKEN_HASH"), huella(APP));
      assert.equal(gas.propiedades.get("STATION_TOKEN_HASH"), huella(LLAVE));
      const enGoogle = [...gas.propiedades.values()];
      assert.ok(!enGoogle.includes(APP) && !enGoogle.includes(LLAVE), "las llaves no estan en Google");
      assert.ok(!llamadas.some((l) => JSON.stringify(l).includes(LLAVE)), "la llave de estacion nunca viajo al servidor");
      // El registro se cierra solo: nadie mas puede cambiar las llaves.
      assert.equal(JSON.parse(gas.llamar("rcePost", JSON.stringify({ accion: "registrarLlaves", huellaApp: "a".repeat(64) }))).error, "REGISTRO_CERRADO");
      assert.equal(JSON.parse(gas.llamar("rceGet", { recurso: "referencia", token: LLAVE })).ok, true);
      assert.equal(JSON.parse(gas.llamar("rceGet", { recurso: "referencia", token: "otra" })).ok, false);
      // El enlace de los celulares lleva la PWA, la direccion /exec y solo la llave de la app.
      await b.p.fill('input[type=url] >> nth=0', "https://script.google.com/macros/s/ABC/exec");
      const cel = (await b.p.locator('[aria-label="Llaves de la unidad"] .mono').nth(1).textContent()).trim();
      assert.equal(cel, `https://diegonicolasmelo-cell.github.io/RCE-ALMA/#config?u=${encodeURIComponent("https://script.google.com/macros/s/ABC/exec")}&a=${APP}`);
      await b.p.close();
    });

    const celular = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    await prueba("el enlace #config?a= conecta el celular y la llave se borra de la barra de afuera", async () => {
      const { p } = await abrir({ hash: `config?a=${APP}` }, celular);
      await p.waitForSelector("#rut", { timeout: 10000 });
      const afuera = await p.evaluate(() => window.__hashAfuera);
      assert.ok(afuera.length > 0 && afuera.every((h) => !h.includes(APP)), `quedó: ${JSON.stringify(afuera)}`);
      await p.close();
    });

    await prueba("primer ingreso con el correo: la contraseña escrita queda como suya al repetirla (Codigo.gs real)", async () => {
      const { p } = await abrir({}, celular);
      await p.waitForSelector("#rut", { timeout: 10000 });
      await p.fill("#rut", "diegonicolas.melo@gmail.com");
      await p.fill("#pin", "kine");
      await p.click("button[type=submit]");
      await p.waitForSelector("#npin");
      await p.fill("#npin", "kina");
      await p.click("button[type=submit]");
      assert.match(await p.textContent("[role=alert]"), /no coinciden/);
      await p.fill("#npin", "kine");
      await p.click("button[type=submit]");
      await p.waitForSelector("text=¿Cuáles son tus camas hoy?", { timeout: 10000 });
      // Unidad sin pacientes: igual se ven las 18 camas, y las libres se ingresan desde aqui.
      assert.equal(await p.locator('[aria-label="Camas"] button').count(), 18);
      await p.click('#btn-ver-camas');
      await p.waitForSelector("article.cama-sin");
      assert.equal(await p.locator("article.cama-sin").count(), 18, "las 18 camas, libres, en una columna");
      assert.equal(await p.locator("text=No hay camas activas").count(), 0);
      // El servidor guardo un hash, nunca la clave.
      const usuarios = gas.hojas.get("usuarios").filas;
      assert.deepEqual(usuarios[0], ["correo", "sal", "hashPin", "nombre", "turno", "rol"], "la hoja usuarios es por correo, sin RUT");
      const fila = usuarios.find((f) => f[0] === "diegonicolas.melo@gmail.com");
      assert.ok(fila[2] && fila[2] !== "kine" && !usuarios.flat().includes("kine"));
      assert.ok(!usuarios.flat().some((v) => /\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/.test(String(v))), "ningun RUT en la hoja usuarios");
      const posts = llamadas.filter((l) => l.tipo === "post" && l.cuerpo.accion !== "registrarLlaves");
      assert.ok(posts.every((l) => l.cuerpo.token === APP && l.cuerpo.correo === "diegonicolas.melo@gmail.com"), "al servidor viaja el correo");
      assert.ok(llamadas.some((l) => l.tipo === "get" && l.params.recurso === "dotacion"), "la dotacion se pide a la hoja");
      await new Promise((r) => setTimeout(r, 800));
      assert.ok(llamadas.some((l) => l.tipo === "get" && l.params.token === APP && !l.params.recurso));
      await p.close();
    });

    await prueba("un reemplazo agregado en la hoja entra sin publicar una version nueva", async () => {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
      const { p } = await abrir({ hash: `config?a=${APP}` }, ctx);
      await p.waitForSelector("#rut", { timeout: 10000 });
      // El celular ya tiene la dotacion guardada; el colega se agrega a la hoja DESPUES.
      const usuarios = gas.hojas.get("usuarios").filas;
      usuarios.push(["Reemplazo.Nuevo@hospital.cl", "", "", "Reemplazo Nuevo", "REEMPLAZO", "KINE_CLINICO"]);
      await p.fill("#rut", "nadie@hospital.cl");
      await p.fill("#pin", "clave1");
      await p.click("button[type=submit]");
      assert.match(await (await p.waitForSelector("[role=alert]")).textContent(), /no está en la hoja/);
      await p.fill("#rut", "reemplazo.nuevo@hospital.cl");
      await p.fill("#pin", "clave1");
      await p.click("button[type=submit]");
      await p.waitForSelector("#npin", { timeout: 10000 });
      await p.fill("#npin", "clave1");
      await p.click("button[type=submit]");
      await p.waitForSelector("text=¿Cuáles son tus camas hoy?", { timeout: 10000 });
      assert.ok(usuarios.find((f) => f[0] === "Reemplazo.Nuevo@hospital.cl")[2], "quedo su huella de contrasena");
      // Un correo que no esta en la hoja no entra.
      await p.close();
    });

    await prueba("con la contraseña equivocada no entra; con 'kine' sí", async () => {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
      const a = await abrir({ hash: `config?a=${APP}` }, ctx);
      await a.p.waitForSelector("#rut", { timeout: 10000 });
      await a.p.fill("#rut", "diegonicolas.melo@gmail.com");
      await a.p.fill("#pin", "0000");
      await a.p.click("button[type=submit]");
      await a.p.waitForSelector("[role=alert]");
      assert.match(await a.p.textContent("[role=alert]"), /incorrecta/i);
      await a.p.fill("#pin", "kine");
      await a.p.click("button[type=submit]");
      await a.p.waitForSelector("text=¿Cuáles son tus camas hoy?", { timeout: 10000 });
      await ctx.close();
    });

    await prueba("otro PC se conecta con un solo enlace y las llaves no quedan en la barra de afuera", async () => {
      const otro = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
      const d = await abrir({ hash: `estacion?a=${APP}&t=${LLAVE}` }, otro);
      await d.p.waitForSelector(".estacion", { timeout: 10000 });
      const afuera = await d.p.evaluate(() => window.__hashAfuera);
      assert.ok(afuera.includes("estacion"), `barra de afuera: ${JSON.stringify(afuera)}`);
      assert.ok(afuera.every((h) => !h.includes(LLAVE) && !h.includes(APP)));
      await d.p.click('[role=tab]:has-text("Estado")');
      assert.match(await d.p.textContent(".app, body"), /Con llave de estación/);
      await primerPc.close();
      await otro.close();
    });

    await prueba("limpieza de episodios antiguos: el simulacro no escribe y CONFIRMAR deja solo rango y categoria", async () => {
      const g = crearAppsScriptSimulado();
      g.llamar("inicializarLibro");
      const hoja = g.hojas.get("episodios");
      hoja.appendRow(["e1#1", "e1", "2026-11-01T10:00:00.000Z", JSON.stringify({ id: "e1#1", cama: "UCI-01", edad: 64, diagnostico: "texto", sexo: "M" })]);
      hoja.appendRow(["e2#1", "e2", "2026-11-01T10:00:00.000Z", JSON.stringify({ id: "e2#1", cama: "UCI-02", rangoEdad: "40\u201344", categoriaRem: "Otros" })]);
      const antes = hoja.filas[1][3];
      const sim = g.llamar("limpiarEpisodiosAntiguosSIMULACRO");
      assert.equal(sim.cambiadas, 1);
      assert.equal(sim.escrito, false);
      assert.equal(hoja.filas[1][3], antes, "el simulacro no toca la hoja");
      const conf = g.llamar("limpiarEpisodiosAntiguosCONFIRMAR");
      assert.equal(conf.escrito, true);
      const limpia = JSON.parse(hoja.filas[1][3]);
      assert.equal(limpia.edad, undefined);
      assert.equal(limpia.diagnostico, undefined);
      assert.equal(limpia.rangoEdad, "60\u201364");
      assert.equal(limpia.categoriaRem, null);
      assert.equal(JSON.parse(hoja.filas[2][3]).categoriaRem, "Otros", "lo ya limpio no cambia");
      assert.equal(g.llamar("limpiarEpisodiosAntiguosCONFIRMAR").cambiadas, 0, "correrla de nuevo no hace nada");
    });

    await prueba("empezar de cero: limpiar un paciente o todo, con simulacro y aviso a los equipos", async () => {
      const g = crearAppsScriptSimulado();
      g.llamar("inicializarLibro");
      g.llamar("cargarDotacion");
      const ep = (id, cama, activo, en) => [`${id}#1`, id, en, JSON.stringify({ id: `${id}#1`, episodioId: id, cama, activo, ingresadoEn: en })];
      g.hojas.get("episodios").appendRow(ep("a", "UCI-17", true, "2026-11-10T10:00:00.000Z"));
      g.hojas.get("episodios").appendRow(ep("b", "UCI-13", true, "2026-11-11T10:00:00.000Z"));
      for (const [id, e] of [["c1", "a"], ["c2", "b"], ["c3", "a"]]) g.hojas.get("controles").appendRow([id, e, "2026-11-12T10:00:00.000Z", "{}"]);
      g.hojas.get("referencia").appendRow(["_verificacion", "_verificacion", "", "{}"]);
      g.hojas.get("referencia").appendRow(["a", "a", "", "{}"]);
      const usuarios = g.hojas.get("usuarios").filas.length;

      const sim = g.llamar("limpiarPaciente_", "17", false);
      assert.equal(sim.episodio, "a");
      assert.equal(sim.controles, 2);
      assert.equal(g.hojas.get("controles").filas.length, 4, "el simulacro no borra");
      const conf = g.llamar("limpiarPaciente_", "UCI-17", true);
      assert.equal(conf.escrito, true);
      assert.deepEqual(g.hojas.get("controles").filas.slice(1).map((f) => f[0]), ["c2"]);
      assert.deepEqual(g.hojas.get("referencia").filas.slice(1).map((f) => f[0]), ["_verificacion"]);
      assert.deepEqual(g.llamar("leer", "").borrados, ["a"], "los equipos se enteran del paciente borrado");

      assert.equal(g.llamar("limpiarTodoSIMULACRO").episodios, 1);
      assert.equal(g.hojas.get("episodios").filas.length, 2, "el simulacro no borra");
      g.llamar("limpiarTodoCONFIRMAR");
      for (const h of ["episodios", "controles", "eventos", "apk"]) assert.equal(g.hojas.get(h).filas.length, 1, `${h} queda solo con el encabezado`);
      assert.deepEqual(g.hojas.get("referencia").filas.slice(1).map((f) => f[0]), ["_verificacion"], "la verificacion de la contrasena se conserva");
      assert.equal(g.hojas.get("usuarios").filas.length, usuarios, "la dotacion no se toca");
      const l = g.llamar("leer", "");
      assert.ok(l.epoca, "cambia la epoca: los equipos vacian su copia");
      assert.deepEqual(l.borrados, []);
    });

    await prueba("sin errores en la consola", async () => {
      assert.deepEqual(errores, []);
    });
    console.log(`\n${pasadas} pruebas de Apps Script pasaron.`);
  } catch (e) {
    console.error("\nFalló la prueba de Apps Script.");
    process.exitCode = 1;
  } finally {
    await navegador.close();
    servidorHttp.close();
  }
})();
