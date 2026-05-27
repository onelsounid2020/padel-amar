from datetime import date
from pathlib import Path
import sys

from openpyxl import load_workbook

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.database import Base, SessionLocal, engine
from app.models import Event, EventPair, Match, Payment, Player, Standing
from app.models.player import PairStatus, PreferredSide


WORKBOOK_PATH = Path(r"c:\Users\Onel\Downloads\padel_series_19_abril_12canchas(8-4).xlsx")
EVENT_NAME = "Americano Mixto Amistoso (AMAR) Miercoles"
EVENT_DATE = date(2026, 5, 27)

CATEGORY_BY_SHEET = {
    "4ta": "4taC+",
    "5ta": "5taC+",
}

GROUP_RANGES = {
    "4ta": {
        "A": ["B9", "B10", "B11", "B12"],
        "B": ["B16", "B17", "B18", "B19"],
        "C": ["B23", "B24", "B25", "B26"],
        "D": ["B31", "B32", "B33", "B34"],
    },
    "5ta": {
        "A": ["B9", "B10", "B11", "B12"],
        "B": ["B16", "B17", "B18", "B19"],
        "C": ["AA39", "AA40", "AA41", "AA42"],
        "D": ["B40", "B41", "B42", "B43"],
    },
}


def clean_name(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def split_pair_name(pair_name: str) -> tuple[str, str]:
    parts = [clean_name(part) for part in pair_name.split("/") if clean_name(part)]
    if len(parts) < 2:
        raise ValueError(f"Pareja incompleta en plantilla: {pair_name}")
    return parts[0], " / ".join(parts[1:])


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
    workbook = load_workbook(WORKBOOK_PATH, data_only=True)

    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.name == EVENT_NAME, Event.date == EVENT_DATE))
        if not event:
            event = Event(
                name=EVENT_NAME,
                date=EVENT_DATE,
                place="Conecta IV Centenario",
                categories="4taC+ / 5taC+",
                price=13000,
                schedule="17:00 a 19:12",
                capacity=64,
                tournament_type="Series por grupos de 4",
                description="Formato importado desde plantilla Excel: grupos de 4, 2 canchas por grupo y fase final.",
                is_active=True,
            )
            db.add(event)
            db.flush()
        else:
            event.categories = "4taC+ / 5taC+"
            event.schedule = "17:00 a 19:12"
            event.capacity = 64
            event.tournament_type = "Series por grupos de 4"
            event.description = "Formato importado desde plantilla Excel: grupos de 4, 2 canchas por grupo y fase final."

        db.execute(delete(Match).where(Match.event_id == event.id))
        db.execute(delete(Payment).where(Payment.event_id == event.id))
        db.execute(delete(Standing).where(Standing.event_id == event.id))
        db.execute(delete(EventPair).where(EventPair.event_id == event.id))
        db.flush()

        seed = 1
        imported = []
        for sheet_name, groups in GROUP_RANGES.items():
            sheet = workbook[sheet_name]
            category = CATEGORY_BY_SHEET[sheet_name]
            for group_name, cells in groups.items():
                for cell_ref in cells:
                    pair_label = clean_name(sheet[cell_ref].value)
                    if not pair_label:
                        continue
                    one_name, two_name = split_pair_name(pair_label)
                    player_one = get_or_create_player(db, one_name, category)
                    player_two = get_or_create_player(db, two_name, category)
                    pair = EventPair(
                        event_id=event.id,
                        player_one_id=player_one.id,
                        player_two_id=player_two.id,
                        category=category,
                        status=PairStatus.completa,
                        seed=seed,
                    )
                    db.add(pair)
                    imported.append((category, group_name, pair_label))
                    seed += 1

        db.commit()
        print(f"Evento listo: {event.name}")
        print(f"Parejas importadas: {len(imported)}")
        for category in CATEGORY_BY_SHEET.values():
            print(f"{category}: {sum(1 for item in imported if item[0] == category)} parejas")
    finally:
        db.close()


if __name__ == "__main__":
    main()
