from __future__ import annotations

import csv
import math
import random
from pathlib import Path

from gesture_labels import CLASES, GESTURE_LABELS, POS_X

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "vision"
SAMPLES_PER_CLASS = 10_000

W, T, I, M, R, P = 0, 4, 8, 12, 16, 20
I_PIP, M_PIP, R_PIP, P_PIP = 6, 10, 14, 18


def _j(x: float, y: float, z: float = 0.0) -> dict:
    return {"x": x, "y": y, "z": z + random.uniform(-0.008, 0.008)}


def _blank_hand(cx: float, cy: float, scale: float = 0.09) -> list[dict]:
    s = scale * random.uniform(0.88, 1.12)
    cx += random.uniform(-0.02, 0.02)
    cy += random.uniform(-0.02, 0.02)
    lm = [_j(0, 0) for _ in range(21)]

    lm[W] = _j(cx, cy)
    lm[1] = _j(cx + 0.02 * s, cy + 0.01 * s)
    lm[2] = _j(cx + 0.04 * s, cy + 0.005 * s)
    lm[3] = _j(cx + 0.055 * s, cy - 0.005 * s)
    lm[T] = _j(cx + 0.07 * s, cy - 0.01 * s)
    lm[5] = _j(cx - 0.01 * s, cy - 0.02 * s)
    lm[6] = _j(cx - 0.015 * s, cy - 0.05 * s)
    lm[7] = _j(cx - 0.018 * s, cy - 0.08 * s)
    lm[I] = _j(cx - 0.02 * s, cy - 0.12 * s)
    lm[9] = _j(cx + 0.005 * s, cy - 0.025 * s)
    lm[10] = _j(cx + 0.005 * s, cy - 0.055 * s)
    lm[11] = _j(cx + 0.005 * s, cy - 0.085 * s)
    lm[M] = _j(cx + 0.005 * s, cy - 0.13 * s)
    lm[13] = _j(cx + 0.025 * s, cy - 0.02 * s)
    lm[14] = _j(cx + 0.028 * s, cy - 0.05 * s)
    lm[15] = _j(cx + 0.03 * s, cy - 0.08 * s)
    lm[R] = _j(cx + 0.032 * s, cy - 0.11 * s)
    lm[17] = _j(cx + 0.045 * s, cy - 0.015 * s)
    lm[18] = _j(cx + 0.048 * s, cy - 0.04 * s)
    lm[19] = _j(cx + 0.05 * s, cy - 0.065 * s)
    lm[P] = _j(cx + 0.052 * s, cy - 0.09 * s)
    return lm


def _fold_finger(lm: list[dict], tip: int, pip: int, mcp: int, cx: float, cy: float, s: float) -> None:
    lm[pip] = _j(cx + random.uniform(-0.01, 0.02) * s, cy + random.uniform(0.01, 0.03) * s)
    lm[tip] = _j(lm[pip]["x"] + random.uniform(-0.005, 0.005), lm[pip]["y"] + random.uniform(0.015, 0.03) * s)


def _extend_finger(lm: list[dict], tip: int, pip: int, mcp: int, cx: float, cy: float, s: float, extra: float = 0.0) -> None:
    lm[mcp] = _j(cx + random.uniform(-0.02, 0.03) * s, cy - 0.02 * s)
    lm[pip] = _j(lm[mcp]["x"] + random.uniform(-0.005, 0.005), lm[mcp]["y"] - 0.03 * s)
    lm[tip] = _j(lm[pip]["x"] + random.uniform(-0.008, 0.008), lm[pip]["y"] - (0.05 + extra) * s)


def _pinch(lm: list[dict], cx: float, cy: float, s: float) -> None:
    for tip, pip, mcp in ((I, I_PIP, 5), (M, M_PIP, 9), (R, R_PIP, 13), (P, P_PIP, 17)):
        _fold_finger(lm, tip, pip, mcp, cx, cy, s)
    pinch_x = cx + random.uniform(0.0, 0.015) * s
    pinch_y = cy - random.uniform(0.02, 0.05) * s
    gap = random.uniform(0.028, 0.055) * s
    lm[T] = _j(pinch_x - gap / 2, pinch_y)
    lm[3] = _j(pinch_x - gap / 3, pinch_y + 0.008 * s)
    lm[I] = _j(pinch_x + gap / 2, pinch_y - 0.005 * s)
    lm[7] = _j(pinch_x + gap / 4, pinch_y + 0.012 * s)
    lm[6] = _j(pinch_x, pinch_y + 0.025 * s)


def _open_palm(lm: list[dict], cx: float, cy: float, s: float) -> None:
    _extend_finger(lm, I, I_PIP, 5, cx - 0.02 * s, cy, s)
    _extend_finger(lm, M, M_PIP, 9, cx, cy, s, 0.01)
    _extend_finger(lm, R, R_PIP, 13, cx + 0.02 * s, cy, s)
    _extend_finger(lm, P, P_PIP, 17, cx + 0.04 * s, cy, s, -0.01)
    lm[T] = _j(cx + 0.06 * s, cy + 0.02 * s)


def _point_index(lm: list[dict], cx: float, cy: float, s: float) -> None:
    _extend_finger(lm, I, I_PIP, 5, cx - 0.015 * s, cy, s, 0.02)
    for tip, pip, mcp in ((M, M_PIP, 9), (R, R_PIP, 13), (P, P_PIP, 17)):
        _fold_finger(lm, tip, pip, mcp, cx, cy, s)
    lm[T] = _j(cx + 0.04 * s, cy + 0.015 * s)


def _peace(lm: list[dict], cx: float, cy: float, s: float) -> None:
    _extend_finger(lm, I, I_PIP, 5, cx - 0.015 * s, cy, s, 0.015)
    _extend_finger(lm, M, M_PIP, 9, cx + 0.005 * s, cy, s, 0.015)
    for tip, pip, mcp in ((R, R_PIP, 13), (P, P_PIP, 17)):
        _fold_finger(lm, tip, pip, mcp, cx, cy, s)
    lm[T] = _j(cx + 0.05 * s, cy + 0.02 * s)


def _fist(lm: list[dict], cx: float, cy: float, s: float) -> None:
    for tip, pip, mcp in ((I, I_PIP, 5), (M, M_PIP, 9), (R, R_PIP, 13), (P, P_PIP, 17)):
        _fold_finger(lm, tip, pip, mcp, cx, cy, s)
    lm[T] = _j(cx + 0.035 * s, cy + 0.025 * s)
    lm[2] = _j(cx + 0.025 * s, cy + 0.02 * s)


def _palm_facing(lm: list[dict], cx: float, cy: float, s: float, facing: str) -> None:
    _open_palm(lm, cx, cy, s)
    if facing == "up":
        for i in range(21):
            lm[i]["y"] -= random.uniform(0.04, 0.07) * s
    elif facing == "down":
        for i in range(21):
            lm[i]["y"] += random.uniform(0.04, 0.07) * s
    elif facing == "neutral":
        shift_x = random.uniform(-0.08, 0.08)
        for i in range(21):
            lm[i]["x"] += shift_x


def _hand_for(side: str, pattern: str, pos_x: float | None = None) -> list[dict]:
    if side == "left":
        cx = (pos_x if pos_x is not None else random.uniform(0.12, 0.45)) + random.uniform(-0.03, 0.03)
    else:
        cx = random.uniform(0.55, 0.88) + random.uniform(-0.03, 0.03)
    cy = random.uniform(0.35, 0.65)
    s = random.uniform(0.07, 0.11)
    lm = _blank_hand(cx, cy, s)

    if pattern == "pinch":
        _pinch(lm, cx, cy, s)
    elif pattern == "open":
        _open_palm(lm, cx, cy, s)
    elif pattern == "point":
        _point_index(lm, cx, cy, s)
    elif pattern == "peace":
        _peace(lm, cx, cy, s)
    elif pattern == "fist":
        _fist(lm, cx, cy, s)
    elif pattern == "palm_slide":
        _palm_facing(lm, cx, cy, s, "neutral")
    elif pattern == "palm_up":
        _palm_facing(lm, cx, cy, s, "up")
    elif pattern == "palm_down":
        _palm_facing(lm, cx, cy, s, "down")
    elif pattern == "point_pos":
        px = pos_x if pos_x is not None else cx
        lm = _blank_hand(px, cy, s)
        _point_index(lm, px, cy, s)
    return lm


def scene_for(gesto: str) -> tuple[list[dict] | None, list[dict] | None]:
    if gesto == "pinza_izq":
        return _hand_for("left", "pinch"), None
    if gesto == "mano_abierta_izq":
        return _hand_for("left", "open"), None
    if gesto == "indice_der":
        return None, _hand_for("right", "point")
    if gesto == "palma_slide_der":
        return None, _hand_for("right", "palm_slide")
    if gesto == "palma_elev_der":
        facing = random.choice(["palm_up", "palm_down"])
        return None, _hand_for("right", facing)
    if gesto == "pinza_der":
        return None, _hand_for("right", "pinch")
    if gesto == "paz_der":
        return None, _hand_for("right", "peace")
    if gesto == "dos_pinzas":
        return _hand_for("left", "pinch"), _hand_for("right", "pinch")
    if gesto == "dos_palmas":
        return _hand_for("left", "open"), _hand_for("right", "open")
    if gesto == "punio_der":
        return None, _hand_for("right", "fist")
    if gesto == "punio_izq":
        return _hand_for("left", "fist"), None
    if gesto in POS_X:
        return _hand_for("left", "point_pos", POS_X[gesto] + random.uniform(-0.05, 0.05)), None
    raise ValueError(f"Gesto desconocido: {gesto}")


def _fieldnames() -> list[str]:
    cols = ["timestamp", "gesto", "confianza", "fuente"]
    for side in ("left", "right"):
        for i in range(21):
            cols.extend([f"{side}_{i}_x", f"{side}_{i}_y", f"{side}_{i}_z"])
    return cols


def row_dict(gesto: str, left, right) -> dict:
    r: dict = {
        "timestamp": "",
        "gesto": gesto,
        "confianza": round(random.uniform(0.92, 1.0), 4),
        "fuente": "synthetic_gestos_v2",
    }
    for side, hand in (("left", left), ("right", right)):
        if not hand:
            for i in range(21):
                r[f"{side}_{i}_x"] = float("nan")
                r[f"{side}_{i}_y"] = float("nan")
                r[f"{side}_{i}_z"] = float("nan")
            continue
        for i, p in enumerate(hand):
            r[f"{side}_{i}_x"] = round(p["x"], 6)
            r[f"{side}_{i}_y"] = round(p["y"], 6)
            r[f"{side}_{i}_z"] = round(p["z"], 6)
    return r


def write_csv(path: Path, gesto: str, n: int) -> None:
    fields = _fieldnames()
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        batch: list[dict] = []
        for i in range(n):
            left, right = scene_for(gesto)
            batch.append(row_dict(gesto, left, right))
            if len(batch) >= 500:
                w.writerows(batch)
                batch.clear()
        if batch:
            w.writerows(batch)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    allowed = set(CLASES)

    for old in OUT.glob("*.csv"):
        if old.stem not in allowed:
            old.unlink()
            print(f"  eliminado: {old.name}")

    print(f"Generando {SAMPLES_PER_CLASS:,} muestras x {len(CLASES)} gestos -> {OUT}\n")
    for gesto in CLASES:
        path = OUT / f"{gesto}.csv"
        write_csv(path, gesto, SAMPLES_PER_CLASS)
        size_mb = path.stat().st_size / (1024 * 1024)
        label = GESTURE_LABELS.get(gesto, gesto)
        print(f"  OK {gesto}.csv - {SAMPLES_PER_CLASS:,} filas ({size_mb:.1f} MB) - {label}")

    total = SAMPLES_PER_CLASS * len(CLASES)
    print(f"\nOK {total:,} muestras sinteticas en {OUT}")
    print("  Siguiente: python entrenar_vision.py")


if __name__ == "__main__":
    main()
