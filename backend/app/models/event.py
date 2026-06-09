import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    registration_open = "registration_open"
    registration_closed = "registration_closed"
    live = "live"
    finished = "finished"


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    place: Mapped[str] = mapped_column(String(160), nullable=False)
    categories: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    schedule: Mapped[str] = mapped_column(String(120), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    tournament_type: Mapped[str] = mapped_column(String(80), nullable=False)
    category_configs: Mapped[list[dict]] = mapped_column(JSON, default=list)
    ranking_config: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[EventStatus] = mapped_column(Enum(EventStatus), default=EventStatus.registration_open, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pairs = relationship("EventPair", back_populates="event", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="event", cascade="all, delete-orphan")
    player_payments = relationship("PlayerPayment", back_populates="event", cascade="all, delete-orphan")
    registrations = relationship("EventRegistration", back_populates="event", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="event", cascade="all, delete-orphan")
    standings = relationship("Standing", back_populates="event", cascade="all, delete-orphan")
