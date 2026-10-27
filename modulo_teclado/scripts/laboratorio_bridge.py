import json
import sys
import socket
import struct
import threading
import time
from pathlib import Path

try:
    from pynput.keyboard import Controller
except Exception:
    Controller = None


ESP_PORT = 5006

CONFIRM_DELAY = 2.5
VISUAL_ACTIVE_SECONDS = 0.8
MODE_CHANGE_MIN_ACTIVE = 4
CHORD_WINDOW_SECONDS = 0.6
WHEEL_DWELL_SECONDS = 2.0
WHEEL_ARM_TIMEOUT = 2.5
MAX_GLOVES = 1
GLOVE_TIMEOUT_SECONDS = 12.0
GLOVE_TIMEOUT_CALIBRATING = 90.0
GLOVE_GONE_SYS = ("DESCONECTANDO", "CONEXION_CERRADA", "PC_TIMEOUT", "WIFI_PERDIDO", "REINICIANDO_WIFI")
DEDOS_ORDEN = ["menique", "anular", "medio", "indice", "pulgar"]
MODES = ["letters", "numbers", "cursor"]
HANDS = ("r", "l")

LETTER_MAP = {
    "pulgar": ["a", "b", "c", "d", "e", "f"],
    "indice": ["g", "h", "i", "j", "k", "l"],
    "medio": ["m", "n", "ñ", "o", "p"],
    "anular": ["q", "r", "s", "t", "u"],
    "menique": ["v", "w", "x", "y", "z"],
}

NUMBER_MAP = {
    "pulgar": ["1", "2", "+"],
    "indice": ["3", "4", "-"],
    "medio": ["5", "6", "*"],
    "anular": ["7", "8", "/"],
    "menique": ["9", "0", ".", ";"],
}

send_udp = None


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


class LabState:
    def __init__(self, hub):
        self.hub = hub
        self.lock = threading.Lock()
        self.mode = "letters"
        self.enabled = False
        self.pending_finger = None
        self.pending_count = 0
        self.pending_hand = "r"
        self.visual_release_at = 0.0
        self.confirm_at = 0.0
        self.visual_released = True
        self.locked_finger = None
        self.waiting_for_rest = False
        self.esp32_ip = None
        self.gloves = {}
        self.states_by_hand = {h: {d: "reposo" for d in DEDOS_ORDEN} for h in HANDS}
        self.prev_by_hand = {h: {d: "reposo" for d in DEDOS_ORDEN} for h in HANDS}
        self.curr_states = self.states_by_hand["r"]
        self.prev_states = self.prev_by_hand["r"]
        self.keyboard = Controller() if Controller else None
        self.wheel_open = False
        self.wheel_hover = "letters"
        self.wheel_armed = False
        self.wheel_opened_at = 0.0
        self.wheel_confirm_at = 0.0
        self.wheel_rises = []
        self.wheel_hover_before = None
        self.chord_rises = {h: [] for h in HANDS}
        self.chord_snapshot = None

    def publish(self, payload):
        self.hub.broadcast(payload)

    def set_enabled(self, enabled):
        with self.lock:
            self.enabled = enabled
            self.reset_selection()
            if not enabled and self.wheel_open:
                self.close_wheel("cancel")
            if enabled:
                self.waiting_for_rest = not self.all_resting()
        self.publish({"type": "enabled", "enabled": enabled})

    def reset_selection(self):
        self.pending_finger = None
        self.pending_count = 0
        self.pending_hand = "r"
        self.visual_release_at = 0.0
        self.confirm_at = 0.0
        self.visual_released = True
        self.locked_finger = None
        self.waiting_for_rest = False

    def forget_connection(self):
        with self.lock:
            self.enabled = False
            self.reset_selection()
            if self.wheel_open:
                self.close_wheel("cancel")
            self.esp32_ip = None
            self.gloves = {}
            for hand in HANDS:
                for d in DEDOS_ORDEN:
                    self.states_by_hand[hand][d] = "reposo"
                    self.prev_by_hand[hand][d] = "reposo"
            self.curr_states = self.states_by_hand["r"]
            self.prev_states = self.prev_by_hand["r"]
        self.publish({"type": "enabled", "enabled": False})
        self.publish({"type": "connected", "esp32_ip": None, "pc_ip": None})
        self.publish(gloves_payload("cleared"))

    def reset_session(self):
        with self.lock:
            if self.wheel_open:
                self.close_wheel("cancel")
            self.reset_selection()
            self.mode = "letters"
            for hand in HANDS:
                for finger in DEDOS_ORDEN:
                    self.states_by_hand[hand][finger] = "reposo"
                    self.prev_by_hand[hand][finger] = "reposo"
        self.publish({"type": "reset"})
        self.publish({"type": "mode", "mode": self.mode})

    def wheel_payload(self, phase, **extra):
        return {
            "type": "mode_wheel",
            "phase": phase,
            "hover": self.wheel_hover,
            "current": self.mode,
            "armed": self.wheel_armed,
            "dwell_ms": int(WHEEL_DWELL_SECONDS * 1000),
            **extra,
        }

    def open_mode_wheel(self, now=None):
        now = now or time.time()
        self.reset_selection()
        idx = MODES.index(self.mode) if self.mode in MODES else -1
        self.wheel_open = True
        self.wheel_hover = MODES[(idx + 1) % len(MODES)]
        self.wheel_armed = self.all_resting()
        self.wheel_opened_at = now
        self.wheel_confirm_at = now + WHEEL_DWELL_SECONDS
        self.wheel_rises = []
        self.wheel_hover_before = None
        self.publish(self.wheel_payload("open"))

    def close_wheel(self, phase=None):
        self.wheel_open = False
        self.wheel_rises = []
        self.wheel_hover_before = None
        for hand in HANDS:
            self.chord_rises[hand] = []
        if phase:
            self.publish(self.wheel_payload(phase))

    def wheel_arm(self, now):
        self.wheel_armed = True
        self.wheel_rises = []
        self.wheel_confirm_at = now + WHEEL_DWELL_SECONDS
        self.publish(self.wheel_payload("armed"))

    def wheel_advance(self, now):
        idx = MODES.index(self.wheel_hover) if self.wheel_hover in MODES else -1
        self.wheel_hover = MODES[(idx + 1) % len(MODES)]
        self.wheel_confirm_at = now + WHEEL_DWELL_SECONDS
        self.publish(self.wheel_payload("hover"))

    def wheel_confirm(self):
        chosen = self.wheel_hover
        self.close_wheel()
        self.publish(self.wheel_payload("confirm", mode=chosen))
        self.apply_mode(chosen)

    def handle_wheel_finger(self, finger, status, slot, now, glove_ip=None):
        prev = self.prev_states.get(finger, "reposo")
        self.curr_states[finger] = status
        self.prev_states[finger] = status
        rising = prev == "reposo" and status == "activo"
        self.publish({"type": "finger", "finger": finger, "status": status, "hand": slot, "glove_ip": glove_ip})
        if not self.wheel_armed:
            if self.all_resting():
                self.wheel_arm(now)
            return
        if not rising:
            return
        self.wheel_rises = [(f, t) for f, t in self.wheel_rises if now - t <= CHORD_WINDOW_SECONDS]
        if not self.wheel_rises:
            self.wheel_hover_before = self.wheel_hover
            self.wheel_rises.append((finger, now))
            self.wheel_advance(now)
            return
        self.wheel_rises.append((finger, now))
        if len({f for f, _ in self.wheel_rises}) >= MODE_CHANGE_MIN_ACTIVE:
            if self.wheel_hover_before:
                self.wheel_hover = self.wheel_hover_before
            self.wheel_confirm()

    def wheel_tick(self, now):
        if not self.wheel_armed:
            if now - self.wheel_opened_at >= WHEEL_ARM_TIMEOUT:
                self.wheel_arm(now)
            return
        if now >= self.wheel_confirm_at:
            self.wheel_confirm()

    def apply_mode(self, mode):
        self.mode = mode if mode in MODES else "letters"
        self.reset_selection()
        self.waiting_for_rest = not self.all_resting()
        for hand in HANDS:
            for finger in DEDOS_ORDEN:
                self.states_by_hand[hand][finger] = "reposo"
                self.prev_by_hand[hand][finger] = "reposo"
                self.publish({"type": "finger", "finger": finger, "status": "reposo", "hand": hand})
        self.publish({"type": "mode", "mode": self.mode, "source": "gesture"})
        try:
            send_mode_to_esp()
        except Exception:
            pass

    def detect_chord(self, finger, slot, rising, now):
        if not rising:
            return False
        rises = [(f, t) for f, t in self.chord_rises[slot] if now - t <= CHORD_WINDOW_SECONDS]
        if not rises:
            self.chord_snapshot = (
                (self.pending_finger, self.pending_count, self.pending_hand)
                if self.pending_finger and self.mode != "cursor" else None
            )
        rises.append((finger, now))
        self.chord_rises[slot] = rises
        if len({f for f, _ in rises}) < MODE_CHANGE_MIN_ACTIVE:
            return False

        snapshot = self.chord_snapshot
        self.chord_snapshot = None
        self.chord_rises[slot] = []
        if snapshot:
            self.pending_finger, self.pending_count, self.pending_hand = snapshot
            self.emit_key(self.pending_key())
        self.curr_states[finger] = "activo"
        self.prev_states[finger] = "activo"
        self.publish({"type": "finger", "finger": finger, "status": "activo", "hand": slot})
        self.open_mode_wheel(now)
        return True

    def all_resting(self, hand=None):
        if hand in self.states_by_hand:
            return all(self.states_by_hand[hand][d] == "reposo" for d in DEDOS_ORDEN)
        return all(
            self.states_by_hand[h][d] == "reposo"
            for h in HANDS
            for d in DEDOS_ORDEN
        )

    def pending_key(self):
        if not self.pending_finger or self.pending_count <= 0:
            return None
        key_map = NUMBER_MAP if self.mode == "numbers" else LETTER_MAP
        options = key_map.get(self.pending_finger, [])
        if not options:
            return None
        return options[(self.pending_count - 1) % len(options)]

    def emit_key(self, key):
        if not key:
            return
        self.publish({"type": "confirm", "key": key, "mode": self.mode})
        if not self.keyboard:
            return
        try:
            self.keyboard.type(key)
        except Exception as exc:
            self.publish({"type": "error", "message": f"teclado: {exc}"})

    def confirm(self):
        key = self.pending_key()
        finger = self.pending_finger
        hand = self.pending_hand
        self.chord_snapshot = None
        self.emit_key(key)
        self.reset_selection()
        if finger:
            self.publish({"type": "finger", "finger": finger, "status": "reposo", "hand": hand})
        for h in HANDS:
            for d in DEDOS_ORDEN:
                self.states_by_hand[h][d] = "reposo"
                self.prev_by_hand[h][d] = "reposo"

    def begin_selection(self, finger, now=None, hand="r"):
        now = now or time.time()
        self.locked_finger = finger
        self.pending_hand = hand if hand in HANDS else "r"
        if self.pending_finger == finger:
            self.pending_count += 1
        else:
            self.pending_finger = finger
            self.pending_count = 1
        self.visual_release_at = now + VISUAL_ACTIVE_SECONDS
        self.confirm_at = now + CONFIRM_DELAY
        self.visual_released = False
        self.publish({"type": "finger", "finger": finger, "status": "activo", "hand": self.pending_hand})
        self.publish({
            "type": "preview",
            "finger": finger,
            "hand": self.pending_hand,
            "count": self.pending_count,
            "key": self.pending_key(),
            "mode": self.mode,
            "confirm_ms": int(CONFIRM_DELAY * 1000),
        })

    def _bind_hand(self, hand):
        slot = hand if hand in HANDS else "r"
        self.curr_states = self.states_by_hand[slot]
        self.prev_states = self.prev_by_hand[slot]
        return slot

    def handle_finger(self, finger, status, hand="r", glove_ip=None):
        now = time.time()
        with self.lock:
            slot = self._bind_hand(hand)
            if finger not in self.curr_states or status not in ("activo", "reposo"):
                return
            if glove_ip and glove_ip in self.gloves:
                self.gloves[glove_ip]["last_seen"] = now

            if self.wheel_open:
                self.handle_wheel_finger(finger, status, slot, now, glove_ip)
                return

            was_rest = self.prev_states.get(finger, "reposo") == "reposo"
            if self.detect_chord(finger, slot, was_rest and status == "activo", now):
                return

            finger_msg = {"type": "finger", "finger": finger, "status": status, "hand": slot, "glove_ip": glove_ip}

            if self.mode == "cursor":
                self.curr_states[finger] = status
                self.prev_states[finger] = status
                self.publish(finger_msg)
                return

            if self.pending_finger and now >= self.confirm_at:
                self.confirm()
                self._bind_hand(slot)

            prev = self.prev_states.get(finger, "reposo")
            self.curr_states[finger] = status
            rising = prev == "reposo" and status == "activo"
            self.prev_states[finger] = status

            if self.waiting_for_rest:
                if self.all_resting():
                    self.waiting_for_rest = False
                    self.locked_finger = None
                self.publish(finger_msg)
                return

            if self.pending_finger:
                if rising and finger == self.pending_finger:
                    self.begin_selection(finger, now, hand=slot)
                else:
                    self.publish(finger_msg)
                return

            if self.all_resting(slot) and self.all_resting():
                self.locked_finger = None
                self.publish(finger_msg)
                return

            if not self.enabled or (self.locked_finger and finger != self.locked_finger):
                self.publish(finger_msg)
                return

            if rising:
                self.begin_selection(finger, now, hand=slot)
            else:
                self.publish(finger_msg)

    def tick(self):
        with self.lock:
            now = time.time()
            if self.wheel_open:
                self.wheel_tick(now)
                return
            if not self.enabled:
                return
            if self.waiting_for_rest:
                if self.all_resting():
                    self.waiting_for_rest = False
                return
            if self.mode == "cursor" or not self.pending_finger:
                return
            if not self.visual_released and now >= self.visual_release_at:
                self.publish({
                    "type": "finger",
                    "finger": self.pending_finger,
                    "status": "reposo",
                    "hand": self.pending_hand,
                })
                self.visual_released = True
            if now >= self.confirm_at:
                self.confirm()

    def handle_vision_cursor(self, msg):
        if self.mode != "cursor":
            return

        try:
            scripts_dir = str(Path(__file__).resolve().parents[2] / "scripts")
            if scripts_dir not in sys.path:
                sys.path.insert(0, scripts_dir)
            import nexum_input_control

            result = nexum_input_control.apply_vision_cursor(msg)
            kind = msg.get("kind") or msg.get("event")
            if kind != "move":
                print(f"[VISION] {kind} -> {result}", flush=True)
            if result.get("ok"):
                if kind == "move":
                    self.publish({
                        "type": "cursor",
                        "source": "vision",
                        "x": result.get("x"),
                        "y": result.get("y"),
                    })
                elif kind == "click":
                    self.publish({
                        "type": "confirm",
                        "key": f"{result.get('button')}_click",
                        "mode": "cursor",
                        "source": "vision",
                    })
                elif kind == "key":
                    self.publish({
                        "type": "confirm",
                        "key": result.get("key"),
                        "mode": "cursor",
                        "source": "vision",
                    })
            else:
                self.publish({"type": "error", "message": f"vision_cursor: {result.get('error')}"})
        except Exception as exc:
            self.publish({"type": "error", "message": f"vision_cursor: {exc}"})


hub = WebSocketHub()
state = LabState(hub)


def normalize_hand(value):
    raw = str(value or "").strip().lower()
    if raw in ("l", "left", "izq", "izquierda"):
        return "l"
    if raw in ("r", "right", "der", "derecha"):
        return "r"
    return None


def gloves_payload(event="update"):
    gloves = []
    for ip, info in state.gloves.items():
        gloves.append({
            "ip": ip,
            "hand": info.get("hand") or "r",
            "cal_percent": int(info.get("cal_percent") or 0),
            "last_sys": info.get("last_sys"),
        })
    gloves.sort(key=lambda item: 0 if item["hand"] == "r" else 1)
    return {
        "type": "gloves",
        "event": event,
        "count": len(gloves),
        "gloves": gloves,
        "esp32_ip": state.esp32_ip,
    }


def assigned_hands():
    return {info.get("hand") for info in state.gloves.values() if info.get("hand") in HANDS}


def next_free_hand(hint=None):
    used = assigned_hands()
    hinted = normalize_hand(hint)
    if hinted and hinted not in used:
        return hinted
    if "r" not in used:
        return "r"
    return "l"


def primary_glove_ip():
    for ip, info in state.gloves.items():
        if info.get("hand") == "r":
            return ip
    if state.gloves:
        return next(iter(state.gloves))
    return state.esp32_ip


def glove_ips():
    ips = list(state.gloves.keys())
    if ips:
        return ips
    if state.esp32_ip:
        return [state.esp32_ip]
    return []


_own_ips = {"at": 0.0, "ips": set()}


def own_ip(ip):
    if not ip or ip.startswith("127."):
        return True
    now = time.time()
    if now - _own_ips["at"] > 30:
        ips = set()
        try:
            ips.update(info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
        except OSError:
            pass
        try:
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            probe.connect(("8.8.8.8", 80))
            ips.add(probe.getsockname()[0])
            probe.close()
        except OSError:
            pass
        _own_ips["at"] = now
        _own_ips["ips"] = ips
    return ip in _own_ips["ips"]


def register_glove(ip, hand_hint=None, event="detected"):
    if own_ip(ip):
        return None
    created = ip not in state.gloves
    if created and len(state.gloves) >= MAX_GLOVES:
        old_ips = ", ".join(state.gloves.keys())
        print(f"[GLOVE] guante reconectado: {old_ips} -> {ip}", flush=True)
        state.gloves.clear()
    info = state.gloves.get(ip) or {"ip": ip, "hand": None, "cal_percent": 0, "last_sys": None}
    if created or not info.get("hand"):
        info["hand"] = next_free_hand(hand_hint)
    elif normalize_hand(hand_hint) and normalize_hand(hand_hint) not in (assigned_hands() - {info.get("hand")}):
        info["hand"] = normalize_hand(hand_hint)
    info["last_seen"] = time.time()
    state.gloves[ip] = info
    state.esp32_ip = primary_glove_ip()
    if created:
        print(f"[GLOVE] guante enlazado: {ip}", flush=True)
        state.publish(gloves_payload(event))
    return info


def glove_alive(info, now=None):
    now = now or time.time()
    limit = GLOVE_TIMEOUT_CALIBRATING if info.get("calibrating") else GLOVE_TIMEOUT_SECONDS
    return now - float(info.get("last_seen") or 0) <= limit


def foreign_glove(ip, now=None):
    if own_ip(ip) or ip in state.gloves:
        return False
    return any(glove_alive(info, now) for info in state.gloves.values())


_foreign_noted = {}


def note_foreign(ip, msg):
    now = time.time()
    if now - _foreign_noted.get(ip, 0) < 15:
        return
    _foreign_noted[ip] = now
    active = ", ".join(state.gloves)
    print(f"[GLOVE] ignorado otro ESP32 {ip} ({msg[:24]}) - activo: {active}", flush=True)
    state.publish({
        "type": "system",
        "message": f"Otro ESP32 ({ip}) intenta emparejarse; se ignora mientras {active} responda. Apagalo si no lo usas.",
    })


def drop_glove(ip, reason="perdido"):
    if not ip or ip not in state.gloves:
        return False
    state.gloves.pop(ip, None)
    print(f"[GLOVE] guante {reason}: {ip}", flush=True)
    if not state.gloves:
        state.set_enabled(False)
        state.publish({"type": "connected", "esp32_ip": None, "pc_ip": None, "reason": reason})
    state.publish(gloves_payload(reason))
    return True


def note_glove_sys(ip, system_msg):
    if not ip:
        return True
    if system_msg in GLOVE_GONE_SYS:
        drop_glove(ip, "desconectado")
        return False
    register_glove(ip)
    info = state.gloves.get(ip)
    if not info:
        return True
    info["last_sys"] = system_msg
    if system_msg in ("CALIBRACION_SOLICITADA", "CALIBRANDO"):
        info["calibrating"] = True
        info["cal_percent"] = 0
    elif system_msg in ("CALIBRACION_OK", "ESTADO_CALIBRADO"):
        info["calibrating"] = False
        info["cal_percent"] = 100
    elif system_msg == "ESTADO_SIN_CALIBRAR":
        info["calibrating"] = False
        info["cal_percent"] = 0
    return True


def hand_for_ip(ip):
    info = state.gloves.get(ip) if ip else None
    if info and info.get("hand") in HANDS:
        return info["hand"]
    return "r"


def obtener_ip_local_hacia(destino_ip):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((destino_ip, ESP_PORT))
        return s.getsockname()[0]
    finally:
        s.close()


def send_mode_to_esp():
    if not glove_ips():
        return
    send_udp(f"CMD:MODE,{state.mode}")


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


vision_owner = None


def handle_ws_message(raw):
    global vision_owner
    try:
        msg = json.loads(raw)
    except Exception:
        return
    action = msg.get("action")
    print(f"[WS] action={action}", flush=True)
    if action == "start":
        send_udp("CMD:START_STREAM")
        send_mode_to_esp()
    elif action == "stop":
        send_udp("CMD:STOP_STREAM")
        state.set_enabled(False)
    elif action == "disconnect":
        send_udp("CMD:DISCONNECT")
        state.forget_connection()
    elif action == "calibrate":
        if not glove_ips():
            state.publish({"type": "error", "message": "ESP32 no conectado: no se puede calibrar"})
            return
        state.publish({"type": "calibration", "current": 0, "total": 5, "percent": 0})
        state.publish({"type": "system", "message": "Enviando CMD:CALIBRATE"})
        send_udp("CMD:CALIBRATE")
    elif action == "ping":
        send_udp("CMD:PING")
    elif action == "mode":
        mode = msg.get("mode")
        if mode in MODES:
            with state.lock:
                if state.wheel_open:
                    state.close_wheel("cancel")
                elif mode == state.mode:
                    return
                state.mode = mode
                state.reset_selection()
                state.waiting_for_rest = not state.all_resting()
            state.publish({"type": "mode", "mode": mode})
            send_mode_to_esp()
            print(f"[MODE] -> {mode}", flush=True)
    elif action == "reset":
        state.reset_session()
        if state.gloves:
            send_udp("CMD:RESET")
            send_mode_to_esp()
    elif action in ("vision_claim", "vision_release"):
        owner = msg.get("owner")
        if action == "vision_claim":
            vision_owner = owner
        elif owner == vision_owner:
            vision_owner = None
        else:
            return
        state.publish({"type": "vision_owner", "owner": vision_owner})
    elif action == "mode_wheel_cancel":
        with state.lock:
            if state.wheel_open:
                state.close_wheel("cancel")
                state.waiting_for_rest = not state.all_resting()
    elif action == "vision_cursor":
        state.handle_vision_cursor(msg)
    elif action == "wifi_config":
        send_wifi_config(str(msg.get("ssid") or ""), str(msg.get("password") or ""))


wifi_usb_sender = None


def wifi_config_error(message):
    state.publish({"type": "wifi_config", "status": "error", "message": message})


def send_wifi_config(ssid, password):
    ssid_bytes = ssid.encode("utf-8")
    pass_bytes = password.encode("utf-8")
    if not 1 <= len(ssid_bytes) <= 32:
        wifi_config_error("El nombre de la red debe tener entre 1 y 32 caracteres.")
        return
    if pass_bytes and not 8 <= len(pass_bytes) <= 63:
        wifi_config_error("La contrasena debe tener entre 8 y 63 caracteres (o dejarse vacia si la red es abierta).")
        return
    target = primary_glove_ip() if state.gloves else None
    if target:
        send_udp(f"CMD:WIFI,{ssid_bytes.hex()},{pass_bytes.hex()}", target)
        print(f"[WIFI] red enviada al guante: {ssid}", flush=True)
        state.publish({"type": "wifi_config", "status": "sent", "ssid": ssid, "via": "wifi"})
        return
    if wifi_usb_sender and wifi_usb_sender(ssid, password):
        return
    wifi_config_error(
        "No se encuentra el guante: no esta enlazado por WiFi ni conectado por USB. "
        "Conectalo con el cable USB o conecta esta PC a la red NEXUM-GUANTE."
    )
