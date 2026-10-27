
import { GameVision } from "./vision_game.js?v=26";

const $ = (sel) => document.querySelector(sel);

const els = {
  emuBadge: $("#emuBadge"),
  camBadge: $("#camBadge"),
  bezelLabel: $("#bezelLabel"),
  handDotLeft: $("#handDotLeft"),
  handDotRight: $("#handDotRight"),
  screenWrap: $("#screenWrap"),
  cabinetScreen: $("#cabinetScreen"),
  webEmu: $("#webEmu"),
  attractArt: $("#attractArt"),
  attractGlyph: $("#attractGlyph"),
  attractMeta: $("#attractMeta"),
  gameTitle: $("#gameTitle"),
  cabinetHint: $("#cabinetHint"),
  hudTime: $("#hudTime"),
  hudActions: $("#hudActions"),
  hudScoreChip: $("#hudScoreChip"),
  hudScore: $("#hudScore"),
  inputRibbon: $("#inputRibbon"),
  camCountdown: $("#camCountdown"),
  camCountdownNum: $("#camCountdownNum"),
  camCountdownCancel: $("#camCountdownCancel"),
  pauseVeil: $("#pauseVeil"),
  gestureFlash: $("#gestureFlash"),
  nowDot: $("#nowDot"),
  nowTitle: $("#nowTitle"),
  nowMeta: $("#nowMeta"),
  pauseBtn: $("#pauseBtn"),
  restartBtn: $("#restartBtn"),
  muteBtn: $("#muteBtn"),
  fullscreenBtn: $("#fullscreenBtn"),
  stopWebBtn: $("#stopWebBtn"),
  playWebBtn: $("#playWebBtn"),
  helpBtn: $("#helpBtn"),
  helpOverlay: $("#helpOverlay"),
  helpClose: $("#helpClose"),
  arcadePanel: $("#arcadePanel"),
  arcadeStatus: $("#arcadeStatus"),
  inputSource: $("#inputSource"),
  visionPip: $("#visionPip"),
  visionVideo: $("#visionVideo"),
  visionCanvas: $("#visionCanvas"),
  visionStatus: $("#visionStatus"),
  visionBtn: $("#visionBtn"),
  steer: $("#steer"),
  steerBack: $("#steerBack"),
  steerMid: $("#steerMid"),
  steerFwd: $("#steerFwd"),
  steerMarker: $("#steerMarker"),
  zoneInput: $("#zoneInput"),
  zoneOut: $("#zoneOut"),
  fireInput: $("#fireInput"),
  fireOut: $("#fireOut"),
  invertInput: $("#invertInput"),
  autoCamInput: $("#autoCamInput"),
  gameLibrary: $("#gameLibrary"),
  libraryCount: $("#libraryCount"),
  libraryNote: $("#libraryNote"),
  profileName: $("#profileName"),
  gestureGrid: $("#gestureGrid")
};

const PROFILES = {
  runGun: {
    name: "Run & gun",
    fireScale: 1,
    map: { shoot: "btn_A", jump: "btn_B", crouch: "abajo", aimUp: "arriba" },
    labels: { right: "Avanza", left: "Atrás", shoot: "Disparo ráfaga", jump: "Salto", crouch: "Agachar", aimUp: "Apuntar arriba" }
  },
  fighter: {
    name: "Pelea",
    fireScale: 1.6,
    map: { shoot: "btn_A", jump: "btn_B", crouch: "abajo", aimUp: "arriba" },
    labels: { right: "Avanza", left: "Cubrirse", shoot: "Puño (A)", jump: "Patada (B)", crouch: "Agacharse", aimUp: "Saltar" }
  },
  shmup: {
    name: "Naves",
    fireScale: 0.9,
    map: { shoot: "btn_A", jump: "btn_B", crouch: "abajo", aimUp: "arriba" },
    labels: { right: "Derecha", left: "Izquierda", shoot: "Disparo", jump: "Botón B", crouch: "Bajar nave", aimUp: "Subir nave" }
  },
  arcade2d: {
    name: "Demo 2D",
    fireScale: 0,
    map: { shoot: "btn_A", jump: "arriba", crouch: "abajo", aimUp: "btn_C" },
    labels: { right: "Avanza", left: "Atrás", shoot: "Disparo", jump: "Salto", crouch: "Agachar", aimUp: "Bomba" }
  }
};

const NEOGEO = "NEO GEO · MVS";
const GAMES = [
  { id: "mslug", rom: "mslug.zip", title: "Metal Slug", year: 1996, profile: "runGun", glyph: "MS", art: ["#f59e0b", "#7c2d12"], tested: true },
  { id: "mslug2", rom: "mslug2.zip", title: "Metal Slug 2", year: 1998, profile: "runGun", glyph: "MS2", art: ["#fb923c", "#7f1d1d"], tested: true },
  { id: "mslugx", rom: "mslugx.zip", title: "Metal Slug X", year: 1999, profile: "runGun", glyph: "MSX", art: ["#facc15", "#78350f"], tested: true },
  { id: "shocktro", rom: "shocktro.zip", title: "Shock Troopers", year: 1997, profile: "runGun", glyph: "ST", art: ["#84cc16", "#14532d"] },
  { id: "kof97", rom: "kof97.zip", title: "King of Fighters '97", year: 1997, profile: "fighter", glyph: "97", art: ["#ef4444", "#450a0a"] },
  { id: "kof98", rom: "kof98.zip", title: "King of Fighters '98", year: 1998, profile: "fighter", glyph: "98", art: ["#f43f5e", "#4c0519"] },
  { id: "samsho", rom: "samsho.zip", title: "Samurai Shodown", year: 1993, profile: "fighter", glyph: "侍", art: ["#a78bfa", "#2e1065"] },
  { id: "lastblad", rom: "lastblad.zip", title: "The Last Blade", year: 1997, profile: "fighter", glyph: "刃", art: ["#60a5fa", "#172554"] },
  { id: "pulstar", rom: "pulstar.zip", title: "Pulstar", year: 1995, profile: "shmup", glyph: "PS", art: ["#22d3ee", "#083344"] },
  { id: "demo2d", src: "./arcade2d.html", title: "NEXUM Arcade 2D", year: 2026, profile: "arcade2d", glyph: "N2D", art: ["#2dd4bf", "#042f2e"], system: "NEXUM · 2D", builtin: true }
];

const GESTURE_WEB_KEYS = {
  btn_A: { key: "a", code: "KeyA", keyCode: 65 },
  btn_B: { key: "s", code: "KeyS", keyCode: 83 },
  btn_C: { key: "d", code: "KeyD", keyCode: 68 },
  btn_D: { key: "f", code: "KeyF", keyCode: 70 },
  coin: { key: "5", code: "Digit5", keyCode: 53 },
  start: { key: "1", code: "Digit1", keyCode: 49 },
  arriba: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  abajo: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  izquierda: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  derecha: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 }
};

const INPUT_GLYPH = {
  derecha: "→", izquierda: "←", arriba: "↑", abajo: "↓",
  btn_A: "A", btn_B: "B", btn_C: "C", btn_D: "D", start: "START", coin: "¢"
};

const KEYBOARD = {
  ArrowUp: "arriba", ArrowDown: "abajo", ArrowLeft: "izquierda", ArrowRight: "derecha",
  KeyZ: "btn_A", KeyX: "btn_B", KeyC: "btn_C", KeyV: "btn_D"
};

const SETTINGS_KEY = "nexum_game_settings_v1";
const CAM_COUNTDOWN_S = 3;
const STATUS_TEXT = {
  loading: ["Juego: cargando", "warn", "Cargando…"],
  ready: ["Juego: listo", "ok", "Listo"],
  playing: ["Juego: jugando", "ok", "Jugando"],
  paused: ["Juego: en pausa", "warn", "En pausa"],
  error: ["Juego: error", "bad", "Error"],
  detenido: ["Juego: detenido", "", "Listo para jugar"]
};

const state = {
  game: GAMES[0],
  filter: "all",
  running: false,
  status: "detenido",
  paused: false,
  muted: false,
  vision: null,
  visionOn: false,
  visionShoot: false,
  visionHeld: new Set(),
  keyHeld: new Set(),
  pointerHeld: new Set(),
  held: new Set(),
  autoFireTimer: 0,
  tapTimer: 0,
  camTimer: 0,
  camLeft: 0,
  session: { start: 0, actions: 0, timer: 0 },
  lastSource: "",
  settings: { zone: 0.2, fireMs: 120, invert: false, autoCam: true, lastGame: "mslug" }
};

const profile = () => PROFILES[state.game.profile] || PROFILES.runGun;

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    Object.assign(state.settings, saved);
  } catch (_e) {  }
  state.game = GAMES.find((g) => g.id === state.settings.lastGame) || GAMES[0];
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (_e) {  }
}

function renderSettings() {
  const s = state.settings;
  els.zoneInput.value = Math.round(s.zone * 100);
  els.zoneOut.textContent = `${Math.round(s.zone * 100)}%`;
  els.fireInput.value = s.fireMs;
  els.fireOut.textContent = `${Math.round(1000 / s.fireMs)}/s`;
  els.invertInput.checked = Boolean(s.invert);
  els.autoCamInput.checked = Boolean(s.autoCam);
}

function setBadge(el, text, tone = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("status-ok", "status-warn", "status-bad");
  if (tone) el.classList.add(`status-${tone}`);
}

function setStatus(status) {
  state.status = status;
  const [badge, tone, meta] = STATUS_TEXT[status] || [`Juego: ${status}`, "warn", status];
  setBadge(els.emuBadge, badge, tone);
  if (els.nowMeta) els.nowMeta.textContent = state.running ? meta : `${profile().name} · ${state.game.year}`;
  els.nowDot?.setAttribute("data-status", state.running ? status : "detenido");
  const live = state.running && (status === "playing" || status === "paused" || status === "ready");
  [els.pauseBtn, els.restartBtn, els.muteBtn].forEach((b) => { if (b) b.disabled = !live; });
  if (els.stopWebBtn) els.stopWebBtn.disabled = !state.running;
  if (els.pauseVeil) els.pauseVeil.hidden = !(state.running && state.paused);
}

function setArcadeStatus(text, active = false) {
  if (els.arcadeStatus) els.arcadeStatus.textContent = text;
  els.arcadePanel?.classList.toggle("is-active", active);
  els.arcadePanel?.classList.toggle("is-idle", !active);
}

function setSource(src) {
  if (state.lastSource === src) return;
  state.lastSource = src;
  if (els.inputSource) els.inputSource.textContent = src;
}

function flash() {
  els.gestureFlash?.classList.add("is-on");
  window.setTimeout(() => els.gestureFlash?.classList.remove("is-on"), 110);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function artStyle(game) {
  return `--art-a:${game.art[0]};--art-b:${game.art[1]}`;
}

function renderLibrary() {
  const list = GAMES.filter((g) => state.filter === "all" || g.profile === state.filter || (state.filter === "runGun" && g.profile === "arcade2d"));
  els.gameLibrary.innerHTML = "";
  list.forEach((game) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "game-card";
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", String(game.id === state.game.id));
    card.classList.toggle("is-selected", game.id === state.game.id);
    card.classList.toggle("is-playing", state.running && game.id === state.game.id);
    card.dataset.id = game.id;
    card.innerHTML = `
      <span class="game-art" style="${artStyle(game)}"><b>${game.glyph}</b></span>
      <span class="game-info">
        <strong>${game.title}</strong>
        <small>${game.year} · ${PROFILES[game.profile].name}</small>
      </span>
      ${game.builtin ? '<em class="game-tag game-tag--builtin">Integrado</em>' : game.tested ? '<em class="game-tag">Probado</em>' : ""}
    `;
    card.addEventListener("click", () => selectGame(game.id));
    card.addEventListener("dblclick", () => {
      selectGame(game.id);
      startGame();
    });
    els.gameLibrary.appendChild(card);
  });
  if (els.libraryCount) els.libraryCount.textContent = `${list.length} de ${GAMES.length} juegos`;
}

function renderAttract() {
  const g = state.game;
  els.attractArt?.setAttribute("style", artStyle(g));
  if (els.attractGlyph) els.attractGlyph.textContent = g.glyph;
  if (els.attractMeta) els.attractMeta.textContent = `${g.system || "NEO GEO"} · ${g.year} · ${profile().name}`;
  if (els.gameTitle) els.gameTitle.textContent = g.title;
  if (els.bezelLabel) els.bezelLabel.textContent = g.system || NEOGEO;
  if (els.nowTitle && !state.running) els.nowTitle.textContent = g.title;
}

function selectGame(id) {
  const game = GAMES.find((g) => g.id === id);
  if (!game) return;
  const changed = game.id !== state.game.id;
  if (state.running && changed) {
    if (els.libraryNote) els.libraryNote.textContent = `${game.title} elegido — pulsa ▶ Jugar para cambiar de juego.`;
  }
  state.game = game;
  state.settings.lastGame = game.id;
  saveSettings();
  if (!state.running) {
    renderAttract();
    setStatus("detenido");
  }
  renderLibrary();
  renderGestureMap();
  renderSteerLabels();
  if (!state.running && els.libraryNote) {
    els.libraryNote.textContent = game.builtin
      ? "Juego integrado: carga al instante, sin ROM."
      : "Doble clic en un juego para empezar a jugar.";
  }
}

function renderGestureMap() {
  const p = profile();
  const inv = state.settings.invert;
  const cards = [
    { action: "right", hand: "Índice IZQ →", label: inv ? p.labels.left : p.labels.right, input: inv ? "izquierda" : "derecha", combo: true },
    { action: "left", hand: "Índice IZQ ←", label: inv ? p.labels.right : p.labels.left, input: inv ? "derecha" : "izquierda", combo: true },
    { action: "aimUp", hand: "Meñique IZQ", label: p.labels.aimUp, input: p.map.aimUp, combo: true },
    { action: "start", hand: "Puño IZQ", label: "Start", input: "start" },
    { action: "shoot", hand: "Abierta DER", label: p.labels.shoot, input: p.map.shoot },
    { action: "jump", hand: "Puño DER", label: p.labels.jump, input: p.map.jump },
    { action: "crouch", hand: "Índice DER ↓", label: p.labels.crouch, input: p.map.crouch, wide: true }
  ];
  els.gestureGrid.innerHTML = cards.map((c) => `
    <article class="gesture-card${c.combo ? " combo" : ""}${c.wide ? " wide" : ""}" data-action="${c.action}">
      <span class="gc-finger">${c.hand}</span>
      <strong>${c.label}</strong>
      <kbd>${INPUT_GLYPH[c.input] || ""}</kbd>
    </article>
  `).join("");
  if (els.profileName) els.profileName.textContent = p.name;
}

function highlightGestures(active) {
  els.gestureGrid.querySelectorAll(".gesture-card").forEach((card) => {
    card.classList.toggle("is-active", Boolean(active[card.dataset.action]));
  });
}

function postToGame(msg) {
  const frame = els.webEmu;
  if (!state.running || !frame?.contentWindow) return;
  frame.contentWindow.postMessage(msg, window.location.origin);
}

function sendInput(name, down) {
  const spec = GESTURE_WEB_KEYS[name];
  postToGame({ type: "nexum-key", gesture: name, down: Boolean(down), key: spec?.key, code: spec?.code, keyCode: spec?.keyCode });
}

function countAction(input) {
  if (!state.running) return;
  state.session.actions += 1;
  if (els.hudActions) els.hudActions.textContent = String(state.session.actions);
  pushRibbon(input);
}

function pushRibbon(input) {
  const ribbon = els.inputRibbon;
  if (!ribbon) return;
  const chip = document.createElement("span");
  const kind = input === "start" || input === "coin" ? "start" : input.startsWith("btn_") ? "btn" : "dir";
  chip.className = `rb-key rb-key--${kind}`;
  chip.textContent = INPUT_GLYPH[input] || input;
  ribbon.prepend(chip);
  while (ribbon.children.length > 10) ribbon.lastElementChild.remove();
  window.setTimeout(() => chip.remove(), 2600);
}

function renderPads() {
  document.querySelectorAll("[data-input]").forEach((n) => {
    n.classList.toggle("is-on", state.held.has(n.dataset.input));
  });
}

function syncHolds() {
  const next = new Set([...state.visionHeld, ...state.keyHeld, ...state.pointerHeld]);
  if (!state.running) {
    state.held = next;
    renderPads();
    return;
  }
  for (const name of state.held) {
    if (!next.has(name)) sendInput(name, false);
  }
  for (const name of next) {
    if (!state.held.has(name)) {
      sendInput(name, true);
      countAction(name);
    }
  }
  state.held = next;
  renderPads();
  syncAutoFire();
}

function releaseAll() {
  for (const name of state.held) sendInput(name, false);
  state.held = new Set();
  renderPads();
}

function syncAutoFire() {
  const p = profile();
  const input = p.map.shoot;
  const rate = Math.round(state.settings.fireMs * p.fireScale);
  const want = state.running && state.visionShoot && rate > 0 && state.held.has(input);
  if (!want) {
    window.clearTimeout(state.autoFireTimer);
    state.autoFireTimer = 0;
    return;
  }
  if (state.autoFireTimer) return;
  const pulse = () => {
    if (!state.visionShoot || !state.held.has(input) || !state.running) {
      state.autoFireTimer = 0;
      return;
    }
    sendInput(input, false);
    window.setTimeout(() => {
      if (state.visionShoot && state.held.has(input)) sendInput(input, true);
    }, 40);
    state.autoFireTimer = window.setTimeout(pulse, rate);
  };
  state.autoFireTimer = window.setTimeout(pulse, rate);
}

function pressStart() {
  if (!state.running) return;
  window.clearTimeout(state.tapTimer);
  sendInput("coin", true);
  state.tapTimer = window.setTimeout(() => {
    sendInput("coin", false);
    sendInput("start", true);
    state.tapTimer = window.setTimeout(() => sendInput("start", false), 140);
  }, 50);
  countAction("start");
  const btn = document.querySelector('.face-btns [data-input="start"]');
  btn?.classList.add("is-on");
  window.setTimeout(() => btn?.classList.remove("is-on"), 180);
  flash();
}

function tapCoin() {
  if (!state.running) return;
  sendInput("coin", true);
  window.setTimeout(() => sendInput("coin", false), 90);
  countAction("coin");
}

function startSessionClock() {
  window.clearInterval(state.session.timer);
  state.session.start = performance.now();
  state.session.actions = 0;
  if (els.hudActions) els.hudActions.textContent = "0";
  if (els.hudTime) els.hudTime.textContent = "00:00";
  state.session.timer = window.setInterval(() => {
    if (state.paused) return;
    if (els.hudTime) els.hudTime.textContent = formatTime(performance.now() - state.session.start);
  }, 500);
}

function startGame() {
  const game = state.game;
  if (state.running) stopGame({ silent: true });
  if (state.visionOn) stopVision();
  renderAttract();
  state.running = true;
  state.paused = false;
  state.muted = false;
  state.session.start = 0;
  els.cabinetScreen.classList.add("is-web");
  els.webEmu.hidden = false;
  els.webEmu.src = game.src || `./emulator.html?v=16&rom=${encodeURIComponent(game.rom)}`;
  els.playWebBtn?.classList.add("active");
  if (els.playWebBtn) els.playWebBtn.textContent = "↻ Reiniciar juego";
  if (els.nowTitle) els.nowTitle.textContent = game.title;
  if (els.hudScoreChip) els.hudScoreChip.hidden = true;
  if (els.muteBtn) els.muteBtn.querySelector("span").textContent = "🔊";
  els.inputRibbon.innerHTML = "";
  if (els.libraryNote) els.libraryNote.textContent = "Doble clic en un juego para empezar a jugar.";
  setStatus("loading");
  setArcadeStatus("Cargando…", false);
  renderLibrary();
}

function stopGame({ silent = false } = {}) {
  window.clearTimeout(state.tapTimer);
  cancelCamCountdown();
  releaseAll();
  state.visionShoot = false;
  syncAutoFire();
  state.running = false;
  state.paused = false;
  window.clearInterval(state.session.timer);
  if (els.webEmu) {
    els.webEmu.hidden = true;
    els.webEmu.removeAttribute("src");
  }
  els.cabinetScreen?.classList.remove("is-web");
  els.playWebBtn?.classList.remove("active");
  if (els.playWebBtn) els.playWebBtn.textContent = "▶ Jugar";
  if (document.fullscreenElement) document.exitFullscreen?.();
  state.vision?.setPerfMode?.(false);
  if (silent) return;
  renderAttract();
  setStatus("detenido");
  setArcadeStatus(state.visionOn ? "Manos listas" : "En espera", false);
  renderLibrary();
}

function gameCommand(cmd) {
  if (!state.running) return;
  postToGame({ type: "nexum-cmd", cmd });
  if (cmd === "restart") {
    startSessionClock();
    flash();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else els.screenWrap?.requestFullscreen?.().catch(() => {});
}

function onVisionTrack(t) {
  els.handDotLeft?.classList.toggle("is-on", t.left);
  els.handDotRight?.classList.toggle("is-on", t.right);
  const zl = t.zoneLeft * 100;
  const zr = t.zoneRight * 100;
  els.steerBack.style.width = `${zl}%`;
  els.steerMid.style.left = `${zl}%`;
  els.steerMid.style.width = `${zr - zl}%`;
  els.steerFwd.style.width = `${100 - zr}%`;
  els.steer.classList.toggle("has-hand", t.tipX != null);
  if (t.tipX != null) els.steerMarker.style.left = `${(t.tipX * 100).toFixed(1)}%`;
  els.steerBack.classList.toggle("is-on", t.dirX < 0);
  els.steerFwd.classList.toggle("is-on", t.dirX > 0);
  els.steerMid.classList.toggle("is-on", t.tipX != null && t.dirX === 0);
}

function renderSteerLabels() {
  const p = profile();
  const inv = state.settings.invert;
  els.steerBack.textContent = `← ${inv ? p.labels.right : p.labels.left}`;
  els.steerFwd.textContent = `${inv ? p.labels.left : p.labels.right} →`;
}

function onVisionUpdate(payload) {
  const p = profile();
  let dir = payload.dir_x || 0;
  if (state.settings.invert) dir = -dir;
  const held = new Set();
  if (dir > 0) held.add("derecha");
  else if (dir < 0) held.add("izquierda");
  if (payload.shoot) held.add(p.map.shoot);
  if (payload.jump) held.add(p.map.jump);
  if (payload.crouch) held.add(p.map.crouch);
  if (payload.aimUp) held.add(p.map.aimUp);
  state.visionShoot = Boolean(payload.shoot);
  state.visionHeld = held;
  if (held.size || payload.fistPulse) setSource("Cámara");
  if (payload.fistPulse) pressStart();
  syncHolds();

  highlightGestures({
    right: payload.dir_x > 0,
    left: payload.dir_x < 0,
    aimUp: payload.aimUp,
    start: payload.fistPulse,
    shoot: payload.shoot,
    jump: payload.jump,
    crouch: payload.crouch
  });
  if (payload.fistPulse) {
    const card = els.gestureGrid.querySelector('[data-action="start"]');
    window.setTimeout(() => card?.classList.remove("is-active"), 220);
  }

  if (els.visionStatus && payload.label) els.visionStatus.textContent = payload.label;
  const active = held.size > 0 || payload.fistPulse;
  setArcadeStatus(active ? payload.label : state.running ? "Jugando · manos listas" : "Manos listas", active);
}

async function startVision() {
  if (state.visionOn) return true;
  if (!els.visionVideo || !els.visionCanvas) return false;
  cancelCamCountdown();
  if (els.visionBtn) {
    els.visionBtn.disabled = true;
    els.visionBtn.textContent = "Encendiendo…";
  }
  try {
    setBadge(els.camBadge, "Cámara: cargando", "warn");
    state.vision = new GameVision({
      video: els.visionVideo,
      canvas: els.visionCanvas,
      zoneWidth: state.settings.zone,
      onUpdate: onVisionUpdate,
      onTrack: onVisionTrack,
      onStatus: (t) => {
        if (els.visionStatus) els.visionStatus.textContent = t;
      }
    });
    await state.vision.start();
    state.vision.setPerfMode(state.running);
    state.visionOn = true;
    els.visionPip?.classList.add("is-live");
    els.visionBtn?.classList.remove("primary");
    els.visionBtn?.classList.add("ghost");
    setBadge(els.camBadge, "Cámara: activa", "ok");
    return true;
  } catch (err) {
    state.vision = null;
    state.visionOn = false;
    setBadge(els.camBadge, "Cámara: error", "bad");
    if (els.visionStatus) els.visionStatus.textContent = err?.message || String(err);
    return false;
  } finally {
    if (els.visionBtn) {
      els.visionBtn.disabled = false;
      els.visionBtn.textContent = state.visionOn ? "Apagar cámara" : "Activar cámara";
    }
  }
}

function stopVision() {
  state.vision?.stop();
  state.vision = null;
  state.visionOn = false;
  state.visionShoot = false;
  state.visionHeld = new Set();
  syncHolds();
  els.visionPip?.classList.remove("is-live");
  els.visionBtn?.classList.add("primary");
  els.visionBtn?.classList.remove("ghost");
  if (els.visionBtn) els.visionBtn.textContent = "Activar cámara";
  setBadge(els.camBadge, "Cámara: apagada", "");
  if (els.visionStatus) els.visionStatus.textContent = "Cámara apagada";
  els.handDotLeft?.classList.remove("is-on");
  els.handDotRight?.classList.remove("is-on");
  els.steer?.classList.remove("has-hand");
  highlightGestures({});
  setArcadeStatus(state.running ? "Jugando" : "En espera", false);
}

function cancelCamCountdown() {
  window.clearInterval(state.camTimer);
  state.camTimer = 0;
  if (els.camCountdown) els.camCountdown.hidden = true;
}

function scheduleCamera() {
  if (state.visionOn || state.camTimer || !state.settings.autoCam) return;
  state.camLeft = CAM_COUNTDOWN_S;
  if (els.camCountdownNum) els.camCountdownNum.textContent = String(state.camLeft);
  if (els.camCountdown) els.camCountdown.hidden = false;
  state.camTimer = window.setInterval(() => {
    state.camLeft -= 1;
    if (state.camLeft <= 0) {
      cancelCamCountdown();
      if (state.running) startVision();
      return;
    }
    if (els.camCountdownNum) els.camCountdownNum.textContent = String(state.camLeft);
  }, 1000);
}

function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Escape" && !els.helpOverlay.hidden) {
    els.helpOverlay.hidden = true;
    return;
  }
  if (isTypingTarget(event.target)) return;
  const input = KEYBOARD[event.code];
  if (input) {
    event.preventDefault();
    if (!state.running || event.repeat) return;
    setSource("Teclado");
    state.keyHeld.add(input);
    syncHolds();
    return;
  }
  if (event.code === "Enter" || event.code === "NumpadEnter") {
    event.preventDefault();
    if (event.repeat) return;
    if (!state.running) startGame();
    else {
      setSource("Teclado");
      pressStart();
    }
  } else if (event.code === "Digit5") {
    setSource("Teclado");
    tapCoin();
  } else if (event.code === "Space" && state.running) {
    event.preventDefault();
    gameCommand("pause");
  } else if (event.code === "KeyM") {
    gameCommand("mute");
  } else if (event.code === "KeyF") {
    toggleFullscreen();
  } else if (event.key === "?" || event.code === "KeyH") {
    els.helpOverlay.hidden = !els.helpOverlay.hidden;
  }
}

function onKeyUp(event) {
  const input = KEYBOARD[event.code];
  if (!input || !state.keyHeld.has(input)) return;
  state.keyHeld.delete(input);
  syncHolds();
}

function wireDeck() {
  document.querySelectorAll("#arcadePanel [data-input]").forEach((btn) => {
    const input = btn.dataset.input;
    const release = () => {
      if (!state.pointerHeld.delete(input)) return;
      syncHolds();
    };
    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!state.running) {
        if (els.cabinetHint) els.cabinetHint.textContent = "Primero pulsa ▶ Jugar para cargar el juego.";
        els.playWebBtn?.classList.add("nudge");
        window.setTimeout(() => els.playWebBtn?.classList.remove("nudge"), 600);
        return;
      }
      setSource("Mouse");
      if (input === "start") {
        pressStart();
        return;
      }
      btn.setPointerCapture?.(event.pointerId);
      state.pointerHeld.add(input);
      syncHolds();
    });
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  });
}

function wireUi() {
  els.playWebBtn?.addEventListener("click", startGame);
  els.stopWebBtn?.addEventListener("click", () => stopGame());
  els.pauseBtn?.addEventListener("click", () => gameCommand("pause"));
  els.restartBtn?.addEventListener("click", () => gameCommand("restart"));
  els.muteBtn?.addEventListener("click", () => gameCommand("mute"));
  els.fullscreenBtn?.addEventListener("click", toggleFullscreen);
  els.helpBtn?.addEventListener("click", () => { els.helpOverlay.hidden = false; });
  els.helpClose?.addEventListener("click", () => { els.helpOverlay.hidden = true; });
  els.helpOverlay?.addEventListener("click", (e) => {
    if (e.target === els.helpOverlay) els.helpOverlay.hidden = true;
  });
  els.camCountdownCancel?.addEventListener("click", cancelCamCountdown);

  els.visionBtn?.addEventListener("click", async () => {
    if (state.visionOn) stopVision();
    else await startVision();
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderLibrary();
    });
  });

  els.zoneInput?.addEventListener("input", () => {
    state.settings.zone = Number(els.zoneInput.value) / 100;
    els.zoneOut.textContent = `${els.zoneInput.value}%`;
    state.vision?.setZone(state.settings.zone);
    saveSettings();
  });
  els.fireInput?.addEventListener("input", () => {
    state.settings.fireMs = Number(els.fireInput.value);
    els.fireOut.textContent = `${Math.round(1000 / state.settings.fireMs)}/s`;
    saveSettings();
  });
  els.invertInput?.addEventListener("change", () => {
    state.settings.invert = els.invertInput.checked;
    saveSettings();
    renderGestureMap();
    renderSteerLabels();
  });
  els.autoCamInput?.addEventListener("change", () => {
    state.settings.autoCam = els.autoCamInput.checked;
    saveSettings();
    if (!state.settings.autoCam) cancelCamCountdown();
  });

  document.addEventListener("fullscreenchange", () => {
    const on = Boolean(document.fullscreenElement);
    els.fullscreenBtn?.classList.toggle("active", on);
    els.fullscreenBtn.querySelector("em").textContent = on ? "Salir" : "Completa";
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => {
    if (!state.keyHeld.size) return;
    state.keyHeld.clear();
    syncHolds();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || !state.running) return;
    if (msg.type === "nexum-emu") {
      if (msg.status === "playing") {
        if (!state.session.start) startSessionClock();
        state.vision?.setPerfMode?.(true);
        if (els.cabinetHint) els.cabinetHint.textContent = "Jugando — usa las 2 manos o el teclado.";
        setArcadeStatus(state.visionOn ? "Jugando · manos listas" : "Jugando", false);
        scheduleCamera();
      }
      if (msg.status === "error" && els.nowMeta) {
        setStatus("error");
        els.nowMeta.textContent = msg.message || "Error del emulador";
        return;
      }
      setStatus(msg.status || state.status);
    } else if (msg.type === "nexum-emu-state") {
      state.paused = Boolean(msg.paused);
      state.muted = Boolean(msg.muted);
      if (els.muteBtn) els.muteBtn.querySelector("span").textContent = state.muted ? "🔇" : "🔊";
      els.muteBtn?.classList.toggle("active", state.muted);
      els.pauseBtn?.classList.toggle("active", state.paused);
      if (els.pauseBtn) els.pauseBtn.querySelector("em").textContent = state.paused ? "Seguir" : "Pausa";
      if (state.paused) releaseAll();
      setStatus(state.paused ? "paused" : "playing");
    } else if (msg.type === "nexum-score") {
      if (els.hudScoreChip) els.hudScoreChip.hidden = false;
      if (els.hudScore) els.hudScore.textContent = String(msg.score).padStart(6, "0");
      if (els.nowMeta && !state.paused) {
        els.nowMeta.textContent = msg.over ? "Game over · START para seguir" : `Jugando · vidas ${msg.lives}`;
      }
    }
  });
}

loadSettings();
renderSettings();
renderLibrary();
renderAttract();
renderGestureMap();
renderSteerLabels();
wireDeck();
wireUi();
setStatus("detenido");
setBadge(els.camBadge, "Cámara: apagada", "");
setArcadeStatus("En espera", false);
