from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth import require_permission
from app.database import get_db
from app.models.event import Event
from app.models.match import Match
from app.models.payment import Payment
from app.models.standing import Standing
from app.models.player import EventPair, PairStatus, Player
from app.registration_guard import ensure_different_players, ensure_not_registered
from app.models.user import User
from app.schemas.players import PairCreate, PairRead, PairUpdate
from app.services import recalculate_standings

router = APIRouter(prefix="/events/{event_id}/pairs", tags=["pairs"])


@router.post("", response_model=PairRead, status_code=201)
def create_pair(
    event_id: int,
    payload: PairCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> EventPair:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    player_one = db.get(Player, payload.player_one_id)
    if not player_one:
        raise HTTPException(status_code=404, detail="Jugador 1 no encontrado")
    player_two = None
    if payload.player_two_id:
        player_two = db.get(Player, payload.player_two_id)
        if not player_two:
            raise HTTPException(status_code=404, detail="Jugador 2 no encontrado")
    ensure_different_players(player_one, player_two)
    ensure_not_registered(db, event_id, player_one)
    if player_two:
        ensure_not_registered(db, event_id, player_two)

    data = payload.model_dump()
    data["status"] = _status_with_capacity_guard(db, event, data["status"])
    pair = EventPair(event_id=event_id, **data)
    db.add(pair)
    db.flush()
    _sync_legacy_pair_payment(db, pair)
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
def update_pair(
    event_id: int,
    pair_id: int,
    payload: PairUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> EventPair:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    pair = db.scalar(select(EventPair).where(EventPair.id == pair_id, EventPair.event_id == event_id))
    if not pair:
        raise HTTPException(status_code=404, detail="Pareja no encontrada")
    data = payload.model_dump(exclude_unset=True)
    next_player_one = db.get(Player, data.get("player_one_id", pair.player_one_id))
    next_player_two_id = data.get("player_two_id", pair.player_two_id)
    next_player_two = db.get(Player, next_player_two_id) if next_player_two_id else None
    if not next_player_one:
        raise HTTPException(status_code=404, detail="Jugador 1 no encontrado")
    if next_player_two_id and not next_player_two:
        raise HTTPException(status_code=404, detail="Jugador 2 no encontrado")
    ensure_different_players(next_player_one, next_player_two)
    ensure_not_registered(db, event_id, next_player_one, exclude_pair_id=pair_id)
    if next_player_two:
        ensure_not_registered(db, event_id, next_player_two, exclude_pair_id=pair_id)
    if "status" in data:
        data["status"] = _status_with_capacity_guard(db, event, data["status"], exclude_pair_id=pair_id)
    for key, value in data.items():
        setattr(pair, key, value)
    db.flush()
    _sync_legacy_pair_payment(db, pair)
    db.commit()
    return _get_pair(db, pair_id)


@router.delete("/{pair_id}", status_code=204)
def delete_pair(
    event_id: int,
    pair_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> None:
    pair = db.scalar(select(EventPair).where(EventPair.id == pair_id, EventPair.event_id == event_id))
    if not pair:
        raise HTTPException(status_code=404, detail="Pareja no encontrada")

    db.execute(
        delete(Match).where(
            Match.event_id == event_id,
            or_(
                Match.pair_one_id == pair_id,
                Match.pair_two_id == pair_id,
                Match.winner_pair_id == pair_id,
            ),
        )
    )
    db.execute(delete(Standing).where(Standing.event_id == event_id, Standing.pair_id == pair_id))
    db.delete(pair)
    db.commit()
    recalculate_standings(db, event_id)


def _get_pair(db: Session, pair_id: int) -> EventPair:
    pair = db.scalar(
        select(EventPair)
        .where(EventPair.id == pair_id)
        .options(selectinload(EventPair.player_one), selectinload(EventPair.player_two))
    )
    if not pair:
        raise HTTPException(status_code=404, detail="Pareja no encontrada")
    return pair


def _status_with_capacity_guard(
    db: Session,
    event: Event,
    status: PairStatus,
    *,
    exclude_pair_id: int | None = None,
) -> PairStatus:
    if status == PairStatus.lista_espera:
        return status
    active_count = db.scalar(
        select(func.count(EventPair.id))
        .where(EventPair.event_id == event.id)
        .where(EventPair.status != PairStatus.lista_espera)
        .where(EventPair.id != exclude_pair_id if exclude_pair_id else True)
    ) or 0
    if active_count >= event.capacity:
        return PairStatus.lista_espera
    return status


def _sync_legacy_pair_payment(db: Session, pair: EventPair) -> None:
    existing = db.scalar(select(Payment).where(Payment.event_id == pair.event_id, Payment.pair_id == pair.id))
    if pair.status == PairStatus.lista_espera:
        if existing:
            db.delete(existing)
        return
    if not existing:
        db.add(Payment(event_id=pair.event_id, pair_id=pair.id))
