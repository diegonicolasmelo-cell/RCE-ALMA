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
html,body{height:100%;overflow:hidden}
#cuerpo-demo{display:flex;flex-direction:column;height:100%}
#raiz{flex:1;min-height:0;overflow:auto}
/* Solo celular: la app ocupa todo el ancho y el alto de la pantalla */
.app-cel{max-width:none}
</style>
<div id="cuerpo-demo">
  <div id="raiz"></div>
</div>
<script>${js}</script>
`;
fs.writeFileSync(salida, html);
console.log(`${salida}: ${(html.length / 1024).toFixed(0)} KB`);
