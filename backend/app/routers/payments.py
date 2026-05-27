from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.payment import Payment, PlayerPayment
from app.models.player import EventPair
from app.schemas.payments import PaymentCreate, PaymentRead, PaymentUpdate
from app.services import sync_player_payments

router = APIRouter(prefix="/events/{event_id}/payments", tags=["payments"])


@router.post("", response_model=PaymentRead, status_code=201)
def create_payment(event_id: int, payload: PaymentCreate, db: Session = Depends(get_db)) -> Payment:
    payment = Payment(event_id=event_id, **payload.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("", response_model=list[PaymentRead])
def list_payments(event_id: int, db: Session = Depends(get_db)) -> list[PlayerPayment]:
    sync_player_payments(db, event_id)
    return list(
        db.scalars(
            select(PlayerPayment)
            .where(PlayerPayment.event_id == event_id)
            .options(
                selectinload(PlayerPayment.player),
                selectinload(PlayerPayment.pair).selectinload(EventPair.player_one),
                selectinload(PlayerPayment.pair).selectinload(EventPair.player_two),
            )
            .order_by(PlayerPayment.status, PlayerPayment.updated_at.desc())
        )
    )


@router.patch("/{payment_id}", response_model=PaymentRead)
def update_payment(event_id: int, payment_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)) -> PlayerPayment:
    payment = db.scalar(select(PlayerPayment).where(PlayerPayment.id == payment_id, PlayerPayment.event_id == event_id))
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, key, value)
    db.commit()
    return db.scalar(
        select(PlayerPayment)
        .where(PlayerPayment.id == payment_id)
        .options(
            selectinload(PlayerPayment.player),
            selectinload(PlayerPayment.pair).selectinload(EventPair.player_one),
            selectinload(PlayerPayment.pair).selectinload(EventPair.player_two),
        )
    )
