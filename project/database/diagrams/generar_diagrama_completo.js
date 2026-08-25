/**
 * Diagrama NoSQL estilo original: blanco/negro, sin solapes, flechas en canales.
 * node database/diagrams/generar_diagrama_completo.js
 */
const fs = require("node:fs");
const path = require("node:path");

const W = 2300;
const H = 1240;
const BOX_W = 220;
const BOX_H = 48;

function box(x, y, title, w = BOX_W) {
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${BOX_H}" rx="3" fill="#fff" stroke="#111" stroke-width="1.5"/>
  <text x="${x + w / 2}" y="${y + 31}" text-anchor="middle" fill="#111" font-family="Arial,sans-serif" font-size="13" font-weight="600">${title}</text>
</g>`;
}

function cx(x, w = BOX_W) {
  return x + w / 2;
}
function cy(y) {
  return y + BOX_H / 2;
}
function bottom(y) {
  return y + BOX_H;
}
function top(y) {
  return y;
}

function pathD(d) {
  return `<path d="${d}" fill="none" stroke="#111" stroke-width="1.5" marker-end="url(#arrow)"/>`;
}

function rowText(x, y, lines) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * 15}" fill="#222" font-family="Arial,sans-serif" font-size="12">${line}</text>`,
    )
    .join("");
}

const g = {
  gestos: { x: 200, y: 100 },
  usuario: { x: 460, y: 100, w: 170 },
  modalidad: { x: 680, y: 100 },
  comandos: { x: 950, y: 100 },
  guante: { x: 1270, y: 100 },
  vision: { x: 1540, y: 100 },
  sistema: { x: 1810, y: 100 },
  reglas: { x: 680, y: 210, w: 250 },
  sesion: { x: 780, y: 360, w: 250 },
  muestras: { x: 380, y: 510 },
  telemetria: { x: 780, y: 510 },
  historial: { x: 1180, y: 510 },
  modelos: { x: 380, y: 620 },
};

const modos = {
  arq: { x: 250, titles: ["MODO_ARQUITECTO", "arquitecto_contextos", "arquitecto_escenas", "arquitecto_assets"] },
  juego: { x: 980, titles: ["MODO_JUEGO", "juego_emuladores", "juego_catalogo", "juego_adaptadores"] },
  pc: { x: 1710, titles: ["MODO_COMPUTADOR", "computador_mapeo_mano", "computador_acciones_sistema", "computador_contexto_escritorio"] },
};
const modoY = [820, 900, 980, 1060];

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto">
      <polygon points="0 0, 8 3.5, 0 7" fill="#111"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#111">Diagrama BD NoSQL - nexum_ai</text>
  <line x1="40" y1="70" x2="40" y2="700" stroke="#777" stroke-width="1.3" stroke-dasharray="5 5"/>
  <line x1="40" y1="790" x2="40" y2="1140" stroke="#777" stroke-width="1.3" stroke-dasharray="5 5"/>
`;

svg += rowText(50, 145, ["ROW 1", "(Configuración", "y catálogos)"]);
svg += rowText(50, 385, ["ROW 2", "(Operación)"]);
svg += rowText(50, 555, ["ROW 3", "(Datos en tiempo", "real y ML)"]);
svg += rowText(50, 940, ["ROW 4", "(Modos de", "aplicación)"]);

svg += box(g.gestos.x, g.gestos.y, "catalogo_gestos");
svg += box(g.usuario.x, g.usuario.y, "USUARIO", g.usuario.w);
svg += box(g.modalidad.x, g.modalidad.y, "modalidades_aplicacion");
svg += box(g.comandos.x, g.comandos.y, "catalogo_comandos");
svg += box(g.guante.x, g.guante.y, "configuracion_guante");
svg += box(g.vision.x, g.vision.y, "configuracion_vision");
svg += box(g.sistema.x, g.sistema.y, "configuracion_sistema");
svg += box(g.reglas.x, g.reglas.y, "reglas_comando_semantico", g.reglas.w);
svg += box(g.sesion.x, g.sesion.y, "sesiones_captura", g.sesion.w);
svg += box(g.muestras.x, g.muestras.y, "muestras_multimodales");
svg += box(g.telemetria.x, g.telemetria.y, "registros_telemetria");
svg += box(g.historial.x, g.historial.y, "historial_comandos");
svg += box(g.modelos.x, g.modelos.y, "modelos_entrenados");

svg += pathD(`M ${g.usuario.x + g.usuario.w} ${cy(g.usuario.y)} H ${g.modalidad.x}`);

svg += pathD(`M ${cx(g.gestos.x)} ${bottom(g.gestos.y)} V 185 H ${g.reglas.x + 40} V ${top(g.reglas.y)}`);
svg += pathD(`M ${cx(g.modalidad.x)} ${bottom(g.modalidad.y)} V ${top(g.reglas.y)}`);
svg += pathD(`M ${cx(g.comandos.x)} ${bottom(g.comandos.y)} V 185 H ${g.reglas.x + g.reglas.w - 40} V ${top(g.reglas.y)}`);

svg += pathD(`M ${cx(g.reglas.x, g.reglas.w)} ${bottom(g.reglas.y)} V ${top(g.sesion.y)}`);

svg += pathD(`M ${cx(g.guante.x)} ${bottom(g.guante.y)} V 318 H ${g.sesion.x + g.sesion.w - 30} V ${top(g.sesion.y)}`);
svg += pathD(`M ${cx(g.vision.x)} ${bottom(g.vision.y)} V 332 H ${g.sesion.x + g.sesion.w - 70} V ${top(g.sesion.y)}`);

const splitY = 455;
svg += pathD(`M ${cx(g.sesion.x, g.sesion.w)} ${bottom(g.sesion.y)} V ${splitY} H ${cx(g.muestras.x)} V ${top(g.muestras.y)}`);
svg += pathD(`M ${cx(g.sesion.x, g.sesion.w)} ${splitY} V ${top(g.telemetria.y)}`);
svg += pathD(`M ${cx(g.sesion.x, g.sesion.w)} ${splitY} H ${cx(g.historial.x)} V ${top(g.historial.y)}`);
svg += pathD(`M ${cx(g.muestras.x)} ${bottom(g.muestras.y)} V ${top(g.modelos.y)}`);
svg += pathD(`M ${g.modelos.x + BOX_W} ${cy(g.modelos.y)} H ${cx(g.historial.x)} V ${bottom(g.historial.y)}`);

svg += `<line x1="80" y1="710" x2="2220" y2="710" stroke="#777" stroke-width="1.3" stroke-dasharray="6 5"/>`;
svg += `<text x="${W / 2}" y="738" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#111">modalidades_aplicacion se reparte en 3 modos</text>`;

const canal = 170;
svg += pathD(`M ${g.modalidad.x} ${g.modalidad.y} V 82 H ${canal} V 760`);
svg += pathD(`M ${canal} 760 H ${cx(modos.arq.x)} V ${top(modoY[0])}`);
svg += pathD(`M ${canal} 760 H ${cx(modos.juego.x)} V ${top(modoY[0])}`);
svg += pathD(`M ${canal} 760 H ${cx(modos.pc.x)} V ${top(modoY[0])}`);

[modos.arq, modos.juego, modos.pc].forEach((col) => {
  col.titles.forEach((title, i) => {
    svg += box(col.x, modoY[i], title);
    if (i > 0) {
      svg += pathD(`M ${cx(col.x)} ${bottom(modoY[i - 1])} V ${top(modoY[i])}`);
    }
  });
});

svg += `<text x="${W / 2}" y="1165" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#111">MongoDB - 13 colecciones núcleo + 12 de modos</text>`;
svg += `<text x="${W / 2}" y="1188" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#333">USUARIO es opcional (codigoUsuario puede ser null)</text>`;
svg += `\n</svg>\n`;

const svgPath = path.join(__dirname, "diagrama_nexum_ai_completo.svg");
fs.writeFileSync(svgPath, svg, "utf8");
fs.copyFileSync(svgPath, path.join(__dirname, "..", "mongodb", "diagrama_nexum_ai_completo.svg"));
console.log("SVG generado:", svgPath);
