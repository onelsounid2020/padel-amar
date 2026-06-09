from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import current_user
from app.database import get_db
from app.models.event import Event
from app.models.payment import PaymentStatus, PlayerPayment
from app.models.player import EventPair, PairStatus, Player
from app.registration_guard import (
    ensure_different_players,
    ensure_not_registered,
    normalize_email,
    normalize_phone,
    primary_identity_key,
    validate_email,
)
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
def register_player(
    event_id: int,
    payload: PublicRegistrationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PublicRegistrationResponse:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    if user.role != UserRole.jugador:
        raise HTTPException(status_code=403, detail="Debes entrar con una cuenta de jugador para inscribirte")
    if payload.player_user_id and payload.player_user_id != user.id:
        raise HTTPException(status_code=403, detail="No puedes inscribir a otro jugador desde esta cuenta")
    if payload.partner_name and payload.partner_name.strip() and not payload.partner_user_id:
        raise HTTPException(status_code=400, detail="El partner debe tener cuenta de jugador")

    player_one = _player_for_registration(
        db,
        user_id=user.id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        category=payload.category,
        preferred_side=payload.preferred_side,
    )
    ensure_not_registered(db, event_id, player_one)

    player_two = None
    if payload.partner_user_id or (payload.partner_name and payload.partner_name.strip()):
        if payload.partner_user_id and payload.partner_user_id == payload.player_user_id:
            raise HTTPException(status_code=400, detail="El partner no puede ser el mismo jugador")
        player_two = _player_for_registration(
            db,
            user_id=payload.partner_user_id,
            name=payload.partner_name or "",
            email=payload.partner_email,
            phone=payload.partner_phone,
            category=payload.category,
            preferred_side=payload.partner_preferred_side,
        )
        ensure_different_players(player_one, player_two)
        ensure_not_registered(db, event_id, player_two)

    active_pairs = db.scalar(
        select(func.count(EventPair.id)).where(
            EventPair.event_id == event_id,
            EventPair.status != PairStatus.lista_espera,
        )
    ) or 0
    is_waitlist = active_pairs >= event.capacity
    pair_status = (
        PairStatus.lista_espera
        if is_waitlist
        else PairStatus.completa if player_two else PairStatus.buscando_partner
    )
    primary_registration_status = (
        RegistrationStatus.lista_espera
        if is_waitlist
        else RegistrationStatus.confirmada if player_two else RegistrationStatus.buscando_partner
    )
    partner_registration_status = RegistrationStatus.lista_espera if is_waitlist else RegistrationStatus.confirmada

    pair = EventPair(
        event_id=event_id,
        player_one_id=player_one.id,
        player_two_id=player_two.id if player_two else None,
        category=payload.category,
        status=pair_status,
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
        status=primary_registration_status,
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
            status=partner_registration_status,
            payment_status=PaymentStatus.pagado if payload.partner_paid else PaymentStatus.pendiente,
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Uno de los jugadores ya esta inscrito en este evento") from exc
    db.refresh(pair)

    payments = sync_player_payments(db, event_id)
    payment_updates = [
        payload.paid and next((payment for payment in payments if payment.pair_id == pair.id and payment.player_id == player_one.id), None),
        player_two and payload.partner_paid and next((payment for payment in payments if payment.pair_id == pair.id and payment.player_id == player_two.id), None),
    ]
    for payment in filter(None, payment_updates):
        payment.status = PaymentStatus.pagado
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Uno de los jugadores ya esta inscrito en este evento") from exc

    pair = db.scalar(select(EventPair).where(EventPair.id == pair.id))
    return PublicRegistrationResponse(pair=pair)


@router.post("/events/{event_id}/pairs/{pair_id}/join", response_model=PublicRegistrationResponse)
def join_pair(
    event_id: int,
    pair_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PublicRegistrationResponse:
    if user.role != UserRole.jugador:
        raise HTTPException(status_code=403, detail="Debes entrar con una cuenta de jugador para unirte como partner")
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    pair = db.scalar(select(EventPair).where(EventPair.id == pair_id, EventPair.event_id == event_id))
    if not pair:
        raise HTTPException(status_code=404, detail="Pareja no encontrada")
    if pair.status != PairStatus.buscando_partner or pair.player_two_id:
        raise HTTPException(status_code=400, detail="Esta pareja ya no esta buscando partner")

    partner = _player_for_registration(
        db,
        user_id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        category=pair.category,
        preferred_side=user.preferred_side,
    )
    player_one = db.get(Player, pair.player_one_id)
    ensure_different_players(player_one, partner)
    ensure_not_registered(db, event_id, partner)

    pair.player_two_id = partner.id
    pair.status = PairStatus.completa
    _add_registration(
        db,
        event_id=event_id,
        pair_id=pair.id,
        player=partner,
        role=RegistrationRole.partner,
        category=pair.category,
        status=RegistrationStatus.confirmada,
        payment_status=PaymentStatus.pendiente,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya estas inscrito en este evento") from exc
    sync_player_payments(db, event_id)
    pair = db.scalar(select(EventPair).where(EventPair.id == pair.id))
    return PublicRegistrationResponse(pair=pair)


def _player_for_registration(
    db: Session,
    *,
    user_id: int | None,
    name: str,
    email: str | None,
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
            player.email = user.email
            player.phone = user.phone or phone or None
            player.category = category
            player.preferred_side = user.preferred_side or preferred_side
            db.flush()
            return player
        player = Player(
            user_id=user.id,
            name=user.name,
            email=user.email,
            phone=user.phone or phone or None,
            category=category,
            preferred_side=user.preferred_side or preferred_side,
        )
    else:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Falta el nombre del jugador")
        normalized_email = validate_email(email, field_name="email del jugador")
        player = _find_existing_guest_player(db, email=email, phone=phone)
        if player:
            player.name = name.strip()
            player.email = normalized_email
            player.phone = phone or player.phone
            player.category = category
            player.preferred_side = preferred_side
            db.flush()
            return player
        player = Player(
            name=name.strip(),
            email=normalized_email,
            phone=phone or None,
            category=category,
            preferred_side=preferred_side,
        )
    db.add(player)
    db.flush()
    return player


def _find_existing_guest_player(db: Session, *, email: str | None, phone: str | None) -> Player | None:
    normalized_email = normalize_email(email)
    if normalized_email:
        player = db.scalar(select(Player).where(Player.user_id.is_(None), Player.email == normalized_email))
        if player:
            return player
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        return None
    players = db.scalars(select(Player).where(Player.user_id.is_(None), Player.phone.is_not(None))).all()
    return next((player for player in players if normalize_phone(player.phone) == normalized_phone), None)


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
        identity_key=primary_identity_key(player),
        role=role,
        category=category,
        status=status,
        payment_status=payment_status,
        source="public",
    )
    db.add(registration)
    return registration
