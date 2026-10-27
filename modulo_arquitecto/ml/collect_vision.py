from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "vision"
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="NEXUM Arquitecto · Recolección visión")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_stats: dict[str, int] = {}


class Landmark(BaseModel):
    x: float
    y: float
    z: float = 0


class SampleIn(BaseModel):
    gesto: str
    left: list[Landmark] | None = None
    right: list[Landmark] | None = None
    confianza: float = 1.0
    fuente: str = "panel"


def _row_from_sample(s: SampleIn) -> dict:
    row: dict = {"timestamp": datetime.now(timezone.utc).isoformat(), "gesto": s.gesto, "confianza": s.confianza, "fuente": s.fuente}
    for side, hand in (("left", s.left), ("right", s.right)):
        if not hand:
            for i in range(21):
                row[f"{side}_{i}_x"] = float("nan")
                row[f"{side}_{i}_y"] = float("nan")
                row[f"{side}_{i}_z"] = float("nan")
            continue
        for i, p in enumerate(hand[:21]):
            row[f"{side}_{i}_x"] = p.x
            row[f"{side}_{i}_y"] = p.y
            row[f"{side}_{i}_z"] = p.z
        for i in range(len(hand), 21):
            row[f"{side}_{i}_x"] = float("nan")
            row[f"{side}_{i}_y"] = float("nan")
            row[f"{side}_{i}_z"] = float("nan")
    return row


@app.get("/health")
def health():
    return {"ok": True, "stats": _stats, "data_dir": str(DATA_DIR)}


@app.get("/stats")
def stats():
    return {"stats": _stats, "total": sum(_stats.values())}


@app.post("/sample")
def sample(body: SampleIn):
    path = DATA_DIR / f"{body.gesto}.csv"
    row = _row_from_sample(body)
    write_header = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        if write_header:
            w.writeheader()
        w.writerow(row)
    _stats[body.gesto] = _stats.get(body.gesto, 0) + 1
    return {"ok": True, "gesto": body.gesto, "count": _stats[body.gesto]}


@app.post("/batch")
def batch(samples: list[SampleIn]):
    saved = 0
    for s in samples:
        sample(s)
        saved += 1
    return {"ok": True, "saved": saved}


if __name__ == "__main__":
    import uvicorn

    print(f"Recolección visión → {DATA_DIR}")
    uvicorn.run(app, host="127.0.0.1", port=8091, log_level="info")
