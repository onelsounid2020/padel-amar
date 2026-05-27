from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.event import Event
from app.models.payment import Payment
from app.models.player import EventPair, Player
from app.schemas.players import PairCreate, PairRead, PairUpdate

router = APIRouter(prefix="/events/{event_id}/pairs", tags=["pairs"])


@router.post("", response_model=PairRead, status_code=201)
def create_pair(event_id: int, payload: PairCreate, db: Session = Depends(get_db)) -> EventPair:
    if not db.get(Event, event_id):
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    if not db.get(Player, payload.player_one_id):
        raise HTTPException(status_code=404, detail="Jugador 1 no encontrado")
    if payload.player_two_id and not db.get(Player, payload.player_two_id):
        raise HTTPException(status_code=404, detail="Jugador 2 no encontrado")

    pair = EventPair(event_id=event_id, **payload.model_dump())
    db.add(pair)
    db.flush()
    db.add(Payment(event_id=event_id, pair_id=pair.id))
    db.commit()
    return _get_pair(db, pair.id)


@router.get("", response_model=list[PairRead])
def list_pairs(event_id: int, db: Session = Depends(get_db)) -> list[EventPair]:
    return list(
        db.scalars(
            select(EventPair)
            .where(EventPair.event_id == event_id)
            .options(selectinload(EventPair.player_one), selectinload(EventPair.player_two))
            .order_by(EventPair.seed.is_(None), EventPair.seed, EventPair.created_at)
        )
    )


@router.patch("/{pair_id}", response_model=PairRead)
def update_pair(event_id: int, pair_id: int, payload: PairUpdate, db: Session = Depends(get_db)) -> EventPair:
    pair = db.scalar(select(EventPair).where(EventPair.id == pair_id, EventPair.event_id == event_id))
    if not pair:
        raise HTTPException(status_code=404, detail="Pareja no encontrada")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(pair, key, value)
    db.commit()
    return _get_pair(db, pair_id)


def _get_pair(db: Session, pair_id: int) -> EventPair:
    pair = db.scalar(
        select(EventPair)
        .where(EventPair.id == pair_id)
        .options(selectinload(EventPair.player_one), selectinload(EventPair.player_two))
    )
    if not pair:
        raise HTTPException(status_code=404, detail="Pareja no encontrada")
    return pair
