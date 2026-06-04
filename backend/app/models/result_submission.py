import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ResultSubmissionStatus(str, enum.Enum):
    pendiente = "pendiente"
    confirmado = "confirmado"
    conflicto = "conflicto"
    descartado = "descartado"


class MatchResultSubmission(Base):
    __tablename__ = "match_result_submissions"
    __table_args__ = (UniqueConstraint("match_id", "submitted_by_user_id", name="uq_result_submission_match_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True)
    submitted_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    pair_one_score: Mapped[int] = mapped_column(Integer, nullable=False)
    pair_two_score: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ResultSubmissionStatus] = mapped_column(Enum(ResultSubmissionStatus), default=ResultSubmissionStatus.pendiente, nullable=False)
    note: Mapped[str | None] = mapped_column(String(240))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    match = relationship("Match", back_populates="result_submissions")
    submitted_by = relationship("User")
