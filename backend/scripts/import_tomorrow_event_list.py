from datetime import date
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.database import Base, SessionLocal, engine
from app.models import Event, EventPair, Match, Payment, Player, Standing
from app.models.payment import PaymentStatus
from app.models.player import PairStatus, PreferredSide


EVENT_NAME = "Americano Mixto Amistoso (AMAR) Miercoles"
EVENT_DATE = date(2026, 5, 27)

RAW_PAIRS = [
    ("Cris z", "pauli", "4taC+", False, False),
    ("Nathy", "Jaime", "4taC+", False, False),
    ("arturo", "dani", "5taD+", True, True),
    ("Mati", "perla", "4taC+", True, False),
    ("Isa", "Ricardo", "5taD+", True, True),
    ("Caro", "Alfonso", "4taC+", False, False),
    ("Lizza", "Pato", "4taC+", False, False),
    ("Pía", "Edu C.", "5taD+", False, False),
    ("Ale M", "Rodrigo", "4taC+", False, False),
    ("Fran", "Checho", "4taC+", False, False),
    ("Eduardo b", "Jackie", "4taC+", False, False),
    ("Dani", "Pedro", "4taC+", False, False),
    ("Carla", "Pato", "4taC+", False, False),
    ("José", "Monse", "4taC+", True, True),
    ("Vero", "onel", "4taC+", False, True),
    ("Lya", "Tano", "4taC+", True, True),
    ("M.Angélica", "alejandro", "4taC+", False, False),
    ("Maca", "Pablo", "4taC+", False, True),
    ("Fabian", "maca", "4taC+", False, False),
    ("Javiera", "khaeen", "5taD+", False, False),
    ("Clau", "Pipe", "5taD+", False, False),
    ("patricio", "gaby", "5taD+", False, False),
]


def clean_name(name: str) -> str:
    replacements = {
        "arturo": "Arturo",
        "dani": "Dani",
        "pauli": "Pauli",
        "perla": "Perla",
        "onel": "Onel",
        "alejandro": "Alejandro",
        "maca": "Maca",
        "khaeen": "Khaeen",
        "patricio": "Patricio",
        "gaby": "Gaby",
        "Eduardo b": "Eduardo B",
        "M.Angélica": "M. Angélica",
    }
    value = " ".join(name.strip().split())
    return replacements.get(value, value[:1].upper() + value[1:])


def payment_status(player_one_paid: bool, player_two_paid: bool) -> PaymentStatus:
    if player_one_paid and player_two_paid:
        return PaymentStatus.pagado
    if player_one_paid or player_two_paid:
        return PaymentStatus.abonado
    return PaymentStatus.pendiente


def get_or_create_player(db, name: str, category: str) -> Player:
    player = db.scalar(select(Player).where(Player.name == name, Player.category == category))
    if player:
        return player

    player = Player(
        name=name,
        phone=None,
        category=category,
        preferred_side=PreferredSide.indiferente,
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
                categories="4taC+ / 5taD+",
                price=13000,
                schedule="17:00 a 18:50",
                capacity=44,
                tournament_type="Series por grupos",
                description="Listado real del evento: 4 = 4taC+, 5 = 5taD+.",
                is_active=True,
            )
            db.add(event)
            db.flush()
        else:
            event.categories = "4taC+ / 5taD+"
            event.schedule = "17:00 a 18:50"
            event.capacity = 44
            event.tournament_type = "Series por grupos"
            event.description = "Listado real del evento: 4 = 4taC+, 5 = 5taD+."

        db.execute(delete(Match).where(Match.event_id == event.id))
        db.execute(delete(Payment).where(Payment.event_id == event.id))
        db.execute(delete(Standing).where(Standing.event_id == event.id))
        db.execute(delete(EventPair).where(EventPair.event_id == event.id))
        db.flush()

        for seed, (one_raw, two_raw, category, one_paid, two_paid) in enumerate(RAW_PAIRS, start=1):
            player_one = get_or_create_player(db, clean_name(one_raw), category)
            player_two = get_or_create_player(db, clean_name(two_raw), category)
            pair = EventPair(
                event_id=event.id,
                player_one_id=player_one.id,
                player_two_id=player_two.id,
                category=category,
                status=PairStatus.completa,
                seed=seed,
            )
            db.add(pair)
            db.flush()
            db.add(
                Payment(
                    event_id=event.id,
                    pair_id=pair.id,
                    amount=event.price,
                    status=payment_status(one_paid, two_paid),
                )
            )

        db.flush()
        db.execute(
            delete(Player).where(
                Player.id.not_in(
                    select(EventPair.player_one_id).union(
                        select(EventPair.player_two_id).where(EventPair.player_two_id.is_not(None))
                    )
                )
            )
        )
        db.commit()

        print(f"Evento listo: {event.name}")
        print(f"Parejas cargadas: {len(RAW_PAIRS)}")
        for category in ["4taC+", "5taD+"]:
            print(f"{category}: {sum(1 for item in RAW_PAIRS if item[2] == category)} parejas")
    finally:
        db.close()


if __name__ == "__main__":
    main()
