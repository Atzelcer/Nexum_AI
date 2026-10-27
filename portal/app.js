import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createParticleSystem } from "./particles.js?v=2";

const STORAGE_KEY = "nexum_session_v1";
const AUTH_KEY = "nexum_auth_v1";
const AUTH_API = "/api/auth";
const MODEL_URL = new URL("../modulo_teclado/modelo3D-brazo/source/rigged hand.fbx", import.meta.url).href;
const TEXTURE_URL = new URL("../modulo_teclado/modelo3D-brazo/textures/pCube1_albedo.jpg", import.meta.url).href;
const NORMAL_URL = new URL("../modulo_teclado/modelo3D-brazo/textures/pCube1_normal.png", import.meta.url).href;
const ROUGHNESS_URL = new URL("../modulo_teclado/modelo3D-brazo/textures/pCube1_roughness.jpg", import.meta.url).href;
const METALLIC_URL = new URL("../modulo_teclado/modelo3D-brazo/textures/pCube1_metallic.jpg", import.meta.url).href;
const AO_URL = new URL("../modulo_teclado/modelo3D-brazo/textures/pCube1_AO.jpg", import.meta.url).href;
const HERO_FLOOR_Y = -1.76;

const REAL_FINGER_BONES = {
  pulgar: ["thumb", "thumbjoint", "joint6"],
  indice: ["inderxfinger", "indermiddle", "indertop"],
  medio: ["middlefinger", "middlemiddle", "middletop"],
  anular: ["ringvinger", "ringmiddle", "ringtop"],
  menique: ["pinkyfinger", "pinkymiddle", "pinkytop"]
};

const els = {
  boot: document.querySelector("#boot"),
  sceneRoot: document.querySelector("#sceneRoot"),
  authOpenBtn: document.querySelector("#authOpenBtn"),
  authStage: document.querySelector("#authStage"),
  authCloseBtn: document.querySelector("#authCloseBtn"),
  authForm: document.querySelector("#authForm"),
  authTitle: document.querySelector("#authTitle"),
  authSub: document.querySelector("#authSub"),
  authSubmitBtn: document.querySelector("#authSubmitBtn"),
  authError: document.querySelector("#authError"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  authPass: document.querySelector("#authPass"),
  authPassToggle: document.querySelector("#authPassToggle"),
  nameField: document.querySelector("#nameField"),
  identityLabel: document.querySelector("#identityLabel"),
  accountBar: document.querySelector("#accountBar"),
  settingsOpenBtn: document.querySelector("#settingsOpenBtn"),
  settingsStage: document.querySelector("#settingsStage"),
  settingsCloseBtn: document.querySelector("#settingsCloseBtn"),
  settingsTitle: document.querySelector("#settingsTitle"),
  settingsSub: document.querySelector("#settingsSub"),
  settingsKicker: document.querySelector("#settingsKicker"),
  logoutBtn: document.querySelector("#logoutBtn"),
  operatorName: document.querySelector("#operatorName"),
  connectBtn: document.querySelector("#connectBtn"),
  disconnectBtn: document.querySelector("#disconnectBtn"),
  linkStatus: document.querySelector("#linkStatus"),
  connectProgress: document.querySelector("#connectProgress"),
  sessionChip: document.querySelector("#sessionChip"),
  signalDot: document.querySelector("#signalDot"),
  modulesHint: document.querySelector("#modulesHint"),
  modules: document.querySelector("#modules"),
  statSource: document.querySelector("#statSource"),
  statLink: document.querySelector("#statLink"),
  statServer: document.querySelector("#statServer"),
  statAccount: document.querySelector("#statAccount"),
  dotServer: document.querySelector("#dotServer"),
  dotBridge: document.querySelector("#dotBridge"),
  dotSource: document.querySelector("#dotSource"),
  dotAccount: document.querySelector("#dotAccount"),
  sysChip: document.querySelector("#sysChip"),
  sysChipText: document.querySelector("#sysChipText"),
  accountAvatar: document.querySelector("#accountAvatar"),
  accountSource: document.querySelector("#accountSource"),
  gloveState: document.querySelector("#gloveState"),
  cameraState: document.querySelector("#cameraState"),
  gloveLive: document.querySelector("#gloveLive"),
  cameraLive: document.querySelector("#cameraLive"),
  sourceTiles: [...document.querySelectorAll(".source-tile")],
  moduleLinks: [...document.querySelectorAll(".module-link")],
  authTabs: [...document.querySelectorAll("[data-auth-tab]")]
};

const session = {
  name: "",
  email: "",
  source: "glove",
  connected: false,
  loggedIn: false
};

const BRIDGE_WS = `ws://${location.hostname || "127.0.0.1"}:8765`;

const live = {
  server: null,
  bridge: null,
  gloves: 0,
  expected: 0,
  cameras: null
};

let authMode = "login";

document.body.classList.add("is-booting");
window.setTimeout(() => {
  els.boot?.addEventListener("transitionend", () => els.boot.remove(), { once: true });
  els.boot?.classList.add("is-done");
  document.body.classList.remove("is-booting");
}, 600);

function readAuthStore() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || '{"users":[],"current":null}');
  } catch (_err) {
    return { users: [], current: null };
  }
}

function writeAuthStore(store) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(store));
}

function rememberUser(user) {
  const store = readAuthStore();
  const email = String(user.email || "").toLowerCase();
  const idx = store.users.findIndex((u) => u.email === email);
  const row = {
    id: user.id || "",
    name: user.name || email.split("@")[0],
    email
  };
  if (idx >= 0) store.users[idx] = { ...store.users[idx], ...row };
  else store.users.push(row);
  store.current = email;
  writeAuthStore(store);
  session.loggedIn = true;
  session.email = email;
  session.name = row.name;
}

async function authRequest(path, body) {
  const res = await fetch(`${AUTH_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_err) {
    data = {};
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "No se pudo completar la autenticacion.");
  }
  return data.user;
}

async function loginUser(identity, pass) {
  const user = await authRequest("/login", { identity, password: pass });
  rememberUser(user);
  return true;
}

async function registerUser(name, email, pass) {
  const user = await authRequest("/register", { name, email, password: pass });
  rememberUser(user);
  return true;
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      session.source = data.source === "spatial" ? "spatial" : "glove";
      session.connected = Boolean(data.connected);
    }
  } catch (_err) {}

  const store = readAuthStore();
  const user = store.users.find((u) => u.email === store.current);
  if (user) {
    session.loggedIn = true;
    session.email = user.email;
    session.name = user.name || user.email.split("@")[0];
  } else {
    session.loggedIn = false;
    session.email = "";
    session.name = "";
    session.connected = false;
  }

  if (els.operatorName) els.operatorName.value = session.name;
  const radio = document.querySelector(`input[name="captureSource"][value="${session.source}"]`);
  if (radio) radio.checked = true;
}

function saveSession() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      source: session.source,
      connected: session.connected && session.loggedIn
    })
  );
}

function sourceLabel(source = session.source) {
  return source === "spatial" ? "Vision MediaPipe" : "Guante inercial";
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  els.authTabs.forEach((tab) => {
    tab.classList.toggle("is-on", tab.dataset.authTab === authMode);
  });
  els.nameField.hidden = authMode !== "register";
  if (els.identityLabel) {
    els.identityLabel.textContent = authMode === "register" ? "Correo" : "Nombre o correo";
  }
  els.authEmail.type = authMode === "register" ? "email" : "text";
  els.authEmail.placeholder =
    authMode === "register" ? "tu@correo.com" : "Atzel o tu@correo.com";
  els.authEmail.autocomplete = authMode === "register" ? "email" : "username";
  els.authTitle.textContent = authMode === "register" ? "Crear cuenta" : "Iniciar sesion";
  els.authSub.textContent =
    authMode === "register"
      ? "Registra tu cuenta para guardar configuracion y fuentes."
      : "Entra con tu cuenta para configurar fuentes y modalidades.";
  els.authSubmitBtn.textContent = authMode === "register" ? "Crear cuenta" : "Entrar";
  els.authPass.autocomplete = authMode === "register" ? "new-password" : "current-password";
  setPassVisible(false);
  els.authError.hidden = true;
}

function showAuthError(msg) {
  els.authError.textContent = msg;
  els.authError.hidden = false;
}

function openAuth() {
  setAuthMode("login");
  els.authStage.hidden = false;
  els.authEmail.focus();
}

function closeAuth() {
  els.authStage.hidden = true;
}

function openSettings(options = {}) {
  if (!session.loggedIn) {
    openAuth();
    return;
  }
  const welcome = Boolean(options.welcome);
  els.operatorName.value = session.name;
  if (options.source === "glove" || options.source === "spatial") {
    const radio = document.querySelector(`input[name="captureSource"][value="${options.source}"]`);
    if (radio) radio.checked = true;
  }
  if (els.settingsKicker) {
    els.settingsKicker.textContent = welcome ? "Sesion iniciada" : "Cuenta activa";
  }
  if (els.settingsTitle) {
    els.settingsTitle.textContent = welcome
      ? `Hola, ${session.name}`
      : "Configuracion";
  }
  if (els.settingsSub) {
    els.settingsSub.textContent = welcome
      ? "Elige y conecta tu fuente de captura para desbloquear las modalidades."
      : "Elige la fuente de captura para habilitar las modalidades.";
  }
  els.settingsStage.hidden = false;
}

function closeSettings() {
  els.settingsStage.hidden = true;
}

function afterAuthSuccess() {
  els.operatorName.value = session.name;
  saveSession();
  refreshUi();
  closeAuth();
}

function logout() {
  const store = readAuthStore();
  store.current = null;
  writeAuthStore(store);
  session.loggedIn = false;
  session.email = "";
  session.name = "";
  session.connected = false;
  saveSession();
  closeSettings();
  refreshUi();
}

function refreshUi() {
  document.body.classList.remove("source-glove", "source-spatial", "is-logged");
  const ready = session.loggedIn && session.connected;

  if (session.loggedIn) {
    document.body.classList.add("is-logged");
    if (els.authOpenBtn) {
      els.authOpenBtn.hidden = true;
      els.authOpenBtn.setAttribute("aria-hidden", "true");
    }
    if (els.accountBar) {
      els.accountBar.hidden = false;
      els.accountBar.removeAttribute("aria-hidden");
    }
    els.sessionChip.textContent = session.name;
    els.sessionChip.classList.toggle("is-on", ready);
    els.statAccount.textContent = session.name;
    if (els.accountAvatar) els.accountAvatar.textContent = (session.name || "N").trim().charAt(0).toUpperCase();
    if (els.accountSource) els.accountSource.textContent = ready ? sourceLabel() : "Sin fuente";
  } else {
    if (els.authOpenBtn) {
      els.authOpenBtn.hidden = false;
      els.authOpenBtn.textContent = "Iniciar sesion";
      els.authOpenBtn.removeAttribute("aria-hidden");
    }
    if (els.accountBar) {
      els.accountBar.hidden = true;
      els.accountBar.setAttribute("aria-hidden", "true");
    }
    els.sessionChip.textContent = "Sin sesion";
    els.sessionChip.classList.remove("is-on");
    els.statAccount.textContent = "Invitado";
  }

  if (ready) {
    document.body.classList.add(session.source === "spatial" ? "source-spatial" : "source-glove");
    els.linkStatus.textContent = `${sourceLabel()} conectado`;
    els.linkStatus.className = "link-status is-on";
    els.signalDot.classList.add("is-on");
    els.disconnectBtn.disabled = false;
    els.connectBtn.textContent = "Reconectar";
    els.modulesHint.textContent = "Fuente activa. Entra a una modalidad (teclas 1 · 2 · 3).";
    els.moduleLinks.forEach((link) => {
      link.classList.remove("is-locked");
      link.classList.add("is-ready");
      const state = link.querySelector(".module-state");
      if (state) state.textContent = "Entrar";
    });
    setSceneMode(session.source);
  } else {
    els.linkStatus.textContent = session.loggedIn ? "Fuente: desconectada" : "Inicia sesion primero";
    els.linkStatus.className = "link-status is-off";
    els.signalDot.classList.remove("is-on");
    els.disconnectBtn.disabled = true;
    els.connectBtn.textContent = "Conectar fuente";
    els.modulesHint.textContent = session.loggedIn
      ? "Abre Configurar y conecta guante o vision MediaPipe."
      : "Inicia sesion y configura tu fuente para desbloquear.";
    els.moduleLinks.forEach((link) => {
      link.classList.add("is-locked");
      link.classList.remove("is-ready");
      const state = link.querySelector(".module-state");
      if (state) state.textContent = "Bloqueado";
    });
    setSceneMode("idle");
  }

  els.sourceTiles.forEach((tile) => {
    tile.classList.toggle("is-active", ready && tile.dataset.source === session.source);
  });
  setDot(els.dotAccount, session.loggedIn ? "ok" : "");
  renderLive();
}

function setDot(el, tone) {
  if (!el) return;
  el.className = tone ? `stat-dot is-${tone}` : "stat-dot";
}

function setTone(el, text, tone) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("is-ok", "is-warn", "is-bad");
  if (tone) el.classList.add(`is-${tone}`);
}

function gloveStatus() {
  if (live.bridge === null) return { text: "Comprobando puente…", tone: "" };
  if (!live.bridge) return { text: "Puente apagado", tone: "bad" };
  if (live.gloves) return { text: "Guante conectado", tone: "ok" };
  return { text: "Puente listo · buscando ESP32", tone: "warn" };
}

function cameraStatus() {
  if (live.cameras === null) return { text: "Buscando camara…", tone: "" };
  if (live.cameras === 0) return { text: "Sin camara detectada", tone: "bad" };
  return {
    text: live.cameras > 1 ? `${live.cameras} camaras disponibles` : "Camara disponible",
    tone: "ok"
  };
}

function renderLive() {
  const glove = gloveStatus();
  const cam = cameraStatus();
  setTone(els.gloveState, glove.text, glove.tone);
  setTone(els.cameraState, cam.text, cam.tone);
  setTone(els.gloveLive, glove.text, glove.tone);
  setTone(els.cameraLive, cam.text, cam.tone);

  if (els.statServer) els.statServer.textContent = live.server === null ? "—" : live.server ? "En linea" : "Caido";
  setDot(els.dotServer, live.server === null ? "" : live.server ? "ok" : "bad");

  if (els.statLink) {
    els.statLink.textContent =
      live.bridge === null ? "—" : !live.bridge ? "Apagado" : live.gloves ? "Guante enlazado" : "Sin guante";
  }
  setDot(els.dotBridge, live.bridge === null ? "" : !live.bridge ? "bad" : live.gloves ? "ok" : "warn");

  const ready = session.loggedIn && session.connected;
  const sourceInfo = session.source === "spatial" ? cam : glove;
  if (els.statSource) els.statSource.textContent = ready ? (session.source === "spatial" ? "Vision" : "Guante") : "—";
  setDot(els.dotSource, ready ? (sourceInfo.tone === "ok" ? "ok" : "warn") : "");

  if (els.sysChip && els.sysChipText) {
    let tone = "wait";
    let text = "Comprobando sistema…";
    if (live.server === false) {
      tone = "bad";
      text = "Servidor caido · arranca scripts/nexum_http.py";
    } else if (live.server && live.bridge === false) {
      tone = "wait";
      text = "Servidor OK · puente apagado (scripts/nexum_bridge.py)";
    } else if (live.server && live.bridge) {
      tone = "ok";
      text = live.gloves
        ? `Sistema en linea · ${live.gloves} guante${live.gloves > 1 ? "s" : ""}`
        : "Sistema en linea";
    }
    els.sysChip.className = `sys-chip is-${tone}`;
    els.sysChipText.textContent = text;
  }
}

async function checkServer() {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${AUTH_API}/health`, { cache: "no-store", signal: ctrl.signal });
    live.server = res.ok;
  } catch (_err) {
    live.server = false;
  } finally {
    window.clearTimeout(timer);
  }
  renderLive();
}

let bridgeSocket = null;
let bridgeRetry = 0;

function connectBridge() {
  window.clearTimeout(bridgeRetry);
  if (bridgeSocket && bridgeSocket.readyState <= WebSocket.OPEN) return;
  try {
    bridgeSocket = new WebSocket(BRIDGE_WS);
  } catch (_err) {
    live.bridge = false;
    renderLive();
    bridgeRetry = window.setTimeout(connectBridge, 4000);
    return;
  }
  bridgeSocket.addEventListener("open", () => {
    live.bridge = true;
    renderLive();
  });
  bridgeSocket.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : "";
    if (!/"type":\s*"(hello|gloves)"/.test(raw.slice(0, 48))) return;
    try {
      const msg = JSON.parse(raw);
      live.gloves = Number(msg.count) || 0;
      live.expected = Number(msg.expected) || 0;
      renderLive();
    } catch (_err) {}
  });
  bridgeSocket.addEventListener("close", () => {
    live.bridge = false;
    live.gloves = 0;
    renderLive();
    bridgeRetry = window.setTimeout(connectBridge, 4000);
  });
}

async function checkCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    live.cameras = 0;
    renderLive();
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    live.cameras = devices.filter((d) => d.kind === "videoinput").length;
  } catch (_err) {
    live.cameras = 0;
  }
  renderLive();
}

function startLiveStatus() {
  checkServer();
  window.setInterval(checkServer, 6000);
  connectBridge();
  checkCameras();
  navigator.mediaDevices?.addEventListener?.("devicechange", checkCameras);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function connectSource() {
  if (!session.loggedIn) {
    openAuth();
    return;
  }
  const selected = document.querySelector('input[name="captureSource"]:checked');
  session.source = selected?.value === "spatial" ? "spatial" : "glove";
  session.name = els.operatorName.value.trim() || session.name;

  els.linkStatus.textContent = `Conectando ${sourceLabel().toLowerCase()}…`;
  els.linkStatus.className = "link-status is-wait";
  els.connectProgress.hidden = false;
  els.connectBtn.disabled = true;

  let problem = "";
  if (session.source === "spatial") {
    await checkCameras();
    if (!live.cameras) problem = "No hay webcam detectada. Conecta una camara y reintenta.";
  } else {
    if (!live.bridge) {
      connectBridge();
      await sleep(1200);
    }
    if (!live.bridge) problem = "Puente apagado. Arranca scripts/nexum_bridge.py y reintenta.";
  }
  await sleep(300);

  els.connectBtn.disabled = false;
  els.connectProgress.hidden = true;
  if (problem) {
    els.linkStatus.textContent = problem;
    els.linkStatus.className = "link-status is-off";
    return;
  }

  playConnectPulse();
  session.connected = true;
  saveSession();
  refreshUi();
  closeSettings();
}

function disconnectSource() {
  session.connected = false;
  saveSession();
  refreshUi();
}

function setPassVisible(visible) {
  const show = Boolean(visible);
  if (!els.authPass || !els.authPassToggle) return;
  els.authPass.type = show ? "text" : "password";
  els.authPassToggle.setAttribute("aria-pressed", show ? "true" : "false");
  els.authPassToggle.setAttribute("aria-label", show ? "Ocultar contrasena" : "Mostrar contrasena");
  els.authPassToggle.title = show ? "Ocultar contrasena" : "Mostrar contrasena";
  const eyeOpen = els.authPassToggle.querySelector(".eye-open");
  const eyeOff = els.authPassToggle.querySelector(".eye-off");
  if (eyeOpen) eyeOpen.hidden = show;
  if (eyeOff) eyeOff.hidden = !show;
}

els.authPassToggle?.addEventListener("click", () => {
  setPassVisible(els.authPass.type === "password");
});

els.authOpenBtn?.addEventListener("click", openAuth);
els.authCloseBtn?.addEventListener("click", closeAuth);
els.settingsOpenBtn?.addEventListener("click", openSettings);
els.settingsCloseBtn?.addEventListener("click", closeSettings);
els.logoutBtn?.addEventListener("click", logout);
els.connectBtn?.addEventListener("click", () => connectSource().catch(console.error));
els.disconnectBtn?.addEventListener("click", disconnectSource);

els.authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authTab));
});

els.authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identity = els.authEmail.value.trim();
  const pass = els.authPass.value;
  const name = els.authName.value.trim();
  if (!identity || !pass) {
    showAuthError(
      authMode === "register"
        ? "Completa correo y contrasena."
        : "Completa nombre/correo y contrasena."
    );
    return;
  }
  const email = identity.toLowerCase();
  if (authMode === "register" && !email.includes("@")) {
    showAuthError("Usa un correo valido para crear la cuenta.");
    return;
  }

  els.authSubmitBtn.disabled = true;
  els.authError.hidden = true;
  try {
    if (authMode === "register") {
      await registerUser(name || email.split("@")[0], email, pass);
    } else {
      await loginUser(identity, pass);
    }
    afterAuthSuccess();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de autenticacion.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      showAuthError("Servidor no disponible. Arranca scripts/nexum_http.py");
    } else {
      showAuthError(msg);
    }
  } finally {
    els.authSubmitBtn.disabled = false;
  }
});

els.authStage?.addEventListener("click", (event) => {
  if (event.target === els.authStage) closeAuth();
});
els.settingsStage?.addEventListener("click", (event) => {
  if (event.target === els.settingsStage) closeSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.authStage.hidden) closeAuth();
  if (!els.settingsStage.hidden) closeSettings();
});

els.moduleLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.classList.contains("is-locked")) {
      event.preventDefault();
      if (!session.loggedIn) openAuth();
      else openSettings();
    }
  });
});

els.sourceTiles.forEach((tile) => {
  tile.addEventListener("click", () => {
    if (!session.loggedIn) openAuth();
    else openSettings({ source: tile.dataset.source });
  });
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!els.authStage.hidden || !els.settingsStage.hidden) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
  const link = els.moduleLinks.find((item) => item.dataset.key === event.key);
  if (link?.classList.contains("is-ready")) window.location.href = link.href;
});

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xdfe8e2, 0.018);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(1.15, 1.55, 8.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
els.sceneRoot.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ("environmentIntensity" in scene) scene.environmentIntensity = 0.55;

const useBloom = window.matchMedia("(min-width: 900px)").matches;
let composer = null;
let bloom = null;
if (useBloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

scene.add(new THREE.HemisphereLight(0xf6fff9, 0x3a4640, 0.68));

const key = new THREE.DirectionalLight(0xfff2e6, 2.05);
key.position.set(7.2, 10, 5.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.03;
scene.add(key);

const fill = new THREE.DirectionalLight(0x7ec8b4, 0.7);
fill.position.set(-8, 4, 2);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xff9a5c, 0.62);
rim.position.set(-2, 3, -7);
scene.add(rim);

const spot = new THREE.SpotLight(0xffffff, 16, 28, 0.4, 0.55, 1.2);
spot.position.set(3.6, 7.5, 3.2);
spot.target.position.set(3.4, 0.1, 0);
scene.add(spot);
scene.add(spot.target);

const warmPoint = new THREE.PointLight(0xc45c1a, 8, 14, 2);
warmPoint.position.set(5.2, 1.2, 1.5);
scene.add(warmPoint);

const world = new THREE.Group();
world.position.set(3.55, -0.12, 0);
scene.add(world);

const handRig = {
  kind: "procedural",
  group: new THREE.Group(),
  fingers: [],
  bones: new Map(),
  tech: null,
  cuff: null,
  model: null,
  baseRot: { x: 0.12, y: -0.35, z: 0.04 }
};
handRig.group.rotation.set(handRig.baseRot.x, handRig.baseRot.y, handRig.baseRot.z);
world.add(handRig.group);

const procedural = createProceduralHand();
handRig.group.add(procedural.group);
handRig.fingers = procedural.fingers;
handRig.tech = procedural.tech;
handRig.cuff = procedural.cuff;

const rings = createOrbitRings();
world.add(rings);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const particleFx = createParticleSystem({
  pixelRatio: renderer.getPixelRatio(),
  lowPower: !useBloom,
  reducedMotion
});
world.add(particleFx.group);

const floatSquares = createFloatSquares();
world.add(floatSquares.group);

const sensorNodes = createSensorNodes();
handRig.group.add(sensorNodes.group);

const landmarkCloud = createLandmarkCloud();
handRig.group.add(landmarkCloud.group);

const pedestal = createPedestal();
world.add(pedestal.group);

seedHudSquares();
window.setInterval(spawnHudSquare, 1400);

let sceneMode = "idle";
let connectBurst = 0;
let introT = 0;
let sceneActive = true;
let scrolling = false;
let scrollIdleTimer = 0;

function setSceneMode(mode) {
  if (mode !== sceneMode && mode !== "idle") particleFx.burst();
  sceneMode = mode;
  sensorNodes.group.visible = mode === "glove";
  landmarkCloud.group.visible = mode === "spatial";
  particleFx.setMode(mode);
  if (bloom) bloom.strength = mode === "idle" ? 0.18 : 0.28;
}

function playConnectPulse() {
  connectBurst = 1;
  particleFx.burst();
}

function cleanBoneName(name = "") {
  return name.replace(/\u0000.*$/, "").replace(/^Model::/, "").toLowerCase();
}

function createPedestal() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.6, 0.18, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0xb3bfb5,
      roughness: 0.55,
      metalness: 0.18,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
      transparent: true,
      opacity: 0.55
    })
  );
  base.position.y = -1.62;
  base.receiveShadow = true;
  group.add(base);

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.85, 0.05, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x0f3d35,
      roughness: 0.35,
      metalness: 0.4,
      clearcoat: 0.65,
      emissive: 0x062822,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.7
    })
  );
  plate.position.y = -1.5;
  plate.receiveShadow = true;
  group.add(plate);

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x0d8f7d,
    emissive: 0x0d8f7d,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.5
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.02, 12, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.45;
  group.add(ring);

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.44;
  group.add(contact);

  return { group, ring };
}

function createProceduralHand() {
  const group = new THREE.Group();

  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xb67a5c,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.32,
    clearcoatRoughness: 0.45,
    sheen: 0.4,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xe8b89a)
  });
  const dark = new THREE.MeshPhysicalMaterial({
    color: 0x8a5238,
    roughness: 0.62,
    metalness: 0.04,
    clearcoat: 0.12
  });
  const tech = new THREE.MeshStandardMaterial({
    color: 0x0a6b5f,
    emissive: 0x0a6b5f,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.35
  });

  const palm = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.32, 1.72), skin);
  palm.castShadow = true;
  palm.receiveShadow = true;
  group.add(palm);

  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), skin);
  thenar.position.set(-0.55, -0.02, -0.25);
  thenar.scale.set(1.1, 0.55, 1.3);
  thenar.castShadow = true;
  group.add(thenar);

  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.25, 28), skin);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, -0.04, -1.3);
  wrist.castShadow = true;
  group.add(wrist);

  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 12, 48), tech);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.04, -1.7);
  group.add(cuff);

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 8, 40), tech);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, -0.04, -1.35);
  group.add(band);

  const specs = [
    { x: -0.48, z: 0.86, lengths: [0.58, 0.44, 0.34], phase: 0.0 },
    { x: -0.13, z: 0.94, lengths: [0.66, 0.48, 0.36], phase: 0.35 },
    { x: 0.24, z: 0.88, lengths: [0.6, 0.44, 0.32], phase: 0.7 },
    { x: 0.56, z: 0.74, lengths: [0.46, 0.36, 0.28], phase: 1.05 },
    { x: -0.78, z: 0.08, lengths: [0.42, 0.34, 0.26], phase: 1.4, thumb: true }
  ];

  const fingers = specs.map((spec) => {
    const chain = createFinger(spec, skin, dark);
    group.add(chain.root);
    return chain;
  });

  return { group, fingers, tech, cuff };
}

function createFinger(spec, skin, dark) {
  const root = new THREE.Group();
  root.position.set(spec.x, 0.06, spec.z);
  if (spec.thumb) {
    root.rotation.y = -0.9;
    root.rotation.z = 0.4;
  }

  const pivots = [];
  let parent = root;
  spec.lengths.forEach((len, i) => {
    const pivot = new THREE.Group();
    if (i > 0) pivot.position.z = spec.lengths[i - 1];
    parent.add(pivot);
    pivots.push(pivot);

    const radius = 0.135 - i * 0.016;
    const bone = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len * 0.7, 8, 16), skin);
    bone.rotation.x = Math.PI / 2;
    bone.position.z = len / 2;
    bone.castShadow = true;
    pivot.add(bone);

    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 16, 12), dark);
    knuckle.scale.set(1, 0.65, 0.8);
    knuckle.castShadow = true;
    pivot.add(knuckle);

    if (i === spec.lengths.length - 1) {
      const nail = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 1.2, 0.03, radius * 1.4),
        new THREE.MeshPhysicalMaterial({
          color: 0xe8d0c2,
          roughness: 0.28,
          metalness: 0.12,
          clearcoat: 0.7,
          clearcoatRoughness: 0.25
        })
      );
      nail.position.set(0, radius * 0.55, len * 0.72);
      pivot.add(nail);
    }

    parent = pivot;
  });

  return { root, pivots, phase: spec.phase, thumb: Boolean(spec.thumb) };
}

function createOrbitRings() {
  const group = new THREE.Group();
  const ringsList = [2.25, 2.7, 3.25].map((radius, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: i === 1 ? 0xc45c1a : 0x0a6b5f,
      transparent: true,
      opacity: 0.3 - i * 0.05,
      depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 10, 140), mat);
    ring.rotation.x = Math.PI / 2 + i * 0.22;
    ring.rotation.z = i * 0.5;
    group.add(ring);
    return ring;
  });
  group.userData.rings = ringsList;
  return group;
}

function createFloatSquares() {
  const group = new THREE.Group();
  const items = [];
  const count = 12;

  for (let i = 0; i < count; i += 1) {
    const size = 0.18 + Math.random() * 0.55;
    const geo = new THREE.PlaneGeometry(size, size);
    const edge = new THREE.EdgesGeometry(geo);
    const color = i % 5 === 0 ? 0xc45c1a : i % 3 === 0 ? 0x0d8f7d : 0x2a3a34;
    const line = new THREE.LineSegments(
      edge,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22 + Math.random() * 0.35,
        depthWrite: false
      })
    );

    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.03 + Math.random() * 0.05,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );

    const holder = new THREE.Group();
    holder.add(fill);
    holder.add(line);

    const r = 1.6 + Math.random() * 3.4;
    const a = Math.random() * Math.PI * 2;
    holder.position.set(
      Math.cos(a) * r * (0.55 + Math.random() * 0.7),
      -1.1 + Math.random() * 3.4,
      Math.sin(a) * r * 0.55 - 0.4 + Math.random() * 1.4
    );
    holder.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.4);

    group.add(holder);
    items.push({
      holder,
      line,
      fill,
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.7,
      bob: 0.08 + Math.random() * 0.18,
      spin: (Math.random() - 0.5) * 0.6,
      baseY: holder.position.y
    });
  }

  return { group, items };
}

function spawnHudSquare() {
  const host = document.querySelector("#hudSquares");
  if (!host) return;
  if (host.childElementCount > 12) host.firstElementChild?.remove();

  const el = document.createElement("span");
  el.className = "hud-square";
  const roll = Math.random();
  if (roll > 0.78) el.classList.add("is-hot");
  else if (roll < 0.28) el.classList.add("is-soft");

  const size = 16 + Math.random() * 64;
  const left = 55 + Math.random() * 42;
  const top = 6 + Math.random() * 80;
  const dur = 7 + Math.random() * 11;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `${left}%`;
  el.style.top = `${top}%`;
  el.style.setProperty("--hud-dx", `${(Math.random() - 0.35) * 160}px`);
  el.style.setProperty("--hud-dy", `${-60 - Math.random() * 180}px`);
  el.style.setProperty("--hud-rot", `${(Math.random() - 0.5) * 48}deg`);
  el.style.setProperty("--hud-scale", `${0.85 + Math.random() * 0.45}`);
  el.style.setProperty("--hud-opacity", `${0.28 + Math.random() * 0.4}`);
  el.style.animationDuration = `${dur}s`;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), dur * 1000 + 80);
}

function seedHudSquares() {
  for (let i = 0; i < 4; i += 1) {
    window.setTimeout(spawnHudSquare, i * 120);
  }
}

function createSensorNodes() {
  const group = new THREE.Group();
  group.visible = false;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0d8f7d,
    emissive: 0x0d8f7d,
    emissiveIntensity: 0.85,
    roughness: 0.28,
    metalness: 0.45
  });
  const nodes = [
    [-0.48, 0.35, 1.35],
    [-0.13, 0.38, 1.45],
    [0.24, 0.36, 1.38],
    [0.56, 0.32, 1.2],
    [-0.85, 0.28, 0.45]
  ].map(([x, y, z]) => {
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 14), mat.clone());
    node.position.set(x, y, z);
    group.add(node);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.15, 28),
      new THREE.MeshBasicMaterial({ color: 0x0d8f7d, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    halo.position.copy(node.position);
    group.add(halo);
    return { node, halo };
  });
  group.userData.nodes = nodes;
  return { group };
}

function createLandmarkCloud() {
  const group = new THREE.Group();
  group.visible = false;
  const mat = new THREE.MeshBasicMaterial({ color: 0x4f8ec8, transparent: true, opacity: 0.9 });
  const points = [];
  for (let i = 0; i < 21; i += 1) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), mat.clone());
    group.add(p);
    points.push(p);
  }
  group.userData.points = points;
  return { group };
}

async function loadTexture(loader, url) {
  try {
    return await loader.loadAsync(url);
  } catch (err) {
    console.warn(err);
    return null;
  }
}

function registerBones(root) {
  handRig.bones.clear();
  root.traverse((obj) => {
    if (obj.isBone || obj.type === "Bone") {
      handRig.bones.set(cleanBoneName(obj.name), obj);
    }
  });
}

function fitHeroModel(model) {
  model.rotation.set(Math.PI / 2, 0, 0);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.multiplyScalar(3.35 / maxDim);
  model.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(model);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += HERO_FLOOR_Y - fitted.min.y;
}

function applyHeroMaterials(model, maps) {
  model.traverse((obj) => {
    if (obj.isLine) {
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => {
        if (m) m.visible = false;
      });
    }
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
    if (!obj.geometry.attributes.uv2 && obj.geometry.attributes.uv) {
      obj.geometry.setAttribute("uv2", obj.geometry.attributes.uv);
    }
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (let i = 0; i < mats.length; i += 1) {
      const old = mats[i];
      const physical = new THREE.MeshPhysicalMaterial({
        color: old.color ? old.color.clone() : new THREE.Color(0xc08a6c),
        map: maps.albedo || old.map || null,
        normalMap: maps.normal || old.normalMap || null,
        roughnessMap: maps.roughness || old.roughnessMap || null,
        metalnessMap: maps.metalness || old.metalnessMap || null,
        aoMap: maps.ao || old.aoMap || null,
        roughness: 0.4,
        metalness: 0.07,
        clearcoat: 0.3,
        clearcoatRoughness: 0.42,
        sheen: 0.38,
        sheenRoughness: 0.52,
        sheenColor: new THREE.Color(0xe8b89a),
        envMapIntensity: 0.9,
        aoMapIntensity: 0.85
      });
      if (physical.normalMap) physical.normalScale = new THREE.Vector2(1.1, 1.1);
      if (Array.isArray(obj.material)) obj.material[i] = physical;
      else obj.material = physical;
    }
  });
}

function placeSensorsOnRealBones() {
  const knuckleNames = ["inderxfinger", "middlefinger", "ringvinger", "pinkyfinger", "thumb"];
  const nodes = sensorNodes.group.userData.nodes;
  knuckleNames.forEach((name, i) => {
    const bone = handRig.bones.get(name);
    const item = nodes[i];
    if (!bone || !item) return;
    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);
    handRig.group.worldToLocal(worldPos);
    item.node.position.copy(worldPos);
    item.halo.position.copy(worldPos);
  });
}

async function loadHeroModel() {
  try {
    const textureLoader = new THREE.TextureLoader();
    const [albedo, normal, roughness, metalness, ao] = await Promise.all([
      loadTexture(textureLoader, TEXTURE_URL),
      loadTexture(textureLoader, NORMAL_URL),
      loadTexture(textureLoader, ROUGHNESS_URL),
      loadTexture(textureLoader, METALLIC_URL),
      loadTexture(textureLoader, AO_URL)
    ]);
    if (albedo) albedo.colorSpace = THREE.SRGBColorSpace;

    const fbx = await new FBXLoader().loadAsync(MODEL_URL);
    applyHeroMaterials(fbx, { albedo, normal, roughness, metalness, ao });
    fitHeroModel(fbx);
    registerBones(fbx);

    while (handRig.group.children.length) {
      handRig.group.remove(handRig.group.children[0]);
    }
    handRig.group.add(fbx);
    handRig.group.add(sensorNodes.group);
    handRig.group.add(landmarkCloud.group);

    const tech = new THREE.MeshStandardMaterial({
      color: 0x0a6b5f,
      emissive: 0x0a6b5f,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.45
    });
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 14, 48), tech);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.95, 0.05);

    const wristBone =
      handRig.bones.get("wrist") ||
      handRig.bones.get("hand") ||
      handRig.bones.get("arm") ||
      [...handRig.bones.values()][0];
    if (wristBone) {
      const wp = new THREE.Vector3();
      wristBone.getWorldPosition(wp);
      handRig.group.worldToLocal(wp);
      cuff.position.copy(wp);
      cuff.position.y -= 0.12;
    }
    handRig.group.add(cuff);

    handRig.kind = "real";
    handRig.model = fbx;
    handRig.fingers = [];
    handRig.tech = tech;
    handRig.cuff = cuff;
    handRig.baseRot = { x: 0.08, y: -0.22, z: 0.02 };
    handRig.group.rotation.set(handRig.baseRot.x, handRig.baseRot.y, handRig.baseRot.z);

    placeSensorsOnRealBones();
    playConnectPulse();
  } catch (err) {
    console.warn("No se pudo cargar el FBX del portal, se mantiene el procedural:", err);
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / Math.max(1, h);
  if (w > 860) camera.setViewOffset(w, h, -Math.round(w * 0.2), 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer?.setSize(w, h);
  bloom?.setSize(w, h);
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
const pointer = { x: 0, y: 0 };
const pointerRaw = { x: 0, y: 0, lastMove: -10 };
window.addEventListener("pointermove", (event) => {
  if (!sceneActive || scrolling) return;
  const nx = (event.clientX / window.innerWidth) * 2 - 1;
  const ny = (event.clientY / window.innerHeight) * 2 - 1;
  pointer.x += (nx - pointer.x) * 0.08;
  pointer.y += (ny - pointer.y) * 0.08;
  pointerRaw.x = nx;
  pointerRaw.y = ny;
  pointerRaw.lastMove = clock.getElapsedTime();
});

const fxRay = new THREE.Raycaster();
const fxPlane = new THREE.Plane();
const fxNdc = new THREE.Vector2();
const fxHit = new THREE.Vector3();
const fxNormal = new THREE.Vector3();
const fxAnchor = new THREE.Vector3();

function pointerInWorld() {
  fxNdc.set(pointerRaw.x, -pointerRaw.y);
  fxRay.setFromCamera(fxNdc, camera);
  camera.getWorldDirection(fxNormal).negate();
  world.getWorldPosition(fxAnchor);
  fxAnchor.y += 0.3;
  fxPlane.setFromNormalAndCoplanarPoint(fxNormal, fxAnchor);
  if (!fxRay.ray.intersectPlane(fxPlane, fxHit)) return null;
  return world.worldToLocal(fxHit);
}

function updateSceneActive() {
  const y = window.scrollY || document.documentElement.scrollTop;
  sceneActive = y < window.innerHeight * 0.72;
  if (els.sceneRoot) els.sceneRoot.style.visibility = sceneActive ? "visible" : "hidden";
  document.body.classList.toggle("is-scrolled", !sceneActive);
}

window.addEventListener(
  "scroll",
  () => {
    scrolling = true;
    window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => {
      scrolling = false;
    }, 120);
    updateSceneActive();
  },
  { passive: true }
);
updateSceneActive();

function animateProceduralFingers(t, energy, wave) {
  handRig.fingers.forEach((finger, idx) => {
    const flex = (0.22 + 0.62 * Math.sin(t * 1.7 * wave + finger.phase)) * energy;
    const curl = flex * (finger.thumb ? 0.5 : 1);
    finger.pivots[0].rotation.x = -curl * 0.72;
    finger.pivots[1].rotation.x = -curl * 1.0;
    finger.pivots[2].rotation.x = -curl * 0.8;
    if (!finger.thumb) {
      finger.root.rotation.y = Math.sin(t * 0.8 + idx) * 0.04 * energy;
    }
  });
}

function animateRealBones(t, energy, wave) {
  const phases = { pulgar: 1.4, indice: 0, medio: 0.35, anular: 0.7, menique: 1.05 };
  Object.entries(REAL_FINGER_BONES).forEach(([finger, names], idx) => {
    const flex = (0.18 + 0.55 * Math.sin(t * 1.55 * wave + (phases[finger] || idx))) * energy;
    const curl = flex * (finger === "pulgar" ? 0.45 : 1);
    const axis = finger === "pulgar" ? -1 : -1;
    names.forEach((name, joint) => {
      const bone = handRig.bones.get(name);
      if (!bone) return;
      const amount = curl * (joint === 0 ? 0.55 : joint === 1 ? 0.85 : 0.7);
      bone.rotation.z = THREE.MathUtils.degToRad(amount * 42 * axis);
    });
  });
}

function animateHand(t) {
  const energy = sceneMode === "idle" ? 0.48 : 1.05;
  const wave = sceneMode === "spatial" ? 1.35 : sceneMode === "glove" ? 1.1 : 1;

  if (handRig.kind === "real") animateRealBones(t, energy, wave);
  else animateProceduralFingers(t, energy, wave);

  handRig.group.rotation.y = handRig.baseRot.y + Math.sin(t * 0.28) * 0.1 + pointer.x * 0.12;
  handRig.group.rotation.x = handRig.baseRot.x + Math.sin(t * 0.42) * 0.06 + pointer.y * -0.08;
  handRig.group.position.y = Math.sin(t * 0.9) * (handRig.kind === "real" ? 0.035 : 0.1);

  if (handRig.tech) {
    const pulse =
      sceneMode === "glove"
        ? 0.7 + Math.sin(t * 5) * 0.25
        : sceneMode === "spatial"
          ? 0.5 + Math.sin(t * 3.2) * 0.18
          : 0.25 + Math.sin(t * 2) * 0.08;
    handRig.tech.emissiveIntensity = pulse;
    if (sceneMode === "spatial") {
      handRig.tech.color.setHex(0x2a5f8f);
      handRig.tech.emissive.setHex(0x2a5f8f);
    } else {
      handRig.tech.color.setHex(0x0a6b5f);
      handRig.tech.emissive.setHex(0x0a6b5f);
    }
  }

  if (handRig.kind === "real" && sensorNodes.group.visible) {
    placeSensorsOnRealBones();
  }
}

function animateSensors(t) {
  if (!sensorNodes.group.visible) return;
  sensorNodes.group.userData.nodes.forEach((item, i) => {
    const s = 1 + Math.sin(t * 4 + i) * 0.18;
    item.node.scale.setScalar(s);
    item.halo.scale.setScalar(1.2 + Math.sin(t * 3 + i) * 0.35);
    item.halo.material.opacity = 0.2 + Math.sin(t * 3 + i) * 0.15;
  });
}

function animateLandmarks(t) {
  if (!landmarkCloud.group.visible) return;
  const pts = landmarkCloud.group.userData.points;
  const layout = [
    [0, 0, 0], [-0.2, 0.05, 0.2], [-0.35, 0.1, 0.45], [-0.45, 0.14, 0.7], [-0.5, 0.16, 0.95],
    [-0.15, 0.08, 0.55], [-0.18, 0.12, 0.9], [-0.2, 0.14, 1.15], [-0.22, 0.15, 1.35],
    [0.05, 0.08, 0.6], [0.05, 0.13, 0.98], [0.05, 0.15, 1.25], [0.05, 0.16, 1.45],
    [0.28, 0.07, 0.55], [0.32, 0.11, 0.88], [0.34, 0.13, 1.12], [0.35, 0.14, 1.3],
    [0.48, 0.05, 0.42], [0.55, 0.08, 0.7], [0.58, 0.1, 0.92], [0.6, 0.11, 1.1]
  ];
  pts.forEach((p, i) => {
    const base = layout[i] || [0, 0, 0];
    p.position.set(
      base[0] + Math.sin(t * 2 + i) * 0.02,
      base[1] + 0.2 + Math.cos(t * 1.8 + i) * 0.03,
      base[2]
    );
    p.material.opacity = 0.55 + Math.sin(t * 3 + i) * 0.3;
  });
}

function animateExtras(t) {
  rings.userData.rings.forEach((ring, i) => {
    ring.rotation.z = t * (0.12 + i * 0.04);
    ring.rotation.y = t * (0.06 + i * 0.025);
    ring.material.opacity = 0.1 + (sceneMode === "idle" ? 0.08 : 0.2) + Math.sin(t + i) * 0.05;
  });

  if (pedestal.ring) {
    pedestal.ring.material.emissiveIntensity = 0.4 + Math.sin(t * 2.1) * 0.22;
  }

  floatSquares.items.forEach((item, i) => {
    item.holder.position.y = item.baseY + Math.sin(t * item.speed + item.phase) * item.bob;
    item.holder.quaternion.copy(camera.quaternion);
    item.holder.rotateZ(t * item.spin * 0.35 + item.phase);
    const pulse = 0.2 + Math.sin(t * 2.2 + i) * 0.12;
    item.line.material.opacity = pulse + (sceneMode === "idle" ? 0 : 0.14);
    item.fill.material.opacity = 0.03 + pulse * 0.09;
    if (sceneMode === "spatial") item.line.material.color.setHex(i % 2 ? 0x4f8ec8 : 0x7eb6e8);
    else if (sceneMode === "glove") item.line.material.color.setHex(i % 5 === 0 ? 0xc45c1a : 0x0d8f7d);
    else item.line.material.color.setHex(i % 5 === 0 ? 0xc45c1a : 0x3d524a);
  });

  const pointerFresh = t - pointerRaw.lastMove < 1.6;
  particleFx.update(t, {
    pointer: pointerFresh ? pointerInWorld() : null,
    pointerStrength: pointerFresh ? 1 : 0
  });

  warmPoint.intensity = 8 + Math.sin(t * 1.3) * 3;
  spot.intensity = 16 + Math.sin(t * 1.05) * 3;

  if (connectBurst > 0) {
    connectBurst = Math.max(0, connectBurst - 0.028);
    rings.scale.setScalar(1 + connectBurst * 0.55);
    floatSquares.group.scale.setScalar(1 + connectBurst * 0.25);
    if (bloom) bloom.strength = 0.22 + connectBurst * 0.4;
  } else {
    rings.scale.setScalar(1);
    floatSquares.group.scale.setScalar(1);
  }

  introT = Math.min(1, introT + 0.02);
  const introEase = 1 - Math.pow(1 - introT, 3);
  const camX = 1.15 + pointer.x * 0.35;
  const camY = 1.55 + pointer.y * 0.2;
  const camZ = 9.1 - introEase * 0.7;
  camera.position.x += (camX - camera.position.x) * 0.08;
  camera.position.y += (camY - camera.position.y) * 0.08;
  camera.position.z += (camZ - camera.position.z) * 0.08;
  camera.lookAt(3.2, 0.05, 0);
}

function frame() {
  requestAnimationFrame(frame);
  if (!sceneActive) return;
  if (scrolling) {
    renderer.render(scene, camera);
    return;
  }
  const t = clock.getElapsedTime();
  animateHand(t);
  animateSensors(t);
  animateLandmarks(t);
  animateExtras(t);
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

loadSession();
refreshUi();
startLiveStatus();
frame();
loadHeroModel();
