from datetime import date
from pathlib import Path
import sys

from openpyxl import load_workbook
from sqlalchemy import delete, select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database import Base, SessionLocal, engine
from app.models import Event, EventPair, Match, Payment, Player, Standing
from app.models.payment import PlayerPayment
from app.models.player import PairStatus, PreferredSide


WORKBOOK_PATH = Path("/Users/onel/Downloads/wed_27May_11canchas.xlsx")
EVENT_NAME = "Americano AMAR Miercoles 27 Mayo"
EVENT_DATE = date(2026, 5, 27)

CATEGORY_CONFIGS = [
    {
        "category": "5ta",
        "modality": "five_consecutive",
        "group_size": 6,
        "guaranteed_matches": 5,
        "qualifiers_per_group": 0,
        "notes": "5 partidos seguidos por grupo.",
    },
    {
        "category": "4ta",
        "modality": "group_ranking_best",
        "group_size": 4,
        "guaranteed_matches": 3,
        "qualifiers_per_group": 1,
        "notes": "3 partidos de ranking. Pasa el mejor de cada grupo.",
    },
]

GROUPS = {
    "4ta": {
        "Grupo A": ["B9", "B10", "B11", "B12"],
        "Grupo B": ["B16", "B17", "B18", "B19"],
        "Grupo C": ["B23", "B24", "B25", "B26"],
        "Grupo D": ["B31", "B32", "B33", "B34"],
    },
    "5ta": {
        "Grupo A": ["B7", "B8", "B9", "B10", "B11", "B12"],
        "Grupo B": ["B19", "B20", "B21", "B22", "B23", "B24"],
    },
}

SCHEDULES = [
    {"sheet": "4ta", "category": "4ta", "group": "Grupo A", "time_col": "H", "court_row": 8, "court_cols": ["J", "M"], "score_cols": ["K", "N"], "rows": [9, 11, 13]},
    {"sheet": "4ta", "category": "4ta", "group": "Grupo B", "time_col": "H", "court_row": 15, "court_cols": ["J", "M"], "score_cols": ["K", "N"], "rows": [16, 18, 20]},
    {"sheet": "4ta", "category": "4ta", "group": "Grupo C", "time_col": "H", "court_row": 22, "court_cols": ["J", "M"], "score_cols": ["K", "N"], "rows": [23, 25, 27]},
    {"sheet": "4ta", "category": "4ta", "group": "Grupo D", "time_col": "H", "court_row": 30, "court_cols": ["J", "M"], "score_cols": ["K", "N"], "rows": [31, 33, 35]},
    {"sheet": "5ta", "category": "5ta", "group": "Grupo A", "time_col": "G", "court_row": 6, "court_cols": ["I", "K", "M"], "score_cols": ["J", "L", "N"], "rows": [7, 9, 11, 13, 15]},
    {"sheet": "5ta", "category": "5ta", "group": "Grupo B", "time_col": "G", "court_row": 18, "court_cols": ["I", "K", "M"], "score_cols": ["J", "L", "N"], "rows": [19, 21, 23, 25, 27]},
]

NAME_FIXES = {
    "Criz": "Cris",
    "Jviera": "Javiera",
    "pedro": "Pedro",
    "pato": "Pato",
    "Ma Ange": "M. Angélica",
    "Mangelica": "M. Angélica",
}


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def clean_name(value: str) -> str:
    value = clean(value)
    return NAME_FIXES.get(value, value[:1].upper() + value[1:] if value else value)


def clean_court(value: object, fallback: str) -> str:
    court = clean(value) or fallback
    if court.lower().startswith("cancha"):
        _, _, number = court.partition(" ")
        return f"cancha {number.strip()}" if number.strip() else "cancha"
    return court


def split_pair(label: str) -> tuple[str, str]:
    label = clean(label)
    if not label or label == "0":
        raise ValueError("Pareja vacia")
    if "/" in label:
        first, second = [clean_name(part) for part in label.split("/", 1)]
        return first, second
    parts = label.split()
    if len(parts) == 2:
        return clean_name(parts[0]), clean_name(parts[1])
    raise ValueError(f"No pude separar la pareja: {label}")


def pair_key(label: str, category: str) -> str:
    return f"{category.lower()}::{' / '.join(split_pair(label)).lower()}"


def get_or_create_player(db, name: str, category: str) -> Player:
    player = db.scalar(select(Player).where(Player.name == name, Player.category == category))
    if player:
        return player
    player = Player(name=name, phone=None, category=category, preferred_side=PreferredSide.indiferente)
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
                place="AMAR Padel",
                categories="4ta / 5ta",
                price=13000,
                schedule="21:00 a 23:00",
                capacity=56,
                tournament_type="Modalidades por categoria",
                category_configs=CATEGORY_CONFIGS,
                description="Importado desde wed_27May_11canchas.xlsx.",
                is_active=True,
            )
            db.add(event)
            db.flush()
        else:
            event.categories = "4ta / 5ta"
            event.schedule = "21:00 a 23:00"
            event.capacity = 56
            event.tournament_type = "Modalidades por categoria"
            event.category_configs = CATEGORY_CONFIGS
            event.description = "Importado desde wed_27May_11canchas.xlsx."

        db.execute(delete(Match).where(Match.event_id == event.id))
        db.execute(delete(PlayerPayment).where(PlayerPayment.event_id == event.id))
        db.execute(delete(Payment).where(Payment.event_id == event.id))
        db.execute(delete(Standing).where(Standing.event_id == event.id))
        db.execute(delete(EventPair).where(EventPair.event_id == event.id))
        db.flush()

        pairs_by_label: dict[str, EventPair] = {}
        seed = 1
        for sheet_name, groups in GROUPS.items():
            sheet = workbook[sheet_name]
            for cells in groups.values():
                for cell_ref in cells:
                    label = clean(sheet[cell_ref].value)
                    if not label or label == "0":
                        continue
                    first_name, second_name = split_pair(label)
                    player_one = get_or_create_player(db, first_name, sheet_name)
                    player_two = get_or_create_player(db, second_name, sheet_name)
                    pair = EventPair(
                        event_id=event.id,
                        player_one_id=player_one.id,
                        player_two_id=player_two.id,
                        category=sheet_name,
                        status=PairStatus.completa,
                        seed=seed,
                    )
                    db.add(pair)
                    db.flush()
                    pairs_by_label[pair_key(label, sheet_name)] = pair
                    seed += 1

        imported_matches = 0
        for schedule in SCHEDULES:
            sheet = workbook[schedule["sheet"]]
            for row in schedule["rows"]:
                slot_time = clean(sheet[f"{schedule['time_col']}{row}"].value)
                for court_col, score_col in zip(schedule["court_cols"], schedule["score_cols"]):
                    pair_one_label = clean(sheet[f"{court_col}{row}"].value)
                    pair_two_label = clean(sheet[f"{court_col}{row + 1}"].value)
                    if not pair_one_label or not pair_two_label or pair_one_label == "0" or pair_two_label == "0":
                        continue
                    pair_one = pairs_by_label.get(pair_key(pair_one_label, schedule["category"]))
                    pair_two = pairs_by_label.get(pair_key(pair_two_label, schedule["category"]))
                    if not pair_one or not pair_two:
                        continue
                    match = Match(
                        event_id=event.id,
                        pair_one_id=pair_one.id,
                        pair_two_id=pair_two.id,
                        round_name=f"{schedule['category']} - {schedule['group']} - Ranking - {slot_time}",
                        court=clean_court(sheet[f"{court_col}{schedule['court_row']}"].value, court_col),
                        pair_one_score=0,
                        pair_two_score=0,
                        winner_pair_id=None,
                    )
                    db.add(match)
                    imported_matches += 1

        db.commit()
        print(f"Evento listo: {event.name}")
        print(f"Parejas importadas: {len(pairs_by_label)}")
        print(f"Partidos importados: {imported_matches}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
