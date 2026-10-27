const SKIP_KEY = "nexum_wifi_skip_v1";
const SSID_KEY = "nexum_wifi_ssid_v1";
const GLOVE_AP_IP = "192.168.50.1";
const GLOVE_AP_SSID = "NEXUM-GUANTE";
const POLL_MS = 5000;
const LINK_WAIT_MS = 35000;
const SEND_WAIT_MS = 50000;
const CLOSE_DELAY_MS = 1500;
const STEPS = ["send", "save", "join", "link"];

const $ = (id) => document.getElementById(id);
const els = {
  modal: $("wifiModal"),
  form: $("wifiForm"),
  ssid: $("wifiSsid"),
  hint: $("wifiHint"),
  pass: $("wifiPass"),
  passHint: $("wifiPassHint"),
  showPass: $("wifiShowPass"),
  pcNet: $("wifiPcNet"),
  gloveNet: $("wifiGloveNet"),
  steps: $("wifiSteps"),
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
  ssidEdited: false,
  passEdited: false,
  passFor: null,
  passLookup: 0,
  busy: false,
  pending: null,
  auto: false,
  touched: false,
  poll: 0,
  timer: 0,
  closeTimer: 0
};

function wsUrl() {
  return document.getElementById("wsUrl")?.value?.trim() || "ws://127.0.0.1:8765";
}

function setMsg(text, kind = "") {
  els.msg.textContent = text;
  els.msg.dataset.kind = kind;
}

function setHint(node, text, kind = "") {
  node.textContent = text;
  node.dataset.kind = kind;
}

function setBusy(busy) {
  state.busy = busy;
  els.send.disabled = busy;
  els.ssid.readOnly = busy;
  els.pass.readOnly = busy;
  els.send.textContent = busy ? "Configurando…" : "Configurar guante";
}

function resetSteps(visible) {
  els.steps.hidden = !visible;
  els.steps.querySelectorAll("li").forEach((li) => { li.dataset.state = ""; });
}

function stepTo(name) {
  const index = STEPS.indexOf(name);
  els.steps.querySelectorAll("li").forEach((li) => {
    const i = STEPS.indexOf(li.dataset.step);
    li.dataset.state = i < index ? "done" : i === index ? "active" : "";
  });
}

function stepsDone() {
  els.steps.querySelectorAll("li").forEach((li) => { li.dataset.state = "done"; });
}

function stepFailed() {
  const active = els.steps.querySelector('li[data-state="active"]') || els.steps.querySelector("li");
  if (active) active.dataset.state = "error";
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

function pcOn5g() {
  return state.net.banda === "5" || state.net.banda === "6";
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
  if (!ssid) return setHint(els.hint, "");
  if (looks5g(ssid)) return setHint(els.hint, "Ese nombre parece de una red de 5 GHz. El guante solo se conecta a redes de 2.4 GHz.", "warn");
  if (pc && ssid === pc) return setHint(els.hint, "Es la red de esta PC. Puedes cambiarla si quieres otra.", "ok");
  if (pc && stem(ssid) === stem(pc)) return setHint(els.hint, "Red 2.4 GHz de tu mismo router: el guante y esta PC quedan en la misma red.", "ok");
  if (net && net.bandas.length && !net.bandas.includes("2.4")) {
    return setHint(els.hint, `No se detecto senal de 2.4 GHz de "${ssid}". Si tu router separa las bandas, elige la de 2.4 GHz.`, "warn");
  }
  if (pc && pc !== GLOVE_AP_SSID) return setHint(els.hint, `Esta PC esta en "${pc}". Para enlazar el guante, conecta tambien la PC a "${ssid}".`, "warn");
  return setHint(els.hint, "");
}

function renderStatus() {
  const { ssid, banda, sugerida, usb, guante_ap: apVisible } = state.net;
  if (!ssid) {
    els.pcNet.textContent = "sin WiFi detectado";
    els.pcNet.dataset.kind = "warn";
  } else {
    els.pcNet.textContent = banda ? `${ssid} · ${bandLabel(banda)}` : ssid;
    els.pcNet.dataset.kind = pcOn5g() && !sugerida ? "warn" : "ok";
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

function defaultSsid() {
  const { ssid, sugerida } = state.net;
  const pc = ssid && ssid !== GLOVE_AP_SSID ? ssid : "";
  if (pc && !pcOn5g() && !looks5g(pc)) return pc;
  return sugerida || pc || localStorage.getItem(SSID_KEY) || "";
}

function prefillSsid() {
  if (state.ssidEdited || state.busy) return;
  const candidate = defaultSsid();
  if (candidate && els.ssid.value !== candidate) {
    els.ssid.value = candidate;
    lookupPassword();
  }
}

async function lookupPassword() {
  const ssid = els.ssid.value.trim();
  const ticket = ++state.passLookup;
  if (!ssid) {
    setHint(els.passHint, "");
    return;
  }
  let data = null;
  try {
    const res = await fetch(`/api/red/wifi/clave?ssid=${encodeURIComponent(ssid)}`, { cache: "no-store" });
    data = await res.json();
  } catch {}
  if (ticket !== state.passLookup || ssid !== els.ssid.value.trim()) return;
  if (data?.guardada) {
    if (!state.passEdited) {
      els.pass.value = data.clave;
      state.passFor = ssid;
    }
    setHint(els.passHint, data.clave ? "Contrasena tomada de esta PC. Puedes editarla." : "Red abierta, sin contrasena.", "ok");
  } else {
    if (!state.passEdited && state.passFor) {
      els.pass.value = "";
      state.passFor = null;
    }
    setHint(els.passHint, "Esta PC no tiene guardada la contrasena de esa red: escribela.", "");
  }
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
  prefillSsid();
  renderStatus();
  renderHint();
}

function finishOk(text) {
  window.clearTimeout(state.timer);
  state.pending = null;
  stepsDone();
  setMsg(text, "ok");
  els.send.textContent = "Guante enlazado";
  els.form.classList.add("is-done");
  window.clearTimeout(state.closeTimer);
  state.closeTimer = window.setTimeout(closeModal, CLOSE_DELAY_MS);
}

function finishError(text) {
  window.clearTimeout(state.timer);
  state.pending = null;
  stepFailed();
  setBusy(false);
  setMsg(text, "bad");
}

function armTimeout(ms, message) {
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    if (state.busy) finishError(typeof message === "function" ? message() : message);
  }, ms);
}

function linkTimeoutMessage() {
  const ssid = state.pending || els.ssid.value.trim();
  const pc = state.net.ssid;
  const sameNet = pc && (pc === ssid || stem(pc) === stem(ssid));
  return sameNet
    ? `El guante no aparecio en "${ssid}". Revisa la contrasena; si era incorrecta, el guante volvio a ${GLOVE_AP_SSID}. Conectalo por USB y vuelve a intentar.`
    : `El guante deberia estar en "${ssid}", pero esta PC esta en "${pc || "otra red"}". Conecta la PC a "${ssid}" para enlazarlo.`;
}

function gloveLinked() {
  return state.gloveIp && state.gloveIp !== GLOVE_AP_IP && state.gloveMode !== "AP";
}

function onLinked() {
  if (state.pending && state.busy && gloveLinked()) {
    finishOk(`Listo: el guante esta en "${state.pending}" y enlazado con esta PC (${state.gloveIp}).`);
    return;
  }
  if (state.auto && !state.touched && !state.busy && gloveLinked()) {
    setMsg(`El guante ya esta enlazado por WiFi (${state.gloveIp}).`, "ok");
    els.form.classList.add("is-done");
    window.clearTimeout(state.closeTimer);
    state.closeTimer = window.setTimeout(() => {
      if (!state.touched) closeModal();
      else els.form.classList.remove("is-done");
    }, CLOSE_DELAY_MS);
  }
}

function onBridgeMessage(msg) {
  if (msg.type === "hello" || msg.type === "connected") {
    state.gloveIp = msg.esp32_ip || null;
    if (!state.gloveIp) {
      state.gloveSsid = "";
      state.gloveMode = "";
    }
    renderStatus();
    onLinked();
    return;
  }
  if (msg.type !== "wifi_config") return;
  if (msg.status === "info") {
    state.gloveMode = msg.mode;
    state.gloveSsid = msg.mode === "STA" ? msg.ssid : "";
    renderStatus();
    onLinked();
    return;
  }
  if (!state.busy) return;
  if (msg.status === "sent") {
    stepTo("save");
    setMsg(msg.via === "usb" ? `Enviando por cable USB (${msg.port})…` : "Enviando por WiFi…", "info");
    armTimeout(SEND_WAIT_MS, "El guante no confirmo la red. Verifica que este encendido y vuelve a intentar.");
  } else if (msg.status === "saved") {
    state.pending = msg.ssid;
    stepTo("join");
    setMsg(`El guante guardo "${msg.ssid}" y se reinicia para conectarse…`, "info");
    if (msg.via !== "usb") armTimeout(LINK_WAIT_MS, linkTimeoutMessage);
  } else if (msg.status === "connected") {
    state.pending = msg.ssid;
    stepTo("link");
    setMsg(`Conectado a "${msg.ssid}" (IP ${msg.ip}). Enlazando con esta PC…`, "info");
    armTimeout(LINK_WAIT_MS, linkTimeoutMessage);
    onLinked();
  } else if (msg.status === "error") {
    finishError(msg.message || "No se pudo configurar el guante.");
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
  state.touched = true;
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
  window.clearTimeout(state.closeTimer);
  els.form.classList.remove("is-done");
  setBusy(true);
  resetSteps(true);
  stepTo("send");
  setMsg("Buscando el guante…", "info");
  armTimeout(8000, "No hubo respuesta del puente. Vuelve a intentar.");
  state.ws.send(JSON.stringify({ action: "wifi_config", ssid, password: els.pass.value }));
}

function openModal(auto = false) {
  window.clearTimeout(state.closeTimer);
  els.form.classList.remove("is-done");
  els.modal.hidden = false;
  state.auto = auto;
  state.touched = false;
  state.ssidEdited = false;
  state.passEdited = false;
  state.passFor = null;
  els.pass.value = "";
  els.pass.type = "password";
  els.showPass.textContent = "Ver";
  setHint(els.passHint, "");
  setMsg("");
  setBusy(false);
  resetSteps(false);
  els.skip.checked = localStorage.getItem(SKIP_KEY) === "1";
  connectBridge();
  renderStatus();
  refreshNetwork();
  window.clearInterval(state.poll);
  state.poll = window.setInterval(refreshNetwork, POLL_MS);
}

function closeModal() {
  els.modal.hidden = true;
  els.form.classList.remove("is-done");
  localStorage.setItem(SKIP_KEY, els.skip.checked ? "1" : "0");
  els.pass.value = "";
  window.clearInterval(state.poll);
  window.clearTimeout(state.timer);
  window.clearTimeout(state.closeTimer);
  state.pending = null;
  setBusy(false);
  const ws = state.ws;
  state.ws = null;
  ws?.close();
}

let ssidTimer = 0;
els.form.addEventListener("submit", sendWifi);
els.open?.addEventListener("click", () => openModal(false));
els.form.addEventListener("pointerdown", () => { state.touched = true; });
els.ssid.addEventListener("input", () => {
  state.touched = true;
  state.ssidEdited = true;
  renderHint();
  window.clearTimeout(ssidTimer);
  ssidTimer = window.setTimeout(lookupPassword, 400);
});
els.pass.addEventListener("input", () => {
  state.touched = true;
  state.passEdited = true;
  state.passFor = null;
  setHint(els.passHint, "");
});
els.showPass.addEventListener("click", () => {
  const show = els.pass.type === "password";
  els.pass.type = show ? "text" : "password";
  els.showPass.textContent = show ? "Ocultar" : "Ver";
});
els.modal.querySelectorAll("[data-wifi-close]").forEach((n) => n.addEventListener("click", closeModal));
els.modal.addEventListener("keydown", (e) => {
  e.stopPropagation();
  state.touched = true;
  if (e.key === "Escape") closeModal();
});
els.modal.addEventListener("keyup", (e) => e.stopPropagation());

if (localStorage.getItem(SKIP_KEY) !== "1") openModal(true);
