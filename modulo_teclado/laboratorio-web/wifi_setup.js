const SKIP_KEY = "nexum_wifi_skip_v1";
const SSID_KEY = "nexum_wifi_ssid_v1";
const GLOVE_AP_IP = "192.168.50.1";
const GLOVE_AP_SSID = "NEXUM-GUANTE";
const POLL_MS = 5000;
const LINK_WAIT_MS = 35000;

const $ = (id) => document.getElementById(id);
const els = {
  modal: $("wifiModal"),
  form: $("wifiForm"),
  ssid: $("wifiSsid"),
  nets: $("wifiNets"),
  hint: $("wifiHint"),
  pass: $("wifiPass"),
  showPass: $("wifiShowPass"),
  pcNet: $("wifiPcNet"),
  gloveNet: $("wifiGloveNet"),
  msg: $("wifiMsg"),
  send: $("wifiSendBtn"),
  skip: $("wifiSkipNext"),
  open: $("wifiSetupBtn")
};

const state = {
  ws: null,
  retry: 0,
  gloveIp: null,
  gloveSsid: "",
  gloveMode: "",
  net: { ssid: null, banda: null, sugerida: null, redes: [], guante_ap: false, usb: [] },
  edited: false,
  busy: false,
  pending: null,
  poll: 0,
  waitLink: 0
};

function wsUrl() {
  return document.getElementById("wsUrl")?.value?.trim() || "ws://127.0.0.1:8765";
}

function setMsg(text, kind = "") {
  els.msg.textContent = text;
  els.msg.dataset.kind = kind;
}

function setBusy(busy) {
  state.busy = busy;
  els.send.disabled = busy;
  els.send.textContent = busy ? "Configurando…" : "Configurar guante";
}

function stem(ssid) {
  return (ssid || "").trim().replace(/[\s_.-]*(5\s*g(hz)?|6e?|6\s*g(hz)?)$/i, "").toLowerCase();
}

function looks5g(ssid) {
  return /(^|[^0-9])5\s*g(hz)?([^a-z0-9]|$)/i.test(ssid || "");
}

function bandLabel(band) {
  return band ? `${band} GHz` : "";
}

function findNet(ssid) {
  return state.net.redes.find((n) => n.ssid === ssid) || null;
}

function validate() {
  const ssidLen = new TextEncoder().encode(els.ssid.value.trim()).length;
  const passLen = new TextEncoder().encode(els.pass.value).length;
  if (ssidLen < 1 || ssidLen > 32) return "Escribe el nombre de la red (maximo 32 caracteres).";
  if (passLen && (passLen < 8 || passLen > 63)) return "La contrasena debe tener entre 8 y 63 caracteres.";
  return null;
}

function renderHint() {
  const ssid = els.ssid.value.trim();
  const pc = state.net.ssid;
  const net = findNet(ssid);
  let text = "";
  let kind = "";
  if (!ssid) {
    text = "";
  } else if (looks5g(ssid)) {
    text = "Ese nombre parece de una red de 5 GHz. El guante solo se conecta a redes de 2.4 GHz.";
    kind = "warn";
  } else if (pc && ssid !== pc && stem(ssid) === stem(pc)) {
    text = `Es la red 2.4 GHz de tu mismo router: el guante y esta PC quedan en la misma red.`;
    kind = "ok";
  } else if (net && net.bandas.length && !net.bandas.includes("2.4")) {
    text = `No se detecto senal de 2.4 GHz de "${ssid}". Si tu router separa las bandas, elige la de 2.4 GHz.`;
    kind = "warn";
  } else if (pc && ssid !== pc && pc !== GLOVE_AP_SSID) {
    text = `Esta PC esta en "${pc}". Para enlazar el guante, conecta tambien la PC a "${ssid}".`;
    kind = "warn";
  } else if (net?.bandas.includes("2.4") || state.net.banda === "2.4") {
    text = "Red de 2.4 GHz, compatible con el guante.";
    kind = "ok";
  }
  els.hint.textContent = text;
  els.hint.dataset.kind = kind;
}

function renderStatus() {
  const { ssid, banda, sugerida, usb, guante_ap: apVisible } = state.net;
  if (!ssid) {
    els.pcNet.textContent = "sin WiFi detectado";
    els.pcNet.dataset.kind = "warn";
  } else {
    els.pcNet.textContent = banda ? `${ssid} · ${bandLabel(banda)}` : ssid;
    els.pcNet.dataset.kind = banda === "2.4" || sugerida ? "ok" : "warn";
  }
  if (state.gloveIp && (state.gloveIp === GLOVE_AP_IP || state.gloveMode === "AP")) {
    els.gloveNet.textContent = `en modo configuracion (${GLOVE_AP_SSID})`;
    els.gloveNet.dataset.kind = "warn";
  } else if (state.gloveIp) {
    els.gloveNet.textContent = `enlazado por WiFi · ${state.gloveIp}${state.gloveSsid ? ` · ${state.gloveSsid}` : ""}`;
    els.gloveNet.dataset.kind = "ok";
  } else if (usb?.length) {
    els.gloveNet.textContent = `conectado por USB (${usb[0]})`;
    els.gloveNet.dataset.kind = "ok";
  } else if (apVisible) {
    els.gloveNet.textContent = `sin red: emite ${GLOVE_AP_SSID}`;
    els.gloveNet.dataset.kind = "warn";
  } else {
    els.gloveNet.textContent = "no detectado";
    els.gloveNet.dataset.kind = "bad";
  }
}

function fillNetworks() {
  els.nets.replaceChildren(...state.net.redes.map((n) => {
    const opt = document.createElement("option");
    opt.value = n.ssid;
    opt.label = `${n.bandas.map(bandLabel).join(" / ") || "banda desconocida"} · ${n.senal}%`;
    return opt;
  }));
}

function prefillSsid() {
  if (state.edited) return;
  const { ssid, banda, sugerida } = state.net;
  const candidate = sugerida
    || (ssid && ssid !== GLOVE_AP_SSID && banda === "2.4" ? ssid : "")
    || localStorage.getItem(SSID_KEY)
    || (ssid && ssid !== GLOVE_AP_SSID ? ssid : "");
  if (candidate && els.ssid.value !== candidate) els.ssid.value = candidate;
}

async function refreshNetwork() {
  try {
    const res = await fetch("/api/red/wifi", { cache: "no-store" });
    const data = await res.json();
    state.net = {
      ssid: data.ssid || null,
      banda: data.banda || null,
      sugerida: data.sugerida || null,
      redes: Array.isArray(data.redes) ? data.redes : [],
      guante_ap: !!data.guante_ap,
      usb: Array.isArray(data.usb) ? data.usb : []
    };
  } catch {
    state.net = { ...state.net, ssid: null, usb: [] };
  }
  fillNetworks();
  prefillSsid();
  renderStatus();
  renderHint();
}

function linkedAfterConfig() {
  if (!state.pending || !state.gloveIp || state.gloveIp === GLOVE_AP_IP) return;
  window.clearTimeout(state.waitLink);
  setMsg(`Listo: el guante esta en "${state.pending}" y enlazado con esta PC (${state.gloveIp}). Ya puedes cerrar esta ventana y calibrar.`, "ok");
  state.pending = null;
  setBusy(false);
}

function waitForLink(ssid) {
  window.clearTimeout(state.waitLink);
  state.waitLink = window.setTimeout(() => {
    if (!state.pending) return;
    state.pending = null;
    setBusy(false);
    const pc = state.net.ssid;
    const sameNet = pc && (pc === ssid || stem(pc) === stem(ssid));
    setMsg(sameNet
      ? `El guante no aparecio en la red. Revisa la contrasena de "${ssid}"; si era incorrecta, el guante volvio a ${GLOVE_AP_SSID}. Conectalo por USB y vuelve a intentar.`
      : `El guante deberia estar en "${ssid}", pero esta PC esta en "${pc || "otra red"}". Conecta la PC a "${ssid}" para enlazarlo.`,
    "warn");
  }, LINK_WAIT_MS);
}

function onBridgeMessage(msg) {
  if (msg.type === "hello" || msg.type === "connected") {
    state.gloveIp = msg.esp32_ip || null;
    if (!state.gloveIp) {
      state.gloveSsid = "";
      state.gloveMode = "";
    }
    renderStatus();
    linkedAfterConfig();
    return;
  }
  if (msg.type !== "wifi_config") return;
  if (msg.status === "info") {
    state.gloveMode = msg.mode;
    state.gloveSsid = msg.mode === "STA" ? msg.ssid : "";
    renderStatus();
  } else if (msg.status === "sent") {
    setMsg(msg.via === "usb" ? `Enviando la red al guante por USB (${msg.port})…` : "Enviando la red al guante por WiFi…", "info");
  } else if (msg.status === "saved") {
    state.pending = msg.ssid;
    setMsg(`El guante guardo "${msg.ssid}" y se esta reiniciando para conectarse…`, "info");
    if (msg.via !== "usb") waitForLink(msg.ssid);
  } else if (msg.status === "connected") {
    state.pending = msg.ssid;
    setMsg(`El guante se conecto a "${msg.ssid}" (IP ${msg.ip}). Enlazando con esta PC…`, "info");
    waitForLink(msg.ssid);
    linkedAfterConfig();
  } else if (msg.status === "error") {
    window.clearTimeout(state.waitLink);
    state.pending = null;
    setBusy(false);
    setMsg(msg.message || "No se pudo configurar el guante.", "bad");
  }
}

function connectBridge() {
  if (state.ws && state.ws.readyState <= WebSocket.OPEN) return;
  const ws = new WebSocket(wsUrl());
  state.ws = ws;
  ws.onmessage = (event) => {
    try { onBridgeMessage(JSON.parse(event.data)); } catch {}
  };
  ws.onclose = () => {
    if (state.ws !== ws) return;
    state.ws = null;
    state.gloveIp = null;
    renderStatus();
    if (!els.modal.hidden) window.setTimeout(connectBridge, Math.min(5000, 800 * ++state.retry));
  };
  ws.onopen = () => { state.retry = 0; };
}

function sendWifi(event) {
  event.preventDefault();
  if (state.busy) return;
  const error = validate();
  if (error) { setMsg(error, "bad"); return; }
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    setMsg("El puente no esta conectado. Inicia nexum_bridge.py y vuelve a intentar.", "bad");
    connectBridge();
    return;
  }
  const ssid = els.ssid.value.trim();
  localStorage.setItem(SSID_KEY, ssid);
  setBusy(true);
  setMsg("Buscando el guante…", "info");
  state.ws.send(JSON.stringify({ action: "wifi_config", ssid, password: els.pass.value }));
}

function openModal() {
  els.modal.hidden = false;
  setMsg("");
  setBusy(false);
  els.skip.checked = localStorage.getItem(SKIP_KEY) === "1";
  connectBridge();
  renderStatus();
  refreshNetwork();
  window.clearInterval(state.poll);
  state.poll = window.setInterval(refreshNetwork, POLL_MS);
  window.setTimeout(() => (els.ssid.value ? els.pass : els.ssid).focus(), 50);
}

function closeModal() {
  els.modal.hidden = true;
  localStorage.setItem(SKIP_KEY, els.skip.checked ? "1" : "0");
  els.pass.value = "";
  window.clearInterval(state.poll);
  window.clearTimeout(state.waitLink);
  state.pending = null;
  const ws = state.ws;
  state.ws = null;
  ws?.close();
}

els.form.addEventListener("submit", sendWifi);
els.open?.addEventListener("click", openModal);
els.ssid.addEventListener("input", () => {
  state.edited = true;
  renderHint();
});
els.showPass.addEventListener("click", () => {
  const show = els.pass.type === "password";
  els.pass.type = show ? "text" : "password";
  els.showPass.textContent = show ? "Ocultar" : "Ver";
});
els.modal.querySelectorAll("[data-wifi-close]").forEach((n) => n.addEventListener("click", closeModal));
els.modal.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Escape") closeModal();
});
els.modal.addEventListener("keyup", (e) => e.stopPropagation());

if (localStorage.getItem(SKIP_KEY) !== "1") openModal();
