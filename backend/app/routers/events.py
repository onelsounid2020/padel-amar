from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth import require_permission
from app.database import get_db
from app.models.event import Event
from app.models.match import Match
from app.models.payment import PlayerPayment, PaymentStatus
from app.models.player import EventPair, PairStatus
from app.models.user import User
from app.schemas.events import DashboardEvent, EventCreate, EventRead, EventUpdate
from app.services import format_pair, sync_player_payments

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventRead, status_code=201)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> Event:
    event = Event(**payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db)) -> list[Event]:
    return list(db.scalars(select(Event).order_by(Event.date.desc())))


@router.get("/dashboard", response_model=list[DashboardEvent])
def dashboard(db: Session = Depends(get_db)) -> list[DashboardEvent]:
    events = db.scalars(select(Event).where(Event.is_active.is_(True)).order_by(Event.date)).all()
    result = []
    for event in events:
        registered = db.scalar(
            select(func.count(EventPair.id)).where(
                EventPair.event_id == event.id,
                EventPair.status != PairStatus.lista_espera,
            )
        ) or 0
        sync_player_payments(db, event.id)
        pending = db.scalar(
            select(func.count(PlayerPayment.id)).where(
                PlayerPayment.event_id == event.id,
                PlayerPayment.status != PaymentStatus.pagado,
            )
        ) or 0
        completed = db.scalar(
            select(func.count(Match.id)).where(
                Match.event_id == event.id,
                Match.pair_one_score.is_not(None),
                Match.pair_two_score.is_not(None),
            )
        ) or 0
        data = EventRead.model_validate(event).model_dump()
        data.update(
            registered_pairs=registered,
            available_spots=max(event.capacity - registered, 0),
            pending_payments=pending,
            completed_matches=completed,
        )
        result.append(DashboardEvent(**data))
    return result


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: int, db: Session = Depends(get_db)) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return event


@router.patch("/{event_id}", response_model=EventRead)
def update_event(
    event_id: int,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> None:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    db.delete(event)
    db.commit()


@router.get("/{event_id}/whatsapp")
def whatsapp_text(event_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    pairs = db.scalars(
        select(EventPair)
        .where(EventPair.event_id == event_id)
        .options(selectinload(EventPair.player_one), selectinload(EventPair.player_two))
        .order_by(EventPair.seed.is_(None), EventPair.seed, EventPair.created_at)
    ).all()
    sync_player_payments(db, event_id)
    pending = db.scalars(select(PlayerPayment).where(PlayerPayment.event_id == event_id, PlayerPayment.status != PaymentStatus.pagado)).all()
    matches = db.scalars(select(Match).where(Match.event_id == event_id, Match.winner_pair_id.is_not(None))).all()

    active_pairs = [pair for pair in pairs if pair.status != PairStatus.lista_espera]
    waitlist = [pair for pair in pairs if pair.status == PairStatus.lista_espera]
    lines = [
        f"*{event.name}*",
        f"Fecha: {event.date.strftime('%d-%m-%Y')}",
        f"Lugar: {event.place}",
        f"Categorias: {event.categories}",
        f"Horario: {event.schedule}",
        f"Precio: ${event.price}",
        "",
        "*Inscritos*",
        *[f"- {format_pair(pair)}" for pair in active_pairs],
        "",
        "*Pagos pendientes/abonados*",
        *(
            [
                f"- {payment.player.name}: {payment.status.value}"
                for payment in pending
                if payment.player is not None
            ]
            or ["- Sin pagos pendientes"]
        ),
        "",
        "*Lista de espera*",
        *([f"- {format_pair(pair)}" for pair in waitlist] or ["- Sin lista de espera"]),
        "",
        "*Resultados finales*",
        *(
            [
                f"- Partido {match.id}: pareja {match.pair_one_id} {match.pair_one_score}-{match.pair_two_score} pareja {match.pair_two_id}"
                for match in matches
            ]
            or ["- Sin resultados registrados"]
        ),
    ]
    return {"text": "\n".join(lines)}
