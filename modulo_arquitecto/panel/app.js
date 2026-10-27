import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const els = {
  sceneHost: document.querySelector("#sceneHost"),
  modelStatus: document.querySelector("#modelStatus"),
  loadBadge: document.querySelector("#loadBadge"),
  cameraBadge: document.querySelector("#cameraBadge"),
  modeBadge: document.querySelector("#modeBadge"),
  commandName: document.querySelector("#commandName"),
  commandGesture: document.querySelector("#commandGesture"),
  selectionLabel: document.querySelector("#selectionLabel"),
  hudFps: document.querySelector("#hudFps"),
  visionConfidence: document.querySelector("#visionConfidence"),
  lastEvent: document.querySelector("#lastEvent"),
  startCameraBtn: document.querySelector("#startCameraBtn"),
  stopCameraBtn: document.querySelector("#stopCameraBtn"),
  resetViewBtn: document.querySelector("#resetViewBtn"),
  addVolumeBtn: document.querySelector("#addVolumeBtn"),
  demoBtn: document.querySelector("#demoBtn"),
  duplicateBtn: document.querySelector("#duplicateBtn"),
  deleteBtn: document.querySelector("#deleteBtn"),
  snapBtn: document.querySelector("#snapBtn"),
  prevAssetBtn: document.querySelector("#prevAssetBtn"),
  nextAssetBtn: document.querySelector("#nextAssetBtn"),
  transformModeBadge: document.querySelector("#transformModeBadge"),
  modulePicker: document.querySelector("#modulePicker"),
  aimLabel: document.querySelector("#aimLabel"),
  objectInfo: document.querySelector("#objectInfo"),
  undoBtn: document.querySelector("#undoBtn"),
  helpOverlay: document.querySelector("#helpOverlay"),
  gestureGrid: document.querySelector("#gestureGrid"),
  visionVideo: document.querySelector("#visionVideo"),
  visionCanvas: document.querySelector("#visionCanvas"),
  visionStatus: document.querySelector("#visionStatus"),
  bootError: document.querySelector("#bootError"),
  handHudLeft: document.querySelector("#handHudLeft"),
  handHudRight: document.querySelector("#handHudRight"),
  mlBadge: document.querySelector("#mlBadge"),
  mlStatus: document.querySelector("#mlStatus"),
  recordGestureSelect: document.querySelector("#recordGestureSelect"),
  recordSampleBtn: document.querySelector("#recordSampleBtn"),
  recordStatus: document.querySelector("#recordStatus"),
  commandHud: document.querySelector("#commandHud"),
  visionPip: document.querySelector("#visionPip"),
  gestureToast: document.querySelector("#gestureToast"),
  hintStrip: document.querySelector("#hintStrip"),
  pipStartBtn: document.querySelector("#pipStartBtn"),
  snapshotBtn: document.querySelector("#snapshotBtn"),
  saveState: document.querySelector("#saveState"),
  statModules: document.querySelector("#statModules"),
  statArea: document.querySelector("#statArea"),
  statHeight: document.querySelector("#statHeight"),
  saveLayoutBtn: document.querySelector("#saveLayoutBtn"),
  loadLayoutBtn: document.querySelector("#loadLayoutBtn"),
  resetLayoutBtn: document.querySelector("#resetLayoutBtn"),
  exportLayoutBtn: document.querySelector("#exportLayoutBtn"),
  importLayoutBtn: document.querySelector("#importLayoutBtn"),
  importLayoutInput: document.querySelector("#importLayoutInput"),
  addKindSelect: document.querySelector("#addKindSelect"),
  addKindBtn: document.querySelector("#addKindBtn"),
  inspector: document.querySelector("#inspector"),
  inspectorEmpty: document.querySelector("#inspectorEmpty"),
  inspName: document.querySelector("#inspName"),
  inspDims: document.querySelector("#inspDims"),
  inspX: document.querySelector("#inspX"),
  inspY: document.querySelector("#inspY"),
  inspZ: document.querySelector("#inspZ"),
  inspRot: document.querySelector("#inspRot"),
  inspRotOut: document.querySelector("#inspRotOut"),
  inspScale: document.querySelector("#inspScale"),
  inspScaleOut: document.querySelector("#inspScaleOut")
};

const COLLECT_URL = "http://127.0.0.1:8091/sample";

const state = {
  visionActive: false,
  appMode: "edicion",
  activeAxis: "y",
  transformHold: false,
  orbitHold: false,
  objectId: 1,
  fpsFrames: 0,
  fpsLast: performance.now(),
  lastCommandSource: null,
  demoActive: false,
  panelReady: false,
  moveHold: false,
  rotateHold: false,
  palmMoveHold: false,
  palmMoveBase: null,
  palmMoveBasePos: null,
  smoothPalm: null,
  smoothRotAngle: null,
  smoothAim: null,
  manipVisualTick: 0,
  indexRotateBase: null,
  indexRotateBaseRot: null,
  scaleBaseDist: null,
  rotateBaseAngle: null,
  grabBasePos: null,
  grabAim: null,
  transformMode: "move",
  dragPointer: null,
  hovered: null,
  aimTarget: null,
  undoStack: [],
  leftPinchPrev: false,
  leftPinchCooldownAt: 0,
  pinchPreviewTarget: null,
  smoothAimX: null,
  recordingSamples: false,
  mlMode: "heuristic",
  camTween: null,
  view: "perspectiva",
  inspectorUndoArmed: true,
  dirty: false,
  demoRun: 0
};

const LAYOUT_KEY = "nexum_arquitecto_layout_v1";
const dbSession = window.NexumDB?.createSession("arquitecto") || null;
const COMMAND_GESTURES = {
  seleccionar: "pinza_izq",
  preview_modulo: "mano_abierta_izq",
  orbitar: "dos_palmas",
  transformar: "dos_pinzas",
  rotar: "indice_der",
  elevar: "palma_elev_der",
  mover: "palma_slide_der"
};
let lastLoggedCommand = "reposo";
const KIND_LABELS = {
  sala: "Sala",
  cocina: "Cocina",
  dormitorio: "Dormitorio",
  terraza: "Terraza",
  escalera: "Escalera",
  modulo: "Volumen"
};
const DEFAULT_LAYOUT = [
  { label: "Sala", kind: "sala", x: -2.5, z: -2 },
  { label: "Cocina", kind: "cocina", x: 1.5, z: -2 },
  { label: "Dormitorio", kind: "dormitorio", x: 5, z: 1 },
  { label: "Terraza", kind: "terraza", x: 0.5, z: 3.5 },
  { label: "Escalera", kind: "escalera", x: -0.5, z: 2.5 }
];

const BOUNDS = { minX: -5.5, maxX: 8.5, minZ: -5.5, maxZ: 5.5, minY: 0.35, maxY: 6 };
const MODULE_ORDER = ["sala", "cocina", "dormitorio", "terraza", "escalera", "modulo"];
const MODULE_ICONS = {
  sala: "🛋",
  cocina: "🍳",
  dormitorio: "🛏",
  terraza: "☀",
  escalera: "🪜",
  modulo: "📦"
};
const PICK_DIST_MAX2 = 0.32;
const PINCH_CYCLE_COOLDOWN = 460;

let scene;
let camera;
let renderer;
let controls;
let raycaster;
let pointer;
let pickables = [];
let selected = null;
let selectionHelper = null;
let grid;
let handGhosts;
let vision;
let labelRenderer;
let maquetteGroup;
let axisHelper;
let floorSnap;
let pulsePhase = 0;
const pickWorldVec = new THREE.Vector3();
const pickBox = new THREE.Box3();
const statsBox = new THREE.Box3();
const SLAB_TOP = 0.36;

const SNAP = 0.5;
const TRANSFORM_LABELS = { move: "Mover XZ", lift: "Subir/Bajar", rotate: "Rotar", scale: "Escalar" };
const COLORS = [0x2563eb, 0x0d9488, 0xc45c1a, 0x7c3aed, 0x94a3b8];

function setBadge(el, text, status = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("status-ok", "status-warn", "status-bad");
  if (status) el.classList.add(`status-${status}`);
}

function setLast(text) {
  if (els.lastEvent) els.lastEvent.textContent = text;
}

let toastTimer = 0;
function showGestureToast(text, ms = 900) {
  if (!els.gestureToast || !text) return;
  els.gestureToast.hidden = false;
  els.gestureToast.classList.remove("is-out");
  els.gestureToast.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.gestureToast.classList.add("is-out");
    window.setTimeout(() => {
      els.gestureToast.hidden = true;
      els.gestureToast.classList.remove("is-out");
    }, 260);
  }, ms);
}

function updateHintStrip(cameraOn) {
  if (!els.hintStrip) return;
  els.hintStrip.innerHTML = cameraOn
    ? `<span class="hint-chip">Pinza izq → siguiente</span>
       <span class="hint-chip">Palma der ←→ / ↑↓</span>
       <span class="hint-chip">Indice der rota</span>`
    : `<span class="hint-chip">1. Activa camara</span>
       <span class="hint-chip">2. Pinza izq elige</span>
       <span class="hint-chip">3. Palma der mueve</span>`;
}

function logCommand(name) {
  if (name === lastLoggedCommand) return;
  lastLoggedCommand = name;
  if (!dbSession || !name || name === "reposo") return;
  const extra = { parametrosEjecutados: { vista: state.appMode || "edicion" } };
  if (selected?.userData?.label) extra.codigoObjetivoAfectado = selected.userData.label;
  dbSession.log(name, COMMAND_GESTURES[name] || "interfaz_panel", extra);
}

function highlightCommand(name) {
  logCommand(name);
  const display = name === "preview_modulo" ? "seleccionar" : name === "ciclar_modulo" ? "seleccionar" : name;
  document.querySelectorAll("#gestureGrid .gesture-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.cmd === display && display !== "reposo");
  });
  const label = name === "preview_modulo" ? "previsualizar" : name === "ciclar_modulo" ? "seleccionar" : (name || "reposo");
  if (els.commandName) {
    els.commandName.textContent = label;
    els.commandName.classList.toggle("is-active", label && label !== "reposo");
  }
  if (els.commandHud) {
    const mode = label === "reposo" ? "idle" : label;
    els.commandHud.dataset.mode = mode;
  }
}

function updateSelectionLabel() {
  if (!els.selectionLabel) return;
  els.selectionLabel.textContent = selected
    ? `Seleccion: ${selected.userData.label}`
    : "Sin seleccion";
  if (els.objectInfo) {
    if (!selected) {
      els.objectInfo.textContent = "—";
      return;
    }
    const p = selected.position;
    els.objectInfo.textContent = `X ${p.x.toFixed(1)} · Y ${(p.y - SLAB_TOP).toFixed(2)} · Z ${p.z.toFixed(1)} · ${(selected.scale.x * 100).toFixed(0)}%`;
  }
}

function canEdit() {
  return state.appMode === "edicion";
}

function visionControlReady() {
  return state.visionActive || state.demoActive;
}

function sortPickables() {
  pickables.sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a.userData.kind);
    const ib = MODULE_ORDER.indexOf(b.userData.kind);
    const ra = ia === -1 ? 99 : ia;
    const rb = ib === -1 ? 99 : ib;
    return ra - rb || a.userData.id - b.userData.id;
  });
}

function moduleIcon(kind) {
  return MODULE_ICONS[kind] || MODULE_ICONS.modulo;
}

function measureFootprint(mesh) {
  const rot = mesh.rotation.clone();
  const scale = mesh.scale.clone();
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  mesh.rotation.copy(rot);
  mesh.scale.copy(scale);
  mesh.updateMatrixWorld(true);
  return { w: size.x, d: size.z, h: size.y };
}

function moduleArea(mesh) {
  const fp = mesh.userData.footprint;
  if (!fp) return 0;
  return fp.w * fp.d * mesh.scale.x * mesh.scale.z;
}

function updateProjectStats() {
  if (!els.statModules) return;
  let area = 0;
  let top = 0;
  for (const mesh of pickables) {
    area += moduleArea(mesh);
    statsBox.setFromObject(mesh);
    top = Math.max(top, statsBox.max.y - SLAB_TOP);
  }
  els.statModules.textContent = String(pickables.length);
  els.statArea.textContent = area.toFixed(1);
  els.statHeight.textContent = top.toFixed(1);
  checkDirty();
}

function serializeLayout() {
  sortPickables();
  const r = (v) => Math.round(v * 100) / 100;
  return pickables.map((mesh) => ({
    label: mesh.userData.label,
    kind: mesh.userData.kind,
    x: r(mesh.position.x),
    y: r(mesh.position.y),
    z: r(mesh.position.z),
    rot: r(mesh.rotation.y),
    scale: r(mesh.scale.x)
  }));
}

function checkDirty() {
  if (state.savedJson == null) return;
  const dirty = JSON.stringify(serializeLayout()) !== state.savedJson;
  if (dirty === state.dirty && els.saveState?.dataset.ready) return;
  state.dirty = dirty;
  if (!els.saveState) return;
  els.saveState.dataset.ready = "1";
  els.saveState.textContent = dirty ? "Cambios sin guardar" : state.savedLabel || "Sin cambios";
  els.saveState.classList.toggle("is-dirty", dirty);
  els.saveState.classList.toggle("is-saved", !dirty);
}

function markSaved(label) {
  state.savedJson = JSON.stringify(serializeLayout());
  state.savedLabel = label;
  if (els.saveState) delete els.saveState.dataset.ready;
  checkDirty();
}

function renderModulePicker() {
  if (!els.modulePicker) return;
  sortPickables();
  els.modulePicker.innerHTML = "";
  pickables.forEach((mesh) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "module-chip";
    if (mesh === selected) btn.classList.add("is-active");
    if (mesh === state.pinchPreviewTarget && mesh !== selected) btn.classList.add("is-next");
    btn.dataset.id = String(mesh.userData.id);
    const order = pickables.indexOf(mesh) + 1;
    const tag = mesh === selected ? "activo" : mesh === state.pinchPreviewTarget ? "pinza →" : "";
    btn.innerHTML = `<span class="module-chip-order">${order}</span><span class="module-chip-icon" aria-hidden="true">${moduleIcon(mesh.userData.kind)}</span><span class="module-chip-label">${mesh.userData.label}<small>${moduleArea(mesh).toFixed(1)} m²</small></span><span class="module-chip-hand">${tag}</span>`;
    btn.addEventListener("click", () => {
      pushUndo();
      selectObject(mesh);
      setLast(`Panel: ${mesh.userData.label}`);
    });
    els.modulePicker.appendChild(btn);
  });
  updateProjectStats();
}

function updateAimLabel(hit, preview = false) {
  if (!els.aimLabel) return;
  if (!hit) {
    els.aimLabel.textContent = "Mano izq: junta pulgar+indice para elegir en orden";
    els.aimLabel.classList.remove("is-on");
    return;
  }
  sortPickables();
  const idx = pickables.indexOf(hit) + 1;
  if (preview) {
    els.aimLabel.textContent = `Pinza -> ${hit.userData.label} (${idx}/${pickables.length})`;
  } else {
    els.aimLabel.textContent = `Activo: ${hit.userData.label} (${idx}/${pickables.length})`;
  }
  els.aimLabel.classList.add("is-on");
}

function updateLeftPinchPreview() {
  if (!pickables.length) {
    state.pinchPreviewTarget = null;
    return;
  }
  sortPickables();
  const idx = selected ? pickables.indexOf(selected) : -1;
  const nextIdx = (idx + 1) % pickables.length;
  state.pinchPreviewTarget = pickables[nextIdx];
  renderModulePicker();
  updateAimLabel(state.pinchPreviewTarget, true);
  setHovered(state.pinchPreviewTarget);
}

function flashModulePicker() {
  if (!selected || !els.modulePicker) return;
  const chip = els.modulePicker.querySelector(`[data-id="${selected.userData.id}"]`);
  if (!chip) return;
  chip.classList.add("is-pinch-flash");
  window.setTimeout(() => chip.classList.remove("is-pinch-flash"), 520);
}

function advanceLeftPinchSelection(source = "camara") {
  const now = performance.now();
  if (now - state.leftPinchCooldownAt < PINCH_CYCLE_COOLDOWN) return false;
  if (!pickables.length || !canEdit()) return false;

  state.leftPinchCooldownAt = now;
  sortPickables();
  const prevLabel = selected?.userData?.label || "—";
  cycleSelection(1);
  flashModulePicker();
  highlightCommand("seleccionar");
  if (els.commandGesture) {
    els.commandGesture.textContent = `pinza izq · ${prevLabel} -> ${selected?.userData?.label || "—"} · ${source}`;
  }
  if (els.handHudLeft) {
    els.handHudLeft.textContent = `Izq: ${selected?.userData?.label || "—"}`;
    els.handHudLeft.classList.add("is-on", "is-pinch");
  }
  setLast(`Modulo ${selected?.userData?.label || "—"} (${pickables.indexOf(selected) + 1}/${pickables.length})`);
  return true;
}

function selectObject(obj) {
  if (obj !== selected) {
    if (state.rotateHold) endIndexRotate(false);
    if (state.palmMoveHold) endPalmMove();
  }
  selected = obj || null;
  if (obj) {
    state.aimTarget = obj;
  } else {
    state.aimTarget = null;
  }
  pickables.forEach((mesh) => {
    const isSel = mesh === selected;
    const isNext = mesh === state.pinchPreviewTarget && !isSel;
    const isHover = mesh === state.hovered && !isSel && !isNext;
    applyModuleEmissive(mesh, isSel ? 0.55 : isNext ? 0.42 : isHover ? 0.32 : 0.16);
  });
  if (selected) {
    selected.userData.baseScale = selected.scale.x;
  }
  state.inspectorUndoArmed = true;
  updateLabelStates();
  refreshSelectionVisuals();
  updateSelectionLabel();
  renderModulePicker();
  updateAimLabel(state.aimTarget);
  updateInspector(true);
}

function updateLabelStates() {
  for (const mesh of pickables) {
    const el = mesh.userData.labelEl;
    if (!el) continue;
    el.classList.toggle("is-selected", mesh === selected);
    el.classList.toggle("is-next", mesh === state.pinchPreviewTarget && mesh !== selected);
  }
}

function normDeg(rad) {
  const deg = Math.round(THREE.MathUtils.radToDeg(rad)) % 360;
  return deg < 0 ? deg + 360 : deg;
}

function updateInspector(force = false) {
  if (!els.inspector) return;
  const show = Boolean(selected);
  els.inspector.hidden = !show;
  if (els.inspectorEmpty) els.inspectorEmpty.hidden = show;
  if (!show) return;
  const active = document.activeElement;
  const setVal = (input, value) => {
    if (!input || (!force && input === active)) return;
    input.value = value;
  };
  const p = selected.position;
  setVal(els.inspName, selected.userData.label);
  setVal(els.inspX, p.x.toFixed(2));
  setVal(els.inspY, (p.y - SLAB_TOP).toFixed(2));
  setVal(els.inspZ, p.z.toFixed(2));
  const deg = normDeg(selected.rotation.y);
  const pct = Math.round(selected.scale.x * 100);
  setVal(els.inspRot, deg);
  setVal(els.inspScale, pct);
  if (els.inspRotOut) els.inspRotOut.textContent = `${deg}°`;
  if (els.inspScaleOut) els.inspScaleOut.textContent = `${pct}%`;
  const fp = selected.userData.footprint;
  if (els.inspDims && fp) {
    const s = selected.scale.x;
    els.inspDims.innerHTML = `<b>${(fp.w * s).toFixed(1)} × ${(fp.d * s).toFixed(1)} m</b> · alto ${(fp.h * s).toFixed(1)} m · <b>${moduleArea(selected).toFixed(1)} m²</b>`;
  }
}

function applyInspectorInput(event) {
  if (!selected || !canEdit()) return;
  if (state.inspectorUndoArmed) {
    pushUndo();
    state.inspectorUndoArmed = false;
  }
  const t = event.target;
  const num = Number(t.value);
  if (t === els.inspX && Number.isFinite(num)) selected.position.x = num;
  if (t === els.inspY && Number.isFinite(num)) selected.position.y = num + SLAB_TOP;
  if (t === els.inspZ && Number.isFinite(num)) selected.position.z = num;
  if (t === els.inspRot) selected.rotation.y = THREE.MathUtils.degToRad(num);
  if (t === els.inspScale) {
    selected.scale.setScalar(num / 100);
    selected.userData.baseScale = num / 100;
  }
  refreshSelectionVisuals();
  if (t === els.inspScale) renderModulePicker();
}

function renameSelected(name) {
  const label = name.trim().slice(0, 24);
  if (!selected || !label || label === selected.userData.label) return;
  selected.userData.label = label;
  if (selected.userData.labelEl) selected.userData.labelEl.textContent = label;
  renderModulePicker();
  updateSelectionLabel();
  setLast(`Renombrado: ${label}`);
}

function setHovered(obj) {
  if (state.hovered === obj) return;
  state.hovered = obj;
  pickables.forEach((mesh) => {
    if (mesh === selected) return;
    const isNext = mesh === state.pinchPreviewTarget;
    const isHover = mesh === obj;
    applyModuleEmissive(mesh, isNext ? 0.42 : isHover ? 0.32 : 0.16);
  });
  updateLabelStates();
  renderModulePicker();
}

function showBootError(message) {
  if (els.bootError) {
    els.bootError.hidden = false;
    els.bootError.textContent = message;
  }
  setLast(message);
}

function pushUndo() {
  if (!selected || !canEdit()) return;
  state.undoStack.push({
    mesh: selected,
    position: selected.position.clone(),
    rotation: selected.rotation.clone(),
    scale: selected.scale.clone()
  });
  if (state.undoStack.length > 24) state.undoStack.shift();
}

function undoLast() {
  const entry = state.undoStack.pop();
  if (!entry || !entry.mesh.parent) {
    setLast("Nada que deshacer");
    return;
  }
  selectObject(entry.mesh);
  entry.mesh.position.copy(entry.position);
  entry.mesh.rotation.copy(entry.rotation);
  entry.mesh.scale.copy(entry.scale);
  refreshSelectionVisuals();
  updateInspector(true);
  renderModulePicker();
  setLast(`Deshecho: ${entry.mesh.userData.label}`);
}

function moduleHalfHeight(mesh) {
  return (mesh.userData?.visualHeight || getModuleHeight(mesh)) * mesh.scale.y * 0.5;
}

function clampPosition(mesh) {
  if (!mesh) return;
  const half = moduleHalfHeight(mesh);
  mesh.position.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, mesh.position.x));
  mesh.position.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, mesh.position.z));
  mesh.position.y = Math.max(half + BOUNDS.minY, Math.min(BOUNDS.maxY, mesh.position.y));
}

function initScene() {
  const host = els.sceneHost;
  if (!host) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1628);
  scene.fog = new THREE.Fog(0x0a1628, 35, 90);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(14, 10, 16);

  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.classList.add("scene-canvas");
  host.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "scene-labels";
  host.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(2, 2.5, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 6;
  controls.maxDistance = 45;
  controls.addEventListener("start", () => {
    if (!state.camTween) return;
    state.camTween = null;
  });

  scene.add(new THREE.AmbientLight(0x404860, 0.55));
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.1);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(12, 20, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x60a5fa, 0.65);
  fill.position.set(-10, 8, -8);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x2dd4bf, 0.35);
  rim.position.set(0, 6, -14);
  scene.add(rim);

  grid = new THREE.GridHelper(36, 72, 0x3b82f6, 0x152238);
  grid.position.y = 0.02;
  scene.add(grid);

  floorSnap = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 36),
    new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.04,
      depthWrite: false
    })
  );
  floorSnap.rotation.x = -Math.PI / 2;
  floorSnap.position.set(2, 0.03, 0);
  scene.add(floorSnap);

  maquetteGroup = new THREE.Group();
  scene.add(maquetteGroup);
  buildArchitecturalMaquette();
  createHandGhosts();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xfbbf24);
  selectionHelper.material.transparent = true;
  selectionHelper.material.opacity = 0.85;
  selectionHelper.visible = false;
  scene.add(selectionHelper);

  axisHelper = new THREE.AxesHelper(2.2);
  axisHelper.visible = false;
  scene.add(axisHelper);

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerHover);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("keydown", onKeyDown);
  renderer.domElement.style.cursor = "grab";

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => onResize()).observe(host);
  }
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => {
    onResize();
    frameCameraOnMaquette();
    if (pickables[0]) selectObject(pickables[0]);
    renderModulePicker();
  });
  animate();
  setBadge(els.loadBadge, `${pickables.length} modulos`, "ok");
  if (els.modelStatus) {
    els.modelStatus.textContent = "Maqueta modular · sin muros · camara, mouse o teclado.";
  }
}

function addModuleLabel(mesh, text) {
  mesh.children.filter((child) => child.isCSS2DObject).forEach((child) => {
    child.element?.remove();
    mesh.remove(child);
  });
  const div = document.createElement("div");
  div.className = "asset-label";
  div.textContent = text;
  mesh.userData.labelEl = div;
  const label = new CSS2DObject(div);
  const h = mesh.userData?.visualHeight || getModuleHeight(mesh);
  label.position.set(0, h / 2 + 0.4, 0);
  mesh.add(label);
}

function frameCameraOnMaquette() {
  if (!camera || !controls || !pickables.length) return;
  const box = new THREE.Box3();
  pickables.forEach((obj) => box.expandByObject(obj));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 4);
  camera.position.set(center.x + radius * 1.1, center.y + radius * 0.75, center.z + radius * 1.1);
  controls.target.copy(center);
  controls.update();
}

function moduleMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.38,
    metalness: opts.metalness ?? 0.24,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.2,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1
  });
}

function moduleBox(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function moduleCyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function applyModuleEmissive(obj, intensity) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.isMesh && child.material?.emissive) {
      child.material.emissiveIntensity = intensity;
    }
  });
}

function getModuleHeight(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return box.getSize(new THREE.Vector3()).y || 1;
}

function disposeModule(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  });
}

function cloneModule(src) {
  const cloned = src.clone(true);
  cloned.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material = child.material.clone();
    if (child.material.emissive?.clone) child.material.emissive = child.material.emissive.clone();
  });
  return cloned;
}

function createModuleGroup(kind) {
  const group = new THREE.Group();
  const dark = moduleMat(0x1e293b, { roughness: 0.65, emissiveIntensity: 0.08 });
  const trim = moduleMat(0x38bdf8, { metalness: 0.45, emissiveIntensity: 0.28 });

  if (kind === "sala") {
    const floor = moduleMat(0x1d4ed8, { roughness: 0.5, emissiveIntensity: 0.14 });
    const fabric = moduleMat(0x2563eb, { roughness: 0.82, emissiveIntensity: 0.18 });
    const wood = moduleMat(0x92400e, { roughness: 0.7, metalness: 0.05, emissiveIntensity: 0.1 });
    group.add(moduleBox(3.2, 0.12, 2.8, floor, 0, 0.06, 0));
    group.add(moduleBox(1.8, 0.42, 0.75, fabric, -0.45, 0.33, 0.55));
    group.add(moduleBox(0.75, 0.42, 1.5, fabric, -0.95, 0.33, -0.15));
    group.add(moduleBox(0.9, 0.22, 0.55, wood, 0.35, 0.23, -0.2));
    group.add(moduleCyl(0.06, 0.08, 1.1, trim, 1.1, 0.65, -0.85));
    group.add(moduleBox(0.28, 0.14, 0.28, moduleMat(0xfbbf24, { emissiveIntensity: 0.45 }), 1.1, 1.25, -0.85));
    group.userData.visualHeight = 1.45;
  } else if (kind === "cocina") {
    const counter = moduleMat(0x475569, { roughness: 0.35, metalness: 0.35, emissiveIntensity: 0.12 });
    const tile = moduleMat(0xea580c, { roughness: 0.45, emissiveIntensity: 0.22 });
    const steel = moduleMat(0x94a3b8, { metalness: 0.7, roughness: 0.25, emissiveIntensity: 0.1 });
    group.add(moduleBox(2.8, 0.9, 0.55, counter, -0.4, 0.45, -0.95));
    group.add(moduleBox(0.55, 0.9, 2.2, counter, -1.15, 0.45, 0.1));
    group.add(moduleBox(2.6, 0.06, 2.4, tile, 0, 0.93, 0));
    group.add(moduleBox(0.7, 0.08, 0.55, steel, -0.35, 0.98, -0.55));
    group.add(moduleBox(0.55, 1.6, 0.55, steel, 0.95, 0.8, -0.85));
    group.add(moduleBox(0.9, 0.35, 0.7, moduleMat(0x1e293b, { emissiveIntensity: 0.15 }), 0.95, 1.65, -0.85));
    group.add(moduleCyl(0.04, 0.04, 0.35, trim, -0.9, 1.1, 0.55));
    group.userData.visualHeight = 1.85;
  } else if (kind === "dormitorio") {
    const bed = moduleMat(0x6d28d9, { roughness: 0.75, emissiveIntensity: 0.2 });
    const pillow = moduleMat(0xa78bfa, { roughness: 0.85, emissiveIntensity: 0.25 });
    const wood = moduleMat(0x4c1d95, { roughness: 0.55, emissiveIntensity: 0.14 });
    group.add(moduleBox(2.2, 0.35, 1.6, bed, 0, 0.22, 0));
    group.add(moduleBox(2.2, 0.55, 0.12, wood, 0, 0.52, -0.74));
    group.add(moduleBox(0.55, 0.18, 0.45, pillow, -0.55, 0.47, -0.35));
    group.add(moduleBox(0.55, 0.18, 0.45, pillow, 0.55, 0.47, -0.35));
    group.add(moduleBox(0.45, 0.55, 0.45, wood, -1.15, 0.32, 0.55));
    group.add(moduleBox(0.9, 1.7, 0.35, moduleMat(0x7c3aed, { emissiveIntensity: 0.16 }), 1.05, 0.85, -0.55));
    group.add(moduleBox(0.08, 1.5, 0.9, trim, 1.05, 0.9, -0.55));
    group.userData.visualHeight = 1.75;
  } else if (kind === "terraza") {
    const deck = moduleMat(0x0d9488, { roughness: 0.68, metalness: 0.08, emissiveIntensity: 0.18 });
    const rail = moduleMat(0x14b8a6, { metalness: 0.35, emissiveIntensity: 0.22 });
    const plant = moduleMat(0x22c55e, { roughness: 0.8, emissiveIntensity: 0.3 });
    group.add(moduleBox(4, 0.18, 2.2, deck, 0, 0.09, 0));
    for (const x of [-1.7, 1.7]) {
      group.add(moduleCyl(0.05, 0.05, 0.65, rail, x, 0.42, -0.95));
      group.add(moduleBox(0.08, 0.08, 1.8, rail, x, 0.72, 0));
    }
    group.add(moduleBox(3.5, 0.08, 0.08, rail, 0, 0.72, -0.95));
    group.add(moduleCyl(0.35, 0.28, 0.45, plant, -1.2, 0.38, 0.45));
    group.add(moduleCyl(0.22, 0.18, 0.35, moduleMat(0x16a34a, { emissiveIntensity: 0.35 }), -1.2, 0.72, 0.45));
    group.add(moduleBox(0.85, 0.35, 0.55, moduleMat(0x115e59, { emissiveIntensity: 0.15 }), 1.1, 0.32, 0.35));
    group.userData.visualHeight = 0.85;
  } else if (kind === "escalera") {
    const step = moduleMat(0x64748b, { roughness: 0.45, metalness: 0.2, emissiveIntensity: 0.14 });
    const accent = moduleMat(0xf59e0b, { metalness: 0.4, emissiveIntensity: 0.32 });
    for (let i = 0; i < 6; i += 1) {
      group.add(moduleBox(1.2, 0.14, 0.38, step, 0, 0.07 + i * 0.22, -0.45 + i * 0.18));
    }
    group.add(moduleBox(0.12, 1.45, 1.15, dark, -0.48, 0.72, 0.05));
    group.add(moduleBox(0.12, 1.45, 1.15, dark, 0.48, 0.72, 0.05));
    group.add(moduleBox(1.05, 0.06, 0.06, accent, 0, 1.42, 0.55));
    group.userData.visualHeight = 1.55;
  } else {
    const color = COLORS[pickables.length % COLORS.length];
    const mat = moduleMat(color);
    group.add(moduleBox(1.8, 1.2, 1.8, mat));
    group.userData.visualHeight = 1.2;
  }

  group.traverse((child) => {
    if (child.isMesh) child.userData.isModulePart = true;
  });
  return group;
}

function addPickable(mesh, label, kind = "modulo") {
  const visualHeight = mesh.userData?.visualHeight;
  const footprint = mesh.userData?.footprint;
  mesh.userData = {
    id: state.objectId++,
    label,
    kind,
    selectable: true,
    visualHeight
  };
  mesh.userData.footprint = footprint || measureFootprint(mesh);
  maquetteGroup.add(mesh);
  pickables.push(mesh);
  addModuleLabel(mesh, label);
  return mesh;
}

function spawnModule(item) {
  const kind = KIND_LABELS[item.kind] ? item.kind : "modulo";
  const group = createModuleGroup(kind);
  const halfH = (group.userData.visualHeight || 1) * 0.5;
  group.position.set(item.x ?? 0, item.y ?? SLAB_TOP + halfH, item.z ?? 0);
  group.rotation.y = item.rot || 0;
  group.scale.setScalar(item.scale || 1);
  group.castShadow = true;
  group.receiveShadow = true;
  addPickable(group, item.label || KIND_LABELS[kind], kind);
  clampPosition(group);
  return group;
}

function clearModules() {
  for (const mesh of pickables) {
    mesh.children.filter((child) => child.isCSS2DObject).forEach((child) => child.element?.remove());
    maquetteGroup.remove(mesh);
    disposeModule(mesh);
  }
  pickables = [];
  selected = null;
  state.pinchPreviewTarget = null;
  state.hovered = null;
  state.undoStack = [];
}

function loadLayout(items, message) {
  if (!Array.isArray(items) || !items.length) {
    setLast("La maqueta no tiene modulos validos");
    return false;
  }
  if (state.demoActive) stopDemo();
  resetManipulation();
  clearModules();
  items.forEach((item) => spawnModule(item));
  sortPickables();
  selectObject(pickables[0] || null);
  updateLeftPinchPreview();
  setBadge(els.loadBadge, `${pickables.length} modulos`, "ok");
  if (message) {
    setLast(message);
    showGestureToast(message, 1100);
  }
  return true;
}

function nextModuleName(kind) {
  const base = KIND_LABELS[kind] || "Modulo";
  const used = new Set(pickables.map((m) => m.userData.label));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function saveMaqueta() {
  const data = { version: 1, savedAt: new Date().toISOString(), modules: serializeLayout() };
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  } catch (err) {
    setLast(`No se pudo guardar: ${err?.message || err}`);
    return;
  }
  const time = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  markSaved(`Guardado ${time}`);
  if (els.loadLayoutBtn) els.loadLayoutBtn.textContent = "Cargar guardada";
  setLast(`Maqueta guardada (${data.modules.length} modulos)`);
  showGestureToast("Maqueta guardada", 900);
  saveLayoutRemote(data.modules);
}

async function saveLayoutRemote(modules) {
  if (!dbSession) return;
  const code = dbSession.code || await dbSession.start();
  if (!code) return;
  const r = (v) => Math.round(v * 100) / 100;
  const cam = camera && controls
    ? {
        posicion: { x: r(camera.position.x), y: r(camera.position.y), z: r(camera.position.z) },
        objetivo: { x: r(controls.target.x), y: r(controls.target.y), z: r(controls.target.z) }
      }
    : {};
  try {
    await window.NexumDB.saveScene(code, "Maqueta NEXUM", modules, cam);
    setLast(`Maqueta guardada en MongoDB (${modules.length} modulos)`);
  } catch (err) {
    setLast(`Guardada solo en este navegador: ${err?.message || err}`);
  }
}

async function loadLayoutRemote() {
  if (!window.NexumDB) return null;
  try {
    const scene = await window.NexumDB.latestScene();
    if (!scene?.objetosEscena?.length) return null;
    return { modules: scene.objetosEscena, savedAt: scene.fechaActualizacion };
  } catch (_err) {
    return null;
  }
}

async function loadMaqueta() {
  let data = await loadLayoutRemote();
  if (!data) {
    try {
      data = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    } catch (_err) {
      data = null;
    }
  }
  if (!data?.modules?.length) {
    setLast("No hay una maqueta guardada en este navegador");
    showGestureToast("Nada guardado aun", 1000);
    return;
  }
  if (loadLayout(data.modules, "Maqueta cargada")) {
    const time = new Date(data.savedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    markSaved(`Guardado ${time}`);
  }
}

function resetLayout() {
  if (loadLayout(DEFAULT_LAYOUT, "Maqueta restablecida")) {
    frameCameraOnMaquette();
    markSaved("Maqueta original");
  }
}

function downloadFile(name, href) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportLayoutJson() {
  const data = { version: 1, proyecto: "Casa modular", savedAt: new Date().toISOString(), modules: serializeLayout() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadFile(`nexum-maqueta-${Date.now()}.json`, url);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  setLast(`Exportado JSON (${data.modules.length} modulos)`);
}

async function importLayoutFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const modules = Array.isArray(data) ? data : data.modules;
    if (loadLayout(modules, `Importado: ${file.name}`)) {
      frameCameraOnMaquette();
      markSaved("Importado");
    }
  } catch (err) {
    setLast(`JSON invalido: ${err?.message || err}`);
  }
}

function captureSnapshot() {
  if (!renderer) return;
  const helperVisible = selectionHelper.visible;
  const axisVisible = axisHelper?.visible;
  selectionHelper.visible = false;
  if (axisHelper) axisHelper.visible = false;
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  selectionHelper.visible = helperVisible;
  if (axisHelper) axisHelper.visible = axisVisible;
  downloadFile(`nexum-maqueta-${Date.now()}.png`, url);
  setLast("Captura PNG descargada");
  showGestureToast("Captura guardada", 900);
}

function maquetteFrame() {
  const box = new THREE.Box3();
  pickables.forEach((obj) => box.expandByObject(obj));
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(2, 1, 0), new THREE.Vector3(8, 2, 8));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { center, radius: Math.max(size.x, size.y, size.z, 4) };
}

function animateCameraTo(pos, target, ms = 700) {
  state.camTween = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: pos,
    toTarget: target,
    start: performance.now(),
    ms
  };
}

const VIEW_LABELS = { perspectiva: "Vista 3D", planta: "Planta", frente: "Frente", lado: "Lado" };

function setView(view) {
  if (!camera || !controls) return;
  const { center, radius } = maquetteFrame();
  const target = center.clone();
  let pos;
  if (view === "planta") {
    pos = new THREE.Vector3(center.x, center.y + radius * 2.1, center.z + 0.01);
  } else if (view === "frente") {
    pos = new THREE.Vector3(center.x, center.y + radius * 0.32, center.z + radius * 1.9);
  } else if (view === "lado") {
    pos = new THREE.Vector3(center.x + radius * 1.9, center.y + radius * 0.32, center.z);
  } else {
    view = "perspectiva";
    pos = new THREE.Vector3(center.x + radius * 1.1, center.y + radius * 0.75, center.z + radius * 1.1);
  }
  state.view = view;
  animateCameraTo(pos, target);
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === view);
  });
  setLast(`Vista: ${VIEW_LABELS[view]}`);
}

function stepCameraTween(now) {
  const tw = state.camTween;
  if (!tw) return;
  const t = Math.min(1, (now - tw.start) / tw.ms);
  const e = 1 - (1 - t) ** 3;
  camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
  controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
  if (t >= 1) state.camTween = null;
}

function buildArchitecturalMaquette() {
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.35, 14),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88, metalness: 0.15 })
  );
  slab.position.set(2, 0.18, 0);
  slab.receiveShadow = true;
  maquetteGroup.add(slab);

  DEFAULT_LAYOUT.forEach((item) => spawnModule(item));

  const site = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshStandardMaterial({ color: 0x070d18, roughness: 0.95 })
  );
  site.rotation.x = -Math.PI / 2;
  site.position.y = 0;
  site.receiveShadow = true;
  maquetteGroup.add(site);
  sortPickables();
}

function createHandGhosts() {
  handGhosts = { Left: null, Right: null };
  const KEY_LM = [0, 4, 8, 12, 16, 20];
  for (const side of ["Left", "Right"]) {
    const group = new THREE.Group();
    group.visible = false;
    group.userData.keyLm = KEY_LM;
    const color = side === "Left" ? 0x60a5fa : 0x2dd4bf;
    const dotMat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.SphereGeometry(0.09, 6, 6);
    for (let i = 0; i < KEY_LM.length; i += 1) {
      group.add(new THREE.Mesh(geo, dotMat));
    }
    group.position.set(side === "Left" ? -4 : 4, 4, 4);
    scene.add(group);
    handGhosts[side] = group;
  }
}

function updateHandGhosts(handsData) {
  if (!handGhosts) return;
  for (const side of ["Left", "Right"]) {
    const ghost = handGhosts[side];
    const hand = handsData?.hands?.find((h) => h.side === side);
    if (!hand) {
      ghost.visible = false;
      continue;
    }
    ghost.visible = true;
    const keys = ghost.userData.keyLm || [0, 4, 8, 12, 16, 20];
    keys.forEach((lmIdx, i) => {
      const lm = hand.landmarks[lmIdx];
      const dot = ghost.children[i];
      if (!dot || !lm) return;
      dot.position.set((lm.x - 0.5) * 8, (0.5 - lm.y) * 6, (lm.z || 0) * -3);
    });
  }
}

function updateHandHud(bimanual) {
  const setHand = (el, label, active, mode, extraClass = "") => {
    if (!el) return;
    el.textContent = `${label}: ${active ? mode : "—"}`;
    el.classList.toggle("is-on", active);
    el.classList.toggle("is-pinch", extraClass === "pinch");
  };
  if (!bimanual) {
    setHand(els.handHudLeft, "Izq", false, "");
    setHand(els.handHudRight, "Der", false, "");
    if (els.handHudLeft) els.handHudLeft.classList.remove("is-pinch");
    return;
  }
  const leftMode = bimanual.leftPinching ? "pinza" : bimanual.leftPointing ? "indice" : bimanual.leftPalmOpen ? "palma" : bimanual.leftFist ? "punio" : "lista";
  setHand(els.handHudLeft, "Izq", Boolean(bimanual.left), leftMode, bimanual.leftPinching ? "pinch" : "");
  const rightMode = bimanual.rightPinching ? "pinza" : bimanual.rightPointing ? "indice" : bimanual.rightPalmLift ? (bimanual.rightPalmFacing === "up" ? "palma↑" : bimanual.rightPalmFacing === "down" ? "palma↓" : "palma") : bimanual.rightPeace ? "V" : bimanual.rightFist ? "punio" : "mano";
  setHand(els.handHudRight, "Der", Boolean(bimanual.right), rightMode, bimanual.rightPinching ? "pinch" : bimanual.rightPalmLift ? "lift" : "");
}

function addVolumeModule(kind = els.addKindSelect?.value || "modulo") {
  if (!canEdit()) return null;
  const n = pickables.length;
  const group = spawnModule({
    kind,
    label: nextModuleName(kind),
    x: (n % 4 - 1.5) * 2.5,
    z: (Math.floor(n / 4) - 1) * 2.2
  });
  selectObject(group);
  updateLeftPinchPreview();
  setBadge(els.loadBadge, `${pickables.length} modulos`, "ok");
  setLast(`Añadido: ${group.userData.label}`);
  showGestureToast(`+ ${group.userData.label}`, 900);
  return group;
}

function onResize() {
  const host = els.sceneHost;
  if (!host || !renderer || !camera) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (w < 2 || h < 2) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, true);
  if (labelRenderer) labelRenderer.setSize(w, h);
}

function updateTransformBadge() {
  if (els.transformModeBadge) {
    els.transformModeBadge.textContent = `Tool: ${TRANSFORM_LABELS[state.transformMode] || state.transformMode}`;
  }
  document.querySelectorAll(".tool-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tool === state.transformMode);
  });
}

function setTransformMode(mode) {
  state.transformMode = mode;
  resetManipulation();
  updateTransformBadge();
  setLast(`Modo: ${TRANSFORM_LABELS[mode] || mode}`);
}

function refreshSelectionVisuals() {
  if (!selected || !canEdit()) {
    selectionHelper.visible = false;
    if (axisHelper) axisHelper.visible = false;
    return;
  }
  clampPosition(selected);
  selectionHelper.setFromObject(selected);
  selectionHelper.visible = true;
  if (axisHelper) {
    axisHelper.visible = true;
    axisHelper.position.copy(selected.position);
    axisHelper.rotation.copy(selected.rotation);
    axisHelper.scale.setScalar(Math.max(selected.scale.x, 0.6));
  }
  updateSelectionLabel();
  updateInspector();
  state.statsTick = ((state.statsTick || 0) + 1) % 8;
  if (state.statsTick === 0) updateProjectStats();
}

function snapValue(v) {
  return Math.round(v / SNAP) * SNAP;
}

function snapSelected() {
  if (!selected || !canEdit()) return;
  const rest = SLAB_TOP + moduleHalfHeight(selected);
  selected.position.x = snapValue(selected.position.x);
  selected.position.y = rest + Math.max(0, snapValue(selected.position.y - rest));
  selected.position.z = snapValue(selected.position.z);
  clampPosition(selected);
  refreshSelectionVisuals();
  updateInspector(true);
  updateProjectStats();
  setLast(`Alineado: ${selected.userData.label}`);
}

function nudgeSelected(dx, dy, dz) {
  if (!selected || !canEdit()) return;
  pushUndo();
  selected.position.x += dx;
  selected.position.y += dy;
  selected.position.z += dz;
  refreshSelectionVisuals();
}

function rotateSelectedAxis(delta) {
  if (!selected) return;
  selected.rotation.y += delta;
  refreshSelectionVisuals();
}

function scaleSelected(factor) {
  if (!selected) return;
  const next = Math.max(0.3, Math.min(3, selected.scale.x * factor));
  selected.scale.setScalar(next);
  selected.userData.baseScale = next;
  refreshSelectionVisuals();
  setLast(`Escala ${selected.userData.label}: ${next.toFixed(2)}`);
}

function cycleSelection(dir = 1) {
  if (!pickables.length) return;
  sortPickables();
  const idx = selected ? pickables.indexOf(selected) : -1;
  const next = (idx + dir + pickables.length) % pickables.length;
  selectObject(pickables[next]);
  updateLeftPinchPreview();
  setLast(`Modulo: ${pickables[next].userData.label}`);
}

function confirmPinchSelect(aim, source = "camara") {
  const hit = resolveAimTarget(aim);
  if (hit && hit !== selected) pushUndo();
  selectObject(hit);
  resetManipulation();
  setLast(hit ? `Elegido: ${hit.userData.label}` : "Mueve mano izq ← → frente a camara");
  highlightCommand("seleccionar");
  if (els.commandGesture) els.commandGesture.textContent = `pinza · ${hit?.userData?.label || "—"}`;
  return hit;
}

function duplicateSelected() {
  if (!selected || !canEdit()) return;
  pushUndo();
  const src = selected;
  const mesh = cloneModule(src);
  mesh.position.copy(src.position).add(new THREE.Vector3(SNAP * 2, 0, SNAP * 2));
  mesh.rotation.copy(src.rotation);
  mesh.scale.copy(src.scale);
  clampPosition(mesh);
  addPickable(mesh, nextModuleName(src.userData.kind), src.userData.kind);
  selectObject(mesh);
  updateLeftPinchPreview();
  setBadge(els.loadBadge, `${pickables.length} modulos`, "ok");
  setLast(`Duplicado: ${mesh.userData.label}`);
}

function deleteSelected() {
  if (!selected || !canEdit()) return;
  const label = selected.userData.label;
  selected.children.filter((child) => child.isCSS2DObject).forEach((child) => child.element?.remove());
  maquetteGroup.remove(selected);
  pickables = pickables.filter((o) => o !== selected);
  state.undoStack = state.undoStack.filter((entry) => entry.mesh !== selected);
  disposeModule(selected);
  selectObject(pickables[0] || null);
  updateLeftPinchPreview();
  setBadge(els.loadBadge, `${pickables.length} modulos`, "ok");
  setLast(`Eliminado: ${label}`);
}

function screenToNdc(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -(((clientY - rect.top) / rect.height) * 2 - 1)
  };
}

function resolvePickable(obj) {
  let node = obj;
  while (node) {
    if (node.userData?.selectable && pickables.includes(node)) return node;
    node = node.parent;
  }
  return null;
}

function pickAtClient(clientX, clientY) {
  if (!camera || !raycaster) return null;
  const ndc = screenToNdc(clientX, clientY);
  pointer.set(ndc.x, ndc.y);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  for (const hit of hits) {
    const pickable = resolvePickable(hit.object);
    if (pickable) return pickable;
  }
  return null;
}

function onPointerHover(event) {
  if (state.dragPointer || !canEdit()) return;
  const hit = pickAtClient(event.clientX, event.clientY);
  setHovered(hit);
  if (renderer?.domElement) {
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
  }
}

function onPointerDown(event) {
  if (!canEdit() || event.button !== 0) return;
  const hit = pickAtClient(event.clientX, event.clientY);
  if (hit) {
    pushUndo();
    selectObject(hit);
    state.dragPointer = {
      x: event.clientX,
      y: event.clientY,
      basePos: selected.position.clone(),
      baseRot: selected.rotation.y,
      baseScale: selected.scale.x
    };
    controls.enabled = false;
    if (renderer?.domElement) renderer.domElement.style.cursor = "grabbing";
    setLast(`Mouse: ${hit.userData.label}`);
  } else {
    selectObject(null);
  }
}

function dragSensitivity() {
  const dist = camera?.position.distanceTo(controls?.target || new THREE.Vector3()) || 14;
  return 0.012 + dist * 0.0012;
}

function onPointerMove(event) {
  if (!state.dragPointer || !selected || !canEdit()) return;
  const sens = dragSensitivity();
  const dx = (event.clientX - state.dragPointer.x) * sens;
  const dy = (event.clientY - state.dragPointer.y) * sens;
  if (state.transformMode === "lift") {
    selected.position.y = state.dragPointer.basePos.y - dy * 1.2;
  } else if (state.transformMode === "rotate") {
    selected.rotation.y = state.dragPointer.baseRot + dx * 2;
  } else if (state.transformMode === "scale") {
    const factor = 1 + dx * 0.08;
    selected.scale.setScalar(Math.max(0.3, Math.min(3, state.dragPointer.baseScale * factor)));
  } else {
    selected.position.x = state.dragPointer.basePos.x + dx;
    selected.position.z = state.dragPointer.basePos.z + dy;
  }
  refreshSelectionVisuals();
}

function onPointerUp(event) {
  const drag = state.dragPointer;
  const moved = drag && event && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3;
  if (moved && selected) {
    if (state.transformMode === "move" || state.transformMode === "lift") snapSelected();
    renderModulePicker();
  }
  state.dragPointer = null;
  controls.enabled = state.appMode !== "vista_previa";
  if (renderer?.domElement) renderer.domElement.style.cursor = state.hovered ? "pointer" : "grab";
}

function onKeyDown(event) {
  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  const k = event.key.toLowerCase();
  if (k === "s" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); saveMaqueta(); return; }
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const views = { v: "perspectiva", p: "planta", f: "frente", l: "lado" };
    if (views[k]) { setView(views[k]); return; }
  }
  if (k === "arrowleft") { nudgeSelected(-SNAP, 0, 0); setLast("← X"); return; }
  if (k === "arrowright") { nudgeSelected(SNAP, 0, 0); setLast("→ X"); return; }
  if (k === "arrowup") { nudgeSelected(0, 0, event.shiftKey ? 0 : -SNAP); nudgeSelected(0, event.shiftKey ? SNAP : 0, 0); setLast(event.shiftKey ? "↑ Y" : "↑ Z"); return; }
  if (k === "arrowdown") { nudgeSelected(0, 0, event.shiftKey ? 0 : SNAP); nudgeSelected(0, event.shiftKey ? -SNAP : 0, 0); setLast(event.shiftKey ? "↓ Y" : "↓ Z"); return; }
  if (k === "r") { rotateSelectedAxis(0.12); setLast("Rotar +"); return; }
  if (k === "q") { rotateSelectedAxis(-0.12); setLast("Rotar -"); return; }
  if (k === "+" || k === "=") { scaleSelected(1.08); return; }
  if (k === "-") { scaleSelected(0.92); return; }
  if (k === "d" && event.ctrlKey) { event.preventDefault(); duplicateSelected(); return; }
  if (k === "delete" || k === "backspace") { deleteSelected(); return; }
  if (k === "g") { snapSelected(); return; }
  if (k === "z" && event.ctrlKey) { event.preventDefault(); undoLast(); return; }
  if (k === "?") { toggleHelp(); return; }
  if (k === "escape") { selectObject(null); setLast("Seleccion limpiada"); return; }
  if (k === "tab") { event.preventDefault(); cycleSelection(event.shiftKey ? -1 : 1); return; }
  if (k === "1") setTransformMode("move");
  if (k === "2") setTransformMode("lift");
  if (k === "3") setTransformMode("rotate");
  if (k === "4") setTransformMode("scale");
}

function aimNormX(aim, mirror = true) {
  let x = aim.x;
  if (mirror) x = 1 - x;
  return Math.max(0, Math.min(1, x));
}

function getMeshNdc(mesh) {
  mesh.updateMatrixWorld(true);
  pickBox.setFromObject(mesh);
  pickBox.getCenter(pickWorldVec);
  pickWorldVec.project(camera);
  return { x: pickWorldVec.x, y: pickWorldVec.y, z: pickWorldVec.z };
}

function pickByRay(aim, mirror) {
  if (!raycaster || !aim) return null;
  const ax = aimNormX(aim, mirror);
  pointer.set((ax - 0.5) * 2, -(aim.y - 0.5) * 2);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  for (const hit of hits) {
    const pickable = resolvePickable(hit.object);
    if (pickable) return pickable;
  }
  return null;
}

function pickByScreenDist(aim, mirror, maxDist2) {
  if (!aim) return null;
  const ax = aimNormX(aim, mirror);
  const tx = (ax - 0.5) * 2;
  const ty = -(aim.y - 0.5) * 2;
  let best = null;
  let bestD = Infinity;
  for (const mesh of pickables) {
    const sp = getMeshNdc(mesh);
    if (sp.z > 1) continue;
    const d = (sp.x - tx) ** 2 + (sp.y - ty) ** 2;
    if (d < bestD) {
      bestD = d;
      best = mesh;
    }
  }
  return bestD <= maxDist2 ? best : null;
}

function pickByZone(aim, mirror = true) {
  if (!pickables.length || !aim) return null;
  sortPickables();
  const x = aimNormX(aim, mirror);
  if (state.smoothAimX == null) state.smoothAimX = x;
  state.smoothAimX = state.smoothAimX * 0.6 + x * 0.4;
  const idx = Math.min(pickables.length - 1, Math.floor(state.smoothAimX * pickables.length));
  return pickables[Math.max(0, idx)];
}

function resolveAimTarget(aim) {
  if (!pickables.length) return null;
  if (!aim) return state.aimTarget || pickables[0];

  for (const mirror of [true, false]) {
    const rayHit = pickByRay(aim, mirror);
    if (rayHit) return rayHit;
  }
  for (const mirror of [true, false]) {
    const distHit = pickByScreenDist(aim, mirror, PICK_DIST_MAX2);
    if (distHit) return distHit;
  }
  return pickByZone(aim, true);
}

function resetManipulation() {
  state.moveHold = false;
  state.rotateHold = false;
  state.palmMoveHold = false;
  state.palmMoveBase = null;
  state.palmMoveBasePos = null;
  state.smoothPalm = null;
  state.smoothRotAngle = null;
  state.smoothAim = null;
  state.indexRotateBase = null;
  state.indexRotateBaseRot = null;
  state.scaleBaseDist = null;
  state.rotateBaseAngle = null;
  state.grabBasePos = null;
  state.grabAim = null;
  state.grabBaseRot = null;
  state.grabBaseScale = null;
}

function isPalmLiftHand(hand) {
  return Boolean(hand?.isPalmOpen && !hand?.isPinching && !hand?.isPointing && !hand?.isPeace);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  return a + unwrapAngleDelta(b - a) * t;
}

function updateObjectInfoHud() {
  if (!els.objectInfo || !selected) return;
  const p = selected.position;
  els.objectInfo.textContent = `X ${p.x.toFixed(1)} · Y ${(p.y - SLAB_TOP).toFixed(2)} · Z ${p.z.toFixed(1)}`;
}

function refreshManipVisuals(force = false) {
  state.manipVisualTick = (state.manipVisualTick + 1) % 2;
  if (!force && state.manipVisualTick !== 0) {
    updateObjectInfoHud();
    return;
  }
  refreshSelectionVisuals();
  updateSelectionLabel();
  updateObjectInfoHud();
}

function moveSelectedFromRightPalm(hand) {
  if (!selected || !hand || hand.side !== "Right" || !canEdit() || !isPalmLiftHand(hand)) return false;

  const x = hand.palmCenter?.x ?? hand.wrist.x;
  const y = hand.palmCenter?.y ?? hand.wrist.y;

  if (state.palmMoveBase == null) {
    pushUndo();
    state.palmMoveBase = { x, y };
    state.palmMoveBasePos = selected.position.clone();
    state.smoothPalm = { x, y };
    state.palmMoveHold = true;
    state.grabAim = null;
    state.grabBasePos = null;
    return true;
  }

  state.smoothPalm.x = lerp(state.smoothPalm.x, x, 0.42);
  state.smoothPalm.y = lerp(state.smoothPalm.y, y, 0.42);
  const sx = state.smoothPalm.x;
  const sy = state.smoothPalm.y;

  const dx = (sx - state.palmMoveBase.x) * 22;
  selected.position.x = state.palmMoveBasePos.x + dx;

  if (hand.palmFacing === "up" || hand.palmFacing === "down") {
    const dy = (state.palmMoveBase.y - sy) * 18;
    const boost = hand.palmFacing === "up" ? 0.03 : -0.03;
    selected.position.y = state.palmMoveBasePos.y + dy + boost;
  } else {
    selected.position.y = lerp(selected.position.y, state.palmMoveBasePos.y, 0.25);
  }

  clampPosition(selected);
  refreshManipVisuals();
  return true;
}

function liftSelectedFromPalm(hand) {
  if (!selected || !hand || !canEdit() || !isPalmLiftHand(hand)) return false;
  if (hand.side === "Right") return moveSelectedFromRightPalm(hand);

  const x = hand.palmCenter?.x ?? hand.wrist.x;
  const y = hand.palmCenter?.y ?? hand.wrist.y;
  if (state.palmMoveBase == null) {
    pushUndo();
    state.palmMoveBase = { x, y };
    state.palmMoveBasePos = selected.position.clone();
    state.smoothPalm = { x, y };
    state.palmMoveHold = true;
    return true;
  }

  state.smoothPalm.y = lerp(state.smoothPalm.y, y, 0.42);
  const dy = (state.palmMoveBase.y - state.smoothPalm.y) * 18;
  let boost = 0;
  if (hand.palmFacing === "up") boost = 0.03;
  else if (hand.palmFacing === "down") boost = -0.03;
  selected.position.y = state.palmMoveBasePos.y + dy + boost;
  clampPosition(selected);
  refreshManipVisuals();
  return true;
}

function endPalmMove() {
  if (!state.palmMoveHold) return;
  if (selected) {
    selected.position.x = snapValue(selected.position.x);
    selected.position.y = snapValue(selected.position.y);
    clampPosition(selected);
    refreshSelectionVisuals();
    setLast(`Posicion: ${selected.userData.label} · X=${selected.position.x.toFixed(1)} Y=${selected.position.y.toFixed(2)}`);
  }
  state.palmMoveBase = null;
  state.palmMoveBasePos = null;
  state.smoothPalm = null;
  state.palmMoveHold = false;
}

function unwrapAngleDelta(delta) {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function indexFingerAngle(hand) {
  if (!hand?.wrist || !hand?.indexTip) return null;
  return Math.atan2(hand.indexTip.y - hand.wrist.y, hand.indexTip.x - hand.wrist.x);
}

function rotateSelectedFromIndex(hand) {
  if (!selected || !hand || !canEdit()) return false;
  const angle = indexFingerAngle(hand);
  if (angle == null) return false;

  if (state.indexRotateBase == null) {
    pushUndo();
    state.indexRotateBase = angle;
    state.indexRotateBaseRot = selected.rotation.y;
    state.smoothRotAngle = angle;
    state.rotateHold = true;
    state.grabAim = null;
    state.grabBasePos = null;
    return true;
  }

  state.smoothRotAngle = lerpAngle(state.smoothRotAngle, angle, 0.38);
  const delta = unwrapAngleDelta(state.smoothRotAngle - state.indexRotateBase);
  selected.rotation.y = state.indexRotateBaseRot + delta * 1.85;
  refreshManipVisuals();
  const deg = ((selected.rotation.y * 180) / Math.PI) % 360;
  if (els.objectInfo) {
    els.objectInfo.textContent = `Rot Y ${deg.toFixed(0)}° · ${(selected.scale.x * 100).toFixed(0)}%`;
  }
  return true;
}

function endIndexRotate(snap = true) {
  if (!state.rotateHold) return;
  if (selected && snap) {
    const step = Math.PI / 12;
    selected.rotation.y = Math.round(selected.rotation.y / step) * step;
    refreshSelectionVisuals();
    updateSelectionLabel();
    setLast(`Rotado: ${selected.userData.label}`);
  }
  state.indexRotateBase = null;
  state.indexRotateBaseRot = null;
  state.smoothRotAngle = null;
  state.rotateHold = false;
}

function moveSelectedFromAim(aim, bimanual, modeOverride) {
  if (!selected || !aim) return;
  const mode = modeOverride || state.transformMode;
  if (!state.grabAim || !state.grabBasePos) {
    state.grabAim = { x: aim.x, y: aim.y };
    state.smoothAim = { x: aim.x, y: aim.y };
    state.grabBasePos = selected.position.clone();
    state.grabBaseRot = selected.rotation.y;
    state.grabBaseScale = selected.scale.x;
    return;
  }
  state.smoothAim.x = lerp(state.smoothAim.x, aim.x, 0.4);
  state.smoothAim.y = lerp(state.smoothAim.y, aim.y, 0.4);
  const dx = (state.smoothAim.x - state.grabAim.x) * 20;
  const dy = (state.smoothAim.y - state.grabAim.y) * 15;

  if (mode === "lift") {
    selected.position.y = state.grabBasePos.y - dy * 1.5;
  } else if (mode === "rotate") {
    selected.rotation.y = state.grabBaseRot + dx * 2.8;
  } else if (mode === "scale" && bimanual?.bothPinching) {
    scaleRotateBimanual(bimanual);
    return;
  } else {
    selected.position.x = state.grabBasePos.x + dx;
    selected.position.z = state.grabBasePos.z + dy;
  }
  clampPosition(selected);
  refreshManipVisuals();
}

function scaleRotateBimanual(bimanual) {
  if (!selected || !bimanual.bothPinching) return;
  if (state.scaleBaseDist == null) {
    state.scaleBaseDist = Math.max(bimanual.pinchDistance, 1e-4);
    state.rotateBaseAngle = bimanual.angle;
    selected.userData.baseScale = selected.scale.x;
    return;
  }
  const raw = bimanual.pinchDistance / state.scaleBaseDist;
  const target = Math.max(0.35, Math.min(2.8, raw));
  const current = selected.scale.x / (selected.userData.baseScale || 1);
  const scaleFactor = lerp(current, target, 0.35);
  selected.scale.setScalar(selected.userData.baseScale * scaleFactor);
  selected.rotation.y += bimanual.angleDelta * 1.15;
  refreshManipVisuals();
}

function handleBimanual(data) {
  if (!visionControlReady() || !data?.bimanual || !canEdit()) return;
  const b = data.bimanual;
  updateHandGhosts(data);
  updateHandHud(b);

  if (b.leftPinching && !state.leftPinchPrev && !b.rightPinching) {
    advanceLeftPinchSelection("camara");
    state.leftPinchPrev = true;
    showGestureToast(selected ? `→ ${selected.userData.label}` : "Siguiente modulo", 700);
    return;
  }
  state.leftPinchPrev = b.leftPinching;

  if (b.bothPalmsOpen) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    state.orbitHold = true;
    highlightCommand("orbitar");
    if (els.commandGesture) els.commandGesture.textContent = "2 palmas · orbitar";
    return;
  }
  controls.autoRotate = false;
  state.orbitHold = false;

  if (b.bothPinching && selected) {
    scaleRotateBimanual(b);
    highlightCommand("transformar");
    if (els.commandGesture) els.commandGesture.textContent = "2 pinzas · escalar/rotar";
    return;
  }
  state.scaleBaseDist = null;
  state.rotateBaseAngle = null;

  if (b.left && !b.leftPinching && !b.rightPinching && !b.bothPalmsOpen && !b.bothPinching && !(selected && isPalmLiftHand(b.left))) {
    updateLeftPinchPreview();
    highlightCommand("preview_modulo");
    if (els.commandGesture) {
      const next = state.pinchPreviewTarget;
      els.commandGesture.textContent = next
        ? `izq · pinza -> ${next.userData.label}`
        : "izq · junta pulgar+indice";
    }
    if (els.handHudLeft) {
      const next = state.pinchPreviewTarget;
      els.handHudLeft.textContent = next ? `Izq: -> ${next.userData.label}` : "Izq: lista";
      els.handHudLeft.classList.add("is-on");
      els.handHudLeft.classList.remove("is-pinch");
    }
  } else if (b.leftPinching && els.handHudLeft) {
    els.handHudLeft.classList.add("is-pinch");
  }

  if (b.rightPointing && selected && !b.leftPinching && !b.rightPinching) {
    if (state.palmMoveHold) endPalmMove();
    rotateSelectedFromIndex(b.right);
    highlightCommand("rotar");
    if (els.commandGesture) {
      const deg = ((selected.rotation.y * 180) / Math.PI).toFixed(0);
      els.commandGesture.textContent = `der · indice · rotar ${selected.userData.label} (${deg}°)`;
    }
    if (els.handHudRight) {
      els.handHudRight.textContent = `Der: rotar ${((selected.rotation.y * 180) / Math.PI).toFixed(0)}°`;
      els.handHudRight.classList.add("is-on", "is-rotate");
    }
    if (els.transformModeBadge) els.transformModeBadge.textContent = "Indice der: rotar";
    return;
  }

  if (selected && isPalmLiftHand(b.right) && !b.leftPinching && !b.rightPinching && !b.rightPointing) {
    moveSelectedFromRightPalm(b.right);
    const isVertical = b.right.palmFacing === "up" || b.right.palmFacing === "down";
    if (isVertical) {
      highlightCommand("elevar");
      const dirLabel = b.right.palmFacing === "up" ? "SUBIR" : "BAJAR";
      if (els.commandGesture) {
        els.commandGesture.textContent = `der · palma ${dirLabel} · Y=${selected.position.y.toFixed(2)}`;
      }
      if (els.handHudRight) {
        els.handHudRight.textContent = `Der: ${dirLabel} ${selected.position.y.toFixed(1)}`;
        els.handHudRight.classList.add("is-on", "is-lift");
        els.handHudRight.classList.remove("is-slide");
      }
    } else {
      highlightCommand("mover");
      if (els.commandGesture) {
        els.commandGesture.textContent = `der · palma ←→ · X=${selected.position.x.toFixed(1)}`;
      }
      if (els.handHudRight) {
        els.handHudRight.textContent = `Der: ←→ X=${selected.position.x.toFixed(1)}`;
        els.handHudRight.classList.add("is-on", "is-slide");
        els.handHudRight.classList.remove("is-lift");
      }
    }
    if (els.transformModeBadge) {
      els.transformModeBadge.textContent = isVertical ? "Palma ↑↓ altura" : "Palma ←→ mover";
    }
    return;
  }

  const liftHand = selected && !b.right && isPalmLiftHand(b.left) && !b.leftPinching && !b.rightPinching
    ? b.left
    : null;

  if (liftHand) {
    liftSelectedFromPalm(liftHand);
    const dirLabel = liftHand.palmFacing === "up" ? "SUBIR" : liftHand.palmFacing === "down" ? "BAJAR" : "altura";
    highlightCommand("elevar");
    if (els.commandGesture) {
      els.commandGesture.textContent = `izq · palma ${dirLabel} · Y=${selected.position.y.toFixed(2)}`;
    }
    if (els.handHudLeft) {
      els.handHudLeft.textContent = `Izq: ${dirLabel} ${selected.position.y.toFixed(1)}`;
      els.handHudLeft.classList.add("is-on", "is-lift");
    }
    return;
  }

  if (b.rightPinching && selected && !b.leftPinching) {
    moveSelectedFromAim(b.right?.pinchCenter, b);
    state.moveHold = true;
    const cmd = state.transformMode === "lift" ? "elevar" : state.transformMode === "rotate" ? "rotar" : "mover";
    highlightCommand(cmd);
    if (els.commandGesture) {
      els.commandGesture.textContent = `der · ${TRANSFORM_LABELS[state.transformMode]}`;
    }
  } else if (!b.leftPinching && !b.rightPinching && !b.rightPointing && !isPalmLiftHand(b.right) && !isPalmLiftHand(b.left) && (state.moveHold || state.rotateHold || state.palmMoveHold)) {
    if (state.moveHold) snapSelected();
    if (state.rotateHold) endIndexRotate(true);
    if (state.palmMoveHold) endPalmMove();
    resetManipulation();
    state.moveHold = false;
  } else if (!b.rightPinching && !b.rightPointing && !isPalmLiftHand(b.right) && !isPalmLiftHand(b.left)) {
    if (state.rotateHold) endIndexRotate(true);
    if (state.palmMoveHold) endPalmMove();
    resetManipulation();
    state.moveHold = false;
    if (els.handHudRight) els.handHudRight.classList.remove("is-rotate", "is-lift", "is-slide");
    if (els.handHudLeft) els.handHudLeft.classList.remove("is-lift");
    if (els.transformModeBadge) updateTransformBadge();
  }
}

function rotateSelected(delta) {
  if (!selected) return;
  selected.rotation.y += delta;
  refreshSelectionVisuals();
}

function resetView() {
  setView("perspectiva");
}

function handleCommand(msg, source = "system") {
  if ((source === "vision" || source === "vision-ml") && !visionControlReady()) return;
  if (source === "demo" && !state.demoActive) return;

  const name = msg.name || "reposo";
  const kind = msg.kind || "idle";
  state.lastCommandSource = source;
  highlightCommand(name);
  if (els.commandGesture) {
    const src = source === "vision" || source === "vision-ml"
      ? (msg.mlMode === "ml" ? "IA" : "camara")
      : source;
    const conf = msg.confidence ? ` ${Math.round(msg.confidence * 100)}%` : "";
    els.commandGesture.textContent = `${msg.gesture || "—"} · ${src}${conf}`;
  }

  if (name === "ciclar_modulo" && canEdit()) {
    advanceLeftPinchSelection(source === "vision" || source === "vision-ml" ? "camara" : source);
    return;
  }

  if (name === "seleccionar" && canEdit()) {
    advanceLeftPinchSelection(source);
    return;
  }

  if (name === "preview_modulo" && canEdit()) {
    updateLeftPinchPreview();
    return;
  }

  if (name === "apuntar" && canEdit()) {
    updateLeftPinchPreview();
    return;
  }

  if (name === "mover") return;

  if (name === "cancelar") {
    selectObject(null);
    state.transformHold = false;
    state.orbitHold = false;
    resetManipulation();
    setLast("Seleccion cancelada");
    return;
  }

  if (name === "confirmar") {
    state.transformHold = false;
    snapSelected();
    resetManipulation();
    setLast(selected ? `Confirmado y alineado: ${selected.userData.label}` : "Nada que confirmar");
    return;
  }

  if (name === "duplicar") {
    duplicateSelected();
    return;
  }

  if (name === "eliminar") {
    deleteSelected();
    return;
  }

  if (name === "alinear" || name === "snap") {
    snapSelected();
    return;
  }

  if (name === "siguiente") {
    cycleSelection(1);
    return;
  }

  if (name === "anterior") {
    cycleSelection(-1);
    return;
  }

  if (name === "seleccionar_lista" && canEdit()) {
    const id = Number(msg.moduleId);
    const hit = pickables.find((m) => m.userData.id === id);
    if (hit) {
      pushUndo();
      selectObject(hit);
      setLast(`Lista: ${hit.userData.label}`);
    }
    return;
  }

  if (name === "rotar") {
    if (kind === "hold" && selected) return;
    return;
  }

  if (name === "elevar") {
    return;
  }

  if (name === "cambiar_herramienta") {
    const order = ["move", "lift", "rotate", "scale"];
    const idx = order.indexOf(state.transformMode);
    setTransformMode(order[(idx + 1) % order.length]);
    return;
  }

  if (name === "vista_reset") {
    resetView();
    setLast("Vista reiniciada");
    return;
  }

  if (name === "eje_x") { state.activeAxis = "x"; setLast("Eje activo: X"); return; }
  if (name === "eje_y") { state.activeAxis = "y"; setLast("Eje activo: Y"); return; }
  if (name === "eje_z") { state.activeAxis = "z"; setLast("Eje activo: Z"); return; }

  if (name === "transformar") {
    state.transformHold = kind === "hold";
    if (kind === "hold" && selected) {
      rotateSelected(0.035);
      setLast(`Transformando ${selected.userData.label}`);
    }
    return;
  }

  if (name === "orbitar") {
    state.orbitHold = kind === "hold";
    controls.autoRotate = kind === "hold";
    controls.autoRotateSpeed = 1.1;
    if (kind === "hold") setLast("Orbitando escena (palma abierta)");
    return;
  }

  if (name === "reposo") {
    state.transformHold = false;
    state.orbitHold = false;
    controls.autoRotate = false;
  }
}

function setAppMode(mode) {
  state.appMode = mode;
  if (els.modeBadge) els.modeBadge.textContent = `Modo: ${mode.replace("_", " ")}`;
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  });

  const isPreview = mode === "vista_previa";
  const isNav = mode === "navegacion";
  controls.enabled = !isPreview;
  controls.enablePan = isNav || mode === "edicion";
  controls.enableRotate = true;
  controls.autoRotate = false;

  if (isPreview) {
    state.dragPointer = null;
    resetManipulation();
    selectionHelper.visible = false;
    if (axisHelper) axisHelper.visible = false;
  } else {
    refreshSelectionVisuals();
  }

  setLast(
    isPreview
      ? "Vista previa — solo orbitar"
      : isNav
        ? "Navegacion — orbita la escena"
        : "Edicion — mueve modulos con camara o mouse"
  );
}

function toggleHelp(show) {
  if (!els.helpOverlay) return;
  const visible = show === undefined ? els.helpOverlay.hidden : show;
  els.helpOverlay.hidden = !visible;
}

function setMlStatus({ ready, mode, metadata, error }) {
  state.mlMode = mode || "heuristic";
  if (els.mlBadge) {
    if (ready) {
      setBadge(els.mlBadge, "IA: gestos listos", "ok");
    } else {
      setBadge(els.mlBadge, "IA: sin modelo", "warn");
    }
  }
  if (els.mlStatus) {
    if (ready) {
      const n = metadata?.clases?.length || 14;
      const code = metadata?.codigo_modelo || "vision";
      els.mlStatus.textContent = `Modelo ${code} cargado (${n} clases). Heurística + IA en el panel.`;
    } else {
      els.mlStatus.textContent = error
        ? `Sin modelo (${error}). Solo heuristica de camara.`
        : "Sin modelo. Solo heuristica de camara.";
    }
  }
}

function lmToPayload(lm) {
  if (!lm?.length) return null;
  return lm.slice(0, 21).map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
}

async function sendSample(gesto, left, right) {
  const body = { gesto, left: lmToPayload(left), right: lmToPayload(right), fuente: "panel" };
  const res = await fetch(COLLECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function recordSamples(durationMs = 3000) {
  if (!state.visionActive || !vision) {
    setLast("Activa la camara antes de grabar muestras");
    return;
  }
  const gesto = els.recordGestureSelect?.value || "pinza_izq";
  state.recordingSamples = true;
  vision.setRecordSamples(true);
  if (els.recordSampleBtn) els.recordSampleBtn.disabled = true;
  if (els.recordStatus) els.recordStatus.textContent = `Grabando «${gesto}»… mantén el gesto`;

  let saved = 0;
  let errors = 0;
  const end = performance.now() + durationMs;
  const tick = async () => {
    if (!state.recordingSamples || performance.now() >= end) return;
    try {
      await sendSample(gesto, vision._lastLeftLm, vision._lastRightLm);
      saved += 1;
      if (els.recordStatus) els.recordStatus.textContent = `Grabando «${gesto}»… ${saved} muestras`;
    } catch (_e) {
      errors += 1;
    }
    setTimeout(tick, 120);
  };
  tick();

  setTimeout(() => {
    state.recordingSamples = false;
    vision.setRecordSamples(false);
    if (els.recordSampleBtn) els.recordSampleBtn.disabled = false;
    if (els.recordStatus) {
      els.recordStatus.textContent = errors
        ? `Guardadas ${saved} muestras (${errors} fallos — ¿servidor en :8091?)`
        : `Guardadas ${saved} muestras de «${gesto}». Reentrena: python ml/entrenar_vision.py`;
    }
    setLast(`Recoleccion: ${saved} muestras de ${gesto}`);
  }, durationMs + 80);
}

async function startCamera() {
  if (!state.panelReady) {
    setLast("Espera a que cargue la escena 3D…");
    return;
  }
  setLast("Activando camara…");
  if (els.startCameraBtn) els.startCameraBtn.disabled = true;
  try {
    if (!vision) {
      const { NexumVision } = await import("./vision.js?v=15");
      vision = new NexumVision({
        video: els.visionVideo,
        canvas: els.visionCanvas,
        mirror: true,
        onGesture: (gesture) => {
          if (!state.visionActive) return;
          handleCommand(gesture, "vision");
        },
        onHands: (data) => {
          if (!state.visionActive) return;
          handleBimanual(data);
          const count = data?.hands?.length || 0;
          const ml = data?.ml;
          if (els.visionConfidence) {
            if (ml?.confidence) {
              const pct = Math.round(ml.confidence * 100);
              const lbl = ml.label || ml.clase || "";
              els.visionConfidence.textContent = `${lbl} ${pct}%`;
            } else {
              els.visionConfidence.textContent = count ? `${count} mano${count > 1 ? "s" : ""}` : "—";
            }
          }
        },
        onMlStatus: setMlStatus,
        onSampleFrame: ({ left, right }) => {
          vision._lastLeftLm = left;
          vision._lastRightLm = right;
        },
        onStatus: (text) => {
          if (els.visionStatus) els.visionStatus.textContent = text;
          const ok = text.includes("activa");
          setBadge(els.cameraBadge, ok ? "Camara: activa" : text, ok ? "ok" : "warn");
        }
      });
    }
    await vision.start();
    state.visionActive = true;
    els.startCameraBtn?.classList.add("active");
    if (els.stopCameraBtn) els.stopCameraBtn.disabled = false;
    els.visionPip?.classList.add("is-live");
    els.visionPip?.classList.remove("is-off");
    updateHintStrip(true);
    setBadge(els.cameraBadge, "Camara: activa", "ok");
    setLast("Camara OK — mano izq: pinza (pulgar+indice) elige modulos en orden");
    showGestureToast("Camara lista", 1100);
  } catch (err) {
    setBadge(els.cameraBadge, "Camara: error", "bad");
    const msg = err?.message || String(err);
    if (els.visionStatus) els.visionStatus.textContent = msg;
    setLast(`Error camara: ${msg}`);
    showBootError(`Camara: ${msg}`);
  } finally {
    if (els.startCameraBtn) els.startCameraBtn.disabled = false;
  }
}

function stopCamera() {
  vision?.stop();
  state.visionActive = false;
  state.leftPinchPrev = false;
  state.smoothAimX = null;
  els.startCameraBtn?.classList.remove("active");
  if (els.stopCameraBtn) els.stopCameraBtn.disabled = true;
  els.visionPip?.classList.remove("is-live");
  els.visionPip?.classList.add("is-off");
  if (els.visionConfidence) els.visionConfidence.textContent = "apagada";
  updateHintStrip(false);
  setBadge(els.cameraBadge, "Camara: apagada", "bad");
  updateHandGhosts(null);
  updateHandHud(null);
  highlightCommand("reposo");
}

function tweenModule(mesh, to, ms) {
  const from = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, rot: mesh.rotation.y };
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      if (!mesh.parent) return resolve();
      const t = Math.min(1, (now - start) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      for (const key of ["x", "y", "z"]) {
        if (to[key] !== undefined) mesh.position[key] = from[key] + (to[key] - from[key]) * e;
      }
      if (to.rot !== undefined) mesh.rotation.y = from.rot + (to.rot - from.rot) * e;
      if (mesh === selected) refreshSelectionVisuals();
      if (t < 1) requestAnimationFrame(step);
      else {
        updateProjectStats();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function demoCommand(name, gesture, toast) {
  highlightCommand(name);
  if (els.commandGesture) els.commandGesture.textContent = `${gesture} · demo`;
  if (toast) showGestureToast(toast, 850);
}

function stopDemo(message = "Demo detenida") {
  state.demoRun += 1;
  state.demoActive = false;
  controls.autoRotate = false;
  highlightCommand("reposo");
  if (els.demoBtn) els.demoBtn.textContent = "Demo";
  setLast(message);
}

async function runLocalDemo() {
  if (state.demoActive) {
    stopDemo();
    return;
  }
  if (!pickables.length) return;
  const run = ++state.demoRun;
  const alive = () => state.demoRun === run;
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  state.demoActive = true;
  if (state.appMode !== "edicion") setAppMode("edicion");
  if (els.demoBtn) els.demoBtn.textContent = "Detener demo";
  setLast("Demo: recorrido de gestos sobre la maqueta");
  setView("perspectiva");
  await wait(800);

  sortPickables();
  for (const mesh of pickables.slice(0, 3)) {
    if (!alive()) return;
    const base = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, rot: mesh.rotation.y };
    demoCommand("seleccionar", "pinza izq", `Pinza izq → ${mesh.userData.label}`);
    selectObject(mesh);
    await wait(900);
    if (!alive()) return;
    demoCommand("mover", "palma der ←→", "Palma derecha: mover");
    await tweenModule(mesh, { x: base.x + 1.6 }, 800);
    if (!alive()) return;
    demoCommand("elevar", "palma der ↑", "Palma arriba: elevar");
    await tweenModule(mesh, { y: base.y + 1.2 }, 700);
    if (!alive()) return;
    demoCommand("rotar", "indice der", "Indice derecho: rotar");
    await tweenModule(mesh, { rot: base.rot + Math.PI / 2 }, 800);
    if (!alive()) return;
    demoCommand("confirmar", "punio der", "Puño: confirmar");
    await tweenModule(mesh, base, 750);
    await wait(250);
  }
  if (!alive()) return;
  demoCommand("orbitar", "2 palmas", "Dos palmas: orbitar");
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.2;
  await wait(2600);
  controls.autoRotate = false;
  if (!alive()) return;
  setView("planta");
  showGestureToast("Vista en planta", 900);
  await wait(1700);
  if (!alive()) return;
  setView("perspectiva");
  await wait(700);
  if (alive()) stopDemo("Demo terminada — prueba tu con la camara");
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  stepCameraTween(now);
  pulsePhase += 0.04;
  if (selected && canEdit() && selectionHelper.visible && selectionHelper.material) {
    selectionHelper.material.opacity = 0.55 + Math.sin(pulsePhase * 1.5) * 0.25;
    if ((state.fpsFrames & 1) === 0) selectionHelper.setFromObject(selected);
  }
  controls?.update();
  if (state.transformHold && selected && canEdit()) {
    rotateSelected(0.012);
  }
  renderer?.render(scene, camera);
  if ((state.fpsFrames & 1) === 0) labelRenderer?.render(scene, camera);

  state.fpsFrames += 1;
  if (now - state.fpsLast >= 1000) {
    if (els.hudFps) {
      const sz = renderer ? `${renderer.domElement.width}x${renderer.domElement.height}` : "—";
      els.hudFps.textContent = `${state.fpsFrames} fps · ${sz}`;
    }
    state.fpsFrames = 0;
    state.fpsLast = now;
  }
}

function wireUi() {
  els.startCameraBtn?.addEventListener("click", startCamera);
  els.pipStartBtn?.addEventListener("click", startCamera);
  els.stopCameraBtn?.addEventListener("click", stopCamera);
  els.recordSampleBtn?.addEventListener("click", () => recordSamples(3000));
  els.demoBtn?.addEventListener("click", runLocalDemo);
  els.resetViewBtn?.addEventListener("click", () => {
    resetView();
    setLast("Vista reiniciada");
  });
  els.addVolumeBtn?.addEventListener("click", () => addVolumeModule());
  els.addKindBtn?.addEventListener("click", () => addVolumeModule());
  els.snapshotBtn?.addEventListener("click", captureSnapshot);
  els.saveLayoutBtn?.addEventListener("click", saveMaqueta);
  els.loadLayoutBtn?.addEventListener("click", loadMaqueta);
  els.resetLayoutBtn?.addEventListener("click", resetLayout);
  els.exportLayoutBtn?.addEventListener("click", exportLayoutJson);
  els.importLayoutBtn?.addEventListener("click", () => els.importLayoutInput?.click());
  els.importLayoutInput?.addEventListener("change", () => {
    importLayoutFile(els.importLayoutInput.files?.[0]);
    els.importLayoutInput.value = "";
  });
  for (const input of [els.inspX, els.inspY, els.inspZ, els.inspRot, els.inspScale]) {
    input?.addEventListener("input", applyInspectorInput);
    input?.addEventListener("change", () => {
      state.inspectorUndoArmed = true;
      updateInspector(true);
      renderModulePicker();
    });
  }
  els.inspName?.addEventListener("change", () => renameSelected(els.inspName.value));
  els.inspName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") els.inspName.blur();
  });
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  els.duplicateBtn?.addEventListener("click", duplicateSelected);
  els.deleteBtn?.addEventListener("click", deleteSelected);
  els.snapBtn?.addEventListener("click", snapSelected);
  els.prevAssetBtn?.addEventListener("click", () => cycleSelection(-1));
  els.nextAssetBtn?.addEventListener("click", () => cycleSelection(1));
  els.undoBtn?.addEventListener("click", undoLast);
  document.querySelector("#helpBtn")?.addEventListener("click", () => toggleHelp(true));
  document.querySelector("#helpCloseBtn")?.addEventListener("click", () => toggleHelp(false));

  document.querySelectorAll(".tool-tab").forEach((tab) => {
    tab.addEventListener("click", () => setTransformMode(tab.dataset.tool));
  });

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => setAppMode(tab.dataset.mode));
  });
}

function boot() {
  wireUi();
  try {
    initScene();
    state.panelReady = true;
    highlightCommand("reposo");
    updateTransformBadge();
    setBadge(els.loadBadge, `${pickables.length} modulos`, "ok");
    setBadge(els.cameraBadge, "Camara: apagada", "bad");
    setBadge(els.mlBadge, "IA: pendiente", "warn");
    updateLeftPinchPreview();
    markSaved("Maqueta original");
    let hasSaved = false;
    try { hasSaved = Boolean(localStorage.getItem(LAYOUT_KEY)); } catch (_err) { hasSaved = false; }
    if (hasSaved && els.loadLayoutBtn) els.loadLayoutBtn.textContent = "Cargar guardada";
    setLast("Listo — pinza izq (pulgar+indice) elige modulos: Sala, Cocina, Dormitorio…");
  } catch (err) {
    showBootError(`Error escena 3D: ${err?.message || err}`);
  }
  if (dbSession) {
    dbSession.start();
    window.addEventListener("pagehide", () => dbSession.end({}, {}, { useBeacon: true }));
  }
}

boot();
