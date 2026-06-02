from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.event import Event
from app.models.payment import PaymentStatus, PlayerPayment
from app.models.player import EventPair, PairStatus, Player
from app.schemas.public import PublicRegistrationRequest, PublicRegistrationResponse
from app.services import sync_player_payments

router = APIRouter(prefix="/public", tags=["public"])


@router.post("/events/{event_id}/registrations", response_model=PublicRegistrationResponse, status_code=201)
def register_player(event_id: int, payload: PublicRegistrationRequest, db: Session = Depends(get_db)) -> PublicRegistrationResponse:
    if not db.get(Event, event_id):
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    player_one = Player(
        name=payload.name.strip(),
        phone=payload.phone or None,
        category=payload.category,
        preferred_side=payload.preferred_side,
    )
    db.add(player_one)
    db.flush()

    player_two = None
    if payload.partner_name and payload.partner_name.strip():
        player_two = Player(
            name=payload.partner_name.strip(),
            phone=payload.partner_phone or None,
            category=payload.category,
            preferred_side=payload.partner_preferred_side,
        )
        db.add(player_two)
        db.flush()

    pair = EventPair(
        event_id=event_id,
        player_one_id=player_one.id,
        player_two_id=player_two.id if player_two else None,
        category=payload.category,
        status=PairStatus.completa if player_two else PairStatus.buscando_partner,
    )
    db.add(pair)
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
