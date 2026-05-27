from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    pair_one_id: Mapped[int] = mapped_column(ForeignKey("event_pairs.id"), nullable=False)
    pair_two_id: Mapped[int] = mapped_column(ForeignKey("event_pairs.id"), nullable=False)
    round_name: Mapped[str] = mapped_column(String(80), default="Grupo")
    court: Mapped[str | None] = mapped_column(String(40))
    pair_one_score: Mapped[int | None] = mapped_column(Integer)
    pair_two_score: Mapped[int | None] = mapped_column(Integer)
    winner_pair_id: Mapped[int | None] = mapped_column(ForeignKey("event_pairs.id"))
    played_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event = relationship("Event", back_populates="matches")
    pair_one = relationship("EventPair", foreign_keys=[pair_one_id])
    pair_two = relationship("EventPair", foreign_keys=[pair_two_id])
    winner_pair = relationship("EventPair", foreign_keys=[winner_pair_id])
