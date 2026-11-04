// Arma UNA pagina HTML con la app incrustada, para publicarla como Artifact.
//   npx vite build -c vite.artefacto.config.ts && node scripts/armar-artefacto.cjs <salida.html>
const fs = require("node:fs");
const path = require("node:path");

const salida = process.argv[2];
if (!salida) throw new Error("Uso: node scripts/armar-artefacto.cjs <salida.html>");
const dir = path.join(__dirname, "..", "dist-artefacto");
const css = fs.readFileSync(path.join(dir, "app.css"), "utf8");
// "</script" dentro del JS cerraria la etiqueta antes de tiempo.
const js = fs.readFileSync(path.join(dir, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");

const html = `<title>UPC-Pulse</title>
<style>${css}</style>
<style>
html,body{height:100%}
#cuerpo-demo{display:flex;flex-direction:column;height:100%}
.nav-demo{flex:none;display:flex;gap:8px;align-items:center;padding:6px 12px;background:var(--panel);border-bottom:1px solid var(--line);font:600 13px/1 var(--font-ui,system-ui,sans-serif)}
.nav-demo span{color:var(--muted);font-weight:500;margin-right:auto}
.nav-demo a{color:var(--ink);text-decoration:none;padding:8px 12px;border-radius:8px;border:1px solid var(--line)}
.nav-demo a[aria-current="page"]{background:var(--accent);border-color:var(--accent);color:#fff}
#raiz{flex:1;min-height:0;overflow:auto}
</style>
<div id="cuerpo-demo">
  <nav class="nav-demo" aria-label="Vista de la demostración">
    <span>UPC-Pulse · demostración con datos inventados</span>
    <a id="v-celular" href="#celular">Celular</a>
    <a id="v-estacion" href="#estacion">Estación PC</a>
  </nav>
  <div id="raiz"></div>
</div>
<script>
(function(){
  function marca(){var e=location.hash.indexOf("estacion")===1;
    document.getElementById("v-celular").setAttribute("aria-current",e?"false":"page");
    document.getElementById("v-estacion").setAttribute("aria-current",e?"page":"false");}
  window.addEventListener("hashchange",marca);marca();
})();
</script>
<script>${js}</script>
`;
fs.writeFileSync(salida, html);
console.log(`${salida}: ${(html.length / 1024).toFixed(0)} KB`);
