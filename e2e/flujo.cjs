/**
 * Prueba de punta a punta en un navegador real: celular, PC de la estacion y
 * funcionamiento sin conexion. Levanta `vite preview` sobre el build.
 *
 *   npm run build && node e2e/flujo.cjs
 *
 * Requiere Playwright (npx playwright install chromium). Si Playwright esta
 * instalado globalmente: NODE_PATH=$(npm root -g) node e2e/flujo.cjs
 * Variable opcional: PLAYWRIGHT_CHROMIUM_PATH apunta a un Chromium ya instalado.
 */
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");

const PUERTO = Number(process.env.E2E_PORT ?? 4174);
const URL = `http://localhost:${PUERTO}/`;
const { chromium } = require("playwright");

let pasadas = 0;
const prueba = async (nombre, fn) => {
  try {
    await fn();
    pasadas += 1;
    console.log(`  ok   ${nombre}`);
  } catch (e) {
    console.log(`  FALLA ${nombre}\n       ${String(e.message).split("\n").slice(0, 4).join("\n       ")}`);
    throw e;
  }
};

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview no arranco");
}

(async () => {
  const servidor = spawn("npx", ["vite", "preview", "--port", String(PUERTO), "--strictPort"], { stdio: "ignore" });
  const errores = [];
  let navegador;
  try {
    await esperarServidor();
    navegador = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
    const vigilar = (p) => {
      p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
      p.on("console", (m) => m.type() === "error" && errores.push("console: " + m.text()));
    };
    const cel = await ctx.newPage();
    vigilar(cel);
    const aviso = () => cel.textContent(".toast-app");
    const parada = () => cel.evaluate(() => document.activeElement?.dataset?.stop);
    const franja = () => cel.locator(".franja-opciones .qchip").allTextContents();
    const entrar = async (rut = "16.452.891-K", pin = "0000") => {
      await cel.fill("#rut", rut);
      await cel.fill("#pin", pin);
      await cel.click("button[type=submit]");
    };

    console.log("Celular");
    await cel.goto(URL + "#celular");
    await cel.waitForSelector("#rut");

    await prueba("un PIN incorrecto no entra y un RUT fuera de la dotacion tampoco", async () => {
      await entrar("16.452.891-K", "9999");
      assert.match(await cel.textContent("[role=alert]"), /PIN incorrecto/);
      await entrar("12.345.678-5", "0000");
      assert.match(await cel.textContent("[role=alert]"), /dotación/);
    });

    await prueba("entra con el RUT con o sin puntos y ve sus camas", async () => {
      await entrar("16452891k", "0000");
      await cel.waitForSelector("#cuerpo");
      assert.equal((await cel.locator(".cel-camas .chip").count()), 8);
      assert.match(await cel.textContent(".app-cel b.mono"), /UCI-01/);
    });

    await prueba("las lecturas nacen en blanco con el valor anterior en gris (sin boton para copiarlo)", async () => {
      assert.equal(await cel.inputValue("#in-fc"), "");
      assert.match(await cel.getAttribute("#in-fc", "placeholder"), /^ant\. \d+/);
      await cel.click("#in-fc");
      assert.ok(!(await franja()).some((t) => t.startsWith("ant.")), "una lectura de monitor no debe ofrecer copiar la anterior");
    });

    await prueba("'Sig.' avanza casillero a casillero y se detiene en el Modo con 'Igual que el anterior'", async () => {
      await cel.click("#in-fc");
      const secuencia = [await parada()];
      for (let i = 0; i < 12 && (await parada()) !== "modo"; i++) {
        await cel.click('.franja .qchip:has-text("Sig.")');
        await cel.waitForTimeout(120);
        secuencia.push(await parada());
      }
      assert.deepEqual(secuencia.slice(0, 4), ["fc", "spo2", "pas", "pad"]);
      assert.equal(secuencia.at(-1), "modo");
      const opciones = await franja();
      assert.match(opciones[0], /^Igual: /);
      assert.ok(opciones.includes("PCV") && opciones.includes("CNAF"));
    });

    await prueba("elegir otra modalidad cambia los casilleros y pasa al primer ajuste", async () => {
      await cel.click('.franja .qchip:has-text("PCV")');
      await cel.waitForTimeout(200);
      assert.equal(await parada(), "vent:frProgramada");
      const etiquetas = await cel.locator('section:has(h3:has-text("Terapia ventilatoria")) .f label').allTextContents();
      assert.ok(etiquetas.some((t) => t.startsWith("P. control")));
      assert.ok(!etiquetas.some((t) => t.startsWith("Vt programado")), "en PCV no hay volumen programado");
      await cel.click('.franja .qchip:has-text("Listo")');
    });

    await prueba("la talla da el peso ideal y la franja ofrece 6, 7 y 8 ml/kg (180 cm: 450, 525 y 600)", async () => {
      await cel.click("#in-modo, button.pickbtn");
      await cel.click('.franja .qchip:has-text("ACVC")');
      await cel.click('.franja .qchip:has-text("Listo")');
      await cel.click('button:has-text("editar")');
      await cel.fill('input[aria-label="Talla en cm"]', "180");
      await cel.click('button:has-text("Listo")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".app-cel"), /Peso ideal\s*75\.1 kg/);
      await cel.click("#in-vent-vtProgramado");
      const t = (await franja()).join(" ");
      for (const v of ["450", "525", "600"]) assert.ok(t.includes(v), `falta ${v} en: ${t}`);
      await cel.click('.franja .qchip:has-text("600")');
      await cel.waitForTimeout(150);
      assert.match(await cel.textContent(".guide"), /600 ml.*8\.0 ml\/kg.*Protector/s);
      await cel.click('.franja .qchip:has-text("Listo")');
    });

    await prueba("asincronia en modalidad controlada bloquea el plateau", async () => {
      await cel.click('.seg button:has-text("Asincrónico")');
      assert.equal(await cel.locator("#in-vent-pPlateau").isDisabled(), true);
      assert.match(await cel.textContent(".notice.crit"), /invalidados/);
      await cel.click('.seg button:has-text("Sincrónico")');
    });

    await prueba("sedantes plegados: Iniciar abre el escalon con su dosis, y Suspender se puede deshacer", async () => {
      await cel.click('[role=tab]:has-text("Conciencia")');
      const tarjeta = cel.locator('.infu:has(b:text-is("Propofol"))');
      await tarjeta.locator('button:has-text("Iniciar")').click();
      await cel.waitForTimeout(200);
      // Cada opcion une el escalon con su dosis: "3" + "1.5".
      assert.ok((await franja()).includes("31.5"), "la franja ofrece los escalones 1 a 6 con su dosis");
      await cel.click('.franja .qchip:has-text("1.5")');
      assert.equal((await tarjeta.locator(".st.cur b").textContent()).trim(), "3");
      await tarjeta.locator('button:has-text("Suspender")').click();
      assert.match(await aviso(), /Propofol suspendida/);
      assert.equal(await tarjeta.locator('button:has-text("Iniciar")').count(), 1);
      await cel.click(".toast-btn");
      assert.equal(await tarjeta.locator('button:has-text("Suspender")').count(), 1);
      await tarjeta.locator('button:has-text("Suspender")').click();
    });

    await prueba("guardar incompleto dice que falta y lleva a la pestana correcta", async () => {
      await cel.click('.sas .chip:has-text("3")');
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /Falta:.*FC.*SpO₂/);
      await cel.click('[role=tab]:has-text("Control")');
      await cel.click('button:has-text("Rellenar signos de ejemplo")');
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /kine respiratoria/);
      assert.match(await cel.textContent("[role=tab][aria-selected=true]"), /Kine/);
    });

    await prueba("la APK se exige una vez por turno y vale para los controles siguientes", async () => {
      await cel.click('.seg button:has-text("Sí")');
      await cel.locator(".seg").nth(1).locator('button:has-text("No")').click();
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /APK/);
      await cel.click('button:has-text("Firmar: cumple la pauta")');
      assert.match(await cel.textContent(".notice.good"), /Declaro haber verificado/);
      await cel.click('button:has-text("Guardar control")');
      await cel.waitForTimeout(500);
      assert.match(await aviso(), /Guardado UCI-01/);
    });

    await prueba("el control siguiente hereda ajustes e infusiones, pero no las lecturas ni la APK ya firmada", async () => {
      await cel.click('[role=tab]:has-text("Control")');
      assert.equal(await cel.inputValue("#in-fc"), "");
      assert.match(await cel.getAttribute("#in-fc", "placeholder"), /ant\. 86/);
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.03");
      await cel.click('[role=tab]:has-text("Kine")');
      assert.ok((await cel.locator(".notice.good").count()) >= 1, "la APK del turno sigue vigente");
    });

    await prueba("una autoextubacion cambia la via aerea del episodio", async () => {
      await cel.click('[role=tab]:has-text("Eventos")');
      await cel.click('button:has-text("Autoextubación")');
      await cel.fill("#evf-txt", "tracciona el TET durante el aseo");
      await cel.click('button:has-text("Registrar")');
      await cel.waitForTimeout(600);
      assert.match(await aviso(), /Evento registrado/);
      assert.match(await cel.textContent(".airway"), /Vía aérea natural/);
    });

    console.log("Estacion (PC)");
    const pc = await ctx.newPage();
    vigilar(pc);
    await pc.setViewportSize({ width: 1280, height: 900 });
    await pc.goto(URL + "#estacion");
    await pc.waitForSelector(".cama");

    await prueba("el tablero muestra la unidad con identidad, y la alerta llega desde el celular sin recargar", async () => {
      assert.equal(await pc.locator(".cama").count(), 8);
      assert.match(await pc.locator(".cama .nm").first().textContent(), /Paciente Prueba/);
      await pc.waitForSelector(".cama.alerta", { timeout: 5000 });
      assert.match(await pc.locator(".cama.alerta .pill.crit").first().textContent(), /Autoextubación/);
    });

    await prueba("el informe de riesgo viene pre-llenado con el evento, la identidad y el contexto previo", async () => {
      const informe = await pc.locator("pre.nota").first().textContent();
      assert.match(informe, /Autoextubación no planificada/);
      assert.match(informe, /tracciona el TET/);
      assert.match(informe, /Paciente Prueba Uno · RUT 12\.345\.678-5/);
      assert.match(informe, /Contexto de las horas previas/);
    });

    await prueba("la sabana bloquea los datos de mecanica invalidados por asincronia", async () => {
      assert.ok((await pc.locator("table.sab .lockc").count()) >= 3);
      assert.ok((await pc.locator(".spark svg").count()) >= 4);
    });

    await prueba("el enlace a Sinapse dice por que esta desactivado", async () => {
      assert.match(await pc.locator('button:has-text("Abrir Sinapse")').textContent(), /VITE_SINAPSE_URL/);
    });

    await prueba("Para ALMA: paso a paso con Modelo Ventilador, y copiar deja la cama Transcrita", async () => {
      await pc.click('[role=tab]:has-text("Para ALMA")');
      await pc.waitForSelector(".alma");
      const campos = (await pc.locator(".flist li span:first-child").allTextContents()).map((s) => s.trim());
      assert.ok(campos.includes("Modelo Ventilador") && campos.includes("Vol. Minuto") && campos.includes("I:E"));
      await pc.click('button:has-text("Listo, siguiente")');
      await pc.click('button:has-text("Copiar evolución para ALMA")');
      await pc.waitForTimeout(500);
      assert.match(await pc.locator(".alma .pill").last().textContent(), /Transcrito/);
      assert.match(await pc.evaluate(() => navigator.clipboard.readText()), /EVOLUCIÓN KINESIOLOGÍA UPC/);
    });

    await prueba("ingresar un paciente valida el RUT y crea la cama", async () => {
      await pc.click('[role=tab]:has-text("Tablero")');
      await pc.click('button:has-text("Ingresar paciente")');
      await pc.fill("#in-cama", "UCI-09");
      await pc.fill("#in-edad", "58");
      await pc.fill("#in-talla", "175");
      await pc.fill("#in-nombre", "Paciente Prueba Nueve");
      await pc.fill("#in-rut", "12345678-9");
      await pc.click('button[type=submit]:has-text("Ingresar")');
      assert.match(await pc.locator("[role=alert]").textContent(), /RUT no es válido/);
      await pc.fill("#in-rut", "12345678-5");
      await pc.click('button[type=submit]:has-text("Ingresar")');
      await pc.waitForTimeout(600);
      assert.equal(await pc.locator(".cama").count(), 9);
    });

    console.log("Sin conexion y en pantalla de celular");
    await prueba("la app se instala como PWA y funciona sin conexion", async () => {
      await cel.evaluate(() => navigator.serviceWorker.ready);
      await cel.reload();
      await cel.evaluate(() => navigator.serviceWorker.ready);
      await ctx.setOffline(true);
      await cel.reload();
      await cel.waitForSelector("#cuerpo", { timeout: 8000 });
      assert.match(await cel.textContent(".cel-top"), /Sin señal/);
      assert.match(await cel.textContent(".app-cel b.mono"), /UCI/);
      await ctx.setOffline(false);
    });

    await prueba("ninguna pantalla desborda horizontalmente en un celular de 390 px", async () => {
      for (const ruta of ["#celular", "#estacion"]) {
        await cel.goto(URL + ruta);
        await cel.waitForTimeout(400);
        const ancho = await cel.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(ancho <= 391, `${ruta} mide ${ancho}px`);
      }
    });

    await prueba("sin errores en la consola durante todo el recorrido", async () => {
      assert.deepEqual(errores, []);
    });
    console.log(`\n${pasadas} pruebas de punta a punta pasaron.`);
  } catch (e) {
    console.error("\nFalló la prueba de punta a punta.");
    process.exitCode = 1;
  } finally {
    await navegador?.close();
    servidor.kill();
  }
})();
