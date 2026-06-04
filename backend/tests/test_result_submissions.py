from datetime import date
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Event, EventPair, Match, Player, ResultSubmissionStatus, User, UserRole
from app.routers.matches import submit_player_result
from app.routers.matches import register_result
from app.schemas.matches import ResultSubmissionCreate
from app.schemas.matches import MatchResultUpdate


class ResultSubmissionTest(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
        self.event = Event(
            name="Americano Test",
            date=date(2026, 6, 3),
            place="AMAR Padel",
            categories="5ta",
            price=12000,
            schedule="21:00 a 23:00",
            capacity=8,
            tournament_type="americano",
            category_configs=[],
        )
        self.db.add(self.event)
        self.db.commit()
        self.users = [self._user(f"Jugador {index}", f"j{index}@example.com") for index in range(1, 5)]
        players = [self._player(user) for user in self.users]
        self.pair_one = EventPair(event_id=self.event.id, player_one_id=players[0].id, player_two_id=players[1].id, category="5ta", status="completa")
        self.pair_two = EventPair(event_id=self.event.id, player_one_id=players[2].id, player_two_id=players[3].id, category="5ta", status="completa")
        self.db.add_all([self.pair_one, self.pair_two])
        self.db.commit()
        self.match = Match(event_id=self.event.id, pair_one_id=self.pair_one.id, pair_two_id=self.pair_two.id, round_name="Grupo", court="1")
        self.db.add(self.match)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def test_two_matching_player_reports_confirm_official_result(self) -> None:
        submit_player_result(self.event.id, self.match.id, self._payload(10, 7), self.db, self.users[0])
        second = submit_player_result(self.event.id, self.match.id, self._payload(10, 7), self.db, self.users[2])

        self.assertEqual(second.status, ResultSubmissionStatus.confirmado)
        self.db.refresh(self.match)
        self.assertEqual((self.match.pair_one_score, self.match.pair_two_score), (10, 7))
        self.assertEqual(self.match.winner_pair_id, self.pair_one.id)

    def test_different_player_reports_create_conflict_without_official_result(self) -> None:
        first = submit_player_result(self.event.id, self.match.id, self._payload(10, 7), self.db, self.users[0])
        second = submit_player_result(self.event.id, self.match.id, self._payload(9, 8), self.db, self.users[2])

        self.assertEqual(first.status, ResultSubmissionStatus.conflicto)
        self.assertEqual(second.status, ResultSubmissionStatus.conflicto)
        self.db.refresh(self.match)
        self.assertIsNone(self.match.pair_one_score)

    def test_non_match_player_cannot_report(self) -> None:
        outsider = self._user("Fuera", "fuera@example.com")
        with self.assertRaises(HTTPException) as raised:
            submit_player_result(self.event.id, self.match.id, self._payload(10, 7), self.db, outsider)
        self.assertEqual(raised.exception.status_code, 403)

    def test_tablet_official_result_resolves_conflicts(self) -> None:
        first = submit_player_result(self.event.id, self.match.id, self._payload(10, 7), self.db, self.users[0])
        second = submit_player_result(self.event.id, self.match.id, self._payload(9, 8), self.db, self.users[2])

        register_result(self.event.id, self.match.id, MatchResultUpdate(pair_one_score=9, pair_two_score=8), self.db, self.users[0])

        self.db.refresh(first)
        self.db.refresh(second)
        self.assertEqual(first.status, ResultSubmissionStatus.descartado)
        self.assertEqual(second.status, ResultSubmissionStatus.confirmado)

    def _payload(self, one: int, two: int) -> ResultSubmissionCreate:
        return ResultSubmissionCreate(pair_one_score=one, pair_two_score=two)

    def _user(self, name: str, email: str) -> User:
        user = User(name=name, email=email, password_hash="test", role=UserRole.jugador)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def _player(self, user: User) -> Player:
        player = Player(user_id=user.id, name=user.name, email=user.email, category="5ta")
        self.db.add(player)
        self.db.commit()
        self.db.refresh(player)
        return player


if __name__ == "__main__":
    unittest.main()
