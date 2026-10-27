from __future__ import annotations

import functools
import json
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from pymongo.errors import PyMongoError

import nexum_auth_store
import nexum_db
import nexum_input_control
import nexum_wifi

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

    def _same_origin(self) -> bool:
        allowed = {f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}
        origin = self.headers.get("Origin")
        if origin and origin not in allowed:
            return False
        if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none"):
            return False
        referer = self.headers.get("Referer")
        return not referer or any(referer.startswith(item + "/") for item in allowed)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/auth/health":
            ready = nexum_auth_store.ensure_ready()
            self._json(200 if ready else 503, {
                "ok": ready,
                "store": "mongodb",
                "database": nexum_db.DB_NAME,
                "uri": nexum_db.safe_uri(),
            })
            return
        if path == "/api/red/wifi":
            self._json(200, {"ok": True, **nexum_wifi.status()})
            return
        if path == "/api/red/wifi/clave":
            if not self._same_origin():
                self._json(403, {"ok": False, "error": "origen no permitido"})
                return
            ssid = (parse_qs(urlparse(self.path).query).get("ssid") or [""])[0]
            password = nexum_wifi.saved_password(ssid)
            self._json(200, {"ok": True, "ssid": ssid, "guardada": password is not None, "clave": password or ""})
            return
        if path == "/api/db/estado":
            info = nexum_db.status()
            self._json(200 if info["connected"] else 503, {"ok": info["connected"], **info})
            return
        if path == "/api/arquitecto/escenas/ultima":
            self._db_call(lambda: {"escena": nexum_db.latest_scene()})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        routes = {
            "/api/auth/login": self._auth_login,
            "/api/auth/register": self._auth_register,
            "/api/vision/cursor": self._vision_cursor,
            "/api/sesiones/iniciar": self._session_start,
            "/api/sesiones/finalizar": self._session_end,
            "/api/historial": self._history,
            "/api/arquitecto/escenas": self._scene_save,
        }
        route = routes.get(path)
        if route:
            route()
            return
        self.send_error(404, "Not Found")

    def _db_call(self, fn, status: int = 200) -> None:
        try:
            self._json(status, {"ok": True, **fn()})
        except ValueError as exc:
            self._json(400, {"ok": False, "error": str(exc)})
        except PyMongoError as exc:
            self._json(503, {"ok": False, "error": f"MongoDB: {exc}"})

    def _modalidad(self, data: dict) -> str:
        mod = str(data.get("modalidad") or "")
        if mod not in nexum_db.MODALIDADES:
            raise ValueError("modalidad invalida (hibrida, arquitecto, videojuego)")
        return mod

    def _session_start(self) -> None:
        data = self._read_json()

        def run():
            mod = self._modalidad(data)
            extra = data.get("datos") if isinstance(data.get("datos"), dict) else {}
            usuario = data.get("usuario") if isinstance(data.get("usuario"), dict) else None
            if mod == "videojuego" and usuario and usuario.get("id"):
                extra = {**extra, "codigoPerfil": f"PER-{usuario['id']}"}
            return {"codigoSesion": nexum_db.start_session(mod, extra, wait=True)}

        self._db_call(run, 201)

    def _session_end(self) -> None:
        data = self._read_json()

        def run():
            mod = self._modalidad(data)
            code = str(data.get("codigoSesion") or "")
            if not code:
                raise ValueError("falta codigoSesion")
            extra = data.get("datos") if isinstance(data.get("datos"), dict) else {}
            closed = nexum_db.end_session(mod, code, extra, wait=True)
            usuario = data.get("usuario") if isinstance(data.get("usuario"), dict) else None
            acciones = data.get("acciones") if isinstance(data.get("acciones"), dict) else {}
            if closed and mod == "videojuego" and usuario and usuario.get("id"):
                nexum_db.update_player_profile(
                    code, f"PER-{usuario['id']}", str(usuario.get("name") or usuario["id"]),
                    {str(k): int(v) for k, v in acciones.items() if isinstance(v, (int, float))},
                )
            return {"finalizada": closed}

        self._db_call(run)

    def _history(self) -> None:
        data = self._read_json()

        def run():
            mod = self._modalidad(data)
            code = str(data.get("codigoSesion") or "")
            eventos = data.get("eventos") if isinstance(data.get("eventos"), list) else []
            if not code:
                raise ValueError("falta codigoSesion")
            docs = []
            for ev in eventos[:500]:
                if not isinstance(ev, dict) or not ev.get("comando"):
                    continue
                fields = dict(ev)
                stamp = ev.get("fecha")
                if isinstance(stamp, (int, float)):
                    fields["fechaEjecucion"] = datetime.fromtimestamp(stamp / 1000, timezone.utc)
                if not isinstance(fields.get("parametrosEjecutados"), dict):
                    fields.pop("parametrosEjecutados", None)
                docs.append(nexum_db.history_doc(mod, code, str(ev.get("gesto") or "desconocido"),
                                                 str(ev["comando"]), fields))
            return {"registrados": nexum_db.log_commands(mod, docs)}

        self._db_call(run, 201)

    def _scene_save(self) -> None:
        data = self._read_json()

        def run():
            code = str(data.get("codigoSesion") or "")
            if not code:
                raise ValueError("falta codigoSesion")
            objetos = data.get("objetosEscena") if isinstance(data.get("objetosEscena"), list) else []
            camara = data.get("camaraActiva") if isinstance(data.get("camaraActiva"), dict) else {}
            nombre = str(data.get("nombreEscena") or "Escena NEXUM")[:80]
            return {"codigoEscena": nexum_db.save_scene(code, nombre, objetos, camara)}

        self._db_call(run, 201)

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
    ready = nexum_auth_store.ensure_ready()
    handler = functools.partial(Handler, directory=str(ROOT))
    ThreadingHTTPServer.allow_reuse_address = True
    with ThreadingHTTPServer((HOST, PORT), handler) as httpd:
        print(f"NEXUM HTTP http://{HOST}:{PORT}/  (COOP/COEP solo emulador)", flush=True)
        estado = "conectada" if ready else "SIN CONEXION (se reintenta en cada peticion)"
        print(f"MongoDB {nexum_db.safe_uri()}/{nexum_db.DB_NAME}: {estado}", flush=True)
        print(f"API login: POST http://{HOST}:{PORT}/api/auth/login", flush=True)
        print(f"Juego: http://{HOST}:{PORT}/modulo_game/panel/", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
