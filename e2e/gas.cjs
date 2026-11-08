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
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>UPC-Pulse</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fs.readFileSync(INDEX, "utf8")}</body></html>`;

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
  const APP = gas.propiedades.get("APP_TOKEN");
  const ESTACION = gas.propiedades.get("STATION_TOKEN");
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
      assert.equal(g.titulo, "UPC-Pulse");
    });

    await prueba("?demo=1 arranca la demostracion sin tocar la hoja", async () => {
      const antes = llamadas.length;
      const { p, ctx } = await abrir({ parametros: { demo: "1" } });
      await p.waitForSelector("#rut", { timeout: 10000 });
      await p.fill("#rut", "diegonicolas.melo@gmail.com");
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
      await p.waitForSelector("text=No hay camas activas", { timeout: 10000 });
      // El servidor guardo un hash, nunca la clave.
      const usuarios = gas.hojas.get("usuarios").filas;
      const fila = usuarios.find((f) => f[0] === "16.452.891-K");
      assert.ok(fila[2] && fila[2] !== "kine" && !usuarios.flat().includes("kine"));
      const posts = llamadas.filter((l) => l.tipo === "post");
      assert.ok(posts.every((l) => l.cuerpo.token === APP && l.cuerpo.rut === "16.452.891-K"), "al servidor viaja el RUT, no el correo");
      await new Promise((r) => setTimeout(r, 800));
      assert.ok(llamadas.some((l) => l.tipo === "get" && l.params.token === APP && !l.params.recurso));
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
      await a.p.waitForSelector("text=No hay camas activas", { timeout: 10000 });
      await ctx.close();
    });

    await prueba("el PC de la estacion se conecta con sus dos enlaces y ninguna llave queda en la barra de afuera", async () => {
      const pc = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
      const a = await abrir({ hash: `config?a=${APP}` }, pc);
      await a.p.waitForSelector("#rut", { timeout: 10000 });
      await a.p.close();
      const b = await abrir({ hash: `estacion?t=${ESTACION}` }, pc);
      await b.p.waitForSelector(".estacion", { timeout: 10000 });
      const afuera = await b.p.evaluate(() => window.__hashAfuera);
      assert.ok(afuera.includes("estacion"), `barra de afuera: ${JSON.stringify(afuera)}`);
      assert.ok(afuera.every((h) => !h.includes(ESTACION) && !h.includes(APP)));
      await pc.close();
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
