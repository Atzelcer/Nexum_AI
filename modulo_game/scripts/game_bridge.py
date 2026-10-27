import base64
import json
import struct
import subprocess
import threading
import time
from pathlib import Path

try:
    from pynput.keyboard import Controller, Key, KeyCode
except Exception:
    Controller = None
    Key = None
    KeyCode = None

DEDOS_ORDEN = ["pulgar", "indice", "medio", "anular", "menique"]

FINGER_BUTTON = {
    "medio": "btn_A",
    "indice": "btn_C",
    "pulgar": "btn_B",
    "menique": "abajo",
}

MENIQUE_CROUCH_ON = 7.0
MENIQUE_CROUCH_OFF = 3.5
START_COOLDOWN = 0.35
TAP_DURATION = 0.09

HOLD_GESTURES = {"arriba", "abajo", "izquierda", "derecha"}
FACE_GESTURES = {"btn_A", "btn_B", "btn_C", "btn_D", "start", "coin"}

GESTURE_FINGERS = {
    "btn_A": ["medio"],
    "btn_B": ["pulgar"],
    "btn_C": ["indice"],
    "btn_D": [],
    "start": ["camara"],
    "arriba": [],
    "abajo": ["menique"],
    "izquierda": ["camara"],
    "derecha": ["camara"],
}

DEMO_SEQUENCE = [
    ("reposo", 0.5),
    ("btn_A", 0.5),
    ("btn_B", 0.5),
    ("btn_C", 0.5),
    ("start", 0.5),
    ("derecha", 0.7),
    ("izquierda", 0.7),
    ("arriba", 0.7),
    ("abajo", 0.7),
    ("reposo", 0.4),
]

EMU_DIR = Path(__file__).resolve().parents[1] / "gameNeogeo" / "NeoRAGEx 5.2a"
EMU_EXE = EMU_DIR / "NeoRAGEx 5.2a.exe"

CAPTURE_FPS = 4
CAPTURE_MAX_WIDTH = 480
CAPTURE_JPEG_QUALITY = 45

send_udp = None

try:
    import ctypes
    from ctypes import wintypes
    import numpy as np
    import cv2
    _CAPTURE_OK = True
except Exception as exc:
    ctypes = None
    wintypes = None
    np = None
    cv2 = None
    _CAPTURE_OK = False
    print(f"[CAP] captura deshabilitada: {exc}", flush=True)


def _win_apis():
    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32
    try:
        user32.SetProcessDPIAware()
    except Exception:
        pass
    return user32, gdi32


def find_emu_hwnd(pid=None):
    if not _CAPTURE_OK:
        return None
    user32, _gdi32 = _win_apis()
    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    found = []
    needles = ("neoragex", "neo rage", "neogeo", "neo-geo")

    def callback(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        if user32.GetWindow(hwnd, 4):
            return True
        proc_id = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
        length = user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
        title_l = title.lower()
        pid_ok = pid is None or proc_id.value == pid
        name_ok = any(n in title_l for n in needles)
        if pid_ok and (name_ok or (pid is not None and length > 0)):
            found.append((hwnd, length, name_ok))
        return True

    user32.EnumWindows(EnumWindowsProc(callback), 0)
    if not found:
        return None
    found.sort(key=lambda item: (not item[2], -item[1]))
    return found[0][0]


def capture_hwnd_jpeg(hwnd):
    if not _CAPTURE_OK or not hwnd:
        return None
    user32, gdi32 = _win_apis()
    if user32.IsIconic(hwnd):
        return None

    window_rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(window_rect)):
        return None
    win_w = int(window_rect.right - window_rect.left)
    win_h = int(window_rect.bottom - window_rect.top)
    if win_w < 32 or win_h < 32:
        return None

    image = _grab_dc_image(user32, gdi32, hwnd, win_w, win_h, print_window=True)
    if image is None or float(np.mean(image)) < 2.0:
        image = _grab_dc_image(
            user32,
            gdi32,
            0,
            win_w,
            win_h,
            print_window=False,
            src_x=int(window_rect.left),
            src_y=int(window_rect.top),
        )
    if image is None or float(np.mean(image)) < 2.0:
        return None
    if image.shape[1] > CAPTURE_MAX_WIDTH:
        scale = CAPTURE_MAX_WIDTH / float(image.shape[1])
        image = cv2.resize(image, (CAPTURE_MAX_WIDTH, max(1, int(image.shape[0] * scale))))
    ok, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), CAPTURE_JPEG_QUALITY])
    if not ok:
        return None
    return encoded.tobytes()


def _grab_dc_image(user32, gdi32, hwnd, width, height, print_window, src_x=0, src_y=0):
    hwnd_dc = user32.GetDC(hwnd)
    if not hwnd_dc:
        return None
    mem_dc = gdi32.CreateCompatibleDC(hwnd_dc)
    bmp = gdi32.CreateCompatibleBitmap(hwnd_dc, width, height)
    prev = gdi32.SelectObject(mem_dc, bmp)
    ok = False
    if print_window and hwnd:
        ok = bool(user32.PrintWindow(hwnd, mem_dc, 2))
        if not ok:
            ok = bool(user32.PrintWindow(hwnd, mem_dc, 0))
    if not ok:
        ok = bool(gdi32.BitBlt(mem_dc, 0, 0, width, height, hwnd_dc, src_x, src_y, 0x00CC0020))

    image = None
    if ok:
        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", wintypes.DWORD),
                ("biWidth", ctypes.c_long),
                ("biHeight", ctypes.c_long),
                ("biPlanes", wintypes.WORD),
                ("biBitCount", wintypes.WORD),
                ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD),
                ("biXPelsPerMeter", ctypes.c_long),
                ("biYPelsPerMeter", ctypes.c_long),
                ("biClrUsed", wintypes.DWORD),
                ("biClrImportant", wintypes.DWORD),
            ]

        class BITMAPINFO(ctypes.Structure):
            _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wintypes.DWORD * 3)]

        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = width
        bmi.bmiHeader.biHeight = -height
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = 0
        buf = (ctypes.c_ubyte * (width * height * 4))()
        copied = gdi32.GetDIBits(mem_dc, bmp, 0, height, buf, ctypes.byref(bmi), 0)
        if copied:
            arr = np.frombuffer(buf, dtype=np.uint8).reshape((height, width, 4))
            image = cv2.cvtColor(arr, cv2.COLOR_BGRA2BGR)

    gdi32.SelectObject(mem_dc, prev)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem_dc)
    user32.ReleaseDC(hwnd, hwnd_dc)
    return image


def capture_loop():
    last_hwnd = None
    last_warn = 0.0
    while True:
        try:
            with hub.lock:
                has_clients = bool(hub.clients)
            if not has_clients or not state.emu_running():
                time.sleep(0.5)
                continue
            pid = state.emu_proc.pid if state.emu_running() else None
            hwnd = find_emu_hwnd(pid) if pid else find_emu_hwnd()
            if not hwnd:
                if last_hwnd and not state.emu_running():
                    state.publish({"type": "frame", "data": None})
                    last_hwnd = None
                time.sleep(0.35)
                continue
            last_hwnd = hwnd
            jpeg = capture_hwnd_jpeg(hwnd)
            if jpeg:
                state.publish({"type": "frame", "data": base64.b64encode(jpeg).decode("ascii")})
            time.sleep(1.0 / CAPTURE_FPS)
        except Exception as exc:
            now = time.time()
            if now - last_warn > 6:
                last_warn = now
                print(f"[CAP] {exc}", flush=True)
            time.sleep(0.5)


def resolve_key(token):
    if Key is None:
        return token
    special = {
        "up": Key.up,
        "down": Key.down,
        "left": Key.left,
        "right": Key.right,
    }
    if token in special:
        return special[token]
    if KeyCode is not None:
        return KeyCode.from_char(token)
    return token


KEY_MAP = {
    "btn_A": ("a", resolve_key("a")),
    "btn_B": ("s", resolve_key("s")),
    "btn_C": ("d", resolve_key("d")),
    "btn_D": ("f", resolve_key("f")),
    "start": ("1", resolve_key("1")),
    "coin": ("5", resolve_key("5")),
    "arriba": ("up", resolve_key("up")),
    "abajo": ("down", resolve_key("down")),
    "izquierda": ("left", resolve_key("left")),
    "derecha": ("right", resolve_key("right")),
    "reposo": ("", None),
}


class WebSocketHub:
    def __init__(self):
        self.clients = set()
        self.lock = threading.Lock()

    def add(self, conn):
        with self.lock:
            self.clients.add(conn)

    def remove(self, conn):
        with self.lock:
            self.clients.discard(conn)

    def broadcast(self, payload):
        data = json.dumps(payload, ensure_ascii=False)
        dead = []
        with self.lock:
            clients = list(self.clients)
        for conn in clients:
            try:
                ws_send(conn, data)
            except OSError:
                dead.append(conn)
        for conn in dead:
            self.remove(conn)


class GameState:
    def __init__(self, hub):
        self.hub = hub
        self.lock = threading.Lock()
        self.enabled = False
        self.curr_states = {d: "reposo" for d in DEDOS_ORDEN}
        self.esp32_ip = None
        self.keyboard = Controller() if Controller else None
        self.emu_proc = None
        self.held = set()
        self.pressed_keys = {}
        self.dir_y = 0
        self.vision_dir_x = 0
        self.vision_shoot = False
        self.vision_jump = False
        self.vision_crouch = False
        self.last_start_at = 0.0
        self.demo_running = False
        self.inject = True

    def publish(self, payload):
        self.hub.broadcast(payload)

    def set_enabled(self, enabled):
        with self.lock:
            self.enabled = enabled
            if not enabled:
                self._clear_all_holds()
                self.dir_y = 0
                self.vision_dir_x = 0
                self.vision_shoot = False
                self.vision_jump = False
                self.vision_crouch = False
        self.publish({"type": "enabled", "enabled": enabled})
        if not enabled:
            self.publish_held()

    def emu_running(self):
        proc = self.emu_proc
        if proc is None:
            return False
        if proc.poll() is not None:
            self.emu_proc = None
            return False
        return True

    def publish_emu(self, message=None):
        payload = {"type": "emu", "running": self.emu_running()}
        if message:
            payload["message"] = message
        self.publish(payload)

    def key_labels(self, gesture):
        label = KEY_MAP.get(gesture, ("", None))[0]
        return [label] if label else []

    def publish_gesture(self, name):
        self.publish({
            "type": "gesture",
            "name": name,
            "keys": self.key_labels(name),
            "fingers": GESTURE_FINGERS.get(name, []),
        })

    def publish_held(self):
        buttons = sorted(n for n in self.held if n in FACE_GESTURES)
        dirs = sorted(n for n in self.held if n in HOLD_GESTURES)
        keys = []
        for name in buttons + dirs:
            keys.extend(self.key_labels(name))
        primary = dirs[0] if dirs else (buttons[0] if buttons else "reposo")
        fingers = [d for d, st in self.curr_states.items() if st == "activo"]
        self.publish({
            "type": "held",
            "buttons": buttons,
            "dirs": dirs,
            "keys": keys,
            "fingers": fingers,
            "name": primary,
        })
        self.publish_gesture(primary)

    def _safe_press(self, key):
        if not self.keyboard or key is None:
            return
        try:
            self.keyboard.press(key)
        except Exception:
            pass

    def _safe_release(self, key):
        if not self.keyboard or key is None:
            return
        try:
            self.keyboard.release(key)
        except Exception:
            pass

    def can_inject(self):
        return self.inject and self.emu_running() and self.keyboard is not None

    def _clear_all_holds(self):
        for key in list(self.pressed_keys.values()):
            self._safe_release(key)
        self.pressed_keys.clear()
        self.held.clear()

    def release_hold(self):
        self._clear_all_holds()

    def _press_named(self, name):
        if name in self.held:
            return
        self.held.add(name)
        if not self.can_inject():
            return
        key = KEY_MAP.get(name, ("", None))[1]
        if key is None:
            return
        self._safe_press(key)
        self.pressed_keys[name] = key

    def _release_named(self, name):
        if name not in self.held:
            return
        self.held.discard(name)
        key = self.pressed_keys.pop(name, None)
        if key is not None:
            self._safe_release(key)

    def _do_start_tap(self):
        coin = KEY_MAP.get("coin", ("", None))[1]
        start = KEY_MAP.get("start", ("", None))[1]
        if coin is not None:
            self._safe_press(coin)
            time.sleep(TAP_DURATION)
            self._safe_release(coin)
            time.sleep(0.05)
        if start is not None:
            self._safe_press(start)
            time.sleep(max(TAP_DURATION, 0.12))
            self._safe_release(start)

    def _fire_start(self):
        now = time.time()
        if now - self.last_start_at < START_COOLDOWN:
            return
        self.last_start_at = now
        self.publish({"type": "pulse", "name": "start"})
        if self.can_inject():
            threading.Thread(target=self._do_start_tap, daemon=True).start()

    def desired_from_fingers(self):
        desired = set()
        for finger, status in self.curr_states.items():
            if status != "activo":
                continue
            btn = FINGER_BUTTON.get(finger)
            if btn:
                desired.add(btn)
        if self.vision_dir_x > 0:
            desired.add("derecha")
        elif self.vision_dir_x < 0:
            desired.add("izquierda")
        if self.dir_y > 0 or self.vision_crouch:
            desired.add("abajo")
        if self.vision_shoot:
            desired.add("btn_A")
        if self.vision_jump:
            desired.add("btn_B")
        return desired

    def handle_vision(self, dir_x=0, fist_pulse=False, shoot=False, jump=False, crouch=False):
        try:
            dx = int(dir_x)
        except Exception:
            dx = 0
        self.vision_dir_x = max(-1, min(1, dx))
        self.vision_shoot = bool(shoot)
        self.vision_jump = bool(jump)
        self.vision_crouch = bool(crouch)
        if fist_pulse:
            self._fire_start()
        self.sync_holds(self.desired_from_fingers())

    def sync_holds(self, desired):
        if desired == self.held:
            return
        for name in list(self.held - desired):
            self._release_named(name)
        for name in list(desired - self.held):
            self._press_named(name)
        self.publish_held()

    def apply_gesture(self, name):
        if name == "reposo":
            self.dir_y = 0
            self.vision_dir_x = 0
            for d in DEDOS_ORDEN:
                self.curr_states[d] = "reposo"
            self.sync_holds(set())
            return
        if name in HOLD_GESTURES:
            self.vision_dir_x = 1 if name == "derecha" else (-1 if name == "izquierda" else 0)
            self.dir_y = 1 if name == "abajo" else 0
            for d in DEDOS_ORDEN:
                self.curr_states[d] = "reposo"
            self.sync_holds(self.desired_from_fingers())
            return
        if name == "start":
            self._fire_start()
            return
        self.vision_dir_x = 0
        self.dir_y = 0
        for finger, btn in FINGER_BUTTON.items():
            self.curr_states[finger] = "activo" if btn == name else "reposo"
        self.sync_holds(self.desired_from_fingers())

    def handle_finger(self, finger, status):
        if finger not in self.curr_states:
            return
        if status not in ("activo", "reposo"):
            return
        with self.lock:
            self.curr_states[finger] = status
        self.publish({"type": "finger", "finger": finger, "status": status})
        if not self.enabled:
            return
        self.sync_holds(self.desired_from_fingers())

    def handle_imu(self, finger, angle_x):
        if not self.enabled or finger != "menique":
            return
        up = -float(angle_x)
        if self.dir_y > 0:
            if up < MENIQUE_CROUCH_OFF:
                self.dir_y = 0
        elif up >= MENIQUE_CROUCH_ON:
            self.dir_y = 1
        self.sync_holds(self.desired_from_fingers())

    def tick(self):
        if self.emu_proc is not None and self.emu_proc.poll() is not None:
            self.emu_proc = None
            self.release_hold()
            self.publish_emu("NeoRageX se cerro")
            self.publish({"type": "frame", "data": None})

    def launch_emu(self):
        if self.emu_running():
            self.publish_emu("NeoRageX ya estaba abierto")
            return
        if not EMU_EXE.exists():
            self.publish({"type": "error", "message": f"No se encontro {EMU_EXE}"})
            return
        try:
            self.emu_proc = subprocess.Popen([str(EMU_EXE)], cwd=str(EMU_DIR))
            self.publish_emu("NeoRageX lanzado")
            print(f"[EMU] launched pid={self.emu_proc.pid}", flush=True)
        except OSError as exc:
            self.emu_proc = None
            self.publish({"type": "error", "message": f"No se pudo abrir NeoRageX: {exc}"})

    def close_emu(self):
        self.release_hold()
        proc = self.emu_proc
        if proc is None:
            self.publish_emu("NeoRageX ya estaba cerrado")
            return
        try:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        except OSError as exc:
            self.publish({"type": "error", "message": f"No se pudo cerrar NeoRageX: {exc}"})
        self.emu_proc = None
        self.publish_emu("NeoRageX cerrado")
        self.publish({"type": "frame", "data": None})

    def run_demo(self):
        if self.demo_running:
            return
        self.demo_running = True

        def _loop():
            try:
                was_enabled = self.enabled
                self.enabled = True
                self.publish({"type": "system", "message": "Demo local"})
                for name, dur in DEMO_SEQUENCE:
                    if not self.demo_running:
                        break
                    fingers = GESTURE_FINGERS.get(name, [])
                    with self.lock:
                        for d in DEDOS_ORDEN:
                            self.curr_states[d] = "activo" if d in fingers else "reposo"
                    for d in DEDOS_ORDEN:
                        self.publish({"type": "finger", "finger": d, "status": self.curr_states[d]})
                    self.apply_gesture(name)
                    deadline = time.time() + dur
                    while self.demo_running and time.time() < deadline:
                        time.sleep(0.04)
                self.release_hold()
                with self.lock:
                    for d in DEDOS_ORDEN:
                        self.curr_states[d] = "reposo"
                self.dir_y = 0
                self.publish_held()
                self.enabled = was_enabled
                self.publish({"type": "enabled", "enabled": was_enabled})
                self.publish({"type": "system", "message": "Demo terminada"})
            finally:
                self.demo_running = False

        threading.Thread(target=_loop, daemon=True).start()


hub = WebSocketHub()
state = GameState(hub)


def ws_send(conn, text):
    payload = text.encode("utf-8")
    if len(payload) < 126:
        header = bytes([0x81, len(payload)])
    elif len(payload) < 65536:
        header = bytes([0x81, 126]) + struct.pack("!H", len(payload))
    else:
        header = bytes([0x81, 127]) + struct.pack("!Q", len(payload))
    conn.sendall(header + payload)


def ws_recv(conn):
    try:
        header = conn.recv(2)
        if len(header) < 2:
            return None
        _fin_opcode, length_byte = header
        masked = length_byte & 0x80
        length = length_byte & 0x7F
        if length == 126:
            length = struct.unpack("!H", conn.recv(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", conn.recv(8))[0]
        mask = conn.recv(4) if masked else b""
        data = conn.recv(length)
        if masked:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        return data.decode("utf-8", errors="ignore")
    except OSError:
        return None


def handle_ws_message(raw):
    try:
        msg = json.loads(raw)
    except Exception:
        return
    action = msg.get("action")
    print(f"[WS] action={action}", flush=True)
    if action == "start":
        send_udp("CMD:MODE,game")
        send_udp("CMD:START_STREAM")
    elif action == "stop":
        send_udp("CMD:STOP_STREAM")
        send_udp("CMD:MODE,letters")
        state.set_enabled(False)
    elif action == "disconnect":
        send_udp("CMD:DISCONNECT")
        state.forget_connection()
    elif action == "calibrate":
        if not state.esp32_ip:
            state.publish({"type": "error", "message": "ESP32 no conectado: no se puede calibrar"})
            return
        state.publish({"type": "calibration", "current": 0, "total": 5, "percent": 0})
        state.publish({"type": "system", "message": "Enviando CMD:CALIBRATE"})
        send_udp("CMD:CALIBRATE")
    elif action == "ping":
        send_udp("CMD:PING")
    elif action == "vision":
        state.handle_vision(
            dir_x=msg.get("dir_x", 0),
            fist_pulse=bool(msg.get("fist_pulse") or msg.get("fistPulse")),
            shoot=bool(msg.get("shoot")),
            jump=bool(msg.get("jump")),
            crouch=bool(msg.get("crouch")),
        )
    elif action == "launch":
        state.launch_emu()
    elif action == "close_emu":
        state.close_emu()
    elif action == "demo":
        state.run_demo()
