import json
import struct
import threading
import time

DEDOS_ORDEN = ["pulgar", "indice", "medio", "anular", "menique"]
TAP_COOLDOWN = 0.28
CHORD_STABLE_MS = 0.09

CHORDS = [
    (frozenset(DEDOS_ORDEN), "vista_reset", "tap"),
    (frozenset(["indice", "medio", "anular", "menique"]), "orbitar", "hold"),
    (frozenset(["indice", "pulgar"]), "cancelar", "tap"),
    (frozenset(["indice", "medio"]), "transformar", "hold"),
    (frozenset(["indice"]), "seleccionar", "tap"),
    (frozenset(["medio"]), "eje_y", "tap"),
    (frozenset(["anular"]), "eje_z", "tap"),
    (frozenset(["menique"]), "eje_x", "tap"),
    (frozenset(["pulgar"]), "confirmar", "tap"),
]

GESTURE_LABELS = {
    "seleccionar": "pinza",
    "transformar": "rotar_muneca",
    "orbitar": "palma_abierta",
    "confirmar": "pulgar",
    "cancelar": "pinza_abierta",
    "eje_x": "eje_x",
    "eje_y": "eje_y",
    "eje_z": "eje_z",
    "vista_reset": "palma_abierta",
}

GESTURE_FINGERS = {name: sorted(chord) for chord, name, _kind in CHORDS}

DEMO_SEQUENCE = [
    ("reposo", 0.5),
    ("seleccionar", 0.6),
    ("transformar", 0.9),
    ("confirmar", 0.5),
    ("orbitar", 1.0),
    ("eje_x", 0.5),
    ("eje_y", 0.5),
    ("cancelar", 0.5),
    ("reposo", 0.4),
]

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


class ArchitectState:
    def __init__(self, hub):
        self.hub = hub
        self.lock = threading.Lock()
        self.enabled = False
        self.curr_states = {d: "reposo" for d in DEDOS_ORDEN}
        self.esp32_ip = None
        self.current_command = "reposo"
        self.chord_candidate = "reposo"
        self.chord_since = time.time()
        self.last_tap_at = {}
        self.demo_running = False
        self.app_mode = "edicion"

    def publish(self, payload):
        self.hub.broadcast(payload)

    def set_enabled(self, enabled):
        with self.lock:
            self.enabled = enabled
            if not enabled:
                self.current_command = "reposo"
        self.publish({"type": "enabled", "enabled": enabled})
        if not enabled:
            self.publish_command("reposo", "idle")

    def forget_connection(self):
        with self.lock:
            self.enabled = False
            self.esp32_ip = None
            for d in DEDOS_ORDEN:
                self.curr_states[d] = "reposo"
            self.current_command = "reposo"
        self.publish({"type": "enabled", "enabled": False})
        self.publish({"type": "connected", "esp32_ip": None, "pc_ip": None})
        self.publish_command("reposo", "idle")

    def active_set(self):
        return frozenset(d for d, status in self.curr_states.items() if status == "activo")

    def resolve_chord(self, active):
        for chord, name, kind in CHORDS:
            if active == chord:
                return name, kind
        return "reposo", "idle"

    def publish_command(self, name, kind, force=False):
        if name == self.current_command and not force:
            return
        self.current_command = name
        self.publish({
            "type": "command",
            "name": name,
            "gesture": GESTURE_LABELS.get(name, name),
            "kind": kind,
            "fingers": GESTURE_FINGERS.get(name, []),
            "mode": self.app_mode,
        })

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
        name, kind = self.resolve_chord(self.active_set())
        now = time.time()
        if name != self.chord_candidate:
            self.chord_candidate = name
            self.chord_since = now
            return
        if now - self.chord_since < CHORD_STABLE_MS:
            return
        if kind == "tap":
            if now - self.last_tap_at.get(name, 0) < TAP_COOLDOWN:
                return
            self.last_tap_at[name] = now
        self.publish_command(name, kind)

    def handle_imu(self, finger, angle_x, angle_y, gyro_x, gyro_y, status):
        if not self.enabled or finger != "indice":
            return
        self.publish({
            "type": "imu",
            "finger": finger,
            "angleX": angle_x,
            "angleY": angle_y,
            "gyroX": gyro_x,
            "gyroY": gyro_y,
            "status": status,
        })

    def run_demo(self):
        if self.demo_running:
            return
        self.demo_running = True

        def _loop():
            try:
                was_enabled = self.enabled
                self.enabled = True
                self.publish({"type": "system", "message": "Demo arquitecto"})
                for name, dur in DEMO_SEQUENCE:
                    if not self.demo_running:
                        break
                    kind = "hold" if name in ("orbitar", "transformar") else ("tap" if name != "reposo" else "idle")
                    fingers = GESTURE_FINGERS.get(name, [])
                    with self.lock:
                        for d in DEDOS_ORDEN:
                            self.curr_states[d] = "activo" if d in fingers else "reposo"
                    for d in DEDOS_ORDEN:
                        self.publish({"type": "finger", "finger": d, "status": self.curr_states[d]})
                    self.publish_command(name, kind, force=True)
                    deadline = time.time() + dur
                    while self.demo_running and time.time() < deadline:
                        time.sleep(0.04)
                with self.lock:
                    for d in DEDOS_ORDEN:
                        self.curr_states[d] = "reposo"
                self.publish_command("reposo", "idle", force=True)
                self.enabled = was_enabled
                self.publish({"type": "enabled", "enabled": was_enabled})
                self.publish({"type": "system", "message": "Demo terminada"})
            finally:
                self.demo_running = False

        threading.Thread(target=_loop, daemon=True).start()


hub = WebSocketHub()
state = ArchitectState(hub)


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
        send_udp("CMD:START_STREAM")
        send_udp("CMD:MODE,cursor")
    elif action == "stop":
        send_udp("CMD:STOP_STREAM")
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
    elif action == "demo":
        state.run_demo()
    elif action == "mode":
        mode = msg.get("mode")
        if mode in ("edicion", "navegacion", "vista_previa"):
            state.app_mode = mode
            state.publish({"type": "app_mode", "mode": mode})
