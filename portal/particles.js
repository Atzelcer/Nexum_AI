import * as THREE from "three";

const MODE_STYLE = {
  idle: { a: 0x0d8f7d, b: 0xd9661f, opacity: 0.95, energy: 0.7, lines: 0.42 },
  glove: { a: 0x10b49c, b: 0xe87830, opacity: 1.0, energy: 1.0, lines: 0.55 },
  spatial: { a: 0x3f86cc, b: 0x8cc8ff, opacity: 1.0, energy: 0.95, lines: 0.52 }
};

const RING_Y = -1.45;
const RING_R = 1.78;

const COMMON_VERTEX =  `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uPointerStrength;
  uniform float uBurst;
  attribute float aScale;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aMix;
  varying float vAlpha;
  varying float vMix;

  vec3 repel(vec3 p) {
    vec3 d = p - uPointer;
    float f = uPointerStrength * smoothstep(1.5, 0.0, length(d));
    return p + normalize(d + vec3(1e-4)) * f * 0.7;
  }

  void finish(vec3 p, float alpha, float scale) {
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * scale * (7.0 / max(0.5, -mv.z));
    vAlpha = alpha;
    vMix = aMix;
  }
`;

const DUST_VERTEX =  `
  uniform float uHeight;
  uniform float uBaseY;
  ${COMMON_VERTEX}
  void main() {
    vec3 p = position;
    float y = mod(p.y - uBaseY + uTime * aSpeed * 0.18, uHeight);
    p.y = uBaseY + y;
    float ang = uTime * (0.02 + aSpeed * 0.03);
    float c = cos(ang);
    float s = sin(ang);
    p.xz = mat2(c, s, -s, c) * p.xz;
    p.x += sin(uTime * 0.5 + aPhase * 6.2831) * 0.18;
    p.z += cos(uTime * 0.4 + aPhase * 4.0) * 0.18;
    p.xz += normalize(p.xz + vec2(1e-4)) * uBurst * (1.0 + aScale) * 0.9;
    p = repel(p);
    float tw = 0.5 + 0.5 * sin(uTime * (1.2 + aSpeed * 2.0) + aPhase * 6.2831);
    float k = y / uHeight;
    float edge = smoothstep(0.0, 0.12, k) * smoothstep(1.0, 0.75, k);
    finish(p, edge * (0.35 + 0.65 * tw), aScale * (0.75 + 0.45 * tw));
  }
`;

const HELIX_VERTEX =  `
  uniform float uBottom;
  uniform float uTop;
  uniform float uEnergy;
  ${COMMON_VERTEX}
  void main() {
    float strand = position.x;
    float t = fract(aPhase + uTime * aSpeed * (0.06 + 0.05 * uEnergy));
    float y = mix(uBottom, uTop, t);
    float r = mix(${RING_R.toFixed(2)}, 0.42, smoothstep(0.0, 0.55, t)) + position.y;
    float a = t * 13.0 + strand * 2.0943951 - uTime * (0.5 + 0.6 * uEnergy) + position.z;
    vec3 p = vec3(cos(a) * r, y, sin(a) * r);
    p.xz *= 1.0 + uBurst * 0.6;
    p = repel(p);
    float alpha = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.82, t);
    finish(p, alpha * (0.4 + 0.6 * uEnergy), aScale * mix(1.0, 0.6, t));
  }
`;

const SPARK_VERTEX =  `
  uniform float uEnergy;
  ${COMMON_VERTEX}
  void main() {
    float life = fract(aPhase + uTime * aSpeed * (0.14 + 0.12 * uEnergy));
    float a = position.x + sin(uTime * 0.3 + aPhase * 6.28) * 0.2;
    float r = ${RING_R.toFixed(2)} + life * position.y;
    float y = ${RING_Y.toFixed(2)} + life * position.z;
    vec3 p = vec3(cos(a) * r, y, sin(a) * r);
    p.x += sin(life * 9.0 + aPhase * 20.0) * 0.06;
    p = repel(p);
    float alpha = smoothstep(0.0, 0.1, life) * (1.0 - life);
    finish(p, alpha * (0.5 + 0.5 * uEnergy), aScale * (1.0 - life * 0.6));
  }
`;

const WAVE_VERTEX =  `
  uniform float uWave;
  ${COMMON_VERTEX}
  void main() {
    float a = position.x;
    float r = ${RING_R.toFixed(2)} + uWave * 4.6 + sin(a * 9.0 + uTime * 4.0) * 0.06 * uWave;
    float y = ${RING_Y.toFixed(2)} + 0.05 + position.y * uWave * 0.7;
    vec3 p = vec3(cos(a) * r, y, sin(a) * r);
    float alpha = (1.0 - uWave) * step(0.001, uWave);
    finish(p, alpha, aScale * (1.0 + uWave));
  }
`;

const NODE_VERTEX =  `
  ${COMMON_VERTEX}
  void main() {
    float tw = 0.6 + 0.4 * sin(uTime * 1.6 + aPhase * 6.2831);
    finish(position, tw, aScale * (0.8 + 0.3 * tw));
  }
`;

const GLOW_FRAGMENT =  `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vMix;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float halo = pow(1.0 - d, 1.7);
    float core = pow(1.0 - d, 7.0);
    vec3 col = mix(uColorA, uColorB, vMix);
    col = mix(col, vec3(1.0), core * 0.75);
    gl_FragColor = vec4(col, min(1.0, (halo * 0.9 + core * 0.8) * vAlpha * uOpacity));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function createParticleSystem({ pixelRatio = 1, lowPower = false, reducedMotion = false } = {}) {
  const scale = lowPower ? 0.4 : 1;
  const group = new THREE.Group();
  group.name = "nexum-particles";

  const colorA = new THREE.Color(MODE_STYLE.idle.a);
  const colorB = new THREE.Color(MODE_STYLE.idle.b);
  const targetA = colorA.clone();
  const targetB = colorB.clone();
  const shared = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uPointer: { value: new THREE.Vector3(999, 999, 999) },
    uPointerStrength: { value: 0 },
    uBurst: { value: 0 },
    uColorA: { value: colorA },
    uColorB: { value: colorB },
    uEnergy: { value: MODE_STYLE.idle.energy }
  };

  const materials = [];
  let opacity = MODE_STYLE.idle.opacity;
  let targetOpacity = opacity;
  let energy = MODE_STYLE.idle.energy;
  let targetEnergy = energy;
  let lineStrength = MODE_STYLE.idle.lines;
  let targetLineStrength = lineStrength;

  function makeLayer(count, vertexShader, size, baseOpacity, fill, extraUniforms = {}) {
    const positions = new Float32Array(count * 3);
    const aScale = new Float32Array(count);
    const aPhase = new Float32Array(count);
    const aSpeed = new Float32Array(count);
    const aMix = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const v = fill(i);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      aScale[i] = v.scale;
      aPhase[i] = Math.random();
      aSpeed[i] = v.speed;
      aMix[i] = v.mix;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(aScale, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute("aMix", new THREE.BufferAttribute(aMix, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 12);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uSize: { value: size },
        uOpacity: { value: baseOpacity * opacity },
        ...extraUniforms
      },
      vertexShader,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false
    });
    mat.userData.baseOpacity = baseOpacity;
    materials.push(mat);

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    group.add(points);
    return { points, mat, geo };
  }

  const dustHeight = 7.2;
  const dustBase = -2.3;
  makeLayer(Math.round(1100 * scale), DUST_VERTEX, 15, 0.8, () => {
    const r = Math.sqrt(Math.random()) * 6.4 + 1.1;
    const a = Math.random() * Math.PI * 2;
    return {
      x: Math.cos(a) * r,
      y: dustBase + Math.random() * dustHeight,
      z: Math.sin(a) * r,
      scale: rand(0.35, 1.5),
      speed: rand(0.2, 1),
      mix: Math.random() < 0.18 ? 1 : 0
    };
  }, { uHeight: { value: dustHeight }, uBaseY: { value: dustBase } });

  makeLayer(Math.round(620 * scale), HELIX_VERTEX, 20, 1.0, (i) => ({
    x: i % 3,
    y: rand(-0.06, 0.06),
    z: rand(-0.12, 0.12),
    scale: rand(0.5, 1.3),
    speed: rand(0.7, 1.3),
    mix: i % 3 === 1 ? 1 : 0
  }), { uBottom: { value: RING_Y + 0.02 }, uTop: { value: 2.05 } });

  makeLayer(Math.round(300 * scale), SPARK_VERTEX, 17, 1.0, () => ({
    x: Math.random() * Math.PI * 2,
    y: rand(-0.25, 0.55),
    z: rand(0.6, 2.4),
    scale: rand(0.5, 1.4),
    speed: rand(0.6, 1.4),
    mix: Math.random() < 0.35 ? 1 : 0
  }));

  const wave = makeLayer(Math.round(320 * scale), WAVE_VERTEX, 20, 1.0, (i, n = Math.round(320 * scale)) => ({
    x: (i / n) * Math.PI * 2,
    y: rand(-0.3, 0.3),
    z: 0,
    scale: rand(0.6, 1.3),
    speed: 1,
    mix: i % 4 === 0 ? 1 : 0
  }), { uWave: { value: 0 } });

  const nodeCount = lowPower ? 24 : 46;
  const nodeBase = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const r = rand(3.4, 6.4);
    const a = rand(-Math.PI * 0.95, Math.PI * 0.6);
    nodeBase.push({
      x: Math.cos(a) * r,
      y: rand(-1.1, 3.6),
      z: Math.sin(a) * r - 1.2,
      phase: Math.random() * Math.PI * 2,
      amp: rand(0.12, 0.35)
    });
  }
  const nodes = makeLayer(nodeCount, NODE_VERTEX, 18, 1.0, (i) => ({
    x: nodeBase[i].x,
    y: nodeBase[i].y,
    z: nodeBase[i].z,
    scale: rand(0.7, 1.4),
    speed: 1,
    mix: i % 6 === 0 ? 1 : 0
  }));

  const maxLinks = lowPower ? 140 : 420;
  const linkDist = 2.1;
  const linePos = new Float32Array(maxLinks * 6);
  const lineCol = new Float32Array(maxLinks * 8);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 4).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setDrawRange(0, 0);
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  group.add(lines);

  const nodePosAttr = nodes.geo.getAttribute("position");

  function updateNetwork(t) {
    for (let i = 0; i < nodeCount; i += 1) {
      const b = nodeBase[i];
      nodePosAttr.setXYZ(
        i,
        b.x + Math.sin(t * 0.21 + b.phase) * b.amp,
        b.y + Math.cos(t * 0.17 + b.phase * 1.3) * b.amp,
        b.z + Math.sin(t * 0.19 + b.phase * 0.7) * b.amp
      );
    }
    nodePosAttr.needsUpdate = true;

    let links = 0;
    const arr = nodePosAttr.array;
    for (let i = 0; i < nodeCount && links < maxLinks; i += 1) {
      const ix = arr[i * 3];
      const iy = arr[i * 3 + 1];
      const iz = arr[i * 3 + 2];
      for (let j = i + 1; j < nodeCount && links < maxLinks; j += 1) {
        const dx = arr[j * 3] - ix;
        const dy = arr[j * 3 + 1] - iy;
        const dz = arr[j * 3 + 2] - iz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > linkDist) continue;
        const alpha = (1 - dist / linkDist) * lineStrength;
        const o = links * 6;
        linePos[o] = ix;
        linePos[o + 1] = iy;
        linePos[o + 2] = iz;
        linePos[o + 3] = arr[j * 3];
        linePos[o + 4] = arr[j * 3 + 1];
        linePos[o + 5] = arr[j * 3 + 2];
        const c = links * 8;
        const tint = (i + j) % 7 === 0 ? colorB : colorA;
        lineCol[c] = tint.r;
        lineCol[c + 1] = tint.g;
        lineCol[c + 2] = tint.b;
        lineCol[c + 3] = alpha;
        lineCol[c + 4] = tint.r;
        lineCol[c + 5] = tint.g;
        lineCol[c + 6] = tint.b;
        lineCol[c + 7] = alpha;
        links += 1;
      }
    }
    lineGeo.setDrawRange(0, links * 2);
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate = true;
  }

  let waveStart = -10;
  let burstLevel = 0;
  const timeScale = reducedMotion ? 0.3 : 1;

  function setMode(mode) {
    const style = MODE_STYLE[mode] || MODE_STYLE.idle;
    targetA.setHex(style.a);
    targetB.setHex(style.b);
    targetOpacity = style.opacity;
    targetEnergy = style.energy;
    targetLineStrength = style.lines;
  }

  function burst() {
    waveStart = shared.uTime.value;
    burstLevel = 1;
  }

  function update(t, { pointer = null, pointerStrength = 0 } = {}) {
    const time = t * timeScale;
    shared.uTime.value = time;

    colorA.lerp(targetA, 0.04);
    colorB.lerp(targetB, 0.04);
    opacity += (targetOpacity - opacity) * 0.05;
    energy += (targetEnergy - energy) * 0.05;
    lineStrength += (targetLineStrength - lineStrength) * 0.05;
    shared.uEnergy.value = energy;
    materials.forEach((mat) => {
      mat.uniforms.uOpacity.value = mat.userData.baseOpacity * opacity;
    });

    if (pointer) shared.uPointer.value.copy(pointer);
    const strength = reducedMotion ? 0 : pointerStrength;
    shared.uPointerStrength.value += (strength - shared.uPointerStrength.value) * 0.1;

    burstLevel = Math.max(0, burstLevel - 0.02);
    shared.uBurst.value = Math.sin(burstLevel * Math.PI * 0.5) * burstLevel;
    const w = (time - waveStart) / 1.7;
    wave.mat.uniforms.uWave.value = w > 0 && w < 1 ? w : 0;

    updateNetwork(time);
  }

  return { group, update, setMode, burst };
}
