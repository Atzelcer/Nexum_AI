
import { extractFeatures, landmarksFromHands } from "./ml/gesture_features.js?v=2";
import { NexumGestureClassifier } from "./ml/gesture_classifier.js?v=2";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const ML_CONFIDENCE_MIN = 0.45;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

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

const HAND_COLORS = {
  Left: { stroke: "rgba(96, 165, 250, 0.9)", fill: "rgba(147, 197, 253, 0.95)" },
  Right: { stroke: "rgba(45, 212, 191, 0.9)", fill: "rgba(94, 234, 212, 0.95)" }
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function fingerExtended(lm, tip, pip) {
  return dist(lm[tip], lm[LM.WRIST]) > dist(lm[pip], lm[LM.WRIST]) * 1.05;
}

function analyzePalmPose(lm) {
  const wrist = lm[LM.WRIST];
  const tips = [LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
  const avgTipY = tips.reduce((s, t) => s + lm[t].y, 0) / tips.length;
  const spread = avgTipY - wrist.y;
  return {
    palmCenter: {
      x: (lm[5].x + lm[17].x) / 2,
      y: (lm[5].y + lm[17].y) / 2,
      z: ((lm[5].z || 0) + (lm[17].z || 0)) / 2
    },
    spread,
    facing: spread < -0.032 ? "up" : spread > 0.032 ? "down" : "neutral"
  };
}

function analyzeHand(lm, side, wasPinching = false) {
  const pinch = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]);
  const pinchOn = wasPinching ? 0.084 : 0.058;
  const pinchOff = wasPinching ? 0.084 : 0.058;
  const isPinching = wasPinching ? pinch < pinchOff : pinch < pinchOn;
  const indexUp = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const middleUp = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const ringUp = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP);
  const pinkyUp = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  const extended = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  const palm = analyzePalmPose(lm);

  return {
    side,
    landmarks: lm,
    pinch,
    isPinching,
    isPalmOpen: extended >= 4 && pinch > 0.1,
    isFist: extended === 0 && pinch > 0.08,
    isPointing: indexUp && !isPinching && extended <= 2,
    isPeace: indexUp && middleUp && !ringUp && !pinkyUp && pinch > 0.1,
    wrist: lm[LM.WRIST],
    indexTip: lm[LM.INDEX_TIP],
    thumbTip: lm[LM.THUMB_TIP],
    indexAngle: Math.atan2(lm[LM.INDEX_TIP].y - lm[LM.WRIST].y, lm[LM.INDEX_TIP].x - lm[LM.WRIST].x),
    palmCenter: palm.palmCenter,
    palmFacing: palm.facing,
    palmSpread: palm.spread,
    pinchCenter: {
      x: (lm[LM.THUMB_TIP].x + lm[LM.INDEX_TIP].x) / 2,
      y: (lm[LM.THUMB_TIP].y + lm[LM.INDEX_TIP].y) / 2,
      z: ((lm[LM.THUMB_TIP].z || 0) + (lm[LM.INDEX_TIP].z || 0)) / 2
    }
  };
}

function cameraError(err) {
  const name = err?.name || "";
  const msg = err?.message || String(err);
  if (name === "NotAllowedError") return "Permiso de camara denegado. Permitela en el candado de Chrome.";
  if (name === "NotFoundError") {
    return "No hay webcam. En VirtualBox: Dispositivos → Webcam → activa la del host.";
  }
  if (name === "NotReadableError" || /device in use/i.test(msg)) {
    return "Webcam ocupada. Cierra Zoom, Camara de Windows u otras pestanas de NEXUM y reintenta.";
  }
  if (name === "OverconstrainedError") return "La webcam no acepta esa resolucion. Reintenta.";
  if (/out of memory|oom|memory|Array buffer allocation|Failed to allocate|Insufficient memory|WebAssembly\.Memory|GL_OUT_OF_MEMORY/i.test(msg)) {
    return "No hay memoria suficiente para el modelo de vision. Cierra otras apps/pestanas y reintenta.";
  }
  if (/Failed to fetch|NetworkError|CDN|Load failed|timed out|tardo demasiado/i.test(msg)) {
    return "No se pudo cargar MediaPipe (red/CDN o timeout). Revisa internet y recarga.";
  }
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

export class NexumVision {
  constructor({ video, canvas, mirror = true, onGesture, onHands, onStatus, onMlStatus, onSampleFrame }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d");
    this.mirror = mirror;
    this.onGesture = onGesture;
    this.onHands = onHands;
    this.onStatus = onStatus;
    this.onMlStatus = onMlStatus;
    this.onSampleFrame = onSampleFrame;
    this.running = false;
    this.landmarker = null;
    this.classifier = new NexumGestureClassifier();
    this.mlReady = false;
    this.mlSource = "heuristic";
    this.lastMlPrediction = null;
    this.recordSamples = false;
    this.stream = null;
    this.raf = 0;
    this.lastVideoTime = -1;
    this.gestureCandidate = "reposo";
    this.gestureSince = 0;
    this.lastEmit = {};
    this.prevBimanual = null;
    this._leftWasPinching = false;
    this._rightWasPinching = false;
    this.leftPinchCycleWas = false;
    this.rightPinchWas = false;
    this.rightPeaceWas = false;
    this.leftPointWas = false;
    this.leftPalmWas = false;
    this.TAP_COOLDOWN = 360;
    this.PINCH_COOLDOWN = 400;
    this.STABLE_MS = 35;
    this.HOLD_MS = 45;
    this.aimLabel = "";
    this.lastDetectAt = 0;
    this.detectIntervalMs = 28;
    this.mlFrameSkip = 0;
    this.drawSkip = 0;
    this._cachedHands = null;
  }

  async loadClassifier() {
    try {
      await this.classifier.load("../models/vision/model.json");
      this.mlReady = true;
      this.onMlStatus?.({ ready: true, mode: "ml", metadata: this.classifier.metadata });
      return true;
    } catch (err) {
      this.mlReady = false;
      this.onMlStatus?.({ ready: false, mode: "heuristic", error: err?.message || String(err) });
      return false;
    }
  }

  setRecordSamples(on) {
    this.recordSamples = Boolean(on);
  }

  async start() {
    if (this.running) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camara no disponible: abre via http://127.0.0.1:8090");
    }
    if (!window.isSecureContext) {
      throw new Error("Se requiere localhost (no abras el HTML como archivo)");
    }

    this.onStatus?.("Pidiendo camara…");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      });
    } catch (err) {
      throw new Error(cameraError(err));
    }
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    const syncSize = () => {
      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;
    };
    if (this.video.videoWidth) syncSize();
    else this.video.addEventListener("loadeddata", syncSize, { once: true });

    try {
      this.onStatus?.("Camara OK · cargando MediaPipe…");
      await this.loadClassifier();
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
      try {
        this.landmarker = await withTimeout(
          HandLandmarker.createFromOptions(resolver, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
          }),
          25000,
          "El modelo de manos tardo demasiado (posible falta de memoria). Cierra pestanas y reintenta."
        );
      } catch (modelErr) {
        throw new Error(cameraError(modelErr));
      }
    } catch (err) {
      this.stop();
      throw new Error(cameraError(err));
    }

    this.running = true;
    this.onStatus?.("2 manos activas");
    this.loop();
    return true;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.prevBimanual = null;
    this._leftWasPinching = false;
    this._rightWasPinching = false;
    this.leftPinchCycleWas = false;
    this.rightPinchWas = false;
    this.rightPeaceWas = false;
    this.leftPointWas = false;
    this.leftPalmWas = false;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onStatus?.("Camara detenida");
    this.onHands?.(null);
  }

  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.landmarker || this.video.readyState < 2) return;

    const now = performance.now();
    if (now - this.lastDetectAt < this.detectIntervalMs) return;
    if (this.video.currentTime === this.lastVideoTime && now - this.lastDetectAt < 80) return;
    this.lastVideoTime = this.video.currentTime;
    this.lastDetectAt = now;

    const result = this.landmarker.detectForVideo(this.video, now);
    this.drawSkip = (this.drawSkip + 1) % 2;
    if (this.drawSkip === 0) this.draw(result);
    this.processFrame(result);
  }

  mapSide(handedness, index) {
    const entry = handedness?.[index];
    const label = entry?.[0]?.categoryName || entry?.categoryName || entry?.label || "";
    if (/left/i.test(label)) return "Left";
    if (/right/i.test(label)) return "Right";
    return index === 0 ? "Left" : "Right";
  }

  processFrame(result) {
    const landmarks = result.landmarks || [];
    if (!landmarks.length) {
      if (this.gestureCandidate !== "reposo") {
        this.gestureCandidate = "reposo";
        this.emitGesture("reposo", "idle", 0, "reposo");
      }
      this.onHands?.(null);
      return;
    }

    const handed = result.handednesses || result.handedness || [];
    const hands = landmarks.map((lm, i) => {
      const side = this.mapSide(handed, i);
      const wasPinching = side === "Left" ? this._leftWasPinching : this._rightWasPinching;
      return analyzeHand(lm, side, wasPinching);
    });
    const left = hands.find((h) => h.side === "Left");
    const right = hands.find((h) => h.side === "Right");
    this._leftWasPinching = Boolean(left?.isPinching);
    this._rightWasPinching = Boolean(right?.isPinching);

    this.mlFrameSkip = (this.mlFrameSkip + 1) % 3;
    if (this.mlReady && left && this.mlFrameSkip === 0) {
      const { left: leftLm, right: rightLm } = landmarksFromHands(left, right);
      this.lastMlPrediction = this.classifier.predict(extractFeatures(leftLm, rightLm));
    }

    const bimanual = this.buildBimanual(left, right);
    this._palmMode = bimanual.rightPalmLift
      ? (bimanual.rightPalmFacing === "up" || bimanual.rightPalmFacing === "down" ? "vertical" : "horizontal")
      : bimanual.leftPalmLift
        ? "vertical"
        : "none";
    this._liftFacing = bimanual.rightPalmLift
      ? bimanual.rightPalmFacing
      : bimanual.leftPalmLift
        ? bimanual.leftPalmFacing
        : "neutral";

    this.onHands?.({ hands, bimanual, ml: this.lastMlPrediction });

    if (this.recordSamples && this.onSampleFrame) {
      const { left: leftLm, right: rightLm } = landmarksFromHands(left, right);
      this.onSampleFrame({ left: leftLm, right: rightLm, bimanual });
    }

    if (left?.pinchCenter) {
      this.aimPoint = left.isPinching ? left.pinchCenter : (left.indexTip || left.wrist);
    } else if (right?.indexTip && this.gestureCandidate === "rotar") {
      this.aimPoint = right.indexTip;
    } else if ((right?.palmCenter || left?.palmCenter) && (this.gestureCandidate === "elevar" || this.gestureCandidate === "mover")) {
      this.aimPoint = right?.palmCenter || left?.palmCenter;
    } else if (!right) {
      this.aimPoint = null;
    }
    this.resolveGestures(left, right, bimanual);
  }

  buildBimanual(left, right) {
    const bothPinching = Boolean(left?.isPinching && right?.isPinching);
    const bothPalmsOpen = Boolean(left?.isPalmOpen && right?.isPalmOpen);
    let pinchDistance = 0;
    let center = null;
    let angle = 0;

    if (left && right) {
      pinchDistance = dist(left.pinchCenter, right.pinchCenter);
      center = {
        x: (left.pinchCenter.x + right.pinchCenter.x) / 2,
        y: (left.pinchCenter.y + right.pinchCenter.y) / 2,
        z: (left.pinchCenter.z + right.pinchCenter.z) / 2
      };
      angle = Math.atan2(
        right.pinchCenter.y - left.pinchCenter.y,
        right.pinchCenter.x - left.pinchCenter.x
      );
    }

    const prev = this.prevBimanual;
    const data = {
      leftPinching: Boolean(left?.isPinching),
      rightPinching: Boolean(right?.isPinching),
      bothPinching,
      bothPalmsOpen,
      leftPalmOpen: Boolean(left?.isPalmOpen),
      rightPalmOpen: Boolean(right?.isPalmOpen),
      leftFist: Boolean(left?.isFist),
      rightFist: Boolean(right?.isFist),
      leftPointing: Boolean(left?.isPointing),
      rightPointing: Boolean(right?.isPointing),
      leftPeace: Boolean(left?.isPeace),
      rightPeace: Boolean(right?.isPeace),
      leftPalmLift: Boolean(left?.isPalmOpen && !left?.isPinching && !left?.isPointing),
      rightPalmLift: Boolean(right?.isPalmOpen && !right?.isPinching && !right?.isPointing),
      leftPalmFacing: left?.palmFacing || "neutral",
      rightPalmFacing: right?.palmFacing || "neutral",
      pinchDistance,
      center,
      angle,
      pinchDistanceDelta: prev ? pinchDistance - prev.pinchDistance : 0,
      centerDelta: prev?.center && center
        ? { x: center.x - prev.center.x, y: center.y - prev.center.y, z: center.z - prev.center.z }
        : { x: 0, y: 0, z: 0 },
      angleDelta: prev ? angle - prev.angle : 0,
      left: left || null,
      right: right || null
    };
    this.prevBimanual = { pinchDistance, center, angle };
    return data;
  }

  resolveFromMl(left, right, bimanual) {
    const { left: leftLm, right: rightLm } = landmarksFromHands(left, right);
    const features = extractFeatures(leftLm, rightLm);
    const pred = this.classifier.predict(features);
    this.lastMlPrediction = pred;

    if (pred.confidence < ML_CONFIDENCE_MIN) return null;

    const cmd = pred.command;
    return {
      name: cmd.name,
      gesture: pred.clase,
      kind: cmd.kind,
      hand: cmd.hand || "Left",
      aim: pred.aim,
      positionLabel: pred.label,
      confidence: pred.confidence,
      source: "ml"
    };
  }

  mlTapWasReset(_bimanual) {
  }

  resolveGesturesHeuristic(left, right, bimanual) {
    const now = performance.now();
    let name = "reposo";
    let gesture = "reposo";
    let kind = "idle";
    let hand = null;
    let aim = null;

    if (bimanual.bothPalmsOpen) {
      name = "orbitar";
      gesture = "dos_palmas";
      kind = "hold";
    } else if (bimanual.bothPinching) {
      name = "transformar";
      gesture = "dos_pinzas";
      kind = "hold";
    } else if (bimanual.leftPinching && !bimanual.rightPinching) {
      this.gestureCandidate = "ciclar_modulo";
      this.aimPoint = left?.pinchCenter;
      this.leftPinchCycleWas = bimanual.leftPinching;
      this.rightPinchWas = bimanual.rightPinching;
      this.rightPeaceWas = bimanual.rightPeace;
      this.leftPointWas = bimanual.leftPointing;
      this.leftPalmWas = bimanual.leftPalmOpen;
      return;
    } else if (bimanual.rightPeace && !bimanual.leftPinching) {
      if (!this.rightPeaceWas) {
        name = "duplicar";
        gesture = "v_der";
        kind = "tap";
      }
    } else if (bimanual.rightPointing && !bimanual.leftPinching && !bimanual.rightPinching) {
      name = "rotar";
      gesture = "indice_der";
      kind = "hold";
      hand = "Right";
      aim = right?.indexTip;
    } else if (bimanual.rightPalmLift && !bimanual.leftPinching && !bimanual.rightPinching && !bimanual.rightPointing) {
      if (bimanual.rightPalmFacing === "up" || bimanual.rightPalmFacing === "down") {
        name = "elevar";
        gesture = "palma_der";
        kind = "hold";
        hand = "Right";
        aim = right?.palmCenter || right?.wrist;
      } else {
        name = "mover";
        gesture = "palma_slide_der";
        kind = "hold";
        hand = "Right";
        aim = right?.palmCenter || right?.wrist;
      }
    } else if (bimanual.leftPalmLift && !bimanual.rightPinching && !bimanual.leftPinching && !right) {
      name = "elevar";
      gesture = "palma_izq";
      kind = "hold";
      hand = "Left";
      aim = left?.palmCenter || left?.wrist;
    } else if (left && !bimanual.leftPinching && !bimanual.rightPinching && !bimanual.leftPalmLift) {
      name = "preview_modulo";
      gesture = "mano_izq";
      kind = "hold";
      hand = "Left";
      aim = left?.indexTip || left?.wrist;
    } else if (bimanual.rightPinching && !bimanual.leftPinching) {
      name = "mover";
      gesture = "pinza_der";
      kind = "hold";
      hand = "Right";
      aim = right?.pinchCenter;
    } else if (bimanual.leftFist && !right) {
      name = "cancelar";
      gesture = "punio_izq";
      kind = "tap";
    } else if (bimanual.rightFist) {
      name = "confirmar";
      gesture = "punio_der";
      kind = "tap";
    }

    this.leftPinchCycleWas = bimanual.leftPinching;
    this.rightPinchWas = bimanual.rightPinching;
    this.rightPeaceWas = bimanual.rightPeace;
    this.leftPointWas = bimanual.leftPointing;
    this.leftPalmWas = bimanual.leftPalmOpen;

    if (name !== this.gestureCandidate) {
      this.gestureCandidate = name;
      this.gestureSince = now;
      return;
    }
    const stableMs = kind === "hold" ? this.HOLD_MS : this.STABLE_MS;
    if (now - this.gestureSince < stableMs) return;

    this.aimPoint = aim;
    this.aimLabel = name === "preview_modulo" ? "Pinza -> siguiente" : name === "rotar" ? "Girar indice" : name === "mover" ? "Palma <- ->" : name === "elevar" ? "Palma arriba/abajo" : name === "ciclar_modulo" ? "Elegido" : "";

    if (kind === "tap" && name !== "reposo") {
      const cd = name === "ciclar_modulo" ? this.PINCH_COOLDOWN : this.TAP_COOLDOWN;
      if (now - (this.lastEmit[name] || 0) < cd) return;
      this.lastEmit[name] = now;
    }

    this.emitGesture(name, kind, 0.9, gesture, hand, aim, "heuristic");
  }

  resolveGestures(left, right, bimanual) {
    this.mlSource = this.mlReady && this.lastMlPrediction?.confidence >= ML_CONFIDENCE_MIN ? "ml+heuristic" : "heuristic";
    this.resolveGesturesHeuristic(left, right, bimanual);
  }

  applyGestureResolution({ name, kind, gesture, hand, aim, confidence, source }) {
    const now = performance.now();
    if (name !== this.gestureCandidate) {
      this.gestureCandidate = name;
      this.gestureSince = now;
      return;
    }
    const stableMs = kind === "hold" ? this.HOLD_MS : this.STABLE_MS;
    if (now - this.gestureSince < stableMs) return;

    this.aimPoint = aim;
    this.aimLabel = name === "apuntar" ? "Apuntando" : "";

    if (kind === "tap" && name !== "reposo") {
      if (now - (this.lastEmit[name] || 0) < this.TAP_COOLDOWN) return;
      this.lastEmit[name] = now;
    }

    this.emitGesture(name, kind, confidence ?? 0.9, gesture, hand, aim, source || this.mlSource);
  }

  emitGesture(name, kind, confidence, gesture = name, hand = null, aim = null, source = "vision") {
    this.onGesture?.({
      name,
      kind,
      gesture,
      hand,
      aim,
      source: source === "ml" ? "vision-ml" : "vision",
      confidence,
      mlMode: this.mlSource
    });
  }

  draw(result) {
    if (!this.ctx) return;
    const { width, height } = this.canvas;
    this.ctx.save();
    this.ctx.clearRect(0, 0, width, height);
    if (this.mirror) {
      this.ctx.translate(width, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(this.video, 0, 0, width, height);

    const landmarks = result.landmarks || [];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    landmarks.forEach((lm, i) => {
      const side = this.mapSide(result.handedness, i);
      const colors = HAND_COLORS[side] || HAND_COLORS.Left;
      const wasPinching = side === "Left" ? this._leftWasPinching : this._rightWasPinching;
      const hand = analyzeHand(lm, side, wasPinching);
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = colors.stroke;
      this.ctx.beginPath();
      for (const [a, b] of edges) {
        this.ctx.moveTo(lm[a].x * width, lm[a].y * height);
        this.ctx.lineTo(lm[b].x * width, lm[b].y * height);
      }
      this.ctx.stroke();
      if (hand.isPinching && side === "Left") {
        this.ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(lm[LM.THUMB_TIP].x * width, lm[LM.THUMB_TIP].y * height);
        this.ctx.lineTo(lm[LM.INDEX_TIP].x * width, lm[LM.INDEX_TIP].y * height);
        this.ctx.stroke();
      }
      for (const idx of [0, 4, 8, 12, 16, 20]) {
        const p = lm[idx];
        this.ctx.fillStyle = colors.fill;
        this.ctx.beginPath();
        this.ctx.arc(p.x * width, p.y * height, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    if (landmarks.length === 2) {
      const h0 = analyzeHand(landmarks[0], this.mapSide(result.handedness, 0));
      const h1 = analyzeHand(landmarks[1], this.mapSide(result.handedness, 1));
      if (h0.isPinching && h1.isPinching) {
        this.ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(h0.pinchCenter.x * width, h0.pinchCenter.y * height);
        this.ctx.lineTo(h1.pinchCenter.x * width, h1.pinchCenter.y * height);
        this.ctx.stroke();
      }
    }

    if (this.aimPoint) {
      const ax = this.aimPoint.x * width;
      const ay = this.aimPoint.y * height;
      const isPinch = this.gestureCandidate === "ciclar_modulo" || this._leftWasPinching;
      const isPreview = this.gestureCandidate === "preview_modulo";
      const isRotate = this.gestureCandidate === "rotar";
      const isLift = this.gestureCandidate === "elevar";
      const isMove = this.gestureCandidate === "mover";
      this.ctx.strokeStyle = isPinch ? "rgba(250, 204, 21, 0.95)" : isMove ? "rgba(56, 189, 248, 0.95)" : isLift ? "rgba(167, 139, 250, 0.95)" : isRotate ? "rgba(45, 212, 191, 0.95)" : "rgba(96, 165, 250, 0.95)";
      this.ctx.fillStyle = isPinch ? "rgba(250, 204, 21, 0.3)" : isMove ? "rgba(56, 189, 248, 0.28)" : isLift ? "rgba(167, 139, 250, 0.28)" : isRotate ? "rgba(45, 212, 191, 0.28)" : "rgba(96, 165, 250, 0.22)";
      this.ctx.lineWidth = isPinch || isLift || isMove ? 3 : isRotate ? 3 : 2;
      this.ctx.beginPath();
      this.ctx.arc(ax, ay, isPinch ? 20 : isMove ? 18 : isLift ? 18 : isRotate ? 18 : 14, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      if (isPinch) {
        this.ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
        this.ctx.font = "bold 11px IBM Plex Sans, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("SIGUIENTE", ax, ay - 28);
      } else if (isMove) {
        this.ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
        this.ctx.font = "bold 11px IBM Plex Sans, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("MOVER", ax, ay - 28);
        this.ctx.beginPath();
        this.ctx.moveTo(ax - 16, ay);
        this.ctx.lineTo(ax + 16, ay);
        this.ctx.stroke();
      } else if (isLift) {
        const facing = this._liftFacing || "neutral";
        this.ctx.fillStyle = "rgba(167, 139, 250, 0.95)";
        this.ctx.font = "bold 11px IBM Plex Sans, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText(facing === "up" ? "SUBIR" : facing === "down" ? "BAJAR" : "ALTURA", ax, ay - 28);
        this.ctx.beginPath();
        this.ctx.moveTo(ax, ay - 8);
        this.ctx.lineTo(ax, ay + (facing === "down" ? 16 : -16));
        this.ctx.stroke();
      } else if (isRotate) {
        this.ctx.fillStyle = "rgba(45, 212, 191, 0.95)";
        this.ctx.font = "bold 11px IBM Plex Sans, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("ROTAR", ax, ay - 28);
      } else if (isPreview) {
        this.ctx.fillStyle = "rgba(147, 197, 253, 0.9)";
        this.ctx.font = "10px IBM Plex Mono, monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillText("pinza ->", ax, ay - 22);
      }
    }

    if (this.gestureCandidate === "elevar" || this.gestureCandidate === "mover") {
      landmarks.forEach((lm, i) => {
        const side = this.mapSide(result.handedness, i);
        if (this.gestureCandidate === "mover" && side !== "Right") return;
        const hand = analyzeHand(lm, side, side === "Left" ? this._leftWasPinching : this._rightWasPinching);
        if (!hand.isPalmOpen || hand.isPointing) return;
        const cx = hand.palmCenter.x * width;
        const cy = hand.palmCenter.y * height;
        const isMove = this.gestureCandidate === "mover";
        this.ctx.strokeStyle = isMove ? "rgba(56, 189, 248, 0.85)" : "rgba(167, 139, 250, 0.85)";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        if (isMove) {
          this.ctx.moveTo(cx - 18, cy);
          this.ctx.lineTo(cx + 18, cy);
        } else {
          const arrow = hand.palmFacing === "down" ? 12 : -12;
          this.ctx.moveTo(cx, cy);
          this.ctx.lineTo(cx, cy + arrow);
        }
        this.ctx.stroke();
      });
    }

    if (this.gestureCandidate === "rotar") {
      landmarks.forEach((lm, i) => {
        if (this.mapSide(result.handedness, i) !== "Right") return;
        const wx = lm[LM.WRIST].x * width;
        const wy = lm[LM.WRIST].y * height;
        const ix = lm[LM.INDEX_TIP].x * width;
        const iy = lm[LM.INDEX_TIP].y * height;
        this.ctx.strokeStyle = "rgba(45, 212, 191, 0.9)";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(wx, wy);
        this.ctx.lineTo(ix, iy);
        this.ctx.stroke();
        const angle = Math.atan2(iy - wy, ix - wx);
        const r = 28;
        this.ctx.beginPath();
        this.ctx.arc(wx, wy, r, angle - 0.5, angle + 0.5);
        this.ctx.stroke();
      });
    }

    this.ctx.restore();
  }
}
