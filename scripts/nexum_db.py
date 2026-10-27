from __future__ import annotations

import json
import os
import queue
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from pymongo import MongoClient
from pymongo.errors import PyMongoError

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "project" / "bd" / "nexum_ai_esquema.json"

MONGO_URI = os.environ.get("NEXUM_MONGO_URI", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("NEXUM_MONGO_DB", "nexum_ai")

CODIGO_GUANTE = "GUANTE-NEXUM-01"
CODIGO_CAMARA = "CAMARA-WEB-01"
CODIGO_MODELO_ARQUITECTO = "arch_vision_pos3_v1"

MODALIDADES = {
    "hibrida": {
        "codigoModalidad": "interaccion_hibrida",
        "configuracion": "CFG-HIBRIDA-01",
        "modelo": None,
        "extras": {"codigoTeclado", "urlAplicacion"},
    },
    "arquitecto": {
        "codigoModalidad": "arquitecto_tridimensional",
        "configuracion": "CFG-ARQUITECTO-01",
        "modelo": CODIGO_MODELO_ARQUITECTO,
        "extras": {"objetosSeleccionados"},
    },
    "videojuego": {
        "codigoModalidad": "control_videojuego",
        "configuracion": "CFG-VIDEOJUEGO-01",
        "modelo": None,
        "extras": {"codigoPerfil", "nombrePartida", "puntuacionSesion"},
    },
}

HISTORIAL_EXTRAS = {
    "hibrida": {"teclaEjecutada", "caracterIngresado"},
    "arquitecto": {"codigoObjetivoAfectado"},
    "videojuego": {"magnitudEjecutada", "esCombo"},
}

_client: MongoClient | None = None
_client_lock = threading.Lock()
_ready = False
_ready_lock = threading.Lock()
_writes: queue.Queue = queue.Queue(maxsize=10000)
_writer: threading.Thread | None = None
_last_error_at = 0.0


def now() -> datetime:
    stamp = datetime.now(timezone.utc)
    return stamp.replace(microsecond=stamp.microsecond // 1000 * 1000)


def new_code(prefix: str) -> str:
    return f"{prefix}-{datetime.now(timezone.utc):%Y%m%d%H%M%S}-{secrets.token_hex(3)}"


def client() -> MongoClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000, connectTimeoutMS=2000, tz_aware=True)
        return _client


def db():
    return client()[DB_NAME]


def _log_error(context: str, exc: Exception) -> None:
    global _last_error_at
    now_ts = time.time()
    if now_ts - _last_error_at > 10:
        _last_error_at = now_ts
        print(f"[DB] {context}: {exc}", flush=True)


def ping() -> bool:
    try:
        client().admin.command("ping")
        return True
    except PyMongoError:
        return False


def load_schema() -> list[dict[str, Any]]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))["collections"]


def apply_schema(database) -> int:
    existing = set(database.list_collection_names())
    specs = load_schema()
    for spec in specs:
        name = spec["name"]
        if name in existing:
            database.command(
                "collMod", name, validator=spec["validator"], validationLevel="strict", validationAction="error"
            )
        else:
            database.create_collection(
                name, validator=spec["validator"], validationLevel="strict", validationAction="error"
            )
        target = database[name]
        for index in spec["indexes"]:
            target.create_index(list(index["key"].items()), **index.get("options", {}))
    return len(specs)


def ensure_ready(force: bool = False) -> bool:
    global _ready
    with _ready_lock:
        if _ready and not force:
            return True
        try:
            import nexum_db_seed

            database = db()
            apply_schema(database)
            nexum_db_seed.seed(database)
            _ready = True
            print(f"[DB] MongoDB lista: {DB_NAME} en {safe_uri()}", flush=True)
        except PyMongoError as exc:
            _log_error("MongoDB no disponible", exc)
            _ready = False
        return _ready


def safe_uri() -> str:
    if "@" not in MONGO_URI:
        return MONGO_URI
    scheme, rest = MONGO_URI.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def status() -> dict[str, Any]:
    info: dict[str, Any] = {"uri": safe_uri(), "database": DB_NAME, "connected": ping()}
    if not info["connected"]:
        return info
    database = db()
    names = sorted(database.list_collection_names())
    info["collections"] = len(names)
    info["documentos"] = {name: database[name].estimated_document_count() for name in names}
    return info


def _writer_loop() -> None:
    while True:
        task = _writes.get()
        try:
            if ensure_ready():
                task()
        except PyMongoError as exc:
            _log_error("escritura fallida", exc)
        finally:
            _writes.task_done()


def submit(task: Callable[[], Any]) -> None:
    global _writer
    if _writer is None:
        _writer = threading.Thread(target=_writer_loop, name="nexum-db-writer", daemon=True)
        _writer.start()
    try:
        _writes.put_nowait(task)
    except queue.Full:
        _log_error("cola llena", RuntimeError("se descarta un evento"))


def flush(timeout: float = 5.0) -> None:
    end = time.time() + timeout
    while _writes.unfinished_tasks and time.time() < end:
        time.sleep(0.05)


def _modalidad(mod: str) -> dict[str, Any]:
    if mod not in MODALIDADES:
        raise ValueError(f"modalidad desconocida: {mod}")
    return MODALIDADES[mod]


def _pick(data: dict[str, Any] | None, allowed: set[str]) -> dict[str, Any]:
    return {k: v for k, v in (data or {}).items() if k in allowed and v is not None}


def session_doc(mod: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    spec = _modalidad(mod)
    stamp = now()
    return {
        "codigoSesion": new_code(f"SES-{mod[:3].upper()}"),
        "codigoGuante": CODIGO_GUANTE,
        "codigoCamara": CODIGO_CAMARA,
        "codigoConfiguracion": spec["configuracion"],
        "codigoModeloClasificador": spec["modelo"],
        "fechaInicio": stamp,
        "fechaFin": None,
        "estadoSesion": "activa",
        "fechaRegistro": stamp,
        **_pick(extra, spec["extras"]),
    }


def start_session(mod: str, extra: dict[str, Any] | None = None, wait: bool = False) -> str:
    doc = session_doc(mod, extra)
    coll = f"{mod}_sesiones"
    if wait:
        if not ensure_ready():
            raise PyMongoError("MongoDB no disponible")
        db()[coll].insert_one(doc)
    else:
        submit(lambda: db()[coll].insert_one(doc))
    return doc["codigoSesion"]


def end_session(mod: str, code: str, extra: dict[str, Any] | None = None, estado: str = "finalizada", wait: bool = False) -> bool:
    spec = _modalidad(mod)
    update = {"estadoSesion": estado, "fechaFin": now(), **_pick(extra, spec["extras"])}
    coll = f"{mod}_sesiones"

    def task():
        return db()[coll].update_one({"codigoSesion": code, "estadoSesion": "activa"}, {"$set": update})

    if wait:
        if not ensure_ready():
            raise PyMongoError("MongoDB no disponible")
        return task().matched_count > 0
    submit(task)
    return True


def close_open_sessions(mod: str) -> None:
    submit(
        lambda: db()[f"{mod}_sesiones"].update_many(
            {"estadoSesion": "activa"}, {"$set": {"estadoSesion": "error", "fechaFin": now()}}
        )
    )


def history_doc(mod: str, session: str, gesture: str, command: str, fields: dict[str, Any] | None = None) -> dict[str, Any]:
    fields = fields or {}
    doc = {
        "codigoHistorial": new_code(f"HIS-{mod[:3].upper()}"),
        "codigoSesion": session,
        "codigoGestoDetectado": gesture,
        "codigoComando": command,
        "fechaEjecucion": fields.get("fechaEjecucion") or now(),
        "parametrosEjecutados": fields.get("parametrosEjecutados") or {},
        "resultadoEjecucion": str(fields.get("resultadoEjecucion") or "ok"),
        **_pick(fields, HISTORIAL_EXTRAS[mod]),
    }
    confianza = fields.get("confianzaDeteccion")
    if isinstance(confianza, (int, float)) and 0 <= confianza <= 1:
        doc["confianzaDeteccion"] = float(confianza)
    return doc


def log_command(mod: str, session: str, gesture: str, command: str, **fields: Any) -> None:
    doc = history_doc(mod, session, gesture, command, fields)
    submit(lambda: db()[f"{mod}_historial_comandos"].insert_one(doc))


def log_commands(mod: str, docs: list[dict[str, Any]]) -> int:
    if not docs:
        return 0
    if not ensure_ready():
        raise PyMongoError("MongoDB no disponible")
    db()[f"{mod}_historial_comandos"].insert_many(docs, ordered=False)
    return len(docs)


def upsert_keyboard(session: str, code: str, layout: str, key: str | None = None, cursor: dict | None = None) -> None:
    update: dict[str, Any] = {"codigoSesion": session, "layoutTeclado": layout, "fechaActualizacion": now()}
    if key is not None:
        update["teclaActiva"] = key
    if cursor is not None:
        update["posicionCursor"] = cursor
    filas = {
        "letters": [["a", "b", "c", "d", "e", "f"], ["g", "h", "i", "j", "k", "l"], ["m", "n", "ñ", "o", "p"],
                    ["q", "r", "s", "t", "u"], ["v", "w", "x", "y", "z"]],
        "numbers": [["1", "2", "+"], ["3", "4", "-"], ["5", "6", "*"], ["7", "8", "/"], ["9", "0", ".", ";"]],
    }.get(layout, [])
    submit(
        lambda: db()["hibrida_teclado_virtual"].update_one(
            {"codigoTeclado": code},
            {"$set": update, "$setOnInsert": {"filasTeclado": filas}},
            upsert=True,
        )
    )


def glove_paired(ip: str) -> None:
    submit(
        lambda: db()["configuracion_guante"].update_one(
            {"codigoGuante": CODIGO_GUANTE}, {"$set": {"codigoEsp32": f"ESP32@{ip}"}}
        )
    )


def glove_calibrated() -> None:
    stamp = now()
    submit(
        lambda: db()["configuracion_guante"].update_one(
            {"codigoGuante": CODIGO_GUANTE},
            {"$set": {"calibracionActiva": True, "calibracionEstable": True, "fechaCalibracion": stamp}},
        )
    )


def save_scene(session: str, name: str, objects: list, camera: dict | None) -> str:
    if not ensure_ready():
        raise PyMongoError("MongoDB no disponible")
    code = f"ESC-{session}"
    database = db()
    database["arquitecto_escenas"].update_many(
        {"estadoEscena": "activa", "codigoEscena": {"$ne": code}}, {"$set": {"estadoEscena": "archivada"}}
    )
    database["arquitecto_escenas"].update_one(
        {"codigoEscena": code},
        {
            "$set": {
                "codigoSesion": session,
                "nombreEscena": name,
                "objetosEscena": objects,
                "camaraActiva": camera or {},
                "estadoEscena": "activa",
                "fechaActualizacion": now(),
            }
        },
        upsert=True,
    )
    return code


def latest_scene() -> dict[str, Any] | None:
    if not ensure_ready():
        raise PyMongoError("MongoDB no disponible")
    doc = db()["arquitecto_escenas"].find_one(
        {"estadoEscena": {"$in": ["activa", "borrador"]}}, sort=[("fechaActualizacion", -1)], projection={"_id": 0}
    )
    if doc and isinstance(doc.get("fechaActualizacion"), datetime):
        doc["fechaActualizacion"] = doc["fechaActualizacion"].isoformat()
    return doc


def update_player_profile(session: str, player_code: str, player_name: str, actions: dict[str, int]) -> None:
    if not ensure_ready():
        raise PyMongoError("MongoDB no disponible")
    inc = {f"estadisticasCombate.porComando.{k}": int(v) for k, v in actions.items() if v}
    inc["estadisticasCombate.accionesTotales"] = int(sum(actions.values()))
    inc["estadisticasCombate.partidas"] = 1
    db()["videojuego_perfil_jugador"].update_one(
        {"codigoPerfil": player_code},
        {
            "$set": {"codigoSesion": session, "nombreJugador": player_name},
            "$inc": inc,
            "$setOnInsert": {"nivelExperiencia": "principiante", "combosRegistrados": [], "fechaRegistro": now()},
        },
        upsert=True,
    )
