from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.payment import Payment
from app.schemas.payments import PaymentCreate, PaymentRead, PaymentUpdate

router = APIRouter(prefix="/events/{event_id}/payments", tags=["payments"])


@router.post("", response_model=PaymentRead, status_code=201)
def create_payment(event_id: int, payload: PaymentCreate, db: Session = Depends(get_db)) -> Payment:
    payment = Payment(event_id=event_id, **payload.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("", response_model=list[PaymentRead])
def list_payments(event_id: int, db: Session = Depends(get_db)) -> list[Payment]:
    return list(db.scalars(select(Payment).where(Payment.event_id == event_id).order_by(Payment.status)))


@router.patch("/{payment_id}", response_model=PaymentRead)
def update_payment(event_id: int, payment_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)) -> Payment:
    payment = db.scalar(select(Payment).where(Payment.id == payment_id, Payment.event_id == event_id))
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, key, value)
    db.commit()
    db.refresh(payment)
    return payment
