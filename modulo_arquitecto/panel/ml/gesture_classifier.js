
import { FEATURE_SIZE } from "./gesture_features.js";

const POSITION_AIM = {
  posicion_izq: { x: 0.18, y: 0.5, z: 0 },
  posicion_centro: { x: 0.5, y: 0.5, z: 0 },
  posicion_der: { x: 0.82, y: 0.5, z: 0 }
};

const POSITION_LABELS = {
  posicion_izq: "Sala (izq)",
  posicion_centro: "Cocina (centro)",
  posicion_der: "Escalera (der)"
};

const GESTURE_TO_COMMAND = {
  posicion_izq: { name: "apuntar", kind: "hold", hand: "Left", zone: "posicion_izq" },
  posicion_centro: { name: "apuntar", kind: "hold", hand: "Left", zone: "posicion_centro" },
  posicion_der: { name: "apuntar", kind: "hold", hand: "Left", zone: "posicion_der" }
};

function relu(v) {
  return v.map((x) => (x > 0 ? x : 0));
}

function softmax(v) {
  const m = Math.max(...v);
  const ex = v.map((x) => Math.exp(x - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / s);
}

function matVec(W, x, b) {
  const out = new Array(W.length);
  for (let i = 0; i < W.length; i += 1) {
    let s = b[i];
    for (let j = 0; j < x.length; j += 1) s += W[i][j] * x[j];
    out[i] = s;
  }
  return out;
}

export class NexumGestureClassifier {
  constructor() {
    this.ready = false;
    this.clases = [];
    this.mean = [];
    this.scale = [];
    this.layers = [];
    this.metadata = null;
  }

  async load(url = "../models/vision/model.json") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Modelo no encontrado (${res.status})`);
    const data = await res.json();
    if (data.input_size !== FEATURE_SIZE) {
      throw new Error(`input_size ${data.input_size} != ${FEATURE_SIZE}`);
    }
    this.clases = data.clases;
    this.mean = data.scaler.mean;
    this.scale = data.scaler.scale.map((s) => (Math.abs(s) < 1e-8 ? 1 : s));
    this.layers = data.layers;
    this.ready = true;
    try {
      const metaRes = await fetch("../models/vision/metadata.json");
      if (metaRes.ok) this.metadata = await metaRes.json();
    } catch (_e) {
    }
    return data;
  }

  scaleFeatures(vec) {
    return vec.map((v, i) => (v - this.mean[i]) / this.scale[i]);
  }

  forward(vec) {
    let h = this.scaleFeatures(vec);
    for (let i = 0; i < this.layers.length - 1; i += 1) {
      h = relu(matVec(this.layers[i].W, h, this.layers[i].b));
    }
    const last = this.layers[this.layers.length - 1];
    return matVec(last.W, h, last.b);
  }

  predict(vec) {
    if (!this.ready) return { clase: "posicion_centro", confidence: 0, probs: [] };
    const logits = this.forward(vec);
    const probs = softmax(logits);
    let best = 0;
    for (let i = 1; i < probs.length; i += 1) {
      if (probs[i] > probs[best]) best = i;
    }
    const clase = this.clases[best];
    return {
      clase,
      confidence: probs[best],
      probs,
      label: POSITION_LABELS[clase] || clase,
      aim: POSITION_AIM[clase] || POSITION_AIM.posicion_centro,
      command: GESTURE_TO_COMMAND[clase] || GESTURE_TO_COMMAND.posicion_centro
    };
  }
}
