import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.payment import PaymentStatus


class RegistrationRole(str, enum.Enum):
    jugador = "jugador"
    partner = "partner"


class RegistrationStatus(str, enum.Enum):
    confirmada = "confirmada"
    buscando_partner = "buscando_partner"
    lista_espera = "lista_espera"
    cancelada = "cancelada"


class EventRegistration(Base):
    __tablename__ = "event_registrations"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", name="uq_event_registration_player"),
        UniqueConstraint("event_id", "user_id", name="uq_event_registration_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    pair_id: Mapped[int] = mapped_column(ForeignKey("event_pairs.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    role: Mapped[RegistrationRole] = mapped_column(Enum(RegistrationRole), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[RegistrationStatus] = mapped_column(Enum(RegistrationStatus), default=RegistrationStatus.confirmada, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.pendiente, nullable=False)
    source: Mapped[str] = mapped_column(String(40), default="public", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    event = relationship("Event", back_populates="registrations")
    pair = relationship("EventPair", back_populates="registrations")
    player = relationship("Player")
    user = relationship("User")
