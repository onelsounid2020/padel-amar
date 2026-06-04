from datetime import date
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Event, EventPair, EventRegistration, PairStatus, PlayerPayment, RegistrationStatus, User, UserRole
from app.routers.public import register_player
from app.schemas.public import PublicRegistrationRequest


class PublicRegistrationTest(unittest.TestCase):
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
        self.db.commit()
        self.db.refresh(self.event)

    def tearDown(self) -> None:
        self.db.close()

    def test_full_event_sends_public_registration_to_waitlist_without_payments(self) -> None:
        onel = self._user("Onel", "onel@example.com")
        vero = self._user("Vero", "vero@example.com")
        nico = self._user("Nico", "nico@example.com")
        cami = self._user("Cami", "cami@example.com")

        first = register_player(self.event.id, self._payload(onel, vero), self.db, onel)
        second = register_player(self.event.id, self._payload(nico, cami), self.db, nico)

        self.assertEqual(first.pair.status, PairStatus.completa)
        self.assertEqual(second.pair.status, PairStatus.lista_espera)

        waitlist_registrations = self.db.scalars(
            select(EventRegistration).where(EventRegistration.pair_id == second.pair.id)
        ).all()
        self.assertEqual({registration.status for registration in waitlist_registrations}, {RegistrationStatus.lista_espera})

        payments = self.db.scalars(select(PlayerPayment).where(PlayerPayment.event_id == self.event.id)).all()
        self.assertEqual(len(payments), 2)
        self.assertTrue(all(payment.pair_id == first.pair.id for payment in payments))

    def test_duplicate_email_is_rejected_for_same_event(self) -> None:
        onel = self._user("Onel", "onel@example.com")
        register_player(self.event.id, self._payload(onel), self.db, onel)

        with self.assertRaises(HTTPException) as raised:
            register_player(self.event.id, self._payload(onel), self.db, onel)

        self.assertEqual(raised.exception.status_code, 409)
        pairs = self.db.scalars(select(EventPair).where(EventPair.event_id == self.event.id)).all()
        self.assertEqual(len(pairs), 1)

    def _payload(
        self,
        user: User,
        partner: User | None = None,
    ) -> PublicRegistrationRequest:
        return PublicRegistrationRequest(
            player_user_id=user.id,
            name=user.name,
            email=user.email,
            paid=True,
            category="5ta",
            partner_user_id=partner.id if partner else None,
            partner_name=partner.name if partner else None,
            partner_email=partner.email if partner else None,
            partner_paid=bool(partner),
        )

    def _user(self, name: str, email: str) -> User:
        user = User(
            name=name,
            email=email,
            password_hash="test",
            category="5ta",
            role=UserRole.jugador,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user


if __name__ == "__main__":
    unittest.main()
