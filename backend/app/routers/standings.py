from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.player import EventPair
from app.models.standing import Standing
from app.schemas.standings import StandingRead
from app.services import recalculate_standings

router = APIRouter(prefix="/events/{event_id}/standings", tags=["standings"])


@router.post("/recalculate", response_model=list[StandingRead])
def recalculate(event_id: int, db: Session = Depends(get_db)) -> list[Standing]:
    recalculate_standings(db, event_id)
    return _standings(db, event_id)


@router.get("", response_model=list[StandingRead])
def list_standings(event_id: int, db: Session = Depends(get_db)) -> list[Standing]:
    standings = _standings(db, event_id)
    if not standings:
        recalculate_standings(db, event_id)
        standings = _standings(db, event_id)
    return standings


@router.get("/ranking-final", response_model=list[StandingRead])
def final_ranking(event_id: int, db: Session = Depends(get_db)) -> list[Standing]:
    standings = _standings(db, event_id)
    if not standings:
        recalculate_standings(db, event_id)
        standings = _standings(db, event_id)
    return standings[:3]


def _standings(db: Session, event_id: int) -> list[Standing]:
    return list(
        db.scalars(
            select(Standing)
            .where(Standing.event_id == event_id)
            .options(
                selectinload(Standing.pair).selectinload(EventPair.player_one),
                selectinload(Standing.pair).selectinload(EventPair.player_two),
            )
            .order_by(Standing.position)
        )
    )
