const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = path.join(__dirname, "nexum_ai_completo.js");
const out = path.join(__dirname, "nexum_ai_esquema.json");

const fakeDb = { getSiblingDB: () => fakeDb };
const code = fs
  .readFileSync(src, "utf8")
  .replace("collections.forEach(createOrUpdate);", "globalThis.__collections = collections;");
const ctx = { db: fakeDb, print: () => {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const collections = ctx.__collections.map(({ name, validator, indexes }) => ({ name, validator, indexes }));
fs.writeFileSync(out, JSON.stringify({ database: "nexum_ai", collections }, null, 2) + "\n");
console.log(`Esquema exportado: ${collections.length} colecciones -> ${path.relative(process.cwd(), out)}`);
