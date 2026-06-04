from datetime import date
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Event, EventPair, Match, Player
from app.services import recalculate_standings


class RankingConfigTest(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()

    def tearDown(self) -> None:
        self.db.close()

    def test_custom_points_and_tiebreakers_are_used(self) -> None:
        event = Event(
            name="Americano Test",
            date=date(2026, 6, 3),
            place="AMAR Padel",
            categories="5ta",
            price=12000,
            schedule="21:00 a 23:00",
            capacity=8,
            tournament_type="americano",
            category_configs=[],
            ranking_config={"win_points": 2, "draw_points": 0, "loss_points": -1, "tiebreakers": ["points_for", "points"]},
        )
        self.db.add(event)
        self.db.commit()
        pairs = [self._pair(event.id, f"Pareja {index}") for index in range(1, 4)]
        self.db.add_all(
            [
                Match(event_id=event.id, pair_one_id=pairs[0].id, pair_two_id=pairs[1].id, pair_one_score=6, pair_two_score=4, winner_pair_id=pairs[0].id),
                Match(event_id=event.id, pair_one_id=pairs[1].id, pair_two_id=pairs[2].id, pair_one_score=8, pair_two_score=7, winner_pair_id=pairs[1].id),
            ]
        )
        self.db.commit()

        standings = recalculate_standings(self.db, event.id)

        self.assertEqual(standings[0].pair_id, pairs[1].id)
        self.assertEqual(standings[0].points, 1)
        self.assertEqual(next(standing for standing in standings if standing.pair_id == pairs[0].id).points, 2)

    def _pair(self, event_id: int, name: str) -> EventPair:
        player_one = Player(name=f"{name} A", category="5ta")
        player_two = Player(name=f"{name} B", category="5ta")
        self.db.add_all([player_one, player_two])
        self.db.commit()
        pair = EventPair(event_id=event_id, player_one_id=player_one.id, player_two_id=player_two.id, category="5ta", status="completa")
        self.db.add(pair)
        self.db.commit()
        self.db.refresh(pair)
        return pair


if __name__ == "__main__":
    unittest.main()
