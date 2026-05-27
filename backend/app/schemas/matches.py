from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

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
