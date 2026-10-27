
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const DETECT_MS = 30;
const MOVE_MIN_DELTA = 0.0006;
const ACTIVE_BOX = { x0: 0.16, x1: 0.84, y0: 0.12, y1: 0.68 };
const STABLE_FRAMES = 4;
const CLICK_ROLLBACK_MS = 140;
const CLICK_COOLDOWN_MS = 450;
const WINDOWS_HOLD_MS = 380;
const WINDOWS_COOLDOWN_MS = 1500;
const BACKSPACE_REPEAT_AFTER_MS = 800;
const BACKSPACE_REPEAT_MS = 240;

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  THUMB_IP: 3,
  THUMB_MCP: 2,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20
};

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

class LowPass {
  constructor() {
    this.y = null;
  }

  filter(x, a) {
    this.y = this.y == null ? x : this.y + a * (x - this.y);
    return this.y;
  }
}

class OneEuro {
  constructor(minCutoff = 1.0, beta = 6.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.t = 0;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(v, tMs) {
    const dt = this.t ? Math.max(0.001, (tMs - this.t) / 1000) : 1 / 30;
    this.t = tMs;
    const prev = this.x.y ?? v;
    const ed = this.dx.filter((v - prev) / dt, OneEuro.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(v, OneEuro.alpha(cutoff, dt));
  }

  reset() {
    this.x.y = null;
    this.dx.y = null;
    this.t = 0;
  }
}

function fingerUp(lm, tip, pip) {
  return dist(lm[tip], lm[LM.WRIST]) > dist(lm[pip], lm[LM.WRIST]) * 1.1;
}

function analyzeHand(lm) {
  const indexUp = fingerUp(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const middleUp = fingerUp(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const ringUp = fingerUp(lm, LM.RING_TIP, LM.RING_PIP);
  const pinkyUp = fingerUp(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  const palm = dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP]) || 0.1;
  const thumbExt = dist(lm[LM.THUMB_TIP], lm[LM.WRIST]) > dist(lm[LM.THUMB_IP], lm[LM.WRIST]) * 1.12;
  const thumbReach = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / palm;
  const thumb = thumbExt && thumbReach > 0.55;
  const extended = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  const tip = lm[LM.INDEX_TIP];
  const mcp = lm[LM.INDEX_MCP];
  return {
    point: { x: tip.x * 0.65 + mcp.x * 0.35, y: tip.y * 0.65 + mcp.y * 0.35 },
    wrist: lm[LM.WRIST],
    indexUp,
    extended,
    thumb,
    isFist: extended === 0 && !thumb,
    fullOpen: extended === 4 && thumbExt && thumbReach > 0.45,
    pinkyOnly: pinkyUp && !indexUp && !middleUp && !ringUp,
    thumbOnly: thumb && extended === 0
  };
}

export class CursorVision {
  constructor({ video, canvas, onAction, onStatus, onHint }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d", { alpha: true }) || null;
    this.onAction = onAction;
    this.onStatus = onStatus;
    this.onHint = onHint;
    this.running = false;
    this.landmarker = null;
    this.stream = null;
    this.timer = 0;
    this.lastVideoTime = -1;
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.cursorX = 0.5;
    this.cursorY = 0.5;
    this.lastSentX = -1;
    this.lastSentY = -1;
    this.history = [];
    this.rightLabel = "Left";
    this.lastSingle = null;
    this.gesture = "none";
    this.gestureSince = 0;
    this.gestureFrames = 0;
    this.gestureFired = false;
    this.lastRepeatAt = 0;
    this.lastClickAt = 0;
    this.lastWindowsAt = 0;
  }

  async start() {
    if (this.running) return;
    this.onStatus?.("Cargando MediaPipe…");

    const { FilesetResolver, HandLandmarker } = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
    );
    const resolver = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(resolver, options("GPU"));
    } catch (_e) {
      this.landmarker = await HandLandmarker.createFromOptions(resolver, options("CPU"));
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    await new Promise((r) => {
      if (this.video.videoWidth) r();
      else this.video.addEventListener("loadeddata", () => r(), { once: true });
    });
    this.syncCanvas();
    this.fx.reset();
    this.fy.reset();
    this.history = [];

    this.running = true;
    this.onStatus?.("Vision lista — mueve el indice");
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.timer = window.setTimeout(loop, DETECT_MS);
    };
    this.timer = window.setTimeout(loop, DETECT_MS);
  }

  syncCanvas() {
    const vw = this.video.videoWidth || 640;
    const vh = this.video.videoHeight || 480;
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
    }
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_e) {}
      });
      this.stream = null;
    }
    if (this.video) {
      try {
        this.video.pause();
      } catch (_e) {}
      this.video.srcObject = null;
      this.video.removeAttribute("src");
      this.video.load?.();
    }
    try {
      this.landmarker?.close?.();
    } catch (_e) {}
    this.landmarker = null;
    this.lastVideoTime = -1;
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.onStatus?.("Vision: apagada");
    this.onHint?.("—");
  }

  assignHands(hands, handedness) {
    const items = hands.map((lm, i) => ({
      lm,
      label: handedness[i]?.[0]?.categoryName || "",
      info: analyzeHand(lm)
    }));
    if (items.length >= 2) {
      items.sort((a, b) => a.info.wrist.x - b.info.wrist.x);
      const [right, left] = items;
      if (right.label && right.label !== left.label) this.rightLabel = right.label;
      this.lastSingle = null;
      return { right, left };
    }
    if (items.length === 1) {
      const it = items[0];
      let side = it.label === this.rightLabel ? "right" : "left";
      const prev = this.lastSingle;
      if (prev && dist(prev.wrist, it.info.wrist) < 0.15) side = prev.side;
      this.lastSingle = { side, wrist: it.info.wrist };
      return side === "right" ? { right: it, left: null } : { right: null, left: it };
    }
    this.lastSingle = null;
    return { right: null, left: null };
  }

  classify(right, left) {
    const cursorHand = right || left;
    if (left?.info.fullOpen) return "windows";
    if (right?.info.isFist || left?.info.isFist) return "fist";
    if (cursorHand.info.pinkyOnly) return "click-left";
    if (cursorHand.info.thumbOnly) return "click-right";
    if (cursorHand.info.indexUp) return "move";
    return "idle";
  }

  positionAt(tMs) {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= tMs) return this.history[i];
    }
    return this.history[0] || { x: this.cursorX, y: this.cursorY };
  }

  sendMove(x, y) {
    if (Math.abs(x - this.lastSentX) < MOVE_MIN_DELTA && Math.abs(y - this.lastSentY) < MOVE_MIN_DELTA) return;
    this.lastSentX = x;
    this.lastSentY = y;
    this.onAction?.({ kind: "move", x, y });
  }

  fireGesture(name, now) {
    if (name === "windows") {
      if (now - this.gestureSince < WINDOWS_HOLD_MS || now - this.lastWindowsAt < WINDOWS_COOLDOWN_MS) return false;
      this.lastWindowsAt = now;
      this.onAction?.({ kind: "key", key: "windows" });
      this.onHint?.("Windows");
      return true;
    }
    if (name === "fist") {
      this.lastRepeatAt = now;
      this.onAction?.({ kind: "key", key: "backspace" });
      this.onHint?.("Borrar");
      return true;
    }
    if (name === "click-left" || name === "click-right") {
      if (now - this.lastClickAt < CLICK_COOLDOWN_MS) return false;
      this.lastClickAt = now;
      const at = this.positionAt(this.gestureSince - CLICK_ROLLBACK_MS);
      this.sendMove(at.x, at.y);
      const button = name === "click-left" ? "left" : "right";
      this.onAction?.({ kind: "click", button });
      this.onHint?.(button === "left" ? "Clic izq" : "Clic der");
      return true;
    }
    return false;
  }

  tick() {
    if (!this.landmarker || !this.video.videoWidth) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    this.syncCanvas();
    const now = performance.now();
    const result = this.landmarker.detectForVideo(this.video, now);
    const hands = result?.landmarks || [];
    const { right, left } = this.assignHands(hands, result?.handednesses || []);

    if (!right && !left) {
      this.gesture = "none";
      this.fx.reset();
      this.fy.reset();
      this.draw(hands, null, null, "none");
      this.onHint?.("Sin mano");
      return;
    }

    const cursorHand = right || left;
    const p = cursorHand.info.point;
    const nx = clamp01(((1 - p.x) - ACTIVE_BOX.x0) / (ACTIVE_BOX.x1 - ACTIVE_BOX.x0));
    const ny = clamp01((p.y - ACTIVE_BOX.y0) / (ACTIVE_BOX.y1 - ACTIVE_BOX.y0));
    const fx = this.fx.filter(nx, now);
    const fy = this.fy.filter(ny, now);

    const g = this.classify(right, left);
    if (g !== this.gesture) {
      this.gesture = g;
      this.gestureSince = now;
      this.gestureFrames = 0;
      this.gestureFired = false;
    }
    this.gestureFrames += 1;

    if (g === "move") {
      this.cursorX = fx;
      this.cursorY = fy;
      this.history.push({ t: now, x: fx, y: fy });
      while (this.history.length && now - this.history[0].t > 600) this.history.shift();
      this.sendMove(fx, fy);
      this.onHint?.("Mover");
    } else if (g !== "idle" && this.gestureFrames >= STABLE_FRAMES) {
      if (!this.gestureFired) {
        this.gestureFired = this.fireGesture(g, now);
      } else if (g === "fist" && now - this.gestureSince >= BACKSPACE_REPEAT_AFTER_MS
        && now - this.lastRepeatAt >= BACKSPACE_REPEAT_MS) {
        this.fireGesture(g, now);
      }
    } else if (g === "idle") {
      this.onHint?.("Quieto");
    }

    this.draw(hands, right, left, g);
  }

  draw(hands, right, left, gesture) {
    if (!this.ctx) return;
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-w, 0);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      ACTIVE_BOX.x0 * w,
      ACTIVE_BOX.y0 * h,
      (ACTIVE_BOX.x1 - ACTIVE_BOX.x0) * w,
      (ACTIVE_BOX.y1 - ACTIVE_BOX.y0) * h
    );
    ctx.setLineDash([]);

    const edges = [[0, 5], [5, 8], [0, 9], [9, 12], [0, 13], [13, 16], [0, 17], [17, 20], [0, 1], [1, 4], [5, 9], [9, 13], [13, 17]];
    const sx = (pt) => (1 - pt.x) * w;
    const drawHand = (hand, color, tag) => {
      if (!hand) return;
      const lm = hand.lm;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(sx(lm[a]), lm[a].y * h);
        ctx.lineTo(sx(lm[b]), lm[b].y * h);
        ctx.stroke();
      });
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.fillText(tag, sx(lm[LM.WRIST]) - 12, lm[LM.WRIST].y * h + 20);
    };
    if (right || left) {
      drawHand(right, "#2dd4bf", "DER");
      drawHand(left, "#60a5fa", "IZQ");
      const cursorHand = right || left;
      const p = cursorHand.info.point;
      ctx.beginPath();
      ctx.fillStyle = gesture === "move" ? "#facc15" : "#f87171";
      ctx.arc(sx(p), p.y * h, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      hands.forEach((lm) => drawHand({ lm }, "#94a3b8", ""));
    }
  }
}
