from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.event import Event
from app.models.payment import PaymentStatus, PlayerPayment
from app.models.player import EventPair, PairStatus, Player
from app.models.registration import EventRegistration, RegistrationRole, RegistrationStatus
from app.models.user import User, UserRole
from app.schemas.public import PublicMemberRead, PublicRegistrationRequest, PublicRegistrationResponse
from app.services import sync_player_payments

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/members", response_model=list[PublicMemberRead])
def list_members(db: Session = Depends(get_db)) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.jugador)
            .order_by(User.name)
        )
    )


@router.post("/events/{event_id}/registrations", response_model=PublicRegistrationResponse, status_code=201)
def register_player(event_id: int, payload: PublicRegistrationRequest, db: Session = Depends(get_db)) -> PublicRegistrationResponse:
    if not db.get(Event, event_id):
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    player_one = _player_for_registration(
        db,
        user_id=payload.player_user_id,
        name=payload.name,
        phone=payload.phone,
        category=payload.category,
        preferred_side=payload.preferred_side,
    )
    _ensure_not_registered(db, event_id, player_one)

    player_two = None
    if payload.partner_user_id or (payload.partner_name and payload.partner_name.strip()):
        if payload.partner_user_id and payload.partner_user_id == payload.player_user_id:
            raise HTTPException(status_code=400, detail="El partner no puede ser el mismo jugador")
        player_two = _player_for_registration(
            db,
            user_id=payload.partner_user_id,
            name=payload.partner_name or "",
            phone=payload.partner_phone,
            category=payload.category,
            preferred_side=payload.partner_preferred_side,
        )
        _ensure_not_registered(db, event_id, player_two)

    pair = EventPair(
        event_id=event_id,
        player_one_id=player_one.id,
        player_two_id=player_two.id if player_two else None,
        category=payload.category,
        status=PairStatus.completa if player_two else PairStatus.buscando_partner,
    )
    db.add(pair)
    db.flush()
    _add_registration(
        db,
        event_id=event_id,
        pair_id=pair.id,
        player=player_one,
        role=RegistrationRole.jugador,
        category=payload.category,
        status=RegistrationStatus.confirmada if player_two else RegistrationStatus.buscando_partner,
        payment_status=PaymentStatus.pagado if payload.paid else PaymentStatus.pendiente,
    )
    if player_two:
        _add_registration(
            db,
            event_id=event_id,
            pair_id=pair.id,
            player=player_two,
            role=RegistrationRole.partner,
            category=payload.category,
            status=RegistrationStatus.confirmada,
            payment_status=PaymentStatus.pagado if payload.partner_paid else PaymentStatus.pendiente,
        )
    db.commit()
    db.refresh(pair)

    payments = sync_player_payments(db, event_id)
    payment_updates = [
        payload.paid and next((payment for payment in payments if payment.pair_id == pair.id and payment.player_id == player_one.id), None),
        player_two and payload.partner_paid and next((payment for payment in payments if payment.pair_id == pair.id and payment.player_id == player_two.id), None),
    ]
    for payment in filter(None, payment_updates):
        payment.status = PaymentStatus.pagado
    db.commit()

    pair = db.scalar(select(EventPair).where(EventPair.id == pair.id))
    return PublicRegistrationResponse(pair=pair)


def _player_for_registration(
    db: Session,
    *,
    user_id: int | None,
    name: str,
    phone: str | None,
    category: str,
    preferred_side,
) -> Player:
    if user_id:
        user = db.get(User, user_id)
        if not user or user.role != UserRole.jugador:
            raise HTTPException(status_code=404, detail="Miembro no encontrado")
        player = db.scalar(select(Player).where(Player.user_id == user.id))
        if player:
            player.name = user.name
            player.phone = user.phone or phone or None
            player.category = category
            player.preferred_side = user.preferred_side or preferred_side
            db.flush()
            return player
        player = Player(
            user_id=user.id,
            name=user.name,
            phone=user.phone or phone or None,
            category=category,
            preferred_side=user.preferred_side or preferred_side,
        )
    else:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Falta el nombre del jugador")
        player = Player(
            name=name.strip(),
            phone=phone or None,
            category=category,
            preferred_side=preferred_side,
        )
    db.add(player)
    db.flush()
    return player


def _ensure_not_registered(db: Session, event_id: int, player: Player) -> None:
    existing_pair = db.scalar(
        select(EventPair).where(
            EventPair.event_id == event_id,
            (EventPair.player_one_id == player.id) | (EventPair.player_two_id == player.id),
        )
    )
    if existing_pair:
        raise HTTPException(status_code=400, detail=f"{player.name} ya esta inscrito en este evento")


def _add_registration(
    db: Session,
    *,
    event_id: int,
    pair_id: int,
    player: Player,
    role: RegistrationRole,
    category: str,
    status: RegistrationStatus,
    payment_status: PaymentStatus,
) -> EventRegistration:
    registration = EventRegistration(
        event_id=event_id,
        pair_id=pair_id,
        player_id=player.id,
        user_id=player.user_id,
        role=role,
        category=category,
        status=status,
        payment_status=payment_status,
        source="public",
    )
    db.add(registration)
    return registration
