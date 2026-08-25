/**
 * Genera dos diagramas SVG de NEXUM AI sin dependencias externas.
 * Los SVG pueden convertirse a PNG con:
 * npx sharp-cli -i archivo.svg -o archivo.png
 */

const fs = require("node:fs");
const path = require("node:path");

const out = __dirname;
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function svgStart(title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800" viewBox="0 0 2400 1800">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#64748b"/>
    </marker>
    <style>
      .title{font:700 40px Arial,sans-serif;fill:#0f172a}
      .subtitle{font:20px Arial,sans-serif;fill:#475569}
      .groupTitle{font:700 22px Arial,sans-serif;fill:#fff}
      .nodeTitle{font:700 17px Arial,sans-serif;fill:#0f172a}
      .field{font:14px Consolas,monospace;fill:#334155}
      .legend{font:15px Arial,sans-serif;fill:#475569}
      .edge{fill:none;stroke:#64748b;stroke-width:2;marker-end:url(#arrow)}
    </style>
  </defs>
  <rect width="2400" height="1800" fill="#f8fafc"/>
  <text x="80" y="70" class="title">${esc(title)}</text>
  <text x="80" y="108" class="subtitle">${esc(subtitle)}</text>`;
}

function group(x, y, w, h, title, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#fff" stroke="${color}" stroke-width="3"/>
  <rect x="${x}" y="${y}" width="${w}" height="48" rx="15" fill="${color}"/>
  <rect x="${x}" y="${y + 30}" width="${w}" height="18" fill="${color}"/>
  <text x="${x + 20}" y="${y + 32}" class="groupTitle">${esc(title)}</text>`;
}

function node(x, y, w, title, fields, accent, h = 118) {
  const fieldLines = fields
    .map(
      (f, index) =>
        `<text x="${x + 14}" y="${y + 58 + index * 19}" class="field">${esc(f)}</text>`,
    )
    .join("\n");
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="${accent}" stroke-width="2"/>
  <rect x="${x}" y="${y}" width="${w}" height="38" rx="9" fill="${accent}" opacity=".14"/>
  <text x="${x + 14}" y="${y + 25}" class="nodeTitle">${esc(title)}</text>
  ${fieldLines}`;
}

function edge(x1, y1, x2, y2) {
  const mid = Math.round((y1 + y2) / 2);
  return `<path class="edge" d="M${x1},${y1} V${mid} H${x2} V${y2}"/>`;
}

function write(name, svg) {
  fs.writeFileSync(path.join(out, name), `${svg}\n</svg>\n`, "utf8");
}

function buildNoSql() {
  let s = svgStart(
    "NEXUM AI — Base de datos NoSQL MongoDB",
    "Modelo v3 · 30 colecciones · 6 compartidas + 8 por modalidad · sin datos",
  );

  const core = "#1e3a5f";
  const arq = "#2563eb";
  const vid = "#dc2626";
  const hib = "#16a34a";

  s += group(60, 145, 2280, 310, "NÚCLEO COMPARTIDO · 6 COLECCIONES", core);
  const coreNodes = [
    ["catalogo_gestos", ["codigoGesto (unique)", "tipo/categoría", "parámetros ML"]],
    ["modalidades_aplicacion", ["codigoModalidad", "motorDestino", "gestosPermitidos"]],
    ["configuracion_guante", ["codigoGuante", "sensores / ESP32", "calibración"]],
    ["configuracion_vision", ["codigoCamara", "modeloDeteccion", "confianzas"]],
    ["configuracion_sistema", ["modalidadActiva", "buffer / debounce", "TTL telemetría"]],
    ["modelos_entrenados", ["codigoModelo", "codigoModalidad", "tipo / precisión"]],
  ];
  coreNodes.forEach((n, i) => {
    const x = 85 + i * 372;
    s += node(x, 215, 340, n[0], n[1], core, 170);
  });

  const modes = [
    {
      x: 60,
      title: "ARQUITECTO TRIDIMENSIONAL · THREE.JS",
      color: arq,
      prefix: "arquitecto",
      special: "escenas",
    },
    {
      x: 825,
      title: "CONTROL VIDEOJUEGO · UNITY",
      color: vid,
      prefix: "videojuego",
      special: "perfil_jugador",
    },
    {
      x: 1590,
      title: "INTERACCIÓN HÍBRIDA · NAVEGADOR",
      color: hib,
      prefix: "hibrida",
      special: "teclado_virtual",
    },
  ];

  modes.forEach((m) => {
    s += group(m.x, 510, 750, 1160, `${m.title} · 8`, m.color);
    const items = [
      ["comandos", ["código unique", "categoría / tipo", "parámetros"]],
      ["reglas_semanticas", ["gesto → comando", "prioridad", "contexto"]],
      ["configuracion", ["motor destino", "sensibilidad", "config activa"]],
      ["sesiones", ["guante + cámara", "modelo ML", "inicio / fin"]],
      ["muestras", ["datos visión", "datos inercia", "confianza fusión"]],
      ["historial_comandos", ["gesto detectado", "comando ejecutado", "resultado"]],
      ["telemetria", ["tipo / latencia", "payload", "fechaExpiracion TTL"]],
      [m.special, ["estado específico", "pertenece a sesión", "datos JSON"]],
    ];
    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      s += node(
        m.x + 25 + col * 360,
        585 + row * 250,
        335,
        `${m.prefix}_${item[0]}`,
        item[1],
        m.color,
        172,
      );
    });

    const sessionX = m.x + 25 + 360;
    const sessionY = 585 + 250;
    s += edge(m.x + 192, 757, sessionX + 160, sessionY);
    s += edge(m.x + 552, 757, sessionX + 160, sessionY);
    s += edge(sessionX + 160, sessionY + 172, m.x + 192, 1085);
    s += edge(sessionX + 160, sessionY + 172, m.x + 552, 1085);
    s += edge(sessionX + 160, sessionY + 172, m.x + 192, 1335);
    s += edge(sessionX + 160, sessionY + 172, m.x + 552, 1335);
  });

  s += `<text x="80" y="1740" class="legend">Flujo: catálogos/configuración → sesión → muestras, historial, telemetría y colección especializada.</text>`;
  return s;
}

function buildRelational() {
  let s = svgStart(
    "NEXUM AI — Base de datos relacional PostgreSQL",
    "Modelo normalizado · 30 tablas · PK/FK reales · JSONB para datos de sensores",
  );

  const core = "#334155";
  const colors = ["#2563eb", "#dc2626", "#16a34a"];
  s += group(60, 145, 2280, 330, "TABLAS COMPARTIDAS / MAESTRAS", core);

  const master = [
    ["catalogo_gestos", ["PK codigo_gesto", "tipo_gesto", "activo"]],
    ["modalidades_aplicacion", ["PK codigo_modalidad", "motor_destino", "estado"]],
    ["configuracion_guante", ["PK codigo_guante", "codigo_esp32", "calibración"]],
    ["configuracion_vision", ["PK codigo_camara", "modelo_deteccion", "activa"]],
    ["configuracion_sistema", ["PK codigo_configuracion", "FK modalidad_activa", "parámetros"]],
    ["modelos_entrenados", ["PK codigo_modelo", "FK codigo_modalidad", "precisión"]],
  ];
  master.forEach((n, i) => {
    s += node(85 + i * 372, 220, 340, n[0], n[1], core, 175);
  });
  s += edge(85 + 372 + 170, 395, 85 + 4 * 372 + 170, 220);
  s += edge(85 + 372 + 170, 395, 85 + 5 * 372 + 170, 220);

  const modes = [
    ["ARQUITECTO · THREE.JS", "arquitecto", "escenas", 60],
    ["VIDEOJUEGO · UNITY", "videojuego", "perfil_jugador", 825],
    ["HÍBRIDA · NAVEGADOR", "hibrida", "teclado_virtual", 1590],
  ];

  modes.forEach(([title, prefix, special, x], modeIndex) => {
    const color = colors[modeIndex];
    s += group(x, 530, 750, 1140, `${title} · 8 TABLAS`, color);
    const tables = [
      ["comandos", ["PK codigo_comando", "tipo / categoría", "activo"]],
      ["reglas_semanticas", ["PK codigo_regla", "FK gesto", "FK comando"]],
      ["configuracion", ["PK codigo_configuracion", "motor", "activa"]],
      ["sesiones", ["PK codigo_sesion", "FK guante/cámara", "FK config/modelo"]],
      ["muestras", ["PK codigo_muestra", "FK sesión/gesto", "JSONB sensores"]],
      ["historial_comandos", ["PK codigo_historial", "FK sesión/gesto", "FK comando"]],
      ["telemetria", ["PK codigo_telemetria", "FK sesión", "latencia/payload"]],
      [special, [`PK codigo_${special === "escenas" ? "escena" : special === "perfil_jugador" ? "perfil" : "teclado"}`, "FK codigo_sesion", "relación 1:1 / 1:N"]],
    ];
    tables.forEach((table, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      s += node(
        x + 25 + col * 360,
        605 + row * 245,
        335,
        `${prefix}_${table[0]}`,
        table[1],
        color,
        170,
      );
    });
    const sesX = x + 385;
    const sesY = 850;
    s += edge(x + 192, 775, x + 552, 850);
    s += edge(x + 552, 775, x + 552, 850);
    s += edge(x + 552, 1020, x + 192, 1095);
    s += edge(x + 552, 1020, x + 552, 1095);
    s += edge(x + 552, 1020, x + 192, 1340);
    s += edge(x + 552, 1020, x + 552, 1340);
  });

  s += `<text x="80" y="1740" class="legend">PK = clave primaria · FK = clave foránea · ON DELETE CASCADE en datos dependientes de sesión.</text>`;
  return s;
}

write("diagrama_nexum_ai_nosql.svg", buildNoSql());
write("diagrama_nexum_ai_relacional.svg", buildRelational());

console.log("Diagramas SVG generados correctamente.");
