from __future__ import annotations

import functools
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import nexum_auth_store
import nexum_input_control

PORT = 8090
HOST = "127.0.0.1"

ISOLATED_PREFIXES = (
    "/modulo_game/panel/emulator.html",
    "/modulo_game/panel/arcade2d.html",
    "/modulo_game/panel/ejs/",
)


class Handler(SimpleHTTPRequestHandler):
    def _needs_isolation(self) -> bool:
        path = urlparse(self.path).path
        return any(
            path == prefix.rstrip("/") or path.startswith(prefix)
            for prefix in ISOLATED_PREFIXES
        )

    def end_headers(self) -> None:
        if self._needs_isolation():
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/") or (args and str(args[0]).startswith(("4", "5"))):
            super().log_message(fmt, *args)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/auth/health":
            db_path = nexum_auth_store.ensure_ready()
            self._json(
                200,
                {
                    "ok": True,
                    "store": "usuarios",
                    "path": str(db_path.relative_to(ROOT)).replace("\\", "/"),
                },
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/auth/login":
            self._auth_login()
            return
        if path == "/api/auth/register":
            self._auth_register()
            return
        if path == "/api/vision/cursor":
            self._vision_cursor()
            return
        self.send_error(404, "Not Found")

    def _vision_cursor(self) -> None:
        data = self._read_json()
        result = nexum_input_control.apply_vision_cursor(data)
        status = 200 if result.get("ok") else 400
        self._json(status, result)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth_login(self) -> None:
        data = self._read_json()
        identity = str(data.get("identity") or data.get("email") or "").strip()
        password = str(data.get("password") or data.get("pass") or "")
        ok, message, user = nexum_auth_store.login(identity, password)
        if not ok or not user:
            self._json(401, {"ok": False, "error": message})
            return
        self._json(
            200,
            {
                "ok": True,
                "user": {
                    "id": user["codigoUsuario"],
                    "name": user["nombreUsuario"],
                    "email": user["correoUsuario"],
                    "tipo": user["tipoUsuario"],
                },
            },
        )

    def _auth_register(self) -> None:
        data = self._read_json()
        name = str(data.get("name") or data.get("nombre") or "").strip()
        email = str(data.get("email") or data.get("correo") or "").strip()
        password = str(data.get("password") or data.get("pass") or "")
        ok, message, user = nexum_auth_store.register(name, email, password)
        if not ok or not user:
            self._json(400, {"ok": False, "error": message})
            return
        self._json(
            201,
            {
                "ok": True,
                "user": {
                    "id": user["codigoUsuario"],
                    "name": user["nombreUsuario"],
                    "email": user["correoUsuario"],
                    "tipo": user["tipoUsuario"],
                },
            },
        )


def main() -> None:
    db_path = nexum_auth_store.ensure_ready()
    handler = functools.partial(Handler, directory=str(ROOT))
    ThreadingHTTPServer.allow_reuse_address = True
    with ThreadingHTTPServer((HOST, PORT), handler) as httpd:
        print(f"NEXUM HTTP http://{HOST}:{PORT}/  (COOP/COEP solo emulador)", flush=True)
        print(f"Auth DB: {db_path}", flush=True)
        print(f"API login: POST http://{HOST}:{PORT}/api/auth/login", flush=True)
        print(f"Juego: http://{HOST}:{PORT}/modulo_game/panel/", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
