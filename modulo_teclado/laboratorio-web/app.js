import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CursorVision } from "./vision_cursor.js?v=vmmem1";

const MODEL_URL = new URL("../modelo3D-brazo/source/rigged hand.fbx", import.meta.url).href;
const TEXTURE_URL = new URL("../modelo3D-brazo/textures/pCube1_albedo.jpg", import.meta.url).href;
const NORMAL_URL = new URL("../modelo3D-brazo/textures/pCube1_normal.png", import.meta.url).href;
const ROUGHNESS_URL = new URL("../modelo3D-brazo/textures/pCube1_roughness.jpg", import.meta.url).href;
const METALLIC_URL = new URL("../modelo3D-brazo/textures/pCube1_metallic.jpg", import.meta.url).href;
const AO_URL = new URL("../modelo3D-brazo/textures/pCube1_AO.jpg", import.meta.url).href;
const PLATFORM_TOP_Y = -44;
const PLATFORM_CENTER = new THREE.Vector3(0, PLATFORM_TOP_Y, 0);
const REST_POSE = {
  thumb: { base: 0, mid: 0, tip: 0, spread: 24 },
  index: { base: 2, mid: 1, tip: 0, spread: 10 },
  middle: { base: 1, mid: 1, tip: 0, spread: 1 },
  ring: { base: 2, mid: 1, tip: 0, spread: -8 },
  pinky: { base: 3, mid: 1, tip: 0, spread: -18 }
};
const ACTIVE_LIFT = {
  thumb: { base: 22, mid: 10, tip: 4 },
  index: { base: 48, mid: 22, tip: 10 },
  middle: { base: 50, mid: 22, tip: 10 },
  ring: { base: 46, mid: 20, tip: 9 },
  pinky: { base: 42, mid: 18, tip: 8 }
};
const REAL_ROTATION_AXIS = {
  pulgar: -1,
  indice: -1,
  medio: -1,
  anular: -1,
  menique: -1
};

const fingers = [
  { id: "thumb", label: "Pulgar", key: "pulgar" },
  { id: "index", label: "Índice", key: "indice" },
  { id: "middle", label: "Medio", key: "medio" },
  { id: "ring", label: "Anular", key: "anular" },
  { id: "pinky", label: "Meñique", key: "menique" }
];

const realFingerBones = {
  pulgar: ["thumb", "thumbjoint", "joint6"],
  indice: ["inderxfinger", "indermiddle", "indertop"],
  medio: ["middlefinger", "middlemiddle", "middletop"],
  anular: ["ringvinger", "ringmiddle", "ringtop"],
  menique: ["pinkyfinger", "pinkymiddle", "pinkytop"]
};

const letterMap = {
  pulgar: ["a", "b", "c", "d", "e", "f"],
  indice: ["g", "h", "i", "j", "k", "l"],
  medio: ["m", "n", "ñ", "o", "p"],
  anular: ["q", "r", "s", "t", "u"],
  menique: ["v", "w", "x", "y", "z"]
};
letterMap.medio = ["m", "n", "\u00f1", "o", "p"];

const numberMap = {
  pulgar: ["1", "2", "+"],
  indice: ["3", "4", "-"],
  medio: ["5", "6", "*"],
  anular: ["7", "8", "/"],
  menique: ["9", "0", ".", ";"]
};

const DEFAULT_CONFIRM_MS = 2500;

function mapForMode(mode = state.mode) {
  if (mode === "numbers") return numberMap;
  if (mode === "letters") return letterMap;
  return null;
}

const state = {
  hand: "r",
  view: "r",
  mode: "letters",
  labEnabled: false,
  model: null,
  realModelReady: false,
  fallbackActive: false,
  skeletonHelper: null,
  labHands: {},
  bones: new Map(),
  serialPort: null,
  serialReader: null,
  ws: null,
  wsGen: 0,
  wsReconnectTimer: null,
  wsManualClose: false,
  fingerValues: {
    r: makeRestPose(),
    l: makeRestPose()
  },
  cursorVision: null,
  cursorVisionStarting: false,
  cursorVisionWanted: false,
  gloveIp: null,
  link: { bridge: false, glove: false, calib: false, live: false },
  fingerTaps: {},
  composerTimer: null,
  demoRun: 0,
  resetSentAt: -Infinity,
  visionOwner: null,
  visionYielded: false,
  visionRetryTimer: null
};

const els = {
  sceneHost: document.querySelector("#sceneHost"),
  modelStatus: document.querySelector("#modelStatus"),
  loadBadge: document.querySelector("#loadBadge"),
  serialBadge: document.querySelector("#serialBadge"),
  modeBadge: document.querySelector("#modeBadge"),
  visionBadge: document.querySelector("#visionBadge"),
  visionPip: document.querySelector("#visionPip"),
  visionVideo: document.querySelector("#visionVideo"),
  visionCanvas: document.querySelector("#visionCanvas"),
  visionStatus: document.querySelector("#visionStatus"),
  visionHint: document.querySelector("#visionHint"),
  lastEvent: document.querySelector("#lastEvent"),
  boneSummary: document.querySelector("#boneSummary"),
  boneReport: document.querySelector("#boneReport"),
  fingerControls: document.querySelector("#fingerControls"),
  keyboard: document.querySelector("#keyboard"),
  textOutput: document.querySelector("#textOutput"),
  handButtons: [...document.querySelectorAll(".hand-opt")],
  fingerMap: document.querySelector("#fingerMap"),
  linkSteps: document.querySelector("#linkSteps"),
  composer: document.querySelector("#composer"),
  composerKey: document.querySelector("#composerKey"),
  composerFinger: document.querySelector("#composerFinger"),
  composerOptions: document.querySelector("#composerOptions"),
  composerHint: document.querySelector("#composerHint"),
  textStats: document.querySelector("#textStats"),
  copyTextBtn: document.querySelector("#copyTextBtn"),
  backspaceBtn: document.querySelector("#backspaceBtn"),
  clearTextBtn: document.querySelector("#clearTextBtn"),
  wsUrl: document.querySelector("#wsUrl"),
  calibrateBtn: document.querySelector("#calibrateBtn"),
  startLabBtn: document.querySelector("#startLabBtn"),
  pauseLabBtn: document.querySelector("#pauseLabBtn"),
  connectWsBtn: document.querySelector("#connectWsBtn"),
  calibrationFill: document.querySelector("#calibrationFill"),
  calibrationLabel: document.querySelector("#calibrationLabel"),
  hudFps: document.querySelector("#hudFps"),
  fingerLive: document.querySelector("#fingerLive")
};

function setBadge(el, text, status = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("status-ok", "status-warn", "status-bad", "status-info");
  if (status) el.classList.add(`status-${status}`);
}

function applyGlovesPayload(msg) {
  if (!msg || !Array.isArray(msg.gloves)) return;
  const glove = msg.gloves[0];
  state.gloveIp = glove?.ip || null;
  if (state.gloveIp) setBadge(els.serialBadge, `ESP32: ${state.gloveIp}`, "ok");
  setLink({ glove: Boolean(state.gloveIp) });
  if (glove && typeof glove.cal_percent === "number" && msg.type === "gloves") {
    setCalibration(glove.cal_percent);
  }
}

function setLink(patch) {
  Object.assign(state.link, patch);
  if (!state.link.bridge) Object.assign(state.link, { glove: false, live: false });
  if (!els.linkSteps) return;
  let currentMarked = false;
  els.linkSteps.querySelectorAll("li").forEach((li) => {
    const done = Boolean(state.link[li.dataset.step]);
    li.classList.toggle("is-done", done);
    const current = !done && !currentMarked;
    li.classList.toggle("is-current", current);
    if (current) currentMarked = true;
  });
}

function fingerLabel(key) {
  return fingers.find((item) => item.key === key)?.label || key;
}

function displayKey(key) {
  const names = { space: "␣", enter: "⏎", backspace: "⌫", clear: "⌫" };
  return names[key] || key;
}

function setPendingKey(key) {
  els.keyboard?.querySelectorAll(".key-pending").forEach((btn) => btn.classList.remove("key-pending"));
  if (!key) return;
  const btn = els.keyboard?.querySelector(`button[data-key="${CSS.escape(String(key).toLowerCase())}"]`);
  btn?.classList.add("key-pending");
}

function hideComposer() {
  window.clearTimeout(state.composerTimer);
  state.composerTimer = null;
  if (els.composer) els.composer.hidden = true;
  setPendingKey(null);
}

function showComposer(msg) {
  const map = mapForMode(msg.mode || state.mode);
  const options = map?.[msg.finger] || [];
  if (!els.composer || !options.length || !msg.key) {
    hideComposer();
    return;
  }
  const ms = Number(msg.confirm_ms) || DEFAULT_CONFIRM_MS;
  const composer = els.composer;
  composer.hidden = false;
  composer.dataset.finger = msg.finger;
  composer.style.setProperty("--confirm-ms", `${ms}ms`);
  composer.classList.remove("is-confirmed", "is-counting");
  void composer.offsetWidth;
  composer.classList.add("is-counting");
  els.composerKey.textContent = msg.key;
  els.composerFinger.textContent = `${fingerLabel(msg.finger)} · toque ${msg.count}`;
  els.composerOptions.innerHTML = options
    .map((opt) => `<span class="${opt === msg.key ? "is-on" : ""}">${opt}</span>`)
    .join("");
  els.composerHint.textContent = `Se confirma en ${(ms / 1000).toFixed(1)} s · levanta otra vez para avanzar`;
  setPendingKey(msg.key);
  window.clearTimeout(state.composerTimer);
  state.composerTimer = window.setTimeout(hideComposer, ms + 1500);
}

function confirmComposer(key) {
  if (!els.composer || els.composer.hidden) return;
  els.composer.classList.remove("is-counting");
  els.composer.classList.add("is-confirmed");
  els.composerKey.textContent = displayKey(key);
  els.composerHint.textContent = "Confirmado";
  setPendingKey(null);
  window.clearTimeout(state.composerTimer);
  state.composerTimer = window.setTimeout(hideComposer, 750);
}

function renderFingerMap() {
  if (!els.fingerMap) return;
  const map = mapForMode();
  els.fingerMap.innerHTML = fingers.map((finger) => {
    const chars = map ? map[finger.key] || [] : [];
    const range = map ? chars.join(" ") : "camara";
    const taps = state.fingerTaps[finger.key] || 0;
    return `
      <div class="finger-chip-row" data-finger="${finger.key}">
        <i class="finger-dot" aria-hidden="true"></i>
        <strong>${finger.label}</strong>
        <span class="finger-range">${range}</span>
        <span class="finger-taps" title="Toques en esta sesion">${taps}</span>
      </div>
    `;
  }).join("");
}

function updateTextStats() {
  if (!els.textStats) return;
  const text = els.textOutput.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  els.textStats.textContent = `${text.length} caracteres · ${words} palabra${words === 1 ? "" : "s"}`;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d0b);
scene.fog = new THREE.FogExp2(0x080d0b, 0.00185);

const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 2000);
camera.position.set(28, 125, 195);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
els.sceneHost.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.55, 0.82);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 80;
controls.maxDistance = 380;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, PLATFORM_TOP_Y + 32, 8);
controls.autoRotate = false;
controls.autoRotateSpeed = 0.35;

const hemi = new THREE.HemisphereLight(0xe8fff6, 0x121a16, 0.55);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff1e4, 2.35);
keyLight.position.set(95, 170, 95);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 20;
keyLight.shadow.camera.far = 480;
keyLight.shadow.camera.left = -170;
keyLight.shadow.camera.right = 170;
keyLight.shadow.camera.top = 170;
keyLight.shadow.camera.bottom = -170;
keyLight.shadow.bias = -0.0002;
keyLight.shadow.normalBias = 0.035;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7ec8b4, 0.7);
fillLight.position.set(-140, 90, 50);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xff9a5c, 0.65);
rimLight.position.set(30, 60, -160);
scene.add(rimLight);

const accentSpot = new THREE.SpotLight(0x0d8f7d, 28, 420, 0.42, 0.55, 1.15);
accentSpot.position.set(-40, 190, 40);
accentSpot.target.position.set(0, PLATFORM_TOP_Y + 20, 0);
accentSpot.castShadow = false;
scene.add(accentSpot);
scene.add(accentSpot.target);

const warmPoint = new THREE.PointLight(0xc45c1a, 18, 260, 2);
warmPoint.position.set(70, PLATFORM_TOP_Y + 55, 40);
scene.add(warmPoint);

const tableGroup = createTableAndPlatform();
scene.add(tableGroup);

const labHandsGroup = createLabHands();
scene.add(labHandsGroup);

const fxGroup = createSceneFx();
scene.add(fxGroup);

const skeletonHelperGroup = new THREE.Group();
scene.add(skeletonHelperGroup);
updateLabHandVisibility();

const cameraFocus = {
  active: false,
  posFrom: new THREE.Vector3(),
  posTo: new THREE.Vector3(),
  targetFrom: new THREE.Vector3(),
  targetTo: new THREE.Vector3(),
  t: 0
};

const sceneMotion = {
  clock: new THREE.Clock(),
  modelBaseY: 0,
  modelBaseRotY: 0,
  idleEnabled: true
};

let fpsFrames = 0;
let fpsLast = performance.now();

function resize() {
  const rect = els.sceneHost.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

function animate() {
  const now = performance.now();
  const t = sceneMotion.clock.getElapsedTime();
  fpsFrames += 1;
  if (now - fpsLast >= 500) {
    const fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
    if (els.hudFps) els.hudFps.textContent = `${fps} fps`;
    fpsFrames = 0;
    fpsLast = now;
  }

  if (cameraFocus.active) {
    cameraFocus.t = Math.min(1, cameraFocus.t + 0.045);
    const k = 1 - Math.pow(1 - cameraFocus.t, 3);
    camera.position.lerpVectors(cameraFocus.posFrom, cameraFocus.posTo, k);
    controls.target.lerpVectors(cameraFocus.targetFrom, cameraFocus.targetTo, k);
    if (cameraFocus.t >= 1) cameraFocus.active = false;
  }

  if (state.model && sceneMotion.idleEnabled && !cameraFocus.active) {
    state.model.position.y = sceneMotion.modelBaseY + Math.sin(t * 0.85) * 1.15;
    state.model.rotation.y = sceneMotion.modelBaseRotY + Math.sin(t * 0.22) * 0.035;
  }

  if (fxGroup?.userData?.tick) fxGroup.userData.tick(t);

  warmPoint.intensity = 14 + Math.sin(t * 1.4) * 4;
  accentSpot.intensity = 24 + Math.sin(t * 1.1) * 5;

  controls.update();
  composer.render();
  requestAnimationFrame(animate);
}
animate();

function cleanBoneName(name) {
  return name.replace(/\u0000.*$/, "").replace(/^Model::/, "");
}

function normalizeBoneName(name) {
  return cleanBoneName(name).toLowerCase();
}

function makeRestPose() {
  return Object.fromEntries(
    fingers.map((finger) => [finger.id, { ...REST_POSE[finger.id] }])
  );
}

function registerBones(root) {
  state.bones.clear();
  root.traverse((obj) => {
    if (obj.isBone) {
      state.bones.set(normalizeBoneName(obj.name), obj);
    }
  });
}

function boneName(fingerId, segment, side = state.hand) {
  return `${fingerId}_${String(segment).padStart(2, "0")}_${side}`;
}

function getBone(fingerId, segment, side = state.hand) {
  return state.bones.get(boneName(fingerId, segment, side));
}

function getRigNode(name) {
  return state.bones.get(name);
}

function createTableAndPlatform() {
  const group = new THREE.Group();

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x070b09,
    roughness: 0.98,
    metalness: 0.02
  });
  const pedestalMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c2621,
    roughness: 0.42,
    metalness: 0.35,
    clearcoat: 0.55,
    clearcoatRoughness: 0.35
  });
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f3d35,
    roughness: 0.35,
    metalness: 0.45,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    emissive: 0x062822,
    emissiveIntensity: 0.25
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x0d8f7d,
    emissive: 0x0d8f7d,
    emissiveIntensity: 0.65,
    roughness: 0.3,
    metalness: 0.55
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xc45c1a,
    emissive: 0x3a1808,
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.5
  });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(320, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = PLATFORM_TOP_Y - 34;
  floor.receiveShadow = true;
  group.add(floor);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(118, 132, 18, 64), pedestalMat);
  base.position.set(0, PLATFORM_TOP_Y - 18, 0);
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  const mid = new THREE.Mesh(new THREE.CylinderGeometry(102, 110, 10, 64), pedestalMat);
  mid.position.set(0, PLATFORM_TOP_Y - 6, 0);
  mid.receiveShadow = true;
  mid.castShadow = true;
  group.add(mid);

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(92, 92, 3.2, 64), plateMat);
  plate.position.set(0, PLATFORM_TOP_Y + 1.2, 0);
  plate.receiveShadow = true;
  plate.castShadow = true;
  group.add(plate);

  const contactGeo = new THREE.CircleGeometry(38, 48);
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
  });
  const contact = new THREE.Mesh(contactGeo, contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(-10, PLATFORM_TOP_Y + 3.05, -4);
  group.add(contact);

  const glowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(70, 64),
    new THREE.MeshBasicMaterial({
      color: 0x0d8f7d,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.set(0, PLATFORM_TOP_Y + 2.95, 0);
  group.add(glowDisc);
  group.userData.glowDisc = glowDisc;

  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(88, 1.15, 16, 96), ringMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.set(0, PLATFORM_TOP_Y + 3.1, 0);
  group.add(glowRing);
  group.userData.glowRing = glowRing;

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(104, 0.55, 12, 96), copperMat);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.set(0, PLATFORM_TOP_Y + 2.4, 0);
  group.add(outerRing);

  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 8), ringMat);
    tick.position.set(Math.cos(a) * 80, PLATFORM_TOP_Y + 3.0, Math.sin(a) * 80);
    tick.rotation.y = -a;
    group.add(tick);
  }

  return group;
}

function createSceneFx() {
  const group = new THREE.Group();

  const orbitA = new THREE.Mesh(
    new THREE.TorusGeometry(145, 0.55, 10, 120),
    new THREE.MeshBasicMaterial({ color: 0x0d8f7d, transparent: true, opacity: 0.22 })
  );
  orbitA.rotation.x = Math.PI / 2.4;
  orbitA.position.y = PLATFORM_TOP_Y + 48;
  group.add(orbitA);

  const orbitB = new THREE.Mesh(
    new THREE.TorusGeometry(168, 0.4, 10, 120),
    new THREE.MeshBasicMaterial({ color: 0xc45c1a, transparent: true, opacity: 0.14 })
  );
  orbitB.rotation.x = Math.PI / 2.1;
  orbitB.rotation.z = 0.4;
  orbitB.position.y = PLATFORM_TOP_Y + 42;
  group.add(orbitB);

  const count = 180;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 90 + Math.random() * 140;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = PLATFORM_TOP_Y + 10 + Math.random() * 120;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0x7ec8b4,
      size: 1.35,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  group.add(points);

  group.userData.tick = (t) => {
    orbitA.rotation.z = t * 0.12;
    orbitB.rotation.z = -t * 0.08;
    points.rotation.y = t * 0.05;
    if (tableGroup?.userData?.glowRing) {
      tableGroup.userData.glowRing.material.emissiveIntensity = 0.45 + Math.sin(t * 2.2) * 0.25;
    }
    if (tableGroup?.userData?.glowDisc) {
      tableGroup.userData.glowDisc.material.opacity = 0.06 + Math.sin(t * 1.6) * 0.035;
    }
  };

  return group;
}

function createLabHands() {
  const group = new THREE.Group();
  state.labHands = {};

  for (const side of ["l", "r"]) {
    const hand = createLabHand(side);
    state.labHands[side] = hand.userData.lab;
    group.add(hand);
  }

  updateLabHandVisibility();
  return group;
}

function createLabHand(side) {
  const sideSign = side === "r" ? 1 : -1;
  const group = new THREE.Group();
  group.name = `lab_hand_${side}`;

  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xb87660,
    roughness: 0.48,
    metalness: 0.04,
    clearcoat: 0.22,
    clearcoatRoughness: 0.5,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xe8b89a)
  });
  const skinDark = new THREE.MeshPhysicalMaterial({
    color: 0x8a4f35,
    roughness: 0.62,
    metalness: 0.03,
    clearcoat: 0.12
  });
  const crease = new THREE.MeshStandardMaterial({
    color: 0x6f3824,
    roughness: 0.84,
    metalness: 0.01
  });
  const nail = new THREE.MeshPhysicalMaterial({
    color: 0xf0d9cb,
    roughness: 0.28,
    metalness: 0.12,
    clearcoat: 0.65,
    clearcoatRoughness: 0.25
  });

  const palm = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 18), skin);
  palm.position.set(0, PLATFORM_TOP_Y + 12.4, -4);
  palm.scale.set(0.9, 0.24, 1.08);
  palm.castShadow = true;
  palm.receiveShadow = true;
  group.add(palm);

  const palmPad = new THREE.Mesh(new THREE.SphereGeometry(18, 28, 14), skinDark);
  palmPad.position.set(sideSign * 11, PLATFORM_TOP_Y + 11.7, -15);
  palmPad.scale.set(0.78, 0.16, 0.76);
  palmPad.castShadow = true;
  palmPad.receiveShadow = true;
  group.add(palmPad);

  const thumbPad = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 12), skin);
  thumbPad.position.set(sideSign * 20, PLATFORM_TOP_Y + 12.7, -18);
  thumbPad.scale.set(0.72, 0.18, 0.95);
  thumbPad.rotation.y = THREE.MathUtils.degToRad(sideSign * 28);
  thumbPad.castShadow = true;
  thumbPad.receiveShadow = true;
  group.add(thumbPad);

  for (const x of [-15, -5, 6, 16]) {
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(4.8, 18, 10), skinDark);
    knuckle.position.set(x, PLATFORM_TOP_Y + 16.2, 22);
    knuckle.scale.set(1.08, 0.38, 0.86);
    knuckle.castShadow = true;
    group.add(knuckle);
  }

  for (const x of [-14, 0, 14]) {
    const creaseLine = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 0.8), crease);
    creaseLine.position.set(x * 0.55, PLATFORM_TOP_Y + 16.9, 4 + Math.abs(x) * 0.1);
    creaseLine.rotation.y = THREE.MathUtils.degToRad(x * 0.55);
    group.add(creaseLine);
  }

  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(13, 46, 12, 22), skin);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, PLATFORM_TOP_Y + 13, -50);
  wrist.scale.set(1.08, 0.72, 1);
  wrist.castShadow = true;
  wrist.receiveShadow = true;
  group.add(wrist);

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(16, 70, 14, 24), skin);
  forearm.rotation.x = Math.PI / 2;
  forearm.position.set(0, PLATFORM_TOP_Y + 17, -95);
  forearm.scale.set(1.12, 0.82, 1);
  forearm.castShadow = true;
  forearm.receiveShadow = true;
  group.add(forearm);

  const lab = { group, fingers: {} };
  const specs = {
    index: { x: -14, z: 22, lengths: [25, 18, 13], radius: 4.9, restSpread: -7 },
    middle: { x: 0, z: 24, lengths: [29, 20, 14], radius: 5.2, restSpread: 0 },
    ring: { x: 14, z: 22, lengths: [26, 18, 13], radius: 4.9, restSpread: 7 },
    pinky: { x: 27, z: 17, lengths: [21, 15, 11], radius: 4.1, restSpread: 16 },
    thumb: { x: sideSign * 27, z: -8, lengths: [18, 15, 12], radius: 4.8, restSpread: sideSign * 50, thumb: true }
  };

  for (const finger of fingers) {
    lab.fingers[finger.id] = createLabFinger(group, specs[finger.id], skin, skinDark, crease, nail);
  }

  group.userData.lab = lab;
  return group;
}

function createLabFinger(parent, spec, skin, skinDark, crease, nail) {
  const root = new THREE.Group();
  root.position.set(spec.x, PLATFORM_TOP_Y + 13.8, spec.z);
  root.rotation.y = THREE.MathUtils.degToRad(spec.restSpread);
  parent.add(root);

  const pivots = [];
  let current = root;

  spec.lengths.forEach((length, index) => {
    const pivot = new THREE.Group();
    if (index > 0) pivot.position.z = spec.lengths[index - 1];
    current.add(pivot);
    pivots.push(pivot);

    const radius = Math.max(2.6, spec.radius - index * 0.52);
    const segment = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 12, 18), skin);
    segment.rotation.x = Math.PI / 2;
    segment.position.z = length / 2;
    segment.scale.set(0.92 - index * 0.03, 0.76 - index * 0.04, 1);
    segment.castShadow = true;
    segment.receiveShadow = true;
    pivot.add(segment);

    const dorsal = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.88, 16, 8), skinDark);
    dorsal.position.set(0, radius * 0.48, length * 0.42);
    dorsal.scale.set(0.95, 0.24, 1.25);
    dorsal.castShadow = true;
    dorsal.receiveShadow = true;
    pivot.add(dorsal);

    const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.9, 16, 8), skinDark);
    joint.position.set(0, radius * 0.5, index === 0 ? 1.5 : 0);
    joint.scale.set(1, 0.25, 0.72);
    joint.castShadow = true;
    pivot.add(joint);

    if (index > 0) {
      const creaseLine = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.1, 0.28, 0.65), crease);
      creaseLine.position.set(0, radius * 0.98, 1.4);
      pivot.add(creaseLine);
    }

    if (index === spec.lengths.length - 1) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.9, 18, 10), skin);
      tip.position.set(0, 0, length + 0.8);
      tip.scale.set(0.88, 0.68, 0.76);
      tip.castShadow = true;
      pivot.add(tip);

      const nailMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.62, 18, 8), nail);
      nailMesh.position.set(0, radius * 0.72, length * 0.82);
      nailMesh.scale.set(0.72, 0.12, 1.05);
      nailMesh.rotation.x = THREE.MathUtils.degToRad(-9);
      nailMesh.castShadow = true;
      pivot.add(nailMesh);
    }

    current = pivot;
  });

  return { root, pivots, restSpread: spec.restSpread, thumb: Boolean(spec.thumb) };
}

function updateLabHandVisibility() {
  const showLab = state.fallbackActive && !state.realModelReady;
  for (const side of ["l", "r"]) {
    const lab = state.labHands[side];
    if (!lab) continue;
    lab.group.visible = showLab && state.view === side;
    lab.group.position.x = 0;
  }
}

function updateLabHandPose() {
  for (const side of ["l", "r"]) {
    const lab = state.labHands[side];
    if (!lab) continue;
    const sideValues = state.fingerValues[side];

    for (const finger of fingers) {
      const rig = lab.fingers[finger.id];
      const values = sideValues[finger.id];
      if (!rig) continue;

      rig.root.rotation.y = THREE.MathUtils.degToRad(rig.restSpread + values.spread * 0.55);
      rig.pivots[0].rotation.x = THREE.MathUtils.degToRad(-values.base);
      rig.pivots[1].rotation.x = THREE.MathUtils.degToRad(-values.mid);
      rig.pivots[2].rotation.x = THREE.MathUtils.degToRad(-values.tip);
    }
  }
}

function isolateSelectedArm() {
  if (!state.model) return;

  for (const side of ["l", "r"]) {
    const visible = side === state.view;
    const root =
      getRigNode(`clavicle_${side}`) ||
      getRigNode(`upperarm_${side}`) ||
      getRigNode(`hand_${side}`);

    if (root) {
      root.scale.setScalar(visible ? 1 : 0.001);
      root.visible = visible;
    }
  }

  if (state.skeletonHelper) {
    state.skeletonHelper.visible = false;
  }
}

function placeHandsOnPlatform() {
  if (!state.model) return;
  const hand = getRigNode(`hand_${state.view === "l" ? "l" : "r"}`);
  if (!hand) return;

  state.model.updateMatrixWorld(true);
  const current = new THREE.Vector3();
  hand.getWorldPosition(current);

  const target = PLATFORM_CENTER.clone();
  target.y += 10;
  target.z += 10;

  state.model.position.add(target.sub(current));
  state.model.updateMatrixWorld(true);
}

function applyPoseForSide(side) {
  const flexAxis = side === "r" ? -1 : 1;
  const spreadAxis = side === "r" ? 1 : -1;
  const sideValues = state.fingerValues[side];

  for (const finger of fingers) {
    const values = sideValues[finger.id];
    const b1 = getBone(finger.id, 1, side);
    const b2 = getBone(finger.id, 2, side);
    const b3 = getBone(finger.id, 3, side);

    if (b1) {
      b1.rotation.z = THREE.MathUtils.degToRad(values.base * flexAxis);
      b1.rotation.y = THREE.MathUtils.degToRad(values.spread * spreadAxis);
    }
    if (b2) b2.rotation.z = THREE.MathUtils.degToRad(values.mid * flexAxis);
    if (b3) b3.rotation.z = THREE.MathUtils.degToRad(values.tip * flexAxis);
  }
}

function applyRealModelPose() {
  if (!state.realModelReady) return;

  for (const finger of fingers) {
    const values = state.fingerValues[state.hand][finger.id];
    const names = realFingerBones[finger.key];
    if (!names) continue;

    const axis = REAL_ROTATION_AXIS[finger.key] || -1;
    const rotations = [
      values.base * 0.9 * axis,
      values.mid * 0.9 * axis,
      values.tip * 0.9 * axis
    ];

    names.forEach((name, index) => {
      const bone = getRigNode(name);
      if (!bone) return;
      bone.rotation.x = THREE.MathUtils.degToRad(rotations[index]);
    });
  }
}

function applyPose() {
  for (const side of ["l", "r"]) {
    applyPoseForSide(side);
  }
  applyRealModelPose();
  isolateSelectedArm();
  updateLabHandVisibility();
  updateLabHandPose();
}

function resetPose() {
  state.fingerValues.l = makeRestPose();
  state.fingerValues.r = makeRestPose();
  document.querySelectorAll(".finger-row.is-active").forEach((row) => row.classList.remove("is-active"));
  for (const finger of fingers) setFingerLive(finger.key, false);
  syncSliders();
  applyPose();
}

function resetPanel({ fromBridge = false } = {}) {
  state.demoRun += 1;
  if (modeWheel.open) closeModeWheel(false);
  hideComposer();
  state.fingerTaps = {};
  resetPose();
  focusModel();
  if (!fromBridge) {
    setMode("letters", { syncBridge: false });
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.resetSentAt = performance.now();
      sendBridge("reset");
      els.lastEvent.textContent = "Reset: panel, puente y dedos del guante reiniciados";
    } else {
      els.lastEvent.textContent = "Reset: panel reiniciado (puente sin conectar)";
    }
  } else {
    els.lastEvent.textContent = "Reset recibido del puente";
  }
  renderKeyboard();
  const btn = document.querySelector("#resetPoseBtn");
  btn?.classList.add("is-flash");
  window.setTimeout(() => btn?.classList.remove("is-flash"), 700);
}

function setFingerLive(fingerKey, active) {
  const on = Boolean(active);
  els.fingerLive?.querySelector(`[data-finger="${fingerKey}"]`)?.classList.toggle("is-active", on);
  els.fingerMap?.querySelector(`[data-finger="${fingerKey}"]`)?.classList.toggle("is-active", on);
  els.keyboard?.querySelector(`.key-group[data-finger="${fingerKey}"]`)?.classList.toggle("is-active", on);
}

function countFingerTap(fingerKey) {
  state.fingerTaps[fingerKey] = (state.fingerTaps[fingerKey] || 0) + 1;
  const taps = els.fingerMap?.querySelector(`[data-finger="${fingerKey}"] .finger-taps`);
  if (taps) taps.textContent = state.fingerTaps[fingerKey];
}

function setFingerFlex(fingerKey, active, hand = state.hand) {
  const finger = fingers.find((item) => item.key === fingerKey);
  if (!finger) return;
  const side = hand === "l" ? "l" : "r";
  const rest = REST_POSE[finger.id];
  const lift = active ? ACTIVE_LIFT[finger.id] : { base: 0, mid: 0, tip: 0 };
  state.fingerValues[side][finger.id] = {
    base: rest.base + lift.base,
    mid: rest.mid + lift.mid,
    tip: rest.tip + lift.tip,
    spread: state.fingerValues[side][finger.id].spread
  };
  if (side === state.hand) {
    const row = document.querySelector(`.finger-row[data-finger="${finger.id}"]`);
    if (row) row.classList.toggle("is-active", Boolean(active));
    syncSliders();
  }
  setFingerLive(fingerKey, active);
  applyPose();
}

function focusModel() {
  let target = new THREE.Vector3(0, PLATFORM_TOP_Y + 18, 6);

  if (state.model) {
    state.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(state.model);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      target = new THREE.Vector3(center.x, PLATFORM_TOP_Y + 20, center.z);
    }
  }

  cameraFocus.posFrom.copy(camera.position);
  cameraFocus.targetFrom.copy(controls.target);
  cameraFocus.targetTo.copy(target);
  cameraFocus.posTo.set(target.x + 12, target.y + 108, target.z + 168);
  cameraFocus.t = 0;
  cameraFocus.active = true;
}

function alignRealModelOnTable(model) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const targetY = PLATFORM_TOP_Y + 3.4;

  model.position.x -= center.x;
  model.position.x -= 12;
  model.position.z -= center.z + 8;
  model.position.y += targetY - box.min.y;

  model.updateMatrixWorld(true);

  const laidBox = new THREE.Box3().setFromObject(model);
  const laidSize = laidBox.getSize(new THREE.Vector3());
  if (laidSize.z < laidSize.y) {
    model.rotation.x -= Math.PI / 2;
    model.updateMatrixWorld(true);
    const rotatedBox = new THREE.Box3().setFromObject(model);
    const rotatedCenter = rotatedBox.getCenter(new THREE.Vector3());
    model.position.x -= rotatedCenter.x;
    model.position.x -= 12;
    model.position.z -= rotatedCenter.z + 8;
    model.position.y += targetY - rotatedBox.min.y;
  }
}

function addFallbackRig() {
  state.fallbackActive = true;
  updateLabHandVisibility();
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} tardo mas de ${ms}ms`)), ms);
    })
  ]);
}

async function loadTexture(textureLoader, url, timeoutMs, label) {
  try {
    return await withTimeout(textureLoader.loadAsync(url), timeoutMs, label);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

async function loadModel() {
  setBadge(els.loadBadge, "Modelo: cargando FBX", "warn");
  els.modelStatus.textContent = "Cargando el brazo 3D real...";
  state.fallbackActive = false;
  updateLabHandVisibility();

  try {
    const textureLoader = new THREE.TextureLoader();
    const [texture, normalMap, roughnessMap, metalnessMap, aoMap] = await Promise.all([
      loadTexture(textureLoader, TEXTURE_URL, 5000, "Textura albedo"),
      loadTexture(textureLoader, NORMAL_URL, 5000, "Textura normal"),
      loadTexture(textureLoader, ROUGHNESS_URL, 5000, "Textura roughness"),
      loadTexture(textureLoader, METALLIC_URL, 5000, "Textura metallic"),
      loadTexture(textureLoader, AO_URL, 5000, "Textura AO")
    ]);
    if (texture) texture.colorSpace = THREE.SRGBColorSpace;

    const fbx = await withTimeout(new FBXLoader().loadAsync(MODEL_URL), 12000, "Modelo FBX");
    fbx.scale.setScalar(4.25);
    fbx.rotation.set(0, 0, Math.PI * 1.96);
    fbx.position.set(0, 0, 0);

    fbx.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.visible = true;
        obj.frustumCulled = false;
        if (!obj.geometry.attributes.uv2 && obj.geometry.attributes.uv) {
          obj.geometry.setAttribute("uv2", obj.geometry.attributes.uv);
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (let i = 0; i < mats.length; i += 1) {
            const old = mats[i];
            const physical = new THREE.MeshPhysicalMaterial({
              color: old.color ? old.color.clone() : new THREE.Color(0xc08a6c),
              map: texture || old.map || null,
              normalMap: normalMap || old.normalMap || null,
              roughnessMap: roughnessMap || old.roughnessMap || null,
              metalnessMap: metalnessMap || old.metalnessMap || null,
              aoMap: aoMap || old.aoMap || null,
              roughness: 0.42,
              metalness: 0.08,
              clearcoat: 0.28,
              clearcoatRoughness: 0.45,
              sheen: 0.35,
              sheenRoughness: 0.55,
              sheenColor: new THREE.Color(0xe8b89a),
              envMapIntensity: 0.85,
              aoMapIntensity: 0.9
            });
            if (physical.normalMap) {
              physical.normalScale = new THREE.Vector2(1.05, 1.05);
            }
            if (Array.isArray(obj.material)) obj.material[i] = physical;
            else obj.material = physical;
          }
        }
      }
    });

    scene.add(fbx);
    state.model = fbx;
    registerBones(fbx);

    skeletonHelperGroup.clear();
    const helper = new THREE.SkeletonHelper(fbx);
    helper.material.color.set(0x0d8f7d);
    helper.visible = false;
    skeletonHelperGroup.add(helper);
    state.skeletonHelper = helper;
    state.realModelReady = true;
    state.fallbackActive = false;

    alignRealModelOnTable(fbx);
    sceneMotion.modelBaseY = fbx.position.y;
    sceneMotion.modelBaseRotY = fbx.rotation.y;
    applyPose();
    isolateSelectedArm();

    els.modelStatus.textContent = "Modelo cinematico listo · orbit para rotar · scroll para zoom.";
    setBadge(els.loadBadge, "Modelo: brazo FBX+", "ok");
    updateBoneReport();
    applyPose();
    focusModel();
    controls.autoRotate = true;
    window.setTimeout(() => {
      controls.autoRotate = false;
    }, 4200);
  } catch (error) {
    console.error(error);
    state.realModelReady = false;
    state.fallbackActive = true;
    updateLabHandVisibility();
    els.modelStatus.textContent = `No se pudo cargar el FBX real: ${error.message}. Se muestra la mano de laboratorio.`;
    setBadge(els.loadBadge, "Modelo: respaldo", "bad");
    addFallbackRig();
  }
}

function updateBoneReport() {
  let ok = 0;
  let missing = 0;
  els.boneReport.innerHTML = "";

  for (const finger of fingers) {
    const expected = realFingerBones[finger.key] || [];
    const found = expected.filter((name) => state.bones.has(name));
    ok += found.length;
    missing += expected.length - found.length;

    const row = document.createElement("div");
    row.className = "bone-line";
    row.innerHTML = `
      <strong>${finger.label}</strong>
      <span class="${found.length === 3 ? "ok" : "warn"}">${found.length}/3 ${expected.join(" -> ")}</span>
    `;
    els.boneReport.appendChild(row);
  }

  const totalBones = [...state.bones.keys()].length;
  els.boneSummary.textContent = `${ok}/15 falanges, ${totalBones} huesos`;
  if (missing > 0) els.boneSummary.className = "warn";
}

function createFingerControls() {
  els.fingerControls.innerHTML = "";
  for (const finger of fingers) {
    const row = document.createElement("div");
    row.className = "finger-row";
    row.dataset.finger = finger.id;
    row.innerHTML = `
      <div class="finger-title">
        <strong>${finger.label}</strong>
        <span id="${finger.id}-value">0 deg</span>
      </div>
      ${rangeMarkup(finger.id, "base", "Elevar", 0, 58)}
      ${rangeMarkup(finger.id, "mid", "Falange", 0, 32)}
      ${rangeMarkup(finger.id, "tip", "Punta", 0, 18)}
      ${rangeMarkup(finger.id, "spread", "Apertura", -35, 35)}
    `;
    els.fingerControls.appendChild(row);
  }

  els.fingerControls.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.matches("input[type='range']")) return;
    const fingerId = input.dataset.finger;
    state.fingerValues[state.hand][fingerId][input.dataset.part] = Number(input.value);
    const values = state.fingerValues[state.hand][fingerId];
    const rest = REST_POSE[fingerId];
    const active = values.base > rest.base + 4;
    const row = document.querySelector(`.finger-row[data-finger="${fingerId}"]`);
    if (row) row.classList.toggle("is-active", active);
    const fingerMeta = fingers.find((item) => item.id === fingerId);
    if (fingerMeta) setFingerLive(fingerMeta.key, active);
    syncSliders();
    applyPose();
  });
}

function rangeMarkup(finger, part, label, min, max) {
  return `
    <div class="range-line">
      <label for="${finger}-${part}">${label}</label>
      <input id="${finger}-${part}" data-finger="${finger}" data-part="${part}" type="range" min="${min}" max="${max}" value="0">
      <output id="${finger}-${part}-out">0</output>
    </div>
  `;
}

function syncSliders() {
  for (const finger of fingers) {
    const values = state.fingerValues[state.hand][finger.id];
    for (const part of ["base", "mid", "tip", "spread"]) {
      const input = document.querySelector(`#${finger.id}-${part}`);
      const output = document.querySelector(`#${finger.id}-${part}-out`);
      if (input) input.value = values[part];
      if (output) output.value = values[part];
    }
    const value = document.querySelector(`#${finger.id}-value`);
    if (value) value.textContent = `${values.base} deg`;
  }
}

function parseIncoming(raw) {
  const line = raw.trim().toLowerCase();
  if (!line) return null;
  const normalized = line
    .replace(/\s*:\s*/g, ":")
    .replace(/^sys:/, "SYS:");

  if (normalized.startsWith("SYS:")) {
    return { type: "system", message: normalized.slice(4) };
  }

  const [finger, status] = normalized.split(":");
  if (!finger || !status) return null;
  if (!letterMap[finger]) return null;
  if (!["activo", "reposo"].includes(status)) return null;
  return { type: "finger", finger, status };
}

function handleIncoming(raw) {
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("{")) {
    try {
      handleBridgeMessage(JSON.parse(trimmed));
    } catch (_error) {
      return;
    }
    return;
  }

  const msg = parseIncoming(raw);
  if (!msg) return;

  if (msg.type === "system") {
    els.lastEvent.textContent = `SYS: ${msg.message}`;
    return;
  }

  els.lastEvent.textContent = `${msg.finger}:${msg.status}`;
  setFingerFlex(msg.finger, msg.status === "activo");
  if (msg.status === "activo") {
    emitKeyboardFromFinger(msg.finger);
  }
}

function setCalibration(percent) {
  const pct = Math.max(0, Math.min(100, Number(percent || 0)));
  els.calibrationFill.style.width = `${pct}%`;
  els.calibrationLabel.textContent = `Calibracion: ${pct}%`;
  els.calibrateBtn.classList.toggle("active", pct > 0 && pct < 100);
  setLink({ calib: pct >= 100 });
  return pct;
}

function applyBridgeHello(msg) {
  if (!msg) return;
  if ("vision_owner" in msg && state.visionOwner !== VISION_TAB_ID) state.visionOwner = msg.vision_owner || null;
  if (["letters", "numbers", "cursor"].includes(msg.mode) && msg.mode !== state.mode) {
    setMode(msg.mode, { syncBridge: false });
  }
  state.gloveIp = msg.esp32_ip || null;
  applyGlovesPayload(msg);
  setLink({ bridge: true, glove: Boolean(state.gloveIp), live: Boolean(msg.enabled) });
  if (typeof msg.calibrated === "boolean") setCalibration(msg.calibrated ? 100 : 0);
  if (state.cursorVision?.running && state.visionOwner === VISION_TAB_ID) {
    sendBridge("vision_claim", { owner: VISION_TAB_ID });
  }
  if (state.gloveIp) {
    setBadge(els.serialBadge, `ESP32: ${state.gloveIp}`, msg.enabled ? "ok" : "warn");
    els.lastEvent.textContent = msg.enabled
      ? "Guante activo"
      : msg.calibrated
        ? "Guante enlazado y calibrado — pulsa Iniciar"
        : "Guante enlazado — pulsa Calibrar y luego Iniciar";
  } else {
    setBadge(els.serialBadge, "Puente: conectado", "ok");
    els.lastEvent.textContent = "Puente OK — enciende el guante y espera el emparejamiento WiFi";
  }
  if (typeof msg.enabled === "boolean") {
    state.labEnabled = msg.enabled;
    els.textOutput.disabled = !state.labEnabled;
    els.startLabBtn.classList.toggle("active", state.labEnabled);
  }
}

function handleBridgeMessage(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === "hello") {
    applyBridgeHello(msg);
    return;
  }

  if (msg.type === "gloves") {
    applyGlovesPayload(msg);
    return;
  }

  if (msg.type === "connected") {
    if (msg.esp32_ip) {
      state.gloveIp = msg.esp32_ip;
      setBadge(els.serialBadge, `ESP32: ${msg.esp32_ip}`, "ok");
      els.lastEvent.textContent = "Guante emparejado por WiFi";
    } else {
      state.gloveIp = null;
      setBadge(els.serialBadge, "ESP32: desconectado", "bad");
      els.lastEvent.textContent = msg.reason === "sin respuesta"
        ? "El guante dejo de responder — revisa que este encendido y en la misma WiFi"
        : "Guante desconectado — se volvera a emparejar solo al encenderlo";
      setCalibration(0);
      hideComposer();
    }
    setLink({ glove: Boolean(state.gloveIp), live: state.gloveIp ? state.link.live : false });
    return;
  }

  if (msg.type === "vision_owner") {
    handleVisionOwner(msg.owner);
    return;
  }

  if (msg.type === "reset") {
    if (performance.now() - state.resetSentAt > 1500) resetPanel({ fromBridge: true });
    return;
  }

  if (msg.type === "enabled") {
    state.labEnabled = Boolean(msg.enabled);
    setLink({ live: state.labEnabled });
    if (!state.labEnabled) hideComposer();
    els.textOutput.disabled = !state.labEnabled;
    renderKeyboard();
    els.startLabBtn.textContent = "Iniciar";
    els.startLabBtn.classList.toggle("active", state.labEnabled);
    els.lastEvent.textContent = msg.enabled ? "Teclado habilitado" : "Teclado detenido";
    return;
  }

  if (msg.type === "system") {
    const text = String(msg.message || "");
    if (/^TX |^PONG$/.test(text)) return;
    els.lastEvent.textContent = `SYS: ${text}`;
    return;
  }

  if (msg.type === "calibration") {
    const wasCalibrated = state.link.calib;
    const percent = setCalibration(msg.percent);
    if (percent >= 100 && !wasCalibrated) els.lastEvent.textContent = "Calibracion completada";
    return;
  }

  if (msg.type === "mode") {
    const next = msg.mode || "letters";
    const fromGesture = msg.source === "gesture";
    const changed = next !== state.mode;
    hideComposer();
    setMode(next, { syncBridge: false });
    markModeChange();
    const justPicked = performance.now() - modeWheel.gloveConfirmAt < 1500;
    if ((fromGesture || changed) && !justPicked && !modeWheel.open) {
      flashModeWheel(next);
    }
    return;
  }

  if (msg.type === "mode_wheel") {
    handleGloveWheel(msg);
    return;
  }

  if (msg.type === "finger") {
    const active = msg.status === "activo";
    els.lastEvent.textContent = `${fingerLabel(msg.finger)} ${active ? "arriba" : "en reposo"}`;
    if (active) countFingerTap(msg.finger);
    setFingerFlex(msg.finger, active);
    return;
  }

  if (msg.type === "preview") {
    els.lastEvent.textContent = msg.key
      ? `${fingerLabel(msg.finger)} ×${msg.count} → ${msg.key}`
      : `${fingerLabel(msg.finger)} ×${msg.count}`;
    showComposer(msg);
    return;
  }

  if (msg.type === "confirm") {
    if (msg.key && msg.key.length === 1) {
      writeText(msg.key);
    } else if (msg.key === "space") {
      writeText(" ");
    } else if (msg.key === "enter") {
      writeText("\n");
    } else if (msg.key === "tab") {
      writeText("  ");
    } else if (msg.key === "backspace") {
      deletePreviousChar();
    } else if (msg.key === "clear") {
      clearTextOutput();
    } else if (msg.key === "windows") {
      els.lastEvent.textContent = "Complementos: Windows";
    } else if (msg.key === "left_click") {
      els.lastEvent.textContent = "Complementos: click izquierdo";
    } else if (msg.key === "right_click") {
      els.lastEvent.textContent = "Complementos: click derecho";
    } else if (String(msg.key || "").startsWith("mouse_")) {
      els.lastEvent.textContent = `Complementos: ${msg.key}`;
    }
    if (msg.key) {
      markKeyboardKey(msg.key, "key-confirmed", 900);
      if (msg.source !== "vision") confirmComposer(msg.key);
      if (msg.key.length === 1) els.lastEvent.textContent = `Escrito: ${msg.key}`;
    }
    return;
  }

  if (msg.type === "error") {
    els.lastEvent.textContent = msg.message || "Error";
    setBadge(els.serialBadge, "Puente: error", "bad");
  }
}

function emitKeyboardFromFinger(finger) {
  if (state.mode !== "letters") return;
  const chars = letterMap[finger] || [];
  const char = chars[0];
  if (char) {
    markKeyboardKey(char, "key-preview", 180);
    window.setTimeout(() => {
      writeText(char);
      markKeyboardKey(char, "key-confirmed", 650);
    }, 190);
  }
}

function writeText(value) {
  const target = els.textOutput;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  target.value = target.value.slice(0, start) + value + target.value.slice(end);
  target.selectionStart = target.selectionEnd = start + value.length;
  target.scrollTop = target.scrollHeight;
  updateTextStats();
}

function deletePreviousChar() {
  const target = els.textOutput;
  const pos = target.selectionStart;
  if (pos > 0) {
    target.value = target.value.slice(0, pos - 1) + target.value.slice(target.selectionEnd);
    target.selectionStart = target.selectionEnd = pos - 1;
  }
  updateTextStats();
}

function clearTextOutput() {
  els.textOutput.value = "";
  els.textOutput.selectionStart = els.textOutput.selectionEnd = 0;
  updateTextStats();
}

async function copyTextOutput() {
  const text = els.textOutput.value;
  if (!text) {
    els.lastEvent.textContent = "No hay texto para copiar";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    const wasDisabled = els.textOutput.disabled;
    els.textOutput.disabled = false;
    els.textOutput.select();
    document.execCommand("copy");
    els.textOutput.disabled = wasDisabled;
  }
  els.lastEvent.textContent = "Texto copiado al portapapeles";
  els.copyTextBtn?.classList.add("is-done");
  window.setTimeout(() => els.copyTextBtn?.classList.remove("is-done"), 900);
}

function markModeChange() {
  document.querySelectorAll("#modeWheelBtn").forEach((button) => {
    button.classList.add("key-confirmed");
    window.setTimeout(() => button.classList.remove("key-confirmed"), 700);
  });
}

function markKeyboardKey(value, className, duration = 500) {
  const aliases = {
    windows: "windows",
    mouse_left: "cursor izquierda",
    mouse_right: "cursor derecha",
    mouse_up: "cursor arriba",
    mouse_down: "cursor abajo",
    backspace: "borrar",
    clear: "borrar",
    left_click: "click izquierdo",
    right_click: "click derecho"
  };
  const key = aliases[String(value).toLowerCase()] || String(value).toLowerCase();
  const button = [...els.keyboard.querySelectorAll("button")]
    .find((item) => item.dataset.key === key);
  if (!button) return;

  button.classList.remove("key-preview", "key-confirmed");
  button.classList.add(className);
  window.setTimeout(() => {
    button.classList.remove(className);
  }, duration);
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    setBadge(els.serialBadge, "ESP32: Web Serial no disponible", "bad");
    return;
  }

  state.serialPort = await navigator.serial.requestPort();
  await state.serialPort.open({ baudRate: 115200 });
  setBadge(els.serialBadge, "ESP32: serial conectado", "ok");

  const decoder = new TextDecoderStream();
  state.serialPort.readable.pipeTo(decoder.writable);
  state.serialReader = decoder.readable.getReader();

  let buffer = "";
  while (state.serialPort && state.serialReader) {
    const { value, done } = await state.serialReader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) handleIncoming(line);
  }
}

async function disconnectSerial() {
  state.wsManualClose = true;
  if (state.wsReconnectTimer) {
    window.clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
  }
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ action: "disconnect" }));
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  if (state.serialReader) {
    await state.serialReader.cancel();
    state.serialReader = null;
  }
  if (state.serialPort) {
    await state.serialPort.close();
    state.serialPort = null;
  }
  if (state.ws) {
    try {
      state.ws.onopen = null;
      state.ws.onmessage = null;
      state.ws.onerror = null;
      state.ws.onclose = null;
      state.ws.close();
    } catch (_e) {  }
    state.ws = null;
  }
  setBadge(els.serialBadge, "ESP32: desconectado", "bad");
  setLink({ bridge: false });
  hideComposer();
  state.labEnabled = false;
  els.textOutput.disabled = true;
  els.startLabBtn.textContent = "Iniciar";
  els.startLabBtn.classList.remove("active");
  els.connectWsBtn.classList.remove("active");
  renderKeyboard();
}

function probeGameBridge() {
  const probe = new WebSocket("ws://127.0.0.1:8766");
  probe.addEventListener("open", () => {
    probe.close();
    els.lastEvent.textContent = "Puente JUEGO detectado en :8766 — ciérralo y usa laboratorio_bridge.py para el teclado";
  });
  probe.addEventListener("error", () => {
  });
}

function scheduleBridgeReconnect(delayMs = 1200) {
  if (state.wsManualClose) return;
  if (state.wsReconnectTimer) return;
  state.wsReconnectTimer = window.setTimeout(() => {
    state.wsReconnectTimer = null;
    if (state.wsManualClose) return;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
    connectWebSocket({ silent: true });
  }, delayMs);
}

function connectWebSocket(opts = {}) {
  const silent = Boolean(opts.silent);
  state.wsManualClose = false;
  const wsUrl = (els.wsUrl?.value || "ws://127.0.0.1:8765").trim().replace("ws://localhost:", "ws://127.0.0.1:");
  if (els.wsUrl) els.wsUrl.value = wsUrl;

  const prev = state.ws;
  state.ws = null;
  if (prev) {
    try {
      prev.onopen = null;
      prev.onmessage = null;
      prev.onerror = null;
      prev.onclose = null;
      prev.close();
    } catch (_e) {  }
  }

  if (state.wsReconnectTimer) {
    window.clearTimeout(state.wsReconnectTimer);
    state.wsReconnectTimer = null;
  }

  const gen = ++state.wsGen;
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  if (!silent) {
    setBadge(els.serialBadge, "Puente: conectando", "warn");
    els.lastEvent.textContent = "Conectando con puente...";
  }
  els.connectWsBtn?.classList.add("active");

  ws.addEventListener("open", () => {
    if (state.ws !== ws || state.wsGen !== gen) return;
    setBadge(els.serialBadge, "Puente: conectado", "ok");
    setLink({ bridge: true });
    els.connectWsBtn?.classList.add("active");
    if (!els.lastEvent.textContent.includes("ESP32")) {
      els.lastEvent.textContent = "Puente web conectado";
    }
  });

  ws.addEventListener("message", (event) => {
    if (state.ws !== ws) return;
    handleIncoming(String(event.data));
  });

  ws.addEventListener("close", () => {
    if (state.ws !== ws && state.ws != null) return;
    if (state.ws === ws) state.ws = null;
    setBadge(els.serialBadge, "Puente: cerrado", "bad");
    setLink({ bridge: false });
    hideComposer();
    els.connectWsBtn?.classList.remove("active");
    state.labEnabled = false;
    els.textOutput.disabled = true;
    els.startLabBtn?.classList.remove("active");
    renderKeyboard();
    scheduleBridgeReconnect(1500);
  });

  ws.addEventListener("error", () => {
    if (state.ws !== ws && state.ws != null) return;
    setBadge(els.serialBadge, "Puente: no disponible", "bad");
    if (!silent) {
      els.lastEvent.textContent = "Ejecuta: .venv/Scripts/python.exe -u modulo_teclado/scripts/laboratorio_bridge.py";
      probeGameBridge();
    }
  });
}

function sendBridge(action, extra = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    els.lastEvent.textContent = "WebSocket no conectado";
    scheduleBridgeReconnect(400);
    return;
  }
  state.ws.send(JSON.stringify({ action, ...extra }));
}

function simulateEsp32() {
  const run = ++state.demoRun;
  if (state.mode === "cursor") setMode("letters", { syncBridge: false });
  const mode = state.mode;
  const map = mapForMode(mode);
  const word = mode === "numbers" ? "2026" : "nexum";
  const confirmMs = 1400;
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const alive = () => state.demoRun === run && state.mode === mode;

  els.lastEvent.textContent = `Demo: escribiendo "${word}"`;
  (async () => {
    for (const char of word) {
      const finger = Object.keys(map).find((key) => map[key].includes(char));
      if (!finger) continue;
      const taps = map[finger].indexOf(char) + 1;
      for (let count = 1; count <= taps; count += 1) {
        if (!alive()) return;
        handleBridgeMessage({ type: "finger", finger, status: "activo" });
        handleBridgeMessage({ type: "preview", finger, count, key: map[finger][count - 1], mode, confirm_ms: confirmMs });
        await wait(260);
        handleBridgeMessage({ type: "finger", finger, status: "reposo" });
        await wait(220);
      }
      await wait(confirmMs - 220);
      if (!alive()) return;
      handleBridgeMessage({ type: "confirm", key: char, mode });
      await wait(650);
    }
    if (alive()) els.lastEvent.textContent = "Demo terminada";
  })();
}

const CURSOR_GESTURES = [
  { key: "Indice = mover", title: "Indice", desc: "Mover cursor" },
  { key: "Mano izq abierta = Windows", title: "Mano izq abierta", desc: "Tecla Windows" },
  { key: "Punio = Borrar", title: "Puño", desc: "Borrar (mantener = repetir)" },
  { key: "Pulgar = clic der", title: "Pulgar", desc: "Clic derecho" },
  { key: "Menique = clic izq", title: "Meñique", desc: "Clic izquierdo" },
  { key: "Modo ABC", title: "ABC", desc: "Volver a letras" },
  { key: "Modo 123", title: "123", desc: "Ir a numeros" }
];

function makeKeyButton(key, label, extraHtml = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `${label}${extraHtml}`;
  button.dataset.key = String(key).toLowerCase();
  button.addEventListener("click", () => pressVirtualKey(key));
  return button;
}

function renderKeyboard() {
  els.keyboard.innerHTML = "";
  const map = mapForMode();
  els.keyboard.classList.toggle("is-cursor", !map);

  if (!map) {
    for (const gesture of CURSOR_GESTURES) {
      const button = makeKeyButton(gesture.key, `<strong>${gesture.title}</strong>`, `<em>${gesture.desc}</em>`);
      button.className = "gesture-key";
      els.keyboard.appendChild(button);
    }
    renderFingerMap();
    return;
  }

  for (const finger of fingers) {
    const chars = map[finger.key] || [];
    const group = document.createElement("div");
    group.className = "key-group";
    group.dataset.finger = finger.key;
    group.innerHTML = `<div class="key-group-head"><span>${finger.label}</span><em>${chars.length} toques</em></div>`;
    const keys = document.createElement("div");
    keys.className = "key-group-keys";
    chars.forEach((char, index) => {
      const button = makeKeyButton(char, char, `<sup>${index + 1}</sup>`);
      button.disabled = !state.labEnabled;
      button.title = `${finger.label}: ${index + 1} toque${index ? "s" : ""}`;
      keys.appendChild(button);
    });
    group.appendChild(keys);
    els.keyboard.appendChild(group);
  }
  renderFingerMap();
}

function pressVirtualKey(key) {
  if (!state.labEnabled && !String(key).startsWith("Modo")) return;
  if (key === "Borrar" || key === "Punio = Borrar") {
    clearTextOutput();
    return;
  }
  if (key === "Enter") return writeText("\n");
  if (key === "Espacio") return writeText(" ");
  if (key === "Tab") return writeText("  ");
  if (key === "Modo ABC") {
    setMode("letters");
    return;
  }
  if (key === "Modo 123") {
    setMode("numbers");
    return;
  }
  if (
    key.includes("Indice") ||
    key.includes("Punio") ||
    key.includes("Pulgar") ||
    key.includes("Menique") ||
    key.includes("clic") ||
    key.includes("Windows")
  ) {
    els.lastEvent.textContent = `Vision: ${key}`;
    markKeyboardKey(key, "key-confirmed", 500);
    return;
  }
  if (["←", "→", "↑", "↓", "Inicio", "Fin"].includes(key)) {
    els.lastEvent.textContent = `Cursor: ${key}`;
    markKeyboardKey(key, "key-confirmed", 500);
    return;
  }
  writeText(key);
  markKeyboardKey(key, "key-confirmed", 500);
}

function setMode(mode, opts = {}) {
  const syncBridge = opts.syncBridge !== false;
  const order = ["letters", "numbers", "cursor"];
  const next = order.includes(mode) ? mode : "letters";
  state.mode = next;
  const shortMap = { letters: "ABC", numbers: "123", cursor: "CUR" };
  const longMap = { letters: "Letras", numbers: "Numeros", cursor: "Cursor" };
  const short = shortMap[next];
  const label = next === "letters" ? "letras" : next === "numbers" ? "numeros" : "cursor vision";
  setBadge(els.modeBadge, `Modo: ${label}`, "info");
  document.querySelectorAll(".wheel-slice, .wheel-item").forEach((el) => {
    el.classList.toggle("is-current", el.dataset.mode === next);
  });
  const fabLabel = document.querySelector("#modeFabLabel");
  if (fabLabel) fabLabel.textContent = short;
  const hubMode = document.querySelector("#wheelHubMode");
  if (hubMode) hubMode.textContent = short;
  const hubHint = document.querySelector("#wheelHubHint");
  if (hubHint) hubHint.textContent = longMap[next] || label;
  renderKeyboard();
  syncCursorVision(next === "cursor");
  if (syncBridge) sendBridge("mode", { mode: next });
}

function sendVisionCursor(payload) {
  if (state.mode !== "cursor") return;

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    try {
      state.ws.send(JSON.stringify({ action: "vision_cursor", ...payload }));
      return;
    } catch (_err) {
    }
  }

  const origins = [
    window.location.origin,
    "http://127.0.0.1:8090",
    "http://localhost:8090"
  ];
  const tryPost = (base) =>
    fetch(new URL("/api/vision/cursor", base).href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    });

  (async () => {
    let lastErr = null;
    for (const base of origins) {
      try {
        const res = await tryPost(base);
        if (!res.ok) {
          lastErr = `HTTP ${res.status}`;
          continue;
        }
        if (payload.kind && payload.kind !== "move") {
          setBadge(els.visionBadge, "Vision: controlando PC", "ok");
        }
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    console.warn("vision cursor failed", lastErr);
    els.lastEvent.textContent = "Abre http://127.0.0.1:8090/modulo_teclado/laboratorio-web/";
    setBadge(els.visionBadge, "Vision: sin servidor :8090", "bad");
  })();
}

async function ensureBridgeForCursor() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) return true;
  return new Promise((resolve) => {
    connectWebSocket({ silent: true });
    const ws = state.ws;
    if (!ws) {
      resolve(false);
      return;
    }
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(state.ws?.readyState === WebSocket.OPEN), 900);
    ws.addEventListener("open", () => {
      try { ws.send(JSON.stringify({ action: "mode", mode: "cursor" })); } catch (_e) {}
      done(true);
    });
    ws.addEventListener("error", () => done(false));
  });
}

const VISION_TAB_ID = Math.random().toString(36).slice(2, 10);

function bridgeOpen() {
  return Boolean(state.ws && state.ws.readyState === WebSocket.OPEN);
}

function yieldVision() {
  state.visionYielded = true;
  window.clearTimeout(state.visionRetryTimer);
  try { state.cursorVision?.stop(); } catch (_e) {}
  els.visionPip?.classList.remove("is-live");
  setBadge(els.visionBadge, "Vision: en otro panel", "warn");
  if (els.visionStatus) els.visionStatus.textContent = "La camara la usa otro panel · clic aqui para usarla en este";
  if (els.visionHint) els.visionHint.textContent = "en pausa";
}

function scheduleVisionRetry() {
  window.clearTimeout(state.visionRetryTimer);
  state.visionRetryTimer = window.setTimeout(() => {
    if (state.cursorVisionWanted && !state.visionYielded && !state.cursorVision?.running) {
      syncCursorVision(true, { force: true });
    }
  }, 3000);
}

function handleVisionOwner(owner) {
  state.visionOwner = owner || null;
  if (owner && owner !== VISION_TAB_ID && (state.cursorVision?.running || state.cursorVisionStarting)) {
    yieldVision();
  }
}

async function syncCursorVision(enable, opts = {}) {
  state.cursorVisionWanted = Boolean(enable);

  if (enable) {
    if (els.visionPip) els.visionPip.hidden = false;
    if (opts.force) state.visionYielded = false;
    if (state.visionYielded) return;
    if (!opts.force && !document.hasFocus()) {
      await new Promise((r) => window.setTimeout(r, 800));
      if (!state.cursorVisionWanted || state.visionYielded) return;
      if (state.visionOwner && state.visionOwner !== VISION_TAB_ID) {
        yieldVision();
        return;
      }
    }
    els.visionPip?.classList.add("is-live");
    els.lastEvent.textContent = "Cursor vision — camara (sin guante)";
    setBadge(els.visionBadge, "Vision: iniciando…", "info");
    ensureBridgeForCursor().then((ok) => {
      if (!state.cursorVisionWanted) return;
      if (ok) {
        els.lastEvent.textContent = "Cursor vision activo (puente opcional OK)";
      } else {
        els.lastEvent.textContent = "Cursor vision activo por HTTP (sin puente)";
        setBadge(els.visionBadge, "Vision: HTTP local", "ok");
      }
    });

    if (state.cursorVision?.running) {
      state.cursorVision.onAction = (evt) => sendVisionCursor(evt);
      setBadge(els.visionBadge, "Vision: controlando PC", "ok");
      return;
    }
    if (state.cursorVisionStarting) return;
    state.cursorVisionStarting = true;
    try {
      if (!state.cursorVision) {
        state.cursorVision = new CursorVision({
          video: els.visionVideo,
          canvas: els.visionCanvas,
          onAction: (evt) => sendVisionCursor(evt),
          onStatus: (msg) => {
            if (!state.cursorVisionWanted) return;
            const ok = /lista|OK|activa|controlando|HTTP/i.test(msg);
            setBadge(els.visionBadge, msg, ok ? "ok" : "info");
            if (els.visionStatus) els.visionStatus.textContent = msg;
          },
          onHint: (msg) => {
            if (!state.cursorVisionWanted) return;
            if (els.visionHint) els.visionHint.textContent = msg;
            if (msg && msg !== "—" && msg !== "Sin mano") {
              els.lastEvent.textContent = `Vision: ${msg}`;
            }
          }
        });
      } else {
        state.cursorVision.onAction = (evt) => sendVisionCursor(evt);
      }
      await state.cursorVision.start();
      if (!state.cursorVisionWanted) {
        state.cursorVision.stop();
        if (els.visionPip) els.visionPip.hidden = true;
        els.visionPip?.classList.remove("is-live");
        setBadge(els.visionBadge, "Vision: apagada", "info");
        return;
      }
      if (state.visionYielded) {
        state.cursorVision.stop();
        return;
      }
      if (bridgeOpen()) sendBridge("vision_claim", { owner: VISION_TAB_ID });
      state.visionOwner = VISION_TAB_ID;
      setBadge(els.visionBadge, "Vision: controlando PC", "ok");
      if (els.visionStatus) {
        els.visionStatus.textContent = "Indice=mover · Izq abierta=Win · Punio=borrar · Pulgar=clic der · Menique=clic izq";
      }
    } catch (err) {
      console.error(err);
      try { state.cursorVision?.stop(); } catch (_e) {}
      if (state.cursorVisionWanted && !state.visionYielded) {
        const text = String(err?.message || err || "");
        const busy = err?.name === "NotReadableError" || /in use|could not start|ocupad/i.test(text);
        const denied = err?.name === "NotAllowedError" || /permiso|denegad/i.test(text);
        const memory = /memoria|memory|oom|allocate|WebAssembly\.Memory/i.test(text);
        if (memory) {
          setBadge(els.visionBadge, "Vision: sin memoria", "bad");
          if (els.visionStatus) {
            els.visionStatus.textContent = text || "Memoria insuficiente para el modelo. Cierra pestanas y reintenta.";
          }
          els.lastEvent.textContent = "Vision: no se pudo cargar el modelo (memoria)";
        } else if (busy) {
          setBadge(els.visionBadge, "Vision: camara ocupada", "warn");
          if (els.visionStatus) els.visionStatus.textContent = "La camara la tiene otra app o pestaña (Zoom, Meet, otro navegador) · reintentando cada 3 s";
          scheduleVisionRetry();
        } else if (denied) {
          setBadge(els.visionBadge, "Vision: permiso denegado", "bad");
          if (els.visionStatus) els.visionStatus.textContent = "Permite la camara en el candado de la barra de direcciones y vuelve a entrar a CUR";
        } else {
          setBadge(els.visionBadge, "Vision: no disponible", "bad");
          if (els.visionStatus) els.visionStatus.textContent = text || "No se pudo iniciar la vision por computadora";
          scheduleVisionRetry();
        }
      }
    } finally {
      state.cursorVisionStarting = false;
    }
    return;
  }

  window.clearTimeout(state.visionRetryTimer);
  state.visionYielded = false;
  if (state.visionOwner === VISION_TAB_ID) {
    state.visionOwner = null;
    if (bridgeOpen()) sendBridge("vision_release", { owner: VISION_TAB_ID });
  }
  els.visionPip?.classList.remove("is-live");
  if (els.visionPip) els.visionPip.hidden = true;
  if (state.cursorVision) {
    try {
      state.cursorVision.stop();
    } catch (_err) {}
  }
  if (els.visionVideo) {
    try {
      els.visionVideo.pause();
    } catch (_e) {}
    els.visionVideo.srcObject = null;
  }
  if (els.visionCanvas) {
    const ctx = els.visionCanvas.getContext("2d");
    ctx?.clearRect(0, 0, els.visionCanvas.width, els.visionCanvas.height);
  }
  if (els.visionHint) els.visionHint.textContent = "—";
  if (els.visionStatus) els.visionStatus.textContent = "Camara apagada";
  setBadge(els.visionBadge, "Vision: apagada", "info");
  els.lastEvent.textContent = "Vision apagada al salir de CUR";
}

const MODE_ORDER = ["letters", "numbers", "cursor"];
const MODE_SHORT = { letters: "ABC", numbers: "123", cursor: "CUR" };
const MODE_LONG = { letters: "Letras", numbers: "Números", cursor: "Cursor" };
const MODE_DESC = { letters: "a–z con el guante", numbers: "0–9 y signos", cursor: "mouse con la cámara" };
const WHEEL_SECTORS = { letters: [-150, -30], numbers: [-30, 90], cursor: [90, 210] };
const WHEEL_GAP = 2.5;
const WHEEL_R_IN = 42;
const WHEEL_R_OUT = 92;

const modeWheel = {
  open: false,
  hover: null,
  holdKey: false,
  flashTimer: null,
  flashing: false,
  source: "mouse",
  dwellUntil: 0,
  dwellMs: 0,
  dwellRaf: 0,
  gloveConfirmAt: 0
};

function sectorCenter(mode) {
  const [a, b] = WHEEL_SECTORS[mode] || WHEEL_SECTORS.letters;
  return (a + b) / 2;
}

function polarArcPath(cx, cy, r, startDeg, endDeg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function polarSlicePath(cx, cy, rInner, rOuter, startDeg, endDeg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const sx = cx + rOuter * Math.cos(toRad(startDeg));
  const sy = cy + rOuter * Math.sin(toRad(startDeg));
  const ex = cx + rOuter * Math.cos(toRad(endDeg));
  const ey = cy + rOuter * Math.sin(toRad(endDeg));
  const sx2 = cx + rInner * Math.cos(toRad(endDeg));
  const sy2 = cy + rInner * Math.sin(toRad(endDeg));
  const ex2 = cx + rInner * Math.cos(toRad(startDeg));
  const ey2 = cy + rInner * Math.sin(toRad(startDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${sx} ${sy}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${ex} ${ey}`,
    `L ${sx2} ${sy2}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${ex2} ${ey2}`,
    "Z"
  ].join(" ");
}

function buildWheelSlices() {
  MODE_ORDER.forEach((mode) => {
    const path = document.querySelector(`.wheel-slice[data-mode="${mode}"]`);
    if (!path) return;
    const [start, end] = WHEEL_SECTORS[mode];
    path.setAttribute("d", polarSlicePath(100, 100, WHEEL_R_IN, WHEEL_R_OUT, start + WHEEL_GAP, end - WHEEL_GAP));
    const mid = (sectorCenter(mode) * Math.PI) / 180;
    path.style.setProperty("--dx", `${(Math.cos(mid) * 5).toFixed(2)}px`);
    path.style.setProperty("--dy", `${(Math.sin(mid) * 5).toFixed(2)}px`);
  });
}

function sectorArc(mode, r) {
  const [start, end] = WHEEL_SECTORS[mode] || WHEEL_SECTORS.letters;
  return polarArcPath(100, 100, r, start + WHEEL_GAP + 1, end - WHEEL_GAP - 1);
}

function angleToMode(angleDeg) {
  const a = ((angleDeg + 540) % 360) - 180;
  if (a >= -150 && a < -30) return "letters";
  if (a >= -30 && a < 90) return "numbers";
  return "cursor";
}

function pointNeedle(angleDeg) {
  const needle = document.querySelector("#wheelNeedle");
  if (needle) needle.style.setProperty("--needle", `${angleDeg + 90}deg`);
}

function markCurrentMode() {
  document.querySelectorAll(".wheel-slice, .wheel-item").forEach((el) => {
    el.classList.toggle("is-current", el.dataset.mode === state.mode);
  });
  document.querySelector("#wheelCurrentArc")?.setAttribute("d", sectorArc(state.mode, 99));
}

function setWheelHover(mode, { needle = true } = {}) {
  if (!MODE_ORDER.includes(mode)) return;
  modeWheel.hover = mode;
  document.querySelectorAll(".wheel-slice, .wheel-item").forEach((el) => {
    el.classList.toggle("is-hot", el.dataset.mode === mode);
  });
  const root = document.querySelector("#modeWheel");
  root?.setAttribute("data-hover", mode);
  const hubMode = document.querySelector("#wheelHubMode");
  const hubHint = document.querySelector("#wheelHubHint");
  const hubDesc = document.querySelector("#wheelHubDesc");
  if (hubMode) hubMode.textContent = MODE_SHORT[mode];
  if (hubHint) hubHint.textContent = MODE_LONG[mode];
  if (hubDesc && !modeWheel.dwellUntil) {
    hubDesc.textContent = mode === state.mode ? "modo actual" : MODE_DESC[mode];
  }
  document.querySelector("#wheelProgress")?.setAttribute("d", sectorArc(mode, 97));
  if (needle) pointNeedle(sectorCenter(mode));
}

function stopWheelDwell() {
  modeWheel.dwellUntil = 0;
  window.cancelAnimationFrame(modeWheel.dwellRaf);
  document.querySelector("#wheelProgress")?.classList.remove("is-running");
}

function startWheelDwell(ms) {
  stopWheelDwell();
  const progress = document.querySelector("#wheelProgress");
  if (progress) {
    progress.style.setProperty("--dwell", `${ms}ms`);
    void progress.getBoundingClientRect();
    progress.classList.add("is-running");
  }
  modeWheel.dwellMs = ms;
  modeWheel.dwellUntil = performance.now() + ms;
  const hubDesc = document.querySelector("#wheelHubDesc");
  const step = () => {
    if (!modeWheel.dwellUntil) return;
    const left = Math.max(0, modeWheel.dwellUntil - performance.now());
    if (hubDesc) hubDesc.textContent = `confirma en ${(left / 1000).toFixed(1)} s`;
    if (left > 0) modeWheel.dwellRaf = window.requestAnimationFrame(step);
  };
  step();
}

function openModeWheel({ source = "mouse" } = {}) {
  const root = document.querySelector("#modeWheel");
  if (!root) return;
  if (source !== "flash") {
    if (modeWheel.flashTimer) window.clearTimeout(modeWheel.flashTimer);
    modeWheel.flashTimer = null;
    modeWheel.flashing = false;
    root.classList.remove("is-confirmed");
  }
  modeWheel.source = source;
  root.dataset.source = source;
  const title = document.querySelector("#wheelTitle");
  if (title) title.textContent = source === "glove" ? "Guante · elige un modo" : "Elige un modo";
  if (modeWheel.open) return;
  modeWheel.open = true;
  root.hidden = false;
  root.classList.remove("is-closing", "is-confirmed");
  root.setAttribute("aria-hidden", "false");
  markCurrentMode();
  setWheelHover(state.mode);
}

function flashModeWheel(mode) {
  const target = MODE_ORDER.includes(mode) ? mode : state.mode;
  if (modeWheel.flashTimer) {
    window.clearTimeout(modeWheel.flashTimer);
    modeWheel.flashTimer = null;
  }
  modeWheel.flashing = true;
  if (!modeWheel.open) openModeWheel({ source: "flash" });
  markCurrentMode();
  setWheelHover(target);
  document.querySelector("#modeWheel")?.classList.add("is-confirmed");
  const fab = document.querySelector("#modeWheelBtn");
  fab?.classList.add("is-flash");
  window.setTimeout(() => fab?.classList.remove("is-flash"), 900);
  els.lastEvent.textContent = `Cambio de modo · ${MODE_LONG[target] || target}`;
  modeWheel.flashTimer = window.setTimeout(() => {
    modeWheel.flashing = false;
    modeWheel.flashTimer = null;
    if (modeWheel.open && !modeWheel.holdKey) closeModeWheel(false);
  }, 1100);
}

function closeModeWheel(apply = false) {
  const root = document.querySelector("#modeWheel");
  if (!root || !modeWheel.open) return;
  if (modeWheel.flashTimer) {
    window.clearTimeout(modeWheel.flashTimer);
    modeWheel.flashTimer = null;
  }
  stopWheelDwell();
  modeWheel.flashing = false;
  const chosen = modeWheel.hover || state.mode;
  if (!apply && modeWheel.source === "glove") sendBridge("mode_wheel_cancel");
  root.classList.add("is-closing");
  modeWheel.open = false;
  window.setTimeout(() => {
    if (modeWheel.open) return;
    root.hidden = true;
    root.classList.remove("is-closing", "is-confirmed");
    root.setAttribute("aria-hidden", "true");
  }, 220);
  if (apply && chosen) {
    setMode(chosen);
    els.lastEvent.textContent = `Modo: ${MODE_LONG[chosen]}`;
  }
}

function stepWheelHover(delta) {
  const idx = MODE_ORDER.indexOf(modeWheel.hover || state.mode);
  setWheelHover(MODE_ORDER[(idx + delta + MODE_ORDER.length) % MODE_ORDER.length]);
}

function handleGloveWheel(msg) {
  const hover = MODE_ORDER.includes(msg.hover) ? msg.hover : state.mode;
  const hubDesc = document.querySelector("#wheelHubDesc");
  if (msg.phase === "open") {
    hideComposer();
    openModeWheel({ source: "glove" });
    setWheelHover(hover);
    if (msg.armed) startWheelDwell(msg.dwell_ms || 2000);
    else {
      stopWheelDwell();
      if (hubDesc) hubDesc.textContent = "baja los dedos";
    }
    els.lastEvent.textContent = "Rueda de modos abierta con el guante";
  } else if (msg.phase === "armed" || msg.phase === "hover") {
    if (!modeWheel.open) openModeWheel({ source: "glove" });
    setWheelHover(hover);
    startWheelDwell(msg.dwell_ms || 2000);
    if (msg.phase === "hover") els.lastEvent.textContent = `Rueda · ${MODE_LONG[hover]}`;
  } else if (msg.phase === "confirm") {
    stopWheelDwell();
    modeWheel.gloveConfirmAt = performance.now();
    const chosen = MODE_ORDER.includes(msg.mode) ? msg.mode : hover;
    setWheelHover(chosen);
    document.querySelector("#modeWheel")?.classList.add("is-confirmed");
    if (hubDesc) hubDesc.textContent = "¡confirmado!";
    modeWheel.source = "bridge";
    modeWheel.flashing = true;
    window.setTimeout(() => {
      if (modeWheel.open && modeWheel.source === "bridge") closeModeWheel(false);
    }, 650);
  } else if (msg.phase === "cancel") {
    modeWheel.source = "bridge";
    closeModeWheel(false);
  }
}

function onWheelPointer(clientX, clientY) {
  const disk = document.querySelector("#modeWheelDisk");
  if (!disk || !modeWheel.open || modeWheel.source === "glove" || modeWheel.flashing) return;
  const rect = disk.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  if (Math.hypot(dx, dy) < rect.width * 0.2) return;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  setWheelHover(angleToMode(angle), { needle: false });
  pointNeedle(angle);
}

document.querySelector("#modeWheelBtn")?.addEventListener("click", () => {
  if (modeWheel.open) closeModeWheel(true);
  else openModeWheel({ source: "mouse" });
});

document.querySelector("#modeWheelBackdrop")?.addEventListener("click", () => closeModeWheel(false));

document.querySelectorAll(".wheel-slice, .wheel-item").forEach((el) => {
  el.addEventListener("pointerenter", () => {
    if (modeWheel.source !== "glove" && !modeWheel.flashing) setWheelHover(el.dataset.mode);
  });
  el.addEventListener("click", () => {
    setWheelHover(el.dataset.mode);
    closeModeWheel(true);
  });
});

window.addEventListener("pointermove", (event) => {
  if (!modeWheel.open) return;
  onWheelPointer(event.clientX, event.clientY);
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "KeyQ" || event.repeat) return;
  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  event.preventDefault();
  modeWheel.holdKey = true;
  openModeWheel({ source: "mouse" });
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "KeyQ") return;
  if (!modeWheel.holdKey) return;
  modeWheel.holdKey = false;
  closeModeWheel(true);
});

window.addEventListener("keydown", (event) => {
  if (!modeWheel.open) return;
  if (event.key === "Escape") {
    closeModeWheel(false);
    return;
  }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
  const direct = { Digit1: "letters", Digit2: "numbers", Digit3: "cursor", Numpad1: "letters", Numpad2: "numbers", Numpad3: "cursor" }[event.code];
  if (direct) {
    event.preventDefault();
    setWheelHover(direct);
    closeModeWheel(true);
  } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    stepWheelHover(1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    stepWheelHover(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    closeModeWheel(true);
  }
});

buildWheelSlices();

document.querySelector("#resetPoseBtn").addEventListener("click", () => resetPanel());
document.querySelector("#focusBtn").addEventListener("click", focusModel);
document.querySelector("#demoBtn").addEventListener("click", simulateEsp32);
const connectSerialBtn = document.querySelector("#connectSerialBtn");
if (connectSerialBtn) {
  connectSerialBtn.addEventListener("click", () => connectSerial().catch((error) => {
    console.error(error);
    setBadge(els.serialBadge, "ESP32: serial cancelado/error", "bad");
  }));
}
document.querySelector("#disconnectSerialBtn").addEventListener("click", () => disconnectSerial().catch(console.error));
els.connectWsBtn.addEventListener("click", connectWebSocket);
els.calibrateBtn.addEventListener("click", () => sendBridge("calibrate"));
els.startLabBtn.addEventListener("click", () => sendBridge("start"));
els.pauseLabBtn.addEventListener("click", () => sendBridge("stop"));
document.querySelector("#simulateBtn").addEventListener("click", simulateEsp32);
els.handButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const hand = button.dataset.hand === "l" ? "l" : "r";
    if (hand === state.hand) return;
    state.hand = hand;
    state.view = hand;
    els.handButtons.forEach((item) => {
      const on = item.dataset.hand === hand;
      item.classList.toggle("active", on);
      item.setAttribute("aria-checked", String(on));
    });
    isolateSelectedArm();
    placeHandsOnPlatform();
    updateBoneReport();
    syncSliders();
    applyPose();
    focusModel();
    els.lastEvent.textContent = `Guante en mano ${hand === "l" ? "izquierda" : "derecha"}`;
  });
});
els.visionPip?.addEventListener("click", () => {
  if (state.mode === "cursor" && !state.cursorVision?.running) syncCursorVision(true, { force: true });
});
els.copyTextBtn?.addEventListener("click", () => copyTextOutput());
els.backspaceBtn?.addEventListener("click", deletePreviousChar);
els.clearTextBtn?.addEventListener("click", clearTextOutput);
els.textOutput.addEventListener("input", updateTextStats);

createFingerControls();
syncSliders();
renderKeyboard();
setLink({});
updateTextStats();
loadModel();

if (els.connectWsBtn) {
  connectWebSocket();
}
