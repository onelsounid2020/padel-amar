import os
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    MODULE_KEYS,
    MODULE_PERMISSIONS,
    check_rate_limit,
    create_token,
    current_user,
    hash_password,
    normalized_permissions,
    require_permission,
    role_permissions,
    verify_password,
)
from app.database import get_db
from app.models.user import RolePermission, User, UserRole
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    ModulePermission,
    PlayerSignup,
    RolePermissionRead,
    RolePermissionUpdate,
    TabletLoginRequest,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = payload.email.lower()
    check_rate_limit(f"login:{email}", limit=8, window_seconds=300)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    return AuthResponse(access_token=create_token(user), user=UserRead.model_validate(user))


@router.post("/tablet-login", response_model=AuthResponse)
def tablet_login(payload: TabletLoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    check_rate_limit("tablet-login", limit=20, window_seconds=300)
    expected_token = os.getenv("TABLET_ACCESS_TOKEN", "")
    received_token = payload.access_token.strip()
    if not expected_token or not received_token or not secrets.compare_digest(received_token, expected_token):
        raise HTTPException(status_code=401, detail="Acceso tablet invalido")

    email = os.getenv("TABLET_USER_EMAIL", "tablet@amarpadel.local").lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            name=os.getenv("TABLET_USER_NAME", "Tablet AMAR"),
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role=UserRole.operador,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.role != UserRole.operador:
        user.role = UserRole.operador
        db.commit()
        db.refresh(user)

    return AuthResponse(access_token=create_token(user), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.post("/register", response_model=AuthResponse, status_code=201)
def register_player(payload: PlayerSignup, db: Session = Depends(get_db)) -> AuthResponse:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=400, detail="Ese email ya existe")
    user = User(
        name=payload.name,
        email=email,
        phone=payload.phone or None,
        category=payload.category or None,
        preferred_side=payload.preferred_side,
        password_hash=hash_password(payload.password),
        role=UserRole.jugador,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthResponse(access_token=create_token(user), user=UserRead.model_validate(user))


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users")),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


@router.get("/permissions/me", response_model=dict[str, bool])
def my_permissions(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, bool]:
    return role_permissions(db, user.role)


@router.get("/permissions/modules", response_model=list[ModulePermission])
def permission_modules(
    _: User = Depends(require_permission("profiles")),
) -> list[dict[str, str]]:
    return MODULE_PERMISSIONS


@router.get("/role-permissions", response_model=list[RolePermissionRead])
def list_role_permissions(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("profiles")),
) -> list[RolePermissionRead]:
    return [
        RolePermissionRead(role=role, permissions=role_permissions(db, role))
        for role in UserRole
    ]


@router.patch("/role-permissions/{role}", response_model=RolePermissionRead)
def update_role_permissions(
    role: UserRole,
    payload: RolePermissionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("profiles")),
) -> RolePermissionRead:
    clean_permissions = {
        key: bool(value)
        for key, value in payload.permissions.items()
        if key in MODULE_KEYS
    }
    permissions = normalized_permissions(clean_permissions, role)
    stored = db.get(RolePermission, role)
    if stored:
        stored.permissions = permissions
    else:
        stored = RolePermission(role=role, permissions=permissions)
        db.add(stored)
    db.commit()
    db.refresh(stored)
    return RolePermissionRead(role=role, permissions=role_permissions(db, role))


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users")),
) -> User:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=400, detail="Ese email ya existe")
    user = User(
        name=payload.name,
        email=email,
        phone=payload.phone or None,
        category=payload.category or None,
        preferred_side=payload.preferred_side,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_permission("users")),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        email = data["email"].lower()
        existing = db.scalar(select(User).where(User.email == email, User.id != user_id))
        if existing:
            raise HTTPException(status_code=400, detail="Ese email ya existe")
        user.email = email
    if "name" in data and data["name"] is not None:
        user.name = data["name"]
    if "phone" in data:
        user.phone = data["phone"] or None
    if "category" in data:
        user.category = data["category"] or None
    if "preferred_side" in data:
        user.preferred_side = data["preferred_side"]
    if data.get("password"):
        user.password_hash = hash_password(data["password"])
    if "role" in data and data["role"] is not None:
        new_role = data["role"]
        if user.id == current.id and user.role == UserRole.superadmin and new_role != UserRole.superadmin:
            raise HTTPException(status_code=400, detail="No puedes quitarte tu propio rol superadmin")
        if user.role == UserRole.superadmin and new_role != UserRole.superadmin:
            superadmin_count = db.scalar(select(func.count(User.id)).where(User.role == UserRole.superadmin))
            if superadmin_count <= 1:
                raise HTTPException(status_code=400, detail="Debe existir al menos un superadmin")
        user.role = new_role

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_permission("users")),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    if user.role == UserRole.superadmin:
        superadmin_count = db.scalar(select(func.count(User.id)).where(User.role == UserRole.superadmin))
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="Debe existir al menos un superadmin")
    db.delete(user)
    db.commit()
