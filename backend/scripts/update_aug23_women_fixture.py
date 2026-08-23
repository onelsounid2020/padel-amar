from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from import_aug23_fixture import Api, DEFAULT_API_URL, EVENT_DATE, EVENT_ID, clean


PAIRS = [
    ("Nathy", "Judith"),
    ("Danae", "Rusol"),
    ("Consuelo", "Fernanda"),
    ("Mailef", "Yenny"),
    ("Daniela", "Andrea C"),
    ("Jackie", "Anyi"),
    ("Vani", "Jazmin"),
    ("Claudia L.", "Claudia O."),
]

ROUNDS = [
    ("15:35-15:54", [(1, 0, 1), (3, 2, 3), (5, 4, 5), (7, 6, 7)]),
    ("15:55-16:14", [(1, 0, 3), (3, 1, 5), (5, 2, 7), (7, 4, 6)]),
    ("16:15-16:34", [(1, 0, 5), (3, 3, 7), (5, 1, 6), (7, 2, 4)]),
    ("16:35-16:54", [(1, 0, 7), (3, 5, 6), (5, 3, 4), (7, 1, 2)]),
    ("16:55-17:14", [(1, 0, 6), (3, 7, 4), (5, 5, 2), (7, 3, 1)]),
    ("17:15-17:34", [(1, 0, 4), (3, 6, 2), (5, 7, 1), (7, 5, 3)]),
    ("17:35-17:54", [(1, 0, 2), (3, 4, 1), (5, 6, 3), (7, 7, 5)]),
]

OLD_PAIR_NAMES = {
    ("nathy", "judith"): ("Nathy", "Judith"),
    ("danae", "rusol"): ("Danae", "Rusol"),
    ("consuelo", "paula"): ("Consuelo", "Fernanda"),
    ("mailef", "yenny"): ("Mailef", "Yenny"),
    ("daniela", "andrea"): ("Daniela", "Andrea C"),
    ("jackie", "anye"): ("Jackie", "Anyi"),
    ("vani", "jazmin"): ("Vani", "Jazmin"),
    ("claudia", "claudia o"): ("Claudia L.", "Claudia O."),
}


def pair_label(pair: dict) -> tuple[str, str]:
    return clean(pair["player_one"]["name"]).lower(), clean(pair["player_two"]["name"]).lower()


def validate_fixture() -> None:
    appearances = {index: 0 for index in range(len(PAIRS))}
    opponents: set[tuple[int, int]] = set()
    slots: set[tuple[str, int]] = set()
    nathy_courts = set()
    for slot, matches in ROUNDS:
        round_pairs = set()
        for court, one, two in matches:
            if one in round_pairs or two in round_pairs:
                raise ValueError(f"Pareja repetida en la ronda {slot}")
            round_pairs.update((one, two))
            key = tuple(sorted((one, two)))
            if key in opponents:
                raise ValueError(f"Cruce repetido: {key}")
            opponents.add(key)
            appearances[one] += 1
            appearances[two] += 1
            if (slot, court) in slots:
                raise ValueError(f"Cancha duplicada: {slot}, {court}")
            slots.add((slot, court))
            if one == 0 or two == 0:
                nathy_courts.add(court)
        if len(round_pairs) != 8:
            raise ValueError(f"La ronda {slot} no contiene las ocho parejas")
    if set(opponents) != {(one, two) for one in range(8) for two in range(one + 1, 8)}:
        raise ValueError("El fixture no es todos-contra-todos completo")
    if set(appearances.values()) != {7}:
        raise ValueError(f"Partidos por pareja incorrectos: {appearances}")
    if nathy_courts != {1}:
        raise ValueError(f"Nathy/Judith no quedó fija en cancha 1: {nathy_courts}")


def main() -> None:
    validate_fixture()
    email = os.environ.get("AMAR_ADMIN_EMAIL")
    password = os.environ.get("AMAR_ADMIN_PASSWORD")
    if not email or not password:
        raise ValueError("Faltan AMAR_ADMIN_EMAIL y AMAR_ADMIN_PASSWORD")

    api = Api(os.environ.get("AMAR_API_URL", DEFAULT_API_URL))
    api.token = api.request("/auth/login", "POST", {"email": email, "password": password})["access_token"]
    event = api.request(f"/events/{EVENT_ID}")
    if event["date"] != EVENT_DATE:
        raise ValueError(f"El evento {EVENT_ID} no corresponde al {EVENT_DATE}")

    pairs = api.request(f"/events/{EVENT_ID}/pairs")
    matches = api.request(f"/events/{EVENT_ID}/matches")
    standings = api.request(f"/events/{EVENT_ID}/standings")
    backup_dir = Path(__file__).resolve().parents[2] / "tmp"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"event-{EVENT_ID}-backup-before-women-round-robin-{datetime.now():%Y%m%d-%H%M%S}.json"
    backup.write_text(json.dumps({
        "created_at": datetime.now().isoformat(),
        "event": event,
        "pairs": pairs,
        "matches": matches,
        "standings": standings,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    women = [pair for pair in pairs if pair["category"] == "Mujeres"]
    men = [pair for pair in pairs if pair["category"] == "Hombres"]
    if len(women) != 8 or len(men) != 6:
        raise ValueError(f"Estructura inesperada: {len(men)} hombres y {len(women)} mujeres")
    current_by_name = {pair_label(pair): pair for pair in women}
    if set(current_by_name) != set(OLD_PAIR_NAMES):
        raise ValueError(f"Las parejas actuales de mujeres no coinciden: {set(current_by_name)}")

    players = api.request("/players")
    players_by_key = {(clean(player["name"]).lower(), player["category"]): player for player in players}

    def get_or_create_player(name: str) -> dict:
        key = (name.lower(), "Mujeres")
        if key not in players_by_key:
            players_by_key[key] = api.request("/players", "POST", {
                "name": name,
                "email": None,
                "phone": None,
                "category": "Mujeres",
                "preferred_side": "indiferente",
            })
        return players_by_key[key]

    updated_by_names: dict[tuple[str, str], dict] = {}
    for old_names, new_names in OLD_PAIR_NAMES.items():
        pair = current_by_name[old_names]
        one = get_or_create_player(new_names[0])
        two = get_or_create_player(new_names[1])
        if pair["player_one_id"] != one["id"] or pair["player_two_id"] != two["id"]:
            pair = api.request(f"/events/{EVENT_ID}/pairs/{pair['id']}", "PATCH", {
                "player_one_id": one["id"],
                "player_two_id": two["id"],
            })
        updated_by_names[(new_names[0].lower(), new_names[1].lower())] = pair

    ordered_pairs = [updated_by_names[(one.lower(), two.lower())] for one, two in PAIRS]
    proposed = []
    for round_number, (slot, round_matches) in enumerate(ROUNDS, start=1):
        for court, one, two in round_matches:
            proposed.append({
                "pair_one_id": ordered_pairs[one]["id"],
                "pair_two_id": ordered_pairs[two]["id"],
                "round_name": f"Mujeres - Grupo A - Ronda {round_number} - {slot}",
                "court": str(court),
                "played_at": None,
            })

    fixture_config = {**(event.get("fixture_config") or {}), "guaranteed_matches": 7, "start_time": "15:35", "set_minutes": 20}
    category_configs = [
        {"category": "Hombres", "modality": "groups", "group_size": 6, "guaranteed_matches": 5, "qualifiers_per_group": 0, "notes": "Grupo A; Onel/Arturo fijos en cancha 2."},
        {"category": "Mujeres", "modality": "round_robin", "group_size": 8, "guaranteed_matches": 7, "qualifiers_per_group": 0, "notes": "Todos contra todos; Nathy/Judith fijas en cancha 1."},
    ]
    api.request(f"/events/{EVENT_ID}", "PATCH", {
        "schedule": "15:35 - 17:54",
        "category_configs": category_configs,
        "fixture_config": fixture_config,
    })
    created = api.request(f"/events/{EVENT_ID}/matches/bulk", "POST", {
        "matches": proposed,
        "replace_unplayed": True,
        "replace_category": "Mujeres",
    })
    api.request(f"/events/{EVENT_ID}/standings/recalculate", "POST", {})
    print(f"Fixture femenino actualizado: {len(created)} partidos. Respaldo: {backup}")


if __name__ == "__main__":
    main()
