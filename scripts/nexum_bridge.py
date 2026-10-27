from __future__ import annotations

import base64
import hashlib
import json
import socket
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ESP_IP_CACHE = ROOT / ".nexum_last_esp_ip"
KEEPALIVE_MS = 3.0
last_keepalive_at = 0.0
last_expire_at = 0.0
pending_hands: dict = {}
hello_noted: dict = {}

sys.path.insert(0, str(ROOT / "modulo_teclado" / "scripts"))
sys.path.insert(0, str(ROOT / "modulo_game" / "scripts"))
sys.path.insert(0, str(ROOT / "modulo_arquitecto" / "scripts"))

import arquitecto_bridge as arch
import game_bridge as game
import laboratorio_bridge as lab

UDP_IP = "0.0.0.0"
PC_PORT = 5005
ESP_PORT = 5006
WS_HOST = "127.0.0.1"
LAB_WS_PORT = 8765
GAME_WS_PORT = 8766
ARCH_WS_PORT = 8767

active_module = None
udp_sock = None
udp_lock = threading.Lock()
outbound_cmds = []
outbound_lock = threading.Lock()
esp_lock = threading.Lock()


def load_cached_esp_ips() -> list[str]:
    try:
        text = ESP_IP_CACHE.read_text(encoding="utf-8").strip()
    except OSError:
        return []
    if not text:
        return []
    if text.startswith("["):
        try:
            data = json.loads(text)
            ips = [str(item).strip() for item in data if str(item).strip()]
        except Exception:
            ips = []
    else:
        ips = [line.strip() for line in text.replace(",", "\n").splitlines() if line.strip()]
    seen = set()
    out = []
    for ip in ips:
        if ip not in seen:
            seen.add(ip)
            out.append(ip)
    return out[:2]


def save_cached_esp_ips(ips: list[str] | None) -> None:
    uniq = []
    for ip in ips or []:
        if ip and ip not in uniq:
            uniq.append(ip)
    try:
        ESP_IP_CACHE.write_text("\n".join(uniq[:2]), encoding="utf-8")
    except OSError:
        pass


def save_cached_esp_ip(ip: str | None) -> None:
    if not ip:
        return
    current = load_cached_esp_ips()
    if ip in current:
        current.remove(ip)
    current.insert(0, ip)
    save_cached_esp_ips(current)


def broadcast_targets() -> list[str]:
    targets = ["255.255.255.255"]
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        local = probe.getsockname()[0]
        probe.close()
        parts = local.split(".")
        if len(parts) == 4:
            targets.append(f"{parts[0]}.{parts[1]}.{parts[2]}.255")
    except OSError:
        pass
    targets.extend(load_cached_esp_ips())
    seen = set()
    out = []
    for item in targets:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def sync_esp(ip: str | None) -> None:
    with esp_lock:
        lab.state.esp32_ip = ip
        game.state.esp32_ip = ip
        arch.state.esp32_ip = ip
        if ip:
            save_cached_esp_ip(ip)


def current_esp_ips() -> list[str]:
    ips = lab.glove_ips()
    if ips:
        return ips
    ip = current_esp_ip()
    return [ip] if ip else []


def current_esp_ip() -> str | None:
    with esp_lock:
        return (
            lab.primary_glove_ip()
            or lab.state.esp32_ip
            or game.state.esp32_ip
            or arch.state.esp32_ip
            or next(iter(load_cached_esp_ips()), None)
        )


def udp_send_raw(msg: str, ip: str, port: int = ESP_PORT) -> bool:
    if udp_sock is None or not ip:
        return False
    data = msg.encode("utf-8")
    with udp_lock:
        udp_sock.sendto(data, (ip, port))
    print(f"[UDP TX] {ip}:{port} <- {msg}", flush=True)
    return True


def queue_udp(msg: str, ip: str | None = None, port: int = ESP_PORT) -> bool:
    targets = [ip] if ip else current_esp_ips()
    targets = [item for item in targets if item]
    if not targets:
        publish_all({"type": "error", "message": "ESP32 no conectado"})
        return False
    for target_ip in targets:
        sync_esp(target_ip)
        with outbound_lock:
            outbound_cmds.append((msg, target_ip, port))
    return True


def flush_outbound() -> None:
    with outbound_lock:
        pending = list(outbound_cmds)
        outbound_cmds.clear()
    for msg, ip, port in pending:
        try:
            if udp_send_raw(msg, ip, port):
                publish_all({"type": "system", "message": f"TX {msg}"})
        except OSError as exc:
            publish_all({"type": "error", "message": f"UDP TX error: {exc}"})


def publish_all(payload: dict) -> None:
    lab.state.publish(payload)
    game.state.publish(payload)
    arch.state.publish(payload)


def kick_esp_reconnect(reason: str = "startup", hard: bool = False) -> None:
    print(f"[UDP] buscar ESP32 ({reason}, hard={hard})", flush=True)
    for target in broadcast_targets():
        if hard:
            udp_send_raw("CMD:DISCONNECT", target, ESP_PORT)
        udp_send_raw("CMD:PING", target, ESP_PORT)


def maybe_keepalive() -> None:
    global last_keepalive_at
    ips = current_esp_ips()
    if not ips:
        return
    now = time.time()
    if now - last_keepalive_at < KEEPALIVE_MS:
        return
    last_keepalive_at = now
    for ip in ips:
        udp_send_raw("CMD:PING", ip, ESP_PORT)


def handle_hello(msg: str, addr=None) -> None:
    parts = [part.strip() for part in msg.split(",")]
    ip = (addr[0] if addr else None) or (parts[1] if len(parts) > 1 else "")
    hand_hint = parts[2] if len(parts) > 2 else None
    if not ip:
        return
    pc_ip = lab.obtener_ip_local_hacia(ip)
    udp_send_raw(f"MA_PC,{pc_ip}", ip, ESP_PORT)
    pending_hands[ip] = hand_hint
    if ip in lab.state.gloves:
        drop_glove_all(ip, "reiniciado")
    now = time.time()
    if now - hello_noted.get(ip, 0) > 5:
        hello_noted[ip] = now
        publish_all({"type": "system", "message": f"Guante encontrado ({ip}), emparejando..."})


def confirm_glove(ip: str | None) -> None:
    if not ip:
        return
    info = lab.register_glove(ip, pending_hands.pop(ip, None), event="hello")
    save_cached_esp_ips(lab.glove_ips())
    pc_ip = lab.obtener_ip_local_hacia(ip)
    sync_esp(lab.primary_glove_ip() or ip)
    publish_all({
        "type": "connected",
        "esp32_ip": ip,
        "pc_ip": pc_ip,
        "hand": (info or {}).get("hand"),
        "count": len(lab.state.gloves),
    })
    publish_all({"type": "system", "message": f"Emparejado con {ip}"})
    lab.state.publish(lab.gloves_payload("hello"))


def drop_glove_all(ip: str | None, reason: str) -> None:
    if not lab.drop_glove(ip, reason) or lab.state.gloves:
        return
    for st in (game.state, arch.state):
        st.set_enabled(False)
        st.publish({"type": "connected", "esp32_ip": None, "pc_ip": None, "reason": reason})


def expire_gloves() -> None:
    global last_expire_at
    now = time.time()
    if now - last_expire_at < 1.0:
        return
    last_expire_at = now
    for ip, info in list(lab.state.gloves.items()):
        if not lab.glove_alive(info, now):
            drop_glove_all(ip, "sin respuesta")


def set_all_enabled(active: str | None) -> None:
    lab.state.set_enabled(active == "lab")
    game.state.set_enabled(active == "game")
    arch.state.set_enabled(active == "architect")


def handle_sys(msg: str, addr=None) -> None:
    system_msg = msg[4:].strip()
    src_ip = addr[0] if addr else None
    if system_msg in lab.GLOVE_GONE_SYS:
        drop_glove_all(src_ip, "desconectado")
    elif system_msg == "PC_CONECTADA":
        confirm_glove(src_ip)
    else:
        lab.note_glove_sys(src_ip, system_msg)
    if system_msg in ("ESTADO_CALIBRADO", "ESTADO_SIN_CALIBRAR"):
        pct = 100 if system_msg == "ESTADO_CALIBRADO" else 0
        publish_all({
            "type": "calibration",
            "current": 5 if pct else 0,
            "total": 5,
            "percent": pct,
            "glove_ip": src_ip,
            "hand": lab.hand_for_ip(src_ip),
        })
    if system_msg == "STREAM_ACTIVO":
        if active_module == "game":
            queue_udp("CMD:MODE,game")
        set_all_enabled(active_module)
    elif system_msg in ("STREAM_PAUSADO", "ERROR_NO_CALIBRADO", "DESCONECTANDO"):
        set_all_enabled(None)
    elif system_msg == "CALIBRACION_OK":
        publish_all({
            "type": "calibration",
            "current": 5,
            "total": 5,
            "percent": 100,
            "glove_ip": src_ip,
            "hand": lab.hand_for_ip(src_ip),
        })
    elif system_msg == "PC_CONECTADA":
        if active_module == "game":
            queue_udp("CMD:MODE,game")
        publish_all({"type": "system", "message": "Guante enlazado — puedes Iniciar"})
    publish_all({
        "type": "system",
        "message": system_msg,
        "glove_ip": src_ip,
        "hand": lab.hand_for_ip(src_ip),
    })
    if src_ip and src_ip in lab.state.gloves:
        lab.state.publish(lab.gloves_payload("sys"))


def handle_cal(msg: str, addr=None) -> None:
    body = msg[4:].strip()
    src_ip = addr[0] if addr else None
    try:
        current, total = [int(x) for x in body.split("/", 1)]
        pct = int((current / max(total, 1)) * 100)
    except Exception:
        current, total, pct = 0, 0, 0
    if src_ip:
        lab.register_glove(src_ip)
        if src_ip in lab.state.gloves:
            lab.state.gloves[src_ip]["cal_percent"] = pct
            lab.state.gloves[src_ip]["calibrating"] = pct < 100
    percents = [int(info.get("cal_percent") or 0) for info in lab.state.gloves.values()] or [pct]
    combined = int(sum(percents) / max(len(percents), 1))
    publish_all({
        "type": "calibration",
        "current": current,
        "total": total,
        "percent": combined,
        "glove_ip": src_ip,
        "hand": lab.hand_for_ip(src_ip),
    })


def handle_imu(msg: str) -> None:
    parts = [part.strip() for part in msg[4:].split(",")]
    if len(parts) < 6:
        return
    try:
        finger = parts[0].lower()
        angle_x = float(parts[1])
        angle_y = float(parts[2])
        gyro_x = float(parts[3])
        gyro_y = float(parts[4])
        status = parts[5].lower()
        game.state.handle_imu(finger, angle_x)
        arch.state.handle_imu(finger, angle_x, angle_y, gyro_x, gyro_y, status)
    except Exception as exc:
        lab.state.publish({"type": "error", "message": f"imu: {exc}"})


def handle_finger(msg: str, addr=None) -> None:
    finger, status = [part.strip().lower() for part in msg.split(":", 1)]
    src_ip = addr[0] if addr else None
    if src_ip:
        lab.register_glove(src_ip)
    hand = lab.hand_for_ip(src_ip)
    lab.state.handle_finger(finger, status, hand=hand, glove_ip=src_ip)
    game.state.handle_finger(finger, status)
    arch.state.handle_finger(finger, status)


def parse_udp(msg: str, addr=None) -> None:
    msg = msg.strip()
    if not msg:
        return
    if addr and lab.foreign_glove(addr[0]):
        lab.note_foreign(addr[0], msg)
        return
    if addr and addr[0] and not addr[0].startswith("127."):
        sync_esp(addr[0])
    print(f"[UDP RX] {addr[0] if addr else '?'} -> {msg}", flush=True)
    if msg.startswith("MA_HELLO,"):
        handle_hello(msg, addr)
    elif msg.startswith("SYS:"):
        handle_sys(msg, addr)
    elif msg.startswith("CAL:"):
        handle_cal(msg, addr)
    elif msg.startswith("IMU:"):
        handle_imu(msg)
    elif ":" in msg:
        handle_finger(msg, addr)


def udp_loop() -> None:
    global udp_sock
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    except OSError:
        pass
    try:
        udp_sock.bind((UDP_IP, PC_PORT))
    except OSError as exc:
        print(f"[UDP] ERROR: puerto {PC_PORT} ocupado ({exc}). Cierra el otro nexum_bridge.", flush=True)
        raise
    udp_sock.settimeout(0.05)
    print(f"[UDP] escuchando 0.0.0.0:{PC_PORT}", flush=True)

    cached = load_cached_esp_ips()
    if cached:
        sync_esp(cached[0])
        print(f"[UDP] IPs conocidas: {', '.join(cached)}", flush=True)

    kick_esp_reconnect("bridge_start", hard=True)

    while True:
        try:
            with udp_lock:
                data, addr = udp_sock.recvfrom(2048)
            parse_udp(data.decode("utf-8", errors="ignore"), addr)
        except socket.timeout:
            pass
        except OSError as exc:
            print(f"[UDP RX error] {exc}", flush=True)
            time.sleep(0.05)
        flush_outbound()
        maybe_keepalive()
        expire_gloves()
        lab.state.tick()
        game.state.tick()
        time.sleep(0.005)


def ensure_esp_for_action(action: str) -> bool:
    ip = current_esp_ip()
    if ip:
        sync_esp(ip)
        return True
    kick_esp_reconnect(action)
    publish_all({
        "type": "system",
        "message": "Buscando guante en la red… reinicia el ESP si no aparece en 5 s",
    })
    return False


def wrap_ws_handler(handler, module_name: str, state_obj, others: tuple) -> callable:
    def inner(raw: str) -> None:
        global active_module
        try:
            msg = json.loads(raw)
        except Exception:
            return handler(raw)
        action = msg.get("action")
        if action == "calibrate":
            ip = current_esp_ip()
            if ip and not state_obj.esp32_ip:
                sync_esp(ip)
            if not state_obj.esp32_ip and ip:
                state_obj.esp32_ip = ip
            if not state_obj.esp32_ip:
                ensure_esp_for_action("calibrate")
                state_obj.publish({
                    "type": "error",
                    "message": "ESP32 no conectado: espera el handshake o reinicia el guante",
                })
                return None
        elif action == "start":
            active_module = module_name
            for other in others:
                other.set_enabled(False)
        elif action == "disconnect":
            active_module = None
        elif action == "ping" and not current_esp_ip():
            ensure_esp_for_action(action)
        if module_name == "lab":
            sync_esp(current_esp_ip())
        return handler(raw)
    return inner


def forget_all() -> None:
    global active_module
    for ip in current_esp_ips():
        udp_send_raw("CMD:DISCONNECT", ip, ESP_PORT)
    active_module = None
    lab_forget()
    game.state.enabled = False
    game.state.esp32_ip = None
    for d in game.DEDOS_ORDEN:
        game.state.curr_states[d] = "reposo"
    game.state.dir_y = 0
    game.state.release_hold()
    game.state.publish({"type": "enabled", "enabled": False})
    game.state.publish({"type": "connected", "esp32_ip": None, "pc_ip": None})
    game.state.publish_held()
    arch_forget()
    kick_esp_reconnect("disconnect", hard=True)


lab_forget = lab.state.forget_connection
arch_forget = arch.state.forget_connection


def install_hooks() -> None:
    lab.send_udp = queue_udp
    game.send_udp = queue_udp
    arch.send_udp = queue_udp
    lab.handle_ws_message = wrap_ws_handler(lab.handle_ws_message, "lab", lab.state, (game.state,))
    game.handle_ws_message = wrap_ws_handler(game.handle_ws_message, "game", game.state, (lab.state,))
    arch.handle_ws_message = wrap_ws_handler(
        arch.handle_ws_message, "architect", arch.state, (lab.state, game.state)
    )
    lab.state.forget_connection = forget_all
    game.state.forget_connection = forget_all
    arch.state.forget_connection = forget_all


def ws_accept_loop(port: int, client_fn, label: str) -> None:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((WS_HOST, port))
    server.listen(8)
    print(f"[WS] {label} ws://{WS_HOST}:{port}", flush=True)
    while True:
        conn, _addr = server.accept()
        request = conn.recv(4096).decode("utf-8", errors="ignore")
        key = ""
        for line in request.splitlines():
            if line.lower().startswith("sec-websocket-key:"):
                key = line.split(":", 1)[1].strip()
                break
        if not key:
            conn.close()
            continue
        accept = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()
        ).decode()
        response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        )
        conn.sendall(response.encode("utf-8"))
        threading.Thread(target=client_fn, args=(conn,), daemon=True).start()


def hello_payload_for(state_obj, extra: dict | None = None) -> dict:
    ip = current_esp_ip()
    if ip and not state_obj.esp32_ip:
        sync_esp(ip)
    live_ip = lab.primary_glove_ip() if lab.state.gloves else None
    live_info = lab.state.gloves.get(live_ip) if live_ip else None
    payload = {
        "type": "hello",
        "enabled": state_obj.enabled,
        "esp32_ip": live_ip,
        "count": len(lab.state.gloves),
        "gloves": lab.gloves_payload("hello")["gloves"],
        "calibrated": bool(live_info and int(live_info.get("cal_percent") or 0) >= 100),
    }
    if extra:
        payload.update(extra)
    return payload


def serve_ws_client(conn, module, extra_fn) -> None:
    module.hub.add(conn)
    try:
        module.ws_send(conn, json.dumps(hello_payload_for(module.state, extra_fn())))
        while True:
            raw = module.ws_recv(conn)
            if raw is None:
                break
            module.handle_ws_message(raw)
    except OSError:
        pass
    finally:
        module.hub.remove(conn)
        try:
            conn.close()
        except OSError:
            pass


def lab_ws_client(conn) -> None:
    serve_ws_client(conn, lab, lambda: {"mode": lab.state.mode, "vision_owner": lab.vision_owner})


def game_ws_client(conn) -> None:
    serve_ws_client(conn, game, lambda: {"emu": game.state.emu_running()})


def arch_ws_client(conn) -> None:
    serve_ws_client(conn, arch, lambda: {"mode": arch.state.app_mode})


def main() -> None:
    install_hooks()
    print("NEXUM Bridge unificado", flush=True)
    print(f"UDP guante: {PC_PORT}", flush=True)
    print(f"Laboratorio: ws://{WS_HOST}:{LAB_WS_PORT}", flush=True)
    print(f"Juego:       ws://{WS_HOST}:{GAME_WS_PORT}", flush=True)
    print(f"Arquitecto:  ws://{WS_HOST}:{ARCH_WS_PORT}", flush=True)
    print(f"NeoRageX: {game.EMU_EXE}", flush=True)
    threading.Thread(target=udp_loop, daemon=True).start()
    threading.Thread(target=game.capture_loop, daemon=True).start()
    threading.Thread(target=ws_accept_loop, args=(LAB_WS_PORT, lab_ws_client, "laboratorio"), daemon=True).start()
    threading.Thread(target=ws_accept_loop, args=(GAME_WS_PORT, game_ws_client, "juego"), daemon=True).start()
    ws_accept_loop(ARCH_WS_PORT, arch_ws_client, "arquitecto")


if __name__ == "__main__":
    main()
