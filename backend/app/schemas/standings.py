from __future__ import annotations

from app.schemas.common import ORMModel
from app.schemas.players import PairPublicRead


class StandingRead(ORMModel):
    id: int
    event_id: int
    pair_id: int
    played: int
    won: int
    lost: int
    points_for: int
    points_against: int
    points: int
    position: int | None
    pair: PairPublicRead
