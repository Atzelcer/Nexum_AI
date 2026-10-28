const SKIP_KEY = "nexum_wifi_skip_v1";
const SSID_KEY = "nexum_wifi_ssid_v1";
const GLOVE_AP_IP = "192.168.50.1";
const GLOVE_AP_SSID = "NEXUM-GUANTE";
const POLL_MS = 5000;
const LINK_WAIT_MS = 40000;
const SEND_WAIT_MS = 20000;
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
  usbNet: $("wifiUsbNet"),
  help: $("wifiHelp"),
  steps: $("wifiSteps"),
  msg: $("wifiMsg"),
  send: $("wifiSendBtn"),
  verify: $("wifiVerifyBtn"),
  retry: $("wifiRetryBtn"),
  ready: $("wifiReady"),
  skip: $("wifiSkipNext"),
  open: $("wifiSetupBtn")
};

const state = {
  ws: null,
  retry: 0,
  gloveIp: null,
  gloveSsid: "",
  gloveMode: "",
  net: {
    ssid: null, banda: null, sugerida: null, redes: [], guante_ap: false,
    usb: [], usb_detalle: [], usb_problemas: [], usb_hint: null
  },
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
  closeTimer: 0,
  session: 0,
  sawSent: false,
  sawSaved: false,
  sawJoined: false,
  joinedIp: null,
  livePoints: 0,
  linkReadyAt: 0,
  verifyPoints: 0,
  verifiedClose: false
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

function hideExtraActions() {
  if (els.retry) els.retry.hidden = true;
  if (els.verify) {
    els.verify.hidden = true;
    els.verify.disabled = true;
  }
  if (els.ready) els.ready.hidden = true;
}

function setCardPhase(phase = "") {
  els.form.classList.toggle("is-busy", phase === "busy");
  els.form.classList.toggle("is-ready", phase === "ready");
}

function setBusy(busy) {
  state.busy = busy;
  els.send.disabled = busy;
  els.send.hidden = false;
  els.ssid.readOnly = busy;
  els.pass.readOnly = busy;
  els.send.textContent = busy ? "Configurando…" : "Configurar guante";
  if (busy) {
    hideExtraActions();
    setCardPhase("busy");
  } else if (!state.verifiedClose) {
    setCardPhase("");
  }
}

function resetSessionFlags() {
  state.sawSent = false;
  state.sawSaved = false;
  state.sawJoined = false;
  state.joinedIp = null;
  state.livePoints = 0;
  state.linkReadyAt = 0;
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

function renderUsbStatus() {
  if (!els.usbNet) return;
  const { usb, usb_detalle: detail, usb_problemas: problems, usb_hint: hint } = state.net;
  if (usb?.length) {
    const chip = detail?.[0]?.chip ? ` · ${detail[0].chip}` : "";
    els.usbNet.textContent = `${usb[0]}${chip}`;
    els.usbNet.dataset.kind = "ok";
    if (els.help && !hint) els.help.open = false;
    return;
  }
  if (problems?.length) {
    const p = problems[0];
    const port = p.port ? `${p.port} · ` : "";
    const captured = String(p.status || "").toLowerCase() === "captured";
    els.usbNet.textContent = captured
      ? `${p.chip || "ESP32"} — capturado por VirtualBox (liberando…)`
      : `${port}${p.chip || "ESP32"} — sin COM usable`;
    els.usbNet.dataset.kind = "warn";
    if (els.help) els.help.open = true;
    return;
  }
  els.usbNet.textContent = "sin COM — conecta el cable USB del guante";
  els.usbNet.dataset.kind = "bad";
  if (els.help && !state.gloveIp) els.help.open = true;
}

function renderStatus() {
  const { ssid, banda, sugerida, usb, guante_ap: apVisible, usb_hint: hint } = state.net;
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
  renderUsbStatus();
  if (!state.busy && hint && !state.gloveIp && !usb?.length) {
    setMsg(hint, "warn");
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
      usb: Array.isArray(data.usb) ? data.usb : [],
      usb_detalle: Array.isArray(data.usb_detalle) ? data.usb_detalle : [],
      usb_problemas: Array.isArray(data.usb_problemas) ? data.usb_problemas : [],
      usb_hint: data.usb_hint || null
    };
  } catch {
    state.net = {
      ...state.net,
      ssid: null,
      usb: [],
      usb_detalle: [],
      usb_problemas: [],
      usb_hint: "No se pudo consultar el USB. Revisa que nexum_http este activo."
    };
  }
  prefillSsid();
  renderStatus();
  renderHint();
  if (state.busy) tryFinishLink();
  else maybeReadyLinked();
}

function showContinue(ready = true) {
  if (!els.verify) return;
  els.verify.hidden = false;
  els.verify.disabled = !ready;
  els.verify.textContent = "Continuar";
  if (ready) {
    window.setTimeout(() => els.verify?.focus(), 40);
  }
}

function finishOk(text) {
  window.clearTimeout(state.timer);
  state.pending = null;
  state.busy = false;
  state.verifiedClose = true;
  stepsDone();
  els.steps.hidden = false;
  setMsg(text, "ok");
  els.send.disabled = false;
  els.send.hidden = false;
  els.send.textContent = "Cambiar red";
  els.ssid.readOnly = false;
  els.pass.readOnly = false;
  if (els.retry) els.retry.hidden = true;
  if (els.ready) els.ready.hidden = false;
  setCardPhase("ready");
  showContinue(true);
}

function finishError(text) {
  window.clearTimeout(state.timer);
  state.pending = null;
  stepFailed();
  setBusy(false);
  setCardPhase("");
  if (els.ready) els.ready.hidden = true;
  setMsg(text, "bad");
  if (els.retry) els.retry.hidden = false;
}

function armTimeout(ms, message) {
  window.clearTimeout(state.timer);
  const session = state.session;
  state.timer = window.setTimeout(() => {
    if (state.busy && state.session === session) {
      finishError(typeof message === "function" ? message() : message);
    }
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
  return !!(state.gloveIp && state.gloveIp !== GLOVE_AP_IP && state.gloveMode !== "AP");
}

function ssidSame(a, b) {
  if (!a || !b) return false;
  return a === b || stem(a) === stem(b);
}

function targetSsid() {
  return els.ssid.value.trim() || state.net.sugerida || state.net.ssid || "";
}

function alreadySameNetwork() {
  if (!gloveLinked()) return false;
  const glove = state.gloveSsid;
  if (!glove || glove === GLOVE_AP_SSID) return false;
  const pc = state.net.ssid;
  const target = targetSsid();
  // Exige SSID real del guante (WIFI_INFO). Coincide con PC o con la red elegida.
  if (pc && ssidSame(glove, pc)) return true;
  if (target && ssidSame(glove, target)) return true;
  return false;
}

function maybeReadyLinked() {
  if (state.busy) return false;
  if (!els.modal || els.modal.hidden) return false;
  if (!gloveLinked()) {
    if (els.verify) {
      els.verify.hidden = true;
      els.verify.disabled = true;
    }
    if (els.ready) els.ready.hidden = true;
    if (!state.busy) setCardPhase("");
    return false;
  }

  const label = state.gloveSsid
    ? `"${state.gloveSsid}" · ${state.gloveIp}`
    : state.gloveIp;
  finishOk(`Guante enlazado (${label}).`);
  return true;
}

function continueToLab() {
  // Continuar siempre cierra si ya marcamos listo, o si hay IP de guante.
  if (!state.verifiedClose && !gloveLinked()) {
    setMsg("Espera a que el guante quede enlazado, o pulsa Omitir.", "warn");
    return;
  }
  state.verifiedClose = true;
  window.clearTimeout(state.closeTimer);
  closeModal();
}

function configProgressOk() {
  return state.busy && state.sawSent && (state.sawSaved || state.sawJoined);
}

function tryFinishLink() {
  if (!configProgressOk()) return;
  if (!gloveLinked()) {
    state.linkReadyAt = 0;
    stepTo("link");
    setMsg("Esperando que el guante se una a la red…", "info");
    return;
  }
  // En cuanto hay IP real: listo. Continuar → Calibrar.
  const ssid = state.pending || els.ssid.value.trim() || state.gloveSsid || "WiFi";
  finishOk(`Listo · "${ssid}" · ${state.gloveIp}`);
}

function onLivePoint(msg) {
  const t = msg?.type;
  if (t !== "finger" && t !== "preview" && t !== "calibration") return;
  if (!gloveLinked()) return;

  if (!els.modal.hidden && !state.busy) {
    state.verifyPoints += 1;
    maybeReadyLinked();
  }

  if (!state.busy || !state.sawSent) return;
  state.livePoints += 1;
  tryFinishLink();
}

function onBridgeMessage(msg) {
  if (msg.type === "hello" || msg.type === "connected") {
    state.gloveIp = msg.esp32_ip || null;
    if (!state.gloveIp) {
      state.gloveSsid = "";
      state.gloveMode = "";
      state.linkReadyAt = 0;
    }
    renderStatus();
    if (state.busy) tryFinishLink();
    else maybeReadyLinked();
    return;
  }

  if (msg.type === "finger" || msg.type === "preview" || msg.type === "calibration" || msg.type === "gloves") {
    if (msg.type === "gloves" && Array.isArray(msg.gloves) && msg.gloves[0]?.ip) {
      state.gloveIp = msg.gloves[0].ip;
      renderStatus();
      if (!state.busy) maybeReadyLinked();
    }
    onLivePoint(msg);
    return;
  }

  if (msg.type !== "wifi_config") return;

  if (msg.status === "info") {
    state.gloveMode = msg.mode;
    state.gloveSsid = msg.mode === "STA" ? msg.ssid : "";
    renderStatus();
    if (state.busy) tryFinishLink();
    else maybeReadyLinked();
    return;
  }

  if (!state.busy) return;

  if (msg.status === "sent") {
    state.sawSent = true;
    stepTo("save");
    setMsg(msg.via === "usb"
      ? `Enviado por USB (${msg.port}). Esperando confirmacion del guante…`
      : "Enviado por WiFi (sin USB). Esperando confirmacion…", "info");
    armTimeout(SEND_WAIT_MS, msg.via === "usb"
      ? "El guante no confirmo el guardado por USB. Revisa el cable y que este encendido."
      : "El guante no confirmo el guardado. Conectalo por USB y vuelve a intentar.");
  } else if (msg.status === "saved" || msg.status === "joining") {
    state.sawSent = true;
    state.sawSaved = true;
    state.pending = msg.ssid || state.pending;
    stepTo("join");
    setMsg(`Guardado "${state.pending}". Conectando a la red…`, "info");
    armTimeout(LINK_WAIT_MS, linkTimeoutMessage);
  } else if (msg.status === "connected") {
    if (!msg.ip || msg.ip === GLOVE_AP_IP) {
      setMsg(`IP invalida del guante (${msg.ip || "vacia"}). Esperando red real…`, "warn");
      return;
    }
    state.sawSent = true;
    state.sawSaved = true;
    state.sawJoined = true;
    state.joinedIp = msg.ip;
    state.pending = msg.ssid || state.pending || els.ssid.value.trim();
    state.gloveIp = msg.ip;
    state.gloveMode = "STA";
    state.gloveSsid = msg.ssid || state.gloveSsid || state.pending;
    state.linkReadyAt = Date.now();
    renderStatus();
    finishOk(`WiFi OK · "${state.pending}" · ${msg.ip}`);
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
  if (state.busy) return;
  const error = validate();
  if (error) { setMsg(error, "bad"); return; }
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    setMsg("El puente no esta conectado. Inicia nexum_bridge.py y vuelve a intentar.", "bad");
    connectBridge();
    return;
  }

  const ssid = els.ssid.value.trim();
  // Si ya esta enlazado en esa red: Continuar cierra y deja listo Calibrar.
  if (alreadySameNetwork() && ssidSame(state.gloveSsid || ssid, ssid)) {
    finishOk(`Guante ya en "${state.gloveSsid}" · ${state.gloveIp}. Pulsa Continuar para calibrar.`);
    return;
  }

  state.touched = true;
  localStorage.setItem(SSID_KEY, ssid);
  window.clearTimeout(state.closeTimer);
  state.verifiedClose = false;
  state.session += 1;
  resetSessionFlags();
  state.pending = ssid;
  setBusy(true);
  resetSteps(true);
  stepTo("send");
  const hasUsb = Array.isArray(state.net.usb) && state.net.usb.length > 0;
  setMsg(hasUsb
    ? `Enviando "${ssid}" por USB…`
    : "Sin USB. Conecta el cable o espera enlace por WiFi…", "info");
  armTimeout(12000, () => hasUsb
    ? "El guante no respondio por USB. Revisa el cable y cierra el Monitor Serie de Arduino si esta abierto."
    : "Conecta el guante por USB para pasarle el WiFi de esta PC, luego pulsa Configurar guante.");
  state.ws.send(JSON.stringify({ action: "wifi_config", ssid, password: els.pass.value }));
}

function retryFlow() {
  state.touched = true;
  window.clearTimeout(state.timer);
  window.clearTimeout(state.closeTimer);
  state.verifiedClose = false;
  resetSessionFlags();
  setBusy(false);
  resetSteps(false);
  hideExtraActions();
  setCardPhase("");
  setMsg("Listo. Pulsa Configurar guante.", "info");
}

function openModal(auto = false) {
  window.clearTimeout(state.closeTimer);
  els.modal.hidden = false;
  state.auto = auto;
  state.touched = false;
  state.verifiedClose = false;
  state.verifyPoints = 0;
  state.ssidEdited = false;
  state.passEdited = false;
  state.passFor = null;
  els.pass.value = "";
  els.pass.type = "password";
  els.showPass.textContent = "Ver";
  setHint(els.passHint, "");
  setMsg(auto ? "Comprobando enlace del guante…" : "");
  resetSessionFlags();
  setBusy(false);
  resetSteps(false);
  hideExtraActions();
  setCardPhase("");
  els.skip.checked = localStorage.getItem(SKIP_KEY) === "1";
  connectBridge();
  renderStatus();
  refreshNetwork();
  window.clearInterval(state.poll);
  state.poll = window.setInterval(refreshNetwork, POLL_MS);
  window.setTimeout(() => maybeReadyLinked(), 350);
}

function closeModal() {
  els.modal.hidden = true;
  localStorage.setItem(SKIP_KEY, els.skip.checked ? "1" : "0");
  els.pass.value = "";
  window.clearInterval(state.poll);
  window.clearTimeout(state.timer);
  window.clearTimeout(state.closeTimer);
  state.pending = null;
  state.verifiedClose = false;
  resetSessionFlags();
  setBusy(false);
  hideExtraActions();
  setCardPhase("");
  const ws = state.ws;
  state.ws = null;
  ws?.close();
}

let ssidTimer = 0;
els.form.addEventListener("submit", sendWifi);
els.open?.addEventListener("click", () => openModal(false));
els.verify?.addEventListener("click", continueToLab);
els.retry?.addEventListener("click", retryFlow);
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
