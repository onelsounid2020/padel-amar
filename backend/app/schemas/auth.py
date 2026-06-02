from datetime import datetime

from pydantic import BaseModel

from app.models.player import PreferredSide
from app.models.user import UserRole
from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole = UserRole.jugador
    phone: str | None = None
    category: str | None = None
    preferred_side: PreferredSide | None = PreferredSide.indiferente


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    role: UserRole | None = None
    phone: str | None = None
    category: str | None = None
    preferred_side: PreferredSide | None = None


class PlayerSignup(BaseModel):
    name: str
    email: str
    password: str
    phone: str | None = None
    category: str | None = None
    preferred_side: PreferredSide | None = PreferredSide.indiferente


class UserRead(ORMModel):
    id: int
    name: str
    email: str
    phone: str | None = None
    category: str | None = None
    preferred_side: PreferredSide | None = None
    role: UserRole
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    user: UserRead


class ModulePermission(BaseModel):
    key: str
    label: str
    description: str


class RolePermissionRead(ORMModel):
    role: UserRole
    permissions: dict[str, bool]


class RolePermissionUpdate(BaseModel):
    permissions: dict[str, bool]
