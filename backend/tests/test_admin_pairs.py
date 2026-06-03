from datetime import date
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Event, EventRegistration, PairStatus, Payment, Player, RegistrationStatus
from app.routers.pairs import create_pair
from app.schemas.players import PairCreate


class AdminPairsTest(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.db = self.session_factory()
        self.event = Event(
            name="Americano Test",
            date=date(2026, 6, 3),
            place="AMAR Padel",
            categories="4ta / 5ta",
            price=12000,
            schedule="21:00 a 23:00",
            capacity=1,
            tournament_type="americano",
            category_configs=[],
        )
        self.db.add(self.event)
        self.players = [
            Player(name="Jugador 1", email="j1@example.com", category="5ta"),
            Player(name="Jugador 2", email="j2@example.com", category="5ta"),
            Player(name="Jugador 3", email="j3@example.com", category="5ta"),
            Player(name="Jugador 4", email="j4@example.com", category="5ta"),
        ]
        self.db.add_all(self.players)
        self.db.commit()
        self.db.refresh(self.event)
        for player in self.players:
            self.db.refresh(player)

    def tearDown(self) -> None:
        self.db.close()

    def test_admin_pair_over_capacity_becomes_waitlist_without_payment(self) -> None:
        first = create_pair(
            self.event.id,
            PairCreate(
                player_one_id=self.players[0].id,
                player_two_id=self.players[1].id,
                category="5ta",
                status=PairStatus.completa,
            ),
            self.db,
        )
        second = create_pair(
            self.event.id,
            PairCreate(
                player_one_id=self.players[2].id,
                player_two_id=self.players[3].id,
                category="5ta",
                status=PairStatus.completa,
            ),
            self.db,
        )

        self.assertEqual(first.status, PairStatus.completa)
        self.assertEqual(second.status, PairStatus.lista_espera)

        payments = self.db.scalars(select(Payment).where(Payment.event_id == self.event.id)).all()
        self.assertEqual(len(payments), 1)
        self.assertEqual(payments[0].pair_id, first.id)

        first_registrations = self.db.scalars(
            select(EventRegistration).where(EventRegistration.pair_id == first.id)
        ).all()
        second_registrations = self.db.scalars(
            select(EventRegistration).where(EventRegistration.pair_id == second.id)
        ).all()
        self.assertEqual(len(first_registrations), 2)
        self.assertEqual(len(second_registrations), 2)
        self.assertEqual({registration.status for registration in first_registrations}, {RegistrationStatus.confirmada})
        self.assertEqual({registration.status for registration in second_registrations}, {RegistrationStatus.lista_espera})
        self.assertEqual({registration.source for registration in first_registrations + second_registrations}, {"admin"})


if __name__ == "__main__":
    unittest.main()
