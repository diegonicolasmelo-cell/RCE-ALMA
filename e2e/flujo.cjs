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
    const paso = (c) => cel.click(`.paso-chip:has-text("·${c}")`);
    const pasoActual = () => cel.textContent('.paso-chip[aria-current="step"]');
    const franja = () => cel.locator(".franja-opciones .qchip").allTextContents();
    const entrar = async (rut = "Diego Melo", pin = "Kine") => {
      await cel.fill("#rut", rut);
      await cel.fill("#pin", pin);
      await cel.click("button[type=submit]");
    };

    console.log("Celular");
    await cel.goto(URL + "#celular");
    await cel.waitForSelector("#rut");

    await prueba("un PIN incorrecto no entra y un RUT fuera de la dotacion tampoco", async () => {
      await entrar("Diego Melo", "9999");
      assert.match(await cel.textContent("[role=alert]"), /Contraseña incorrecta/);
      await entrar("Nadie Aqui", "Kine");
      assert.match(await cel.textContent("[role=alert]"), /dotación/);
    });

    await prueba("entra con usuario y contraseña, elige sus camas y la portada las muestra primero", async () => {
      await entrar("diego melo", "kine");
      await cel.waitForSelector("text=¿Cuáles son tus camas hoy?");
      assert.equal(await cel.locator('[aria-label="Camas"] .chip').count(), 18);
      await cel.click('button:has-text("Ninguna")');
      await cel.click('.chip:text-is("07–12")');
      await cel.click('.chip:text-is("01–06")');
      await cel.click('button:has-text("Ver camas")');
      await cel.waitForSelector('article[aria-label^="Cama"]');
      const camas = await cel.locator('article[aria-label^="Cama"]').evaluateAll((l) => l.map((x) => x.getAttribute("aria-label")));
      assert.equal(camas.length, 18, "todas las tarjetas son visibles");
      assert.deepEqual(camas.slice(0, 12), Array.from({ length: 12 }, (_, i) => `Cama UCI-${String(i + 1).padStart(2, "0")}`), "las mias (01-12) van primero, en orden");
      assert.match(await cel.textContent(".app-cel"), /Mis camas \(12\)/);
      assert.match(await cel.textContent(".app-cel"), /Otras camas/);
      assert.ok((await cel.locator('article[aria-label="Cama UCI-01"] button:has-text("Registrar control")').count()) === 1);
      // dejar solo 01-06 como "mias" para el resto del recorrido
      await cel.click('button:has-text("Cambiar mis camas")');
      await cel.click('.chip:text-is("07–12")');
      await cel.click('button:has-text("Ver camas")');
      await cel.waitForSelector("text=Mis camas (6)");
      await cel.click('article[aria-label="Cama UCI-01"] button:has-text("Registrar control")');
      await cel.waitForSelector("#cuerpo");
      assert.equal((await cel.locator(".cel-camas .chip").count()), 18);
      assert.match(await cel.textContent(".app-cel b.mono"), /UCI-01/);
    });

    await prueba("las lecturas nacen en blanco con el valor anterior en gris (sin boton para copiarlo)", async () => {
      assert.equal(await cel.inputValue("#in-fc"), "");
      assert.match(await cel.getAttribute("#in-fc", "placeholder"), /^ant\. \d+/);
      await cel.click("#in-fc");
      assert.ok(!(await franja()).some((t) => t.startsWith("ant.")), "una lectura de monitor no debe ofrecer copiar la anterior");
    });

    await prueba("'Sig.' recorre los casilleros del bloque y pasa al bloque siguiente, sin saltarse ninguno", async () => {
      assert.match(await pasoActual(), /FC/);
      await cel.click("#in-fc");
      const secuencia = [await parada()];
      for (let i = 0; i < 2; i++) {
        await cel.click('.franja .qchip:has-text("Sig.")');
        await cel.waitForTimeout(250);
        secuencia.push(await parada());
      }
      assert.deepEqual(secuencia, ["fc", "pas", "pad"], "FC y luego los dos casilleros de la presion");
      assert.match(await pasoActual(), /PA/);
      // al terminar la PA pasa al bloque siguiente (neuromonitoreo), aunque no tenga casilleros
      await cel.click('.franja .qchip:has-text("Sig.")');
      await cel.waitForTimeout(250);
      assert.match(await pasoActual(), /PIC/, "el bloque siguiente se muestra aunque este vacio");
    });

    await prueba("con 'Siguiente' se recorren todos los bloques en orden, aunque esten vacios (sedacion, DVA...)", async () => {
      const vistos = [await pasoActual()];
      while ((await cel.locator('button:has-text("Siguiente")').count()) > 0) {
        await cel.click('button:has-text("Siguiente")');
        vistos.push(await pasoActual());
      }
      assert.deepEqual(vistos.map((t) => t.split("·")[1]), ["PIC", "Glasgow", "SAS", "Sedación", "DVA", "Modo", "Ventilación", "SpO₂", "Kine", "APK", "Terapia física"]);
      assert.equal(await cel.locator('button:has-text("‹ Atrás")').count(), 1);
      await cel.click('button:has-text("‹ Atrás")');
      assert.match(await pasoActual(), /APK/);
    });

    await prueba("en el Modo ofrece 'Igual que el anterior' u otra modalidad", async () => {
      await paso("Modo");
      await cel.click("#in-modo, button.pickbtn");
      const opciones = await franja();
      assert.match(opciones[0], /^Igual: /);
      assert.ok(opciones.includes("PCV") && opciones.includes("CNAF"));
    });

    await prueba("elegir otra modalidad cambia los casilleros; el salto al bloque siguiente lo decide la persona", async () => {
      await cel.click('.franja .qchip:has-text("PCV")');
      await cel.waitForTimeout(200);
      assert.match(await pasoActual(), /Modo/, "elegir una opcion no cambia de bloque");
      await cel.click('button:has-text("Siguiente")');
      assert.match(await pasoActual(), /Ventilación/);
      const etiquetas = await cel.locator('section:has(h3:has-text("Terapia ventilatoria")) .f label').allTextContents();
      assert.ok(etiquetas.some((t) => t.startsWith("P. control")));
      assert.ok(etiquetas.some((t) => t.startsWith("Auto PEEP")), "Auto PEEP aparece en modalidades controladas");
      assert.ok(!etiquetas.some((t) => t.startsWith("Vt programado")), "en PCV no hay volumen programado");
    });

    await prueba("la talla da el peso ideal y la franja ofrece 6, 7 y 8 ml/kg (180 cm: 450, 525 y 600)", async () => {
      await paso("Modo");
      await cel.click("#in-modo, button.pickbtn");
      await cel.click('.franja .qchip:has-text("ACVC")');
      await cel.click('.franja .qchip:has-text("Listo")');
      await paso("Modo");
      await cel.click('button:has-text("editar")');
      await cel.fill('input[aria-label="Talla en cm"]', "180");
      await cel.click('button:has-text("Listo")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".app-cel"), /Peso ideal\s*75\.1 kg/);
      await paso("Ventilación");
      await cel.click("#in-vent-vtProgramado");
      const t = (await franja()).join(" ");
      for (const v of ["450", "525", "600"]) assert.ok(t.includes(v), `falta ${v} en: ${t}`);
      await cel.click('.franja .qchip:has-text("600")');
      await cel.waitForTimeout(150);
      assert.match(await cel.textContent(".guide"), /600 ml.*8\.0 ml\/kg.*Protector/s);
      await cel.click('.franja .qchip:has-text("Listo")');
    });

    await prueba("asincronia en modalidad controlada bloquea el plateau", async () => {
      await paso("Modo");
      await cel.click('.seg button:has-text("Asincrónico")');
      assert.match(await cel.textContent(".notice.crit"), /invalidados/);
      await paso("Ventilación");
      assert.equal(await cel.locator("#in-vent-pPlateau").isDisabled(), true);
      await paso("Modo");
      await cel.click('.seg button:has-text("Sincrónico")');
    });

    await prueba("sedantes plegados: Iniciar abre el escalon con su dosis, y Suspender se puede deshacer", async () => {
      await paso("Sedación");
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
      await paso("SAS");
      await cel.click('.sas .chip:has-text("3")');
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /Falta:.*FC.*SpO₂/);
      assert.match(await pasoActual(), /FC/, "lleva al bloque donde falta el dato");
      await cel.click('button:has-text("Rellenar signos de ejemplo")');
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /kine respiratoria/);
      assert.match(await pasoActual(), /Kine/);
    });

    await prueba("la APK se exige una vez por turno y vale para los controles siguientes", async () => {
      await cel.click('.seg button:has-text("Sí")');
      await paso("Terapia física");
      await cel.locator('[aria-label="Terapia física"]').locator('button:has-text("No")').click();
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /APK/);
      assert.ok((await cel.locator("text=Alimentación suspendida (*)").count()) >= 1, "la hoja muestra las filas de la pauta de papel");
      await cel.click('button:has-text("Firmar APK")');
      assert.match(await cel.textContent(".notice.good"), /Este turno: firmada/);
      await cel.click('button:has-text("Guardar control")');
      await cel.waitForTimeout(500);
      assert.match(await aviso(), /Guardado UCI-01/);
    });

    await prueba("el control siguiente hereda ajustes e infusiones, pero no las lecturas ni la APK ya firmada", async () => {
      await paso("FC");
      assert.equal(await cel.inputValue("#in-fc"), "");
      assert.match(await cel.getAttribute("#in-fc", "placeholder"), /ant\. 86/);
      await paso("DVA");
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.03");
      await paso("APK");
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

    await prueba("PVE: checklist de 8 criterios, control inicial, cronometro, 30 min y post extubacion", async () => {
      await cel.click('.cel-camas button:text-is("02")');
      await cel.click('[role=tab]:has-text("PVE")');
      assert.ok((await cel.locator('button:has-text("Iniciar PVE")').count()) === 0, "sin checklist no se puede iniciar");
      // un criterio no cumple: no hay PVE
      await cel.locator('[aria-label="Resolución del cuadro"] button:text-is("No cumple")').click();
      for (const n of ["Signos de infección", "DVA", "PaFi", "Volumen minuto", "GCS / SAS", "Estab. metab. o vías de corrección", "Hb ≥ 7"]) {
        await cel.locator(`[aria-label="${n}"] button:text-is("Cumple")`).click();
      }
      await cel.click('button:has-text("Registrar checklist")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".notice.crit"), /no cumple/);
      assert.ok((await cel.locator('button:has-text("Iniciar PVE")').count()) === 0, "checklist no apto bloquea la PVE");
      // corregido: los 8 cumplen
      for (const n of ["Resolución del cuadro", "Signos de infección", "DVA", "PaFi", "Volumen minuto", "GCS / SAS", "Estab. metab. o vías de corrección", "Hb ≥ 7"]) {
        await cel.locator(`[aria-label="${n}"] button:text-is("Cumple")`).click();
      }
      await cel.click('button:has-text("Registrar checklist")');
      await cel.waitForTimeout(400);
      await cel.click('button:has-text("Iniciar PVE")');
      for (const [id, val] of [["fc", "82"], ["fr", "18"], ["pas", "122"], ["pad", "70"], ["spo2", "96"], ["gcs", "15"], ["vm", "7"]]) await cel.fill(`#pve-${id}`, val);
      await cel.click('button:has-text("Registrar e iniciar cronómetro")');
      await cel.waitForTimeout(500);
      assert.match(await cel.textContent("#pve-timer"), /0 \/ 30 min/);
      await cel.click('button:has-text("Control a los 30 min")');
      for (const [id, val] of [["fc", "88"], ["fr", "20"], ["pas", "118"], ["pad", "68"], ["spo2", "95"]]) await cel.fill(`#pve-${id}`, val);
      await cel.click('button:has-text("Registrar control")');
      await cel.click('button:has-text("Fin · tolerada")');
      await cel.waitForTimeout(400);
      await cel.click('button:has-text("Registrar extubación")');
      await cel.click('button:has-text("CNAF")');
      await cel.waitForTimeout(500);
      const lista = await cel.textContent(".app-cel");
      for (const m of ["Extubación", "30 min", "60 min", "120 min", "48 h"]) assert.ok(lista.includes(m), "falta " + m);
      assert.match(await cel.textContent(".airway"), /Vía aérea natural/);
    });

    await prueba("evaluacion MRC-ss desde la tarjeta de la cama: puntaje, corte de debilidad y registro", async () => {
      await cel.click('button:has-text("‹ Camas")');
      assert.ok((await cel.evaluate(() => document.documentElement.scrollWidth)) <= 391, "la lista de camas no desborda");
      await cel.click('article[aria-label="Cama UCI-03"] button:has-text("Evaluación")');
      await cel.click('button:has-text("Fuerza muscular MRC-ss")');
      for (const c of await cel.locator('input[id^="ev-m"]').all()) await c.fill("4");
      assert.match(await cel.textContent(".app-cel"), /MRC sum score 48\/60/);
      assert.match(await cel.textContent(".notice"), /Debilidad adquirida en UCI/);
      await cel.click('button:has-text("Registrar evaluación")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".app-cel"), /MRC-ss: 48|Fuerza muscular MRC-ss: 48/);
    });

    await prueba("el cambio de HME queda registrado y el bloqueo neuromuscular vive junto a la sedacion", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-03"] button:has-text("Control")');
      await paso("Sedación");
      assert.ok((await cel.locator('h3:has-text("Bloqueo neuromuscular")').count()) === 1, "BNM en el bloque de sedacion");
      await cel.click('[role=tab]:has-text("Eventos")');
      assert.ok((await cel.locator('button:has-text("Iniciar bloqueo neuromuscular")').count()) === 0, "ya no esta en Eventos");
      await cel.click('button:has-text("Cambio de filtro HME")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".app-cel"), /Filtro HME.*vence/);
    });

    console.log("Estacion (PC)");
    const pc = await ctx.newPage();
    vigilar(pc);
    await pc.setViewportSize({ width: 1280, height: 900 });
    await pc.goto(URL + "#estacion");
    await pc.waitForSelector(".cama");

    await prueba("el tablero muestra la unidad con identidad, y la alerta llega desde el celular sin recargar", async () => {
      assert.equal(await pc.locator(".cama").count(), 18);
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

    await prueba("la hoja APK se descarga como copia de la hoja de papel, con el RUN del paciente", async () => {
      const [descarga] = await Promise.all([pc.waitForEvent("download"), pc.click('button:has-text("Descargar APK")')]);
      const ruta = await descarga.path();
      const html = require("node:fs").readFileSync(ruta, "utf8");
      assert.match(html, /PAUTA DE COTEJO PREPARACIÓN DEL PACIENTE PARA EJECUCIÓN DE KTR/);
      assert.match(html, /Ficha o RUN del paciente:/);
      assert.match(html, /12\.345\.678-5/);
      assert.match(html, /Alimentación suspendida \(\*\)/);
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
      await pc.fill("#in-cama", "UCI-19");
      await pc.fill("#in-edad", "58");
      await pc.fill("#in-talla", "175");
      await pc.fill("#in-nombre", "Paciente Prueba Nueve");
      await pc.fill("#in-rut", "12345678-9");
      await pc.click('button[type=submit]:has-text("Ingresar")');
      assert.match(await pc.locator("[role=alert]").textContent(), /RUT no es válido/);
      await pc.fill("#in-rut", "12345678-5");
      await pc.click('button[type=submit]:has-text("Ingresar")');
      await pc.waitForTimeout(600);
      assert.equal(await pc.locator(".cama").count(), 19);
    });

    console.log("Sin conexion y en pantalla de celular");
    await prueba("la app se instala como PWA y funciona sin conexion", async () => {
      await cel.evaluate(() => navigator.serviceWorker.ready);
      await cel.reload();
      await cel.evaluate(() => navigator.serviceWorker.ready);
      await ctx.setOffline(true);
      await cel.reload();
      await cel.waitForSelector('article[aria-label^="Cama"]', { timeout: 8000 });
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
