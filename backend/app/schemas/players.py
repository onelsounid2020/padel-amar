from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.player import PairStatus, PreferredSide
from app.schemas.common import ORMModel


class PlayerBase(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    category: str
    preferred_side: PreferredSide | None = None


class PlayerCreate(PlayerBase):
    user_id: int | None = None


class PlayerRead(PlayerBase, ORMModel):
    id: int
    user_id: int | None = None
    created_at: datetime


class PairCreate(BaseModel):
    player_one_id: int
    player_two_id: int | None = None
    category: str
    skill_level: int = Field(default=5, ge=1, le=10)
    status: PairStatus = PairStatus.buscando_partner
    seed: int | None = None


class PairUpdate(BaseModel):
    player_one_id: int | None = None
    player_two_id: int | None = None
    category: str | None = None
    skill_level: int | None = Field(default=None, ge=1, le=10)
    status: PairStatus | None = None
    seed: int | None = None


class PairPublicRead(ORMModel):
    id: int
    event_id: int
    player_one_id: int
    player_two_id: int | None
    category: str
    status: PairStatus
    seed: int | None
    created_at: datetime
    player_one: PlayerRead
    player_two: PlayerRead | None = None


class PairRead(PairPublicRead):
    skill_level: int
