
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const DETECT_MS_IDLE = 70;
const DETECT_MS_GAME = 100;
const PREVIEW_W = 320;
const PREVIEW_H = 240;
const ZONE_RELEASE = 0.04;

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  INDEX_PIP: 6,
  MIDDLE_TIP: 12,
  MIDDLE_PIP: 10,
  RING_TIP: 16,
  RING_PIP: 14,
  PINKY_TIP: 20,
  PINKY_PIP: 18
};

const SLIM_EDGES = [
  [0, 5], [5, 8],
  [0, 9], [9, 12],
  [0, 13], [13, 16],
  [0, 17], [17, 20],
  [0, 4]
];

const COLORS = {
  Left: { stroke: "rgba(96, 165, 250, 0.95)", fill: "#93c5fd" },
  Right: { stroke: "rgba(45, 212, 191, 0.95)", fill: "#5eead4" },
  Unknown: { stroke: "rgba(250, 204, 21, 0.9)", fill: "#fde68a" }
};

function cameraError(err) {
  const name = err?.name || "";
  const msg = err?.message || String(err);
  if (name === "NotAllowedError") return "Permiso de camara denegado. Permitela en el candado de Chrome.";
  if (name === "NotFoundError") return "No hay webcam conectada.";
  if (name === "NotReadableError" || /device in use/i.test(msg)) {
    return "Webcam ocupada. Cierra Zoom, Camara de Windows u otras pestanas de NEXUM y reintenta.";
  }
  if (name === "OverconstrainedError") return "La webcam no acepta esa resolucion. Reintenta.";
  return msg;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function fingerUp(lm, tip, pip) {
  return dist(lm[tip], lm[LM.WRIST]) > dist(lm[pip], lm[LM.WRIST]) * 1.06;
}

function analyzeHand(lm) {
  const indexUp = fingerUp(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const middleUp = fingerUp(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const ringUp = fingerUp(lm, LM.RING_TIP, LM.RING_PIP);
  const pinkyUp = fingerUp(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  const extended = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  const pinch = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]);
  const tip = lm[LM.INDEX_TIP];
  const pip = lm[LM.INDEX_PIP];
  const wrist = lm[LM.WRIST];
  const pointingDown =
    tip.y > wrist.y + 0.05 &&
    tip.y >= pip.y - 0.02 &&
    dist(tip, wrist) > dist(pip, wrist) * 1.02 &&
    !middleUp &&
    !ringUp &&
    !pinkyUp;
  const pinkyOnly = pinkyUp && !indexUp && !middleUp && !ringUp;
  return {
    tip,
    isFist: extended === 0 && pinch > 0.05,
    isOpen: extended >= 3 && pinch > 0.07,
    pointingDown,
    pinkyOnly,
    indexUp
  };
}

export class GameVision {
  constructor({ video, canvas, onUpdate, onStatus, onTrack, zoneWidth = 0.2 }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d", { alpha: false, desynchronized: true }) || null;
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.onTrack = onTrack;
    this.setZone(zoneWidth);
    this.running = false;
    this.landmarker = null;
    this.stream = null;
    this.timer = 0;
    this.detectMs = DETECT_MS_IDLE;
    this.dirX = 0;
    this.shoot = false;
    this.jump = false;
    this.crouch = false;
    this.aimUp = false;
    this.leftFist = false;
    this.leftFistWas = false;
    this.smoothTipX = 0.5;
    this.lastSent = {};
    this._hands = [];
    this._leftLm = null;
    this._rightLm = null;
    this._drawN = 0;
  }

  setPerfMode(on) {
    this.detectMs = on ? DETECT_MS_GAME : DETECT_MS_IDLE;
  }

  setZone(width) {
    const w = Math.min(0.4, Math.max(0.1, Number(width) || 0.2));
    this.zoneLeft = 0.5 - w / 2;
    this.zoneRight = 0.5 + w / 2;
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camara no disponible: abre via http://127.0.0.1:8090");
    }

    this.onStatus?.("Pidiendo camara…");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 15, max: 20 }
        },
        audio: false
      });
    } catch (err) {
      throw new Error(cameraError(err));
    }
    this.video.srcObject = this.stream;
    this.video.classList.add("vision-video-src");
    this.video.setAttribute("playsinline", "");
    this.video.muted = true;
    await this.video.play();
    await new Promise((r) => {
      if (this.video.videoWidth) r();
      else this.video.addEventListener("loadeddata", () => r(), { once: true });
    });
    this.syncCanvasToVideo();

    try {
      this.onStatus?.("Camara OK · MediaPipe CPU…");
      const { FilesetResolver, HandLandmarker } = await withTimeout(
        import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"),
        18000,
        "MediaPipe no cargo (CDN). Revisa internet y recarga."
      );
      const resolver = await withTimeout(
        FilesetResolver.forVisionTasks(WASM_BASE),
        18000,
        "WASM de MediaPipe no arranco. Recarga la pagina."
      );
      this.landmarker = await withTimeout(
        HandLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.45,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4
        }),
        25000,
        "El modelo de manos tardo demasiado. Recarga e intenta de nuevo."
      );
    } catch (err) {
      this.stop();
      throw err;
    }

    this.running = true;
    this.onStatus?.("Manos OK — IZQ azul · DER verde");
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.timer = window.setTimeout(loop, this.detectMs);
    };
    this.timer = window.setTimeout(loop, this.detectMs);
  }

  syncCanvasToVideo() {
    const vw = this.video.videoWidth || PREVIEW_W;
    const vh = this.video.videoHeight || PREVIEW_H;
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
    }
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.dirX = 0;
    this.shoot = false;
    this.jump = false;
    this.crouch = false;
    this.aimUp = false;
    this.leftFist = false;
    this._hands = [];
    this._leftLm = null;
    this._rightLm = null;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.emit(true);
    this.onStatus?.("Cámara: apagada");
  }

  mapSide(handedness, index) {
    const entry = handedness?.[index];
    const label = entry?.[0]?.categoryName || entry?.categoryName || entry?.label || "";
    if (/left/i.test(label)) return "Left";
    if (/right/i.test(label)) return "Right";
    return "Unknown";
  }

  splitHands(result) {
    const landmarks = result.landmarks || [];
    const handed = result.handednesses || result.handedness || [];
    const items = landmarks.map((lm, i) => ({
      lm,
      side: this.mapSide(handed, i),
      x: lm[LM.WRIST]?.x ?? 0.5
    }));

    let left = null;
    let right = null;
    for (const it of items) {
      if (it.side === "Left" && !left) left = it;
      if (it.side === "Right" && !right) right = it;
    }

    if (items.length === 1) {
      const only = items[0];
      if (only.side === "Right") right = only;
      else if (only.side === "Left") left = only;
      else if (only.x >= 0.5) left = only;
      else right = only;
    } else if (items.length >= 2) {
      const sorted = [...items].sort((a, b) => a.x - b.x);
      if (!right) right = sorted[0];
      if (!left) left = sorted[sorted.length - 1];
      if (left && right && left.lm === right.lm) {
        right = sorted[0];
        left = sorted[sorted.length - 1];
      }
    }

    return { left: left?.lm || null, right: right?.lm || null, all: items };
  }

  tick() {
    if (!this.landmarker || this.video.readyState < 2) return;
    if (document.hidden) return;
    this.syncCanvasToVideo();

    let result;
    try {
      result = this.landmarker.detectForVideo(this.video, performance.now());
    } catch (_e) {
      return;
    }

    const { left, right, all } = this.splitHands(result);
    this._leftLm = left;
    this._rightLm = right;
    this._hands = all.map((it) => {
      let side = it.side;
      if (side === "Unknown") {
        if (it.lm === left) side = "Left";
        else if (it.lm === right) side = "Right";
      }
      return { lm: it.lm, side };
    });

    if (left) {
      const L = analyzeHand(left);
      this.leftFist = L.isFist;
      this.aimUp = !L.isFist && L.pinkyOnly;
      this.smoothTipX = this.smoothTipX * 0.45 + L.tip.x * 0.55;
      const x = this.smoothTipX;
      const zl = this.zoneLeft;
      const zr = this.zoneRight;
      if (this.dirX > 0) {
        if (x > zl + ZONE_RELEASE) this.dirX = x >= zr ? -1 : 0;
      } else if (this.dirX < 0) {
        if (x < zr - ZONE_RELEASE) this.dirX = x <= zl ? 1 : 0;
      } else if (x <= zl) this.dirX = 1;
      else if (x >= zr) this.dirX = -1;
    } else {
      this.leftFist = false;
      this.aimUp = false;
      this.dirX = 0;
    }
    const fistPulse = this.leftFist && !this.leftFistWas;
    this.leftFistWas = this.leftFist;

    if (right) {
      const R = analyzeHand(right);
      if (R.isOpen) {
        this.shoot = true;
        this.jump = false;
        this.crouch = false;
      } else if (R.isFist) {
        this.shoot = false;
        this.jump = true;
        this.crouch = false;
      } else if (R.pointingDown) {
        this.shoot = false;
        this.jump = false;
        this.crouch = true;
      } else {
        this.shoot = false;
        this.jump = false;
        this.crouch = false;
      }
    } else {
      this.shoot = false;
      this.jump = false;
      this.crouch = false;
    }

    this.draw();
    this.onTrack?.({
      tipX: left ? 1 - this.smoothTipX : null,
      dirX: this.dirX,
      left: Boolean(left),
      right: Boolean(right),
      zoneLeft: 1 - this.zoneRight,
      zoneRight: 1 - this.zoneLeft
    });
    this.emit(false, fistPulse);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);

    ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.06, h * 0.08, w * 0.88, h * 0.84);

    ctx.fillStyle = this.dirX > 0 ? "rgba(74, 222, 128, 0.16)" : "rgba(74, 222, 128, 0.05)";
    ctx.fillRect(0, 0, w * this.zoneLeft, h);
    ctx.fillStyle = this.dirX < 0 ? "rgba(251, 146, 60, 0.16)" : "rgba(251, 146, 60, 0.05)";
    ctx.fillRect(w * this.zoneRight, 0, w * (1 - this.zoneRight), h);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * this.zoneLeft, 0);
    ctx.lineTo(w * this.zoneLeft, h);
    ctx.moveTo(w * this.zoneRight, 0);
    ctx.lineTo(w * this.zoneRight, h);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const hand of this._hands) {
      const lm = hand.lm;
      if (!lm || lm.length < 21) continue;
      const c = COLORS[hand.side] || COLORS.Unknown;
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const [a, b] of SLIM_EDGES) {
        if (!lm[a] || !lm[b]) continue;
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
      ctx.stroke();
      ctx.fillStyle = c.fill;
      for (const idx of [0, 4, 8, 12, 16, 20]) {
        const p = lm[idx];
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this._leftLm?.[LM.INDEX_TIP]) {
      const tip = this._leftLm[LM.INDEX_TIP];
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tip.x * w, tip.y * h, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - 28, w, 28);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px sans-serif";
    ctx.fillText(this.statusLabel(), 8, h - 10);
  }

  statusLabel() {
    const n = this._hands.length;
    const bits = [];
    if (this.dirX > 0) bits.push("→ AVANZA");
    else if (this.dirX < 0) bits.push("← ATRÁS");
    if (this.aimUp) bits.push("ARRIBA");
    if (this.shoot) bits.push("DISPARO");
    if (this.jump) bits.push("SALTO");
    if (this.crouch) bits.push("AGACHAR");
    if (this.leftFist) bits.push("START");
    if (bits.length) return bits.join(" · ");
    if (n === 0) return "Acerca las manos";
    if (n === 1) return "1 mano — falta la otra";
    return "2 manos OK";
  }

  emit(force = false, fistPulse = false) {
    const payload = {
      dir_x: this.dirX,
      shoot: this.shoot,
      jump: this.jump,
      crouch: this.crouch,
      aimUp: this.aimUp,
      fistPulse,
      label: this.statusLabel().toLowerCase()
    };
    const key = `${payload.dir_x}|${payload.shoot}|${payload.jump}|${payload.crouch}|${payload.aimUp}|${fistPulse}|${this._hands.length}`;
    if (!force && !fistPulse && key === this.lastSent.key) return;
    this.lastSent = { key };
    this.onUpdate?.(payload);
  }
}
