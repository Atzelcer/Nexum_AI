from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "gameNeogeo" / "NeoRAGEx 5.2a" / "ROMs"
OUT = ROOT / "panel" / "web-roms"

GAMES = [
    "mslug.zip",
    "mslug2.zip",
    "mslugx.zip",
    "kof97.zip",
    "kof98.zip",
    "lastblad.zip",
    "samsho.zip",
    "pulstar.zip",
    "shocktro.zip",
]

BIOS_MAP = {
    "neo-geo.rom": "sp-s2.sp1",
    "uni-bios.rom": "uni-bios_2_3.rom",
    "ng-sfix.rom": "sfix.sfx",
    "ng-sm1.rom": "sm1.sm1",
    "ng-lo.rom": "000-lo.lo",
}


def convert_bios():
    src = zipfile.ZipFile(SRC / "neogeo.zip")
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    with zipfile.ZipFile(OUT / "neogeo.zip", "w", zipfile.ZIP_STORED) as dst:
        for info in src.infolist():
            data = src.read(info.filename)
            name = BIOS_MAP.get(info.filename.split("/")[-1].lower(), info.filename.split("/")[-1])
            dst.writestr(name, data)
            files[name] = data
        if "sm1.sm1" in files:
            dst.writestr("mame.sm1", files["sm1.sm1"])
        if "000-lo.lo" in files:
            dst.writestr("mamelo.lo", files["000-lo.lo"][:65536])
        if "sfix.sfx" in files:
            dst.writestr("sfix.sfix", files["sfix.sfx"])
        if "uni-bios_2_3.rom" in files:
            dst.writestr("uni-bios.rom", files["uni-bios_2_3.rom"])
    print("bios", OUT / "neogeo.zip")


def bios_files():
    files = {}
    with zipfile.ZipFile(OUT / "neogeo.zip") as bios:
        for info in bios.infolist():
            files[info.filename] = bios.read(info.filename)
    return files


def convert_game(name, bios):
    src_path = SRC / name
    if not src_path.exists():
        print("missing", name)
        return
    with zipfile.ZipFile(src_path) as src, zipfile.ZipFile(OUT / name, "w", zipfile.ZIP_STORED) as dst:
        seen = set()
        for info in src.infolist():
            data = src.read(info.filename)
            base = info.filename.split("/")[-1]
            if base.lower().endswith(".rom"):
                base = f"{base[:-4]}.bin"
            dst.writestr(base, data)
            seen.add(base)
        for fname, data in bios.items():
            if fname not in seen:
                dst.writestr(fname, data)
    print("game", name)


if __name__ == "__main__":
    convert_bios()
    bios = bios_files()
    for game in GAMES:
        convert_game(game, bios)
