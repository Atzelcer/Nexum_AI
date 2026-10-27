from __future__ import annotations

import math
from typing import Any

LM = {
    "WRIST": 0,
    "THUMB_TIP": 4,
    "INDEX_TIP": 8,
    "INDEX_PIP": 6,
    "MIDDLE_TIP": 12,
    "MIDDLE_PIP": 10,
    "RING_TIP": 16,
    "RING_PIP": 14,
    "PINKY_TIP": 20,
    "PINKY_PIP": 18,
}

FEATURE_SIZE = 134


def _dist(a: dict, b: dict) -> float:
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"], (a.get("z") or 0) - (b.get("z") or 0))


def _finger_extended(lm: list[dict], tip: int, pip: int) -> bool:
    return _dist(lm[tip], lm[LM["WRIST"]]) > _dist(lm[pip], lm[LM["WRIST"]]) * 1.05


def _hand_scalar_features(lm: list[dict]) -> tuple[float, float, float, float, float]:
    pinch = _dist(lm[LM["THUMB_TIP"]], lm[LM["INDEX_TIP"]])
    index_up = _finger_extended(lm, LM["INDEX_TIP"], LM["INDEX_PIP"])
    middle_up = _finger_extended(lm, LM["MIDDLE_TIP"], LM["MIDDLE_PIP"])
    ring_up = _finger_extended(lm, LM["RING_TIP"], LM["RING_PIP"])
    pinky_up = _finger_extended(lm, LM["PINKY_TIP"], LM["PINKY_PIP"])
    extended = sum([index_up, middle_up, ring_up, pinky_up])
    return pinch, float(extended), float(index_up), float(middle_up), float(ring_up and pinky_up)


def _normalize_hand(lm: list[dict] | None) -> list[float]:
    out: list[float] = []
    if not lm or len(lm) < 21:
        return [0.0] * 63
    wrist = lm[LM["WRIST"]]
    scale = max(
        _dist(lm[LM["MIDDLE_TIP"]], wrist),
        _dist(lm[LM["INDEX_TIP"]], wrist),
        1e-4,
    )
    for p in lm[:21]:
        out.extend([(p["x"] - wrist["x"]) / scale, (p["y"] - wrist["y"]) / scale, ((p.get("z") or 0) - (wrist.get("z") or 0)) / scale])
    return out


def extract_features(left: list[dict] | None, right: list[dict] | None) -> list[float]:
    left_norm = _normalize_hand(left)
    right_norm = _normalize_hand(right)

    bimanual = [0.0] * 8
    if left and right and len(left) >= 21 and len(right) >= 21:
        lc = {
            "x": (left[LM["THUMB_TIP"]]["x"] + left[LM["INDEX_TIP"]]["x"]) / 2,
            "y": (left[LM["THUMB_TIP"]]["y"] + left[LM["INDEX_TIP"]]["y"]) / 2,
            "z": ((left[LM["THUMB_TIP"]].get("z") or 0) + (left[LM["INDEX_TIP"]].get("z") or 0)) / 2,
        }
        rc = {
            "x": (right[LM["THUMB_TIP"]]["x"] + right[LM["INDEX_TIP"]]["x"]) / 2,
            "y": (right[LM["THUMB_TIP"]]["y"] + right[LM["INDEX_TIP"]]["y"]) / 2,
            "z": ((right[LM["THUMB_TIP"]].get("z") or 0) + (right[LM["INDEX_TIP"]].get("z") or 0)) / 2,
        }
        bimanual[0] = _dist(lc, rc)
        bimanual[1] = math.atan2(rc["y"] - lc["y"], rc["x"] - lc["x"])
        bimanual[2] = float(_hand_scalar_features(left)[0] < 0.075 and _hand_scalar_features(right)[0] < 0.075)
        bimanual[3] = float(_hand_scalar_features(left)[1] >= 4 and _hand_scalar_features(right)[1] >= 4)

    lf = _hand_scalar_features(left) if left and len(left) >= 21 else (0, 0, 0, 0, 0)
    rf = _hand_scalar_features(right) if right and len(right) >= 21 else (0, 0, 0, 0, 0)
    bimanual[4:8] = [lf[0], rf[0], lf[1], rf[1]]

    vec = left_norm + right_norm + bimanual
    assert len(vec) == FEATURE_SIZE, len(vec)
    return vec


def landmarks_from_row(row: dict[str, Any], prefix: str) -> list[dict] | None:
    pts = []
    for i in range(21):
        x = row.get(f"{prefix}_{i}_x")
        if x is None or (isinstance(x, float) and math.isnan(x)):
            return None
        pts.append({"x": float(x), "y": float(row[f"{prefix}_{i}_y"]), "z": float(row.get(f"{prefix}_{i}_z") or 0)})
    return pts
