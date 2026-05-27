from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.payment import PaymentStatus
from app.schemas.common import ORMModel
from app.schemas.players import PairRead, PlayerRead


class PaymentCreate(BaseModel):
    pair_id: int
    amount: int = 0
    status: PaymentStatus = PaymentStatus.pendiente


class PaymentUpdate(BaseModel):
    amount: int | None = None
    status: PaymentStatus | None = None


class PaymentRead(ORMModel):
    id: int
    event_id: int
    pair_id: int | None = None
    player_id: int | None = None
    amount: int
    status: PaymentStatus
    updated_at: datetime
    pair: PairRead | None = None
    player: PlayerRead | None = None
