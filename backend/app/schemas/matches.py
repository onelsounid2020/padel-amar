from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.result_submission import ResultSubmissionStatus
from app.schemas.common import ORMModel


class MatchCreate(BaseModel):
    pair_one_id: int
    pair_two_id: int
    round_name: str = "Grupo"
    court: str | None = None
    played_at: datetime | None = None


class MatchResultUpdate(BaseModel):
    pair_one_score: int
    pair_two_score: int
    played_at: datetime | None = None


class ResultSubmissionCreate(BaseModel):
    pair_one_score: int
    pair_two_score: int
    note: str | None = None


class MatchRead(ORMModel):
    id: int
    event_id: int
    pair_one_id: int
    pair_two_id: int
    round_name: str
    court: str | None
    pair_one_score: int | None
    pair_two_score: int | None
    winner_pair_id: int | None
    played_at: datetime | None
    created_at: datetime


class ResultSubmissionRead(ORMModel):
    id: int
    event_id: int
    match_id: int
    submitted_by_user_id: int
    pair_one_score: int
    pair_two_score: int
    status: ResultSubmissionStatus
    note: str | None
    created_at: datetime
    updated_at: datetime
