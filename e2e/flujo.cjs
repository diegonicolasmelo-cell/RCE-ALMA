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
/** Agrega varias drogas de una vez con el panel de seleccion multiple. */
const agregarDrogas = async (pg, ids, tocar = false) => {
  const toque = (sel) => (tocar ? pg.tap(sel) : pg.click(sel));
  await toque(".agregar-inf");
  for (const id of ids) await toque(`.elegir-inf button[data-id="${id}"]`);
  await toque('.pie-inf button:has-text("Agregar (")');
};

const prueba = async (nombre, fn) => {
  try {
    await fn();
    pasadas += 1;
    console.log(`  ok   ${nombre}`);
  } catch (e) {
    console.log(`  FALLA ${nombre}\n       ${String(e.message).split("\n").slice(0, 400).join("\n       ")}`);
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
    const entrar = async (rut = "Diego Melo", pin = "Kine") => {
      await cel.fill("#rut", rut);
      await cel.fill("#pin", pin);
      await cel.click("button[type=submit]");
    };

    console.log("Celular");
    await cel.goto(URL + "#celular");
    await cel.waitForSelector("#rut");

    await prueba("el codigo publicado no trae correos reales ni RUT de profesionales (viven en la hoja usuarios)", async () => {
      const fs = require("node:fs");
      const dir = require("node:path").join(__dirname, "..", "dist", "assets");
      const js = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(require("node:path").join(dir, f), "utf8")).join("\n");
      assert.ok(!/@(gmail|hotmail|outlook|yahoo)\./i.test(js), "hay un correo real en el codigo publicado");
      assert.ok(!js.includes("16.452.891"), "hay un RUT de profesional en el codigo publicado");
    });

    await prueba("un correo fuera de la dotacion no entra", async () => {
      await entrar("Diego Melo", "9999");
      assert.match(await cel.textContent("[role=alert]"), /Contraseña incorrecta/);
      await entrar("Nadie Aqui", "Kine");
      assert.match(await cel.textContent("[role=alert]"), /dotación/);
    });

    await prueba("entra con correo y contraseña, elige sus camas y la portada las muestra primero", async () => {
      await entrar("diego.melo@demo.upc", "kine");
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
      assert.ok((await cel.locator('article[aria-label="Cama UCI-01"] button:has-text("Monitorización")').count()) === 1);
      // Mias 07-12: arriba 07..12, despues 01..06 y 13..18, todas en una columna.
      await cel.click('button:has-text("Cambiar mis camas")');
      await cel.click('.chip:text-is("01–06")');
      await cel.click('button:has-text("Ver camas")');
      await cel.waitForSelector("text=Mis camas (6)");
      const orden = (await cel.locator('article[aria-label^="Cama"]').evaluateAll((l) => l.map((x) => x.getAttribute("aria-label").slice(-2))));
      assert.deepEqual(orden, ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "13", "14", "15", "16", "17", "18"]);
      // dejar solo 01-06 como "mias" para el resto del recorrido
      await cel.click('button:has-text("Cambiar mis camas")');
      await cel.click('.chip:text-is("07–12")');
      await cel.click('.chip:text-is("01–06")');
      await cel.click('button:has-text("Ver camas")');
      await cel.waitForSelector("text=Mis camas (6)");
      // PVE directa: la cama en CPAP/PS la ofrece en su tarjeta; la que esta en modalidad controlada no.
      assert.equal(await cel.locator('article[aria-label="Cama UCI-02"] button:has-text("PVE")').count(), 0, "ventilado en ACVC: no se ofrece PVE (solo TET con el ultimo control en CPAP+PS)");
      // Cada tarjeta tiene sus tres accesos directos: Monitorización, Evaluaciones y Eventos.
      assert.deepEqual((await cel.locator('article[aria-label="Cama UCI-02"] .botones-cama button').allTextContents()).map((x) => x.trim()), ["Monitorización", "Evaluaciones", "Eventos"]);
      await cel.click('article[aria-label="Cama UCI-01"] button:has-text("Evaluar PVE diaria")');
      await cel.waitForSelector('section[aria-label="Checklist"]');
      assert.match(await cel.textContent(".ctl-cabeza h1"), /PVE · Cama 1/);
      assert.match(await cel.textContent(".app-cel"), /Checklist: 8 criterios del protocolo/);
      assert.equal(await cel.locator('button:has-text("Guardar control")').count(), 0, "la PVE directa no abre el control");
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-01"] button:has-text("Monitorización")');
      await cel.waitForSelector("#cuerpo");
      assert.equal((await cel.locator(".cel-camas .chip").count()), 18);
      // Cabecera: «Control · Cama 1» con la fecha al lado, y la banda del paciente en dos lineas a lo ancho.
      assert.match(await cel.textContent(".ctl-cabeza h1"), /^Control · Cama 1$/);
      assert.match(await cel.textContent(".ctl-cabeza .fecha"), /^\S+ \d{1,2} \S+$/, "la fecha va al lado del titulo: " + (await cel.textContent(".ctl-cabeza .fecha")));
      assert.equal(await cel.locator(".banda > div").count(), 2, "la banda tiene dos lineas");
      assert.match(await cel.textContent(".banda .l1"), /TET .* · VM \d+ [hd]/);
      assert.match(await cel.textContent(".banda .l2"), /PI \d+(,\d)? kg · Vt 6-8 ml\/kg: \d+-\d+ ml · talla 172 cm/);
    });

    await prueba("el control es el registro simple: dos tarjetas, CSV y terapia ventilatoria, una fila por dato", async () => {
      assert.deepEqual(await cel.locator(".hoja-simple > section > h2").evaluateAll((l) => l.map((x) => x.firstChild.textContent.trim())), ["CSV", "Terapia ventilatoria"]);
      const csv = (await cel.locator('section[aria-label="CSV"] > .fila > .et').allTextContents()).map((t) => t.split(/\s{2,}|Se guarda|lpm|mmHg|%|O · V · M|1-7/)[0].trim());
      assert.deepEqual(csv.slice(0, 7), ["Hora del control", "Frec. cardiaca", "P. arterial", "PAM", "SpO₂", "Glasgow", "SAS"], csv.join(" | "));
      assert.match(await cel.textContent('section[aria-label="CSV"]'), /Se guarda: hoy \d\d:\d\d \(\d\d-\d\d\)/);
      assert.equal(await cel.locator('section[aria-label="CSV"] .par #in-pas + span + #in-pad').count(), 1, "PAS / PAD en una fila");
      // Las lecturas nacen en blanco, sin el valor anterior a la vista.
      assert.equal(await cel.inputValue("#in-fc"), "");
      assert.ok(!(await cel.getAttribute("#in-fc", "placeholder")), "nada que parezca pre-rellenado");
      // En un PC no aparece el teclado propio: se escribe con el teclado fisico.
      await cel.click("#in-fc");
      assert.equal(await cel.locator(".kb").isVisible(), false);
    });

    await prueba("Enter pasa a la casilla siguiente, como en la hoja", async () => {
      await cel.focus("#in-fc");
      const orden = [];
      for (let i = 0; i < 4; i++) {
        await cel.keyboard.press("Enter");
        orden.push(await cel.evaluate(() => document.activeElement.id));
      }
      assert.deepEqual(orden, ["in-pas", "in-pad", "in-spo2", "in-gcs-o"]);
    });

    await prueba("el modo ofrece solo los de la via aerea y cada modo pide solo sus casillas", async () => {
      const opciones = await cel.locator("#in-modo option").allTextContents();
      assert.ok(opciones.includes("ACPC") && opciones.includes("Tubo T / HME"), opciones.join(" | "));
      assert.ok(!opciones.some((o) => /CNAF|Naricera|VNI/.test(o)), "con TET no hay oxigenoterapia ni VNI: " + opciones.join(" | "));
      await cel.selectOption("#in-modo", "PCV");
      const et = await cel.locator('section[aria-label="Terapia ventilatoria"] .fila .et').allTextContents();
      assert.ok(et.some((t) => t.startsWith("P. control")) && et.some((t) => t.startsWith("Auto PEEP")), et.join(" | "));
      assert.ok(!et.some((t) => t.startsWith("Vt programado")), "en ACPC no hay volumen programado");
      await cel.selectOption("#in-modo", "ACVC");
    });

    await prueba("el Vt dice cuanto es por kilo de peso ideal, y la talla se corrige ahi mismo", async () => {
      const fila = cel.locator('.fila:has(#in-vent-vtProgramado)');
      assert.match(await fila.textContent(), /6 ml\/kg 405 · 8 ml\/kg 540 \(PI 67,8 kg\)/);
      await cel.fill("#in-vent-vtProgramado", "430");
      assert.match(await fila.textContent(), /6,3 ml\/kg de peso ideal/);
      await cel.click('.guia-pi button:has-text("editar")');
      await cel.fill('input[aria-label="Talla en cm"]', "180");
      await cel.press('input[aria-label="Talla en cm"]', "Enter");
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".banda .l2"), /PI 75,1 kg .* talla 180 cm/);
      await cel.fill("#in-vent-vtProgramado", "");
    });

    await prueba("asincronia en modalidad controlada bloquea el plateau", async () => {
      await cel.locator('[aria-label="Asincronía"] button:text-is("Sí")').click();
      assert.equal(await cel.locator("#in-vent-pPlateau").isDisabled(), true);
      assert.match(await cel.textContent(".notice.crit"), /invalidados/);
      await cel.locator('[aria-label="Asincronía"] button:text-is("No")').click();
    });

    await prueba("Glasgow O, V y M en una fila (la V queda en T con TET, sin total) y sin S5Q", async () => {
      await cel.fill("#in-gcs-o", "3");
      await cel.fill("#in-gcs-o", "9");
      assert.equal(await cel.inputValue("#in-gcs-o"), "3", "un valor fuera de rango se ignora");
      await cel.fill("#in-gcs-m", "5");
      assert.equal(await cel.locator("#in-gcs-v").count(), 0, "con via aerea artificial el verbal no se pide");
      assert.equal(await cel.locator('[aria-label="Verbal T"]').count(), 1);
      assert.doesNotMatch(await cel.textContent('.fila.gcs'), /9T/, "sin total: se ve en la sabana");
      assert.equal(await cel.locator("#in-s5q").count(), 0, "el S5Q salio del control");
    });

    await prueba("infusiones en curso en filas, con lo de antes, ▼ ▲ y un solo «Agregar droga o infusión»", async () => {
      const nora = cel.locator('.fila.inf[aria-label="Noradrenalina"]');
      assert.match(await nora.textContent(), /antes 0\.03/);
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.03", "la infusion en curso se hereda");
      await cel.click('button[aria-label="Subir Noradrenalina"]');
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.04", "▲ sube un paso");
      await cel.click('button[aria-label="Bajar Noradrenalina"]');
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.03");
      await agregarDrogas(cel, ["rocuronio"]);
      assert.equal(await cel.locator('.fila.inf[aria-label="Rocuronio"]').count(), 1, "el bloqueo neuromuscular va en la misma lista");
      await cel.click('button[aria-label="Suspender Rocuronio"]');
      assert.equal(await cel.locator('.fila.inf[aria-label="Rocuronio"]').count(), 0);
    });

    await prueba("sedante: al agregarlo parte en el escalon 1, las flechas titulan por escalon y se guarda la dosis; suspender se puede deshacer", async () => {
      const fila = cel.locator('.fila.inf[aria-label="Propofol"]');
      assert.equal(await fila.count(), 0, "lo que no esta en curso no ocupa lugar hasta agregarlo");
      await agregarDrogas(cel, ["propofol"]);
      assert.equal(await cel.inputValue("#in-inf-propofol-dosis"), "0.5", "parte en la dosis del escalon 1");
      await cel.click('button[aria-label="Subir Propofol"]');
      assert.equal(await cel.inputValue("#in-inf-propofol-dosis"), "1", "la flecha sube al escalon siguiente");
      assert.match(await fila.textContent(), /escalón 2/);
      await cel.click('button[aria-label="Bajar Propofol"]');
      assert.equal(await cel.inputValue("#in-inf-propofol-dosis"), "0.5");
      await cel.click('button[aria-label="Suspender Propofol"]');
      assert.match(await aviso(), /Propofol suspendida/);
      assert.equal(await fila.count(), 0);
      await cel.click(".toast-btn");
      assert.equal(await fila.count(), 1, "deshacer la vuelve a poner");
      await cel.click('button[aria-label="Suspender Propofol"]');
    });

    await prueba("en el celular, el teclado propio del registro simple: Sig. avanza, la fila queda marcada y la cabecera se oculta", async () => {
      const movil = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const m = await movil.newPage();
      vigilar(m);
      await m.goto(URL + "#celular");
      await m.fill("#rut", "diego.melo@demo.upc");
      await m.fill("#pin", "kine");
      await m.tap("button[type=submit]");
      await m.waitForSelector("text=¿Cuáles son tus camas hoy?");
      await m.tap('.chip:text-is("01–06")');
      await m.tap('button:has-text("Ver camas")');
      await m.tap('article[aria-label="Cama UCI-03"] button:has-text("Monitorización")');
      await m.waitForSelector(".hoja-simple");
      assert.equal(await m.getAttribute("#in-fc", "inputmode"), "none", "no se abre el teclado del sistema");
      await m.tap("#in-fc");
      await m.waitForSelector(".kb:not([hidden])");
      assert.equal(await m.locator(".cel-top").isVisible(), false, "la cabecera se oculta mientras se escribe");
      for (const k of ["9", "0"]) await m.tap(`.kb [data-kb="${k}"]`);
      await m.tap('.kb [data-kb="sig"]');
      assert.equal(await m.inputValue("#in-fc"), "90");
      assert.equal(await m.evaluate(() => document.activeElement.id), "in-pas", "Sig. pasa a la casilla siguiente");
      assert.equal(await m.locator(".fila.activa #in-pas").count(), 1, "la fila que se llena queda marcada");
      for (const k of ["1", "2", "5", "borrar", "0"]) await m.tap(`.kb [data-kb="${k}"]`);
      assert.equal(await m.inputValue("#in-pas"), "120");
      await m.tap('.kb [data-kb="ocultar"]');
      await m.waitForTimeout(200);
      assert.equal(await m.locator(".kb").isVisible(), false);
      assert.ok(await m.locator(".cel-top").isVisible(), "al ocultar el teclado vuelve la cabecera");
      // Glasgow: teclado con solo los valores validos (O 1-4, M 1-6); un toque deja el valor y avanza.
      await m.tap("#in-gcs-o");
      await m.waitForSelector(".kb.rango:not([hidden])");
      assert.deepEqual(await m.locator(".kb-vals button").allTextContents(), ["1", "2", "3", "4"], "ocular: 1 a 4");
      const kbCaja = await m.locator(".kb").boundingBox();
      const tecla = await m.locator(".kb-vals button").first().boundingBox();
      assert.ok(tecla.height >= 48, `teclas de al menos 48 px de alto (${tecla.height})`);
      assert.ok(kbCaja.height <= 844 * 0.4, `el teclado no tapa mas del 40 % de la pantalla (${kbCaja.height} px)`);
      await m.tap('.kb-vals button:text-is("3")');
      assert.equal(await m.inputValue("#in-gcs-o"), "3");
      assert.equal(await m.evaluate(() => document.activeElement.id), "in-gcs-m", "con TQT el verbal es T: pasa directo al motor");
      assert.deepEqual(await m.locator(".kb-vals button").allTextContents(), ["1", "2", "3", "4", "5", "6"], "motor: 1 a 6");
      await m.tap('.kb-vals button:text-is("6")');
      assert.equal(await m.inputValue("#in-gcs-m"), "6");
      await m.waitForTimeout(200);
      assert.equal(await m.locator(".kb").isVisible(), false, "tras el motor sigue un desplegable: el teclado de escala se oculta del todo");
      // Agregar una droga deja el teclado en su dosis; ▲ ▼ titulan sin cerrar el teclado ni mover la hoja.
      // Seleccion multiple: se marcan varias y se agregan juntas, sin abrir el teclado ni mover la hoja.
      await m.locator(".agregar-inf").scrollIntoViewIfNeeded();
      const hojaAntes = await m.evaluate(() => ({ top: document.getElementById("cuerpo").scrollTop, alto: document.getElementById("cuerpo").scrollHeight }));
      await m.tap(".agregar-inf");
      await m.waitForSelector('[role=dialog][aria-label="Agregar drogas o infusiones"]');
      const hojaAbierto = await m.evaluate(() => ({ top: document.getElementById("cuerpo").scrollTop, alto: document.getElementById("cuerpo").scrollHeight }));
      assert.equal(hojaAbierto.alto, hojaAntes.alto, "el panel flota: la hoja no cambia de tamano");
      assert.ok(Math.abs(hojaAbierto.top - hojaAntes.top) < 8, `ni se mueve (${hojaAntes.top} -> ${hojaAbierto.top})`);
      // Tocar fuera del panel lo cierra sin agregar nada.
      await m.mouse.click(195, 60);
      await m.waitForSelector('[role=dialog][aria-label="Agregar drogas o infusiones"]', { state: "detached" });
      await m.tap(".agregar-inf");
      for (const id of ["fentanilo", "midazolam", "adrenalina"]) await m.tap(`.elegir-inf button[data-id="${id}"]`);
      await m.tap('.elegir-inf button[data-id="midazolam"]');
      await m.tap('.elegir-inf button[data-id="noradrenalina"]');
      assert.match(await m.textContent(".pie-inf .btn.primary"), /Agregar \(3\)/, "marcar y desmarcar cuenta bien");
      const filasAntes = await m.locator(".fila.inf").count();
      // Con el boton a la vista (como lo tendria la persona), se mide la hoja antes y despues.
      await m.locator('.pie-inf button:has-text("Agregar (")').scrollIntoViewIfNeeded();
      const antesAgregar = await m.evaluate(() => ({ top: document.getElementById("cuerpo").scrollTop, panel: document.querySelector(".hoja-simple .acciones").getBoundingClientRect().top }));
      await m.tap('.pie-inf button:has-text("Agregar (")');
      await m.waitForTimeout(300);
      assert.equal(await m.locator(".fila.inf").count(), filasAntes + 3, "se agregan las tres juntas");
      assert.equal(await m.locator(".kb").isVisible(), false, "agregar no abre el teclado");
      assert.ok(await m.locator(".cel-top").isVisible(), "la cabecera no se oculta: la hoja no salta");
      const despues = await m.evaluate(() => ({ top: document.getElementById("cuerpo").scrollTop, nueva: document.querySelector(".fila.inf.reciente").getBoundingClientRect().top }));
      assert.ok(Math.abs(despues.nueva - antesAgregar.panel) < 4, `las nuevas aparecen donde estaba el panel (${antesAgregar.panel} -> ${despues.nueva})`);
      assert.equal(await m.locator(".fila.inf.reciente").count(), 3, "las nuevas se resaltan un momento");
      await m.tap("#in-inf-noradrenalina-dosis");
      await m.waitForSelector(".kb:not([hidden])");
      await m.waitForTimeout(500);
      const yAntes = (await m.locator("#in-inf-noradrenalina-dosis").boundingBox()).y;
      for (let i = 0; i < 3; i++) await m.tap('button[aria-label="Subir Noradrenalina"]');
      await m.tap('button[aria-label="Bajar Noradrenalina"]');
      await m.waitForTimeout(400);
      assert.equal(await m.evaluate(() => document.activeElement.id), "in-inf-noradrenalina-dosis", "la dosis sigue con el foco");
      assert.ok(await m.locator(".kb").isVisible(), "el teclado no se cierra");
      assert.equal(await m.locator(".cel-top").isVisible(), false, "la cabecera no vuelve (sin tiron)");
      const yDespues = (await m.locator("#in-inf-noradrenalina-dosis").boundingBox()).y;
      assert.ok(Math.abs(yDespues - yAntes) < 4, `la fila no se mueve (${yAntes} -> ${yDespues})`);
      // Suspender con el cursor en la dosis: con otra infusion debajo, el cursor pasa a ella y
      // el teclado sigue abierto; la fila vecina ocupa el lugar sin que la hoja salte.
      await m.tap('.kb [data-kb="ocultar"]');
      await m.waitForTimeout(200);
      await agregarDrogas(m, ["vasopresina"], true);
      await m.waitForTimeout(400);
      await m.tap("#in-inf-noradrenalina-dosis");
      await m.waitForTimeout(500);
      const yNora = (await m.locator("#in-inf-noradrenalina-dosis").boundingBox()).y;
      const vecina = await m.evaluate(() => {
        const l = [...document.querySelectorAll('.fila.inf input[id^="in-inf-"]')].map((x) => x.id);
        return l[l.indexOf("in-inf-noradrenalina-dosis") + 1];
      });
      await m.tap('button[aria-label="Suspender Noradrenalina"]');
      await m.waitForTimeout(500);
      assert.equal(await m.evaluate(() => document.activeElement.id), vecina, "el cursor pasa a la dosis de la fila de abajo");
      assert.ok(await m.locator(".kb").isVisible(), "el teclado sigue abierto");
      assert.equal(await m.locator(".cel-top").isVisible(), false, "sin tiron: la cabecera no vuelve");
      const yVaso = (await m.locator(`#${vecina}`).boundingBox()).y;
      assert.ok(Math.abs(yVaso - yNora) < 6, `la vecina ocupa el lugar (${yNora} -> ${yVaso})`);
      // Suspender todas: con la ultima, el cursor pasa a la casilla siguiente de la hoja y el
      // teclado sigue abierto (sin cabecera que vuelva ni salto).
      while ((await m.locator('.fila.inf input[id^="in-inf-"]').count()) > 0) {
        const primera = m.locator('.fila.inf input[id^="in-inf-"]').first();
        const idPrimera = await primera.getAttribute("id");
        await primera.tap();
        await m.waitForTimeout(400);
        await m.tap(`.fila.inf:has(#${idPrimera}) button.quitar`);
        await m.waitForTimeout(400);
        assert.ok(await m.locator(".kb").isVisible(), `al suspender ${idPrimera} el teclado sigue abierto`);
        assert.equal(await m.locator(".cel-top").isVisible(), false, `al suspender ${idPrimera} la cabecera no vuelve`);
      }
      const foco = await m.evaluate(() => document.activeElement.id);
      assert.ok(foco && !foco.startsWith("in-inf-"), `tras la ultima, el cursor queda en otra casilla de la hoja (${foco})`);
      if (await m.locator(".kb").isVisible()) await m.tap('.kb [data-kb="ocultar"]');
      await m.waitForTimeout(200);
      // Evaluaciones: el MRC-ss con su teclado (solo 0 a 5 y NE); cada toque deja el valor y avanza.
      await m.tap('button:has-text("‹ Camas")');
      await m.tap('article[aria-label="Cama UCI-03"] button:has-text("Evaluaciones")');
      await m.tap('.pestanas-ev button:text-is("Fuerza y función")');
      await m.tap('[data-escala="MRC_SS"]');
      await m.tap("#ev-m1d");
      await m.waitForSelector(".kb.mrc:not([hidden])");
      assert.equal(await m.locator('.kb [data-kb="6"]').count(), 0, "el teclado del MRC no tiene 6");
      assert.equal(await m.locator('.kb [data-kb="NE"]').count(), 1);
      await m.tap('.kb [data-kb="4"]');
      assert.equal(await m.inputValue("#ev-m1d"), "4");
      assert.equal(await m.evaluate(() => document.activeElement.id), "ev-m1i", "avanza solo al lado izquierdo");
      await m.tap('.kb [data-kb="NE"]');
      assert.equal(await m.inputValue("#ev-m1i"), "NE");
      await m.tap('.kb [data-kb="ocultar"]');
      // Eventos: las casillas numericas de los formularios usan el mismo teclado.
      await m.tap('button:has-text("‹ Camas")');
      await m.tap('article[aria-label="Cama UCI-02"] button:has-text("Eventos")');
      await m.tap('button:has-text("Ajustar posición del tubo")');
      assert.equal(await m.getAttribute("#evf-cm", "inputmode"), "none");
      await m.tap("#evf-cm");
      await m.waitForSelector(".kb:not([hidden])");
      assert.ok(await m.locator(".cel-top").isVisible(), "fuera de la hoja la cabecera no se oculta");
      for (const k of ["borrar", "borrar", "2", "3"]) await m.tap(`.kb [data-kb="${k}"]`);
      assert.equal(await m.inputValue("#evf-cm"), "23");
      await m.tap('.kb [data-kb="sig"]');
      await m.waitForTimeout(200);
      assert.equal(await m.locator(".kb").isVisible(), false, "en la ultima casilla, Sig. cierra el teclado");
      // Ingreso de una cama libre: talla, calibre y cm con el teclado propio; Sig. recorre las tres.
      const est = await movil.newPage();
      await est.goto(URL + "#estacion");
      await est.click('.cama:has-text("UCI-18")');
      await est.click('button:text-is("Dar de alta")');
      await est.click('button:has-text("Confirmar alta y borrar la identidad")');
      await est.waitForTimeout(500);
      await est.close();
      await m.tap('button:has-text("‹ Camas")');
      await m.tap('button[aria-label="Ingresar Cama 18"]');
      await m.locator('[aria-label="Sexo"] button:text-is("Hombre")').tap();
      await m.locator('[aria-label="Vía aérea"] button:text-is("TET")').tap();
      assert.equal(await m.getAttribute("#ir-talla", "inputmode"), "none", "el ingreso no abre el teclado del sistema");
      await m.tap("#ir-talla");
      await m.waitForSelector(".kb:not([hidden])");
      for (const k of ["1", "7", "0", "sig", "7", ",", "5", "sig", "2", "2"]) await m.tap(`.kb [data-kb="${k}"]`);
      assert.deepEqual([await m.inputValue("#ir-talla"), await m.inputValue("#ir-cal"), await m.inputValue("#ir-cm")], ["170", "7,5", "22"]);
      const cajaKb = await m.locator(".kb").boundingBox();
      const cajaCm = await m.locator("#ir-cm").boundingBox();
      assert.ok(cajaCm.y + cajaCm.height <= cajaKb.y, "el teclado no tapa la casilla que se llena");
      await m.tap('.kb [data-kb="ocultar"]');
      await m.tap('form[aria-label="Ingreso Cama 18"] button[type=submit]');
      await m.waitForSelector('.ctl-cabeza h1:text-is("Control · Cama 18")');
      assert.match(await m.textContent(".banda .l1"), /TET 7,5 · 22 cm/);
      await movil.close();
    });

    await prueba("guardar incompleto dice que falta y lleva a la pestana correcta", async () => {
      await cel.fill("#in-sas", "3");
      assert.match(await cel.textContent('.fila:has(#in-sas)'), /Sedado/, "al lado del numero aparece la descripcion del SAS");
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /Falta:.*FC.*SpO₂/);
      await cel.waitForTimeout(500);
      assert.match(await cel.textContent("[role=tab][aria-selected=true]"), /Control/, "lleva a la hoja donde falta el dato");
      assert.equal(await cel.evaluate(() => document.activeElement.id), "in-fc", "y deja el cursor en la FC");
      await cel.click('button:has-text("Rellenar signos de ejemplo")');
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /firmar la APK/);
      assert.match(await cel.textContent("[role=tab][aria-selected=true]"), /Kine/);
    });

    await prueba("la APK se exige una vez por turno y vale para los controles siguientes", async () => {
      const kine = await cel.textContent(".app-cel");
      assert.ok(kine.includes("Auscultación") && kine.includes("Secreciones"), "la kine respiratoria pide auscultacion y secreciones");
      assert.ok(!/Aspiración|TrachCare|Set\b/.test(await cel.textContent('.segmento[data-seg="kine"]')), "ya no se pregunta por aspiracion");
      assert.equal(await cel.locator('[aria-label="Kinesiterapia respiratoria"]').count(), 0, "cada control es una atencion: no hay Si/No de kine");
      // auscultacion y secreciones en listas desplegables
      await cel.fill("#in-auscultacion", "Crépitos bibasales, roncus");
      assert.equal(await cel.inputValue("#in-auscultacion"), "Crépitos bibasales, roncus", "la auscultacion es texto libre");
      assert.ok((await cel.locator("#sugerencias-auscultacion option").count()) >= 5, "con sugerencias desplegables");
      assert.equal(await cel.locator("#in-auscultacion[type=checkbox], .desplegable input[type=checkbox]").count(), 0, "ya no hay casillas de verificacion");
      // reologia y cantidad solo se habilitan si hay secreciones
      assert.equal(await cel.locator("#sel-cantidad").isDisabled(), true, "sin aspecto, la cantidad esta deshabilitada");
      assert.equal(await cel.locator("#sel-reologia").isDisabled(), true);
      assert.equal(await cel.locator("#sel-aspecto option").count(), 14, "13 aspectos mas el vacio");
      await cel.selectOption("#sel-aspecto", "MUCOPURULENTA_TINTE_HEMATICO");
      assert.equal(await cel.locator("#sel-cantidad").isDisabled(), false);
      await cel.selectOption("#sel-cantidad", "MODERADA");
      await cel.selectOption("#sel-aspecto", "NINGUNA");
      assert.equal(await cel.locator("#sel-cantidad").isDisabled(), true, "sin secreciones se vuelve a deshabilitar");
      assert.equal(await cel.inputValue("#sel-cantidad"), "", "y se limpia");
      // la tos se registra en el control; el flujo pico de tos y la deglucion son evaluaciones
      await cel.selectOption("#sel-tos", "DEFICIENTE");
      assert.equal(await cel.locator("#in-pef-tos").count(), 0, "el flujo pico de tos ya no esta en el control");
      assert.equal(await cel.locator("#sel-deglucion").count(), 0, "la deglucion ya no esta en el control");
      // la kine motora va aparte y no es obligatoria
      assert.equal(await cel.locator('[aria-label="Terapia física"]').count(), 0, "la terapia fisica no esta en kine respiratoria");
      await cel.click('[role=tab]:has-text("Kine motora")');
      assert.equal(await cel.locator('[aria-label="Terapia física"]').count(), 1);
      await cel.click('[role=tab]:has-text("Kine resp.")');
      await cel.click('button:has-text("Guardar control")');
      assert.match(await aviso(), /APK/);
      await cel.waitForTimeout(500);
      assert.match(await cel.textContent('.paso-chip[aria-current="step"]'), /APK/, "lleva a la APK: " + (await cel.textContent('.paso-chip[aria-current="step"]')) + " / " + (await aviso()));
      assert.equal(await cel.locator(".segmento[data-seg=apk] .seg, .segmento[data-seg=apk] [aria-label=\"Alimentación suspendida (*)\"]").count(), 0, "solo firmar: sin formulario criterio por criterio");
      await cel.click('button:has-text("Firmar APK")');
      assert.match(await cel.textContent(".notice.good"), /APK firmada · \d\d\/\d\d\/\d{4} \d\d:\d\d · DM/, "queda con fecha, hora y siglas de quien inicio sesion");
      assert.match(await cel.textContent(".notice.good"), /todos tus controles de este turno/);
      await cel.click('button:has-text("Guardar control")');
      await cel.waitForTimeout(500);
      assert.match(await aviso(), /Guardado UCI-01/);
      await cel.waitForSelector('article[aria-label^="Cama"]');
      assert.equal(await cel.locator("#cuerpo .segmento").count(), 0, "al guardar vuelve a las tarjetas de las camas");
      await cel.click('article[aria-label="Cama UCI-01"] button:has-text("Monitorización")');
      await cel.waitForSelector(".hoja-simple");
    });

    await prueba("el control siguiente hereda ajustes e infusiones, pero no las lecturas ni la APK ya firmada", async () => {
      await cel.click('[role=tab]:has-text("Control")');
      assert.equal(await cel.inputValue("#in-fc"), "");
      assert.ok(!(await cel.getAttribute("#in-fc", "placeholder")), "nada pre-rellenado");
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.03");
      await cel.click('button[aria-label="Subir Noradrenalina"]');
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.04", "▲ sube un paso");
      await cel.click('button[aria-label="Bajar Noradrenalina"]');
      assert.equal(await cel.inputValue("#in-inf-noradrenalina-dosis"), "0.03", "▼ baja un paso");
      await cel.click('[role=tab]:has-text("Kine")');
      assert.ok((await cel.locator(".notice.good").count()) >= 1, "la APK del turno sigue vigente");
    });

    await prueba("Eventos desde la tarjeta: una autoextubacion cambia la via aerea y lleva al control post evento", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-02"] button:has-text("Eventos")');
      await cel.waitForSelector('.ctl-cabeza h1:text-is("Eventos · Cama 2")');
      await cel.click('button:has-text("Autoextubación")');
      const opciones = await cel.locator("#evf-disp option").allTextContents();
      assert.ok(opciones.includes("Reintubación inmediata"), "la autoextubacion puede terminar en reintubacion inmediata: " + opciones.join(" | "));
      await cel.fill("#evf-txt", "tracciona el TET durante el aseo");
      await cel.click('button:has-text("Registrar")');
      await cel.waitForSelector('.ctl-cabeza h1:text-is("Control · Cama 2")');
      assert.match(await aviso(), /Autoextubación registrada\. Sigue con el control post evento/);
      assert.match(await cel.textContent(".banda"), /Vía aérea natural/);
    });

    await prueba("intubar desde Eventos pide el tubo, los cm en la arcada, la talla y el sexo, y lleva al control", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-02"] button:has-text("Eventos")');
      // Con via aerea natural no hay cambios de HME, HEPA ni TrachCare, ni el cuadro de filtros.
      for (const t of ["Cambio de filtro HME", "Cambio de TrachCare", "Cambio de filtro HEPA", "Extubación fuera de protocolo", "Traqueostomía", "Ajustar posición del tubo", "Autoextubación", "Iniciar prono"]) assert.equal(await cel.locator(`button:has-text("${t}")`).count(), 0, t);
      assert.equal(await cel.locator('h3:text-is("Filtros y circuito")').count(), 0);
      // Ya se extubo (autoextubacion): lo que se ofrece es una REintubacion.
      assert.equal(await cel.locator('.evgrid button:text-is("Intubación")').count(), 0);
      await cel.click('.evgrid button:text-is("Reintubación")');
      assert.equal(await cel.inputValue("#evf-talla"), "162", "la talla del paciente viene puesta");
      await cel.click('button:text-is("Registrar")');
      assert.match(await aviso(), /Falta el calibre/);
      await cel.fill("#evf-cal", "7.5");
      await cel.fill("#evf-fij", "22");
      await cel.click('button:text-is("Registrar")');
      await cel.waitForSelector('.ctl-cabeza h1:text-is("Control · Cama 2")');
      assert.match(await cel.textContent(".banda .l1"), /TET 7\.5 · 22 cm/);
      // La linea de tiempo junta los eventos y los controles, del mas nuevo al mas antiguo, con fecha y hora.
      await cel.click('[role=tab]:has-text("Eventos")');
      assert.equal(await cel.locator('.evgrid button:text-is("Reintubación")').count(), 0, "intubado: ya no se ofrece intubar");
      assert.equal(await cel.locator('.evgrid button:text-is("Extubación fuera de protocolo")').count(), 1);
      // Con TET: cambio de tubo si; lo de la canula (TQT), no.
      for (const t of ["Cambio de cánula", "Decanulación"]) assert.equal(await cel.locator(`.evgrid button:text-is("${t}")`).count(), 0, t);
      const linea = await cel.locator('[aria-label="Línea de tiempo"] li').allTextContents();
      assert.match(linea[0] ?? "", /^hoy \d\d:\d\d\s*Reintubación TET calibre 7\.5/, linea.join(" | "));
      assert.ok(linea.some((x) => /AUTOEXTUBACIÓN, queda en/.test(x)), "la autoextubacion queda en la linea: " + linea.join(" | "));
      assert.ok(linea.some((x) => /Control · ACVC/.test(x)), "los controles tambien");
      await cel.click('[role=tab]:has-text("Control")');
    });

    await prueba("corregir un dato mal anotado no crea evento; un cambio de tubo real si, y no es reintubacion", async () => {
      await cel.click('[role=tab]:has-text("Eventos")');
      const nLinea = await cel.locator('[aria-label="Línea de tiempo"] li').count();
      // Correccion: el colega anoto 7.5 / 22 y era 8.0 / 23.
      await cel.click('[aria-label="Vía aérea actual"] button:has-text("Corregir dato")');
      await cel.fill("#cv-calibre", "8.0");
      await cel.fill("#cv-cm", "23");
      await cel.click('button:has-text("Guardar corrección")');
      await cel.waitForSelector('.toast-app:has-text("No se registró ningún evento")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent('[aria-label="Vía aérea actual"]'), /TET 8\.0 · 23 cm[\s\S]*Corregido por Klgo\.? ?Diego Melo|TET 8\.0 · 23 cm[\s\S]*Corregido por Diego Melo/);
      assert.match(await cel.textContent(".banda .l1"), /TET 8\.0 · 23 cm/);
      assert.equal(await cel.locator('[aria-label="Línea de tiempo"] li').count(), nLinea, "la correccion no aparece como evento");
      // Cambio de tubo real: queda en la linea de tiempo con su motivo, sin reintubar.
      await cel.click('.evgrid button:text-is("Cambio de tubo")');
      assert.equal(await cel.inputValue("#evf-cal"), "8.0", "parte con el calibre actual");
      await cel.fill("#evf-cal", "7.0");
      await cel.selectOption("#evf-mot", "FUGA");
      await cel.click('button:text-is("Registrar")');
      await cel.waitForTimeout(500);
      assert.match(await cel.textContent(".banda .l1"), /TET 7\.0 · 23 cm/);
      const linea = await cel.locator('[aria-label="Línea de tiempo"] li').allTextContents();
      assert.match(linea[0] ?? "", /Cambio de tubo: TET calibre 7\.0, fijación 23 cm \(fuga\)/, linea.join(" | "));
      await cel.click('[role=tab]:has-text("Control")');
    });

    await prueba("un solo boton de extubacion: fuera de protocolo antes de 24 h de VM, PVE despues; sin PVE posible, se extuba fuera de protocolo desde la PVE", async () => {
      // UCI-02 se reintubo recien (menos de 24 h): la tarjeta ofrece la extubacion fuera de protocolo.
      await cel.click('button:has-text("‹ Camas")');
      const tarjeta = cel.locator('article[aria-label="Cama UCI-02"]');
      await tarjeta.waitFor();
      assert.equal(await tarjeta.locator('button:has-text("Extubación fuera de protocolo")').count(), 1);
      assert.equal(await tarjeta.locator('button:has-text("PVE")').count(), 0, "antes de 24 h no se ofrece PVE");
      await tarjeta.locator('button:has-text("Extubación fuera de protocolo")').click();
      await cel.waitForSelector("#evf-mot");
      assert.equal(await cel.inputValue("#evf-mot"), "MENOS_24H_VM", "el motivo viene marcado");
      const motivos = await cel.locator("#evf-mot option").allTextContents();
      assert.ok(motivos.includes("Agitación psicomotora"), motivos.join(" | "));
      await cel.click('button:text-is("Cancelar")');
      // UCI-09 (mas de 24 h, en ACVC, ventilacion domiciliaria): la PVE no se puede, pero desde ahi se extuba.
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-09"] button:has-text("Eventos")');
      assert.equal(await cel.locator('.evgrid button:text-is("Extubación fuera de protocolo")').count(), 0, "con mas de 24 h el boton es la PVE");
      const pveBtn = cel.locator('.evgrid button:has-text("PVE")');
      assert.match(await pveBtn.textContent(), /último control en CPAP\+PS[\s\S]*fuera de protocolo/);
      await pveBtn.click();
      await cel.click('button:has-text("No corresponde PVE: extubar fuera de protocolo")');
      const opciones = await cel.locator('[aria-label="Por qué sin PVE"] button').allTextContents();
      assert.deepEqual(opciones, ["Adecuación del esfuerzo terapéutico", "Ventilación mecánica domiciliaria", "Agitación psicomotora", "Otro motivo"]);
      await cel.click('button:has-text("Registrar extubación fuera de protocolo")');
      assert.match(await cel.textContent("[role=alert]"), /por qué no corresponde PVE/);
      await cel.click('[aria-label="Por qué sin PVE"] button:text-is("Ventilación mecánica domiciliaria")');
      await cel.click('[aria-label="Queda con"] button:text-is("VMNI")');
      await cel.click('button:has-text("Registrar extubación fuera de protocolo")');
      await cel.waitForSelector('.ctl-cabeza h1:text-is("Control · Cama 9")');
      assert.match(await cel.textContent(".banda"), /Vía aérea natural/);
      await cel.click('[role=tab]:has-text("Eventos")');
      const linea = await cel.locator('[aria-label="Línea de tiempo"] li').allTextContents();
      assert.match(linea[0] ?? "", /Extubación fuera de protocolo \(sin PVE: ventilación mecánica domiciliaria\), queda en/, linea.join(" | "));
      await cel.click('[role=tab]:has-text("Control")');
    });

    await prueba("autoextubacion con reintubacion inmediata: sigue por el mismo camino de la intubacion y lleva al control", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-04"] button:has-text("Eventos")');
      await cel.click('button:has-text("Autoextubación")');
      await cel.fill("#evf-txt", "se retira el TET en agitación");
      await cel.selectOption("#evf-disp", "REINTUBACION_INMEDIATA");
      await cel.click('button:text-is("Registrar")');
      await cel.waitForSelector("#evf-cal");
      assert.match(await aviso(), /Ahora registra la reintubación/);
      assert.match(await cel.textContent(".card:has(#evf-cal)"), /Reintubación/);
      await cel.fill("#evf-cal", "8");
      await cel.fill("#evf-fij", "23");
      await cel.click('button:text-is("Registrar")');
      await cel.waitForSelector('.ctl-cabeza h1:text-is("Control · Cama 4")');
      assert.match(await cel.textContent(".banda .l1"), /TET 8 · 23 cm/);
      await cel.click('[role=tab]:has-text("Eventos")');
      const linea = await cel.locator('[aria-label="Línea de tiempo"] li').allTextContents();
      assert.ok(linea.some((x) => /AUTOEXTUBACIÓN con reintubación inmediata/.test(x)), linea.join(" | "));
      await cel.click('[role=tab]:has-text("Control")');
    });

    await prueba("PVE como el registro simple: checklist, inicio, termino contrastado, extubacion, post extubacion y falla con reintubacion", async () => {
      assert.equal(await cel.locator('[role=tab]:has-text("PVE")').count(), 0, "sin pestaña PVE en el control");
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-06"] button:has-text("PVE")');
      await cel.waitForSelector('section[aria-label="Checklist"]');
      const todos = ["Resolución del cuadro", "Signos de infección", "DVA", "PaFi", "Volumen minuto", "GCS / SAS", "Estab. metab. o vías de corrección", "Hb ≥ 7"];
      // Un criterio no cumple: no hay PVE.
      await cel.click('button:has-text("Registrar checklist")');
      assert.match(await cel.textContent("[role=alert]"), /Marca los 8 criterios/);
      await cel.locator('[aria-label="Resolución del cuadro"] button:text-is("No cumple")').click();
      for (const n of todos.slice(1)) await cel.locator(`[aria-label="${n}"] button:text-is("Cumple")`).click();
      await cel.click('button:has-text("Registrar checklist")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".notice.crit"), /no cumple · Resolución del cuadro/);
      assert.equal(await cel.locator('button:has-text("Iniciar PVE")').count(), 0, "checklist no apto bloquea la PVE");
      // Corregido: los 8 cumplen.
      for (const n of todos) await cel.locator(`[aria-label="${n}"] button:text-is("Cumple")`).click();
      await cel.click('button:has-text("Registrar checklist")');
      await cel.waitForSelector('section[aria-label="Control de inicio"]');
      // Control de inicio: hora real unos minutos antes.
      const real = await cel.evaluate(() => { const d = new Date(Date.now() - 5 * 60_000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; });
      for (const [id, val] of [["fc", "82"], ["fr", "18"], ["pas", "122"], ["pad", "70"], ["spo2", "96"], ["gcsO", "4"], ["gcsM", "6"], ["vm", "7"]]) await cel.fill(`#pve-${id}`, val);
      await cel.locator('[aria-label="Trabajo respiratorio"] button:text-is("Sin aumento")').click();
      await cel.fill("#pve-hora", real);
      await cel.click('button:has-text("Iniciar PVE")');
      await cel.waitForSelector('section[aria-label="Control de término"]');
      assert.match(await cel.textContent("#pve-timer"), new RegExp(`desde las ${real} · \\d+ / 30 min`));
      // Termino: cada fila muestra el valor de inicio y la diferencia.
      await cel.fill("#pve-fc", "88");
      assert.match(await cel.textContent('.fila:has(#pve-fc)'), /al inicio 82 · \+6/);
      for (const [id, val] of [["fr", "20"], ["pas", "118"], ["pad", "68"], ["spo2", "95"]]) await cel.fill(`#pve-${id}`, val);
      await cel.click('button:text-is("Tolerada")');
      await cel.waitForSelector('section[aria-label="¿Se extuba?"]');
      const filaFc = await cel.locator('.contraste tr:has-text("Frec. cardiaca")').textContent();
      assert.match(filaFc, /82\s*88\s*\+6/);
      assert.ok((await cel.evaluate(() => document.documentElement.scrollWidth)) <= 391, "el contraste no desborda en 390 px");
      // Extubacion programada: con que queda.
      await cel.click('button:has-text("Registrar extubación programada")');
      assert.match(await cel.textContent("[role=alert]"), /Indica con qué queda/);
      await cel.locator('[aria-label="Queda con"] button:text-is("CNAF")').click();
      await cel.click('button:has-text("Registrar extubación programada")');
      await cel.waitForSelector('section[aria-label="Controles post extubación"]');
      const lista = await cel.textContent('section[aria-label="Controles post extubación"]');
      for (const m of ["30 min", "60 min", "120 min", "48 h"]) assert.ok(lista.includes(m), "falta " + m);
      // Falla post extubacion: pasa directo a la reintubacion.
      await cel.locator('[aria-label="Falla post extubación"] button:text-is("Sí")').click();
      await cel.fill("#pve-hip", "Estridor laríngeo");
      await cel.locator('[aria-label="Vía"] button:text-is("TET")').click();
      await cel.click('button:has-text("Registrar falla y reintubación")');
      assert.match(await cel.textContent("[role=alert]"), /Falta el calibre/);
      await cel.fill("#pve-rcal", "7.5");
      await cel.fill("#pve-rcm", "21");
      await cel.click('button:has-text("Registrar falla y reintubación")');
      await cel.waitForTimeout(500);
      assert.match(await aviso(), /la vía aérea vuelve a TET/);
      await cel.click('button:has-text("‹ Camas")');
      assert.match(await cel.textContent('article[aria-label="Cama UCI-06"]'), /TET 7\.5 · 21 cm · TOT 0 d/);
      await cel.click('article[aria-label="Cama UCI-06"] button:has-text("Monitorización")');
    });

    await prueba("pasar de CPAP+PS a tubo T / HME es una desvinculacion, con su propia hora real", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-06"] button:has-text("Monitorización")');
      await cel.waitForSelector(".hoja-simple");
      await cel.selectOption("#in-modo", "TUBO_T");
      const ev = cel.locator(".evento-soporte");
      assert.match(await ev.textContent(), /Desvinculación · de CPAP\+PS a Tubo T \/ HME/);
      await cel.fill("#in-hora-evento", "00:00");
      assert.match(await ev.textContent(), /Se guarda: (hoy|ayer) 00:00 \(\d\d-\d\d\)|más de 12 h/);
      assert.match(await ev.textContent(), /no es una PVE/);
      // Volver a CPAP+PS: ya no hay cambio de soporte.
      await cel.selectOption("#in-modo", "CPAP_PS");
      assert.equal(await cel.locator(".evento-soporte").count(), 0);
      // Deja la cama sin guardar: de vuelta a las tarjetas desde cero.
      await cel.reload();
      await cel.waitForSelector('article[aria-label^="Cama"], .ctl-cabeza');
    });

    await prueba("evaluaciones en cuatro pestañas: cada bloque cabe en la pantalla, con hora real, botones y correccion del dato previo", async () => {
      if (await cel.locator('button:has-text("‹ Camas")').count()) await cel.click('button:has-text("‹ Camas")');
      await cel.waitForSelector('article[aria-label="Cama UCI-03"]');
      assert.ok((await cel.evaluate(() => document.documentElement.scrollWidth)) <= 391, "la lista de camas no desborda");
      await cel.click('article[aria-label="Cama UCI-03"] button:has-text("Evaluaciones")');
      assert.deepEqual(await cel.locator(".pestanas-ev button").allTextContents(), ["Previa a la UCI", "Fuerza y función", "PVE y extubación", "Imagen"]);
      for (const p of ["Previa a la UCI", "Fuerza y función", "PVE y extubación", "Imagen"]) {
        await cel.click(`.pestanas-ev button:text-is("${p}")`);
        const sobra = await cel.evaluate(() => { const c = document.querySelector(".cel-cuerpo"); return c ? c.scrollHeight - c.clientHeight : 0; });
        assert.ok(sobra <= 4, `${p}: el bloque cabe sin scroll (sobran ${sobra} px)`);
      }
      // Con TQT (cama 3) no hay PVE, y dice por que.
      await cel.click('.pestanas-ev button:text-is("PVE y extubación")');
      assert.ok(await cel.locator('[data-escala="PVE"]').isDisabled());
      assert.match(await cel.textContent('[data-escala="PVE"]'), /Con TQT no hay PVE/);
      // Tos y deglucion: con TQT aparecen el azul de metileno y la PTT. Hora real, unos minutos antes.
      await cel.click('[data-escala="TOS_DEGLUCION"]');
      assert.equal(await cel.locator('[aria-label="Test de azul de metileno (BDT)"]').count(), 1);
      await cel.fill("#ev-pcf", "55");
      await cel.locator('[aria-label="Deglución"] button:text-is("Alterada leve")').click();
      const real = await cel.evaluate(() => {
        const d = new Date(Date.now() - 7 * 60_000);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      });
      await cel.fill("#ev-hora", real);
      await cel.fill("#ev-nota", "Tose al tragar saliva; se mantiene régimen cero");
      assert.match(await cel.textContent(".ev-res"), /Tos ineficaz/);
      await cel.click('button:has-text("Guardar Tos y deglución")');
      await cel.waitForTimeout(400);
      assert.match(await aviso(), new RegExp(`Guardado: Tos y deglución: PCF 55 L/min · deglución alterada leve.* · ${real}`));
      assert.match(await cel.textContent('[data-escala="TOS_DEGLUCION"]'), /Última: Tos y deglución: PCF 55/);
      // MRC-ss con botones 0-5: 12 movimientos en 4 = 48, sin DAUCI (el corte es < 48).
      await cel.click('.pestanas-ev button:text-is("Fuerza y función")');
      await cel.click('[data-escala="MRC_SS"]');
      // Como el registro simple: una fila por movimiento con Der. e Izq.
      assert.equal(await cel.locator(".fila.mrc").count(), 6);
      for (const c of await cel.locator('.fila.mrc input').all()) await c.fill("4");
      assert.match(await cel.textContent(".ev-res"), /MRC-ss 48\/60/);
      assert.match(await cel.textContent(".ev-res"), /Sin DAUCI/);
      await cel.click('button:has-text("Guardar MRC-ss")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent('[data-escala="MRC_SS"]'), /MRC-ss 48\/60/);
      // Fragilidad: dato unico del episodio; volver a registrarla la corrige.
      await cel.click('.pestanas-ev button:text-is("Previa a la UCI")');
      await cel.click('[data-escala="FRAGILIDAD"]');
      await cel.click('button:has-text("Guardar Fragilidad")');
      assert.match(await cel.textContent('[role=alert]'), /Falta: el nivel de fragilidad/);
      await cel.locator('.ecf button:has-text("Vive con fragilidad leve")').click();
      await cel.click('button:has-text("Guardar Fragilidad")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent('[data-escala="FRAGILIDAD"]'), /Registrado: Fragilidad: ECF 5 .* tocar para corregir/);
      await cel.click('[data-escala="FRAGILIDAD"]');
      assert.equal(await cel.locator('.ecf button[aria-pressed="true"] .n').textContent(), "5", "reabre con lo registrado");
      await cel.locator('.ecf button:has-text("Vive con fragilidad moderada")').click();
      await cel.click('button:has-text("Guardar corrección")');
      await cel.waitForTimeout(400);
      assert.match(await aviso(), /Corregido: Fragilidad: ECF 6/);
      // Charlson: cada toque baja la pantalla un renglon.
      await cel.click('[data-escala="CHARLSON"]');
      const y0 = await cel.evaluate(() => document.querySelector("#cuerpo").scrollTop);
      await cel.locator(".ev-chk").nth(2).click();
      await cel.waitForTimeout(500);
      assert.ok((await cel.evaluate(() => document.querySelector("#cuerpo").scrollTop)) > y0, "al marcar, la pantalla avanza sola");
      assert.match(await cel.textContent(".ev-res"), /Charlson 1 pt sin edad/);
      await cel.click('button:text-is("Cancelar")');
    });

    await prueba("el cambio de HME queda registrado y el bloqueo neuromuscular vive en las infusiones en curso", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-03"] button:has-text("Monitorización")');
      await cel.click('[role=tab]:has-text("Control")');
      await cel.click(".agregar-inf");
      assert.ok((await cel.locator('.elegir-inf .sub-titulo:text-is("Bloqueo neuromuscular")').count()) === 1, "el BNM se agrega en las infusiones en curso, con la sedacion");
      await cel.click('.pie-inf button:text-is("Cancelar")');
      await cel.click('[role=tab]:has-text("Eventos")');
      assert.ok((await cel.locator('button:has-text("Iniciar bloqueo neuromuscular")').count()) === 0, "ya no esta en Eventos");
      await cel.click('button:has-text("Cambio de filtro HME")');
      await cel.waitForTimeout(400);
      assert.match(await cel.textContent(".app-cel"), /Filtro HME.*vence/);
    });

    await prueba("un control nuevo hereda solo el modo y la FiO2; los demas ajustes nacen en blanco y se repiten con 'Usar lo anterior'", async () => {
      await cel.click('button:has-text("‹ Camas")');
      await cel.click('article[aria-label="Cama UCI-01"] button:has-text("Monitorización")');
      await cel.waitForSelector(".hoja-simple");
      assert.equal(await cel.inputValue("#in-vent-fio2"), "35", "la FiO2 se hereda");
      for (const id of ["peep", "vtProgramado", "frProgramada", "flujo", "ti"]) {
        const n = await cel.locator(`#in-vent-${id}`).count();
        if (n) assert.equal(await cel.inputValue(`#in-vent-${id}`), "", id + " nace en blanco");
      }
      const boton = cel.locator('button:has-text("Usar lo anterior")');
      if (await boton.count()) {
        await boton.click();
        let alguno = false;
        for (const id of ["peep", "vtProgramado", "frProgramada", "flujo", "ti"]) {
          if ((await cel.locator(`#in-vent-${id}`).count()) && (await cel.inputValue(`#in-vent-${id}`)) !== "") alguno = true;
        }
        assert.ok(alguno, "el boton repite los ajustes anteriores");
        assert.equal(await cel.locator('button:has-text("Usar lo anterior")').count(), 0, "una vez usado, ya no hay nada que sugerir");
      }
    });

    await prueba("CNAF: flujo, temperatura, FiO2, FR y musculatura accesoria en el mismo cuadro; la SpO2 en CSV", async () => {
      await cel.click('.cel-camas button:text-is("05")');
      await cel.click('[role=tab]:has-text("Control")');
      await cel.selectOption("#in-modo", "CNAF");
      const etiquetas = await cel.locator('section[aria-label="Terapia ventilatoria"] .fila .et').allTextContents();
      assert.equal(await cel.locator('section[aria-label="CSV"] #in-spo2').count(), 1, "la SpO2 va en CSV, como en el registro simple");
      for (const e of ["Flujo", "Temperatura", "FiO₂", "FR"]) assert.ok(etiquetas.some((t) => t.startsWith(e)), "falta " + e + " en " + etiquetas.join("|"));
      assert.equal(await cel.locator('section[aria-label="Terapia ventilatoria"] [aria-label="Uso de musculatura accesoria"]').count(), 1);
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
      // La autoextubacion se registro en la cama 2 desde su tarjeta.
      await pc.click(".cama.alerta");
      const informe = await pc.locator("pre.nota").first().textContent();
      assert.match(informe, /Evento: Autoextubación/);
      assert.doesNotMatch(informe, /no planificada/i);
      assert.match(informe, /tracciona el TET/);
      assert.match(informe, /Paciente Prueba Dos · RUT 9\.876\.543-\w/);
      assert.match(informe, /Contexto de las horas previas/);
      await pc.click('.cama:has-text("UCI-01")');
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
      // Plana, en el orden de la hoja: bloques Monitorizacion, Terapia ventilatoria y Kinesiologia, y la firma al final.
      const grupos = await pc.locator(".sabana-vista tr.sv-grupo td").allTextContents();
      assert.deepEqual(grupos, ["Monitorización", "Terapia ventilatoria", "Kinesiología"]);
      assert.equal((await pc.locator(".sabana-vista tbody tr").last().locator("td").first().textContent()).trim(), "Firma");
      assert.equal(await pc.locator(".spark svg").count(), 0, "sin curvas: la sabana es plana");
      // 24 h por defecto; toda la estadia muestra al menos lo mismo.
      const n24 = await pc.locator(".sabana-vista thead tr").nth(1).locator("th").count();
      await pc.click('.sv-rango button:has-text("Toda la estadía")');
      const nTodo = await pc.locator(".sabana-vista thead tr").nth(1).locator("th").count();
      assert.ok(nTodo >= n24, `estadia ${nTodo} >= 24 h ${n24}`);
      await pc.click('.sv-rango button:has-text("Últimas 24 h")');
      // Los demas eventos van aparte; las evaluaciones en su pestana.
      assert.equal(await pc.locator('.sabana-vista [aria-label="Otros eventos"]').count(), 1);
      await pc.click('.sv-pestanas button:has-text("Evaluaciones")');
      assert.ok((await pc.locator(".sv-evaluaciones").count()) === 1);
      await pc.click('.sv-pestanas button:text-is("Sábana")');
      // Las camas se pliegan con la flecha: la sabana gana el ancho; se despliegan igual.
      const anchoAntes = (await pc.locator(".tablero-ficha").boundingBox()).width;
      await pc.click('button[aria-label="Ocultar las camas"]');
      assert.equal(await pc.locator(".tablero-camas").count(), 0);
      const anchoDespues = (await pc.locator(".tablero-ficha").boundingBox()).width;
      assert.ok(anchoDespues > anchoAntes + 150, `la sabana se ensancha (${anchoAntes} -> ${anchoDespues})`);
      await pc.click('button[aria-label="Mostrar las camas"]');
      assert.equal(await pc.locator(".tablero-camas").count(), 1);
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

    await prueba("una cama libre aparece en la estacion; ingresar valida el RUT y la ocupa", async () => {
      await pc.click('[role=tab]:has-text("Tablero")');
      assert.equal(await pc.locator('[aria-label="Camas libres"]').count(), 0, "unidad llena: sin camas libres");
      await pc.click('.cama:has-text("UCI-17")');
      await pc.click('button:text-is("Dar de alta")');
      await pc.click('button:has-text("Confirmar alta y borrar la identidad")');
      await pc.waitForSelector('[aria-label="Camas libres"] h3:has-text("Camas libres (1)")');
      await pc.click('button[aria-label="Ingresar paciente en Cama 17"]');
      assert.equal(await pc.inputValue("#in-cama"), "UCI-17", "el ingreso parte con la cama elegida");
      await pc.selectOption("#in-edad", "40–59");
      await pc.fill("#in-talla", "175");
      await pc.fill("#in-nombre", "Paciente Prueba Nueve");
      await pc.fill("#in-rut", "12345678-9");
      await pc.click('button[type=submit]:has-text("Ingresar")');
      assert.match(await pc.locator("[role=alert]").textContent(), /RUT no es válido/);
      await pc.fill("#in-rut", "12345678-5");
      await pc.click('button[type=submit]:has-text("Ingresar")');
      await pc.waitForTimeout(600);
      assert.equal(await pc.locator(".cama").count(), 18);
      assert.equal(await pc.locator('[aria-label="Camas libres"]').count(), 0);
    });

    await prueba("ingreso rapido a pie de cama: el celular ingresa sin nombre ni RUT y el PC completa la identidad", async () => {
      // El PC libera la cama 18.
      await pc.click('.cama:has-text("UCI-18")');
      await pc.click('button:text-is("Dar de alta")');
      await pc.click('button:has-text("Confirmar alta y borrar la identidad")');
      await pc.waitForTimeout(600);
      // El celular la ve libre y la ingresa.
      await cel.reload();
      if (await cel.locator('button:has-text("‹ Camas")').count()) await cel.click('button:has-text("‹ Camas")');
      await cel.waitForSelector("article.cama-sin");
      assert.equal(await cel.locator("article.cama-sin").count(), 1, "una cama libre, en su lugar de la lista");
      assert.match(await cel.textContent('article.cama-sin'), /UCI-18[\s\S]*Sin ingreso/);
      await cel.click('button[aria-label="Ingresar Cama 18"]');
      await cel.click('form[aria-label="Ingreso Cama 18"] button[type=submit]');
      assert.match(await cel.textContent('form[aria-label="Ingreso Cama 18"] [role=alert]'), /sexo/);
      await cel.locator('[aria-label="Sexo"] button:text-is("Mujer")').click();
      await cel.fill("#ir-talla", "160");
      assert.match(await cel.textContent('form[aria-label="Ingreso Cama 18"] .notice.acc'), /Peso ideal 52,4 kg · Vt 6 ml\/kg 315 · 7 ml\/kg 365 · 8 ml\/kg 420 ml/);
      await cel.locator('[aria-label="Vía aérea"] button:text-is("TET")').click();
      await cel.fill("#ir-cal", "7");
      await cel.click('form[aria-label="Ingreso Cama 18"] button[type=submit]');
      assert.match(await cel.textContent('form[aria-label="Ingreso Cama 18"] [role=alert]'), /arcada/);
      await cel.fill("#ir-cm", "21");
      await cel.click('form[aria-label="Ingreso Cama 18"] button[type=submit]');
      await cel.waitForSelector('.ctl-cabeza h1:text-is("Control · Cama 18")');
      assert.match(await cel.textContent(".banda .l1"), /TET 7 · 21 cm/);
      assert.match(await cel.textContent(".banda .l2"), /PI 52,4 kg/);
      // El PC la ve sin identidad y la completa (cifrada en produccion).
      await pc.waitForTimeout(800);
      await pc.click('.cama:has-text("UCI-18")');
      await pc.waitForSelector('form[aria-label="Completar identidad"]');
      assert.match(await pc.textContent(".detail-head"), /edad pendiente/);
      await pc.fill("#ci-nombre", "Paciente Prueba Dieciocho");
      await pc.selectOption("#ci-edad", "40–59");
      await pc.fill("#ci-dx", "Neumonía grave");
      await pc.click('button:has-text("Guardar identidad")');
      await pc.waitForTimeout(600);
      assert.match(await pc.textContent(".detail-head h2"), /Paciente Prueba Dieciocho/);
      assert.match(await pc.textContent(".detail-head"), /40–59 años · Neumonía grave/);
      // El ingreso quedo grabado solo, con la hora del registro (llego ventilado: VM desde ahi).
      assert.match(await pc.textContent(".detail-head"), /Ingreso a la UCI: \d\d-\d\d-\d{4} \d\d:\d\d · VM 0 h/);
      // Se corrige en el PC: 30 horas antes, y la VM pasa a contarse desde ahi.
      await pc.click('.detail-head button:has-text("Corregir")');
      const antes = new Date(Date.now() - 30 * 3600_000);
      const p2 = (n) => String(n).padStart(2, "0");
      await pc.fill("#fi-ingreso", `${antes.getFullYear()}-${p2(antes.getMonth() + 1)}-${p2(antes.getDate())}T${p2(antes.getHours())}:${p2(antes.getMinutes())}`);
      await pc.click('form[aria-label="Corregir ingreso"] button:has-text("Guardar")');
      await pc.waitForSelector('.detail-head :text("VM 1 d")');
      // En el futuro no se puede.
      await pc.click('.detail-head button:has-text("Corregir")');
      const despues = new Date(Date.now() + 3 * 3600_000);
      await pc.fill("#fi-ingreso", `${despues.getFullYear()}-${p2(despues.getMonth() + 1)}-${p2(despues.getDate())}T${p2(despues.getHours())}:${p2(despues.getMinutes())}`);
      await pc.click('form[aria-label="Corregir ingreso"] button:has-text("Guardar")');
      assert.match(await pc.textContent('form[aria-label="Corregir ingreso"] [role=alert]'), /futuro/);
      await pc.click('form[aria-label="Corregir ingreso"] button:has-text("Cancelar")');
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
      assert.match(await cel.textContent('article[aria-label="Cama UCI-01"] header'), /UCI-01/);
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

    await prueba("entrar con huella: se ofrece una vez, exige verificar al usuario y abre solo la sesion de esa persona", async () => {
      const c = await navegador.newContext({ viewport: { width: 390, height: 844 } });
      const m = await c.newPage();
      vigilar(m);
      // Lector de huella virtual (como el del telefono).
      const cdp = await c.newCDPSession(m);
      await cdp.send("WebAuthn.enable");
      const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
      });
      await m.goto(URL + "#celular");
      await m.waitForSelector("#rut");
      assert.equal(await m.locator('[aria-label="Entrar con huella"]').count(), 0, "sin huella activada no aparece el boton");
      await m.fill("#rut", "diego.melo@demo.upc");
      await m.fill("#pin", "kine");
      await m.click("button[type=submit]");
      await m.waitForSelector("text=¿Entrar con tu huella en este celular?");
      await m.click('button:has-text("Usar mi huella")');
      await m.waitForSelector("text=¿Cuáles son tus camas hoy?");
      const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      assert.equal(credentials.length, 1, "el telefono guardo una llave de acceso");
      // Sale y vuelve a entrar: solo con la huella.
      await m.reload();
      await m.click('text=Salir');
      await m.waitForSelector('button:has-text("Entrar con huella · Diego Melo")');
      await m.click('button:has-text("Entrar con huella")');
      await m.waitForSelector("text=¿Cuáles son tus camas hoy?");
      // Si el telefono no verifica a la persona (solo un toque), no abre.
      await m.reload();
      await m.click('text=Salir');
      await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
      await m.click('button:has-text("Entrar con huella")');
      await m.waitForSelector("[role=alert]");
      assert.equal(await m.locator("text=¿Cuáles son tus camas hoy?").count(), 0, "sin verificar no abre");
      // Quitarla deja solo la contrasena; y quien dijo «Ahora no» no vuelve a ver la oferta.
      await m.click('button:has-text("Quitar")');
      await m.waitForSelector('[aria-label="Entrar con huella"]', { state: "detached" });
      await m.fill("#rut", "karen.gonzalez@demo.upc");
      await m.fill("#pin", "kine");
      await m.click("button[type=submit]");
      await m.click('button:has-text("Ahora no")');
      await m.waitForSelector("text=¿Cuáles son tus camas hoy?");
      await m.reload();
      await m.click('text=Salir');
      await m.fill("#rut", "karen.gonzalez@demo.upc");
      await m.fill("#pin", "kine");
      await m.click("button[type=submit]");
      await m.waitForSelector("text=¿Cuáles son tus camas hoy?");
      await c.close();
    });

    await prueba("cambiar un paciente de cama: solo a camas libres, y todo lo suyo lo sigue", async () => {
      // Se libera la 16 desde el PC (una cama libre es el unico destino posible).
      await pc.click('[role=tab]:has-text("Tablero")');
      await pc.click('.cama:has-text("UCI-16")');
      await pc.click('button:text-is("Dar de alta")');
      await pc.click('button:has-text("Confirmar alta y borrar la identidad")');
      await pc.waitForTimeout(600);
      await cel.goto(URL + "#celular");
      if (await cel.locator('button:has-text("‹ Camas")').count()) await cel.click('button:has-text("‹ Camas")');
      await cel.waitForSelector('article[aria-label="Cama UCI-04"]');
      const antes = await cel.textContent('article[aria-label="Cama UCI-04"]');
      // Las flechas de la tarjeta abren el panel con las camas libres; se elige y se confirma.
      await cel.click('article[aria-label="Cama UCI-04"] button[aria-label="Cambiar de cama · Cama 4"]');
      const panel = cel.locator('[role=dialog][aria-label="Cambiar de cama · Cama 4"]');
      await panel.waitFor();
      const opciones = await panel.locator(".camas-destino button").allTextContents();
      assert.deepEqual(opciones, ["16"], "solo las camas libres: " + opciones.join(" | "));
      assert.match(await panel.locator(".pie-inf .btn.primary").textContent(), /Elige la cama/);
      await panel.locator('.camas-destino button[data-cama="UCI-16"]').click();
      assert.match(await panel.locator(".pie-inf .btn.primary").textContent(), /Confirmar: Cama 4 → Cama 16/);
      await panel.locator(".pie-inf .btn.primary").click();
      await panel.waitFor({ state: "detached" });
      assert.match(await aviso(), /aseo terminal/);
      await cel.waitForSelector('article[aria-label="Cama UCI-16"]');
      assert.equal(
        (await cel.textContent('article[aria-label="Cama UCI-16"]')).replace("UCI-16", "UCI-04"),
        antes,
        "la vía, el tubo, los días de VM y las alertas van con el paciente"
      );
      // La cama que deja queda libre, y el PC muestra al paciente en la nueva.
      await cel.waitForSelector("article.cama-sin");
      assert.equal(await cel.locator('article.cama-sin:has-text("UCI-04")').count(), 1, "la cama que deja queda libre");
      await pc.waitForTimeout(900);
      await pc.click('.cama:has-text("UCI-16")');
      assert.match(await pc.textContent(".detail-head"), /UCI-16 · Paciente Prueba Cuatro/);
      // Y desde el PC vuelve a su cama.
      await pc.click('.detail-head button[aria-label="Cambiar de cama · Cama 16"]');
      await pc.selectOption("#tc-cama", "UCI-04");
      await pc.click('button:text-is("Trasladar")');
      await pc.waitForTimeout(700);
      assert.match(await pc.textContent(".detail-head"), /UCI-04 · Paciente Prueba Cuatro/);
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
