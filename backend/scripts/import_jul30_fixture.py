from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path
import sys

from openpyxl import load_workbook
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models import Event, EventPair, EventRegistration, Match, Payment, Player, PlayerPayment, Standing
from app.models.payment import PaymentStatus
from app.models.player import PairStatus, PreferredSide
from app.models.registration import RegistrationRole, RegistrationStatus
from app.registration_guard import primary_identity_key


EVENT_ID = 15
EVENT_DATE = date(2026, 7, 30)
DEFAULT_WORKBOOK = Path("/Users/onel/Downloads/jue_30_julio_9canchas.xlsx")
GROUPS = {
    "Grupo A": {"category": "4ta C+", "cells": ["B7", "B8", "B9", "B10", "B11", "B12"], "court_row": 6, "rows": [7, 9, 11, 13, 15]},
    "Grupo B": {"category": "4ta C+", "cells": ["B19", "B20", "B21", "B22", "B23", "B24"], "court_row": 18, "rows": [19, 21, 23, 25, 27]},
    "Grupo C": {"category": "5ta D+", "cells": ["B31", "B32", "B33", "B34", "B35", "B36"], "court_row": 30, "rows": [31, 33, 35, 37, 39]},
}
COURT_COLS = ["H", "J", "L"]
NAME_FIXES = {
    "pato": "Pato",
    "pauli": "Pauli",
    "m.angélica": "M. Angélica",
}


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def clean_name(value: str) -> str:
    value = clean(value)
    return NAME_FIXES.get(value.lower(), value[:1].upper() + value[1:] if value else value)


def split_pair(label: str) -> tuple[str, str]:
    parts = [clean_name(part) for part in clean(label).split("/", 1)]
    if len(parts) != 2 or not all(parts):
        raise ValueError(f"No pude separar la pareja: {label!r}")
    return parts[0], parts[1]


def pair_key(label: str, category: str) -> str:
    one, two = split_pair(label)
    return f"{category.lower()}::{one.lower()}::{two.lower()}"


def get_or_create_player(db, name: str, category: str) -> Player:
    player = db.scalar(select(Player).where(Player.name == name, Player.category == category))
    if player:
        return player
    player = Player(name=name, phone=None, category=category, preferred_side=PreferredSide.indiferente)
    db.add(player)
    db.flush()
    return player


def add_registration(db, event_id: int, pair_id: int, player: Player, role: RegistrationRole, category: str) -> None:
    db.add(EventRegistration(
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
    ))


def snapshot(db, event: Event, backup_dir: Path) -> Path:
    pairs = list(db.scalars(
        select(EventPair)
        .where(EventPair.event_id == event.id)
        .options(selectinload(EventPair.player_one), selectinload(EventPair.player_two))
    ))
    matches = list(db.scalars(select(Match).where(Match.event_id == event.id)))
    payload = {
        "created_at": datetime.now().isoformat(),
        "event": {"id": event.id, "name": event.name, "date": event.date.isoformat(), "capacity": event.capacity},
        "pairs": [{
            "id": pair.id,
            "seed": pair.seed,
            "category": pair.category,
            "player_one": pair.player_one.name,
            "player_two": pair.player_two.name if pair.player_two else None,
        } for pair in pairs],
        "matches": [{
            "id": match.id,
            "pair_one_id": match.pair_one_id,
            "pair_two_id": match.pair_two_id,
            "round_name": match.round_name,
            "court": match.court,
            "pair_one_score": match.pair_one_score,
            "pair_two_score": match.pair_two_score,
        } for match in matches],
    }
    backup_dir.mkdir(parents=True, exist_ok=True)
    path = backup_dir / f"event-{event.id}-backup-before-jul30-fixture-{datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def parse_fixture(workbook_path: Path) -> tuple[list[dict], list[dict]]:
    sheet = load_workbook(workbook_path, data_only=True)["24 parejas"]
    pairs = []
    matches = []
    for group, config in GROUPS.items():
        category = config["category"]
        for cell in config["cells"]:
            label = clean(sheet[cell].value)
            one, two = split_pair(label)
            if category == "5ta D+" and one == "Dani":
                one = "Dani 5ta"
            if category == "5ta D+" and two == "Dani":
                two = "Dani 5ta"
            pairs.append({"label": label, "one": one, "two": two, "category": category, "group": group})
        for row in config["rows"]:
            time_label = clean(sheet[f"G{row}"].value)
            time_match = time_label.removeprefix("Partido ").split("(", 1)
            round_number = clean(time_match[0])
            slot = clean(time_match[1].rstrip(")")) if len(time_match) > 1 else ""
            slot = slot.replace(" - ", "-")
            for court_col in COURT_COLS:
                one_label = clean(sheet[f"{court_col}{row}"].value)
                two_label = clean(sheet[f"{court_col}{row + 1}"].value)
                court = clean(sheet[f"{court_col}{config['court_row']}"].value).removeprefix("cancha ").strip()
                matches.append({
                    "one_key": pair_key(one_label, category),
                    "two_key": pair_key(two_label, category),
                    "round_name": f"{category} - {group} - Ronda {round_number}" + (f" - {slot}" if slot else ""),
                    "court": court,
                })
    if len(pairs) != 18 or len(matches) != 45:
        raise ValueError(f"Fixture inesperado: {len(pairs)} parejas y {len(matches)} partidos")
    return pairs, matches


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-dir", type=Path, default=Path(__file__).resolve().parents[2] / "tmp")
    args = parser.parse_args()

    pairs, matches = parse_fixture(args.workbook)
    print(f"Validado: {len(pairs)} parejas, {len(matches)} partidos")
    for group, config in GROUPS.items():
        print(f"{group}: {config['category']} · 6 parejas · 15 partidos")
    if not args.apply:
        print("Dry run: usa --apply para escribir en la base configurada.")
        return

    db = SessionLocal()
    try:
        event = db.get(Event, EVENT_ID)
        if not event or event.date != EVENT_DATE:
            raise ValueError(f"El evento {EVENT_ID} no corresponde al {EVENT_DATE.isoformat()}")
        backup = snapshot(db, event, args.backup_dir)

        db.execute(delete(Match).where(Match.event_id == event.id))
        db.execute(delete(PlayerPayment).where(PlayerPayment.event_id == event.id))
        db.execute(delete(Payment).where(Payment.event_id == event.id))
        db.execute(delete(Standing).where(Standing.event_id == event.id))
        db.execute(delete(EventRegistration).where(EventRegistration.event_id == event.id))
        db.execute(delete(EventPair).where(EventPair.event_id == event.id))
        db.flush()

        event.capacity = 18
        event.categories = "4ta C+ / 5ta D+"
        event.fixture_visible = True
        event.category_configs = [
            {"category": "4ta C+", "modality": "groups", "group_size": 6, "guaranteed_matches": 5, "qualifiers_per_group": 0, "notes": "Grupos A y B."},
            {"category": "5ta D+", "modality": "groups", "group_size": 6, "guaranteed_matches": 5, "qualifiers_per_group": 0, "notes": "Grupo C."},
        ]
        event.fixture_config = {
            **(event.fixture_config or {}),
            "mode": "groups",
            "group_size": 6,
            "guaranteed_matches": 5,
            "court_count": 9,
            "courts": "4, 5, 6, 7, 8, 9, 10, 11, 12",
            "start_time": "21:00",
            "set_minutes": 20,
        }

        pairs_by_key = {}
        for seed, item in enumerate(pairs, start=1):
            one = get_or_create_player(db, item["one"], item["category"])
            two = get_or_create_player(db, item["two"], item["category"])
            pair = EventPair(
                event_id=event.id,
                player_one_id=one.id,
                player_two_id=two.id,
                category=item["category"],
                status=PairStatus.completa,
                seed=seed,
            )
            db.add(pair)
            db.flush()
            pairs_by_key[pair_key(item["label"], item["category"])] = pair
            add_registration(db, event.id, pair.id, one, RegistrationRole.jugador, item["category"])
            add_registration(db, event.id, pair.id, two, RegistrationRole.partner, item["category"])
            db.add(Payment(event_id=event.id, pair_id=pair.id, amount=event.price, status=PaymentStatus.pendiente))
            for player in (one, two):
                db.add(PlayerPayment(
                    event_id=event.id,
                    pair_id=pair.id,
                    player_id=player.id,
                    amount=event.price,
                    status=PaymentStatus.pendiente,
                ))

        for item in matches:
            db.add(Match(
                event_id=event.id,
                pair_one_id=pairs_by_key[item["one_key"]].id,
                pair_two_id=pairs_by_key[item["two_key"]].id,
                round_name=item["round_name"],
                court=item["court"],
                pair_one_score=None,
                pair_two_score=None,
                winner_pair_id=None,
            ))

        db.commit()
        print(f"Importación aplicada al evento {event.id}. Respaldo: {backup}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
