import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.player import PreferredSide


class UserRole(str, enum.Enum):
    jugador = "jugador"
    operador = "operador"
    admin = "admin"
    superadmin = "superadmin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(220), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    category: Mapped[str | None] = mapped_column(String(80))
    preferred_side: Mapped[PreferredSide | None] = mapped_column(Enum(PreferredSide))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.jugador, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role: Mapped[UserRole] = mapped_column(Enum(UserRole), primary_key=True)
    permissions: Mapped[dict[str, bool]] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
