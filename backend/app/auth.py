from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import RolePermission, User, UserRole


TOKEN_TTL_HOURS = 12
SEEDED_SUPERADMIN_EMAIL = os.getenv("SEEDED_SUPERADMIN_EMAIL", "onelsounid@gmail.com")
SEEDED_SUPERADMIN_PASSWORD = os.getenv("SEEDED_SUPERADMIN_PASSWORD", "Sounid.com89")

MODULE_PERMISSIONS = [
    {"key": "events", "label": "Eventos", "description": "Crear eventos, editar configuración y organizar parejas."},
    {"key": "register", "label": "Registro", "description": "Ver formulario público de inscripción a eventos."},
    {"key": "results", "label": "Resultados", "description": "Consultar o cargar resultados desde la vista pública."},
    {"key": "tablet", "label": "Tablet", "description": "Usar la mesa de resultados optimizada para cancha."},
    {"key": "users", "label": "Usuarios", "description": "Crear cuentas y asignar roles a jugadores u operadores."},
    {"key": "profiles", "label": "Perfiles", "description": "Configurar qué módulos puede ver cada rol."},
]
MODULE_KEYS = {module["key"] for module in MODULE_PERMISSIONS}
DEFAULT_ROLE_PERMISSIONS = {
    UserRole.jugador: {"events": False, "register": True, "results": True, "tablet": False, "users": False, "profiles": False},
    UserRole.operador: {"events": False, "register": False, "results": True, "tablet": True, "users": False, "profiles": False},
    UserRole.admin: {"events": True, "register": True, "results": True, "tablet": True, "users": True, "profiles": False},
    UserRole.superadmin: {"events": True, "register": True, "results": True, "tablet": True, "users": True, "profiles": True},
}


def _secret() -> bytes:
    return os.getenv("AUTH_SECRET", settings.database_url).encode("utf-8")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        _, salt, digest = stored_hash.split("$", 2)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return hmac.compare_digest(candidate, digest)


def create_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "role": user.role.value,
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)).timestamp()),
    }
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("utf-8").rstrip("=")
    signature = hmac.new(_secret(), body.encode("utf-8"), hashlib.sha256).digest()
    sig = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{body}.{sig}"


def decode_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="Token invalido") from error
    expected = base64.urlsafe_b64encode(hmac.new(_secret(), body.encode("utf-8"), hashlib.sha256).digest()).decode("utf-8").rstrip("=")
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Token invalido")
    padded = body + ("=" * (-len(body) % 4))
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
    if payload.get("exp", 0) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=401, detail="Sesion expirada")
    return payload


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(authorization.removeprefix("Bearer ").strip())
    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def require_roles(*roles: UserRole):
    allowed: set[UserRole] = set(roles)

    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="No tienes permiso para esta accion")
        return user

    return dependency


def require_permission(module_key: str):
    def dependency(db: Session = Depends(get_db), user: User = Depends(current_user)) -> User:
        if user.role == UserRole.superadmin:
            return user
        if not role_permissions(db, user.role).get(module_key, False):
            raise HTTPException(status_code=403, detail="No tienes permiso para este modulo")
        return user

    return dependency


def normalized_permissions(permissions: dict[str, bool] | None, role: UserRole) -> dict[str, bool]:
    defaults = DEFAULT_ROLE_PERMISSIONS[role]
    configured = permissions or {}
    merged = {key: bool(configured.get(key, defaults[key])) for key in MODULE_KEYS}
    if role == UserRole.superadmin:
        merged = {key: True for key in MODULE_KEYS}
    return merged


def role_permissions(db: Session, role: UserRole) -> dict[str, bool]:
    stored = db.get(RolePermission, role)
    return normalized_permissions(stored.permissions if stored else None, role)


def ensure_default_role_permissions(db: Session) -> None:
    changed = False
    for role in UserRole:
        if db.get(RolePermission, role):
            continue
        db.add(RolePermission(role=role, permissions=DEFAULT_ROLE_PERMISSIONS[role]))
        changed = True
    if changed:
        db.commit()


def ensure_default_admin(db: Session) -> None:
    ensure_default_role_permissions(db)
    ensure_seeded_superadmin(db)
    has_users = db.scalar(select(User.id).limit(1))
    if has_users:
        return
    admin = User(
        name="Admin",
        email=os.getenv("ADMIN_EMAIL", "admin@amarpadel.local").lower(),
        password_hash=hash_password(os.getenv("ADMIN_PASSWORD", "admin123")),
        role=UserRole.superadmin,
    )
    db.add(admin)
    db.commit()


def ensure_seeded_superadmin(db: Session) -> None:
    email = SEEDED_SUPERADMIN_EMAIL.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user:
        user.role = UserRole.superadmin
        user.password_hash = hash_password(SEEDED_SUPERADMIN_PASSWORD)
    else:
        user = User(
            name="Onel Sounid",
            email=email,
            password_hash=hash_password(SEEDED_SUPERADMIN_PASSWORD),
            role=UserRole.superadmin,
        )
        db.add(user)
    db.commit()
