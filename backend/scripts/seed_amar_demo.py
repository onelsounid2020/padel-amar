from datetime import date
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Event, EventPair, Payment, Player
from app.models.payment import PaymentStatus
from app.models.player import PairStatus, PreferredSide


EVENT_NAME = "Americano Mixto Amistoso (AMAR) Miercoles"
EVENT_DATE = date(2026, 5, 27)


pairs = [
    ("Cris Z", "Pauli", "pendiente", PairStatus.completa, None),
    ("Nathy", "Jaime", "pendiente", PairStatus.completa, None),
    ("Arturo", "Dani", "abonado", PairStatus.completa, None),
    ("Mati", None, "pendiente", PairStatus.buscando_partner, None),
    ("Isa", "Ricardo", "pendiente", PairStatus.completa, None),
    ("Caro", "Alfonso", "pendiente", PairStatus.completa, None),
    ("Lizza", "Pato", "pendiente", PairStatus.completa, None),
    ("Pia", "Edu C.", "pendiente", PairStatus.completa, None),
    ("Ale M", "Rodrigo", "pendiente", PairStatus.completa, None),
    ("Fran", "Checho", "pendiente", PairStatus.completa, None),
    ("Eduardo B", "Jackie", "pendiente", PairStatus.completa, None),
    ("Dani", "Pedro", "pendiente", PairStatus.completa, None),
    ("Carla", "Pato", "pendiente", PairStatus.completa, None),
    ("Jose", "Monse", "pagado", PairStatus.completa, None),
    ("Vero", "Onel", "abonado", PairStatus.completa, None),
    ("Lya", "Tano", "abonado", PairStatus.completa, None),
    ("M. Angelica", None, "pendiente", PairStatus.buscando_partner, PreferredSide.reves),
    ("Maca", "Pablo", "abonado", PairStatus.completa, None),
    ("Tita", None, "pendiente", PairStatus.lista_espera, None),
    ("Patricio R", None, "pendiente", PairStatus.lista_espera, None),
]


def get_or_create_player(db, name: str, side: PreferredSide | None = None) -> Player:
    player = db.scalar(select(Player).where(Player.name == name, Player.category == "5taD+ / 4taC+"))
    if player:
        return player

    player = Player(
        name=name,
        phone=None,
        category="5taD+ / 4taC+",
        preferred_side=side or PreferredSide.indiferente,
    )
    db.add(player)
    db.flush()
    return player


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.name == EVENT_NAME, Event.date == EVENT_DATE))
        if not event:
            event = Event(
                name=EVENT_NAME,
                date=EVENT_DATE,
                place="Conecta IV Centenario",
                categories="5taD+ / 4taC+",
                price=13000,
                schedule="21:00 a 23:00",
                capacity=16,
                tournament_type="Americano mixto amistoso",
                description="Premios para 1, 2 y 3 lugar. 1er lugar cancha gratis horario valle.",
                is_active=True,
            )
            db.add(event)
            db.flush()

        created = 0
        for index, (one_name, two_name, payment_status, status, preferred_side) in enumerate(pairs, start=1):
            player_one = get_or_create_player(db, one_name, preferred_side)
            player_two = get_or_create_player(db, two_name) if two_name else None

            pair = db.scalar(
                select(EventPair).where(
                    EventPair.event_id == event.id,
                    EventPair.player_one_id == player_one.id,
                )
            )
            if not pair:
                pair = EventPair(
                    event_id=event.id,
                    player_one_id=player_one.id,
                    player_two_id=player_two.id if player_two else None,
                    category="5taD+ / 4taC+",
                    status=status,
                    seed=index,
                )
                db.add(pair)
                db.flush()
                created += 1
            else:
                pair.player_two_id = player_two.id if player_two else None
                pair.category = "5taD+ / 4taC+"
                pair.status = status
                pair.seed = index

            payment = db.scalar(select(Payment).where(Payment.event_id == event.id, Payment.pair_id == pair.id))
            if not payment:
                payment = Payment(event_id=event.id, pair_id=pair.id)
                db.add(payment)
            payment.amount = event.price
            payment.status = PaymentStatus(payment_status)

        db.commit()
        print(f"Evento demo listo: {event.name} ({created} parejas nuevas)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
