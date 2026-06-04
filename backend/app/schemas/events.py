from __future__ import annotations

from datetime import date as DateType, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class EventBase(BaseModel):
    name: str
    date: DateType
    place: str
    categories: str
    price: int = Field(ge=0)
    schedule: str
    capacity: int = Field(gt=0)
    tournament_type: str
    category_configs: list[dict] = Field(default_factory=list)
    ranking_config: dict = Field(default_factory=dict)
    description: str | None = None
    is_active: bool = True


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
    category_configs: list[dict] | None = None
    ranking_config: dict | None = None
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
