from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime
from typing import Any

from pymongo.errors import DuplicateKeyError, PyMongoError

import nexum_db

UNAVAILABLE = "Base de datos no disponible. Inicia MongoDB e intenta de nuevo."

_SEED_USERS = (
    {"nombreUsuario": "Samuel", "correoUsuario": "samuel@gmail.com", "contrasena": "1234"},
    {"nombreUsuario": "Atzel", "correoUsuario": "atzel@nexum.ai", "contrasena": "1234"},
)


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


def _users():
    return nexum_db.db()["usuarios"]


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    fecha = user.get("fechaRegistro")
    return {
        "codigoUsuario": user.get("codigoUsuario"),
        "nombreUsuario": user.get("nombreUsuario"),
        "correoUsuario": user.get("correoUsuario"),
        "tipoUsuario": user.get("tipoUsuario"),
        "estadoUsuario": user.get("estadoUsuario"),
        "fechaRegistro": fecha.isoformat() if isinstance(fecha, datetime) else fecha,
    }


def _new_user(name: str, email: str, salt: str, password_hash: str, fecha: datetime | None = None) -> dict[str, Any]:
    return {
        "codigoUsuario": _slug_code(email),
        "nombreUsuario": name[:40],
        "correoUsuario": email,
        "tipoUsuario": "registrado",
        "estadoUsuario": "activo",
        "fechaRegistro": fecha or nexum_db.now(),
        "salt": salt,
        "passwordHash": password_hash,
    }


def _insert(user: dict[str, Any]) -> dict[str, Any]:
    try:
        _users().insert_one(user)
    except DuplicateKeyError:
        if _users().find_one({"correoUsuario": user["correoUsuario"]}):
            raise
        user["codigoUsuario"] = f"{user['codigoUsuario'][:58]}-{secrets.token_hex(2)}"
        _users().insert_one(user)
    return user


def seed_users() -> int:
    created = 0
    for seed in _SEED_USERS:
        email = seed["correoUsuario"]
        if _users().find_one({"correoUsuario": email}):
            continue
        salt, password_hash = _hash_password(seed["contrasena"])
        _insert(_new_user(seed["nombreUsuario"], email, salt, password_hash))
        created += 1
    return created


def find_user(identity: str) -> dict[str, Any] | None:
    key = identity.strip().lower()
    if not key:
        return None
    by_email = _users().find_one({"correoUsuario": key, "estadoUsuario": "activo"})
    if by_email:
        return by_email
    pattern = f"^{re.escape(identity.strip())}$"
    return _users().find_one({"nombreUsuario": {"$regex": pattern, "$options": "i"}, "estadoUsuario": "activo"})


def login(identity: str, password: str) -> tuple[bool, str, dict[str, Any] | None]:
    if not ensure_ready():
        return False, UNAVAILABLE, None
    try:
        user = find_user(identity)
    except PyMongoError:
        return False, UNAVAILABLE, None
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
    if not ensure_ready():
        return False, UNAVAILABLE, None
    try:
        if _users().find_one({"correoUsuario": email_n}):
            return False, "Ese correo ya tiene cuenta. Inicia sesion.", None
        salt, password_hash = _hash_password(password)
        user = _insert(_new_user(name_n, email_n, salt, password_hash))
    except DuplicateKeyError:
        return False, "Ese correo ya tiene cuenta. Inicia sesion.", None
    except PyMongoError:
        return False, UNAVAILABLE, None
    return True, "ok", public_user(user)


_seeded = False


def ensure_ready() -> bool:
    global _seeded
    if not nexum_db.ensure_ready():
        return False
    if not _seeded:
        try:
            seed_users()
            _seeded = True
        except PyMongoError:
            return False
    return True
