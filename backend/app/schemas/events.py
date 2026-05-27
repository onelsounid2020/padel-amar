from __future__ import annotations

from datetime import date as DateType, datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class EventBase(BaseModel):
    name: str
    date: DateType
    place: str
    categories: str
    price: int
    schedule: str
    capacity: int
    tournament_type: str
    description: str | None = None
    is_active: bool = True


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: str | None = None
    date: DateType | None = None
    place: str | None = None
    categories: str | None = None
    price: int | None = None
    schedule: str | None = None
    capacity: int | None = None
    tournament_type: str | None = None
    description: str | None = None
    is_active: bool | None = None


class EventRead(EventBase, ORMModel):
    id: int
    created_at: datetime


class DashboardEvent(EventRead):
    registered_pairs: int
    available_spots: int
    pending_payments: int
    completed_matches: int
