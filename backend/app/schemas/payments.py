from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.payment import PaymentStatus
from app.schemas.common import ORMModel


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
    pair_id: int
    amount: int
    status: PaymentStatus
    updated_at: datetime
