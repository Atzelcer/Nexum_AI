from __future__ import annotations

import hashlib
import json
import re
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "project" / "database" / "runtime" / "usuarios.json"
_LOCK = threading.Lock()

_SEED_USERS = (
    {
        "nombreUsuario": "Samuel",
        "correoUsuario": "samuel@gmail.com",
        "contrasena": "1234",
        "tipoUsuario": "registrado",
    },
    {
        "nombreUsuario": "Atzel",
        "correoUsuario": "atzel@nexum.ai",
        "contrasena": "1234",
        "tipoUsuario": "registrado",
    },
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return salt, digest


def _verify_password(password: str, salt: str, password_hash: str) -> bool:
    _, digest = _hash_password(password, salt)
    return secrets.compare_digest(digest, password_hash)


def _slug_code(email: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", email.lower()).strip("-") or "usuario"
    return f"usr-{base}"[:64]


public_keys = ("codigoUsuario", "nombreUsuario", "correoUsuario", "tipoUsuario", "estadoUsuario", "fechaRegistro")


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {k: user.get(k) for k in public_keys}


def _empty_db() -> dict[str, Any]:
    return {"version": 1, "usuarios": []}


def _ensure_db() -> dict[str, Any]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        data = _empty_db()
    else:
        try:
            data = json.loads(DB_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = _empty_db()

    if not isinstance(data, dict):
        data = _empty_db()
    data.setdefault("version", 1)
    data.setdefault("usuarios", [])
    if not isinstance(data["usuarios"], list):
        data["usuarios"] = []

    changed = False
    for seed in _SEED_USERS:
        email = seed["correoUsuario"].lower()
        if any(str(u.get("correoUsuario", "")).lower() == email for u in data["usuarios"]):
            continue
        salt, password_hash = _hash_password(seed["contrasena"])
        data["usuarios"].append(
            {
                "codigoUsuario": _slug_code(email),
                "nombreUsuario": seed["nombreUsuario"],
                "correoUsuario": email,
                "tipoUsuario": seed["tipoUsuario"],
                "estadoUsuario": "activo",
                "fechaRegistro": _now_iso(),
                "salt": salt,
                "passwordHash": password_hash,
            }
        )
        changed = True

    if changed or not DB_PATH.exists():
        _save_db(data)
    return data


def _save_db(data: dict[str, Any]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DB_PATH)


def find_user(identity: str, data: dict[str, Any] | None = None) -> dict[str, Any] | None:
    key = identity.strip().lower()
    if not key:
        return None
    db = data if data is not None else _ensure_db()
    for user in db["usuarios"]:
        if user.get("estadoUsuario") == "inactivo":
            continue
        email = str(user.get("correoUsuario", "")).lower()
        name = str(user.get("nombreUsuario", "")).strip().lower()
        if email == key or name == key:
            return user
    return None


def login(identity: str, password: str) -> tuple[bool, str, dict[str, Any] | None]:
    with _LOCK:
        data = _ensure_db()
        user = find_user(identity, data)
        if not user:
            return False, "No hay cuenta con ese nombre/correo. Crea una cuenta.", None
        if not _verify_password(password, user.get("salt", ""), user.get("passwordHash", "")):
            return False, "Nombre/correo o contrasena incorrectos.", None
        return True, "ok", public_user(user)


def register(name: str, email: str, password: str) -> tuple[bool, str, dict[str, Any] | None]:
    email_n = email.strip().lower()
    name_n = (name or "").strip() or email_n.split("@")[0]
    if "@" not in email_n or "." not in email_n.split("@")[-1]:
        return False, "Usa un correo valido para crear la cuenta.", None
    if len(password) < 4:
        return False, "La contrasena debe tener al menos 4 caracteres.", None

    with _LOCK:
        data = _ensure_db()
        if find_user(email_n, data):
            return False, "Ese correo ya tiene cuenta. Inicia sesion.", None
        if find_user(name_n, data) and name_n:
            existing = find_user(name_n, data)
            if existing and existing.get("correoUsuario") != email_n:
                pass

        salt, password_hash = _hash_password(password)
        code = _slug_code(email_n)
        codes = {u.get("codigoUsuario") for u in data["usuarios"]}
        if code in codes:
            code = f"{code}-{secrets.token_hex(2)}"

        user = {
            "codigoUsuario": code,
            "nombreUsuario": name_n[:40],
            "correoUsuario": email_n,
            "tipoUsuario": "registrado",
            "estadoUsuario": "activo",
            "fechaRegistro": _now_iso(),
            "salt": salt,
            "passwordHash": password_hash,
        }
        data["usuarios"].append(user)
        _save_db(data)
        return True, "ok", public_user(user)


def ensure_ready() -> Path:
    with _LOCK:
        _ensure_db()
    return DB_PATH
