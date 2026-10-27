from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / "panel" / "ejs"
CDN = "https://cdn.emulatorjs.org/stable/data"
JSZIP = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
UA = "Mozilla/5.0 NEXUM-AI/1.0"

FILES = [
    "loader.js",
    "emulator.min.js",
    "emulator.min.css",
    "emulator.css",
    "version.json",
    "src/emulator.js",
    "src/nipplejs.js",
    "src/shaders.js",
    "src/storage.js",
    "src/gamepad.js",
    "src/GameManager.js",
    "src/socket.io.min.js",
    "src/compression.js",
    "compression/extract7z.js",
    "compression/extractzip.js",
    "compression/libunrar.js",
    "compression/libunrar.wasm",
    "localization/en-US.json",
    "localization/es-ES.json",
    "localization/retroarch.json",
    "cores/mame2003_plus-wasm.data",
    "cores/mame2003_plus-legacy-wasm.data",
]


def fetch(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print("skip", dest.relative_to(ROOT))
        return
    print("get ", dest.relative_to(ROOT))
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req) as src, dest.open("wb") as out:
        while True:
            chunk = src.read(1024 * 256)
            if not chunk:
                break
            out.write(chunk)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    for rel in FILES:
        fetch(f"{CDN}/{rel}", ROOT / rel)
    fetch(JSZIP, ROOT / "jszip.min.js")
    print("ok", ROOT)
