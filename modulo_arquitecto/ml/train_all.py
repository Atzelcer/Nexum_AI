from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(script: str) -> None:
    path = ROOT / script
    print(f"\n>>> {path.name}")
    subprocess.run([sys.executable, str(path)], check=True, cwd=str(ROOT))


if __name__ == "__main__":
    run("bootstrap_synthetic.py")
    run("entrenar_vision.py")
    print("\nOK Modelo listo en ../models/vision/")
