import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PreferredSide(str, enum.Enum):
    drive = "drive"
    reves = "reves"
    indiferente = "indiferente"


class PairStatus(str, enum.Enum):
    completa = "completa"
    buscando_partner = "buscando_partner"
    lista_espera = "lista_espera"


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    preferred_side: Mapped[PreferredSide | None] = mapped_column(Enum(PreferredSide))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pairs_as_player_one = relationship("EventPair", back_populates="player_one", foreign_keys="EventPair.player_one_id")
    pairs_as_player_two = relationship("EventPair", back_populates="player_two", foreign_keys="EventPair.player_two_id")
    payments = relationship("PlayerPayment", back_populates="player", cascade="all, delete-orphan")


class EventPair(Base):
    __tablename__ = "event_pairs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    player_one_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    player_two_id: Mapped[int | None] = mapped_column(ForeignKey("players.id"))
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[PairStatus] = mapped_column(Enum(PairStatus), default=PairStatus.buscando_partner)
    seed: Mapped[int | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event = relationship("Event", back_populates="pairs")
    player_one = relationship("Player", foreign_keys=[player_one_id], back_populates="pairs_as_player_one")
    player_two = relationship("Player", foreign_keys=[player_two_id], back_populates="pairs_as_player_two")
    payments = relationship("Payment", back_populates="pair", cascade="all, delete-orphan")
    player_payments = relationship("PlayerPayment", back_populates="pair", cascade="all, delete-orphan")
    standings = relationship("Standing", back_populates="pair", cascade="all, delete-orphan")
