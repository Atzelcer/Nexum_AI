from __future__ import annotations

import threading
import time

import nexum_db

VISION_ACTIONS = {
    "left_click": ("cursor_menique", "clic_izquierdo"),
    "right_click": ("cursor_pulgar", "clic_derecho"),
    "windows": ("mano_izq_abierta", "tecla_windows"),
    "backspace": ("punio_cursor", "borrar"),
}
CURSOR_SAVE_SECONDS = 1.0


class HibridaRecorder:
    def __init__(self, lab):
        self.lab = lab
        self.lock = threading.Lock()
        self.session: str | None = None
        self.keyboard: str | None = None
        self.mode = lab.state.mode
        self.calibrated = False
        self.glove_ip: str | None = None
        self.cursor_saved_at = 0.0

    def install(self) -> None:
        nexum_db.close_open_sessions("hibrida")
        original = self.lab.state.publish

        def publish(payload):
            original(payload)
            try:
                self.observe(payload)
            except Exception as exc:
                print(f"[DB] registro hibrida: {exc}", flush=True)

        self.lab.state.publish = publish

    def ensure_session(self) -> tuple[str, str]:
        with self.lock:
            if not self.session or not self.keyboard:
                self.keyboard = nexum_db.new_code("TEC")
                self.session = nexum_db.start_session("hibrida", {"codigoTeclado": self.keyboard})
                nexum_db.upsert_keyboard(self.session, self.keyboard, self.mode)
            return self.session, self.keyboard

    def end_session(self) -> None:
        with self.lock:
            session, self.session, self.keyboard = self.session, None, None
        if session:
            nexum_db.end_session("hibrida", session)

    def observe(self, payload: dict) -> None:
        kind = payload.get("type")
        if kind == "enabled" and payload.get("enabled"):
            self.ensure_session()
        elif kind == "enabled":
            self.end_session()
        elif kind == "confirm":
            self.on_confirm(payload)
        elif kind == "mode":
            self.on_mode(payload)
        elif kind == "cursor":
            self.on_cursor(payload)
        elif kind == "calibration":
            self.on_calibration(payload)
        elif kind == "connected":
            ip = payload.get("esp32_ip")
            if ip and ip != self.glove_ip:
                nexum_db.glove_paired(ip)
            self.glove_ip = ip

    def on_confirm(self, payload: dict) -> None:
        key = str(payload.get("key") or "")
        if not key:
            return
        session, keyboard = self.ensure_session()
        mode = payload.get("mode") or self.mode
        if payload.get("source") == "vision":
            gesture, command = VISION_ACTIONS.get(key, ("vision_desconocido", key))
            nexum_db.log_command(
                "hibrida", session, gesture, command,
                teclaEjecutada=key, parametrosEjecutados={"modo": mode, "fuente": "camara"},
            )
        else:
            state = self.lab.state
            finger = state.pending_finger
            nexum_db.log_command(
                "hibrida", session, f"dedo_{finger}" if finger else "guante",
                "escribir_numero" if mode == "numbers" else "escribir_letra",
                teclaEjecutada=key, caracterIngresado=key,
                parametrosEjecutados={"modo": mode, "toques": state.pending_count, "mano": state.pending_hand,
                                      "fuente": "guante"},
            )
        nexum_db.upsert_keyboard(session, keyboard, mode, key=key)

    def on_mode(self, payload: dict) -> None:
        mode = payload.get("mode")
        if not mode or mode == self.mode:
            return
        previous, self.mode = self.mode, mode
        session, keyboard = self.ensure_session()
        gesture = "acorde_4_dedos" if payload.get("source") == "gesture" else "interfaz_panel"
        nexum_db.log_command(
            "hibrida", session, gesture, "cambiar_modo",
            parametrosEjecutados={"modoAnterior": previous, "modoNuevo": mode},
        )
        nexum_db.upsert_keyboard(session, keyboard, mode)

    def on_cursor(self, payload: dict) -> None:
        now = time.time()
        if now - self.cursor_saved_at < CURSOR_SAVE_SECONDS:
            return
        self.cursor_saved_at = now
        session, keyboard = self.ensure_session()
        nexum_db.upsert_keyboard(session, keyboard, self.mode,
                                 cursor={"x": payload.get("x"), "y": payload.get("y")})

    def on_calibration(self, payload: dict) -> None:
        done = int(payload.get("percent") or 0) >= 100
        if done and not self.calibrated:
            nexum_db.glove_calibrated()
        self.calibrated = done


def install(lab) -> HibridaRecorder:
    recorder = HibridaRecorder(lab)
    recorder.install()
    return recorder
