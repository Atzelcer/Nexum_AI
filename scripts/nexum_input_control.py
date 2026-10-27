from __future__ import annotations

import sys
from typing import Any


def _win_user32():
    import ctypes

    return ctypes.windll.user32


def move_cursor_norm(x: float, y: float) -> dict[str, Any]:
    x = max(0.0, min(1.0, float(x)))
    y = max(0.0, min(1.0, float(y)))
    if sys.platform.startswith("win"):
        user32 = _win_user32()
        sw = max(1, int(user32.GetSystemMetrics(0)))
        sh = max(1, int(user32.GetSystemMetrics(1)))
        px = int(x * (sw - 1))
        py = int(y * (sh - 1))
        user32.SetCursorPos(px, py)
        return {"ok": True, "x": x, "y": y, "px": px, "py": py}
    try:
        from pynput.mouse import Controller

        mouse = Controller()
        sw, sh = 1920, 1080
        try:
            cur = mouse.position
            sw = max(sw, int(cur[0]) + 1)
            sh = max(sh, int(cur[1]) + 1)
        except Exception:
            pass
        px = int(x * (sw - 1))
        py = int(y * (sh - 1))
        mouse.position = (px, py)
        return {"ok": True, "x": x, "y": y, "px": px, "py": py}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def click_button(button: str = "left") -> dict[str, Any]:
    button = (button or "left").lower()
    if sys.platform.startswith("win"):
        user32 = _win_user32()
        if button == "right":
            user32.mouse_event(0x0008, 0, 0, 0, 0)
            user32.mouse_event(0x0010, 0, 0, 0, 0)
        else:
            user32.mouse_event(0x0002, 0, 0, 0, 0)
            user32.mouse_event(0x0004, 0, 0, 0, 0)
        return {"ok": True, "button": button}
    try:
        from pynput.mouse import Button, Controller

        mouse = Controller()
        btn = Button.right if button == "right" else Button.left
        mouse.click(btn, 1)
        return {"ok": True, "button": button}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def press_key(key: str) -> dict[str, Any]:
    key = (key or "").lower()
    if sys.platform.startswith("win"):
        user32 = _win_user32()
        key_up = 0x0002
        if key == "windows":
            vk = 0x5B
            user32.keybd_event(vk, 0, 0, 0)
            user32.keybd_event(vk, 0, key_up, 0)
            return {"ok": True, "key": "windows"}
        if key in ("delete", "backspace", "borrar"):
            vk = 0x08
            user32.keybd_event(vk, 0, 0, 0)
            user32.keybd_event(vk, 0, key_up, 0)
            return {"ok": True, "key": "backspace"}
        return {"ok": False, "error": f"key no soportada: {key}"}
    try:
        from pynput.keyboard import Controller, Key

        kb = Controller()
        if key == "windows":
            win = getattr(Key, "cmd", None) or getattr(Key, "cmd_l", None)
            if not win:
                return {"ok": False, "error": "windows key no disponible"}
            kb.press(win)
            kb.release(win)
            return {"ok": True, "key": "windows"}
        if key in ("delete", "backspace", "borrar"):
            kb.press(Key.backspace)
            kb.release(Key.backspace)
            return {"ok": True, "key": "backspace"}
        return {"ok": False, "error": f"key no soportada: {key}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def apply_vision_cursor(msg: dict[str, Any]) -> dict[str, Any]:
    kind = msg.get("kind") or msg.get("event")
    if kind == "move":
        return move_cursor_norm(msg.get("x", 0.5), msg.get("y", 0.5))
    if kind == "click":
        return click_button(str(msg.get("button") or "left"))
    if kind == "key":
        return press_key(str(msg.get("key") or ""))
    return {"ok": False, "error": f"kind desconocido: {kind}"}
