// Arma la carpeta para montar la app en Google Apps Script:
//   npm run gas    (compila con vite.gas.config.ts y luego corre este script)
//
// Deja en dist-gas/ los archivos que se PEGAN en el editor de Apps Script:
//   - index.html : la app en formato "cohete" (cargador ASCII + app en base64)
//   - Codigo.gs  : el servidor (datos en la hoja + sirve la pagina)
//   - LEEME.txt  : el paso a paso
//
// Por que "cohete": Google vuelve a analizar el HTML que sirve con un analizador mas
// estricto que el del navegador, y un "<" o ">" suelto dentro del codigo de la app lo
// tumba al arrancar. Con la app en base64, Google nunca ve el codigo real.
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const compilado = path.join(raiz, "dist-gas", "compilado");
const salida = path.join(raiz, "dist-gas");
const version = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8")).version;

const b64 = (archivo) => fs.readFileSync(path.join(compilado, archivo)).toString("base64");
/** En trozos de 2000 caracteres: el editor de Apps Script se traba con una linea gigante. */
const trozos = (s) => {
  const lista = [];
  for (let i = 0; i < s.length; i += 2000) lista.push(JSON.stringify(s.slice(i, i + 2000)));
  return "[\n" + lista.join(",\n") + "\n]";
};

const sello = new Date().toISOString().slice(0, 16).replace("T", " ");
const html = `<div id="raiz"></div>
<script>
/* Kapta ${version} para Google Apps Script, armado el ${sello}. No editar a mano: se genera con npm run gas. */
(function () {
  var estilos = ${trozos(b64("app.css"))}.join("");
  var codigo = ${trozos(b64("app.js"))}.join("");
  function texto(base64) {
    var binario = atob(base64);
    var bytes = Uint8Array.from(binario, function (c) { return c.charCodeAt(0); });
    return new TextDecoder("utf-8").decode(bytes);
  }
  var css = document.createElement("style");
  css.textContent = texto(estilos);
  document.head.appendChild(css);
  var js = document.createElement("script");
  js.textContent = texto(codigo);
  document.body.appendChild(js);
})();
</script>
`;

// Guardias: el archivo que se pega debe ser ASCII puro y sin "<" ni ">" fuera de las etiquetas.
if (/[^\x09\x0a\x0d\x20-\x7e]/.test(html)) throw new Error("index.html tiene caracteres que no son ASCII");
const sinEtiquetas = html.replace(/<\/?(div|script)[^<>]*>/g, "");
if (/[<>]/.test(sinEtiquetas)) throw new Error('index.html tiene "<" o ">" fuera de las etiquetas');

fs.writeFileSync(path.join(salida, "index.html"), html);
fs.copyFileSync(path.join(raiz, "backend", "apps-script", "Codigo.gs"), path.join(salida, "Codigo.gs"));
fs.copyFileSync(path.join(raiz, "backend", "apps-script", "LEEME-MONTAJE.txt"), path.join(salida, "LEEME.txt"));
console.log(`dist-gas/index.html: ${Math.round(html.length / 1024)} KB · dist-gas/Codigo.gs · dist-gas/LEEME.txt`);
