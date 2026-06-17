from __future__ import annotations

from datetime import date as DateType, datetime

from pydantic import BaseModel, Field

from app.models.event import EventStatus, EventType
from app.models.payment import PaymentStatus
from app.models.registration import RegistrationRole, RegistrationStatus
from app.schemas.common import ORMModel
from app.schemas.players import PairPublicRead, PlayerRead


class EventBase(BaseModel):
    name: str
    date: DateType
    place: str
    categories: str
    price: int = Field(ge=0)
    schedule: str
    capacity: int = Field(gt=0)
    tournament_type: str
    event_type: EventType = EventType.hombres
    category_configs: list[dict] = Field(default_factory=list)
    ranking_config: dict = Field(default_factory=dict)
    fixture_config: dict = Field(default_factory=dict)
    description: str | None = None
    status: EventStatus = EventStatus.registration_open
    is_active: bool = True
    fixture_visible: bool = False


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: str | None = None
    date: DateType | None = None
    place: str | None = None
    categories: str | None = None
    price: int | None = Field(default=None, ge=0)
    schedule: str | None = None
    capacity: int | None = Field(default=None, gt=0)
    tournament_type: str | None = None
    event_type: EventType | None = None
    category_configs: list[dict] | None = None
    ranking_config: dict | None = None
    fixture_config: dict | None = None
    description: str | None = None
    status: EventStatus | None = None
    is_active: bool | None = None
    fixture_visible: bool | None = None


class EventRead(EventBase, ORMModel):
    id: int
    created_at: datetime


class DashboardEvent(EventRead):
    registered_pairs: int
    available_spots: int
    pending_payments: int
    completed_matches: int


class EventRegistrationRead(ORMModel):
    id: int
    event_id: int
    pair_id: int
    player_id: int
    user_id: int | None
    role: RegistrationRole
    category: str
    status: RegistrationStatus
    payment_status: PaymentStatus
    checked_in: bool
    source: str
    created_at: datetime
    updated_at: datetime
    player: PlayerRead
    pair: PairPublicRead


class EventRegistrationUpdate(BaseModel):
    checked_in: bool | None = None
    status: RegistrationStatus | None = None
