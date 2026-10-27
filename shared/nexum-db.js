(() => {
  const BASE = location.protocol.startsWith("http") ? "" : "http://127.0.0.1:8090";
  const FLUSH_MS = 2000;
  const MAX_BATCH = 200;

  function currentUser() {
    try {
      const data = JSON.parse(localStorage.getItem("nexum_auth_v1") || "{}");
      const user = (data.users || []).find((u) => u.email === data.current);
      return user && user.id ? { id: user.id, name: user.name || user.email } : null;
    } catch {
      return null;
    }
  }

  async function request(path, body) {
    const res = await fetch(BASE + path, body === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function beacon(path, body) {
    const payload = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon(BASE + path, payload)) return;
    fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  }

  function createSession(modalidad) {
    let code = null;
    let starting = null;
    let queue = [];
    let timer = null;
    let online = true;

    function flush(useBeacon = false) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!code || !queue.length) return;
      const eventos = queue.splice(0, MAX_BATCH);
      const body = { modalidad, codigoSesion: code, eventos };
      if (useBeacon) { beacon("/api/historial", body); return; }
      request("/api/historial", body).catch(() => {
        online = false;
      });
      if (queue.length) schedule();
    }

    function schedule() {
      if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
    }

    async function start(datos = {}) {
      if (code) return code;
      if (starting) return starting;
      starting = request("/api/sesiones/iniciar", { modalidad, datos, usuario: currentUser() })
        .then((data) => { code = data.codigoSesion; online = true; schedule(); return code; })
        .catch((err) => { online = false; console.warn("[NexumDB]", err.message); return null; })
        .finally(() => { starting = null; });
      return starting;
    }

    function end(datos = {}, acciones = {}, { useBeacon = false } = {}) {
      if (!code) { queue = []; return; }
      flush(useBeacon);
      const body = { modalidad, codigoSesion: code, datos, acciones, usuario: currentUser() };
      code = null;
      if (useBeacon) beacon("/api/sesiones/finalizar", body);
      else request("/api/sesiones/finalizar", body).catch(() => {});
    }

    function log(comando, gesto, extra = {}) {
      if (!comando) return;
      queue.push({ comando, gesto: gesto || "desconocido", fecha: Date.now(), ...extra });
      if (queue.length >= MAX_BATCH) flush();
      else schedule();
    }

    return {
      start,
      end,
      log,
      flush,
      get code() { return code; },
      get online() { return online; },
    };
  }

  async function saveScene(codigoSesion, nombreEscena, objetosEscena, camaraActiva) {
    return request("/api/arquitecto/escenas", { codigoSesion, nombreEscena, objetosEscena, camaraActiva });
  }

  async function latestScene() {
    const data = await request("/api/arquitecto/escenas/ultima");
    return data.escena || null;
  }

  window.NexumDB = { createSession, saveScene, latestScene, currentUser };
})();
