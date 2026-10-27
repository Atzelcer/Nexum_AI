
export const FEATURE_SIZE = 134;

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

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function fingerExtended(lm, tip, pip) {
  return dist(lm[tip], lm[LM.WRIST]) > dist(lm[pip], lm[LM.WRIST]) * 1.05;
}

function handScalarFeatures(lm) {
  const pinch = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]);
  const indexUp = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const middleUp = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const ringUp = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP);
  const pinkyUp = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  const extended = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  return [pinch, extended, indexUp ? 1 : 0, middleUp ? 1 : 0, ringUp && pinkyUp ? 1 : 0];
}

function normalizeHand(lm) {
  if (!lm || lm.length < 21) return new Array(63).fill(0);
  const wrist = lm[LM.WRIST];
  const scale = Math.max(
    dist(lm[LM.MIDDLE_TIP], wrist),
    dist(lm[LM.INDEX_TIP], wrist),
    1e-4
  );
  const out = [];
  for (let i = 0; i < 21; i += 1) {
    const p = lm[i];
    out.push((p.x - wrist.x) / scale, (p.y - wrist.y) / scale, ((p.z || 0) - (wrist.z || 0)) / scale);
  }
  return out;
}

export function extractFeatures(leftLm, rightLm) {
  const leftNorm = normalizeHand(leftLm);
  const rightNorm = normalizeHand(rightLm);
  const bimanual = new Array(8).fill(0);

  if (leftLm?.length >= 21 && rightLm?.length >= 21) {
    const lc = {
      x: (leftLm[LM.THUMB_TIP].x + leftLm[LM.INDEX_TIP].x) / 2,
      y: (leftLm[LM.THUMB_TIP].y + leftLm[LM.INDEX_TIP].y) / 2,
      z: ((leftLm[LM.THUMB_TIP].z || 0) + (leftLm[LM.INDEX_TIP].z || 0)) / 2
    };
    const rc = {
      x: (rightLm[LM.THUMB_TIP].x + rightLm[LM.INDEX_TIP].x) / 2,
      y: (rightLm[LM.THUMB_TIP].y + rightLm[LM.INDEX_TIP].y) / 2,
      z: ((rightLm[LM.THUMB_TIP].z || 0) + (rightLm[LM.INDEX_TIP].z || 0)) / 2
    };
    bimanual[0] = dist(lc, rc);
    bimanual[1] = Math.atan2(rc.y - lc.y, rc.x - lc.x);
    const lf = handScalarFeatures(leftLm);
    const rf = handScalarFeatures(rightLm);
    bimanual[2] = lf[0] < 0.075 && rf[0] < 0.075 ? 1 : 0;
    bimanual[3] = lf[1] >= 4 && rf[1] >= 4 ? 1 : 0;
    bimanual[4] = lf[0];
    bimanual[5] = rf[0];
    bimanual[6] = lf[1];
    bimanual[7] = rf[1];
  } else if (leftLm?.length >= 21) {
    const lf = handScalarFeatures(leftLm);
    bimanual[4] = lf[0];
    bimanual[6] = lf[1];
  } else if (rightLm?.length >= 21) {
    const rf = handScalarFeatures(rightLm);
    bimanual[5] = rf[0];
    bimanual[7] = rf[1];
  }

  return leftNorm.concat(rightNorm, bimanual);
}

export function landmarksFromHands(left, right) {
  return {
    left: left?.landmarks || null,
    right: right?.landmarks || null
  };
}
