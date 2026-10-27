const SKIP_KEY = "nexum_wifi_skip_v1";
const SSID_KEY = "nexum_wifi_ssid_v1";
const GLOVE_AP_IP = "192.168.50.1";
const GLOVE_AP_SSID = "NEXUM-GUANTE";

const $ = (id) => document.getElementById(id);
const els = {
  modal: $("wifiModal"),
  form: $("wifiForm"),
  ssid: $("wifiSsid"),
  pass: $("wifiPass"),
  showPass: $("wifiShowPass"),
  pcNet: $("wifiPcNet"),
  gloveNet: $("wifiGloveNet"),
  msg: $("wifiMsg"),
  send: $("wifiSendBtn"),
  usb: $("wifiUsbBtn"),
  skip: $("wifiSkipNext"),
  open: $("wifiSetupBtn")
};

const state = { ws: null, gloveIp: null, gloveSsid: "", gloveMode: "", pcSsid: null, retry: 0 };

function wsUrl() {
  return document.getElementById("wsUrl")?.value?.trim() || "ws://127.0.0.1:8765";
}

function setMsg(text, kind = "") {
  els.msg.textContent = text;
  els.msg.dataset.kind = kind;
}

function toHex(text) {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
}

function validate() {
  const ssid = els.ssid.value.trim();
  const pass = els.pass.value;
  const ssidLen = new TextEncoder().encode(ssid).length;
  const passLen = new TextEncoder().encode(pass).length;
  if (ssidLen < 1 || ssidLen > 32) return "Escribe el nombre de la red (maximo 32 caracteres).";
  if (passLen && (passLen < 8 || passLen > 63)) return "La contrasena debe tener entre 8 y 63 caracteres.";
  return null;
}

function looks5g(ssid) {
  return /(^|[^0-9])5\s*g(hz)?([^a-z0-9]|$)/i.test(ssid || "");
}

function warn5g() {
  if (looks5g(els.ssid.value)) {
    setMsg("Ese nombre parece de una red de 5 GHz. El guante solo se conecta a 2.4 GHz: usa la version 2.4 GHz de tu router o un hotspot en 2.4 GHz, y conecta esta PC a esa misma red.", "warn");
  } else if (els.msg.dataset.kind === "warn") {
    setMsg("");
  }
}

function renderStatus() {
  const pc5g = looks5g(state.pcSsid);
  els.pcNet.textContent = state.pcSsid ? `${state.pcSsid}${pc5g ? " (5 GHz, el guante no puede usarla)" : ""}` : "sin WiFi detectado";
  els.pcNet.dataset.kind = state.pcSsid && !pc5g ? "ok" : "warn";
  if (!state.gloveIp) {
    els.gloveNet.textContent = "no enlazado";
    els.gloveNet.dataset.kind = "bad";
  } else if (state.gloveIp === GLOVE_AP_IP || state.gloveMode === "AP") {
    els.gloveNet.textContent = `modo configuracion (${GLOVE_AP_SSID})`;
    els.gloveNet.dataset.kind = "warn";
  } else {
    const net = state.gloveSsid ? ` · ${state.gloveSsid}` : "";
    els.gloveNet.textContent = `enlazado ${state.gloveIp}${net}`;
    els.gloveNet.dataset.kind = state.gloveSsid && state.pcSsid && state.gloveSsid !== state.pcSsid ? "warn" : "ok";
  }
  els.send.disabled = !state.gloveIp;
  els.usb.hidden = !("serial" in navigator);
}

async function detectPcNetwork() {
  try {
    const res = await fetch("/api/red/wifi", { cache: "no-store" });
    const data = await res.json();
    state.pcSsid = data.ssid || null;
  } catch {
    state.pcSsid = null;
  }
  if (!els.ssid.value) {
    const remembered = localStorage.getItem(SSID_KEY);
    const suggestion = state.pcSsid && state.pcSsid !== GLOVE_AP_SSID ? state.pcSsid : remembered;
    if (suggestion) els.ssid.value = suggestion;
  }
  renderStatus();
  warn5g();
}

function onBridgeMessage(msg) {
  if (msg.type === "hello" || msg.type === "connected") {
    state.gloveIp = msg.esp32_ip || null;
    if (!state.gloveIp) {
      state.gloveSsid = "";
      state.gloveMode = "";
    }
    renderStatus();
    return;
  }
  if (msg.type !== "wifi_config") return;
  if (msg.status === "info") {
    state.gloveMode = msg.mode;
    state.gloveSsid = msg.mode === "STA" ? msg.ssid : "";
    renderStatus();
  } else if (msg.status === "sent") {
    setMsg(`Enviando "${msg.ssid}" al guante…`, "info");
  } else if (msg.status === "saved") {
    setMsg(`Listo: el guante guardo la red "${msg.ssid}" y se esta reiniciando. Conecta esta PC a "${msg.ssid}" si aun no lo esta; el guante se enlazara solo en unos segundos.`, "ok");
    state.gloveIp = null;
    renderStatus();
  } else if (msg.status === "error") {
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
  const error = validate();
  if (error) { setMsg(error, "bad"); return; }
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    setMsg("El puente no esta conectado. Inicia nexum_bridge.py y vuelve a intentar.", "bad");
    connectBridge();
    return;
  }
  localStorage.setItem(SSID_KEY, els.ssid.value.trim());
  state.ws.send(JSON.stringify({ action: "wifi_config", ssid: els.ssid.value.trim(), password: els.pass.value }));
}

async function sendUsb() {
  const error = validate();
  if (error) { setMsg(error, "bad"); return; }
  let port;
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
  } catch (err) {
    setMsg(err?.name === "NotFoundError" ? "No se eligio ningun puerto." : `No se pudo abrir el puerto: ${err?.message || err}`, "bad");
    return;
  }
  const ssid = els.ssid.value.trim();
  localStorage.setItem(SSID_KEY, ssid);
  const line = new TextEncoder().encode(`WIFI:${toHex(ssid)}:${toHex(els.pass.value)}\n`);
  const writer = port.writable.getWriter();
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  setMsg("Enviando por USB… si el guante se reinicia al conectar, espera unos segundos.", "info");
  const deadline = Date.now() + 25000;
  const resend = window.setInterval(() => writer.write(line).catch(() => {}), 1500);
  writer.write(line).catch(() => {});
  const timer = window.setTimeout(() => reader.cancel().catch(() => {}), 25000);
  try {
    while (!result && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("WIFI_GUARDADA")) result = "ok";
      else if (/WIFI_INVALIDA,(\w+)/.test(buffer)) result = buffer.match(/WIFI_INVALIDA,(\w+)/)[1];
      buffer = buffer.slice(-400);
    }
  } catch {}
  window.clearInterval(resend);
  window.clearTimeout(timer);
  try { reader.releaseLock(); writer.releaseLock(); await port.close(); } catch {}
  if (result === "ok") setMsg(`Listo: el guante guardo la red "${ssid}" y se reinicia. Desconecta el cable y verifica que esta PC este en "${ssid}".`, "ok");
  else if (result) setMsg(`El guante rechazo los datos (${result}).`, "bad");
  else setMsg("El guante no respondio por USB. Verifica el cable y que tenga el firmware actualizado.", "bad");
}

function openModal() {
  els.modal.hidden = false;
  setMsg("");
  els.skip.checked = localStorage.getItem(SKIP_KEY) === "1";
  connectBridge();
  detectPcNetwork();
  renderStatus();
  window.setTimeout(() => (els.ssid.value ? els.pass : els.ssid).focus(), 50);
}

function closeModal() {
  els.modal.hidden = true;
  localStorage.setItem(SKIP_KEY, els.skip.checked ? "1" : "0");
  els.pass.value = "";
  const ws = state.ws;
  state.ws = null;
  ws?.close();
}

els.form.addEventListener("submit", sendWifi);
els.usb.addEventListener("click", sendUsb);
els.ssid.addEventListener("input", warn5g);
els.open?.addEventListener("click", openModal);
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
