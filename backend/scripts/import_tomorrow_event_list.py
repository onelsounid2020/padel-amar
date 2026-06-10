from datetime import date
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.database import Base, SessionLocal, engine
from app.models import Event, EventPair, EventRegistration, Match, Payment, Player, PlayerPayment, Standing
from app.models.payment import PaymentStatus
from app.models.player import PairStatus, PreferredSide
from app.models.registration import RegistrationRole, RegistrationStatus
from app.registration_guard import primary_identity_key


EVENT_NAME = "Americano AMAR Sabado 06 Junio"
EVENT_DATE = date(2026, 6, 6)
DUPLICATE_EVENT_NAMES = ["Americano Mixto AMAR Sabado"]

RAW_PAIRS = [
    ("Cata", "Edson", "5taD+"),
    ("Danae", "Onel", "5taD+"),
    ("Vero", "Orlando", "4taC+"),
    ("Pauli", "Hector", "4taC+"),
    ("Trini", "Pablo", "4taC+"),
    ("Patricio", "Jandi", "5taD+"),
    ("Cami O", "Tuto", "4taC+"),
    ("Fco", "Vladi", "5taD+"),
    ("Natalia", "Jorge", "4taC+"),
    ("Coni", "Edu", "4taC+"),
    ("Lya", "Tano", "4taC+"),
    ("Ale M", "Freddy", "5taD+"),
    ("Dani U", "Jaime", "4taC+"),
    ("Nicol", "Warren", "5taD+"),
]


def clean_name(name: str) -> str:
    value = " ".join(name.strip().split())
    replacements = {
        "cata": "Cata",
        "edson": "Edson",
        "onel": "Onel",
        "pauli": "Pauli",
        "patricio": "Patricio",
    }
    return replacements.get(value.lower(), value[:1].upper() + value[1:] if value else value)


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


def add_registration(db, event_id: int, pair_id: int, player: Player, role: RegistrationRole, category: str) -> None:
    db.add(
        EventRegistration(
            event_id=event_id,
            pair_id=pair_id,
            player_id=player.id,
            user_id=player.user_id,
            identity_key=primary_identity_key(player),
            role=role,
            category=category,
            status=RegistrationStatus.confirmada,
            payment_status=PaymentStatus.pendiente,
            source="admin",
        )
    )


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.name == EVENT_NAME, Event.date == EVENT_DATE))
        if not event:
            event = Event(
                name=EVENT_NAME,
                date=EVENT_DATE,
                place="Conecta 4to Centenario",
                categories="5taD+ / 4taC+",
                price=13000,
                schedule="10:30 a 12:30",
                capacity=14,
                tournament_type="Modalidades por categoria",
                description="Listado cargado desde administracion: 4 = 4taC+, 5 = 5taD+.",
                is_active=True,
            )
            db.add(event)
            db.flush()
        else:
            event.is_active = True

        duplicates = db.scalars(
            select(Event).where(Event.date == EVENT_DATE, Event.name.in_(DUPLICATE_EVENT_NAMES))
        ).all()
        for duplicate in duplicates:
            db.delete(duplicate)
        db.flush()

        db.execute(delete(Match).where(Match.event_id == event.id))
        db.execute(delete(PlayerPayment).where(PlayerPayment.event_id == event.id))
        db.execute(delete(Payment).where(Payment.event_id == event.id))
        db.execute(delete(Standing).where(Standing.event_id == event.id))
        db.execute(delete(EventRegistration).where(EventRegistration.event_id == event.id))
        db.execute(delete(EventPair).where(EventPair.event_id == event.id))
        db.flush()

        for seed, (one_raw, two_raw, category) in enumerate(RAW_PAIRS, start=1):
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

            add_registration(db, event.id, pair.id, player_one, RegistrationRole.jugador, category)
            add_registration(db, event.id, pair.id, player_two, RegistrationRole.partner, category)
            db.add(
                Payment(
                    event_id=event.id,
                    pair_id=pair.id,
                    amount=event.price,
                    status=PaymentStatus.pendiente,
                )
            )
            for player in (player_one, player_two):
                db.add(
                    PlayerPayment(
                        event_id=event.id,
                        pair_id=pair.id,
                        player_id=player.id,
                        amount=event.price,
                        status=PaymentStatus.pendiente,
                    )
                )

        db.commit()

        print(f"Evento listo: {event.name} ({event.date.isoformat()})")
        print(f"Parejas cargadas: {len(RAW_PAIRS)}")
        for category in ["4taC+", "5taD+"]:
            print(f"{category}: {sum(1 for item in RAW_PAIRS if item[2] == category)} parejas")
    finally:
        db.close()


if __name__ == "__main__":
    main()
