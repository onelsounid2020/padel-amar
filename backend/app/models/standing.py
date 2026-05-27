from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Standing(Base):
    __tablename__ = "standings"
    __table_args__ = (UniqueConstraint("event_id", "pair_id", name="uq_standings_event_pair"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    pair_id: Mapped[int] = mapped_column(ForeignKey("event_pairs.id", ondelete="CASCADE"), nullable=False)
    played: Mapped[int] = mapped_column(Integer, default=0)
    won: Mapped[int] = mapped_column(Integer, default=0)
    lost: Mapped[int] = mapped_column(Integer, default=0)
    points_for: Mapped[int] = mapped_column(Integer, default=0)
    points_against: Mapped[int] = mapped_column(Integer, default=0)
    points: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int | None] = mapped_column(Integer)

    event = relationship("Event", back_populates="standings")
    pair = relationship("EventPair", back_populates="standings")
