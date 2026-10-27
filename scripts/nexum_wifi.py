from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from typing import Callable

GLOVE_AP_SSID = "NEXUM-GUANTE"
GLOVE_AP_IP = "192.168.50.1"
ESP_USB_VIDS = {0x10C4, 0x1A86, 0x0403, 0x303A}
IS_WINDOWS = sys.platform.startswith("win")


def _run(args: list[str], env: dict | None = None) -> str:
    try:
        raw = subprocess.run(args, capture_output=True, timeout=6, env=env).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    return raw.decode("cp850" if IS_WINDOWS else "utf-8", errors="ignore")


def _band_from_text(text: str) -> str | None:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*GHz", text.replace("\xa0", " "))
    if not match:
        return None
    value = match.group(1).replace(",", ".")
    return "2.4" if value.startswith("2") else value.split(".")[0]


def _band_from_mhz(mhz: int) -> str | None:
    if 2400 <= mhz < 2500:
        return "2.4"
    if 4900 <= mhz < 5900:
        return "5"
    if mhz >= 5900:
        return "6"
    return None


_seen: dict[str, tuple[dict, float]] = {}
_last_scan = {"at": 0.0}
SEEN_TTL = 120.0


def _windows_trigger_scan() -> None:
    import ctypes
    from ctypes import wintypes

    class Guid(ctypes.Structure):
        _fields_ = [("d1", wintypes.DWORD), ("d2", wintypes.WORD), ("d3", wintypes.WORD), ("d4", ctypes.c_ubyte * 8)]

    class InterfaceInfo(ctypes.Structure):
        _fields_ = [("guid", Guid), ("desc", ctypes.c_wchar * 256), ("state", wintypes.DWORD)]

    class InterfaceList(ctypes.Structure):
        _fields_ = [("count", wintypes.DWORD), ("index", wintypes.DWORD), ("items", InterfaceInfo * 1)]

    try:
        wlan = ctypes.windll.wlanapi
    except OSError:
        return
    handle = wintypes.HANDLE()
    version = wintypes.DWORD()
    if wlan.WlanOpenHandle(2, None, ctypes.byref(version), ctypes.byref(handle)) != 0:
        return
    try:
        items = ctypes.POINTER(InterfaceList)()
        if wlan.WlanEnumInterfaces(handle, None, ctypes.byref(items)) != 0:
            return
        try:
            count = items.contents.count
            infos = ctypes.cast(ctypes.byref(items.contents.items), ctypes.POINTER(InterfaceInfo * count)).contents
            for info in infos:
                wlan.WlanScan(handle, ctypes.byref(info.guid), None, None, None)
        finally:
            wlan.WlanFreeMemory(items)
    finally:
        wlan.WlanCloseHandle(handle, None)


def _remember(networks: dict) -> dict:
    now = time.time()
    for ssid, net in networks.items():
        old = _seen.get(ssid)
        if old and now - old[1] < SEEN_TTL:
            net = {**net, "bands": net["bands"] | old[0]["bands"], "signal": net["signal"] or old[0]["signal"]}
        _seen[ssid] = (net, now)
    for ssid in [s for s, (_, at) in _seen.items() if now - at >= SEEN_TTL]:
        _seen.pop(ssid, None)
    return {ssid: net for ssid, (net, _) in _seen.items()}


def _windows_scan() -> tuple[dict, dict]:
    if time.time() - _last_scan["at"] > 10:
        first = _last_scan["at"] == 0.0
        _last_scan["at"] = time.time()
        _windows_trigger_scan()
        if first:
            time.sleep(3.0)
    current = {"ssid": None, "band": None}
    for line in _run(["netsh", "wlan", "show", "interfaces"]).splitlines():
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "ssid" and value:
            current["ssid"] = value
        elif key in ("banda", "band") and value:
            current["band"] = _band_from_text(value)
    networks: dict[str, dict] = {}
    ssid = None
    for line in _run(["netsh", "wlan", "show", "networks", "mode=bssid"]).splitlines():
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if re.fullmatch(r"ssid \d+", key):
            ssid = value or None
            if ssid:
                networks.setdefault(ssid, {"ssid": ssid, "bands": set(), "signal": 0})
        elif ssid and key in ("banda", "band"):
            band = _band_from_text(value)
            if band:
                networks[ssid]["bands"].add(band)
        elif ssid and key.startswith(("se", "sig")) and value.endswith("%"):
            digits = re.sub(r"\D", "", value)
            networks[ssid]["signal"] = max(networks[ssid]["signal"], int(digits or 0))
    return current, networks


def _linux_scan() -> tuple[dict, dict]:
    env = {**os.environ, "LC_ALL": "C"}
    current = {"ssid": None, "band": None}
    networks: dict[str, dict] = {}
    out = _run(["nmcli", "-t", "-f", "ACTIVE,SSID,FREQ,SIGNAL", "dev", "wifi", "list"], env)
    for line in out.splitlines():
        parts = [part.replace("\\:", ":") for part in re.split(r"(?<!\\):", line)]
        if len(parts) < 4 or not parts[1]:
            continue
        active, ssid, freq, signal = parts[:4]
        band = _band_from_mhz(int(re.sub(r"\D", "", freq) or 0))
        net = networks.setdefault(ssid, {"ssid": ssid, "bands": set(), "signal": 0})
        if band:
            net["bands"].add(band)
        net["signal"] = max(net["signal"], int(re.sub(r"\D", "", signal) or 0))
        if active == "yes":
            current = {"ssid": ssid, "band": band}
    if not current["ssid"]:
        current["ssid"] = _run(["iwgetid", "-r"]).strip() or None
    return current, networks


def _stem(ssid: str) -> str:
    return re.sub(r"[\s_.\-]*(5\s*g(hz)?|6e?|6\s*g(hz)?)$", "", ssid.strip(), flags=re.I).lower()


def suggest(current: dict, networks: dict) -> str | None:
    usable = [n for n in networks.values() if "2.4" in n["bands"] and n["ssid"] != GLOVE_AP_SSID]
    ssid = current.get("ssid")
    if not ssid or ssid == GLOVE_AP_SSID:
        return None
    if any(n["ssid"] == ssid for n in usable):
        return ssid
    same_router = [n for n in usable if _stem(n["ssid"]) == _stem(ssid)]
    if same_router:
        return max(same_router, key=lambda n: n["signal"])["ssid"]
    if current.get("band") == "2.4":
        return ssid
    sibling = [
        n for n in networks.values()
        if n["ssid"] not in (ssid, GLOVE_AP_SSID) and _stem(n["ssid"]) == _stem(ssid) and _stem(n["ssid"]) == n["ssid"].lower()
    ]
    if sibling:
        return max(sibling, key=lambda n: n["signal"])["ssid"]
    return None


def saved_password(ssid: str) -> str | None:
    ssid = (ssid or "").strip()
    if not ssid or ssid == GLOVE_AP_SSID or any(ch in ssid for ch in '"\r\n'):
        return None
    if IS_WINDOWS:
        out = _run(["netsh", "wlan", "show", "profile", f"name={ssid}", "key=clear"])
        for line in out.splitlines():
            key, _, value = line.partition(":")
            if key.strip().lower() in ("contenido de la clave", "key content", "contenu de la clé"):
                return value.strip() or None
        return None
    env = {**os.environ, "LC_ALL": "C"}
    out = _run(["nmcli", "-s", "-g", "802-11-wireless-security.psk", "connection", "show", ssid], env).strip()
    return out or None


def serial_ports() -> list[str]:
    try:
        from serial.tools import list_ports
    except ImportError:
        return []
    return [port.device for port in list_ports.comports() if port.vid in ESP_USB_VIDS]


def status() -> dict:
    current, networks = _windows_scan() if IS_WINDOWS else _linux_scan()
    networks = _remember(networks)
    if current["ssid"] and current["ssid"] in networks and not current["band"]:
        bands = networks[current["ssid"]]["bands"]
        current["band"] = next(iter(bands)) if len(bands) == 1 else None
    redes = [
        {"ssid": n["ssid"], "bandas": sorted(n["bands"]), "senal": n["signal"]}
        for n in networks.values()
        if n["ssid"] != GLOVE_AP_SSID
    ]
    redes.sort(key=lambda n: -n["senal"])
    return {
        "ssid": current["ssid"],
        "banda": current["band"],
        "sugerida": suggest(current, networks),
        "redes": redes,
        "guante_ap": GLOVE_AP_SSID in networks,
        "usb": serial_ports(),
    }


def configure_over_usb(ssid: str, password: str, notify: Callable[..., None], timeout: float = 45.0) -> bool:
    try:
        import serial
    except ImportError:
        notify("error", message="Falta pyserial en el entorno: pip install -r requirements.txt")
        return False
    ports = serial_ports()
    if not ports:
        notify("error", message="No se detecta el guante por USB.")
        return False
    line = f"WIFI:{ssid.encode('utf-8').hex()}:{password.encode('utf-8').hex()}\n".encode("ascii")
    for port in ports:
        conn = serial.Serial()
        conn.port = port
        conn.baudrate = 115200
        conn.timeout = 0.2
        conn.dtr = False
        conn.rts = False
        try:
            conn.open()
        except (serial.SerialException, OSError) as exc:
            notify("error", message=f"No se pudo abrir {port}: {exc}. Cierra el monitor serie de Arduino si esta abierto.")
            continue
        notify("sent", ssid=ssid, via="usb", port=port)
        print(f"[WIFI] red enviada por USB ({port}): {ssid}", flush=True)
        saved = False
        buffer = ""
        last_write = 0.0
        deadline = time.time() + timeout
        try:
            while time.time() < deadline:
                if not saved and time.time() - last_write > 1.5:
                    conn.write(line)
                    last_write = time.time()
                buffer += conn.read(256).decode("utf-8", errors="ignore")
                *lines, buffer = buffer.split("\n")
                for raw in lines:
                    text = raw.replace("\x00", "").strip()
                    if "WIFI_INVALIDA," in text:
                        reason = text.split("WIFI_INVALIDA,", 1)[1]
                        notify("error", message=f"El guante rechazo los datos ({reason}).")
                        return False
                    if not saved and "WIFI_GUARDADA," in text:
                        saved = True
                        notify("saved", ssid=ssid, via="usb")
                        print(f"[WIFI] guante guardo la red: {ssid}", flush=True)
                    elif saved and "WIFI_ERROR," in text:
                        notify("error", message=(
                            f"El guante no pudo conectarse a \"{ssid}\". Revisa la contrasena y que la red sea de 2.4 GHz. "
                            f"Volvio a su red de configuracion {GLOVE_AP_SSID}."
                        ))
                        return False
                    elif saved and "WIFI_OK," in text:
                        ip = text.split("WIFI_OK,", 1)[1].strip()
                        if ip and ip != GLOVE_AP_IP:
                            notify("connected", ssid=ssid, ip=ip, via="usb")
                            print(f"[WIFI] guante conectado a {ssid}: {ip}", flush=True)
                            return True
        except (serial.SerialException, OSError) as exc:
            notify("error", message=f"Se perdio la conexion USB con el guante: {exc}")
            return False
        finally:
            conn.close()
        notify("error", message=(
            "El guante guardo la red pero no confirmo la conexion a tiempo." if saved
            else "El guante no respondio por USB. Verifica el cable."
        ))
        return False
    return False
